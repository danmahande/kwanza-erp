import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * GET /api/risk/intake-scores
 * Returns the latest RiskScore for every order currently in 'pending' status.
 * Used by the Outbound Intake Inbox to display risk badges alongside each order.
 *
 * Returns: { scores: [{ outboundId, score, decision, reasons, scoredAt }] }
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  // Fetch all pending orders
  const pendingOrders = await db.outboundRecord.findMany({
    where: { status: 'pending' },
    select: { id: true },
  })

  if (pendingOrders.length === 0) {
    return NextResponse.json({ scores: [] })
  }

  const orderIds = pendingOrders.map(o => o.id)

  // Get the latest score per order (SQLite doesn't support DISTINCT ON,
  // so we fetch the recent scores and dedupe client-side)
  const allScores = await db.riskScore.findMany({
    where: { outboundId: { in: orderIds } },
    orderBy: { scoredAt: 'desc' },
  })

  // Keep only the latest per outboundId
  const latestByOrder = new Map<string, typeof allScores[number]>()
  for (const s of allScores) {
    if (!latestByOrder.has(s.outboundId)) {
      latestByOrder.set(s.outboundId, s)
    }
  }

  const scores = Array.from(latestByOrder.values()).map(s => {
    let reasons: Array<{ rule: string; points: number; detail: string }> = []
    try { reasons = JSON.parse(s.reasons) } catch {}
    return {
      outboundId: s.outboundId,
      score: s.score,
      decision: s.decision,
      reasons,
      scoredAt: s.scoredAt,
    }
  })

  return NextResponse.json({ scores })
}
