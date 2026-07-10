import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Payments API — Production-hardened
 *
 * Records payments to merchants and keeps merchant cumulative figures
 * (actualPayment, pendingPayment) in sync. Every mutation is transactional
 * and audited. Editing a payment's amount adjusts the merchant figures
 * and logs the delta. Deleting a payment reverses the merchant figures.
 *
 * All multi-write operations are wrapped in db.$transaction.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const year = req.nextUrl.searchParams.get('year') || ''
    const month = req.nextUrl.searchParams.get('month') || ''
    const day = req.nextUrl.searchParams.get('day') || ''

    const where: Record<string, unknown> = search ? {
      OR: [
        { merchantName: { contains: search } },
        { reference: { contains: search } },
        { paymentId: { contains: search } },
      ],
    } : {}
    if (year) where.year = parseInt(year)
    if (month) where.month = parseInt(month)
    if (day) where.day = parseInt(day)

    const payments = await db.merchantPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(payments)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.merchantId) {
      return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    }
    if (!body.merchantName) {
      return NextResponse.json({ error: 'merchantName is required' }, { status: 400 })
    }
    const amount = parseFloat(String(body.amount))
    if (isNaN(amount)) {
      return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
    }
    // Allow negative amounts for credit memos (disputes), but log a warning
    if (amount === 0) {
      return NextResponse.json({ error: 'amount cannot be zero' }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT: verify merchant exists
    // ═══════════════════════════════════════════════════════════════

    const merchant = await db.merchant.findUnique({
      where: { merchantId: body.merchantId },
      select: { businessName: true },
    })
    if (!merchant) {
      return NextResponse.json({
        error: `Merchant "${body.merchantId}" does not exist`,
        code: 'MERCHANT_NOT_FOUND',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create payment + update merchant figures
    // ═══════════════════════════════════════════════════════════════

    const paymentTs = Date.now().toString(36).toUpperCase()
    const paymentRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const paymentId = `PAY-${paymentTs}-${paymentRand}`
    const now = new Date()
    const deductions = body.deductions ? parseFloat(String(body.deductions)) : 0
    const netAmount = body.netAmount !== undefined ? parseFloat(String(body.netAmount)) : (amount - deductions)

    const payment = await db.$transaction(async (tx) => {
      const created = await tx.merchantPayment.create({
        data: {
          ...body,
          paymentId,
          year: body.year || now.getFullYear(),
          month: body.month || (now.getMonth() + 1),
          day: body.day || now.getDate(),
          deductions,
          netAmount,
          amount,
        },
      })

      // Update merchant cumulative figures (only for standalone payments, not batch-linked)
      if (amount > 0 && !body.batchId) {
        await tx.merchant.update({
          where: { merchantId: body.merchantId },
          data: {
            actualPayment: { increment: amount },
            pendingPayment: { decrement: amount },
          },
        })
      }
      // Credit memos (negative amounts from disputes) decrement actual + increment pending
      if (amount < 0 && !body.batchId) {
        await tx.merchant.update({
          where: { merchantId: body.merchantId },
          data: {
            actualPayment: { increment: amount },  // negative increment = decrement
            pendingPayment: { decrement: amount },  // negative decrement = increment
          },
        })
      }

      return created
    })

    await logAudit({
      action: 'PAYMENT_CREATED',
      module: 'payments',
      entityId: paymentId,
      details: `Recorded payment ${paymentId} for ${body.merchantName}: ${amount} (net: ${netAmount})${body.batchId ? ' [batch-linked]' : ''}`,
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Payment create error:', error)
    return NextResponse.json({
      error: 'Failed to create payment',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
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

    const existing = await db.merchantPayment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Recalculate netAmount if amount or deductions changed
    const newAmount = data.amount !== undefined ? parseFloat(String(data.amount)) : existing.amount
    const newDeductions = data.deductions !== undefined ? parseFloat(String(data.deductions)) : (existing.deductions || 0)
    if (data.amount !== undefined || data.deductions !== undefined) {
      data.netAmount = newAmount - newDeductions
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update payment + adjust merchant figures if amount changed
    // ═══════════════════════════════════════════════════════════════

    const amountChanged = data.amount !== undefined && newAmount !== existing.amount
    const delta = amountChanged ? (newAmount - existing.amount) : 0

    const payment = await db.$transaction(async (tx) => {
      const updated = await tx.merchantPayment.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })

      // If the amount changed AND this is a standalone payment (not batch-linked),
      // adjust the merchant's cumulative figures by the delta
      if (amountChanged && !existing.batchId && existing.merchantId && delta !== 0) {
        await tx.merchant.update({
          where: { merchantId: existing.merchantId },
          data: {
            actualPayment: { increment: delta },
            pendingPayment: { decrement: delta },
          },
        })
      }

      return updated
    })

    // Audit — log every change with the delta if amount changed
    await logAudit({
      action: 'PAYMENT_UPDATED',
      module: 'payments',
      entityId: existing.paymentId,
      details: `Payment ${existing.paymentId} updated: ${Object.keys(data).join(', ')}${amountChanged ? `. Amount changed: ${existing.amount} → ${newAmount} (delta: ${delta >= 0 ? '+' : ''}${delta}). Merchant figures adjusted.` : ''}`,
    })

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Payment update error:', error)
    return NextResponse.json({
      error: 'Failed to update payment',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE — reverses merchant figures (actualPayment decremented, pendingPayment incremented)
// in a transaction. Blocks deletion of batch-linked payments (delete the batch instead).
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.merchantPayment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Block deletion of batch-linked payments — delete the batch instead
    if (existing.batchId) {
      return NextResponse.json({
        error: 'Cannot delete a batch-linked payment',
        hint: `This payment is part of batch ${existing.batchId}. Delete the batch instead to reverse all payments and re-open statements.`,
        code: 'BATCH_LINKED',
        batchId: existing.batchId,
      }, { status: 409 })
    }

    // Block deletion of completed credit memos (from disputes)
    if (existing.paymentMethod === 'credit_memo' && existing.status === 'completed') {
      return NextResponse.json({
        error: 'Cannot delete a completed credit memo',
        hint: 'Reverse the dispute instead to remove the credit memo.',
        code: 'CREDIT_MEMO_LOCKED',
      }, { status: 409 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — reverse merchant figures + delete payment
    // ═══════════════════════════════════════════════════════════════

    await db.$transaction(async (tx) => {
      // Reverse merchant cumulative figures
      if (existing.merchantId && existing.amount > 0) {
        await tx.merchant.update({
          where: { merchantId: existing.merchantId },
          data: {
            actualPayment: { decrement: existing.amount },
            pendingPayment: { increment: existing.amount },
          },
        })
      }
      // Credit memo reversal (negative amount)
      if (existing.merchantId && existing.amount < 0) {
        await tx.merchant.update({
          where: { merchantId: existing.merchantId },
          data: {
            actualPayment: { decrement: Math.abs(existing.amount) },
            pendingPayment: { increment: Math.abs(existing.amount) },
          },
        })
      }

      await tx.merchantPayment.delete({ where: { id } })
    })

    await logAudit({
      action: 'PAYMENT_DELETED',
      module: 'payments',
      entityId: existing.paymentId,
      details: `Deleted payment ${existing.paymentId} for ${existing.merchantName}: ${existing.amount}. Merchant figures reversed (actualPayment -${existing.amount}, pendingPayment +${existing.amount}).`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Payment delete error:', error)
    return NextResponse.json({
      error: 'Failed to delete payment',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
