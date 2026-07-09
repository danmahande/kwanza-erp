import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'
import { loadSettingsFromDb } from '@/lib/risk-db'

/**
 * POST /api/risk/override
 * Manager approves or rejects a held order.
 *
 * Body: {
 *   outboundId: string,
 *   action: 'approve' | 'reject',
 *   reason?: string
 * }
 *
 * Approve → moves the order from 'pending' (intake hold) to 'released' (pick floor).
 * Reject  → moves the order to 'cancelled' with the reason.
 *
 * Permission: only users with the role configured in settings (default: 'admin').
 * First action wins — subsequent attempts get 409 Conflict.
 */
export async function POST(req: NextRequest) {
  // Load settings to check which role is allowed
  const settings = await loadSettingsFromDb()
  const requiredRole = settings.override_role

  const auth = requireRole(req, requiredRole)
  if (auth instanceof NextResponse) return auth
  const user = auth

  const body = await req.json()
  const { outboundId, action, reason } = body as {
    outboundId: string
    action: 'approve' | 'reject'
    reason?: string
  }

  if (!outboundId || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'outboundId and action (approve/reject) are required' }, { status: 400 })
  }

  // Check for existing override (first-action-wins rule)
  const existing = await db.riskOverride.findFirst({
    where: { outboundId },
  })
  if (existing) {
    return NextResponse.json({
      error: `Order already ${existing.action}d by ${existing.managerName} at ${existing.createdAt.toISOString()}`,
    }, { status: 409 })
  }

  // Verify the order exists and is currently held
  const order = await db.outboundRecord.findUnique({ where: { id: outboundId } })
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (order.status !== 'pending') {
    return NextResponse.json({
      error: `Order is no longer pending (current status: ${order.status}). Override only applies to held intake orders.`,
    }, { status: 409 })
  }

  // Record the override (append-only — audit trail)
  await db.riskOverride.create({
    data: {
      outboundId,
      action,
      managerName: user.name,
      reason: reason || null,
    },
  })

  // Apply the workflow transition
  if (action === 'approve') {
    await db.outboundRecord.update({
      where: { id: outboundId },
      data: { status: 'released' },
    })
  } else {
    await db.outboundRecord.update({
      where: { id: outboundId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: user.name,
        cancellationReason: reason || 'Risk review rejected',
      },
    })
  }

  // Audit
  await logAudit({
    action: 'RISK_OVERRIDE',
    module: 'risk',
    entityId: order.orderNumber || order.outboundId,
    details: `${action.toUpperCase()} by ${user.name}${reason ? ` — ${reason}` : ''}`,
  })

  return NextResponse.json({
    success: true,
    newStatus: action === 'approve' ? 'released' : 'cancelled',
  })
}
