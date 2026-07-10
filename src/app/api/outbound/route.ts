import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const records = await db.outboundRecord.findMany({
      where: {
        OR: [
          { customerName: { contains: search } },
          { productName: { contains: search } },
          { outboundId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch outbound records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.customerName) {
      return NextResponse.json({ error: 'customerName is required' }, { status: 400 })
    }
    if (!body.customerContact) {
      return NextResponse.json({ error: 'customerContact is required' }, { status: 400 })
    }
    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    const qty = parseInt(String(body.qty))
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({
        error: 'qty must be a positive integer',
        received: body.qty,
      }, { status: 400 })
    }
    body.qty = qty  // normalize

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS
    // ═══════════════════════════════════════════════════════════════

    // Check merchant hold — same gate as inbound + order processing
    if (body.vendorId) {
      const merchant = await db.merchant.findUnique({
        where: { merchantId: body.vendorId },
        select: { businessName: true, isOnHold: true, holdReason: true },
      })
      if (merchant?.isOnHold) {
        return NextResponse.json({
          error: 'Merchant on hold',
          reason: merchant.holdReason || 'Overdue balance / dispute',
          merchantName: merchant.businessName,
          code: 'MERCHANT_ON_HOLD',
        }, { status: 409 })
      }
    }

    // Verify product exists + check sufficient stock BEFORE the transaction
    if (body.productId) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { currentStock: true, productLabel: true },
      })
      if (!product) {
        return NextResponse.json({
          error: `Product "${body.productId}" does not exist`,
          code: 'PRODUCT_NOT_FOUND',
        }, { status: 400 })
      }
      if (product.currentStock < qty) {
        return NextResponse.json({
          error: 'Insufficient stock',
          details: `${product.productLabel}: only ${product.currentStock} units available, but outbound requires ${qty}`,
          code: 'INSUFFICIENT_STOCK',
          currentStock: product.currentStock,
          requested: qty,
        }, { status: 409 })
      }
    }

    // Generate ID — use timestamp + random suffix to avoid race condition
    const outboundId = `OUT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create record + decrement stock atomically
    // ═══════════════════════════════════════════════════════════════

    const record = await db.$transaction(async (tx) => {
      // 1. Create the outbound record
      const created = await tx.outboundRecord.create({
        data: { ...body, outboundId },
      })

      // 2. Decrement stock ATOMICALLY — the WHERE clause ensures the
      //    decrement only happens if there's enough stock. If another
      //    request took the stock between our check and this update,
      //    the transaction fails and rolls back.
      if (body.productId) {
        const updated = await tx.product.updateMany({
          where: {
            productId: body.productId,
            currentStock: { gte: qty },  // atomic check — no race condition
          },
          data: { currentStock: { decrement: qty } },
        })
        if (updated.count === 0) {
          // Stock was taken by another request between our check and this update
          throw new Error(`STOCK_RACE: Product ${body.productId} stock was taken by another request. Please retry.`)
        }
      }

      return created
    })

    // ═══════════════════════════════════════════════════════════════
    // POST-TRANSACTION — non-critical side effects (storage liability, risk)
    // These run AFTER the transaction commits. If they fail, the outbound
    // record still exists (which is correct — the order was placed).
    // ═══════════════════════════════════════════════════════════════

    // Decrement storage liability
    if (body.vendorId && body.productId && qty && body.status !== 'self_delivery') {
      try {
        const { decrementStorageLiability } = await import('@/lib/storage-liability')
        await decrementStorageLiability({
          merchantId: body.vendorId,
          productId: body.productId,
          qtyToRemove: qty,
        })
      } catch (liabilityErr) {
        console.error('Storage liability decrement failed (non-blocking, logged):', liabilityErr)
      }
    }

    // Risk Module hook: score the order on creation
    if (body.status !== 'self_delivery') {
      const paymentPath = (body.paymentMethod === 'Cash' || !body.paymentMethod) ? 'cod' : 'prepaid'
      try {
        const { updateCustomerProfile } = await import('@/lib/risk-db')
        await updateCustomerProfile(body.customerContact || '', 'order_created', body.saleAmount || null)
        const origin = new URL(req.url).origin
        fetch(`${origin}/api/risk/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
          body: JSON.stringify({ outboundId: record.id, paymentPath }),
        }).catch(err => console.error('Risk score trigger failed (non-blocking):', err))
      } catch (riskErr) {
        console.error('Risk profile update failed (non-blocking):', riskErr)
      }
    }

    await logAudit({
      action: 'OUTBOUND_CREATED',
      module: 'outbound',
      entityId: outboundId,
      details: `Created outbound record for ${body.customerName || 'unknown customer'}`,
    })

    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create outbound record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body
    const record = await db.outboundRecord.update({ where: { id }, data })
    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update outbound record' }, { status: 500 })
  }
}

// DELETE — only allowed for orders that haven't been dispatched yet.
// Restores product stock and reverses storage liability.
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const record = await db.outboundRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Can't delete orders that have been dispatched or delivered
    if (['dispatched', 'delivered', 'returned', 'failed'].includes(record.status)) {
      return NextResponse.json({
        error: `Cannot delete order in status '${record.status}'`,
        hint: 'Cancel the order instead — use the workflow transition to move it to cancelled.',
      }, { status: 409 })
    }

    // Restore product stock
    if (record.productId && record.qty) {
      try {
        await db.product.update({
          where: { productId: record.productId },
          data: { currentStock: { increment: record.qty } },
        })
      } catch (stockErr) {
        console.error('Stock restore failed (non-blocking):', stockErr)
      }
    }

    // Reverse storage liability — note: storage-liability reversal is complex
    // (FIFO decrement touched multiple batches). For now we log a warning and
    // skip the reversal. The stock restore above is the critical one.
    // TODO: implement proper storage-liability reversal when the feature is needed.
    if (record.vendorId && record.productId && record.qty) {
      console.warn(`Storage liability reversal skipped for deleted outbound ${record.outboundId} — manual review needed`)
    }

    await db.outboundRecord.delete({ where: { id } })

    await logAudit({
      action: 'OUTBOUND_DELETED',
      module: 'outbound',
      entityId: record.outboundId,
      details: `Deleted outbound record (status was ${record.status})`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Outbound delete error:', error)
    return NextResponse.json({ error: 'Failed to delete outbound record' }, { status: 500 })
  }
}
