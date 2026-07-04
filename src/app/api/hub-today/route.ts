import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Hub Today API
 *
 * Returns the 7 station queues a warehouse worker needs to see today:
 *   1. Intake       — parcels that just arrived, need scanning/put-away
 *   2. Sort         — parcels being prepared (picking/packing)
 *   3. Stage        — parcels packed, awaiting rider assignment
 *   4. Dispatch     — parcels assigned to a rider, about to leave
 *   5. In-Transit   — parcels out for delivery
 *   6. Delivered    — parcels delivered today
 *   7. Returns      — customer returns received today
 *
 * Plus: exceptions, riders checked in, pending COD bankings, day-close readiness.
 *
 * This is the data behind the "Today at the Hub" home screen — the single
 * workflow view that replaces the 12-module sidebar for daily warehouse work.
 */

// Compute the average minutes since each item's stage-entry timestamp.
// Used to surface "this station is bottlenecked" without making the supervisor
// read every row. Returns null if no items or no usable timestamps.
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

    // ── 1. INTAKE: parcels that just arrived at the warehouse ──
    // Inbound records with status 'received' (not yet put away)
    // PLUS outbound records with status 'pending' for drop-ship on-demand arrivals
    const intakeInbounds = await db.inboundRecord.findMany({
      where: { status: 'received', createdAt: { gte: todayStart } },
      select: {
        id: true, inboundId: true, productName: true, qtyIn: true,
        merchantName: true, storageLocation: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ── 2. SORT: parcels being prepared (picking, picked, packing) ──
    const sortRecords = await db.outboundRecord.findMany({
      where: { status: { in: ['picking', 'picked', 'packing'] } },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        productName: true, qty: true, status: true, runsheetId: true,
        assignedDriver: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    // ── 3. STAGE: packed parcels, no rider yet ──
    const stageRecords = await db.outboundRecord.findMany({
      where: { status: 'packed', runsheetId: null },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        customerAddress: true, productName: true, qty: true,
        saleAmount: true, codCollected: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    // ── 4. DISPATCH: packed parcels assigned to a rider, about to leave ──
    const dispatchRecords = await db.outboundRecord.findMany({
      where: { status: 'packed', runsheetId: { not: null } },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        productName: true, qty: true, runsheetId: true, assignedDriver: true,
        saleAmount: true, codCollected: true, createdAt: true,
      },
      orderBy: { runsheetId: 'asc' },
      take: 100,
    })

    // ── 5. IN-TRANSIT: parcels out for delivery today ──
    const inTransitRecords = await db.outboundRecord.findMany({
      where: {
        status: 'dispatched',
        dispatchedAt: { gte: todayStart },
      },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        customerAddress: true, assignedDriver: true, runsheetId: true,
        codCollected: true, saleAmount: true, dispatchedAt: true,
        deliveryAttempts: true,
      },
      orderBy: { dispatchedAt: 'desc' },
      take: 100,
    })

    // ── 6. DELIVERED: parcels delivered today ──
    const deliveredRecords = await db.outboundRecord.findMany({
      where: {
        status: 'delivered',
        deliveredAt: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        assignedDriver: true, codCollected: true, saleAmount: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 100,
    })

    // ── 7. RETURNS: customer returns received today ──
    const returnRecords = await db.afterSalesRecord.findMany({
      where: {
        returnStatus: { in: ['received', 'in_review'] },
        createdAt: { gte: todayStart },
      },
      select: {
        id: true, afterSalesId: true, returnOrderNumber: true, customerName: true,
        reason: true, refundAmount: true, returnStatus: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // ── EXCEPTIONS: failed deliveries + unresolved shrinkage ──
    const failedDeliveries = await db.outboundRecord.findMany({
      where: { status: 'failed' },
      select: {
        id: true, outboundId: true, orderNumber: true, customerName: true,
        assignedDriver: true, deliveryNotes: true, deliveryAttempts: true,
      },
      orderBy: { createdAt: 'desc' },
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

    // ── RIDERS: active drivers + their runsheets today ──
    const activeDrivers = await db.driver.findMany({
      where: { status: 'active' },
      select: {
        driverId: true, name: true, phone: true,
        expectedBankings: true, banked: true,
      },
    })
    // For each active driver, count today's dispatched parcels
    const ridersWithStats = await Promise.all(activeDrivers.map(async (d) => {
      const dispatchedToday = await db.outboundRecord.count({
        where: { assignedDriver: d.driverId, dispatchedAt: { gte: todayStart } },
      })
      const deliveredToday = await db.outboundRecord.count({
        where: { assignedDriver: d.driverId, status: 'delivered', deliveredAt: { gte: todayStart } },
      })
      const pendingBankings = await db.driverBanking.count({
        where: { driverId: d.driverId, status: 'pending' },
      })
      return {
        ...d,
        dispatchedToday,
        deliveredToday,
        pendingBankings,
      }
    }))

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

    // ── MERCHANT FOLLOW-UPS DUE ──
    // Open communication entries with followUpAt <= now (overdue or due today)
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
    // Enrich with merchant names
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

    // H: Late banking alerts — drivers with unbanked COD cash older than 24 hours
    const lateBankingDrivers = await Promise.all(activeDrivers.map(async (d) => {
      const collectedAgg = await db.outboundRecord.aggregate({
        where: { assignedDriver: d.driverId, status: 'delivered' },
        _sum: { codCollected: true },
      })
      const bankedAgg = await db.driverBanking.aggregate({
        where: { driverId: d.driverId },
        _sum: { amount: true },
      })
      const collected = collectedAgg._sum.codCollected ?? 0
      const banked = bankedAgg._sum.amount ?? 0
      const unbanked = collected - banked

      // Check last banking date
      const lastBanking = await db.driverBanking.findFirst({
        where: { driverId: d.driverId },
        orderBy: { bankedAt: 'desc' },
        select: { bankedAt: true },
      })

      let daysSinceBanking = 0
      if (lastBanking?.bankedAt) {
        daysSinceBanking = Math.floor((now.getTime() - new Date(lastBanking.bankedAt).getTime()) / (1000 * 60 * 60 * 24))
      } else if (collected > 0) {
        // Has collected cash but never banked — count from first delivery
        const firstDelivery = await db.outboundRecord.findFirst({
          where: { assignedDriver: d.driverId, status: 'delivered' },
          orderBy: { deliveredAt: 'asc' },
          select: { deliveredAt: true },
        })
        if (firstDelivery?.deliveredAt) {
          daysSinceBanking = Math.floor((now.getTime() - new Date(firstDelivery.deliveredAt).getTime()) / (1000 * 60 * 60 * 24))
        }
      }

      return {
        driverId: d.driverId,
        driverName: d.name,
        phone: d.phone,
        unbankedAmount: Math.max(0, unbanked),
        daysSinceBanking,
        isLate: unbanked > 0 && daysSinceBanking >= 1,
      }
    }))
    const lateBankings = lateBankingDrivers.filter(d => d.isLate)

    // ── DAY-CLOSE READINESS ──
    // Count parcels that are "unaccounted for" — not delivered, not returned, not staged
    const unaccountedParcels = await db.outboundRecord.count({
      where: {
        status: { in: ['dispatched', 'failed'] },
        dispatchedAt: { gte: todayStart },
      },
    })
    const canCloseDay = unaccountedParcels === 0 && pendingBankings.length === 0

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
    // Each station uses the timestamp most relevant to that stage:
    //   intake/sort/stage/dispatch/returns → createdAt (when the record was made)
    //   inTransit  → dispatchedAt (when the rider left)
    //   delivered  → deliveredAt (when it was delivered)
    const intakeDwell    = computeAvgDwellMinutes(intakeInbounds,    'createdAt',    now)
    const sortDwell      = computeAvgDwellMinutes(sortRecords,       'createdAt',    now)
    const stageDwell     = computeAvgDwellMinutes(stageRecords,      'createdAt',    now)
    const dispatchDwell  = computeAvgDwellMinutes(dispatchRecords,   'createdAt',    now)
    const inTransitDwell = computeAvgDwellMinutes(inTransitRecords,  'dispatchedAt', now)
    const deliveredDwell = computeAvgDwellMinutes(deliveredRecords,  'deliveredAt',  now)
    const returnsDwell   = computeAvgDwellMinutes(returnRecords,     'createdAt',    now)

    return NextResponse.json({
      date: now.toISOString(),
      stations: {
        intake: {
          count: intakeInbounds.length,
          items: intakeInbounds,
          label: 'Intake',
          description: 'Parcels that arrived today, need put-away',
          action: 'Start Intake',
          targetModule: 'inventory',
          avgDwellMinutes: intakeDwell,
        },
        sort: {
          count: sortRecords.length,
          items: sortRecords,
          label: 'Sort & Pack',
          description: 'Parcels being picked or packed',
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
          description: 'Successfully delivered today',
          action: 'View Proof of Delivery',
          targetModule: 'outbound',
          avgDwellMinutes: deliveredDwell,
        },
        returns: {
          count: returnRecords.length,
          items: returnRecords,
          label: 'Returns',
          description: 'Customer returns received today',
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
      },
      dayClose: {
        canClose: canCloseDay,
        unaccountedParcels,
        pendingBankingsCount: pendingBankings.length,
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
