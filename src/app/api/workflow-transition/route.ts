import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLegalTransition, getStage } from '@/lib/workflow'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Generic Workflow Transition API
 *
 * POST /api/workflow-transition
 * body: {
 *   module: 'outbound' | 'order_processing' | 'after_sales' | 'rtv' | 'shrinkage' | 'inbound' | 'driver_banking',
 *   id: <record id>,
 *   toStatus: <next status>,
 *   performedBy?: <user id/name>,
 *   reason?: <optional reason for exception transitions>
 * }
 *
 * Validates the transition against the workflow state machine, updates the record,
 * logs to the audit trail. Returns the updated record.
 */

const MODULE_TO_TABLE: Record<string, string> = {
  outbound: 'outboundRecord',
  order_processing: 'orderProcessing',
  after_sales: 'afterSalesRecord',
  rtv: 'rTVRecord',
  shrinkage: 'shrinkageRecord',
  inbound: 'inboundRecord',
  driver_banking: 'driverBanking',
}

const STATUS_FIELD: Record<string, string> = {
  outbound: 'status',
  order_processing: 'status',
  after_sales: 'returnStatus',
  rtv: 'status',
  shrinkage: 'status',
  inbound: 'status',
  driver_banking: 'status',
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { module, id, toStatus, performedBy, reason } = body

    if (!module || !id || !toStatus) {
      return NextResponse.json({ error: 'module, id, and toStatus are required' }, { status: 400 })
    }

    const tableName = MODULE_TO_TABLE[module]
    if (!tableName) {
      return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 })
    }

    const statusField = STATUS_FIELD[module]

    // Fetch the current record
    // @ts-expect-error — dynamic table access
    const record = await db[tableName].findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const currentStatus = record[statusField]

    // Validate the transition
    if (!isLegalTransition(module, currentStatus, toStatus)) {
      return NextResponse.json(
        { error: `Illegal transition: ${currentStatus} → ${toStatus} for module ${module}` },
        { status: 409 },
      )
    }

    // Build the update data
    const updateData: Record<string, unknown> = { [statusField]: toStatus }

    // Stamp timestamps based on the target status
    if (module === 'outbound') {
      if (toStatus === 'dispatched') updateData.dispatchedAt = new Date()
      if (toStatus === 'delivered') updateData.deliveredAt = new Date()
      if (toStatus === 'cancelled') {
        updateData.cancelledAt = new Date()
        updateData.cancelledBy = performedBy || _user.name
        if (reason) updateData.cancellationReason = reason
      }
    }
    if (module === 'after_sales') {
      if (toStatus === 'approved') {
        updateData.approvedBy = performedBy || _user.name
        updateData.approvedAt = new Date()
      }
    }
    if (module === 'rtv') {
      if (toStatus === 'approved') {
        updateData.approvedBy = performedBy || _user.name
        updateData.approvedAt = new Date()
      }
      if (toStatus === 'processed') {
        updateData.processedBy = performedBy || _user.name
      }
    }
    if (module === 'shrinkage') {
      if (toStatus === 'resolved') {
        updateData.resolvedBy = performedBy || _user.name
        updateData.resolvedAt = new Date()
        // If debitMerchant is true and totalValue exists, increment merchant's shrinkage total
        if (record.debitMerchant && record.merchantId && record.totalValue) {
          try {
            await db.merchant.update({
              where: { merchantId: record.merchantId },
              data: { totalShrinkageValue: { increment: record.totalValue } },
            })
          } catch (merchantErr) {
            console.error('Merchant shrinkage debit failed (non-blocking):', merchantErr)
          }
        }
      }
    }
    if (module === 'driver_banking') {
      if (toStatus === 'verified') {
        updateData.verifiedBy = performedBy || _user.name
        updateData.verifiedAt = new Date()
      }
    }

    // Apply the update
    // @ts-expect-error — dynamic table access
    const updated = await db[tableName].update({
      where: { id },
      data: updateData,
    })

    // Audit
    const stage = getStage(module, toStatus)
    await logAudit({
      action: stage?.isException ? 'EXCEPTION_TRANSITION' : 'STATUS_CHANGE',
      module,
      entityId: record.orderNumber || record.outboundId || record.afterSalesId || record.rtvId || record.shrinkageId || record.inboundId || record.bankingId || record.id,
      details: `${currentStatus} → ${toStatus}${reason ? ` (reason: ${reason})` : ''}`,
    })

    // Side-effect: cascade status to linked records

    // Outbound → Merchant cumulative sales value (when delivered)
    if (module === 'outbound' && toStatus === 'delivered' && record.vendorId) {
      try {
        const saleAmount = (record as Record<string, unknown>).saleAmount as number || 0
        if (saleAmount > 0) {
          await db.merchant.update({
            where: { merchantId: record.vendorId as string },
            data: { totalSalesValue: { increment: saleAmount } },
          })
        }
      } catch (merchantErr) {
        console.error('Merchant sales value update failed (non-blocking):', merchantErr)
      }
    }

    // Outbound → Order Processing status sync (reverse cascade)
    // scan-advance already does this, but manual workflow transitions don't
    if (module === 'outbound' && record.orderNumber) {
      try {
        const orderStatusMap: Record<string, string> = {
          pending: 'new_order', picking: 'processing', picked: 'processing',
          packing: 'processing', packed: 'processing',
          dispatched: 'shipped', delivered: 'delivered',
          failed: 'returned', returned: 'returned', cancelled: 'cancelled',
        }
        const mappedStatus = orderStatusMap[toStatus]
        if (mappedStatus) {
          await db.orderProcessing.updateMany({
            where: { orderNumber: record.orderNumber },
            data: { status: mappedStatus },
          })
        }
      } catch (orderErr) {
        console.error('Order status sync failed (non-blocking):', orderErr)
      }
    }

    // Order Processing ↔ OutboundRecord (existing forward cascade)
    if (module === 'order_processing' && record.orderNumber) {
      try {
        await db.outboundRecord.updateMany({
          where: { orderNumber: record.orderNumber },
          data: { status: toStatus },
        })
      } catch (cascadeErr) {
        console.error('Outbound cascade failed (non-blocking):', cascadeErr)
      }
    }

    return NextResponse.json({ success: true, record: updated })
  } catch (error) {
    console.error('Error in workflow transition:', error)
    return NextResponse.json({ error: 'Failed to transition status' }, { status: 500 })
  }
}

