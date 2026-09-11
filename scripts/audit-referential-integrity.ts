import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ log: ['error'] })

type Check = {
  name: string
  sql: string
}

const checks: Check[] = [
  {
    name: 'Product -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "Product" p LEFT JOIN "Merchant" m ON m."merchantId" = p."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'InboundRecord -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "InboundRecord" i LEFT JOIN "Merchant" m ON m."merchantId" = i."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'InboundRecord -> Product',
    sql: `SELECT COUNT(*)::int AS count FROM "InboundRecord" i LEFT JOIN "Product" p ON p."productId" = i."productId" WHERE p."productId" IS NULL`,
  },
  {
    name: 'OutboundRecord -> Product',
    sql: `SELECT COUNT(*)::int AS count FROM "OutboundRecord" o LEFT JOIN "Product" p ON p."productId" = o."productId" WHERE p."productId" IS NULL`,
  },
  {
    name: 'InventoryItem -> Product',
    sql: `SELECT COUNT(*)::int AS count FROM "InventoryItem" i LEFT JOIN "Product" p ON p."productId" = i."productId" WHERE p."productId" IS NULL`,
  },
  {
    name: 'InventoryItem -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "InventoryItem" i LEFT JOIN "Merchant" m ON m."merchantId" = i."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'InventoryItem -> InboundRecord',
    sql: `SELECT COUNT(*)::int AS count FROM "InventoryItem" i LEFT JOIN "InboundRecord" b ON b."inboundId" = i."inboundId" WHERE i."inboundId" IS NOT NULL AND b."inboundId" IS NULL`,
  },
  {
    name: 'ItemEvent -> InventoryItem',
    sql: `SELECT COUNT(*)::int AS count FROM "ItemEvent" e LEFT JOIN "InventoryItem" i ON i."itemId" = e."itemId" WHERE i."itemId" IS NULL`,
  },
  {
    name: 'MerchantStatement -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "MerchantStatement" s LEFT JOIN "Merchant" m ON m."merchantId" = s."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'MerchantPayment -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "MerchantPayment" p LEFT JOIN "Merchant" m ON m."merchantId" = p."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'Charge -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "Charge" c LEFT JOIN "Merchant" m ON m."merchantId" = c."merchantId" WHERE m."merchantId" IS NULL`,
  },
  {
    name: 'DriverShift -> Driver',
    sql: `SELECT COUNT(*)::int AS count FROM "DriverShift" s LEFT JOIN "Driver" d ON d."driverId" = s."driverId" WHERE d."driverId" IS NULL`,
  },
  {
    name: 'DriverTrip -> Driver',
    sql: `SELECT COUNT(*)::int AS count FROM "DriverTrip" t LEFT JOIN "Driver" d ON d."driverId" = t."driverId" WHERE d."driverId" IS NULL`,
  },
  {
    name: 'DriverBanking -> Driver',
    sql: `SELECT COUNT(*)::int AS count FROM "DriverBanking" b LEFT JOIN "Driver" d ON d."driverId" = b."driverId" WHERE d."driverId" IS NULL`,
  },
  {
    name: 'MerchantRateCard -> Merchant',
    sql: `SELECT COUNT(*)::int AS count FROM "MerchantRateCard" r LEFT JOIN "Merchant" m ON m."merchantId" = r."merchantId" WHERE m."merchantId" IS NULL`,
  },
]

async function main() {
  let failures = 0
  console.log('REFERENTIAL-INTEGRITY AUDIT (read-only)')
  console.log(`Checking ${checks.length} relationships; row contents are not displayed.`)

  for (const check of checks) {
    try {
      const result = await db.$queryRawUnsafe<Array<{ count: number }>>(check.sql)
      const count = Number(result[0]?.count ?? 0)
      if (count === 0) {
        console.log(`  PASS  ${check.name}`)
      } else {
        failures++
        console.log(`  FAIL  ${check.name}: ${count} orphaned rows`)
      }
    } catch (error) {
      failures++
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  ERROR ${check.name}: ${message}`)
    }
  }

  console.log(failures === 0 ? 'AUDIT PASSED' : `AUDIT FAILED: ${failures} checks need attention`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('FATAL: referential-integrity audit could not complete')
  await db.$disconnect().catch(() => {})
  process.exit(1)
})
