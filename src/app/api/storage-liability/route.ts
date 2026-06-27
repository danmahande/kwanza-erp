import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runDailyStorageAccrual } from '@/lib/storage-liability'

/**
 * Storage Liability API
 *
 * GET  /api/storage-liability?merchantId=MCH-0001   → list liabilities (optionally filtered)
 * POST /api/storage-liability?action=accrue          → run daily accrual pass (cron-friendly)
 */
export async function GET(req: NextRequest) {
  try {
    const merchantId = req.nextUrl.searchParams.get('merchantId')
    const status = req.nextUrl.searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId
    if (status) where.status = status

    const liabilities = await db.storageLiability.findMany({
      where,
      orderBy: { accrualStart: 'desc' },
      take: 500,
    })

    // Compute summary totals
    const totals = liabilities.reduce(
      (acc, l) => {
        acc.accruedTotal += l.accruedAmount
        acc.settledTotal += l.settledAmount
        acc.unitsRemaining += l.unitsRemaining
        return acc
      },
      { accruedTotal: 0, settledTotal: 0, unitsRemaining: 0 },
    )

    return NextResponse.json({
      liabilities,
      totals: {
        ...totals,
        outstandingBalance: totals.accruedTotal - totals.settledTotal,
      },
    })
  } catch (error) {
    console.error('Error fetching storage liabilities:', error)
    return NextResponse.json({ error: 'Failed to fetch storage liabilities' }, { status: 500 })
  }
}

/**
 * POST /api/storage-liability?action=accrue
 * Runs the daily accrual pass. Designed to be called by a cron job at midnight EAT.
 * Also callable manually by an admin from the UI.
 */
export async function POST(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'accrue') {
      return NextResponse.json({ error: 'Unknown action. Use ?action=accrue' }, { status: 400 })
    }

    const result = await runDailyStorageAccrual()

    return NextResponse.json({
      success: true,
      message: `Accrual complete. Charged ${result.totalAccrued} UGX across ${result.updated} liabilities for ${result.merchantCount} merchants.`,
      ...result,
    })
  } catch (error) {
    console.error('Error running storage accrual:', error)
    return NextResponse.json({ error: 'Failed to run accrual' }, { status: 500 })
  }
}
