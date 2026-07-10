import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Drivers API — Production-hardened
 *
 * Every mutation is audited. Phone numbers are unique. Shift toggles
 * create DriverShift history rows on checkout (enables payroll calculations).
 * DELETE checks for runsheets, bankings, communication logs, AND trip records.
 * All multi-write operations are wrapped in db.$transaction.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const status = req.nextUrl.searchParams.get('status') || ''

    const where: Record<string, unknown> = search ? {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
        { driverId: { contains: search } },
        { vehicleNumber: { contains: search } },
      ],
    } : {}
    if (status) where.status = status

    const drivers = await db.driver.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
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
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }

    // Check phone uniqueness BEFORE creating (friendly 409, not a 500)
    const existing = await db.driver.findUnique({
      where: { phone: body.phone },
      select: { driverId: true, name: true },
    })
    if (existing) {
      return NextResponse.json({
        error: 'Phone number already in use',
        details: `Phone "${body.phone}" is already registered to driver ${existing.name} (${existing.driverId}).`,
        code: 'PHONE_DUPLICATE',
      }, { status: 409 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create driver
    // ═══════════════════════════════════════════════════════════════

    const drvTs = Date.now().toString(36).toUpperCase()
    const drvRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const driverId = `DRV-${drvTs}-${drvRand}`

    const driver = await db.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: { ...body, driverId },
      })
      return created
    })

    await logAudit({
      action: 'DRIVER_CREATED',
      module: 'drivers',
      entityId: driverId,
      details: `Created driver ${driverId}: ${body.name} (${body.phone}). Vehicle: ${body.vehicleNumber || 'N/A'}. Status: ${body.status || 'active'}.`,
    })

    return NextResponse.json(driver, { status: 201 })
  } catch (error) {
    console.error('Driver create error:', error)
    return NextResponse.json({
      error: 'Failed to create driver',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.driver.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // If phone is being changed, check uniqueness
    if (data.phone && data.phone !== existing.phone) {
      const phoneOwner = await db.driver.findUnique({
        where: { phone: data.phone },
        select: { id: true, name: true },
      })
      if (phoneOwner && phoneOwner.id !== id) {
        return NextResponse.json({
          error: 'Phone number already in use',
          details: `Phone "${data.phone}" is already registered to driver ${phoneOwner.name}.`,
          code: 'PHONE_DUPLICATE',
        }, { status: 409 })
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update driver + handle shift toggle + shift history
    // ═══════════════════════════════════════════════════════════════

    const isShiftCheckIn = data.shiftStart && !data.shiftEnd && !existing.shiftStart
    const isShiftCheckOut = data.shiftEnd && existing.shiftStart && !existing.shiftEnd

    const driver = await db.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      })

      // On checkout, create a DriverShift history row
      if (isShiftCheckOut) {
        const shiftStart = new Date(existing.shiftStart!)
        const shiftEnd = new Date(data.shiftEnd)
        const durationHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60)

        await tx.driverShift.create({
          data: {
            driverId: existing.driverId,
            driverName: existing.name,
            shiftStart,
            shiftEnd,
            durationHours: Math.round(durationHours * 100) / 100,
          },
        })
      }

      return updated
    })

    // Determine what changed for audit
    const changes: string[] = []
    if (data.name && data.name !== existing.name) changes.push(`name: ${existing.name} → ${data.name}`)
    if (data.phone && data.phone !== existing.phone) changes.push(`phone changed`)
    if (data.status && data.status !== existing.status) changes.push(`status: ${existing.status} → ${data.status}`)
    if (data.vehicleNumber !== undefined && data.vehicleNumber !== existing.vehicleNumber) changes.push(`vehicle: ${existing.vehicleNumber || 'N/A'} → ${data.vehicleNumber || 'N/A'}`)
    if (isShiftCheckIn) changes.push(`shift: CHECKED IN`)
    if (isShiftCheckOut) changes.push(`shift: CHECKED OUT`)
    if (changes.length === 0) changes.push(Object.keys(data).join(', '))

    await logAudit({
      action: isShiftCheckIn ? 'DRIVER_CHECKED_IN' : isShiftCheckOut ? 'DRIVER_CHECKED_OUT' : 'DRIVER_UPDATED',
      module: 'drivers',
      entityId: existing.driverId,
      details: `Driver ${existing.name} (${existing.driverId}): ${changes.join(', ')}`,
    })

    return NextResponse.json(driver)
  } catch (error) {
    console.error('Driver update error:', error)
    return NextResponse.json({
      error: 'Failed to update driver',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const driver = await db.driver.findUnique({
      where: { id },
      select: { driverId: true, name: true, status: true },
    })
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

    // Check for ALL dependencies — runsheets, bankings, communication, trips
    const [activeRunsheet, pendingBankings, commCount, tripCount] = await Promise.all([
      db.outboundRecord.count({ where: { assignedDriver: driver.driverId, status: { in: ['dispatched', 'packed'] }, runsheetId: { not: null } } }),
      db.driverBanking.count({ where: { driverId: driver.driverId, status: 'pending' } }),
      db.driverCommunication.count({ where: { driverId: driver.driverId } }),
      db.driverTrip.count({ where: { driverId: driver.driverId } }),
    ])

    if (activeRunsheet > 0 || pendingBankings > 0) {
      const details: string[] = []
      if (activeRunsheet) details.push(`${activeRunsheet} active runsheet stop(s)`)
      if (pendingBankings) details.push(`${pendingBankings} pending banking(s)`)
      return NextResponse.json({
        error: `Cannot delete driver "${driver.name}" — ${details.join(', ')}`,
        suggestion: 'Set the driver to inactive instead, or resolve their active runsheets and pending bankings first.',
        code: 'ACTIVE_DEPENDENCIES',
      }, { status: 409 })
    }

    if (commCount > 0 || tripCount > 0) {
      return NextResponse.json({
        error: `Cannot delete driver "${driver.name}" — has ${commCount} communication log(s) and ${tripCount} trip record(s)`,
        suggestion: 'This driver has historical records. Set the driver to inactive instead — deleting would lose all history.',
        code: 'HISTORICAL_RECORDS',
        commCount,
        tripCount,
      }, { status: 409 })
    }

    await db.$transaction(async (tx) => {
      // Delete shift history (no active records, but clean up historical)
      await tx.driverShift.deleteMany({ where: { driverId: driver.driverId } })
      await tx.driver.delete({ where: { id } })
    })

    await logAudit({
      action: 'DRIVER_DELETED',
      module: 'drivers',
      entityId: driver.driverId,
      details: `Deleted driver ${driver.name} (${driver.driverId}). No active dependencies or historical records.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Driver delete error:', error)
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 })
  }
}
