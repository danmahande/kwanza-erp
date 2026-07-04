import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAllowedTransitions, getNextMainStep, getStage } from '@/lib/workflow'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Scan Advance API
 *
 * POST /api/scan-advance
 * body: { scanValue: string, performedBy?: string }
 *
 * Scans a barcode / order number / tracking number / item ID, looks up the
 * matching parcel, determines its current station, and advances it to the
 * next station in the workflow. Returns the result so the UI can toast + refresh.
 *
 * Lookup order:
 *   1. OutboundRecord by orderNumber, outboundId, or trackingNumber
 *   2. InboundRecord by inboundId
 *   3. AfterSalesRecord by afterSalesId or returnOrderNumber
 *   4. InventoryItem by itemId
 *
 * If found, advances via the workflow state machine (only legal transitions).
 * If the parcel is already at a terminal state, returns that state.
 * If no match, returns 404.
 */

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { scanValue, performedBy } = body
    if (!scanValue || typeof scanValue !== 'string') {
      return NextResponse.json({ error: 'scanValue required' }, { status: 400 })
    }
    const v = scanValue.trim()

    // ── 1. Outbound record lookup ──
    const outbound = await db.outboundRecord.findFirst({
      where: {
        OR: [
          { orderNumber: v },
          { outboundId: v },
          { trackingNumber: v },
        ],
      },
    })
    if (outbound) {
      return await advanceOutbound(outbound, performedBy || _user.name)
    }

    // ── 2. Inbound record lookup ──
    const inbound = await db.inboundRecord.findUnique({ where: { inboundId: v } })
    if (inbound) {
      return await advanceInbound(inbound, performedBy || _user.name)
    }

    // ── 3. After-Sales (RMA) lookup ──
    const rma = await db.afterSalesRecord.findFirst({
      where: {
        OR: [
          { afterSalesId: v },
          { returnOrderNumber: v },
        ],
      },
    })
    if (rma) {
      return await advanceRma(rma, performedBy || _user.name)
    }

    // ── 4. InventoryItem lookup (by itemId) ──
    const item = await db.inventoryItem.findUnique({ where: { itemId: v } })
    if (item) {
      // Items don't have their own workflow — return their current state
      return NextResponse.json({
        success: false,
        message: `Item ${v} found but items don't have a workflow to advance. Current status: ${item.status}.`,
        module: 'inventory_item',
        currentStatus: item.status,
        itemId: item.itemId,
      })
    }

    return NextResponse.json({
      error: `No record found for scan value: ${v}`,
    }, { status: 404 })
  } catch (error) {
    console.error('Error in scan-advance:', error)
    return NextResponse.json({ error: 'Failed to process scan' }, { status: 500 })
  }
}

async function advanceOutbound(record: Record<string, unknown>, performedBy: string) {
  const _performer = performedBy
  const currentStatus = String(record.status || 'pending')
  const module = 'outbound'
  const next = getNextMainStep(module, currentStatus)

  if (!next) {
    const stage = getStage(module, currentStatus)
    // P9: Better error messages for terminal/exception states
    const terminalMessages: Record<string, string> = {
      cancelled: 'This order has been cancelled and cannot be advanced.',
      delivered: 'This order has already been delivered — no further action needed.',
      returned: 'This order has been returned. Process it in the Returns tab.',
      failed: 'This order has failed delivery. Reschedule or cancel it.',
      disposed: 'This item has been disposed and cannot be advanced.',
      self_delivery: 'This is a self-delivery order — the merchant fulfils it directly. No warehouse action needed.',
    }
    return NextResponse.json({
      success: false,
      message: terminalMessages[currentStatus] || `Parcel ${String(record.orderNumber || record.outboundId)} is at terminal state: ${stage?.label || currentStatus}.`,
      module, currentStatus, recordId: record.id,
    })
  }

  // Apply the transition
  const updateData: Record<string, unknown> = { status: next.status }
  if (next.status === 'dispatched') updateData.dispatchedAt = new Date()
  if (next.status === 'delivered') updateData.deliveredAt = new Date()

  await db.outboundRecord.update({
    where: { id: String(record.id) },
    data: updateData,
  })

  // Update merchant cumulative sales value when delivered
  if (next.status === 'delivered' && record.vendorId) {
    try {
      const saleAmount = Number(record.saleAmount) || 0
      if (saleAmount > 0) {
        await db.merchant.update({
          where: { merchantId: String(record.vendorId) },
          data: { totalSalesValue: { increment: saleAmount } },
        })
      }
    } catch (e) { console.error('Merchant sales update failed (non-blocking):', e) }
  }

  // Cascade to linked OrderProcessing if exists
  if (record.orderNumber) {
    try {
      await db.orderProcessing.updateMany({
        where: { orderNumber: String(record.orderNumber) },
        data: { status: mapOutboundToOrderStatus(next.status) },
      })
    } catch (e) { console.error('Order cascade failed (non-blocking):', e) }
  }

  await logAudit({
    action: 'SCAN_ADVANCE',
    module,
    entityId: String(record.orderNumber || record.outboundId),
    details: `${currentStatus} → ${next.status} (scanned by ${_performer})`,
  })

  return NextResponse.json({
    success: true,
    message: `${String(record.orderNumber || record.outboundId)}: ${currentStatus} → ${next.label}`,
    module, fromStatus: currentStatus, toStatus: next.status,
    recordId: record.id,
    nextAction: next.action,
  })
}

