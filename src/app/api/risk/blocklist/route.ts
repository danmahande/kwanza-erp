import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'
import { normalizePhone, normalizeAddress } from '@/lib/risk-engine'

/**
 * GET /api/risk/blocklist
 * Returns all active blocklist entries.
 * Query: ?includeInactive=true to include soft-deleted entries.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('includeInactive') === 'true'

  const entries = await db.fraudBlocklist.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { addedAt: 'desc' },
  })

  return NextResponse.json({ items: entries })
}

/**
 * POST /api/risk/blocklist
 * Adds a phone and/or address to the blocklist.
 * Body: { phone?: string, address?: string, reason: string }
 * Requires admin role. Automatically updates the CustomerRiskProfile.isBlocklisted flag.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth
  const user = auth

  const body = await req.json()
  const { phone, address, reason } = body as {
    phone?: string
    address?: string
    reason: string
  }

  if (!reason || reason.trim().length === 0) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  if (!phone && !address) {
    return NextResponse.json({ error: 'phone or address is required' }, { status: 400 })
  }

  const normalizedPhone = phone ? normalizePhone(phone) : null
  const normalizedAddr = address ? normalizeAddress(address) : null

  // Check for duplicates
  if (normalizedPhone) {
    const existing = await db.fraudBlocklist.findUnique({ where: { phone: normalizedPhone } })
    if (existing && existing.isActive) {
      return NextResponse.json({ error: `Phone ${normalizedPhone} is already on the blocklist` }, { status: 409 })
    }
    if (existing && !existing.isActive) {
      // Reactivate instead of creating new
      await db.fraudBlocklist.update({
        where: { phone: normalizedPhone },
        data: { isActive: true, reason, addedBy: user.name, addedAt: new Date() },
      })
      await syncCustomerBlocklistFlag(normalizedPhone, true)
      await logAudit({ action: 'BLOCKLIST_ADD', module: 'risk', entityId: normalizedPhone, details: reason })
      return NextResponse.json({ success: true, reactivated: true })
    }
  }

  const entry = await db.fraudBlocklist.create({
    data: {
      phone: normalizedPhone,
      address: normalizedAddr,
      reason,
      addedBy: user.name,
    },
  })

  // Sync the customer profile flag
  if (normalizedPhone) {
    await syncCustomerBlocklistFlag(normalizedPhone, true)
  }

  await logAudit({
    action: 'BLOCKLIST_ADD',
    module: 'risk',
    entityId: normalizedPhone || normalizedAddr || 'unknown',
    details: reason,
  })

  return NextResponse.json({ success: true, entry })
}

/**
 * DELETE /api/risk/blocklist
 * Soft-deletes a blocklist entry (sets isActive=false — keeps audit trail).
 * Body: { id: string } OR { phone: string }
 */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { id, phone } = body as { id?: string; phone?: string }

  if (!id && !phone) {
    return NextResponse.json({ error: 'id or phone is required' }, { status: 400 })
  }

  let entry
  if (id) {
    entry = await db.fraudBlocklist.update({
      where: { id },
      data: { isActive: false },
    })
  } else {
    const normalizedPhone = normalizePhone(phone!)
    entry = await db.fraudBlocklist.update({
      where: { phone: normalizedPhone },
      data: { isActive: false },
    })
    await syncCustomerBlocklistFlag(normalizedPhone, false)
  }

  await logAudit({
    action: 'BLOCKLIST_REMOVE',
    module: 'risk',
    entityId: id || phone || 'unknown',
    details: `Removed blocklist entry: ${entry.reason}`,
  })

  return NextResponse.json({ success: true })
}

// Helper: sync the isBlocklisted flag on CustomerRiskProfile
async function syncCustomerBlocklistFlag(phone: string, isBlocklisted: boolean): Promise<void> {
  const existing = await db.customerRiskProfile.findUnique({ where: { customerContact: phone } })
  if (existing) {
    await db.customerRiskProfile.update({
      where: { customerContact: phone },
      data: { isBlocklisted },
    })
  }
}
