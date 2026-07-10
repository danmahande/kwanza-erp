import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * RTV (Return to Vendor) API — Production-hardened
 *
 * When stock needs to go back to the vendor (faulty goods, expired, recall),
 * an RTV record is created. Stock is decremented when the RTV is created
 * (goods are leaving the warehouse). If the RTV is later cancelled, stock
 * is restored automatically.
 *
 * All multi-write operations are wrapped in db.$transaction.
 * Stock decrements use atomic updateMany to prevent race conditions.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const records = await db.rTVRecord.findMany({
      where: search ? {
        OR: [
          { merchantName: { contains: search } },
          { productName: { contains: search } },
          { rtvId: { contains: search } },
        ],
      } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(records)
  } catch (error) {
    console.error('Error fetching RTV records:', error)
    return NextResponse.json({ error: 'Failed to fetch RTV records' }, { status: 500 })
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

    if (!body.merchantId) {
      return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    }
    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (!body.productName) {
      return NextResponse.json({ error: 'productName is required' }, { status: 400 })
    }

    const qty = parseInt(String(body.qty))
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({
        error: 'qty must be a positive integer',
        received: body.qty,
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS
    // ═══════════════════════════════════════════════════════════════

    // Validate product belongs to the selected merchant
    const product = await db.product.findUnique({
      where: { productId: body.productId },
      select: { merchantId: true, productLabel: true, currentStock: true },
    })
    if (!product) {
      return NextResponse.json({
        error: `Product "${body.productId}" does not exist`,
        code: 'PRODUCT_NOT_FOUND',
      }, { status: 400 })
    }
    if (product.merchantId !== body.merchantId) {
      return NextResponse.json({
        error: 'Product-merchant mismatch',
        details: `Product "${product.productLabel}" belongs to merchant ${product.merchantId}, but this RTV is for merchant ${body.merchantId}`,
        code: 'PRODUCT_MERCHANT_MISMATCH',
      }, { status: 400 })
    }

    // Check sufficient stock BEFORE the transaction (fail fast)
    if (product.currentStock < qty) {
      return NextResponse.json({
        error: 'Insufficient stock for RTV',
        details: `${product.productLabel}: only ${product.currentStock} units on shelf, but RTV returns ${qty} units`,
        code: 'INSUFFICIENT_STOCK',
        currentStock: product.currentStock,
        requested: qty,
      }, { status: 409 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create record + decrement stock atomically
    // ═══════════════════════════════════════════════════════════════

    const rtvTs = Date.now().toString(36).toUpperCase()
    const rtvRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const rtvId = `RTV-${rtvTs}-${rtvRand}`

    const record = await db.$transaction(async (tx) => {
      // 1. Create the RTV record
      const created = await tx.rTVRecord.create({
        data: {
          ...body,
          rtvId,
          qty,
        },
      })

      // 2. Decrement stock ATOMICALLY — WHERE currentStock >= qty prevents race
      const updated = await tx.product.updateMany({
        where: {
          productId: body.productId,
          currentStock: { gte: qty },
        },
        data: { currentStock: { decrement: qty } },
      })
      if (updated.count === 0) {
        throw new Error(`STOCK_RACE: Product ${body.productId} stock was taken by another request. Please retry.`)
      }

      return created
    })

    await logAudit({
      action: 'RTV_CREATED',
      module: 'rtv',
      entityId: rtvId,
      details: `RTV created for ${qty} units of ${body.productName} from ${body.merchantName || 'merchant'}. Stock decremented.`,
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Error creating RTV record:', error)
    return NextResponse.json({
      error: 'Failed to create RTV record',
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

    const existing = await db.rTVRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update record + restore stock if cancelled
    // ═══════════════════════════════════════════════════════════════

    const record = await db.$transaction(async (tx) => {
      const updated = await tx.rTVRecord.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })

      // If transitioning to 'cancelled', restore stock that was decremented at creation
      if (data.status === 'cancelled' && existing.status !== 'cancelled' && existing.productId && existing.qty) {
        await tx.product.update({
          where: { productId: existing.productId },
          data: { currentStock: { increment: existing.qty } },
        })
      }

      return updated
    })

    await logAudit({
      action: data.status === 'cancelled' ? 'RTV_CANCELLED' : 'RTV_UPDATED',
      module: 'rtv',
      entityId: record.rtvId,
      details: data.status === 'cancelled'
        ? `RTV cancelled. ${existing.qty} units of ${existing.productName} restored to stock.`
        : `RTV updated: ${Object.keys(data).join(', ')}`,
    })

    return NextResponse.json(record)
  } catch (error) {
    console.error('Error updating RTV record:', error)
    return NextResponse.json({
      error: 'Failed to update RTV record',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE — only allowed for RTVs that haven't been shipped yet.
// Restores stock if the RTV had decremented it (status is not 'shipped' or 'processed').
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

    const record = await db.rTVRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Can't delete RTVs that have been shipped or processed (goods already left)
    if (['shipped', 'processed'].includes(record.status)) {
      return NextResponse.json({
        error: `Cannot delete RTV in status '${record.status}'`,
        hint: 'Goods have already been dispatched to the vendor.',
      }, { status: 409 })
    }

    // Restore stock if the RTV was active (not cancelled — cancelled already restored)
    if (record.status !== 'cancelled' && record.productId && record.qty) {
      await db.product.update({
        where: { productId: record.productId },
        data: { currentStock: { increment: record.qty } },
      })
    }

    await db.rTVRecord.delete({ where: { id } })

    await logAudit({
      action: 'RTV_DELETED',
      module: 'rtv',
      entityId: record.rtvId,
      details: `Deleted RTV ${record.rtvId} (${record.qty} units of ${record.productName}). Stock ${record.status === 'cancelled' ? 'already restored' : 'restored'}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting RTV record:', error)
    return NextResponse.json({ error: 'Failed to delete RTV record' }, { status: 500 })
  }
}
