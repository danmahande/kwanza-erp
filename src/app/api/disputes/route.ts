import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Disputes API — Statement dispute / credit-memo sub-system (Tier 1)
 *
 * GET  /api/disputes                          → list disputes (filter by merchantId, statementId, status)
 * GET  /api/disputes?summary=true             → rollup for KPIs
 * POST /api/disputes                          → create a dispute (merchant challenges a charge)
 * PATCH /api/disputes                          → resolve a dispute (issue credit memo or reject)
 *      body: { action: 'review' | 'credit' | 'reject', id, creditAmountApproved?, resolutionNotes?, by }
 *
 * When action='credit':
 *   - Sets status to 'credited'
 *   - Creates a NEGATIVE MerchantPayment (credit memo) linked to the dispute
 *   - Updates merchant.pendingPayment / actualPayment accordingly
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const merchantId = req.nextUrl.searchParams.get('merchantId') || ''
    const statementId = req.nextUrl.searchParams.get('statementId') || ''
    const status = req.nextUrl.searchParams.get('status') || ''
    const summary = req.nextUrl.searchParams.get('summary') === 'true'
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '200', 10)

    if (summary) {
      const all = await db.statementDispute.findMany({ select: { status: true, creditAmountRequested: true, creditAmountApproved: true } })
      const open = all.filter(d => d.status === 'open')
      const review = all.filter(d => d.status === 'under_review')
      const credited = all.filter(d => d.status === 'credited')
      const rejected = all.filter(d => d.status === 'rejected')
      return NextResponse.json({
        totals: {
          openCount: open.length,
          openAmount: open.reduce((s, d) => s + d.creditAmountRequested, 0),
          underReviewCount: review.length,
          underReviewAmount: review.reduce((s, d) => s + d.creditAmountRequested, 0),
          creditedCount: credited.length,
          creditedAmount: credited.reduce((s, d) => s + (d.creditAmountApproved || 0), 0),
          rejectedCount: rejected.length,
        },
      })
    }

    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId
    if (statementId) where.statementId = statementId
    if (status) where.status = status

    const disputes = await db.statementDispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(disputes)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch disputes', detail: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { merchantId, merchantName, statementId, lineItemReference, disputeType, reason, creditAmountRequested, createdBy } = body
    if (!merchantId || !statementId || !reason || !creditAmountRequested) {
      return NextResponse.json({ error: 'merchantId, statementId, reason, and creditAmountRequested are required' }, { status: 400 })
    }

    // Look up merchant name + verify statement exists
    let mName = merchantName
    const stmt = await db.merchantStatement.findFirst({ where: { statementId } })
    if (!mName) {
      const m = await db.merchant.findUnique({ where: { merchantId }, select: { businessName: true } })
      mName = m?.businessName || merchantId
    }
    if (!stmt) {
      return NextResponse.json({ error: `Statement ${statementId} not found` }, { status: 404 })
    }

    const count = await db.statementDispute.count()
    const disputeId = `DSP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

    const dispute = await db.statementDispute.create({
      data: {
        disputeId,
        merchantId,
        merchantName: mName,
        statementId,
        lineItemReference: lineItemReference || null,
        disputeType: disputeType || 'overcharge',
        reason,
        creditAmountRequested: parseFloat(creditAmountRequested),
        status: 'open',
        createdBy: createdBy || _user.name,
      },
    })
    await logAudit({
      action: 'CREATE',
      module: 'disputes',
      entityId: disputeId,
      details: `Opened dispute ${disputeId} on statement ${statementId}: ${reason} (credit requested: ${creditAmountRequested})`,
    })
    return NextResponse.json(dispute, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to create dispute', detail: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { action, id, creditAmountApproved, resolutionNotes, by } = body as {
      action: 'review' | 'credit' | 'reject'
      id: string
      creditAmountApproved?: number
      resolutionNotes?: string
      by?: string
    }

    if (!action || !id || !['review', 'credit', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action (review|credit|reject) and id are required' }, { status: 400 })
    }

    const performer = by || _user.name
    const now = new Date()
    const dispute = await db.statementDispute.findUnique({ where: { id } })
    if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
    if (dispute.status === 'credited' || dispute.status === 'rejected') {
      return NextResponse.json({ error: `Dispute already ${dispute.status}` }, { status: 400 })
    }

    if (action === 'review') {
      const updated = await db.statementDispute.update({
        where: { id },
        data: { status: 'under_review', resolutionNotes: resolutionNotes || dispute.resolutionNotes },
      })
      await logAudit({ action: 'REVIEW', module: 'disputes', entityId: dispute.disputeId, details: `Dispute moved to under_review` })
      return NextResponse.json(updated)
    }

    if (action === 'reject') {
      const updated = await db.statementDispute.update({
        where: { id },
        data: { status: 'rejected', resolvedBy: performer, resolvedAt: now, resolutionNotes: resolutionNotes || 'Rejected' },
      })
      await logAudit({ action: 'REJECT', module: 'disputes', entityId: dispute.disputeId, details: `Dispute rejected: ${resolutionNotes || 'no notes'}` })
      return NextResponse.json(updated)
    }

    // action === 'credit' — issue a credit memo (negative MerchantPayment) in ONE transaction
    const creditAmount = creditAmountApproved || dispute.creditAmountRequested
    if (creditAmount <= 0) {
      return NextResponse.json({ error: 'creditAmountApproved must be > 0' }, { status: 400 })
    }

    const { updated, creditMemo } = await db.$transaction(async (tx) => {
      const paymentCount = await tx.merchantPayment.count()
      const paymentId = `PAY-${String(paymentCount + 1).padStart(3, '0')}`
      const paymentDate = new Date()

      const creditMemo = await tx.merchantPayment.create({
        data: {
          paymentId,
          merchantId: dispute.merchantId,
          merchantName: dispute.merchantName,
          vendorId: dispute.merchantId,
          amount: -creditAmount,
          paymentMethod: 'credit_memo',
          reference: `CREDIT-MEMO / ${dispute.disputeId} / ${dispute.statementId}`,
          comment: `Credit memo for dispute ${dispute.disputeId}: ${dispute.reason}`,
          deductions: 0,
          netAmount: -creditAmount,
          recordedBy: performer,
          statementId: dispute.statementId,
          year: paymentDate.getFullYear(),
          month: paymentDate.getMonth() + 1,
          day: paymentDate.getDate(),
          status: 'completed',
        },
      })

      const updated = await tx.statementDispute.update({
        where: { id },
        data: {
          status: 'credited',
          creditAmountApproved: creditAmount,
          resolvedBy: performer,
          resolvedAt: now,
          resolutionNotes: resolutionNotes || `Credit memo ${paymentId} issued`,
          paymentId,
        },
      })

      await tx.merchant.update({
        where: { merchantId: dispute.merchantId },
        data: {
          pendingPayment: { decrement: creditAmount },
          actualPayment: { decrement: creditAmount },
        },
      })

      return { updated, creditMemo }
    })

    await logAudit({
      action: 'CREDIT',
      module: 'disputes',
      entityId: dispute.disputeId,
      details: `Credit memo ${creditMemo.paymentId} issued for ${creditAmount} (dispute ${dispute.disputeId})`,
    })
    return NextResponse.json({ dispute: updated, creditMemo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to resolve dispute', detail: msg }, { status: 500 })
  }
}

// DELETE — only allowed for open disputes (not yet credited or under review).
// Credited disputes have a linked credit memo that can't be reversed by deletion.
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await db.statementDispute.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })

    // Block deletion of credited disputes (credit memo exists)
    if (existing.status === 'credited') {
      return NextResponse.json({
        error: 'Cannot delete a credited dispute',
        hint: `A credit memo (${existing.paymentId}) was issued for this dispute. Reverse the credit memo payment first.`,
        code: 'CREDITED',
      }, { status: 409 })
    }

    // Block deletion of under_review disputes (being investigated)
    if (existing.status === 'under_review') {
      return NextResponse.json({
        error: 'Cannot delete a dispute under review',
        hint: 'Reject the dispute first to close it, then delete if needed.',
        code: 'UNDER_REVIEW',
      }, { status: 409 })
    }

    await db.statementDispute.delete({ where: { id } })

    await logAudit({
      action: 'DISPUTE_DELETED',
      module: 'disputes',
      entityId: existing.disputeId,
      details: `Deleted dispute ${existing.disputeId} for ${existing.merchantName}. Status was: ${existing.status}.`,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to delete dispute', detail: msg }, { status: 500 })
  }
}
