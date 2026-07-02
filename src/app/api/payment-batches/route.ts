import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // Create the batch
    const batchCount = await db.paymentBatch.count()
    const batchId = `PB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(batchCount + 1).padStart(3, '0')}`

    const batch = await db.paymentBatch.create({
      data: {
        batchId,
        totalAmount,
        merchantCount: unpaidStatements.length,
        paymentMethod: paymentMethod || 'bank_transfer',
        status: 'submitted',
        recordedBy: recordedBy || 'system',
        notes: notes || null,
      },
    })

    // Create a MerchantPayment per statement, linked back to the batch
    const paymentDate = new Date()
    const year = paymentDate.getFullYear()
    const month = paymentDate.getMonth() + 1
    const day = paymentDate.getDate()

    let paymentCounter = await db.merchantPayment.count()
    const createdPayments = []
    for (const stmt of unpaidStatements) {
      paymentCounter += 1
      const paymentId = `PAY-${String(paymentCounter).padStart(3, '0')}`

      const payment = await db.merchantPayment.create({
        data: {
          paymentId,
          merchantId: stmt.merchantId,
          merchantName: stmt.merchantName,
          vendorId: stmt.merchantId, // merchant acts as vendor in the existing schema
          amount: stmt.netPayable,
          paymentMethod: paymentMethod || 'bank_transfer',
          reference: `${batchId} / ${stmt.statementId}`,
          comment: `Payout for statement ${stmt.statementId} (period ${stmt.period})`,
          deductions: 0,
          netAmount: stmt.netPayable,
          recordedBy: recordedBy || 'system',
          statementId: stmt.statementId,
          batchId: batch.batchId,
          year,
          month,
          day,
          status: 'submitted',
        },
      })
      createdPayments.push(payment)

      // Mark the statement as paid
      await db.merchantStatement.update({
        where: { id: stmt.id },
        data: {
          isPaid: true,
          paidAt: paymentDate,
          status: 'paid',
        },
      })

      // Update merchant cumulative figures
      await db.merchant.update({
        where: { merchantId: stmt.merchantId },
        data: {
          actualPayment: { increment: stmt.netPayable },
          pendingPayment: { decrement: stmt.netPayable },
        },
      })
    }

    return NextResponse.json({
      batch,
      paymentsCreated: createdPayments.length,
      totalAmount,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating payment batch:', error)
    return NextResponse.json({ error: 'Failed to create payment batch' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
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
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const batch = await db.paymentBatch.findUnique({ where: { id } })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    if (batch.status === 'disbursed') {
      return NextResponse.json({ error: 'Cannot delete a disbursed batch' }, { status: 400 })
    }

    // Unlink any payments before deleting the batch
    await db.merchantPayment.updateMany({
      where: { batchId: batch.batchId },
      data: { batchId: null, status: 'pending' },
    })

    // Re-open any statements that were marked paid by this batch
    const payments = await db.merchantPayment.findMany({
      where: { batchId: batch.batchId },
      select: { statementId: true },
    })
    for (const p of payments) {
      if (p.statementId) {
        await db.merchantStatement.updateMany({
          where: { statementId: p.statementId },
          data: { isPaid: false, paidAt: null, status: 'issued' },
        })
      }
    }

    await db.paymentBatch.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payment batch:', error)
    return NextResponse.json({ error: 'Failed to delete payment batch' }, { status: 500 })
  }
}
