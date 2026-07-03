import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Day Close API
 *
 * POST /api/day-close
 *
 * Closes the operational day. Before closing, verifies that:
 *   - No parcels are "unaccounted for" (dispatched but not delivered/returned)
 *   - No pending COD bankings (all driver cash must be banked)
 *
 * On success:
 *   - Stamps an audit log entry
 *   - Returns the day's summary
 *
 * On failure:
 *   - Returns 409 with the list of blockers
 */

export async function GET() {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // Check readiness
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

    return NextResponse.json({
      canClose: unaccountedParcels.length === 0 && pendingBankings.length === 0,
      blockers: {
        unaccountedParcels,
        pendingBankings,
        pendingShrinkage,
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
    const { performedBy } = body

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

    if (unaccountedCount > 0 || pendingBankingsCount > 0) {
      return NextResponse.json({
        error: 'Cannot close day — blockers exist',
        unaccountedParcels: unaccountedCount,
        pendingBankings: pendingBankingsCount,
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
    }

    await logAudit({
      action: 'DAY_CLOSED',
      module: 'system',
      entityId: summary.date,
      details: `Day closed: ${summary.deliveredCount} delivered, ${summary.returnedCount} returns, ${summary.inboundCount} inbound. COD: ${summary.codCollected}`,
    })

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('Error closing day:', error)
    return NextResponse.json({ error: 'Failed to close day' }, { status: 500 })
  }
}
