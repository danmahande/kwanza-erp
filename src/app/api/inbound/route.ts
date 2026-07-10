import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createStorageLiabilityOnInbound } from '@/lib/storage-liability'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const records = await db.inboundRecord.findMany({
      where: {
        OR: [
          { merchantName: { contains: search } },
          { productName: { contains: search } },
          { inboundId: { contains: search } },
          { vendorId: { contains: search } },
          { productId: { contains: search } },
          { brand: { contains: search } },
          { userComment: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch inbound records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    // ── Operational Hold enforcement (Workflow 1 gate) ──
    // If the merchant is on hold, block the inbound at the server.
    // This is the lightweight replacement for formal credit control.
    if (body.merchantId) {
      const merchant = await db.merchant.findUnique({
        where: { merchantId: body.merchantId },
        select: { businessName: true, isOnHold: true, holdReason: true, holdSetAt: true },
      })
      if (merchant?.isOnHold) {
        await logAudit({
          action: 'BLOCK',
          module: 'inbound',
          entityId: body.merchantId,
          details: `Blocked inbound for ${merchant.businessName} — merchant on hold: ${merchant.holdReason || 'no reason'}`,
        })
        return NextResponse.json({
          error: 'Merchant on hold',
          reason: merchant.holdReason || 'Overdue balance / dispute',
          merchantName: merchant.businessName,
          holdSetAt: merchant.holdSetAt,
          code: 'MERCHANT_ON_HOLD',
        }, { status: 409 })
      }
    }

    // Generate ID — use timestamp + random suffix to avoid race condition
    // (the old count+1 approach caused duplicate IDs on concurrent POSTs)
    const inboundId = `IN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

    // Calculate inbound value if unitPrice provided
    const unitPrice = body.unitPrice ? parseFloat(body.unitPrice) : null
    const inboundValue = unitPrice && body.qtyIn ? unitPrice * parseInt(body.qtyIn) : null

    // F5: Validate product belongs to the selected merchant
    if (body.productId && body.merchantId) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { merchantId: true, productLabel: true },
      })
      if (product && product.merchantId !== body.merchantId) {
        return NextResponse.json({
          error: 'Product-merchant mismatch',
          details: `Product "${product.productLabel}" belongs to merchant ${product.merchantId}, but this inbound is for merchant ${body.merchantId}`,
        }, { status: 400 })
      }
    }

    // Update product stock
    if (body.productId) {
      await db.product.update({
        where: { productId: body.productId },
        data: { currentStock: { increment: body.qtyIn } },
      })
    }

    const record = await db.inboundRecord.create({
      data: {
        ...body,
        inboundId,
        unitPrice,
        inboundValue,
      },
    })

    // Update merchant cumulative inbound value
    if (body.merchantId && inboundValue) {
      try {
        await db.merchant.update({
          where: { merchantId: body.merchantId },
          data: { totalInboundValue: { increment: inboundValue } },
        })
      } catch (merchantErr) {
        console.error('Merchant inbound value update failed (non-blocking):', merchantErr)
      }
    }

    // Workflow 1: create a StorageLiability row so storage fees start accruing
    // from tomorrow. Non-blocking — if it fails, the inbound still succeeded.
    try {
      await createStorageLiabilityOnInbound({
        merchantId: body.merchantId,
        merchantName: body.merchantName,
        inboundId,
        productId: body.productId,
        productName: body.productName,
        qtyIn: parseInt(String(body.qtyIn)) || 0,
        inboundDate: new Date(),
      })
    } catch (liabilityErr) {
      console.error('Storage liability creation failed (non-blocking):', liabilityErr)
    }

    // Auto-create InventoryItems for each unit received (per-unit barcode tracking).
    // P3: Previously called /api/items via internal HTTP fetch which failed silently
    // when NEXT_PUBLIC_BASE_URL was unset. Now creates items + events directly via Prisma.
    try {
      const performedBy = body.receivedBy || _user.name
      for (let i = 0; i < body.qtyIn; i++) {
        const now = Date.now()
        const suffix = String(now).slice(-6) + String(Math.random()).slice(2, 5) + String(i).slice(-2)
        const itemIdVal = `ITM-${suffix}`

        await db.inventoryItem.create({
          data: {
            itemId: itemIdVal,
            productId: body.productId,
            productName: body.productName,
            brand: body.brand || null,
            variant: body.variant || null,
            unitPrice: unitPrice,
            merchantId: body.merchantId || '',
            merchantName: body.merchantName || '',
            inboundId,
            storageLocation: body.storageLocation || null,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
            trackingLevel: 'unit',
            status: 'IN_WAREHOUSE',
          },
        })

        // Log the RECEIVED event
        await db.itemEvent.create({
          data: {
            eventId: `EVT-${now}-${suffix}`,
            itemId: itemIdVal,
            eventType: 'RECEIVED',
            description: `Item received into warehouse${body.storageLocation ? ` at ${body.storageLocation}` : ''}`,
            performedBy,
            inboundId,
            previousStatus: null,
            newStatus: 'IN_WAREHOUSE',
          },
        })
      }
    } catch (itemErr) {
      console.error('InventoryItem creation failed (non-blocking):', itemErr)
    }

    // Audit the successful inbound creation
    await logAudit({
      action: 'INBOUND_CREATED',
      module: 'inbound',
      entityId: inboundId,
      details: `Received ${body.qtyIn} units of ${body.productName} from ${body.merchantName || 'unknown merchant'}. Value: ${inboundValue ?? 'N/A'}`,
    })

    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create inbound record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // Recalculate inbound value if unitPrice or qtyIn changed
    if (data.unitPrice !== undefined || data.qtyIn !== undefined) {
      const existing = await db.inboundRecord.findUnique({ where: { id } })
      if (existing) {
        const qty = data.qtyIn !== undefined ? parseInt(String(data.qtyIn)) : existing.qtyIn
        const price = data.unitPrice !== undefined ? parseFloat(String(data.unitPrice)) : (existing.unitPrice || 0)
        data.inboundValue = price ? qty * price : null
      }
    }

    const record = await db.inboundRecord.update({ where: { id }, data })

    await logAudit({
      action: 'INBOUND_UPDATED',
      module: 'inbound',
      entityId: record.inboundId,
      details: `Updated inbound record: ${Object.keys(data).join(', ')}`,
    })

    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update inbound record' }, { status: 500 })
  }
}

// DELETE /api/inbound?id=... — delete an inbound record with FULL reversal.
// Reverses: Product.currentStock, Merchant.totalInboundValue, StorageLiability,
//           InventoryItem rows + ItemEvent rows.
// Blocks: if any OutboundRecord references stock from this inbound's product
//         (deleting would make stock negative).
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const record = await db.inboundRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Block if outbound orders exist for this product — deleting would make
    // stock negative (the outbound already decremented stock that this inbound added).
    if (record.productId) {
      const outboundCount = await db.outboundRecord.count({
        where: {
          productId: record.productId,
          status: { notIn: ['cancelled'] },
        },
      })
      if (outboundCount > 0) {
        return NextResponse.json({
          error: `Cannot delete inbound — ${outboundCount} outbound order(s) reference this product`,
          detail: 'Deleting this inbound would make stock negative. Cancel the outbound orders first, or adjust stock manually after deletion.',
          code: 'OUTBOUND_DEPENDENCY',
          outboundCount,
          productId: record.productId,
        }, { status: 409 })
      }
    }

    // 1. Reverse Product.currentStock
    if (record.productId && record.qtyIn) {
      try {
        await db.product.update({
          where: { productId: record.productId },
          data: { currentStock: { decrement: record.qtyIn } },
        })
      } catch (stockErr) {
        console.error('Stock restore failed (non-blocking):', stockErr)
      }
    }

    // 2. Reverse Merchant.totalInboundValue
    if (record.merchantId && record.inboundValue) {
      try {
        await db.merchant.update({
          where: { merchantId: record.merchantId },
          data: { totalInboundValue: { decrement: record.inboundValue } },
        })
      } catch (merchantErr) {
        console.error('Merchant value restore failed (non-blocking):', merchantErr)
      }
    }

    // 3. Settle the StorageLiability row(s) linked to this inbound
    if (record.inboundId) {
      try {
        await db.storageLiability.updateMany({
          where: { inboundId: record.inboundId },
          data: { status: 'settled', unitsRemaining: 0 },
        })
      } catch (liabilityErr) {
        console.error('Storage liability settlement failed (non-blocking):', liabilityErr)
      }
    }

    // 4. Delete linked InventoryItem rows + their ItemEvent rows
    if (record.inboundId) {
      try {
        const items = await db.inventoryItem.findMany({
          where: { inboundId: record.inboundId },
          select: { itemId: true },
        })
        if (items.length > 0) {
          const itemIds = items.map(i => i.itemId)
          // Delete ItemEvent rows first (they reference itemId)
          await db.itemEvent.deleteMany({
            where: { itemId: { in: itemIds } },
          })
          // Then delete the InventoryItem rows
          await db.inventoryItem.deleteMany({
            where: { inboundId: record.inboundId },
          })
        }
      } catch (itemErr) {
        console.error('InventoryItem cleanup failed (non-blocking):', itemErr)
      }
    }

    // 5. Delete the InboundRecord itself
    await db.inboundRecord.delete({ where: { id } })

    await logAudit({
      action: 'INBOUND_DELETED',
      module: 'inbound',
      entityId: record.inboundId,
      details: `Deleted inbound ${record.inboundId} (${record.qtyIn} units of ${record.productName}). Reversed stock, merchant value, storage liability, and ${record.inboundId ? 'item tracker entries' : '0 items'}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Inbound delete error:', error)
    return NextResponse.json({ error: 'Failed to delete inbound record' }, { status: 500 })
  }
}
