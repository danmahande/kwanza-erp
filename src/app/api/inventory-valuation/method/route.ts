import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/inventory-valuation/method
 *
 * Change the costing method for a single product (per-product override).
 *
 * Body:
 *   { productId: string, costingMethod: 'fifo' | 'avco' | 'standard' | 'specific_id' }
 *
 * LIFO is BLOCKED here — IAS 2 §25 prohibits it.
 */

const VALID_METHODS = ['fifo', 'avco', 'standard', 'specific_id']

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (!body.costingMethod || !VALID_METHODS.includes(body.costingMethod)) {
      return NextResponse.json(
        { error: `Invalid costing method. Permitted: ${VALID_METHODS.join(', ')}. LIFO is prohibited under IAS 2.` },
        { status: 400 },
      )
    }

    const product = await db.product.findUnique({
      where: { productId: body.productId },
      select: { id: true, productLabel: true, costingMethod: true, merchantName: true },
    })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const oldMethod = product.costingMethod
    await db.product.update({
      where: { productId: body.productId },
      data: { costingMethod: body.costingMethod },
    })

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'VALUATION_METHOD_CHANGED',
      module: 'inventory',
      entityId: body.productId,
      details: `Costing method changed from ${oldMethod} → ${body.costingMethod} for ${product.productLabel} (${product.merchantName})`,
    })

    return NextResponse.json({ success: true, productId: body.productId, costingMethod: body.costingMethod })
  } catch (error) {
    console.error('POST /api/inventory-valuation/method error:', error)
    return NextResponse.json({ error: 'Failed to change costing method' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
