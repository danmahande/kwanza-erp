const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const result = await prisma.$queryRawUnsafe(`SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name`)
  console.log('All indexes in DB:')
  let last = ''
  for (const r of result) {
    if (r.tbl_name !== last) { console.log(`\n${r.tbl_name}:`); last = r.tbl_name }
    console.log(`  ${r.name}`)
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
