/**
 * Backfill InventoryItems for existing InboundRecords
 *
 * One-time migration script. The old inbound POST handler called /api/items
 * via internal HTTP fetch which silently failed (NEXT_PUBLIC_BASE_URL unset),
 * so no InventoryItem rows were created for inbound records made before the fix.
 *
 * This script reads all InboundRecords and creates InventoryItem + ItemEvent
 * rows for each, retroactively. Safe to run multiple times — checks for
 * existing items per inbound before creating.
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-inventory-items.ts
 */

import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  console.log('Backfilling InventoryItems for existing InboundRecords...\n')

  const inbounds = await db.inboundRecord.findMany({
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${inbounds.length} inbound records\n`)

  let totalCreated = 0
  let skipped = 0

  for (const inbound of inbounds) {
    // Check if items already exist for this inbound
    const existingCount = await db.inventoryItem.count({
      where: { inboundId: inbound.inboundId },
    })

    if (existingCount > 0) {
      console.log(`  SKIP ${inbound.inboundId}: ${existingCount} items already exist`)
      skipped++
      continue
    }

    const qty = inbound.qtyIn || 0
    if (qty === 0) {
      console.log(`  SKIP ${inbound.inboundId}: qtyIn is 0`)
      skipped++
      continue
    }

    console.log(`  Creating ${qty} items for ${inbound.inboundId} (${inbound.productName})...`)

    for (let i = 0; i < qty; i++) {
      const now = Date.now()
      const suffix = String(now).slice(-6) + String(Math.random()).slice(2, 5) + String(i).slice(-2)
      const itemIdVal = `ITM-${suffix}`

      await db.inventoryItem.create({
        data: {
          itemId: itemIdVal,
          productId: inbound.productId,
          productName: inbound.productName,
          brand: inbound.brand || null,
          variant: inbound.variant || null,
          unitPrice: inbound.unitPrice,
          merchantId: inbound.merchantId || '',
          merchantName: inbound.merchantName || '',
          inboundId: inbound.inboundId,
          storageLocation: inbound.storageLocation || null,
          expiryDate: inbound.expiryDate || null,
          trackingLevel: 'unit',
          status: 'IN_WAREHOUSE',
        },
      })

      await db.itemEvent.create({
        data: {
          eventId: `EVT-${now}-${suffix}`,
          itemId: itemIdVal,
          eventType: 'RECEIVED',
          description: `Item received into warehouse (backfilled)${inbound.storageLocation ? ` at ${inbound.storageLocation}` : ''}`,
          performedBy: 'backfill-script',
          inboundId: inbound.inboundId,
          previousStatus: null,
          newStatus: 'IN_WAREHOUSE',
        },
      })
      totalCreated++
    }

    console.log(`    ✓ Created ${qty} items`)
  }

  console.log(`\nDone! Created ${totalCreated} InventoryItems. Skipped ${skipped} inbound records.`)
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
