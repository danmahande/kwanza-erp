// Reproduces the portfolio turnover computation from GET /api/inventory-valuation
// line by line, and prints every intermediate sum so the 0.05x figure can be
// audited against the seeded database.
import { PrismaClient } from '@prisma/client'
import { buildFifoLayers, fifoValue, fifoIssueCost } from '../src/lib/inventory-valuation'

const db = new PrismaClient()
const UGX = (n: number) => 'UGX ' + Math.round(n).toLocaleString('en-US')

async function main() {
  // ── Settings (route creates the default row on first load) ──
  let settingsRow = await db.inventoryValuationSetting.findUnique({ where: { key: 'default' } })
  if (!settingsRow) settingsRow = await db.inventoryValuationSetting.create({ data: { key: 'default' } })
  console.log('Settings row:', {
    method: settingsRow.defaultCostingMethod,
    daysInYear: settingsRow.daysInYear,
  })

  // ── Load the same tables as the route ──
  const products = await db.product.findMany({ where: { isActive: true }, orderBy: { productLabel: 'asc' } })
  const ids = products.map(p => p.productId)
  const allInbounds = await db.inboundRecord.findMany({
    where: { productId: { in: ids } },
    orderBy: { createdAt: 'asc' },
  })
  const trailingStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const delivered = await db.outboundRecord.findMany({
    where: { status: 'delivered', deliveredAt: { gte: trailingStart } },
    select: { productId: true, qty: true, deliveredAt: true },
  })
  const outboundAll = await db.outboundRecord.count()
  const deliveredAll = await db.outboundRecord.count({ where: { status: 'delivered' } })
  console.log(`\nOutbound records in DB: ${outboundAll} total, ${deliveredAll} delivered, ${delivered.length} delivered within trailing 365d (since ${trailingStart.toISOString().slice(0, 10)})`)

  // ── Group helpers (same as route) ──
  const inboundsByProduct = new Map<string, typeof allInbounds>()
  for (const r of allInbounds) {
    const arr = inboundsByProduct.get(r.productId) || []
    arr.push(r)
    inboundsByProduct.set(r.productId, arr)
  }
  const deliveredByProduct = new Map<string, { qty: number; issues: { qty: number; occurredAt: Date }[] }>()
  for (const r of delivered) {
    const cur = deliveredByProduct.get(r.productId) || { qty: 0, issues: [] }
    cur.qty += r.qty
    if (r.deliveredAt) cur.issues.push({ qty: r.qty, occurredAt: r.deliveredAt })
    deliveredByProduct.set(r.productId, cur)
  }

  // ── Per-product: closing FIFO value + delivered COGS ──
  let totalInventoryAtCost = 0
  let cogsTotal = 0
  console.log('\n── Delivered cost (COGS) per product, trailing 365d ──')
  for (const p of products) {
    const inbounds = inboundsByProduct.get(p.productId) || []
    const totalInbound = inbounds.reduce((s, r) => s + r.qtyIn, 0)
    const consumption = Math.max(0, totalInbound - p.currentStock)
    const layers = buildFifoLayers({
      inbounds: inbounds.map(r => ({ id: r.id, qtyIn: r.qtyIn, unitPrice: r.unitPrice, createdAt: r.createdAt })),
      outboundQty: consumption,
    })
    const selectedValue = fifoValue(layers) // default method = fifo
    totalInventoryAtCost += selectedValue

    const d = deliveredByProduct.get(p.productId)
    if (d) {
      const cogs = fifoIssueCost({
        inbounds: inbounds.map(r => ({ id: r.id, qtyIn: r.qtyIn, unitPrice: r.unitPrice, createdAt: r.createdAt })),
        issues: d.issues,
      })
      cogsTotal += cogs
      if (cogs > 0) {
        console.log(`  ${p.productId} ${p.productLabel.padEnd(34)} ${String(d.qty).padStart(4)} units delivered × FIFO layers = ${UGX(cogs)}`)
      }
    }
  }

  // ── The division the tab displays ──
  const avgInvValue = totalInventoryAtCost / 2 // (0 + closing) / 2 — no opening snapshot
  const turnover = avgInvValue > 0 ? cogsTotal / avgInvValue : 0
  const dio = turnover > 0 ? settingsRow.daysInYear / turnover : 0

  console.log('\n── Portfolio turnover = COGS ÷ average inventory ──')
  console.log(`  Sum A · closing inventory at cost (FIFO, all ${products.length} products) = ${UGX(totalInventoryAtCost)}`)
  console.log(`  Average inventory = (0 + closing) ÷ 2                        = ${UGX(avgInvValue)}   ← approximation: no opening snapshot`)
  console.log(`  Sum B · COGS trailing 365d (delivered, FIFO cost)            = ${UGX(cogsTotal)}`)
  console.log(`  Turnover = B ÷ A = ${UGX(cogsTotal)} ÷ ${UGX(avgInvValue)} = ${turnover.toFixed(4)}×`)
  console.log(`  Days of Supply = 365 ÷ ${turnover.toFixed(4)} = ${Math.round(dio).toLocaleString('en-US')} days`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
