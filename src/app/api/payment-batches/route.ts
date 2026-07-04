import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Payment Batches API — Workflow 6
 *
 * Finance team selects unpaid merchant statements, generates a batch, submits
 * to the bank, and marks as disbursed. Each MerchantPayment created in the
 * batch links back to the statement it settles.
 *
 * GET  /api/payment-batches                  → list batches
 * GET  /api/payment-batches?id=...           → single batch with payment details
 * POST /api/payment-batches                  → create batch from selected statements
 *      body: { statementIds: string[], paymentMethod, recordedBy }
 * PUT  /api/payment-batches?id=...           → update batch (e.g. mark disbursed)
 *      body: { status, bankReference, disbursedAt }
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')

    if (id) {
      // Single batch with its payments
      const batch = await db.paymentBatch.findUnique({ where: { id } })
      if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

      const payments = await db.merchantPayment.findMany({
        where: { batchId: batch.batchId },
        orderBy: { merchantName: 'asc' },
      })

      return NextResponse.json({ batch, payments })
    }

    const batches = await db.paymentBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json(batches)
  } catch (error) {
    console.error('Error fetching payment batches:', error)
    return NextResponse.json({ error: 'Failed to fetch payment batches' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { statementIds, paymentMethod, recordedBy, notes } = body

    if (!Array.isArray(statementIds) || statementIds.length === 0) {
      return NextResponse.json({ error: 'statementIds array is required' }, { status: 400 })
    }

    // Fetch all selected statements
    const statements = await db.merchantStatement.findMany({
      where: { id: { in: statementIds } },
    })

    if (statements.length === 0) {
      return NextResponse.json({ error: 'No statements found for given IDs' }, { status: 404 })
    }

    // Filter to only unpaid ones
    const unpaidStatements = statements.filter(s => !s.isPaid)
    if (unpaidStatements.length === 0) {
      return NextResponse.json({ error: 'All selected statements are already paid' }, { status: 400 })
    }

    const totalAmount = unpaidStatements.reduce((s, st) => s + st.netPayable, 0)

    // ── Create batch + payments + update statements + update merchants in ONE transaction ──
    const paymentDate = new Date()
    const year = paymentDate.getFullYear()
    const month = paymentDate.getMonth() + 1
    const day = paymentDate.getDate()

    let paymentCounter = await db.merchantPayment.count()

    const result = await db.$transaction(async (tx) => {
      // Create the batch
      const batchCount = await tx.paymentBatch.count()
      const batchId = `PB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(batchCount + 1).padStart(3, '0')}`

      const batch = await tx.paymentBatch.create({
        data: {
          batchId,
          totalAmount,
          merchantCount: unpaidStatements.length,
          paymentMethod: paymentMethod || 'bank_transfer',
          status: 'submitted',
          recordedBy: recordedBy || _user.name,
          notes: notes || null,
        },
      })

      const createdPayments = []
      for (const stmt of unpaidStatements) {
        paymentCounter += 1
        const paymentId = `PAY-${String(paymentCounter).padStart(3, '0')}`

        const payment = await tx.merchantPayment.create({
          data: {
            paymentId,
            merchantId: stmt.merchantId,
            merchantName: stmt.merchantName,
            vendorId: stmt.merchantId,
            amount: stmt.netPayable,
            paymentMethod: paymentMethod || 'bank_transfer',
            reference: `${batchId} / ${stmt.statementId}`,
            comment: `Payout for statement ${stmt.statementId} (period ${stmt.period})`,
            deductions: 0,
            netAmount: stmt.netPayable,
            recordedBy: recordedBy || _user.name,
            statementId: stmt.statementId,
            batchId: batch.batchId,
            year, month, day,
            status: 'submitted',
          },
        })
        createdPayments.push(payment)

        // Mark the statement as paid
        await tx.merchantStatement.update({
          where: { id: stmt.id },
          data: { isPaid: true, paidAt: paymentDate, status: 'paid' },
        })

        // Update merchant cumulative figures
        await tx.merchant.update({
          where: { merchantId: stmt.merchantId },
          data: {
            actualPayment: { increment: stmt.netPayable },
            pendingPayment: { decrement: stmt.netPayable },
          },
        })
      }

      return { batch, paymentsCreated: createdPayments.length, totalAmount }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating payment batch:', error)
    return NextResponse.json({ error: 'Failed to create payment batch' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // If marking as disbursed, stamp the time
    if (data.status === 'disbursed' && !data.disbursedAt) {
      data.disbursedAt = new Date()

      // Also mark all linked MerchantPayments as completed
      const batch = await db.paymentBatch.findUnique({ where: { id } })
      if (batch) {
        await db.merchantPayment.updateMany({
          where: { batchId: batch.batchId },
          data: { status: 'completed' },
        })
      }
    }

    const batch = await db.paymentBatch.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    })

    return NextResponse.json(batch)
  } catch (error) {
    console.error('Error updating payment batch:', error)
    return NextResponse.json({ error: 'Failed to update payment batch' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const batch = await db.paymentBatch.findUnique({ where: { id } })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    if (batch.status === 'disbursed') {
      return NextResponse.json({ error: 'Cannot delete a disbursed batch' }, { status: 400 })
    }

    // Fetch all payments in this batch BEFORE unlinking (we need the amounts + merchant IDs)
    const payments = await db.merchantPayment.findMany({
      where: { batchId: batch.batchId },
      select: { id: true, merchantId: true, amount: true, statementId: true },
    })

    // F1: Reverse merchant cumulative figures for each payment
    for (const p of payments) {
      if (p.merchantId && p.amount > 0) {
        try {
          await db.merchant.update({
            where: { merchantId: p.merchantId },
            data: {
              actualPayment: { decrement: p.amount },
              pendingPayment: { increment: p.amount },
            },
          })
        } catch (merchantErr) {
          console.error(`Merchant reversal failed for ${p.merchantId} (non-blocking):`, merchantErr)
        }
      }

      // Re-open any statements that were marked paid by this batch
      if (p.statementId) {
        await db.merchantStatement.updateMany({
          where: { statementId: p.statementId },
          data: { isPaid: false, paidAt: null, status: 'issued' },
        })
      }
    }

    // Delete the payments themselves (they were created by the batch, not standalone)
    await db.merchantPayment.deleteMany({
      where: { batchId: batch.batchId },
    })

    await db.paymentBatch.delete({ where: { id } })
    return NextResponse.json({ success: true, reversed: payments.length })
  } catch (error) {
    console.error('Error deleting payment batch:', error)
    return NextResponse.json({ error: 'Failed to delete payment batch' }, { status: 500 })
  }
}
