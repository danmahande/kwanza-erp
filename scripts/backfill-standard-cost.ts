/**
 * Backfill standardCost from unitCost for existing products.
 *
 * Per ACCA MDC, the Standard Cost is the benchmark against which actual costs are
 * compared for variance analysis. New products default standardCost = unitCost
 * when first set; existing products need a one-time backfill so variance
 * calculations have a baseline.
 *
 * Run with: npx tsx scripts/backfill-standard-cost.ts
 */
import { db } from '../src/lib/db'

async function main() {
  const result = await db.product.updateMany({
    where: { standardCost: null },
    data: { standardCost: undefined }, // no-op — we need raw SQL for "set to unitCost"
  })
  console.log(`Matched (won't update via Prisma — needs raw SQL): ${result.count}`)

  // SQLite raw query: copy unitCost into standardCost where standardCost IS NULL
  // Prisma's updateMany doesn't support column-to-column copy, so use $executeRaw
  const updated = await db.$executeRawUnsafe(
    `UPDATE Product SET standardCost = unitCost WHERE standardCost IS NULL`,
  )
  console.log(`Backfilled standardCost for ${updated} products`)

  // Verify
  const stillNull = await db.product.count({ where: { standardCost: null } })
  console.log(`Products with standardCost still null: ${stillNull}`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
