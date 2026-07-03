import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Driver Banking API — Workflow 2
 *
 * Closes the loop between a driver collecting COD cash at the doorstep and
 * that cash actually arriving in our bank account.
 *
 * GET  /api/driver-banking?driverId=D001              → list bankings (optionally filtered)
 * GET  /api/driver-banking?runsheetId=RS-2026-04-14-001 → bankings for one runsheet
 * POST /api/driver-banking                              → record a new banking
 * PUT  /api/driver-banking?id=...                       → verify / mark shortfall / dispute
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const driverId = req.nextUrl.searchParams.get('driverId')
    const runsheetId = req.nextUrl.searchParams.get('runsheetId')
    const status = req.nextUrl.searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (driverId) where.driverId = driverId
    if (runsheetId) where.runsheetId = runsheetId
    if (status) where.status = status

    const bankings = await db.driverBanking.findMany({
      where,
      orderBy: { bankedAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(bankings)
  } catch (error) {
    console.error('Error fetching driver bankings:', error)
    return NextResponse.json({ error: 'Failed to fetch driver bankings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const count = await db.driverBanking.count()
    const bankingId = `BNK-${String(count + 1).padStart(5, '0')}`

    // Look up driver name if not provided
    let driverName = body.driverName
    if (!driverName && body.driverId) {
      const driver = await db.driver.findUnique({
        where: { driverId: body.driverId },
        select: { name: true },
      })
      driverName = driver?.name || 'Unknown'
    }

    const banking = await db.driverBanking.create({
      data: {
        bankingId,
        driverId: body.driverId,
        driverName: driverName || 'Unknown',
        amount: parseFloat(String(body.amount)) || 0,
        bankName: body.bankName || null,
        bankReference: body.bankReference || null,
        slipPhotoUrl: body.slipPhotoUrl || null,
        runsheetId: body.runsheetId || null,
        status: 'pending',
        bankedAt: body.bankedAt ? new Date(body.bankedAt) : new Date(),
        notes: body.notes || null,
      },
    })

    // If this banking is linked to a runsheet, reconcile immediately
    if (body.runsheetId) {
      await reconcileBankingForRunsheet(body.runsheetId)
    }

    return NextResponse.json(banking, { status: 201 })
  } catch (error) {
    console.error('Error creating driver banking:', error)
    return NextResponse.json({ error: 'Failed to create driver banking' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body

    // If verifying, stamp verifier + time
    if (data.status === 'verified' && !data.verifiedBy) {
      data.verifiedBy = 'current_user' // TODO: replace with real session
      data.verifiedAt = new Date()
    }

    const banking = await db.driverBanking.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })

    // Re-reconcile runsheet if linked
    if (banking.runsheetId) {
      await reconcileBankingForRunsheet(banking.runsheetId)
    }

    return NextResponse.json(banking)
  } catch (error) {
    console.error('Error updating driver banking:', error)
    return NextResponse.json({ error: 'Failed to update driver banking' }, { status: 500 })
  }
}

/**
 * Compare COD collected (from OutboundRecord rows on the runsheet) vs
 * COD banked (from DriverBanking rows for the runsheet).
 * Marks the banking as 'verified' or 'shortfall' accordingly.
 *
 * This is the core of the COD reconciliation workflow.
 */
async function reconcileBankingForRunsheet(runsheetId: string) {
  // Sum of COD collected for all outbound records on this runsheet
  const codCollectedAgg = await db.outboundRecord.aggregate({
    where: { runsheetId, status: 'delivered' },
    _sum: { codCollected: true },
  })
  const codCollected = codCollectedAgg._sum.codCollected ?? 0

  // Sum of banked amounts for this runsheet
  const bankedAgg = await db.driverBanking.aggregate({
    where: { runsheetId },
    _sum: { amount: true },
  })
  const codBanked = bankedAgg._sum.amount ?? 0

  const shortfall = Math.max(0, codCollected - codBanked)

  // Update all bankings for this runsheet with the shortfall figure
  const bankings = await db.driverBanking.findMany({ where: { runsheetId } })
  for (const b of bankings) {
    const newStatus = shortfall > 0 ? 'shortfall' : 'verified'
    await db.driverBanking.update({
      where: { id: b.id },
      data: {
        shortfallAmount: shortfall,
        status: newStatus,
      },
    })
  }

  // Also update the driver's overall expectedBankings and banked totals
  if (bankings.length > 0) {
    const driverId = bankings[0].driverId
    const allBankedAgg = await db.driverBanking.aggregate({
      where: { driverId },
      _sum: { amount: true },
    })
    const allCollectedAgg = await db.outboundRecord.aggregate({
      where: { assignedDriver: driverId, status: 'delivered' },
      _sum: { codCollected: true },
    })
    await db.driver.update({
      where: { driverId },
      data: {
        banked: allBankedAgg._sum.amount ?? 0,
        expectedBankings: allCollectedAgg._sum.codCollected ?? 0,
      },
    })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await db.driverBanking.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting driver banking:', error)
    return NextResponse.json({ error: 'Failed to delete driver banking' }, { status: 500 })
  }
}
