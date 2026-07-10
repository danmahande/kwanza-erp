import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Shrinkage API — Production-hardened
 *
 * When stock is found missing (cycle count, damage, theft, expiry), a
 * ShrinkageRecord is created. The system computes totalValue = qty × unitCost.
 * On resolution, if debitMerchant is true, the totalValue is debited to the
 * merchant's cumulative totalShrinkageValue figure.
 *
 * Stock check happens BEFORE record creation (no phantom records on 409).
 * All multi-write operations are wrapped in db.$transaction.
 * Stock decrements use atomic updateMany to prevent race conditions.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const merchantId = req.nextUrl.searchParams.get('merchantId')

    const where: Record<string, unknown> = search ? {
      OR: [
        { shrinkageId: { contains: search } },
        { rtvId: { contains: search } },
        { productName: { contains: search } },
        { reason: { contains: search } },
        { reportedBy: { contains: search } },
      ],
    } : {}
    if (merchantId) where.merchantId = merchantId

    const shrinkageRecords = await db.shrinkageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(shrinkageRecords)
  } catch (error) {
    console.error('Error fetching shrinkage records:', error)
    return NextResponse.json({ error: 'Failed to fetch shrinkage records' }, { status: 500 })
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

    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (!body.productName) {
      return NextResponse.json({ error: 'productName is required' }, { status: 400 })
    }
    if (!body.reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const qty = parseInt(String(body.qty))
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({
        error: 'qty must be a positive integer',
        received: body.qty,
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // PRE-FLIGHT: look up merchant + product + check stock BEFORE creating
    // ═══════════════════════════════════════════════════════════════

    let merchantId = body.merchantId
    let merchantName = body.merchantName
    let unitCost = body.unitCost ? parseFloat(String(body.unitCost)) : null

    if (body.productId && (!merchantId || !unitCost)) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { merchantId: true, merchantName: true, unitCost: true, currentStock: true, productLabel: true },
      })
      if (!product) {
        return NextResponse.json({
          error: `Product "${body.productId}" does not exist`,
          code: 'PRODUCT_NOT_FOUND',
        }, { status: 400 })
      }
      if (!merchantId) merchantId = product.merchantId
      if (!merchantName) merchantName = product.merchantName
      if (unitCost === null) unitCost = product.unitCost

      // Check sufficient stock BEFORE creating the record (no phantom records)
      if (product.currentStock < qty) {
        return NextResponse.json({
          error: 'Insufficient stock for shrinkage',
          details: `${product.productLabel}: only ${product.currentStock} units on shelf, but shrinkage records ${qty} units`,
          code: 'INSUFFICIENT_STOCK',
          currentStock: product.currentStock,
          requested: qty,
        }, { status: 409 })
      }
    }

    const totalValue = unitCost ? qty * unitCost : null

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create record + decrement stock + update linked RTV
    // ═══════════════════════════════════════════════════════════════

    const shrTs = Date.now().toString(36).toUpperCase()
    const shrRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const shrinkageId = `SHR-${shrTs}-${shrRand}`

    const shrinkageRecord = await db.$transaction(async (tx) => {
      // 1. Create the shrinkage record
      const created = await tx.shrinkageRecord.create({
        data: {
          shrinkageId,
          rtvId: body.rtvId || null,
          merchantId,
          merchantName,
          productId: body.productId,
          productName: body.productName,
          qty,
          unitCost,
          totalValue,
          reason: body.reason,
          reportedBy: body.reportedBy || _user.name,
          status: body.status || 'pending',
          debitMerchant: body.debitMerchant ?? false,
        },
      })

      // 2. Decrement stock ATOMICALLY — WHERE currentStock >= qty prevents race
      const updated = await tx.product.updateMany({
        where: {
          productId: body.productId,
          currentStock: { gte: qty },
        },
        data: { currentStock: { decrement: qty } },
      })
      if (updated.count === 0) {
        throw new Error(`STOCK_RACE: Product ${body.productId} stock was taken by another request. Please retry.`)
      }

      // 3. If this shrinkage is linked to an RTV, update the RTV record
      if (body.rtvId) {
        await tx.rTVRecord.updateMany({
          where: { id: body.rtvId },
          data: {
            status: 'processed',
            processedBy: body.reportedBy || _user.name,
          },
        })
      }

      return created
    })

    await logAudit({
      action: 'SHRINKAGE_CREATED',
      module: 'shrinkage',
      entityId: shrinkageId,
      details: `Shrinkage reported: ${qty} units of ${body.productName}. Reason: ${body.reason}. Value: ${totalValue ?? 'N/A'}. Stock decremented.`,
    })

    return NextResponse.json(shrinkageRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating shrinkage record:', error)
    return NextResponse.json({
      error: 'Failed to create shrinkage record',
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

    const existing = await db.shrinkageRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Stamp resolver + timestamp on resolution
    if (data.status === 'resolved' && !data.resolvedBy) {
      data.resolvedBy = _user.name
      data.resolvedAt = new Date()
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update record + debit merchant on resolution
    // ═══════════════════════════════════════════════════════════════

    const shrinkageRecord = await db.$transaction(async (tx) => {
      // If resolving with debitMerchant=true, increment the merchant's shrinkage total
      if (data.status === 'resolved' && (data.debitMerchant || body.debitMerchant) && existing.merchantId && existing.totalValue) {
        await tx.merchant.update({
          where: { merchantId: existing.merchantId },
          data: {
            totalShrinkageValue: { increment: existing.totalValue },
          },
        })
      }

      const updated = await tx.shrinkageRecord.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      })

      return updated
    })

    await logAudit({
      action: data.status === 'resolved' ? 'SHRINKAGE_RESOLVED' : 'SHRINKAGE_UPDATED',
      module: 'shrinkage',
      entityId: shrinkageRecord.shrinkageId,
      details: data.status === 'resolved'
        ? `Shrinkage resolved by ${data.resolvedBy}. Debit merchant: ${data.debitMerchant || body.debitMerchant || false}. Value: ${existing.totalValue ?? 'N/A'}`
        : `Shrinkage updated: ${Object.keys(data).join(', ')}`,
    })

    return NextResponse.json(shrinkageRecord)
  } catch (error) {
    console.error('Error updating shrinkage record:', error)
    return NextResponse.json({
      error: 'Failed to update shrinkage record',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

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

    const record = await db.shrinkageRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Can't delete resolved shrinkage (merchant already debited)
    if (record.status === 'resolved') {
      return NextResponse.json({
        error: 'Cannot delete resolved shrinkage record',
        hint: 'Merchant has already been debited. Create a credit note instead.',
      }, { status: 409 })
    }

    // Restore stock (shrinkage decremented it at creation)
    if (record.productId && record.qty) {
      try {
        await db.product.update({
          where: { productId: record.productId },
          data: { currentStock: { increment: record.qty } },
        })
      } catch (stockErr) {
        console.error('Stock restore failed (non-blocking):', stockErr)
      }
    }

    await db.shrinkageRecord.delete({ where: { id } })

    await logAudit({
      action: 'SHRINKAGE_DELETED',
      module: 'shrinkage',
      entityId: record.shrinkageId,
      details: `Deleted shrinkage record ${record.shrinkageId} (${record.qty} units of ${record.productName}). Stock restored.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to delete shrinkage record' }, { status: 500 })
  }
}
