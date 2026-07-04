import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const drivers = await db.driver.findMany({
      where: {
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } },
          { driverId: { contains: search } },
          { vehicleNumber: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(drivers)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const count = await db.driver.count()
    const driverId = `DRV-${String(count + 1).padStart(3, '0')}`
    const driver = await db.driver.create({
      data: { ...body, driverId },
    })
    return NextResponse.json(driver, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body
    const driver = await db.driver.update({ where: { id }, data })
    return NextResponse.json(driver)
  } catch {
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    const driver = await db.driver.findUnique({ where: { id: id! }, select: { driverId: true, name: true, status: true } })
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

    // Check for active runsheets or pending bankings
    const [activeRunsheet, pendingBankings] = await Promise.all([
      db.outboundRecord.count({ where: { assignedDriver: driver.driverId, status: { in: ['dispatched', 'packed'] }, runsheetId: { not: null } } }),
      db.driverBanking.count({ where: { driverId: driver.driverId, status: 'pending' } }),
    ])

    if (activeRunsheet > 0 || pendingBankings > 0) {
      const details: string[] = []
      if (activeRunsheet) details.push(`${activeRunsheet} active runsheet stop(s)`)
      if (pendingBankings) details.push(`${pendingBankings} pending banking(s)`)
      return NextResponse.json({
        error: `Cannot delete driver "${driver.name}" — ${details.join(', ')}`,
        suggestion: 'Set the driver to inactive instead, or resolve their active runsheets and pending bankings first.',
      }, { status: 409 })
    }

    await db.driver.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 })
  }
}
