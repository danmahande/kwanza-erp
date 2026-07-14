import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * GET /api/risk/audit
 * Returns recent risk events — RiskScore records + RiskOverride records,
 * merged and sorted by timestamp desc.
 *
 * Query: ?limit=100  (default 100, max 500)
 *        ?contact=phone  (filter by customer contact)
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
  const contact = url.searchParams.get('contact')

  // Fetch recent scores
  const scoresWhere = contact ? { customerContact: contact } : {}
  const scores = await db.riskScore.findMany({
    where: scoresWhere,
    orderBy: { scoredAt: 'desc' },
    take: limit,
    select: {
      id: true, outboundId: true, customerContact: true,
      score: true, decision: true, reasons: true,
      engineVersion: true, paymentPath: true, scoredAt: true,
    },
  })

  // Fetch recent overrides
  const overrides = await db.riskOverride.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, outboundId: true, action: true,
      managerName: true, reason: true, createdAt: true,
    },
  })

  // Join: get order numbers for both
  const allOutboundIds = new Set([
    ...scores.map(s => s.outboundId),
    ...overrides.map(o => o.outboundId),
  ])
  const orders = await db.outboundRecord.findMany({
    where: { id: { in: Array.from(allOutboundIds) } },
    select: { id: true, orderNumber: true, outboundId: true, customerName: true },
  })
  const orderMap = new Map(orders.map(o => [o.id, o]))

  type AuditEvent = {
    type: 'score' | 'override'
    timestamp: Date
    data: Record<string, unknown>
  }
  const events: AuditEvent[] = []

  for (const s of scores) {
    const order = orderMap.get(s.outboundId)
    let reasons: Array<{ rule: string; points: number; detail: string }> = []
    try { reasons = JSON.parse(s.reasons) } catch {}
    events.push({
      type: 'score',
      timestamp: s.scoredAt,
      data: {
        id: s.id,
        eventType: 'score',
        outboundId: s.outboundId,
        orderNumber: order?.orderNumber || order?.outboundId || s.outboundId,
        customerName: order?.customerName || '',
        customerContact: s.customerContact,
        score: s.score,
        decision: s.decision,
        paymentPath: s.paymentPath,
        engineVersion: s.engineVersion,
        reasons,
        timestamp: s.scoredAt,
      },
    })
  }

  for (const o of overrides) {
    const order = orderMap.get(o.outboundId)
    events.push({
      type: 'override',
      timestamp: o.createdAt,
      data: {
        id: o.id,
        eventType: 'override',
        outboundId: o.outboundId,
        orderNumber: order?.orderNumber || order?.outboundId || o.outboundId,
        customerName: order?.customerName || '',
        action: o.action,
        managerName: o.managerName,
        reason: o.reason,
        timestamp: o.createdAt,
      },
    })
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return NextResponse.json({
    items: events.slice(0, limit).map(e => e.data),
  })
}
