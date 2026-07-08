import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

// GET /api/merchant-communication?merchantId=MCH-001&followUpsDue=true
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const merchantId = req.nextUrl.searchParams.get('merchantId') || ''
    const followUpsDue = req.nextUrl.searchParams.get('followUpsDue') === 'true'
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId
    if (followUpsDue) {
      where.followUpAt = { lte: new Date() }
      where.isResolved = false
    }

    const entries = await db.merchantCommunication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // For follow-ups-due banner: group by merchantId
    if (followUpsDue) {
      const byMerchant = new Map<string, number>()
      for (const e of entries) {
        byMerchant.set(e.merchantId, (byMerchant.get(e.merchantId) || 0) + 1)
      }
      // Enrich with merchant names
      const enriched = await Promise.all(
        Array.from(byMerchant.entries()).map(async ([mid, count]) => {
          const m = await db.merchant.findUnique({ where: { merchantId: mid }, select: { businessName: true } })
          return { merchantId: mid, businessName: m?.businessName || mid, followUpCount: count }
        })
      )
      return NextResponse.json({ followUps: enriched, total: entries.length })
    }

    return NextResponse.json(entries)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch communication log' }, { status: 500 })
  }
}

// POST /api/merchant-communication — create new entry
export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { merchantId, type, direction, subject, notes, recordedBy, followUpAt, isResolved } = body
    if (!merchantId || !subject) {
      return NextResponse.json({ error: 'merchantId and subject are required' }, { status: 400 })
    }
    const entry = await db.merchantCommunication.create({
      data: {
        merchantId,
        type: type || 'call',
        direction: direction || 'outbound',
        subject,
        notes: notes || null,
        recordedBy: recordedBy || _user.name,
        followUpAt: followUpAt ? new Date(followUpAt) : null,
        isResolved: isResolved ?? true,
      },
    })
    await logAudit({
      action: 'CREATE',
      module: 'merchant-communication',
      entityId: merchantId,
      details: `Logged ${type || 'call'}: ${subject}`,
    })
    return NextResponse.json(entry, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create communication entry' }, { status: 500 })
  }
}

// DELETE /api/merchant-communication?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await db.merchantCommunication.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}

// PATCH /api/merchant-communication — mark resolved
export async function PATCH(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, isResolved } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const entry = await db.merchantCommunication.update({
      where: { id },
      data: { isResolved: !!isResolved },
    })
    return NextResponse.json(entry)
  } catch {
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}
