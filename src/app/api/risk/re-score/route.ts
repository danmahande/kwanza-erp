import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-api'
import { scoreOrder } from '@/lib/risk-engine'
import { buildScoringInput, loadSettingsFromDb, persistScore } from '@/lib/risk-db'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/risk/re-score
 * Re-scores all orders currently in 'pending' status.
 *
 * Use case: when the ops manager changes a setting (adds a zone, lowers a threshold,
 * adds a blocklist entry), held orders need to be re-evaluated.
 *
 * Admin-only (it's a heavy operation).
 *
 * Body: { paymentPath?: 'cod' | 'prepaid' }  (defaults to 'cod')
 *
 * Returns: { scored: number, byDecision: { auto_release: n, spot_check: n, review: n, blocked: n } }
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, 'admin', 'super_admin')
  if (auth instanceof NextResponse) return auth
  const user = auth

  const body = await req.json().catch(() => ({}))
  const paymentPath = (body as { paymentPath?: 'cod' | 'prepaid' }).paymentPath || 'cod'

  // Fetch all pending orders
  const pendingOrders = await db.outboundRecord.findMany({
    where: { status: 'pending' },
    select: {
      id: true, customerContact: true, customerAddress: true,
      customerName: true, productName: true, productId: true,
      qty: true, saleAmount: true,
    },
  })

  if (pendingOrders.length === 0) {
    return NextResponse.json({ scored: 0, byDecision: {} })
  }

  const settings = await loadSettingsFromDb()
  const byDecision: Record<string, number> = {
    auto_release: 0,
    spot_check: 0,
    review: 0,
    blocked: 0,
  }

  // Score each order
  for (const order of pendingOrders) {
    try {
      const input = await buildScoringInput(order, paymentPath)
      const result = scoreOrder(input, settings)
      await persistScore(order.id, order.customerContact, order.customerAddress, result)
      byDecision[result.decision]++
    } catch (err) {
      console.error(`Re-score failed for ${order.id}:`, err)
    }
  }

  await logAudit({
    action: 'RISK_RESCORE',
    module: 'risk',
    entityId: `${pendingOrders.length} pending orders`,
    details: `Re-scored ${pendingOrders.length} orders. Breakdown: ${JSON.stringify(byDecision)}`,
  })

  return NextResponse.json({ scored: pendingOrders.length, byDecision })
}
