import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

const FEE_FIELDS = [
  'receivingFlatFee', 'receivingFlatHours', 'receivingHourlyAfter', 'inboundReceivingPerUnit',
  'storagePerBinMonth', 'storagePerShelfMonth', 'storagePerPalletMonth', 'storagePerUnitPerDay',
  'pickFirstItemsIncluded', 'pickPerAdditionalItem', 'packPerOrder', 'pickPerUnit',
  'fulfillmentFeePerOrder', 'fulfillmentMinimumFee',
  'returnProcessingPerUnit', 'returnsPerOrder',
  'commissionPercent', 'codRemittanceFeePerOrder', 'codShortfallPenalty',
] as const

// GET — list all templates
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const templates = await db.rateCardTemplate.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    return NextResponse.json(templates)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST — create a new template
export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    if (!body.name) return NextResponse.json({ error: 'Template name is required' }, { status: 400 })

    const data: Record<string, unknown> = {
      name: body.name,
      description: body.description || null,
      isActive: true,
      createdBy: _user.name,
    }
    for (const field of FEE_FIELDS) {
      data[field] = body[field] ?? 0
    }

    const template = await db.rateCardTemplate.create({ data: data as never })
    await logAudit({
      action: 'RATE_CARD_TEMPLATE_CREATED',
      module: 'settings',
      entityId: template.id,
      details: `Created rate card template "${body.name}" by ${_user.name}`,
    })
    return NextResponse.json(template, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

// PUT — update a template
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...rest } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (rest.name) data.name = rest.name
    if (rest.description !== undefined) data.description = rest.description || null
    for (const field of FEE_FIELDS) {
      if (rest[field] !== undefined) data[field] = rest[field]
    }

    const template = await db.rateCardTemplate.update({ where: { id }, data })
    await logAudit({
      action: 'RATE_CARD_TEMPLATE_UPDATED',
      module: 'settings',
      entityId: id,
      details: `Updated rate card template "${rest.name || template.name}" by ${_user.name}`,
    })
    return NextResponse.json(template)
  } catch {
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// DELETE — soft-delete a template (set isActive = false)
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await db.rateCardTemplate.update({ where: { id }, data: { isActive: false } })
    await logAudit({
      action: 'RATE_CARD_TEMPLATE_DELETED',
      module: 'settings',
      entityId: id,
      details: `Deleted rate card template by ${_user.name}`,
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
