import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Reconciliation API
 *
 * GET /api/reconciliation — list all reconciliation records
 * POST /api/reconciliation — create a record
 *   Body: { type, referenceId?, expectedQty, actualQty, varianceReason?, reconciledBy,
 *           productId?, adjustStock? }
 *   - If productId provided, expectedQty is auto-populated from Product.currentStock
 *     (unless expectedQty is explicitly provided — manual override)
 *   - If adjustStock=true, Product.currentStock is updated to match actualQty
 * DELETE /api/reconciliation?id=... — delete a record
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const records = await db.reconciliationRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reconciliation records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    let expectedQty = parseFloat(body.expectedQty)
    let productName: string | null = null

    // If productId provided and expectedQty not explicitly set, pull from system
    if (body.productId && (isNaN(expectedQty) || body.expectedQty === undefined)) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { currentStock: true, productLabel: true },
      })
      if (product) {
        expectedQty = product.currentStock
        productName = product.productLabel
      }
    }

    const actualQty = parseFloat(body.actualQty)
    const variance = expectedQty - actualQty

    const record = await db.reconciliationRecord.create({
      data: {
        type: body.type,
        referenceId: body.referenceId || body.productId || null,
        expectedQty,
        actualQty,
        variance,
        varianceReason: body.varianceReason || null,
        reconciledBy: body.reconciledBy,
      },
    })

    // Optional: adjust Product.currentStock to match actualQty
    if (body.adjustStock === true && body.productId && !isNaN(variance) && variance !== 0) {
      try {
        const product = await db.product.findUnique({
          where: { productId: body.productId },
          select: { currentStock: true, productLabel: true },
        })
        if (product) {
          // Set stock to the counted amount (actualQty)
          await db.product.update({
            where: { productId: body.productId },
            data: { currentStock: actualQty },
          })
          productName = product.productLabel
        }
      } catch (stockErr) {
        console.error('Stock adjustment failed (non-blocking):', stockErr)
      }
    }

    await logAudit({
      action: 'RECONCILIATION_CREATED',
      module: 'inventory',
      entityId: record.referenceId || record.id,
      details: `Reconciliation: expected ${expectedQty}, actual ${actualQty}, variance ${variance}${body.adjustStock ? ' (stock adjusted to actual)' : ''}${productName ? ` — ${productName}` : ''}`,
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Reconciliation create error:', error)
    return NextResponse.json({ error: 'Failed to create reconciliation record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const record = await db.reconciliationRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    await db.reconciliationRecord.delete({ where: { id } })

    await logAudit({
      action: 'RECONCILIATION_DELETED',
      module: 'inventory',
      entityId: record.referenceId || record.id,
      details: `Deleted reconciliation record (expected ${record.expectedQty}, actual ${record.actualQty})`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reconciliation delete error:', error)
    return NextResponse.json({ error: 'Failed to delete reconciliation record' }, { status: 500 })
  }
}
