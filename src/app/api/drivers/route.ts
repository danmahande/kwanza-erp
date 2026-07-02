import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
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
    const body = await req.json()
    const { id, ...data } = body
    const driver = await db.driver.update({ where: { id }, data })
    return NextResponse.json(driver)
  } catch {
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })
  }
}
