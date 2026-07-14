import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { scoreOrder } from '@/lib/risk-engine'
import { buildScoringInput, loadSettingsFromDb, persistScore } from '@/lib/risk-db'

/**
 * POST /api/risk/score
 * Scores an order and persists the result.
 *
 * Body: {
 *   outboundId: string,
 *   paymentPath?: 'cod' | 'prepaid'  // defaults to 'cod' (most orders in UG market are COD)
 * }
 *
 * Called automatically after order creation (see /api/order-processing POST).
 * Can also be called manually to re-score an order after settings change.
 *
 * Returns: { score, decision, reasons, engineVersion }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { outboundId, paymentPath = 'cod' } = body as {
    outboundId: string
    paymentPath?: 'cod' | 'prepaid'
  }

  if (!outboundId) {
    return NextResponse.json({ error: 'outboundId is required' }, { status: 400 })
  }

  // Fetch the order
  const order = await db.outboundRecord.findUnique({
    where: { id: outboundId },
    select: {
      id: true, customerContact: true, customerAddress: true,
      customerName: true, productName: true, productId: true,
      qty: true, saleAmount: true,
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Build scoring context (loads customer profile, address reuse, blocklist, etc.)
  const input = await buildScoringInput(order, paymentPath)

  // Load settings + score
  const settings = await loadSettingsFromDb()
  const result = scoreOrder(input, settings)

  // Persist the score
  await persistScore(outboundId, order.customerContact, order.customerAddress, result)

  return NextResponse.json(result)
}
