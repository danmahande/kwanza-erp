import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

// GET /api/driver-communication?driverId=DRV-001&followUpsDue=true
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const driverId = req.nextUrl.searchParams.get('driverId') || ''
    const followUpsDue = req.nextUrl.searchParams.get('followUpsDue') === 'true'
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}
    if (driverId) where.driverId = driverId
    if (followUpsDue) {
      where.followUpAt = { lte: new Date() }
      where.isResolved = false
    }

    const entries = await db.driverCommunication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    if (followUpsDue) {
      const byDriver = new Map<string, { name: string; count: number }>()
      for (const e of entries) {
        const existing = byDriver.get(e.driverId)
        if (existing) existing.count++
        else byDriver.set(e.driverId, { name: e.driverName, count: 1 })
      }
      return NextResponse.json({
        followUps: Array.from(byDriver.entries()).map(([id, info]) => ({ driverId: id, driverName: info.name, followUpCount: info.count })),
        total: entries.length,
      })
    }

    return NextResponse.json(entries)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch driver communication log' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { driverId, driverName, type, direction, subject, notes, outboundId, orderNumber, customerName, customerContact, recordedBy, followUpAt, isResolved } = body
    if (!driverId || !subject) return NextResponse.json({ error: 'driverId and subject are required' }, { status: 400 })
    const entry = await db.driverCommunication.create({
      data: {
        driverId, driverName: driverName || '', type: type || 'call', direction: direction || 'outbound',
        subject, notes: notes || null, outboundId: outboundId || null, orderNumber: orderNumber || null,
        customerName: customerName || null, customerContact: customerContact || null,
        recordedBy: recordedBy || _user.name,
        followUpAt: followUpAt ? new Date(followUpAt) : null, isResolved: isResolved ?? true,
      },
    })
    await logAudit({ action: 'CREATE', module: 'driver-communication', entityId: driverId, details: `Logged ${type || 'call'}: ${subject}` })
    return NextResponse.json(entry, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create driver communication entry' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await db.driverCommunication.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, isResolved } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const entry = await db.driverCommunication.update({ where: { id }, data: { isResolved: !!isResolved } })
    return NextResponse.json(entry)
  } catch {
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}
