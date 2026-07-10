import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Audit Log API — Production-hardened
 *
 * GET /api/audit-log
 *   Query params:
 *     search    — full-text search across action, userName, details, entityId
 *     module    — filter by module (e.g. 'payments', 'outbound')
 *     action    — filter by action (e.g. 'CREATE', 'DELETE')
 *     userId    — filter by user
 *     fromDate  — ISO date string (inclusive)
 *     toDate    — ISO date string (inclusive)
 *     page      — page number (default 1)
 *     pageSize  — items per page (default 100, max 500)
 *     export    — if 'csv', returns all matching records as text/csv
 *
 * Returns: { items, total, page, pageSize, totalPages }
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    const sp = req.nextUrl.searchParams
    const search = sp.get('search') || ''
    const moduleFilter = sp.get('module') || ''
    const actionFilter = sp.get('action') || ''
    const userIdFilter = sp.get('userId') || ''
    const fromDate = sp.get('fromDate')
    const toDate = sp.get('toDate')
    const isExport = sp.get('export') === 'csv'

    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '100', 10)))

    // Build where clause
    const where: Record<string, unknown> = {}
    if (moduleFilter) where.module = moduleFilter
    if (actionFilter) where.action = { contains: actionFilter }
    if (userIdFilter) where.userId = userIdFilter

    if (fromDate || toDate) {
      const dateRange: Record<string, Date> = {}
      if (fromDate) dateRange.gte = new Date(fromDate)
      if (toDate) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        dateRange.lte = end
      }
      where.createdAt = dateRange
    }

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { userName: { contains: search } },
        { details: { contains: search } },
        { entityId: { contains: search } },
      ]
    }

    // Export mode — return all matching as CSV (no pagination)
    if (isExport) {
      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // safety cap
      })

      const csvHeader = 'Timestamp,User,Module,Action,Entity,Details'
      const csvRows = logs.map(l => {
        const ts = new Date(l.createdAt).toISOString()
        const user = (l.userName || l.userId || 'system').replace(/,/g, ';')
        const mod = (l.module || '').replace(/,/g, ';')
        const act = (l.action || '').replace(/,/g, ';')
        const ent = (l.entityId || '').replace(/,/g, ';')
        const det = (l.details || '').replace(/"/g, '""').replace(/,/g, ';')
        return `${ts},${user},${mod},${act},${ent},"${det}"`
      })
      const csv = [csvHeader, ...csvRows].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // Normal mode — paginated
    const [total, items] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Error fetching audit log:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
