import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runDailyStorageAccrual } from '@/lib/storage-liability'

/**
 * D: Daily storage accrual cron endpoint.
 *
 * Call this endpoint once per day (e.g. at midnight) to accrue storage fees
 * for all merchants' stock sitting in the warehouse.
 *
 * Set up a cron job (e.g. Vercel Cron, Ubuntu crontab, or external service):
 *   0 0 * * * curl -X POST https://your-domain.com/api/cron/accrue-storage
 *
 * The endpoint requires a secret header to prevent unauthorized calls:
 *   Header: x-cron-secret: <your-secret>
 *   Set CRON_SECRET in .env
 *
 * Alternatively, you can call it manually from the admin panel.
 */
export async function POST(req: NextRequest) {
  try {
    // Check cron secret if configured
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = req.headers.get('x-cron-secret')
      if (provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const result = await runDailyStorageAccrual()

    // Log to audit
    await db.auditLog.create({
      data: {
        action: 'CRON_ACCRUE',
        module: 'storage-liability',
        entityId: 'daily-accrual',
        details: `Daily storage accrual: ${result.updated} liabilities updated, UGX ${result.totalAccrued.toLocaleString()} accrued across ${result.merchantCount} merchants`,
      },
    })

    return NextResponse.json({
      success: true,
      liabilitiesUpdated: result.updated,
      totalAccrued: result.totalAccrued,
      merchantsAffected: result.merchantCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Storage accrual cron failed:', error)
    return NextResponse.json({ error: 'Failed to accrue storage' }, { status: 500 })
  }
}
