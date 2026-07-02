import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * COD Reconciliation API — Workflow 2
 *
 * Returns the rollup of COD collected vs banked, by driver or by runsheet.
 * This is the cashier's daily view: "which drivers still owe us cash, and how much?"
 *
 * GET /api/cod-reconciliation                  → all drivers with outstanding COD
 * GET /api/cod-reconciliation?driverId=D001    → one driver's COD position
 * GET /api/cod-reconciliation?view=runsheet    → by runsheet instead of by driver
 */

export async function GET(req: NextRequest) {
  try {
    const view = req.nextUrl.searchParams.get('view') || 'driver'
    const driverId = req.nextUrl.searchParams.get('driverId')

    if (view === 'runsheet') {
      // Per-runsheet reconciliation
      const runsheets = await db.outboundRecord.findMany({
        where: { runsheetId: { not: null } },
        select: {
          runsheetId: true,
          assignedDriver: true,
          codCollected: true,
          saleAmount: true,
          status: true,
        },
      })

      // Group by runsheetId
      const runsheetMap = new Map<string, {
        runsheetId: string
        driverName: string | null
        codCollected: number
        salesValue: number
        ordersDelivered: number
        ordersTotal: number
      }>()

      for (const r of runsheets) {
        if (!r.runsheetId) continue
        const existing = runsheetMap.get(r.runsheetId) || {
          runsheetId: r.runsheetId,
          driverName: r.assignedDriver || null,
          codCollected: 0,
          salesValue: 0,
          ordersDelivered: 0,
          ordersTotal: 0,
        }
        existing.codCollected += r.codCollected ?? 0
        existing.salesValue += r.saleAmount ?? 0
        existing.ordersTotal += 1
        if (r.status === 'delivered') existing.ordersDelivered += 1
        runsheetMap.set(r.runsheetId, existing)
      }

      // Fetch banked amounts per runsheet
      const bankings = await db.driverBanking.groupBy({
        by: ['runsheetId'],
        _sum: { amount: true },
      })
      const bankedMap = new Map(bankings.map(b => [b.runsheetId, b._sum.amount ?? 0]))

      const result = Array.from(runsheetMap.values()).map(r => {
        const banked = bankedMap.get(r.runsheetId) ?? 0
        return {
          ...r,
          codBanked: banked,
          shortfall: Math.max(0, r.codCollected - banked),
          surplus: Math.max(0, banked - r.codCollected),
        }
      })

      return NextResponse.json({
        view: 'runsheet',
        runsheets: result,
        totals: {
          codCollected: result.reduce((s, r) => s + r.codCollected, 0),
          codBanked: result.reduce((s, r) => s + r.codBanked, 0),
          shortfall: result.reduce((s, r) => s + r.shortfall, 0),
        },
      })
    }

    // Default: per-driver reconciliation
    const drivers = await db.driver.findMany({
      where: driverId ? { driverId } : undefined,
      select: {
        driverId: true,
        name: true,
        phone: true,
        expectedBankings: true,
        banked: true,
        damages: true,
        loss: true,
      },
    })

    // For each driver, compute current outstanding COD (collected - banked)
    const driverResults = await Promise.all(drivers.map(async (d) => {
      // COD collected from delivered orders
      const collectedAgg = await db.outboundRecord.aggregate({
        where: { assignedDriver: d.driverId, status: 'delivered' },
        _sum: { codCollected: true },
      })
      const codCollected = collectedAgg._sum.codCollected ?? 0

      // Total banked (sum of all verified + pending bankings)
      const bankedAgg = await db.driverBanking.aggregate({
        where: { driverId: d.driverId },
        _sum: { amount: true },
      })
      const codBanked = bankedAgg._sum.amount ?? 0

      // Pending bankings (not yet verified)
      const pendingBankings = await db.driverBanking.findMany({
        where: { driverId: d.driverId, status: 'pending' },
        select: { bankingId: true, amount: true, bankedAt: true },
      })

      // Shortfall bankings
      const shortfallBankings = await db.driverBanking.findMany({
        where: { driverId: d.driverId, status: 'shortfall' },
        select: { bankingId: true, amount: true, shortfallAmount: true, bankedAt: true },
      })

      return {
        driverId: d.driverId,
        driverName: d.name,
        phone: d.phone,
        codCollected,
        codBanked,
        outstanding: Math.max(0, codCollected - codBanked),
        damages: d.damages,
        loss: d.loss,
        pendingBankingsCount: pendingBankings.length,
        pendingBankingsAmount: pendingBankings.reduce((s, b) => s + b.amount, 0),
        shortfallBankingsCount: shortfallBankings.length,
        shortfallBankingsAmount: shortfallBankings.reduce((s, b) => s + b.shortfallAmount, 0),
      }
    }))

    return NextResponse.json({
      view: 'driver',
      drivers: driverResults,
      totals: {
        codCollected: driverResults.reduce((s, d) => s + d.codCollected, 0),
        codBanked: driverResults.reduce((s, d) => s + d.codBanked, 0),
        outstanding: driverResults.reduce((s, d) => s + d.outstanding, 0),
        shortfallBankingsAmount: driverResults.reduce((s, d) => s + d.shortfallBankingsAmount, 0),
      },
    })
  } catch (error) {
    console.error('Error fetching COD reconciliation:', error)
    return NextResponse.json({ error: 'Failed to fetch COD reconciliation' }, { status: 500 })
  }
}
