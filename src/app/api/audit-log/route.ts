import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Audit Log API
 *
 * GET /api/audit-log                 → list all (most recent 500)
 * GET /api/audit-log?module=payments → filter by module
 * GET /api/audit-log?search=delete   → search by action / user / details
 *
 * NOTE: writes to the audit log happen via the logAudit() helper in
 * src/lib/audit.ts, called from other API routes. This endpoint is read-only.
 */
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const moduleFilter = req.nextUrl.searchParams.get('module') || 'all'

    const where: Record<string, unknown> = {}
    if (moduleFilter && moduleFilter !== 'all') {
      where.module = moduleFilter
    }
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { userName: { contains: search } },
        { details: { contains: search } },
        { entityId: { contains: search } },
      ]
    }

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(logs)
  } catch (error) {
    console.error('Error fetching audit log:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
