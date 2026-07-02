import { db } from '@/lib/db'

/**
 * Workflow 1 helpers: Storage Liability
 *
 * Storage Liability is the running total a merchant owes us for keeping their stock
 * on our shelves. It accrues per-unit, per-day, from the day AFTER inbound until
 * the day the unit leaves (outbound, RTV, or disposal).
 *
 * Key design choices:
 * - One StorageLiability row per inbound batch (not per unit) to keep the table small.
 * - The per-unit-per-day rate is FROZEN at inbound time — even if the rate card
 *   changes next month, the stock already on the shelf keeps the rate it arrived with.
 * - unitsRemaining decrements as units are outbound/disposed; when it hits 0, the
 *   liability is fully settled and the row is marked "settled".
 */

/**
 * Get the active rate card for a merchant. Falls back to a zero-rate card if none exists,
 * which means storage is free until a rate card is configured.
 */
export async function getActiveRateCard(merchantId: string) {
  const card = await db.merchantRateCard.findFirst({
    where: { merchantId, isActive: true },
    orderBy: { validFrom: 'desc' },
  })
  return card
}

/**
 * Create a StorageLiability row when stock is inbounded.
 * Called from /api/inbound POST handler.
 */
export async function createStorageLiabilityOnInbound(params: {
  merchantId: string
  merchantName: string
  inboundId: string
  productId: string
  productName: string
  qtyIn: number
  inboundDate: Date
}) {
  const { merchantId, merchantName, inboundId, productId, productName, qtyIn, inboundDate } = params

  if (qtyIn <= 0) return null

  // Look up the active rate card to freeze the per-unit-per-day rate
  const rateCard = await getActiveRateCard(merchantId)
  const ratePerUnitPerDay = rateCard?.storagePerUnitPerDay ?? 0

  // Accrual starts the day AFTER inbound (the day the stock starts occupying space)
  const accrualStart = new Date(inboundDate)
  accrualStart.setDate(accrualStart.getDate() + 1)
  accrualStart.setHours(0, 0, 0, 0)

  const liability = await db.storageLiability.create({
    data: {
      merchantId,
      merchantName,
      inboundId,
      productId,
      productName,
      unitsRemaining: qtyIn,
      ratePerUnitPerDay,
      accrualStart,
      accrualThrough: accrualStart, // no accrual run yet — will be updated by cron
      accruedAmount: 0,
      settledAmount: 0,
      status: 'active',
    },
  })

  return liability
}

/**
 * Run a daily accrual pass: for every active StorageLiability, compute the storage
 * fee for the days since the last accrual run and add it to accruedAmount.
 *
 * This is idempotent — calling it twice in the same day doesn't double-charge
 * because accrualThrough is advanced to "today" each time.
 *
 * Designed to be called by a daily cron job (e.g. Vercel Cron at midnight EAT).
 */
export async function runDailyStorageAccrual(asOfDate: Date = new Date()) {
  const today = new Date(asOfDate)
  today.setHours(0, 0, 0, 0)

  const activeLiabilities = await db.storageLiability.findMany({
    where: { status: { in: ['active', 'partially_settled'] } },
  })

  let totalAccrued = 0
  let updated = 0

  for (const liability of activeLiabilities) {
    if (liability.unitsRemaining <= 0) continue

    const lastAccrual = liability.accrualThrough
      ? new Date(liability.accrualThrough)
      : new Date(liability.accrualStart)
    lastAccrual.setHours(0, 0, 0, 0)

    // Days between last accrual and today (exclusive of last accrual day, inclusive of today)
    const msPerDay = 24 * 60 * 60 * 1000
    const daysToCharge = Math.floor((today.getTime() - lastAccrual.getTime()) / msPerDay)

    if (daysToCharge <= 0) continue

    const charge = liability.unitsRemaining * liability.ratePerUnitPerDay * daysToCharge
    const newAccrued = liability.accruedAmount + charge

    await db.storageLiability.update({
      where: { id: liability.id },
      data: {
        accruedAmount: newAccrued,
        accrualThrough: today,
      },
    })

    totalAccrued += charge
    updated += 1
  }

  // Update each merchant's storageLiabilityBalance in bulk
  const merchantIds = Array.from(new Set(activeLiabilities.map(l => l.merchantId)))
  for (const merchantId of merchantIds) {
    const sum = await db.storageLiability.aggregate({
      where: { merchantId, status: { in: ['active', 'partially_settled'] } },
      _sum: { accruedAmount: true },
    })
    const settledSum = await db.storageLiability.aggregate({
      where: { merchantId, status: { in: ['active', 'partially_settled'] } },
      _sum: { settledAmount: true },
    })
    const balance = (sum._sum.accruedAmount ?? 0) - (settledSum._sum.settledAmount ?? 0)
    await db.merchant.updateMany({
      where: { merchantId },
      data: { storageLiabilityBalance: balance },
    })
  }

  return { totalAccrued, updated, merchantCount: merchantIds.length }
}

/**
 * Decrement unitsRemaining when stock leaves the warehouse (outbound, RTV, disposal).
 * Called from outbound/RTV/shrinkage handlers.
 *
 * Tries to consume the oldest active liabilities first (FIFO), so storage fees
 * for older stock are "closed out" before newer stock.
 */
export async function decrementStorageLiability(params: {
  merchantId: string
  productId: string
  qtyToRemove: number
}) {
  const { merchantId, productId, qtyToRemove } = params
  if (qtyToRemove <= 0) return { removed: 0, liabilitiesTouched: 0 }

  // FIFO: oldest accrualStart first
  const liabilities = await db.storageLiability.findMany({
    where: {
      merchantId,
      productId,
      unitsRemaining: { gt: 0 },
      status: { in: ['active', 'partially_settled'] },
    },
    orderBy: { accrualStart: 'asc' },
  })

  let remaining = qtyToRemove
  let touched = 0

  for (const liability of liabilities) {
    if (remaining <= 0) break
    const take = Math.min(liability.unitsRemaining, remaining)
    const newRemaining = liability.unitsRemaining - take
    await db.storageLiability.update({
      where: { id: liability.id },
      data: {
        unitsRemaining: newRemaining,
        status: newRemaining === 0 ? 'settled' : 'partially_settled',
      },
    })
    remaining -= take
    touched += 1
  }

  return { removed: qtyToRemove - remaining, liabilitiesTouched: touched }
}
