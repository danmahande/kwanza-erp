import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Exception Reporting API — Phase 4
 *
 * POST /api/exceptions
 * body: {
 *   module: 'outbound' | 'order_processing' | 'shrinkage',
 *   recordId: <id>,
 *   exceptionType: 'damaged' | 'short_stock' | 'wrong_location' | 'customer_refused' | 'other',
 *   notes: <string>,
 *   reportedBy: <user>,
 *   qtyAffected?: <number>,
 * }
 *
 * Creates a ShrinkageRecord linked back to the source record, AND transitions
 * the source record to an exception status (e.g. 'cancelled', 'failed').
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const shrinkages = await db.shrinkageRecord.findMany({
      where: {
        OR: [
          { reason: { contains: search } },
          { productName: { contains: search } },
          { shrinkageId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(shrinkages)
  } catch (error) {
    console.error('Error fetching exceptions:', error)
    return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { module, recordId, exceptionType, notes, reportedBy, qtyAffected } = body

    if (!module || !recordId || !exceptionType) {
      return NextResponse.json({ error: 'module, recordId, and exceptionType are required' }, { status: 400 })
    }

    // Fetch the source record to get context
    let productName = ''
    let productId = ''
    let merchantId: string | null = null
    let merchantName: string | null = null
    let unitCost: number | null = null

    if (module === 'outbound') {
      const r = await db.outboundRecord.findUnique({ where: { id: recordId } })
      if (r) {
        productName = r.productName
        productId = r.productId
        // Look up the product for merchant info
        const product = await db.product.findUnique({ where: { productId: r.productId } })
        if (product) {
          merchantId = product.merchantId
          merchantName = product.merchantName
          unitCost = product.unitCost
        }
      }
    } else if (module === 'order_processing') {
      const r = await db.orderProcessing.findUnique({ where: { id: recordId } })
      if (r) productName = `Order ${r.orderNumber}`
    }

    // Create a shrinkage record linked back
    const qty = qtyAffected || 1
    const totalValue = unitCost ? qty * unitCost : null
    const count = await db.shrinkageRecord.count()
    const shrinkageId = `SHR-${String(count + 1).padStart(4, '0')}`

    const shrinkage = await db.shrinkageRecord.create({
      data: {
        shrinkageId,
        merchantId,
        merchantName,
        productId,
        productName,
        qty,
        unitCost,
        totalValue,
        reason: `[${exceptionType}] ${notes || ''}`.trim(),
        reportedBy: reportedBy || _user.name,
        status: 'pending',
        debitMerchant: false, // supervisor decides this at resolution
      },
    })

    // Transition the source record to an exception status
    if (module === 'outbound') {
      try {
        await db.outboundRecord.update({
          where: { id: recordId },
          data: { status: 'failed', deliveryNotes: `Exception: ${exceptionType} — ${notes || ''}` },
        })
      } catch (updateErr) {
        console.error('Failed to mark outbound as failed (non-blocking):', updateErr)
      }
    }

    await logAudit({
      action: 'EXCEPTION_REPORTED',
      module,
      entityId: recordId,
      details: `Exception ${exceptionType} reported: ${notes || '(no notes)'} · linked shrinkage ${shrinkageId}`,
    })

    return NextResponse.json({ success: true, shrinkage }, { status: 201 })
  } catch (error) {
    console.error('Error creating exception:', error)
    return NextResponse.json({ error: 'Failed to create exception' }, { status: 500 })
  }
}
