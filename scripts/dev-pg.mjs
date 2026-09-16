// Embedded Postgres for local verification (same recipe as previous sessions).
// Runs on :5432, user/pass kwanza/kwanza, db kwanza_erp. Fresh datadir expected.
import EmbeddedPostgres from 'embedded-postgres'

const DATA_DIR = '/home/z/my-project/pgdata-kwanza'

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'kwanza',
  password: 'kwanza',
  port: 5432,
  persistent: false,
})

await pg.initialise()
await pg.start()
try {
  await pg.createDatabase('kwanza_erp')
} catch (e) {
  // already exists on a warm datadir — fine
}
console.log('PG_READY')

const shutdown = async () => {
  try { await pg.stop() } catch {}
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
// keep the event loop alive
setInterval(() => {}, 1 << 30)
