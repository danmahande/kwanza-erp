import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
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

/**
 * POST /api/cod-reconciliation — write off a driver's COD shortfall
 *
 * When a driver has a shortfall (collected cash but didn't bank it all),
 * the cashier can "write off" the shortfall. This:
 * 1. Moves the shortfall from `driver.damages` to `driver.loss` (written off, not recoverable)
 * 2. Marks all shortfall bankings for this driver as "verified" (closed out)
 * 3. Records the event in the audit log with the full amount + reason
 *
 * The banking records are NOT deleted — they stay for auditing. Only their
 * status changes from "shortfall" to "verified" so they stop appearing as
 * outstanding.
 *
 * Body: { driverId, reason, writtenOffBy }
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { driverId, reason, writtenOffBy } = body

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'reason is required (why is this shortfall being written off?)' }, { status: 400 })
    }

    const driver = await db.driver.findUnique({
      where: { driverId },
      select: { name: true, damages: true, loss: true },
    })
    if (!driver) {
      return NextResponse.json({
        error: `Driver "${driverId}" does not exist`,
        code: 'DRIVER_NOT_FOUND',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — write off shortfall + close shortfall bankings
    // ═══════════════════════════════════════════════════════════════

    const performer = writtenOffBy || _user.name

    const result = await db.$transaction(async (tx) => {
      // Find all shortfall bankings for this driver
      const shortfallBankings = await tx.driverBanking.findMany({
        where: { driverId, status: 'shortfall' },
        select: { id: true, bankingId: true, shortfallAmount: true },
      })

      const totalShortfall = shortfallBankings.reduce((s, b) => s + (b.shortfallAmount || 0), 0)

      if (totalShortfall === 0) {
        throw new Error('NO_SHORTFALL: Driver has no outstanding shortfall to write off')
      }

      // Mark all shortfall bankings as "verified" (closed out — written off)
      // The records stay for auditing but stop appearing as outstanding
      await tx.driverBanking.updateMany({
        where: { driverId, status: 'shortfall' },
        data: {
          status: 'verified',
          notes: `SHORTFALL WRITTEN OFF by ${performer}: ${reason}`,
        },
      })

      // Move the shortfall from driver.damages to driver.loss
      // damages = recoverable (driver can still pay it back)
      // loss = written off (company absorbs it)
      await tx.driver.update({
        where: { driverId },
        data: {
          damages: { decrement: totalShortfall },
          loss: { increment: totalShortfall },
        },
      })

      return { totalShortfall, bankingsClosed: shortfallBankings.length }
    })

    await logAudit({
      action: 'COD_SHORTFALL_WRITTEN_OFF',
      module: 'driver_banking',
      entityId: driverId,
      details: `Wrote off ${result.totalShortfall} COD shortfall for driver ${driver.name}. ${result.bankingsClosed} banking(s) closed. Reason: ${reason}. Moved from damages → loss. Banking records retained for audit.`,
    })

    return NextResponse.json({
      success: true,
      driverId,
      driverName: driver.name,
      totalShortfallWrittenOff: result.totalShortfall,
      bankingsClosed: result.bankingsClosed,
      message: `Wrote off ${result.totalShortfall} for driver ${driver.name}. ${result.bankingsClosed} banking(s) closed. Banking records retained for audit.`,
    })
  } catch (error) {
    console.error('Error writing off COD shortfall:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    if (msg.startsWith('NO_SHORTFALL')) {
      return NextResponse.json({ error: 'Driver has no outstanding shortfall to write off' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to write off shortfall', detail: msg }, { status: 500 })
  }
}
