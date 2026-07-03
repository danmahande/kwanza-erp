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

    const count = await db.inboundRecord.count()
    const inboundId = `IN${String(count + 1).padStart(6, '0')}`

    // Calculate inbound value if unitPrice provided
    const unitPrice = body.unitPrice ? parseFloat(body.unitPrice) : null
    const inboundValue = unitPrice && body.qtyIn ? unitPrice * parseInt(body.qtyIn) : null

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

    // Auto-create InventoryItems for each unit received (librarian tracking)
    try {
      const items: Record<string, unknown>[] = []
      for (let i = 0; i < body.qtyIn; i++) {
        items.push({
          productId: body.productId,
          productName: body.productName,
          brand: body.brand || null,
          variant: body.variant || null,
          unitPrice: unitPrice,
          merchantId: body.merchantId,
          merchantName: body.merchantName,
          inboundId,
          storageLocation: body.storageLocation || null,
          expiryDate: body.expiryDate || null,
          trackingLevel: 'unit',
        })
      }
      if (items.length > 0) {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, performedBy: body.receivedBy || _user.name }),
        }).catch(() => {
          // Non-blocking — InventoryItem table may not exist yet
        })
      }
    } catch {
      // Non-blocking
    }

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
    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update inbound record' }, { status: 500 })
  }
}