/**
 * Bulk transition — applies the same status to multiple records.
 * body: { module, ids: string[], toStatus, performedBy?, reason? }
 */
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { module, ids, toStatus, performedBy, reason } = body

    if (!module || !Array.isArray(ids) || ids.length === 0 || !toStatus) {
      return NextResponse.json({ error: 'module, ids[], and toStatus are required' }, { status: 400 })
    }

    const tableName = MODULE_TO_TABLE[module]
    if (!tableName) {
      return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 })
    }
    const statusField = STATUS_FIELD[module]

    // Fetch all current records to validate transitions
    // @ts-expect-error — dynamic table access
    const records = await db[tableName].findMany({ where: { id: { in: ids } } })
    const illegal: string[] = []
    for (const r of records) {
      if (!isLegalTransition(module, r[statusField], toStatus)) {
        illegal.push(r.id)
      }
    }
    if (illegal.length > 0) {
      return NextResponse.json(
        { error: `${illegal.length} of ${ids.length} records cannot transition to ${toStatus} from their current status` },
        { status: 409 },
      )
    }

    // Apply the bulk update
    const updateData: Record<string, unknown> = { [statusField]: toStatus }
    if (module === 'outbound' && toStatus === 'dispatched') updateData.dispatchedAt = new Date()
    if (module === 'outbound' && toStatus === 'delivered') updateData.deliveredAt = new Date()

    // @ts-expect-error — dynamic table access
    const result = await db[tableName].updateMany({
      where: { id: { in: ids } },
      data: updateData,
    })

    // Audit
    await logAudit({
      action: 'BULK_STATUS_CHANGE',
      module,
      entityId: `${ids.length} records`,
      details: `Bulk transition ${ids.length} records → ${toStatus}${reason ? ` (reason: ${reason})` : ''}`,
    })

    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    console.error('Error in bulk workflow transition:', error)
    return NextResponse.json({ error: 'Failed to bulk transition' }, { status: 500 })
  }
}
