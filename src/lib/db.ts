import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma client singleton.
 *
 * Query logging is disabled in production — `log: ['query']` serializes every
 * SQL statement + params to stdout, which is significant CPU + I/O overhead
 * on a route that fires 100+ queries per request (e.g. the dashboard).
 * In dev, keep ['query', 'error', 'warn'] for visibility.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
