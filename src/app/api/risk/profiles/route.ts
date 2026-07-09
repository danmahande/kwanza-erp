import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { normalizePhone } from '@/lib/risk-engine'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/risk/profiles
 * Returns all customer risk profiles.
 * Query: ?search=phone|name to filter.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const search = url.searchParams.get('search')?.trim()

  let where = {}
  if (search) {
    const normalized = normalizePhone(search)
    if (normalized) {
      where = { customerContact: { contains: normalized } }
    } else {
      // Fallback: search by substring (will match against phone since that's all we have)
      where = { customerContact: { contains: search } }
    }
  }

  const profiles = await db.customerRiskProfile.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ items: profiles })
}

/**
 * PATCH /api/risk/profiles
 * Updates a customer risk profile — currently only the customerType field is editable
 * (retail ↔ wholesale). Wholesale bypasses qty-based fraud signals.
 *
 * Body: { customerContact: string, customerType: 'retail' | 'wholesale' }
 */
export async function PATCH(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth
  const user = auth

  const body = await req.json()
  const { customerContact, customerType } = body as {
    customerContact: string
    customerType: 'retail' | 'wholesale'
  }

  if (!customerContact || !['retail', 'wholesale'].includes(customerType)) {
    return NextResponse.json({ error: 'customerContact and customerType (retail/wholesale) are required' }, { status: 400 })
  }

  const phone = normalizePhone(customerContact)
  const existing = await db.customerRiskProfile.findUnique({ where: { customerContact: phone } })
  if (!existing) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  await db.customerRiskProfile.update({
    where: { customerContact: phone },
    data: { customerType },
  })

  await logAudit({
    action: 'CUSTOMER_TYPE_CHANGED',
    module: 'risk',
    entityId: phone,
    details: `${existing.customerType} → ${customerType} by ${user.name}`,
  })

  return NextResponse.json({ success: true })
}
