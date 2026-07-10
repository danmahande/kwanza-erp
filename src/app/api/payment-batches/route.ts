import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Payment Batches API — Production-hardened
 *
 * Finance team selects unpaid merchant statements, generates a batch,
 * submits to the bank, and marks as disbursed. Each MerchantPayment
 * created in the batch links back to the statement it settles.
 *
 * All mutations are transactional and audited. Batch DELETE reverses
 * all merchant figures, re-opens statements, and deletes payments in
 * a single transaction — no partial state.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const id = req.nextUrl.searchParams.get('id')

    if (id) {
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

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create batch + payments + update statements + update merchants
    // ═══════════════════════════════════════════════════════════════

    const paymentDate = new Date()
    const year = paymentDate.getFullYear()
    const month = paymentDate.getMonth() + 1
    const day = paymentDate.getDate()

    const result = await db.$transaction(async (tx) => {
      // Generate batch ID — timestamp + random to avoid race condition
      const batchTs = Date.now().toString(36).toUpperCase()
      const batchRand = Math.random().toString(36).slice(2, 5).toUpperCase()
      const batchId = `PB-${paymentDate.toISOString().slice(0, 10).replace(/-/g, '')}-${batchTs.slice(-4)}${batchRand}`

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

      for (const stmt of unpaidStatements) {
        // Generate payment ID — timestamp + random
        const payTs = Date.now().toString(36).toUpperCase()
        const payRand = Math.random().toString(36).slice(2, 5).toUpperCase()
        const paymentId = `PAY-${payTs}-${payRand}`

        await tx.merchantPayment.create({
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

      return { batch, paymentsCreated: unpaidStatements.length, totalAmount }
    })

    await logAudit({
      action: 'BATCH_CREATED',
      module: 'payments',
      entityId: result.batch.batchId,
      details: `Created payment batch ${result.batch.batchId} with ${result.paymentsCreated} payment(s) totaling ${result.totalAmount}. Statements marked as paid, merchant figures updated.`,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating payment batch:', error)
    return NextResponse.json({
      error: 'Failed to create payment batch',
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

    const existing = await db.paymentBatch.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update batch + mark payments completed on disburse
    // ═══════════════════════════════════════════════════════════════

    const batch = await db.$transaction(async (tx) => {
      // If marking as disbursed, stamp the time + mark all linked payments as completed
      if (data.status === 'disbursed' && !data.disbursedAt) {
        data.disbursedAt = new Date()

        await tx.merchantPayment.updateMany({
          where: { batchId: existing.batchId },
          data: { status: 'completed' },
        })
      }

      const updated = await tx.paymentBatch.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      })

      return updated
    })

    await logAudit({
      action: data.status === 'disbursed' ? 'BATCH_DISBURSED' : 'BATCH_UPDATED',
      module: 'payments',
      entityId: batch.batchId,
      details: data.status === 'disbursed'
        ? `Batch ${batch.batchId} marked as disbursed. All linked payments marked as completed.`
        : `Batch ${batch.batchId} updated: ${Object.keys(data).join(', ')}`,
    })

    return NextResponse.json(batch)
  } catch (error) {
    console.error('Error updating payment batch:', error)
    return NextResponse.json({
      error: 'Failed to update payment batch',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE — reverses ALL merchant figures, re-opens ALL statements, deletes ALL payments,
// deletes the batch — all in ONE transaction. Blocks deletion of disbursed batches.
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
      return NextResponse.json({
        error: 'Cannot delete a disbursed batch',
        hint: 'Funds have already been sent to merchants. Contact finance to reverse the bank transfer.',
        code: 'DISBURSED',
      }, { status: 409 })
    }

    // Fetch all payments in this batch BEFORE the transaction (we need amounts + merchant IDs)
    const payments = await db.merchantPayment.findMany({
      where: { batchId: batch.batchId },
      select: { id: true, merchantId: true, amount: true, statementId: true },
    })

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — reverse everything or nothing
    // ═══════════════════════════════════════════════════════════════

    await db.$transaction(async (tx) => {
      // 1. Reverse merchant cumulative figures for each payment
      for (const p of payments) {
        if (p.merchantId && p.amount > 0) {
          await tx.merchant.update({
            where: { merchantId: p.merchantId },
            data: {
              actualPayment: { decrement: p.amount },
              pendingPayment: { increment: p.amount },
            },
          })
        }

        // 2. Re-open statements that were marked paid by this batch
        if (p.statementId) {
          await tx.merchantStatement.updateMany({
            where: { statementId: p.statementId },
            data: { isPaid: false, paidAt: null, status: 'issued' },
          })
        }
      }

      // 3. Delete the payments
      await tx.merchantPayment.deleteMany({
        where: { batchId: batch.batchId },
      })

      // 4. Delete the batch
      await tx.paymentBatch.delete({ where: { id } })
    })

    await logAudit({
      action: 'BATCH_DELETED',
      module: 'payments',
      entityId: batch.batchId,
      details: `Deleted batch ${batch.batchId}. Reversed ${payments.length} payment(s), re-opened ${new Set(payments.map(p => p.statementId).filter(Boolean)).size} statement(s), reversed merchant figures for ${new Set(payments.map(p => p.merchantId).filter(Boolean)).size} merchant(s).`,
    })

    return NextResponse.json({ success: true, reversed: payments.length })
  } catch (error) {
    console.error('Error deleting payment batch:', error)
    return NextResponse.json({
      error: 'Failed to delete payment batch',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
