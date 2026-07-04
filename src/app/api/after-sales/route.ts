import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * After-Sales (RMA) API — Workflow 3: Customer Returns + Disposition
 *
 * When a customer returns goods, we record which specific itemIds came back
 * and (later, on approval) what to do with each: RESTOCK / RTV / DISPOSE / LIQUIDATE.
 *
 * The DS→RT order number flip stays from the original implementation:
 * when an RMA is created against an originalOrderId, the linked OutboundRecord's
 * orderNumber is flipped from DS-XXX to RT-XXX.
 *
 * NOTE: SQLite stores JSON as TEXT, so itemIds and dispositions are JSON.stringify'd
 * strings, not native JSON columns.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const afterSalesRecords = await db.afterSalesRecord.findMany({
      where: {
        OR: [
          { afterSalesId: { contains: search } },
          { returnOrderNumber: { contains: search } },
          { customerName: { contains: search } },
          { reason: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
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
    const count = await db.afterSalesRecord.count()
    const afterSalesId = `AS-${String(count + 1).padStart(4, '0')}`

    // Generate return order number with RT prefix
    const returnOrderNumber = `RT-${String(count + 1).padStart(3, '0')}`

    // Workflow 3: capture which specific itemIds came back (stored as JSON string)
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds : []

    // Flip the linked OutboundRecord's orderNumber from DS-XXX to RT-XXX
    if (body.originalOrderId) {
      const outboundRecord = await db.outboundRecord.findFirst({
        where: {
          OR: [
            { orderNumber: body.originalOrderId },
            { outboundId: body.originalOrderId },
          ],
        },
      })

      if (outboundRecord) {
        await db.outboundRecord.update({
          where: { id: outboundRecord.id },
          data: {
            // store the original order number before the flip
            // (note: the SQLite schema doesn't have originalOrderNumber, so we just flip)
            orderNumber: returnOrderNumber,
            status: 'returned',
          },
        })
      }
    }

    const afterSalesRecord = await db.afterSalesRecord.create({
      data: {
        afterSalesId,
        originalOrderId: body.originalOrderId || null,
        returnOrderNumber,
        customerId: body.customerId || '',
        customerName: body.customerName || '',
        reason: body.reason || '',
        returnStatus: body.returnStatus || 'initiated',
        agentId: body.agentId || null,
        agentName: body.agentName || null,
        refundAmount: body.refundAmount ? parseFloat(String(body.refundAmount)) : null,
        replacementProductId: body.replacementProductId || null,
        replacementProductName: body.replacementProductName || null,
        returnTrackingNumber: body.returnTrackingNumber || null,
        itemIds: itemIds.length > 0 ? JSON.stringify(itemIds) : null,
        dispositions: null, // decided on approval
        resolutionNotes: body.resolutionNotes || null,
      },
    })

    // Workflow 3: log a RETURNED_TO_WAREHOUSE event on each returned item
    // (non-blocking — InventoryItem/ItemEvent tables may not always exist)
    try {
      for (const itemId of itemIds) {
        const item = await db.inventoryItem.findUnique({
          where: { itemId },
          select: { id: true },
        })
        if (item) {
          await db.itemEvent.create({
            data: {
              eventId: `EVT-${Date.now()}-${itemId.slice(-6)}`,
              itemId,
              eventType: 'RETURNED_TO_WAREHOUSE',
              description: `Returned by customer ${body.customerName}. RMA: ${afterSalesId}`,
              performedBy: body.agentId || _user.name,
              outboundId: body.originalOrderId || null,
              // disposition is null here — set on approval
            },
          })
          // Mark item as back in warehouse, pending disposition decision
          await db.inventoryItem.update({
            where: { itemId },
            data: { status: 'RETURNED_PENDING_DISPOSITION' },
          })
        }
      }
    } catch (itemErr) {
      console.error('Item event logging failed (non-blocking):', itemErr)
    }

    return NextResponse.json(afterSalesRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating after-sales record:', error)
    return NextResponse.json({ error: 'Failed to create after-sales record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // Workflow 3: on approval, stamp the approver + apply per-item dispositions.
    // body.dispositions should be an array of { itemId, disposition }
    // where disposition ∈ { RESTOCK, RTV, DISPOSE, LIQUIDATE }.
    if (data.returnStatus === 'approved' && !data.approvedBy) {
      data.approvedBy = 'current_user' // TODO: replace with real session
      data.approvedAt = new Date()
    }

    // If changing order number, update the linked outbound record
    if (data.originalOrderId && data.returnOrderNumber) {
      const outboundRecord = await db.outboundRecord.findFirst({
        where: {
          OR: [
            { orderNumber: data.originalOrderId },
            { outboundId: data.originalOrderId },
          ],
        },
      })

      if (outboundRecord) {
        await db.outboundRecord.update({
          where: { id: outboundRecord.id },
          data: {
            orderNumber: data.returnOrderNumber,
            status: 'returned',
          },
        })
      }
    }

    const afterSalesRecord = await db.afterSalesRecord.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })

    // Apply per-item dispositions when the RMA is approved
    // body.dispositions = [{ itemId, disposition }]
    if (Array.isArray(body.dispositions) && body.dispositions.length > 0) {
      for (const d of body.dispositions) {
        if (!d.itemId || !d.disposition) continue
        try {
          // Log the disposition event on the item
          await db.itemEvent.create({
            data: {
              eventId: `EVT-${Date.now()}-${d.itemId.slice(-6)}-${d.disposition}`,
              itemId: d.itemId,
              eventType: d.disposition === 'RESTOCK' ? 'STORED'
                : d.disposition === 'RTV' ? 'RTV'
                : d.disposition === 'DISPOSE' ? 'DISPOSED'
                : 'DISPOSED', // LIQUIDATE → treated as disposed for event type
              disposition: d.disposition,
              description: `Disposition decision: ${d.disposition} (RMA ${afterSalesRecord.afterSalesId})`,
              performedBy: data.approvedBy || _user.name,
            },
          })

          // Update item status based on disposition
          const newStatus = d.disposition === 'RESTOCK' ? 'IN_WAREHOUSE'
            : d.disposition === 'RTV' ? 'RTV_PENDING'
            : 'DISPOSED' // DISPOSE or LIQUIDATE
          await db.inventoryItem.update({
            where: { itemId: d.itemId },
            data: { status: newStatus },
          })

          // For RESTOCK: increment Product.currentStock (item goes back on shelf)
          // For RTV/DISPOSE/LIQUIDATE: stock was already decremented at outbound time, don't re-add
          if (d.disposition === 'RESTOCK') {
            const item = await db.inventoryItem.findUnique({
              where: { itemId: d.itemId },
              select: { productId: true, productName: true, merchantId: true, merchantName: true },
            })
            if (item) {
              try {
                await db.product.update({
                  where: { productId: item.productId },
                  data: { currentStock: { increment: 1 } },
                })
              } catch (productErr) {
                console.error('Product restock increment failed (non-blocking):', productErr)
              }
            }
          }

          // If RTV, auto-create an RTVRecord (linking RMA → RTV → vendor approval)
          if (d.disposition === 'RTV') {
            const item = await db.inventoryItem.findUnique({
              where: { itemId: d.itemId },
              select: { productId: true, productName: true, merchantId: true, merchantName: true },
            })
            if (item) {
              const rtvCount = await db.rTVRecord.count()
              const rtvId = `RTV-${String(rtvCount + 1).padStart(5, '0')}`
              await db.rTVRecord.create({
                data: {
                  rtvId,
                  merchantId: item.merchantId,
                  merchantName: item.merchantName || '',
                  productId: item.productId,
                  productName: item.productName,
                  qty: 1,
                  reason: afterSalesRecord.reason || 'Customer return — faulty',
                  status: 'pending',
                },
              })
            }
          }
        } catch (itemErr) {
          console.error(`Disposition application failed for item ${d.itemId} (non-blocking):`, itemErr)
        }
      }

      // Save the dispositions JSON back onto the after-sales record
      await db.afterSalesRecord.update({
        where: { id },
        data: { dispositions: JSON.stringify(body.dispositions) },
      })
    }

    // Audit the approval or status change
    if (data.returnStatus) {
      await logAudit({
        action: data.returnStatus === 'approved' ? 'APPROVE' : data.returnStatus === 'rejected' ? 'REJECT' : 'STATUS_CHANGE',
        module: 'after_sales',
        entityId: afterSalesRecord.afterSalesId,
        details: `RMA ${afterSalesRecord.afterSalesId} status set to ${data.returnStatus} for ${afterSalesRecord.customerName}`,
      })
    }

    return NextResponse.json(afterSalesRecord)
  } catch (error) {
    console.error('Error updating after-sales record:', error)
    return NextResponse.json({ error: 'Failed to update after-sales record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.afterSalesRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting after-sales record:', error)
    return NextResponse.json({ error: 'Failed to delete after-sales record' }, { status: 500 })
  }
}
