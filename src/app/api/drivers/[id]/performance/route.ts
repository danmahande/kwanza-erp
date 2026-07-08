import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

// GET /api/drivers/[id]/performance?days=30
// Computes per-driver delivery performance metrics from existing data.
// Parity with /api/merchants/[id]/performance.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const { id } = await params
    const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // [id] is the CUID — look up driverId (e.g. DRV-001) from the row
    const driver = await db.driver.findUnique({ where: { id }, select: { driverId: true, name: true, vehicleType: true, vehicleNumber: true } })
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    const did = driver.driverId

    // All outbound records assigned to this driver in the window
    const outbounds = await db.outboundRecord.findMany({
      where: { assignedDriver: did, createdAt: { gte: since } },
      select: {
        status: true,
        createdAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        codCollected: true,
        saleAmount: true,
        actualDeliveredQty: true,
        qty: true,
        deliveryAttempts: true,
        cancellationReason: true,
        deliveryNotes: true,
        runsheetId: true,
      },
    })

    const totalOrders = outbounds.length
    const delivered = outbounds.filter(o => o.status === 'delivered').length
    const cancelled = outbounds.filter(o => o.status === 'cancelled' || o.cancellationReason).length
    const failed = outbounds.filter(o => ['failed', 'returned', 'rejected'].includes(o.status)).length
    const inTransit = outbounds.filter(o => ['pending', 'dispatched', 'processing'].includes(o.status)).length
    const firstAttemptSuccess = outbounds.filter(o => o.status === 'delivered' && (o.deliveryAttempts || 1) === 1).length

    // Cycle time = deliveredAt - dispatchedAt (in hours), only for delivered
    const cycleTimes = outbounds
      .filter(o => o.deliveredAt && o.dispatchedAt)
      .map(o => (new Date(o.deliveredAt!).getTime() - new Date(o.dispatchedAt!).getTime()) / (1000 * 60 * 60))
    const avgCycleHours = cycleTimes.length > 0 ? cycleTimes.reduce((s, t) => s + t, 0) / cycleTimes.length : 0

    // COD collection
    const totalSale = outbounds.reduce((s, o) => s + (o.saleAmount || 0), 0)
    const totalCod = outbounds.reduce((s, o) => s + (o.codCollected || 0), 0)
    const codRate = totalSale > 0 ? (totalCod / totalSale) * 100 : 0

    // Driver banking in window
    const bankings = await db.driverBanking.findMany({
      where: { driverId: did, bankedAt: { gte: since } },
      select: { amount: true, shortfallAmount: true, status: true },
    })
    const bankedCount = bankings.length
    const bankedAmount = bankings.reduce((s, b) => s + b.amount, 0)
    const totalShortfall = bankings.reduce((s, b) => s + (b.shortfallAmount || 0), 0)
    const verifiedBankings = bankings.filter(b => b.status === 'verified').length
    const pendingBankings = bankings.filter(b => b.status === 'pending').length
    const bankingRate = bankedCount > 0 ? (verifiedBankings / bankedCount) * 100 : 0

    // Trips in window
    const trips = await db.driverTrip.findMany({
      where: { driverId: did, tripDate: { gte: since } },
      select: { totalStops: true, delivered: true, failed: true, codCollected: true, saleAmount: true, distanceKm: true },
    })
    const totalTrips = trips.length
    const totalDistance = trips.reduce((s, t) => s + (t.distanceKm || 0), 0)

    // Damages/loss (driver-level cumulative fields on Driver row)
    const driverRow = await db.driver.findUnique({ where: { id }, select: { damages: true, loss: true, expectedBankings: true, banked: true } })

    const successRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0
    const firstAttemptRate = delivered > 0 ? (firstAttemptSuccess / delivered) * 100 : 0
    const cancellationRate = totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0
    const failureRate = totalOrders > 0 ? (failed / totalOrders) * 100 : 0
    const riskPercent = driverRow ? ((driverRow.damages + driverRow.loss) / Math.max(driverRow.expectedBankings || 1, 1)) * 100 : 0

    // 7-day sparkline data for delivery volume
    const sparkDays = 7
    const sparkSince = new Date(Date.now() - sparkDays * 24 * 60 * 60 * 1000)
    const recentOutbounds = await db.outboundRecord.findMany({
      where: { assignedDriver: did, createdAt: { gte: sparkSince } },
      select: { createdAt: true, status: true },
    })
    const spark = []
    for (let i = sparkDays - 1; i >= 0; i--) {
      const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dayOrders = recentOutbounds.filter(o => new Date(o.createdAt) >= dayStart && new Date(o.createdAt) < dayEnd)
      spark.push({
        date: dayStart.toISOString().slice(5, 10),
        total: dayOrders.length,
        delivered: dayOrders.filter(o => o.status === 'delivered').length,
      })
    }

    return NextResponse.json({
      driverId: did,
      driverName: driver.name,
      vehicle: { type: driver.vehicleType, number: driver.vehicleNumber },
      window: { days, since: since.toISOString() },
      totals: {
        orders: totalOrders,
        delivered,
        cancelled,
        failed,
        inTransit,
        trips: totalTrips,
        distance: Math.round(totalDistance * 10) / 10,
        bankingsCount: bankedCount,
        bankingsAmount: bankedAmount,
        bankingsVerified: verifiedBankings,
        bankingsPending: pendingBankings,
      },
      rates: {
        successRate: Math.round(successRate * 10) / 10,
        firstAttemptRate: Math.round(firstAttemptRate * 10) / 10,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        failureRate: Math.round(failureRate * 10) / 10,
        codRate: Math.round(codRate * 10) / 10,
        bankingRate: Math.round(bankingRate * 10) / 10,
        riskPercent: Math.round(riskPercent * 10) / 10,
      },
      cycleTime: {
        avgHours: Math.round(avgCycleHours * 10) / 10,
        avgMins: Math.round(avgCycleHours * 60),
        samples: cycleTimes.length,
      },
      cod: {
        totalSale,
        totalCollected: totalCod,
        totalBanked: bankedAmount,
        bankingShortfall: totalShortfall,
        unbanked: (driverRow?.expectedBankings || 0) - (driverRow?.banked || 0),
      },
      damages: {
        damages: driverRow?.damages || 0,
        loss: driverRow?.loss || 0,
        total: (driverRow?.damages || 0) + (driverRow?.loss || 0),
      },
      sparkline: spark,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to compute driver performance', detail: msg }, { status: 500 })
  }
}