function mapOutboundToOrderStatus(outboundStatus: string): string {
  const map: Record<string, string> = {
    pending: 'new_order',
    picking: 'processing', picked: 'processing', packing: 'processing', packed: 'processing',
    dispatched: 'shipped', delivered: 'delivered',
    returned: 'returned', failed: 'returned', cancelled: 'cancelled',
  }
  return map[outboundStatus] || 'processing'
}

async function advanceInbound(record: Record<string, unknown>, performedBy?: string) {
  const _performer = performedBy || 'system'
  const currentStatus = String(record.status || 'received')
  const module = 'inbound'
  const next = getNextMainStep(module, currentStatus)

  if (!next) {
    const stage = getStage(module, currentStatus)
    return NextResponse.json({
      success: false,
      message: `Inbound ${String(record.inboundId)} is at terminal state: ${stage?.label || currentStatus}.`,
      module, currentStatus, recordId: record.id,
    })
  }

  await db.inboundRecord.update({
    where: { id: String(record.id) },
    data: { status: next.status },
  })

  await logAudit({
    action: 'SCAN_ADVANCE',
    module,
    entityId: String(record.inboundId),
    details: `${currentStatus} → ${next.status} (scanned by ${_performer})`,
  })

  return NextResponse.json({
    success: true,
    message: `${String(record.inboundId)}: ${currentStatus} → ${next.label}`,
    module, fromStatus: currentStatus, toStatus: next.status,
    recordId: record.id,
    nextAction: next.action,
  })
}

async function advanceRma(record: Record<string, unknown>, performedBy?: string) {
  const _performer = performedBy || 'system'
  const currentStatus = String(record.returnStatus || 'initiated')
  const module = 'after_sales'
  const next = getNextMainStep(module, currentStatus)

  if (!next) {
    const stage = getStage(module, currentStatus)
    return NextResponse.json({
      success: false,
      message: `RMA ${String(record.afterSalesId)} is at terminal state: ${stage?.label || currentStatus}.`,
      module, currentStatus, recordId: record.id,
    })
  }

  const updateData: Record<string, unknown> = { returnStatus: next.status }
  if (next.status === 'approved') {
    updateData.approvedBy = _performer
    updateData.approvedAt = new Date()
  }

  await db.afterSalesRecord.update({
    where: { id: String(record.id) },
    data: updateData,
  })

  await logAudit({
    action: 'SCAN_ADVANCE',
    module,
    entityId: String(record.afterSalesId),
    details: `${currentStatus} → ${next.status} (scanned by ${_performer})`,
  })

  return NextResponse.json({
    success: true,
    message: `${String(record.afterSalesId)}: ${currentStatus} → ${next.label}`,
    module, fromStatus: currentStatus, toStatus: next.status,
    recordId: record.id,
    nextAction: next.action,
  })
}
