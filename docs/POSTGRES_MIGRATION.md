# SQLite → PostgreSQL Migration Guide

This guide walks you through migrating Kwanza ERP from SQLite to PostgreSQL.
The migration is a one-time operation — once complete, all future development
runs against Postgres.

## Why this migration

SQLite is single-writer — only one write can happen at a time, across the
entire database. Concurrent dashboard polling (every 30s), driver status
updates, and statement generation were starting to contend. PostgreSQL
supports hundreds of concurrent writers, row-level locking, and proper
aggregations, giving us headroom for 50+ concurrent users and 500k+ orders.

The migration is clean because the Prisma schema uses only portable types
(`String`, `Int`, `Float`, `Boolean`, `DateTime`) — no `@db.` modifiers,
no SQLite-specific column types. **No application code changes are needed.**

---

## Step 1: Provision PostgreSQL

Choose one:

### Option A — Local PostgreSQL (development)
```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER kwanza WITH PASSWORD 'kwanza';"
sudo -u postgres psql -c "CREATE DATABASE kwanza_erp OWNER kwanza;"
```

### Option B — Supabase (free managed Postgres, recommended for production)
1. Sign up at https://supabase.com
2. Create a new project
3. Copy the connection string from Settings → Database
4. Format: `postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres?schema=public`

### Option C — Neon (free serverless Postgres)
1. Sign up at https://neon.tech
2. Create a project
3. Copy the connection string
4. Format: `postgresql://USER:PASSWORD@ep-NAME-REGION.aws.neon.tech/dbname?schema=public`

### Option D — Railway (good for staging)
1. Sign up at https://railway.app
2. New project → PostgreSQL
3. Copy the connection string from the Connect tab

---

## Step 2: Update `.env`

Copy `.env.example` to `.env` and fill in your real values:

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL="postgresql://kwanza:kwanza@localhost:5432/kwanza_erp?schema=public"
OLD_SQLITE_URL="file:/home/z/my-project/db/custom.db"
```

---

## Step 3: Create the schema in Postgres

```bash
npx prisma generate
npx prisma migrate dev --name init_from_sqlite
```

If you get a connection error, double-check your `DATABASE_URL` and that
Postgres is running / accessible from your machine.

---

## Step 4: Migrate the data

```bash
npx tsx scripts/migrate-sqlite-to-postgres.ts
```

Output:
```
MIGRATION — SQLite → PostgreSQL
  Source (SQLite): file:/home/z/my-project/db/custom.db
  Target (Postgres): postgresql://kwanza:****@localhost:5432/kwanza_erp

Migrating models in dependency order:
  ✓ User: 3 migrated, 0 failed (of 3 total)
  ✓ Merchant: 47 migrated, 0 failed (of 47 total)
  ...
  ✓ AuditLog: 4891 migrated, 0 failed (of 4891 total)

Migration summary:
  Migrated: 28471 rows
  Skipped:  0 rows
  Failed:   0 rows
```

**If any rows fail**, re-run the script — it's idempotent. Already-migrated
rows will be skipped via `skipDuplicates: true`.

---

## Step 5: Verify

```bash
npx tsx scripts/migrate-sqlite-to-postgres.ts --verify
```

Output:
```
VERIFY MODE — comparing row counts (no data written)
  ✓ User: 3 rows match
  ✓ Merchant: 47 rows match
  ✓ ALL MODELS MATCH
```

If any model shows a mismatch, re-run the migration script to retry.

---

## Step 6: Restart and test

```bash
npm run dev
```

Open the app, log in, navigate every module. Verify:
- Dashboard loads (uses 100+ queries — fastest way to spot issues)
- Operations Desk (Hub Today) loads
- Create an inbound record → check stock increments
- Create an outbound order → check stock decrements
- Run a reconciliation → check variance calculates
- Generate a statement → check PDF downloads
- Check the new Inventory Valuation module loads

---

## Step 7: Backup the old SQLite file (don't delete yet)

```bash
cp /home/z/my-project/db/custom.db ~/kwanza-sqlite-backup-$(date +%Y%m%d).db
```

After a week of clean operation with Postgres, you can delete the SQLite
file and remove `OLD_SQLITE_URL` from `.env`.

---

## Step 8: Production deployment

If you're deploying to a server (not just developing locally):

1. Provision Postgres on the server (or use a managed instance)
2. Set `DATABASE_URL` in the production environment (do NOT commit `.env`)
3. Run `npx prisma migrate deploy` on the server — applies pending migrations
4. Run the data migration script from a machine that has access to both the old SQLite file and the new Postgres instance
5. Restart the production app

---

## Troubleshooting

### "Authentication failed" when connecting to Postgres
- Check the password in `DATABASE_URL` (URL-encode special characters — `@` becomes `%40`)
- Check that the user has access to the database: `GRANT ALL ON DATABASE kwanza_erp TO kwanza;`

### "Database does not exist"
- Create it first: `CREATE DATABASE kwanza_erp;` (run as `postgres` user)

### `prisma migrate dev` fails with "drift detected"
- This happens if you applied the schema manually. Reset:
  `npx prisma migrate reset` — drops and recreates everything. Only do this on a fresh DB.

### Migration script says "model not found on one or both clients"
- Run `npx prisma generate` then re-run the migration script.

### Some rows failed during migration
- The script will print the failing model. Re-run to retry (idempotent).
- If failures persist, check the error in the row-by-row fallback — usually a FK constraint from a parent row that didn't migrate.

### Performance is slower on Postgres than SQLite
- Run `npx prisma db push` to ensure all indexes were created
- Run `ANALYZE` on all tables: `psql -d kwanza_erp -c "ANALYZE;"` (updates statistics)
- The first few queries after migration may be slow because Postgres needs to warm its cache

---

## What changed in the codebase

| File | Change |
|------|--------|
| `prisma/schema.prisma` | `provider = "sqlite"` → `provider = "postgresql"` |
| `.env.example` | Added with `DATABASE_URL` + `OLD_SQLITE_URL` templates |
| `scripts/migrate-sqlite-to-postgres.ts` | New one-time data migration script (idempotent, with --verify mode) |

No application code changes. No query rewrites. The Prisma client API is identical regardless of the underlying database — that's why this migration is so clean.
