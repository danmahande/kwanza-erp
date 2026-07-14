import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * GET /api/risk/review-queue
 * Returns all orders currently held for manager review.
 *
 * A "held" order is one whose latest RiskScore has decision = 'review' or 'blocked'
 * AND has no RiskOverride (manager hasn't acted yet).
 *
 * Query params:
 *  - status: 'review' | 'blocked' | 'all'  (default: 'all' — both)
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const statusFilter = url.searchParams.get('status') || 'all'

  // Find the latest RiskScore per outboundId where decision is review/blocked
  // SQLite doesn't support DISTINCT ON, so we use a subquery approach:
  // get all review/blocked scores, then filter client-side to keep only the latest per order.
  const decisions = statusFilter === 'all'
    ? ['review', 'blocked']
    : [statusFilter]

  const scores = await db.riskScore.findMany({
    where: { decision: { in: decisions } },
    orderBy: { scoredAt: 'desc' },
    take: 200,
  })

  // Keep only the latest score per outboundId
  const latestByOrder = new Map<string, typeof scores[number]>()
  for (const s of scores) {
    if (!latestByOrder.has(s.outboundId)) {
      latestByOrder.set(s.outboundId, s)
    }
  }

  // Filter out orders that already have an override (manager acted)
  const orderIds = Array.from(latestByOrder.keys())
  if (orderIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const overridden = await db.riskOverride.findMany({
    where: { outboundId: { in: orderIds } },
    select: { outboundId: true },
  })
  const overriddenSet = new Set(overridden.map(o => o.outboundId))

  const pendingOrderIds = orderIds.filter(id => !overriddenSet.has(id))
  const pendingScores = pendingOrderIds
    .map(id => latestByOrder.get(id)!)
    .filter(Boolean)

  // Fetch the actual orders
  const orders = await db.outboundRecord.findMany({
    where: { id: { in: pendingOrderIds } },
    select: {
      id: true, outboundId: true, orderNumber: true,
      customerName: true, customerContact: true, customerAddress: true,
      productName: true, qty: true, saleAmount: true,
      status: true, createdAt: true,
    },
  })
  const orderById = new Map(orders.map(o => [o.id, o]))

  const items = pendingScores.map(score => {
    const order = orderById.get(score.outboundId)
    if (!order) return null
    let reasons: Array<{ rule: string; points: number; detail: string }> = []
    try {
      reasons = JSON.parse(score.reasons)
    } catch {}
    return {
      scoreId: score.id,
      outboundId: order.id,
      orderNumber: order.orderNumber || order.outboundId,
      customerName: order.customerName,
      customerContact: order.customerContact,
      customerAddress: order.customerAddress,
      productName: order.productName,
      qty: order.qty,
      saleAmount: order.saleAmount,
      orderStatus: order.status,
      riskScore: score.score,
      riskDecision: score.decision,
      paymentPath: score.paymentPath,
      engineVersion: score.engineVersion,
      reasons,
      scoredAt: score.scoredAt,
      createdAt: order.createdAt,
    }
  }).filter(Boolean)

  // Sort by score descending (highest risk first)
  items.sort((a, b) => b!.riskScore - a!.riskScore)

  return NextResponse.json({ items })
}
