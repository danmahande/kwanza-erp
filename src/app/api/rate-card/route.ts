import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Merchant Rate Card API
 * Each merchant has contracted rates (UGX) for every activity we perform.
 * GET /api/rate-card?merchantId=MCH-0001  → fetch active rate card for a merchant
 * POST /api/rate-card                     → create new rate card (or supersede an old one)
 * PUT /api/rate-card?id=...               → update an existing rate card
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const merchantId = req.nextUrl.searchParams.get('merchantId')
    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId

    const cards = await db.merchantRateCard.findMany({
      where,
      orderBy: { validFrom: 'desc' },
    })
    return NextResponse.json(cards)
  } catch (error) {
    console.error('Error fetching rate cards:', error)
    return NextResponse.json({ error: 'Failed to fetch rate cards' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()

    // If a previous active rate card exists for this merchant, supersede it
    if (body.merchantId) {
      const existing = await db.merchantRateCard.findFirst({
        where: { merchantId: body.merchantId, isActive: true },
        orderBy: { validFrom: 'desc' },
      })
      if (existing) {
        await db.merchantRateCard.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            validTo: new Date(),
          },
        })
      }
    }

    const card = await db.merchantRateCard.create({
      data: {
        merchantId: body.merchantId,
        inboundReceivingPerUnit: body.inboundReceivingPerUnit ?? 0,
        storagePerUnitPerDay: body.storagePerUnitPerDay ?? 0,
        pickPerUnit: body.pickPerUnit ?? 0,
        packPerOrder: body.packPerOrder ?? 0,
        returnProcessingPerUnit: body.returnProcessingPerUnit ?? 0,
        commissionPercent: body.commissionPercent ?? 0,
        codRemittanceFeePerOrder: body.codRemittanceFeePerOrder ?? 0,
        codShortfallPenalty: body.codShortfallPenalty ?? 0,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
        isActive: body.isActive ?? true,
      },
    })

    return NextResponse.json(card, { status: 201 })
  } catch (error) {
    console.error('Error creating rate card:', error)
    return NextResponse.json({ error: 'Failed to create rate card' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body

    const card = await db.merchantRateCard.update({
      where: { id },
      data: {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(card)
  } catch (error) {
    console.error('Error updating rate card:', error)
    return NextResponse.json({ error: 'Failed to update rate card' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await db.merchantRateCard.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting rate card:', error)
    return NextResponse.json({ error: 'Failed to delete rate card' }, { status: 500 })
  }
}
