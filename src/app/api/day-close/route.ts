import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Day Close API
 *
 * GET /api/day-close
 *   Returns readiness check + blocker details + today's summary.
 *
 * POST /api/day-close
 *   Closes the operational day. Before closing, verifies that:
 *     - No parcels are "unaccounted for" (dispatched but not delivered/returned)
 *     - No pending COD bankings (all driver cash must be banked)
 *     - No orders still in the pick/pack pipeline (pending/released/picking/picked/packing/packed/staged)
 *     - No pending shrinkage (unresolved inventory loss)
 *
 *   On success:
 *     - Stamps an audit log entry with a JSON snapshot of the day's state
 *     - Returns the day's summary
 *
 *   On failure:
 *     - Returns 409 with the list of blockers
 *
 *   IMPORTANT: Closing the day does NOT freeze records. Activity continues.
 *   The snapshot preserves "what the day looked like when closed" for historical
 *   comparison. Unfulfilled orders carry over naturally because they stay in
 *   their status. A future "Day History" view will surface past snapshots.
 */

export async function GET() {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Check readiness — expanded blockers
    const unaccountedParcels = await db.outboundRecord.findMany({
      where: {
        status: { in: ['dispatched', 'failed'] },
        dispatchedAt: { gte: todayStart },
      },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        assignedDriver: true, status: true, deliveryAttempts: true,
      },
    })

    const pendingBankings = await db.driverBanking.findMany({
      where: { status: 'pending' },
      select: {
        id: true, bankingId: true, driverName: true, amount: true, bankedAt: true,
      },
    })

    const pendingShrinkage = await db.shrinkageRecord.findMany({
      where: { status: { in: ['pending', 'investigating'] } },
      select: { id: true, shrinkageId: true, productName: true, qty: true },
    })

    const pipelineOrders = await db.outboundRecord.findMany({
      where: { status: { in: ['pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged'] } },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        status: true, createdAt: true,
      },
      take: 50,
    })

    // Today's summary
    const deliveredToday = await db.outboundRecord.aggregate({
      where: { status: 'delivered', deliveredAt: { gte: todayStart } },
      _sum: { saleAmount: true, codCollected: true },
      _count: true,
    })

    const returnedToday = await db.afterSalesRecord.count({
      where: { createdAt: { gte: todayStart } },
    })

    const inboundToday = await db.inboundRecord.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { qtyIn: true, inboundValue: true },
      _count: true,
    })

    const canClose =
      unaccountedParcels.length === 0 &&
      pendingBankings.length === 0 &&
      pipelineOrders.length === 0 &&
      pendingShrinkage.length === 0

    return NextResponse.json({
      canClose,
      blockers: {
        unaccountedParcels,
        pendingBankings,
        pendingShrinkage,
        pipelineOrders,
      },
      summary: {
        deliveredCount: deliveredToday._count,
        deliveredValue: deliveredToday._sum.saleAmount ?? 0,
        codCollected: deliveredToday._sum.codCollected ?? 0,
        returnedCount: returnedToday,
        inboundCount: inboundToday._count,
        inboundUnits: inboundToday._sum.qtyIn ?? 0,
        inboundValue: inboundToday._sum.inboundValue ?? 0,
      },
    })
  } catch (error) {
    console.error('Error checking day-close:', error)
    return NextResponse.json({ error: 'Failed to check day-close' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { performedBy, forceClose } = body as { performedBy?: string; forceClose?: boolean }

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Re-check readiness before closing
    const unaccountedCount = await db.outboundRecord.count({
      where: {
        status: { in: ['dispatched', 'failed'] },
        dispatchedAt: { gte: todayStart },
      },
    })
    const pendingBankingsCount = await db.driverBanking.count({
      where: { status: 'pending' },
    })
    const pipelineOrdersCount = await db.outboundRecord.count({
      where: { status: { in: ['pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged'] } },
    })
    const pendingShrinkageCount = await db.shrinkageRecord.count({
      where: { status: { in: ['pending', 'investigating'] } },
    })

    const hasBlockers =
      unaccountedCount > 0 ||
      pendingBankingsCount > 0 ||
      pipelineOrdersCount > 0 ||
      pendingShrinkageCount > 0

    if (hasBlockers && !forceClose) {
      return NextResponse.json({
        error: 'Cannot close day — blockers exist',
        unaccountedParcels: unaccountedCount,
        pendingBankings: pendingBankingsCount,
        pipelineOrders: pipelineOrdersCount,
        pendingShrinkage: pendingShrinkageCount,
        hint: 'Resolve all blockers, or call again with forceClose: true to close anyway (the snapshot will record the unfinished state).',
      }, { status: 409 })
    }

    // Get the final summary
    const deliveredToday = await db.outboundRecord.aggregate({
      where: { status: 'delivered', deliveredAt: { gte: todayStart } },
      _sum: { saleAmount: true, codCollected: true },
      _count: true,
    })
    const returnedToday = await db.afterSalesRecord.count({
      where: { createdAt: { gte: todayStart } },
    })
    const inboundToday = await db.inboundRecord.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { qtyIn: true, inboundValue: true },
      _count: true,
    })

    // Snapshot: list of unfulfilled order IDs that will carry over to the next day
    const carryOverOrders = await db.outboundRecord.findMany({
      where: { status: { in: ['pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged'] } },
      select: { id: true, outboundId: true, orderNumber: true, status: true, createdAt: true },
      take: 200,
    })

    const summary = {
      date: todayStart.toISOString().slice(0, 10),
      deliveredCount: deliveredToday._count,
      deliveredValue: deliveredToday._sum.saleAmount ?? 0,
      codCollected: deliveredToday._sum.codCollected ?? 0,
      returnedCount: returnedToday,
      inboundCount: inboundToday._count,
      inboundUnits: inboundToday._sum.qtyIn ?? 0,
      inboundValue: inboundToday._sum.inboundValue ?? 0,
      closedAt: now.toISOString(),
      closedBy: performedBy || _user.name,
      forceClosed: hasBlockers && forceClose === true,
      carryOverOrders: carryOverOrders.map(o => ({
        id: o.outboundId,
        orderNumber: o.orderNumber,
        status: o.status,
        age: Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60)), // hours
      })),
      blockersAtClose: {
        unaccountedParcels: unaccountedCount,
        pendingBankings: pendingBankingsCount,
        pipelineOrders: pipelineOrdersCount,
        pendingShrinkage: pendingShrinkageCount,
      },
    }

    // Stamp the audit log with the full snapshot as JSON.
    // This is the "historical record" — future Day History view reads these.
    await logAudit({
      action: 'DAY_CLOSED',
      module: 'system',
      entityId: summary.date,
      details: `Day closed${summary.forceClosed ? ' (FORCED)' : ''}: ${summary.deliveredCount} delivered, ${summary.returnedCount} returns, ${summary.inboundCount} inbound. COD: ${summary.codCollected}. ${summary.carryOverOrders.length} orders carrying over.`,
    })

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('Error closing day:', error)
    return NextResponse.json({ error: 'Failed to close day' }, { status: 500 })
  }
}
