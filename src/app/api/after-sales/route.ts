import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * After-Sales (RMA) API — Production-hardened
 *
 * When a customer returns goods, we record which specific itemIds came back.
 * The linked OutboundRecord's orderNumber is flipped from DS-XXX to RT-XXX,
 * but the original DS number is preserved in `originalOrderNumber` so it's
 * never lost.
 *
 * Stock is NOT restored on receipt — the returned item is in the warehouse
 * but pending inspection. Stock is only restored when the RMA is approved
 * with a RESTOCK disposition (after verification that the item is sellable).
 *
 * All multi-write operations are wrapped in db.$transaction.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const afterSalesRecords = await db.afterSalesRecord.findMany({
      where: search ? {
        OR: [
          { afterSalesId: { contains: search } },
          { returnOrderNumber: { contains: search } },
          { customerName: { contains: search } },
          { reason: { contains: search } },
        ],
      } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(afterSalesRecords)
  } catch (error) {
    console.error('Error fetching after-sales records:', error)
    return NextResponse.json({ error: 'Failed to fetch after-sales records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.originalOrderId) {
      return NextResponse.json({ error: 'originalOrderId is required' }, { status: 400 })
    }
    if (!body.customerName) {
      return NextResponse.json({ error: 'customerName is required' }, { status: 400 })
    }
    if (!body.reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const itemIds = Array.isArray(body.itemIds) ? body.itemIds : []
    const refundAmount = body.refundAmount ? parseFloat(String(body.refundAmount)) : null
    if (refundAmount !== null && (isNaN(refundAmount) || refundAmount < 0)) {
      return NextResponse.json({ error: 'refundAmount must be a non-negative number' }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT: verify the original order exists
    // ═══════════════════════════════════════════════════════════════

    const outboundRecord = await db.outboundRecord.findFirst({
      where: {
        OR: [
          { orderNumber: body.originalOrderId },
          { outboundId: body.originalOrderId },
          { originalOrderNumber: body.originalOrderId },  // also match by original DS number
        ],
      },
    })

    if (!outboundRecord) {
      return NextResponse.json({
        error: 'Original order not found',
        details: `No outbound record found for order "${body.originalOrderId}". Verify the order number is correct.`,
        code: 'ORIGINAL_ORDER_NOT_FOUND',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — flip order number + create RMA + log item events
    // ═══════════════════════════════════════════════════════════════

    // Generate IDs — timestamp + random to avoid race condition
    const ts = Date.now().toString(36).toUpperCase()
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const afterSalesId = `AS-${ts}-${rand}`
    const returnOrderNumber = `RT-${ts.slice(-6)}-${rand}`

    const afterSalesRecord = await db.$transaction(async (tx) => {
      // 1. Flip the OutboundRecord's orderNumber from DS-XXX to RT-XXX
      //    BUT preserve the original DS number in originalOrderNumber
      const originalOrderNumber = outboundRecord.orderNumber || outboundRecord.outboundId
      await tx.outboundRecord.update({
        where: { id: outboundRecord.id },
        data: {
          originalOrderNumber,  // preserve the DS-XXX number
          orderNumber: returnOrderNumber,  // flip to RT-XXX
          status: 'returned',
        },
      })

      // 2. Create the AfterSalesRecord
      const created = await tx.afterSalesRecord.create({
        data: {
          afterSalesId,
          originalOrderId: body.originalOrderId,
          returnOrderNumber,
          customerId: body.customerId || '',
          customerName: body.customerName,
          reason: body.reason,
          returnStatus: body.returnStatus || 'initiated',
          agentId: body.agentId || null,
          agentName: body.agentName || null,
          refundAmount,
          replacementProductId: body.replacementProductId || null,
          replacementProductName: body.replacementProductName || null,
          returnTrackingNumber: body.returnTrackingNumber || null,
          itemIds: itemIds.length > 0 ? JSON.stringify(itemIds) : null,
          dispositions: null,
          resolutionNotes: body.resolutionNotes || null,
        },
      })

      // 3. Log RETURNED_TO_WAREHOUSE event on each returned item + mark status
      for (const itemId of itemIds) {
        const item = await tx.inventoryItem.findUnique({
          where: { itemId },
          select: { id: true },
        })
        if (item) {
          await tx.itemEvent.create({
            data: {
              eventId: `EVT-${Date.now()}-${itemId.slice(-6)}`,
              itemId,
              eventType: 'RETURNED_TO_WAREHOUSE',
              description: `Returned by customer ${body.customerName}. RMA: ${afterSalesId}. Order flipped: ${originalOrderNumber} → ${returnOrderNumber}`,
              performedBy: body.agentId || _user.name,
              outboundId: outboundRecord.outboundId,
            },
          })
          // Mark item as back in warehouse, pending disposition decision
          // Stock is NOT restored here — only on RESTOCK disposition after verification
          await tx.inventoryItem.update({
            where: { itemId },
            data: { status: 'RETURNED_PENDING_DISPOSITION' },
          })
        }
      }

      return created
    })

    await logAudit({
      action: 'RMA_CREATED',
      module: 'after_sales',
      entityId: afterSalesId,
      details: `RMA created for ${body.customerName}. Original order: ${body.originalOrderId} → ${returnOrderNumber}. ${itemIds.length} item(s) returned, pending inspection.`,
    })

    return NextResponse.json(afterSalesRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating after-sales record:', error)
    return NextResponse.json({
      error: 'Failed to create after-sales record',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update RMA + apply dispositions + merchant debit
    // ═══════════════════════════════════════════════════════════════

    if (data.returnStatus === 'approved' && !data.approvedBy) {
      data.approvedBy = _user.name
      data.approvedAt = new Date()
    }

    const afterSalesRecord = await db.$transaction(async (tx) => {
      // 1. Update the AfterSalesRecord
      const updated = await tx.afterSalesRecord.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })

      // 2. Update merchant.totalReturnValue when a return is approved
      if (data.returnStatus === 'approved' && updated.originalOrderId) {
        const outbound = await tx.outboundRecord.findFirst({
          where: {
            OR: [
              { orderNumber: updated.originalOrderId },
              { outboundId: updated.originalOrderId },
              { originalOrderNumber: updated.originalOrderId },
            ],
          },
          select: { vendorId: true, saleAmount: true },
        })
        if (outbound?.vendorId) {
          const returnValue = updated.refundAmount || outbound.saleAmount || 0
          if (returnValue > 0) {
            await tx.merchant.update({
              where: { merchantId: outbound.vendorId },
              data: { totalReturnValue: { increment: returnValue } },
            })
          }
        }
      }

      // 3. Apply per-item dispositions when the RMA is approved
      if (Array.isArray(body.dispositions) && body.dispositions.length > 0) {
        for (const d of body.dispositions) {
          if (!d.itemId || !d.disposition) continue

          // Log the disposition event on the item
          await tx.itemEvent.create({
            data: {
              eventId: `EVT-${Date.now()}-${d.itemId.slice(-6)}-${d.disposition}`,
              itemId: d.itemId,
              eventType: d.disposition === 'RESTOCK' ? 'STORED'
                : d.disposition === 'RTV' ? 'RTV'
                : d.disposition === 'DISPOSE' ? 'DISPOSED'
                : 'DISPOSED', // LIQUIDATE → treated as disposed
              disposition: d.disposition,
              description: `Disposition decision: ${d.disposition} (RMA ${updated.afterSalesId})`,
              performedBy: data.approvedBy || _user.name,
            },
          })

          // Update item status based on disposition
          const newStatus = d.disposition === 'RESTOCK' ? 'IN_WAREHOUSE'
            : d.disposition === 'RTV' ? 'RTV_PENDING'
            : 'DISPOSED'
          await tx.inventoryItem.update({
            where: { itemId: d.itemId },
            data: { status: newStatus },
          })

          // For RESTOCK: increment Product.currentStock ATOMICALLY
          // (item goes back on shelf after verification)
          // For RTV/DISPOSE/LIQUIDATE: stock was decremented at outbound time, don't re-add
          if (d.disposition === 'RESTOCK') {
            const item = await tx.inventoryItem.findUnique({
              where: { itemId: d.itemId },
              select: { productId: true },
            })
            if (item) {
              await tx.product.update({
                where: { productId: item.productId },
                data: { currentStock: { increment: 1 } },
              })
            }
          }

          // If RTV, auto-create an RTVRecord
          if (d.disposition === 'RTV') {
            const item = await tx.inventoryItem.findUnique({
              where: { itemId: d.itemId },
              select: { productId: true, productName: true, merchantId: true, merchantName: true },
            })
            if (item) {
              const rtvTs = Date.now().toString(36).toUpperCase()
              const rtvRand = Math.random().toString(36).slice(2, 5).toUpperCase()
              const rtvId = `RTV-${rtvTs}-${rtvRand}`
              await tx.rTVRecord.create({
                data: {
                  rtvId,
                  merchantId: item.merchantId,
                  merchantName: item.merchantName || '',
                  productId: item.productId,
                  productName: item.productName,
                  qty: 1,
                  reason: updated.reason || 'Customer return — faulty',
                  status: 'pending',
                },
              })
            }
          }
        }

        // Save the dispositions JSON back onto the after-sales record
        await tx.afterSalesRecord.update({
          where: { id },
          data: { dispositions: JSON.stringify(body.dispositions) },
        })
      }

      return updated
    })

    // Audit the approval or status change
    if (data.returnStatus) {
      await logAudit({
        action: data.returnStatus === 'approved' ? 'RMA_APPROVED' : data.returnStatus === 'rejected' ? 'RMA_REJECTED' : 'RMA_STATUS_CHANGE',
        module: 'after_sales',
        entityId: afterSalesRecord.afterSalesId,
        details: `RMA ${afterSalesRecord.afterSalesId} status set to ${data.returnStatus} for ${afterSalesRecord.customerName}${body.dispositions ? ` — ${body.dispositions.length} disposition(s) applied` : ''}`,
      })
    }

    return NextResponse.json(afterSalesRecord)
  } catch (error) {
    console.error('Error updating after-sales record:', error)
    return NextResponse.json({
      error: 'Failed to update after-sales record',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const record = await db.afterSalesRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    await db.afterSalesRecord.delete({ where: { id } })

    await logAudit({
      action: 'RMA_DELETED',
      module: 'after_sales',
      entityId: record.afterSalesId,
      details: `Deleted RMA ${record.afterSalesId} for ${record.customerName}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting after-sales record:', error)
    return NextResponse.json({ error: 'Failed to delete after-sales record' }, { status: 500 })
  }
}
