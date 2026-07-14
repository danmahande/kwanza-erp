import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

// GET — fetch the default rate card (creates with zeros if not exists)
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser

    let card = await db.defaultRateCard.findFirst()
    if (!card) {
      card = await db.defaultRateCard.create({ data: {} })
    }
    return NextResponse.json(card)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch default rate card' }, { status: 500 })
  }
}

// PUT — update the default rate card
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    let card = await db.defaultRateCard.findFirst()
    if (!card) {
      card = await db.defaultRateCard.create({ data: {} })
    }

    const updated = await db.defaultRateCard.update({
      where: { id: card.id },
      data: {
        receivingFlatFee: body.receivingFlatFee ?? 0,
        receivingFlatHours: body.receivingFlatHours ?? 2,
        receivingHourlyAfter: body.receivingHourlyAfter ?? 0,
        inboundReceivingPerUnit: body.inboundReceivingPerUnit ?? 0,
        storagePerBinMonth: body.storagePerBinMonth ?? 0,
        storagePerShelfMonth: body.storagePerShelfMonth ?? 0,
        storagePerPalletMonth: body.storagePerPalletMonth ?? 0,
        storagePerUnitPerDay: body.storagePerUnitPerDay ?? 0,
        pickFirstItemsIncluded: body.pickFirstItemsIncluded ?? 4,
        pickPerAdditionalItem: body.pickPerAdditionalItem ?? 0,
        packPerOrder: body.packPerOrder ?? 0,
        pickPerUnit: body.pickPerUnit ?? 0,
        fulfillmentFeePerOrder: body.fulfillmentFeePerOrder ?? 0,
        fulfillmentMinimumFee: body.fulfillmentMinimumFee ?? 0,
        returnProcessingPerUnit: body.returnProcessingPerUnit ?? 0,
        returnsPerOrder: body.returnsPerOrder ?? 0,
        commissionPercent: body.commissionPercent ?? 0,
        codRemittanceFeePerOrder: body.codRemittanceFeePerOrder ?? 0,
        codShortfallPenalty: body.codShortfallPenalty ?? 0,
        updatedBy: _user.name,
      },
    })

    await logAudit({
      action: 'DEFAULT_RATE_CARD_UPDATED',
      module: 'settings',
      entityId: 'default-rate-card',
      details: `Updated default rate card by ${_user.name}`,
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update default rate card' }, { status: 500 })
  }
}
