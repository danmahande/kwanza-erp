import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Driver Banking API — Production-hardened
 *
 * Closes the loop between a driver collecting COD cash at the doorstep
 * and that cash arriving in our bank account.
 *
 * DELETE is blocked for verified bankings — the record stays for auditing.
 * Instead, use the "dispute" status to flag a banking for investigation.
 * A banking can only be deleted if it's still pending (not yet verified).
 *
 * PUT reverses shortfall damages if status changes FROM shortfall back
 * to verified (the driver's damages figure is no longer overstated).
 *
 * All mutations are transactional and audited.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const driverId = req.nextUrl.searchParams.get('driverId')
    const runsheetId = req.nextUrl.searchParams.get('runsheetId')
    const status = req.nextUrl.searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (driverId) where.driverId = driverId
    if (runsheetId) where.runsheetId = runsheetId
    if (status) where.status = status

    const bankings = await db.driverBanking.findMany({
      where,
      orderBy: { bankedAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(bankings)
  } catch (error) {
    console.error('Error fetching driver bankings:', error)
    return NextResponse.json({ error: 'Failed to fetch driver bankings' }, { status: 500 })
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

    if (!body.driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 })
    }
    const amount = parseFloat(String(body.amount))
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({
        error: 'amount must be a positive number',
        received: body.amount,
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT: verify driver exists
    // ═══════════════════════════════════════════════════════════════

    const driver = await db.driver.findUnique({
      where: { driverId: body.driverId },
      select: { name: true, status: true },
    })
    if (!driver) {
      return NextResponse.json({
        error: `Driver "${body.driverId}" does not exist`,
        code: 'DRIVER_NOT_FOUND',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create banking + reconcile runsheet
    // ═══════════════════════════════════════════════════════════════

    const bankTs = Date.now().toString(36).toUpperCase()
    const bankRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const bankingId = `BNK-${bankTs}-${bankRand}`

    const banking = await db.$transaction(async (tx) => {
      const created = await tx.driverBanking.create({
        data: {
          bankingId,
          driverId: body.driverId,
          driverName: driver.name,
          amount,
          bankName: body.bankName || null,
          bankReference: body.bankReference || null,
          slipPhotoUrl: body.slipPhotoUrl || null,
          runsheetId: body.runsheetId || null,
          status: 'pending',
          bankedAt: body.bankedAt ? new Date(body.bankedAt) : new Date(),
          notes: body.notes || null,
        },
      })

      return created
    })

    // Reconcile runsheet if linked (outside transaction — it does its own queries)
    if (body.runsheetId) {
      await reconcileBankingForRunsheet(body.runsheetId)
    }

    await logAudit({
      action: 'BANKING_CREATED',
      module: 'driver_banking',
      entityId: bankingId,
      details: `Recorded banking ${bankingId} for driver ${driver.name}: ${amount}${body.runsheetId ? ` (runsheet: ${body.runsheetId})` : ''}`,
    })

    return NextResponse.json(banking, { status: 201 })
  } catch (error) {
    console.error('Error creating driver banking:', error)
    return NextResponse.json({
      error: 'Failed to create driver banking',
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

    const existing = await db.driverBanking.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Banking not found' }, { status: 404 })
    }

    // Stamp verifier + time if verifying
    if (data.status === 'verified' && !data.verifiedBy) {
      data.verifiedBy = _user.name
      data.verifiedAt = new Date()
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update banking + reverse shortfall damages if needed
    // ═══════════════════════════════════════════════════════════════

    const wasShortfall = existing.status === 'shortfall'
    const isNoLongerShortfall = wasShortfall && data.status && data.status !== 'shortfall'

    const banking = await db.$transaction(async (tx) => {
      const updated = await tx.driverBanking.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })

      // If marked as shortfall, update driver's damages cumulative
      if (banking.status === 'shortfall' && banking.shortfallAmount && banking.shortfallAmount > 0 && banking.driverId) {
        // Only increment if it wasn't already shortfall (avoid double-counting)
        if (!wasShortfall) {
          await tx.driver.update({
            where: { driverId: banking.driverId },
            data: { damages: { increment: banking.shortfallAmount } },
          })
        }
      }

      // If status changed FROM shortfall back to something else, reverse the damages
      if (isNoLongerShortfall && existing.shortfallAmount && existing.shortfallAmount > 0 && existing.driverId) {
        await tx.driver.update({
          where: { driverId: existing.driverId },
          data: { damages: { decrement: existing.shortfallAmount } },
        })
      }

      return updated
    })

    // Re-reconcile runsheet if linked
    if (banking.runsheetId) {
      await reconcileBankingForRunsheet(banking.runsheetId)
    }

    await logAudit({
      action: banking.status === 'verified' ? 'BANKING_VERIFIED'
            : banking.status === 'shortfall' ? 'BANKING_SHORTFALL'
            : banking.status === 'disputed' ? 'BANKING_DISPUTED'
            : 'BANKING_UPDATED',
      module: 'driver_banking',
      entityId: banking.bankingId,
      details: `Banking ${banking.bankingId} status: ${existing.status} → ${banking.status}${isNoLongerShortfall ? `. Shortfall damages reversed (${existing.shortfallAmount}).` : ''}${banking.status === 'shortfall' && !wasShortfall ? `. Damages applied (${banking.shortfallAmount}).` : ''}`,
    })

    return NextResponse.json(banking)
  } catch (error) {
    console.error('Error updating driver banking:', error)
    return NextResponse.json({
      error: 'Failed to update driver banking',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * DELETE — only allowed for PENDING bankings (not yet verified).
 * Verified/shortfall/disputed bankings CANNOT be deleted — they stay
 * for auditing. Use "disputed" status to flag a verified banking for
 * investigation instead of deleting it.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const existing = await db.driverBanking.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Banking not found' }, { status: 404 })
    }

    // Block deletion of non-pending bankings — they stay for auditing
    if (existing.status !== 'pending') {
      return NextResponse.json({
        error: `Cannot delete a ${existing.status} banking`,
        hint: 'Verified, shortfall, and disputed bankings are kept for audit trails. Use "disputed" status to flag a verified banking for investigation.',
        code: 'BANKING_LOCKED',
        currentStatus: existing.status,
      }, { status: 409 })
    }

    await db.driverBanking.delete({ where: { id } })

    await logAudit({
      action: 'BANKING_DELETED',
      module: 'driver_banking',
      entityId: existing.bankingId,
      details: `Deleted pending banking ${existing.bankingId} for driver ${existing.driverName}: ${existing.amount}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting driver banking:', error)
    return NextResponse.json({ error: 'Failed to delete driver banking' }, { status: 500 })
  }
}

/**
 * Compare COD collected (from OutboundRecord rows on the runsheet) vs
 * COD banked (from DriverBanking rows for the runsheet).
 * Marks the banking as 'verified' or 'shortfall' accordingly.
 *
 * This is the core of the COD reconciliation workflow.
 */
async function reconcileBankingForRunsheet(runsheetId: string) {
  // Sum of COD collected for all outbound records on this runsheet
  const codCollectedAgg = await db.outboundRecord.aggregate({
    where: { runsheetId, status: 'delivered' },
    _sum: { codCollected: true },
  })
  const codCollected = codCollectedAgg._sum.codCollected ?? 0

  // Sum of banked amounts for this runsheet
  const bankedAgg = await db.driverBanking.aggregate({
    where: { runsheetId },
    _sum: { amount: true },
  })
  const codBanked = bankedAgg._sum.amount ?? 0

  const shortfall = Math.max(0, codCollected - codBanked)

  // Update all bankings for this runsheet with the shortfall figure
  const bankings = await db.driverBanking.findMany({ where: { runsheetId } })
  for (const b of bankings) {
    const newStatus = shortfall > 0 ? 'shortfall' : 'verified'
    await db.driverBanking.update({
      where: { id: b.id },
      data: {
        shortfallAmount: shortfall,
        status: newStatus,
      },
    })
  }

  // Also update the driver's overall expectedBankings and banked totals
  if (bankings.length > 0) {
    const driverId = bankings[0].driverId
    const allBankedAgg = await db.driverBanking.aggregate({
      where: { driverId },
      _sum: { amount: true },
    })
    const allCollectedAgg = await db.outboundRecord.aggregate({
      where: { assignedDriver: driverId, status: 'delivered' },
      _sum: { codCollected: true },
    })
    await db.driver.update({
      where: { driverId },
      data: {
        banked: allBankedAgg._sum.amount ?? 0,
        expectedBankings: allCollectedAgg._sum.codCollected ?? 0,
      },
    })
  }
}
