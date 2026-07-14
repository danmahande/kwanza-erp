import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Merchant Rate Card API — Production-hardened
 *
 * Each merchant has contracted rates (UGX) for every activity we perform.
 * The supersede logic (deactivate old + create new) is wrapped in a
 * transaction to prevent race conditions. Every mutation is audited.
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
    const _user = authResult as AuthUser
    const body = await req.json()

    if (!body.merchantId) {
      return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — supersede old card + create new card atomically
    // ═══════════════════════════════════════════════════════════════

    const card = await db.$transaction(async (tx) => {
      // If a previous active rate card exists for this merchant, supersede it
      const existing = await tx.merchantRateCard.findFirst({
        where: { merchantId: body.merchantId, isActive: true },
        orderBy: { validFrom: 'desc' },
      })
      if (existing) {
        await tx.merchantRateCard.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            validTo: new Date(),
          },
        })
      }

      // Create the new rate card
      const created = await tx.merchantRateCard.create({
        data: {
          merchantId: body.merchantId,
          // Receiving
          receivingFlatFee: body.receivingFlatFee ?? 0,
          receivingFlatHours: body.receivingFlatHours ?? 2,
          receivingHourlyAfter: body.receivingHourlyAfter ?? 0,
          inboundReceivingPerUnit: body.inboundReceivingPerUnit ?? 0,
          // Storage
          storagePerBinMonth: body.storagePerBinMonth ?? 0,
          storagePerShelfMonth: body.storagePerShelfMonth ?? 0,
          storagePerPalletMonth: body.storagePerPalletMonth ?? 0,
          storagePerUnitPerDay: body.storagePerUnitPerDay ?? 0,
          // Pick & Pack
          pickFirstItemsIncluded: body.pickFirstItemsIncluded ?? 4,
          pickPerAdditionalItem: body.pickPerAdditionalItem ?? 0,
          packPerOrder: body.packPerOrder ?? 0,
          pickPerUnit: body.pickPerUnit ?? 0,
          // Fulfillment
          fulfillmentFeePerOrder: body.fulfillmentFeePerOrder ?? 0,
          fulfillmentMinimumFee: body.fulfillmentMinimumFee ?? 0,
          // Returns
          returnProcessingPerUnit: body.returnProcessingPerUnit ?? 0,
          returnsPerOrder: body.returnsPerOrder ?? 0,
          // Commission
          commissionPercent: body.commissionPercent ?? 0,
          // COD
          codRemittanceFeePerOrder: body.codRemittanceFeePerOrder ?? 0,
          codShortfallPenalty: body.codShortfallPenalty ?? 0,
          // Meta
          validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
          validTo: body.validTo ? new Date(body.validTo) : null,
          isActive: body.isActive ?? true,
        },
      })

      return { created, superseded: !!existing }
    })

    await logAudit({
      action: 'RATE_CARD_CREATED',
      module: 'merchants',
      entityId: body.merchantId,
      details: `Created new rate card for merchant ${body.merchantId}.${card.superseded ? ' Previous active card superseded.' : ''} By ${_user.name}.`,
    })

    return NextResponse.json(card.created, { status: 201 })
  } catch (error) {
    console.error('Error creating rate card:', error)
    return NextResponse.json({ error: 'Failed to create rate card' }, { status: 500 })
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

    const card = await db.merchantRateCard.update({
      where: { id },
      data: {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
        updatedAt: new Date(),
      },
    })

    await logAudit({
      action: 'RATE_CARD_UPDATED',
      module: 'merchants',
      entityId: card.merchantId,
      details: `Updated rate card for merchant ${card.merchantId}: ${Object.keys(data).join(', ')}. By ${_user.name}.`,
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
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const existing = await db.merchantRateCard.findUnique({
      where: { id },
      select: { merchantId: true, isActive: true },
    })
    if (!existing) return NextResponse.json({ error: 'Rate card not found' }, { status: 404 })

    await db.merchantRateCard.delete({ where: { id } })

    await logAudit({
      action: 'RATE_CARD_DELETED',
      module: 'merchants',
      entityId: existing.merchantId,
      details: `Deleted rate card for merchant ${existing.merchantId} (was ${existing.isActive ? 'active' : 'inactive'}). By ${_user.name}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting rate card:', error)
    return NextResponse.json({ error: 'Failed to delete rate card' }, { status: 500 })
  }
}
