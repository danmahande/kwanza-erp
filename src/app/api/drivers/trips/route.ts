import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

// ── GET /api/drivers/trips?driverId=xxx&period=daily|weekly|monthly|quarterly|yearly ──
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const driverId = req.nextUrl.searchParams.get('driverId') || ''
    const period = req.nextUrl.searchParams.get('period') || 'monthly'

    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }

    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
        break
      case 'weekly':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)
        break
      case 'monthly':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
        break
      case 'quarterly':
        startDate = new Date(now.getFullYear() - 2, 0, 1)
        break
      case 'yearly':
        startDate = new Date(now.getFullYear() - 3, 0, 1)
        break
      default:
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    }

    const trips = await db.driverTrip.findMany({
      where: { driverId, tripDate: { gte: startDate } },
      orderBy: { tripDate: 'desc' },
    })

    const buckets: Record<string, { label: string; trips: number; delivered: number; failed: number; cod: number; sales: number; distance: number }> = {}

    for (const t of trips) {
      let key: string
      const d = new Date(t.tripDate)
      switch (period) {
        case 'daily':
          key = d.toISOString().slice(0, 10)
          break
        case 'weekly': {
          const ws = new Date(d); ws.setDate(d.getDate() - d.getDay())
          key = ws.toISOString().slice(0, 10)
          break
        }
        case 'monthly':
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          break
        case 'quarterly': {
          const q = Math.floor(d.getMonth() / 3) + 1
          key = `${d.getFullYear()}-Q${q}`
          break
        }
        case 'yearly':
          key = `${d.getFullYear()}`
          break
        default:
          key = d.toISOString().slice(0, 10)
      }
      if (!buckets[key]) buckets[key] = { label: key, trips: 0, delivered: 0, failed: 0, cod: 0, sales: 0, distance: 0 }
      const b = buckets[key]
      b.trips++; b.delivered += t.delivered; b.failed += t.failed; b.cod += t.codCollected; b.sales += t.saleAmount
      if (t.distanceKm) b.distance += t.distanceKm
    }

    const timeline = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, b]) => ({
        ...b,
        successRate: (b.delivered + b.failed) > 0 ? Math.round((b.delivered / (b.delivered + b.failed)) * 100) : 0,
        totalStops: b.delivered + b.failed,
      }))

    const summary = timeline.reduce((acc, b) => {
      acc.totalTrips += b.trips; acc.totalDelivered += b.delivered; acc.totalFailed += b.failed
      acc.totalCOD += b.cod; acc.totalSales += b.sales; acc.totalDistance += b.distance
      return acc
    }, { totalTrips: 0, totalDelivered: 0, totalFailed: 0, totalCOD: 0, totalSales: 0, totalDistance: 0 })

    return NextResponse.json({ timeline, summary })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch trips' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const count = await db.driverTrip.count()
    const tripId = `TRP-${String(count + 1).padStart(5, '0')}`
    const driver = await db.driver.findUnique({ where: { driverId: body.driverId }, select: { name: true } })
    const trip = await db.driverTrip.create({
      data: {
        tripId, driverId: body.driverId, driverName: driver?.name || body.driverName || 'Unknown',
        tripDate: body.tripDate ? new Date(body.tripDate) : new Date(),
        totalStops: body.totalStops || 0, delivered: body.delivered || 0, failed: body.failed || 0,
        codCollected: body.codCollected || 0, saleAmount: body.saleAmount || 0,
        distanceKm: body.distanceKm || null, geoTracked: body.geoTracked || false,
        lastGeoLocation: body.lastGeoLocation || null, runsheetId: body.runsheetId || null, notes: body.notes || null,
      },
    })
    return NextResponse.json(trip, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body
    const trip = await db.driverTrip.update({ where: { id }, data })
    return NextResponse.json(trip)
  } catch {
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 })
  }
}
