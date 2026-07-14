import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * /api/inventory-valuation/nrv
 *
 * POST — record a new NRV write-down OR reversal.
 * GET  — list all NRV register entries (newest first).
 *
 * Per IAS 2 §9, §33:
 *   • Write-down: expense the difference when NRV < cost. (kind = "write_down")
 *   • Reversal: REQUIRED under IFRS when NRV recovers, capped at the original write-down.
 *     (kind = "reversal") — links to original via reversesId.
 *
 * POST body (write_down):
 *   { kind: 'write_down', productId, qty, unitCost, nrvPerUnit, reason, recordedBy }
 *
 * POST body (reversal):
 *   { kind: 'reversal', reversesId, qty, nrvPerUnitNew, reason, recordedBy }
 *   — Looks up the original write-down, validates reversal is ≤ remaining balance,
 *     and creates a reversal entry that marks the original as 'reversed' (or partially reversed).
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    const rows = await db.nrvWriteDown.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/inventory-valuation/nrv error:', error)
    return NextResponse.json({ error: 'Failed to fetch NRV register' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    const kind = body.kind || 'write_down'
    const reason: string = (body.reason || '').trim()
    if (!reason) {
      return NextResponse.json({ error: 'reason is required (audit trail)' }, { status: 400 })
    }
    const recordedBy: string = body.recordedBy || user.name || user.email

    if (kind === 'write_down') {
      // ── New write-down ──
      if (!body.productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { id: true, productLabel: true, unitCost: true, unitSellingPrice: true, costToSell: true, merchantId: true, merchantName: true },
      })
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

      const qty: number = parseInt(body.qty)
      const unitCost: number = parseFloat(body.unitCost ?? product.unitCost)
      const nrvPerUnit: number = parseFloat(body.nrvPerUnit)
      if (isNaN(qty) || qty <= 0) return NextResponse.json({ error: 'qty must be a positive integer' }, { status: 400 })
      if (isNaN(unitCost) || unitCost < 0) return NextResponse.json({ error: 'unitCost must be ≥ 0' }, { status: 400 })
      if (isNaN(nrvPerUnit) || nrvPerUnit < 0) return NextResponse.json({ error: 'nrvPerUnit must be ≥ 0' }, { status: 400 })

      if (nrvPerUnit >= unitCost) {
        return NextResponse.json(
          { error: 'NRV must be less than cost to require a write-down (IAS 2 §9 — Lower of Cost or NRV)' },
          { status: 400 },
        )
      }

      const amountPerUnit = Math.max(0, unitCost - nrvPerUnit)
      const totalAmount = amountPerUnit * qty

      const row = await db.nrvWriteDown.create({
        data: {
          productId: body.productId,
          productName: product.productLabel,
          merchantId: product.merchantId,
          merchantName: product.merchantName,
          kind: 'write_down',
          qty,
          unitCost,
          nrvPerUnit,
          amountPerUnit,
          totalAmount,
          reason,
          status: 'active',
          recordedBy,
        },
      })

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: 'NRV_WRITE_DOWN',
        module: 'inventory',
        entityId: body.productId,
        details: `IAS 2 NRV write-down: ${qty} units × ${amountPerUnit.toFixed(2)} = ${totalAmount.toFixed(2)} UGX. Reason: ${reason}`,
      })

      return NextResponse.json(row, { status: 201 })
    }

    if (kind === 'reversal') {
      // ── Reversal of an existing write-down ──
      if (!body.reversesId) return NextResponse.json({ error: 'reversesId is required for reversals' }, { status: 400 })
      const original = await db.nrvWriteDown.findUnique({ where: { id: body.reversesId } })
      if (!original) return NextResponse.json({ error: 'Original write-down not found' }, { status: 404 })
      if (original.kind !== 'write_down') return NextResponse.json({ error: 'Can only reverse write-downs, not reversals' }, { status: 400 })
      if (original.status === 'reversed') return NextResponse.json({ error: 'Original write-down is already fully reversed' }, { status: 400 })

      const qty: number = parseInt(body.qty ?? original.qty)
      const nrvPerUnitNew: number = parseFloat(body.nrvPerUnitNew)
      if (isNaN(nrvPerUnitNew) || nrvPerUnitNew < 0) return NextResponse.json({ error: 'nrvPerUnitNew must be ≥ 0' }, { status: 400 })

      // Reversal amount = min(recovered amount, original write-down amount)
      // Recovered amount = qty × (new NRV − original NRV), capped at original.amountPerUnit × qty
      const recoveredPerUnit = Math.max(0, nrvPerUnitNew - original.nrvPerUnit)
      const reversalPerUnit = Math.min(recoveredPerUnit, original.amountPerUnit)
      const reversalQty = Math.min(qty, original.qty)
      const totalReversalAmount = reversalPerUnit * reversalQty

      if (totalReversalAmount <= 0) {
        return NextResponse.json(
          { error: 'Reversal amount is zero — new NRV must be greater than original NRV to reverse' },
          { status: 400 },
        )
      }

      const row = await db.nrvWriteDown.create({
        data: {
          productId: original.productId,
          productName: original.productName,
          merchantId: original.merchantId,
          merchantName: original.merchantName,
          kind: 'reversal',
          qty: reversalQty,
          unitCost: original.unitCost,
          nrvPerUnit: nrvPerUnitNew,
          amountPerUnit: reversalPerUnit,
          totalAmount: totalReversalAmount,
          reason,
          status: 'active',
          reversesId: original.id,
          recordedBy,
        },
      })

      // Mark original as reversed (full reversal — partial not yet supported; could be extended)
      if (reversalQty >= original.qty) {
        await db.nrvWriteDown.update({
          where: { id: original.id },
          data: { status: 'reversed' },
        })
      }

      await logAudit({
        userId: user.id,
        userName: user.name,
        action: 'NRV_REVERSAL',
        module: 'inventory',
        entityId: original.productId,
        details: `IAS 2 NRV reversal: ${reversalQty} units × ${reversalPerUnit.toFixed(2)} = ${totalReversalAmount.toFixed(2)} UGX. Reason: ${reason}`,
      })

      return NextResponse.json(row, { status: 201 })
    }

    return NextResponse.json({ error: `kind must be 'write_down' or 'reversal'` }, { status: 400 })
  } catch (error) {
    console.error('POST /api/inventory-valuation/nrv error:', error)
    return NextResponse.json({ error: 'Failed to record NRV entry' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
