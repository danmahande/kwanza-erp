import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * Charges API — Charge ledger (Tier 1 internal-controls upgrade)
 *
 * GET  /api/charges                          → list charges (filter by merchantId, period, status, chargeType)
 * GET  /api/charges?summary=true             → rollup summary for KPIs
 * POST /api/charges                          → create a manual charge
 * PATCH /api/charges                          → approve / reject / bulk-approve
 *      body: { action: 'approve' | 'reject', ids: string[], reason?: string, by: string }
 * DELETE /api/charges?id=...
 */
export async function GET(req: NextRequest) {
  try {
    const merchantId = req.nextUrl.searchParams.get('merchantId') || ''
    const period = req.nextUrl.searchParams.get('period') || ''
    const status = req.nextUrl.searchParams.get('status') || ''
    const chargeType = req.nextUrl.searchParams.get('chargeType') || ''
    const summary = req.nextUrl.searchParams.get('summary') === 'true'
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '200', 10)

    if (summary) {
      // KPI rollup
      const all = await db.charge.findMany({ select: { amount: true, status: true, chargeType: true } })
      const pending = all.filter(c => c.status === 'pending')
      const approved = all.filter(c => c.status === 'approved')
      const invoiced = all.filter(c => c.status === 'invoiced')
      const rejected = all.filter(c => c.status === 'rejected')
      const byType: Record<string, { count: number; amount: number }> = {}
      for (const c of pending) {
        const k = c.chargeType
        if (!byType[k]) byType[k] = { count: 0, amount: 0 }
        byType[k].count++; byType[k].amount += c.amount
      }
      return NextResponse.json({
        totals: {
          pendingCount: pending.length,
          pendingAmount: pending.reduce((s, c) => s + c.amount, 0),
          approvedCount: approved.length,
          approvedAmount: approved.reduce((s, c) => s + c.amount, 0),
          invoicedCount: invoiced.length,
          invoicedAmount: invoiced.reduce((s, c) => s + c.amount, 0),
          rejectedCount: rejected.length,
        },
        pendingByType: byType,
      })
    }

    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId
    if (period) where.period = period
    if (status) where.status = status
    if (chargeType) where.chargeType = chargeType

    const charges = await db.charge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(charges)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch charges', detail: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantId, merchantName, chargeType, amount, description, sourceType, sourceId, period, recordedBy } = body
    if (!merchantId || !chargeType || !amount || !period) {
      return NextResponse.json({ error: 'merchantId, chargeType, amount, and period are required' }, { status: 400 })
    }

    // Look up merchant name if not provided
    let mName = merchantName
    if (!mName) {
      const m = await db.merchant.findUnique({ where: { merchantId }, select: { businessName: true } })
      mName = m?.businessName || merchantId
    }

    const count = await db.charge.count()
    const chargeId = `CHG-${String(count + 1).padStart(5, '0')}`

    const charge = await db.charge.create({
      data: {
        chargeId,
        merchantId,
        merchantName: mName,
        chargeType,
        amount: parseFloat(amount),
        description: description || `${chargeType} charge`,
        sourceType: sourceType || 'manual',
        sourceId: sourceId || null,
        period,
        status: 'pending',
        recordedBy: recordedBy || 'admin',
      },
    })
    await logAudit({
      action: 'CREATE',
      module: 'charges',
      entityId: chargeId,
      details: `Created ${chargeType} charge ${chargeId} for ${mName} (${period}): ${amount}`,
    })
    return NextResponse.json(charge, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to create charge', detail: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, ids, reason, by } = body as { action: 'approve' | 'reject'; ids: string[]; reason?: string; by?: string }

    if (!action || !['approve', 'reject'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'action (approve|reject) and ids[] are required' }, { status: 400 })
    }

    const performer = by || 'admin'
    const now = new Date()

    if (action === 'approve') {
      const result = await db.charge.updateMany({
        where: { id: { in: ids }, status: 'pending' },
        data: { status: 'approved', approvedBy: performer, approvedAt: now },
      })
      await logAudit({
        action: 'APPROVE',
        module: 'charges',
        entityId: ids.join(','),
        details: `Approved ${result.count} charge(s)`,
      })
      return NextResponse.json({ approved: result.count })
    } else {
      const result = await db.charge.updateMany({
        where: { id: { in: ids }, status: 'pending' },
        data: { status: 'rejected', rejectedBy: performer, rejectedAt: now, rejectionReason: reason || 'Rejected by reviewer' },
      })
      await logAudit({
        action: 'REJECT',
        module: 'charges',
        entityId: ids.join(','),
        details: `Rejected ${result.count} charge(s): ${reason || 'no reason'}`,
      })
      return NextResponse.json({ rejected: result.count })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to update charges', detail: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await db.charge.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete charge' }, { status: 500 })
  }
}
