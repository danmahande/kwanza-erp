// Quick sanity check: compute valuation for a sample product using the engine
// Run with: npx tsx scripts/check-valuation.ts
import { db } from '../src/lib/db'
import {
  computeProductValuation,
  holdingCostBreakdown,
  abcClassify,
  DEFAULT_SETTINGS,
} from '../src/lib/inventory-valuation'

async function main() {
  const products = await db.product.findMany({ where: { isActive: true }, take: 5 })
  console.log(`Found ${products.length} active products`)

  const settings = DEFAULT_SETTINGS

  for (const p of products) {
    const inbounds = await db.inboundRecord.findMany({
      where: { productId: p.productId },
      select: { id: true, qtyIn: true, unitPrice: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const outbound = await db.outboundRecord.aggregate({
      where: { productId: p.productId },
      _sum: { qty: true },
    })
    const consumption = outbound._sum.qty ?? 0
    const v = computeProductValuation({
      p,
      inbounds,
      outboundQty: consumption,
      shrinkageQty: 0,
      deliveredQty: 0,
      cogsTrailing: 0,
      nrvRegister: [],
      settings,
      abcClass: 'A',
    })
    console.log(`\n── ${p.productLabel} (${p.productId}) ──`)
    console.log(`  Stock: ${v.currentStock}, Method: ${v.costingMethod}`)
    console.log(`  FIFO value: ${v.fifoValue}, AVCO: ${v.avcoValue}, Std: ${v.standardValue}`)
    console.log(`  Selected: ${v.selectedValue}, NRV/unit: ${v.nrvPerUnit}, Carry: ${v.carryingValue}`)
    console.log(`  Write-down required? ${v.writeDownRequired}, amount: ${v.writeDownTotal}`)
    console.log(`  Layers: ${v.layers.length}, EOQ: ${v.eoq}, ROP: ${v.reorderPoint}`)
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
