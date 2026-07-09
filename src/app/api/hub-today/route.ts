import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Hub Today API
 *
 * Returns the 7 station queues a warehouse worker needs to see:
 *   1. Intake       — (a) stock that arrived, needs put-away
 *                     (b) new orders awaiting risk validation, awaiting release to floor
 *   2. Sort         — orders being prepared (released → picking → picked → packing → packed)
 *   3. Stage        — packed/staged parcels, awaiting rider assignment
 *   4. Dispatch     — parcels assigned to a rider, about to leave
 *   5. In-Transit   — parcels out for delivery
 *   6. Delivered    — parcels delivered
 *   7. Returns      — customer returns received
 *
 * Plus: exceptions, riders, pending COD bankings, late banking alerts,
 * merchant follow-ups due, day-close readiness.
 *
 * DATE FILTER:
 *   ?range=today       — (default) today's activity + all in-flight items regardless of when they entered
 *   ?range=7d          — last 7 days
 *   ?range=30d         — last 30 days
 *   ?range=all         — no date filter (full history)
 *
 * "In-flight" = items currently sitting in a station (status hasn't reached terminal state).
 * These show up regardless of date filter so a supervisor never loses sight of stuck items.
 */

// Compute the average minutes since each item's stage-entry timestamp.
function computeAvgDwellMinutes(
  items: Array<{ createdAt?: string | Date | null; dispatchedAt?: string | Date | null; deliveredAt?: string | Date | null }>,
  field: 'createdAt' | 'dispatchedAt' | 'deliveredAt',
  now: Date,
): number | null {
  const times = items
    .map(it => it[field])
    .filter((t): t is string | Date => t != null)
    .map(t => new Date(t).getTime())
    .filter(t => !Number.isNaN(t))
  if (times.length === 0) return null
  const sumMinutes = times.reduce((sum, t) => sum + Math.max(0, Math.floor((now.getTime() - t) / 60000)), 0)
  return Math.round(sumMinutes / times.length)
}

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    // ── Parse date range filter ──
    const url = new URL(req.url)
    const range = url.searchParams.get('range') || 'today'
    let rangeStart: Date | null = null
    if (range === 'today') rangeStart = todayStart
    else if (range === '7d') rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (range === '30d') rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    // 'all' → rangeStart stays null (no filter)

    // For "today" range: in-flight items show regardless of createdAt.
    // For other ranges: filter by createdAt >= rangeStart.
    // We achieve this by using OR clauses for in-flight stations.

    // ── 1a. INTAKE (stock arrivals): InboundRecord with status 'received' ──
    // In-flight: show all received items regardless of date (they're still sitting in intake).
    // For 'today' range: also show today's arrivals even if already put away (activity view).
    const intakeInbounds = await db.inboundRecord.findMany({
      where: range === 'today'
        ? { OR: [{ status: 'received' }, { status: 'put_away', createdAt: { gte: todayStart } }] }
        : rangeStart
          ? { createdAt: { gte: rangeStart } }
          : {},
      select: {
        id: true, inboundId: true, productName: true, qtyIn: true,
        merchantName: true, storageLocation: true, createdAt: true, status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ── 1b. INTAKE (order intake): OutboundRecord with status 'pending' (awaiting risk validation) ──
    // These are orders that just came in and haven't been released to the pick floor yet.
    // Always shown regardless of date — they're "in flight" until released or cancelled.
    const intakeOrders = await db.outboundRecord.findMany({
      where: { status: 'pending' },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        productName: true, qty: true, saleAmount: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ── 2. SORT: orders being prepared (released → packing) ──
    // 'released' = passed intake validation, on the floor waiting for picker
    // 'picking' = picker claimed it
    // 'picked' = picked, moving to pack station
    // 'packing' = being packed
    const sortRecords = await db.outboundRecord.findMany({
      where: { status: { in: ['released', 'picking', 'picked', 'packing'] } },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        productName: true, qty: true, status: true, runsheetId: true,
        assignedDriver: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    // ── 3. STAGE: packed or staged parcels, no rider yet ──
    const stageRecords = await db.outboundRecord.findMany({
      where: { status: { in: ['packed', 'staged'] }, runsheetId: null },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        customerAddress: true, productName: true, qty: true,
        saleAmount: true, codCollected: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    // ── 4. DISPATCH: staged parcels assigned to a rider, about to leave ──
    const dispatchRecords = await db.outboundRecord.findMany({
      where: { status: { in: ['packed', 'staged'] }, runsheetId: { not: null } },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        productName: true, qty: true, runsheetId: true, assignedDriver: true,
        saleAmount: true, codCollected: true, createdAt: true,
      },
      orderBy: { runsheetId: 'asc' },
      take: 100,
    })

    // ── 5. IN-TRANSIT: parcels out for delivery ──
    // Show ALL in-transit regardless of when dispatched (in-flight principle).
    // Date filter only applies when range != 'today'.
    const inTransitWhere = range === 'today'
      ? { status: 'dispatched' as const }
      : rangeStart
        ? { status: 'dispatched' as const, dispatchedAt: { gte: rangeStart } }
        : { status: 'dispatched' as const }
    const inTransitRecords = await db.outboundRecord.findMany({
      where: inTransitWhere,
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        customerAddress: true, assignedDriver: true, runsheetId: true,
        codCollected: true, saleAmount: true, dispatchedAt: true,
        deliveryAttempts: true,
      },
      orderBy: { dispatchedAt: 'desc' },
      take: 100,
    })

    // ── 6. DELIVERED: parcels delivered ──
    // For 'today': delivered today. For other ranges: delivered since rangeStart.
    const deliveredWhere = range === 'today'
      ? { status: 'delivered' as const, deliveredAt: { gte: todayStart, lte: todayEnd } }
      : rangeStart
        ? { status: 'delivered' as const, deliveredAt: { gte: rangeStart } }
        : { status: 'delivered' as const }
    const deliveredRecords = await db.outboundRecord.findMany({
      where: deliveredWhere,
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        assignedDriver: true, codCollected: true, saleAmount: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 100,
    })

    // ── 7. RETURNS: customer returns received ──
    // In-flight: received/in_review regardless of date. For 'today': also today's initiated.
    const returnRecords = await db.afterSalesRecord.findMany({
      where: range === 'today'
        ? { OR: [{ returnStatus: { in: ['received', 'in_review'] } }, { returnStatus: { in: ['initiated', 'approved', 'processed', 'rejected'] }, createdAt: { gte: todayStart } }] }
        : rangeStart
          ? { createdAt: { gte: rangeStart } }
          : {},
      select: {
        id: true, afterSalesId: true, returnOrderNumber: true, customerName: true,
        reason: true, refundAmount: true, returnStatus: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ── EXCEPTIONS: failed deliveries + unresolved shrinkage ──
    // Always show all of these regardless of date — they need attention.
    const failedDeliveries = await db.outboundRecord.findMany({
      where: { status: 'failed' },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        assignedDriver: true, deliveryNotes: true, deliveryAttempts: true,
        dispatchedAt: true,
      },
      orderBy: { dispatchedAt: 'desc' },
      take: 20,
    })
    const pendingShrinkage = await db.shrinkageRecord.findMany({
      where: { status: { in: ['pending', 'investigating'] } },
      select: {
        id: true, shrinkageId: true, productName: true, qty: true,
        reason: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // ── RIDERS: active drivers + their stats today ──
    // KILL THE N+1: instead of 3 queries per driver, run 3 aggregate queries total.
    const activeDrivers = await db.driver.findMany({
      where: { status: 'active' },
      select: {
        driverId: true, name: true, phone: true,
        expectedBankings: true, banked: true,
      },
    })

    let ridersWithStats: Array<{ driverId: string; name: string; phone: string; expectedBankings: number; banked: number; dispatchedToday: number; deliveredToday: number; pendingBankings: number }> = []

    if (activeDrivers.length > 0) {
      const activeDriverIds = activeDrivers.map(d => d.driverId)

      // 3 aggregate queries instead of N×3
      const [dispatchedCounts, deliveredCounts, pendingBankingCounts] = await Promise.all([
        db.outboundRecord.groupBy({
          by: ['assignedDriver'],
          where: { assignedDriver: { in: activeDriverIds }, dispatchedAt: { gte: todayStart } },
          _count: true,
        }),
        db.outboundRecord.groupBy({
          by: ['assignedDriver'],
          where: { assignedDriver: { in: activeDriverIds }, status: 'delivered', deliveredAt: { gte: todayStart } },
          _count: true,
        }),
        db.driverBanking.groupBy({
          by: ['driverId'],
          where: { driverId: { in: activeDriverIds }, status: 'pending' },
          _count: true,
        }),
      ])

      const dispatchedMap = new Map(dispatchedCounts.map(r => [r.assignedDriver, r._count]))
      const deliveredMap = new Map(deliveredCounts.map(r => [r.assignedDriver, r._count]))
      const pendingBankingMap = new Map(pendingBankingCounts.map(r => [r.driverId, r._count]))

      ridersWithStats = activeDrivers.map(d => ({
        ...d,
        dispatchedToday: dispatchedMap.get(d.driverId) ?? 0,
        deliveredToday: deliveredMap.get(d.driverId) ?? 0,
        pendingBankings: pendingBankingMap.get(d.driverId) ?? 0,
      }))
    }

    // ── PENDING COD BANKINGS ──
    const pendingBankings = await db.driverBanking.findMany({
      where: { status: 'pending' },
      select: {
        id: true, bankingId: true, driverId: true, driverName: true,
        amount: true, bankedAt: true, runsheetId: true,
      },
      orderBy: { bankedAt: 'asc' },
      take: 20,
    })

    // ── LATE BANKING ALERTS ──
    // Driver has unbanked COD cash collected > 24h ago.
    // KILL THE N+1: 2 aggregate queries + 1 fetch for last-banking dates.
    let lateBankings: Array<{ driverId: string; driverName: string; phone: string; unbankedAmount: number; daysSinceBanking: number; isLate: boolean }> = []
    if (activeDrivers.length > 0) {
      const activeDriverIds = activeDrivers.map(d => d.driverId)
      const [collectedAgg, bankedAgg, lastBankings] = await Promise.all([
        db.outboundRecord.groupBy({
          by: ['assignedDriver'],
          where: { assignedDriver: { in: activeDriverIds }, status: 'delivered' },
          _sum: { codCollected: true },
        }),
        db.driverBanking.groupBy({
          by: ['driverId'],
          where: { driverId: { in: activeDriverIds } },
          _sum: { amount: true },
        }),
        db.driverBanking.findMany({
          where: { driverId: { in: activeDriverIds } },
          orderBy: { bankedAt: 'desc' },
          select: { driverId: true, bankedAt: true },
        }),
      ])
      const collectedMap = new Map(collectedAgg.map(r => [r.assignedDriver, r._sum.codCollected ?? 0]))
      const bankedMap = new Map(bankedAgg.map(r => [r.driverId, r._sum.amount ?? 0]))
      // lastBankings may have multiple rows per driver; keep the most recent
      const lastBankingMap = new Map<string, Date>()
      for (const lb of lastBankings) {
        if (lb.bankedAt) {
          const existing = lastBankingMap.get(lb.driverId)
          if (!existing || new Date(lb.bankedAt) > existing) {
            lastBankingMap.set(lb.driverId, new Date(lb.bankedAt))
          }
        }
      }

      lateBankings = activeDrivers.map(d => {
        const collected = collectedMap.get(d.driverId) ?? 0
        const banked = bankedMap.get(d.driverId) ?? 0
        const unbanked = Math.max(0, collected - banked)
        const lastBankingDate = lastBankingMap.get(d.driverId)
        let daysSinceBanking = 0
        if (lastBankingDate) {
          daysSinceBanking = Math.floor((now.getTime() - lastBankingDate.getTime()) / (1000 * 60 * 60 * 24))
        } else if (collected > 0) {
          daysSinceBanking = 1 // has unbanked cash, never banked — treat as late
        }
        return {
          driverId: d.driverId,
          driverName: d.name,
          phone: d.phone,
          unbankedAmount: unbanked,
          daysSinceBanking,
          isLate: unbanked > 0 && daysSinceBanking >= 1,
        }
      }).filter(d => d.isLate)
    }

    // ── MERCHANT FOLLOW-UPS DUE ──
    const followUpsDue = await db.merchantCommunication.findMany({
      where: {
        isResolved: false,
        followUpAt: { lte: now },
      },
      select: {
        id: true, merchantId: true, type: true, subject: true,
        followUpAt: true, createdAt: true,
      },
      orderBy: { followUpAt: 'asc' },
      take: 15,
    })
    const followUpMerchantIds = Array.from(new Set(followUpsDue.map(f => f.merchantId)))
    const followUpMerchants = await db.merchant.findMany({
      where: { merchantId: { in: followUpMerchantIds } },
      select: { merchantId: true, businessName: true, isOnHold: true },
    })
    const followUpMerchantMap = new Map(followUpMerchants.map(m => [m.merchantId, m]))
    const followUpsEnriched = followUpsDue.map(f => ({
      ...f,
      merchantName: followUpMerchantMap.get(f.merchantId)?.businessName || f.merchantId,
      merchantOnHold: followUpMerchantMap.get(f.merchantId)?.isOnHold || false,
    }))

    // ── DAY-CLOSE READINESS ──
    // Block on: unaccounted parcels (dispatched/failed today) + pending bankings
    //          + orders still in pipeline (pending/released/picking/picked/packing/packed/staged)
    //          + pending shrinkage
    const unaccountedParcels = await db.outboundRecord.count({
      where: {
        status: { in: ['dispatched', 'failed'] },
        dispatchedAt: { gte: todayStart },
      },
    })
    const pipelineOrders = await db.outboundRecord.count({
      where: { status: { in: ['pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged'] } },
    })
    const pendingShrinkageCount = await db.shrinkageRecord.count({
      where: { status: { in: ['pending', 'investigating'] } },
    })
    const pendingBankingsCount = pendingBankings.length
    const canCloseDay = unaccountedParcels === 0
      && pendingBankingsCount === 0
      && pipelineOrders === 0
      && pendingShrinkageCount === 0

    // ── TODAY'S TOTALS ──
    const totalParcelsInboundToday = await db.inboundRecord.count({
      where: { createdAt: { gte: todayStart } },
    })
    const totalParcelsOutboundToday = await db.outboundRecord.count({
      where: { createdAt: { gte: todayStart } },
    })
    const totalCodCollectedToday = await db.outboundRecord.aggregate({
      where: { status: 'delivered', deliveredAt: { gte: todayStart } },
      _sum: { codCollected: true },
    })
    const totalSalesToday = await db.outboundRecord.aggregate({
      where: { status: 'delivered', deliveredAt: { gte: todayStart } },
      _sum: { saleAmount: true },
    })

    // ── Compute avg dwell time per station ──
    const intakeDwell    = computeAvgDwellMinutes(intakeInbounds,    'createdAt',    now)
    const sortDwell      = computeAvgDwellMinutes(sortRecords,       'createdAt',    now)
    const stageDwell     = computeAvgDwellMinutes(stageRecords,      'createdAt',    now)
    const dispatchDwell  = computeAvgDwellMinutes(dispatchRecords,   'createdAt',    now)
    const inTransitDwell = computeAvgDwellMinutes(inTransitRecords,  'dispatchedAt', now)
    const deliveredDwell = computeAvgDwellMinutes(deliveredRecords,  'deliveredAt',  now)
    const returnsDwell   = computeAvgDwellMinutes(returnRecords,     'createdAt',    now)

    return NextResponse.json({
      date: now.toISOString(),
      range,
      stations: {
        intake: {
          count: intakeInbounds.length + intakeOrders.length,
          // Split into two sections so the UI can render them distinctly
          stockArrivals: intakeInbounds,
          orderIntake: intakeOrders,
          items: [...intakeInbounds, ...intakeOrders], // backward-compat flat list
          label: 'Intake',
          description: 'Stock arrivals + new orders awaiting validation',
          action: 'Start Intake',
          targetModule: 'inventory',
          avgDwellMinutes: intakeDwell,
        },
        sort: {
          count: sortRecords.length,
          items: sortRecords,
          label: 'Sort & Pack',
          description: 'Orders being picked or packed',
          action: 'Start Sorting',
          targetModule: 'outbound',
          avgDwellMinutes: sortDwell,
        },
        stage: {
          count: stageRecords.length,
          items: stageRecords,
          label: 'Staging',
          description: 'Packed, awaiting rider assignment',
          action: 'Assign Riders',
          targetModule: 'outbound',
          avgDwellMinutes: stageDwell,
        },
        dispatch: {
          count: dispatchRecords.length,
          items: dispatchRecords,
          label: 'Dispatch',
          description: 'Assigned to rider, ready to leave',
          action: 'Dispatch Parcels',
          targetModule: 'outbound',
          avgDwellMinutes: dispatchDwell,
        },
        inTransit: {
          count: inTransitRecords.length,
          items: inTransitRecords,
          label: 'In Transit',
          description: 'Out for delivery now',
          action: 'Track Deliveries',
          targetModule: 'outbound',
          avgDwellMinutes: inTransitDwell,
        },
        delivered: {
          count: deliveredRecords.length,
          items: deliveredRecords,
          label: 'Delivered',
          description: 'Successfully delivered',
          action: 'View Proof of Delivery',
          targetModule: 'outbound',
          avgDwellMinutes: deliveredDwell,
        },
        returns: {
          count: returnRecords.length,
          items: returnRecords,
          label: 'Returns',
          description: 'Customer returns received',
          action: 'Process Returns',
          targetModule: 'returns',
          avgDwellMinutes: returnsDwell,
        },
      },
      exceptions: {
        failedDeliveries,
        pendingShrinkage,
        count: failedDeliveries.length + pendingShrinkage.length,
      },
      riders: ridersWithStats,
      pendingBankings: {
        count: pendingBankings.length,
        items: pendingBankings,
        totalAmount: pendingBankings.reduce((s, b) => s + b.amount, 0),
      },
      followUps: {
        count: followUpsEnriched.length,
        items: followUpsEnriched,
      },
      lateBankings: {
        count: lateBankings.length,
        items: lateBankings,
        totalUnbanked: lateBankings.reduce((s, b) => s + b.unbankedAmount, 0),
      },
      dayClose: {
        canClose: canCloseDay,
        unaccountedParcels,
        pendingBankingsCount,
        pipelineOrders,
        pendingShrinkageCount,
      },
      totals: {
        inboundToday: totalParcelsInboundToday,
        outboundToday: totalParcelsOutboundToday,
        codCollectedToday: totalCodCollectedToday._sum.codCollected ?? 0,
        salesToday: totalSalesToday._sum.saleAmount ?? 0,
      },
    })
  } catch (error) {
    console.error('Error fetching hub today:', error)
    return NextResponse.json({ error: 'Failed to fetch hub data' }, { status: 500 })
  }
}
