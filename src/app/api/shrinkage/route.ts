import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Shrinkage API — Workflow 4: Shrinkage → Merchant Debit
 *
 * When stock is found missing (cycle count, damage, theft, expiry), a ShrinkageRecord
 * is created. The system computes totalValue = qty × unitCost. On resolution, if
 * debitMerchant is true, the totalValue is debited to the merchant's cumulative
 * totalShrinkageValue figure (which then shows up on their next statement).
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const merchantId = req.nextUrl.searchParams.get('merchantId')

    const where: Record<string, unknown> = {
      OR: [
        { shrinkageId: { contains: search } },
        { rtvId: { contains: search } },
        { productName: { contains: search } },
        { reason: { contains: search } },
        { reportedBy: { contains: search } },
      ],
    }
    if (merchantId) where.merchantId = merchantId

    const shrinkageRecords = await db.shrinkageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
    const count = await db.shrinkageRecord.count()
    const shrinkageId = `SHR-${String(count + 1).padStart(3, '0')}`

    // ===========================================================================
    // Workflow 4: compute total value (qty × unitCost) so we can debit merchant
    // on resolution. Look up the merchant and product if not provided.
    // ===========================================================================
    let merchantId = body.merchantId
    let merchantName = body.merchantName
    let unitCost = body.unitCost ? parseFloat(String(body.unitCost)) : null

    if (body.productId && (!merchantId || !unitCost)) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { merchantId: true, merchantName: true, unitCost: true },
      })
      if (product) {
        if (!merchantId) merchantId = product.merchantId
        if (!merchantName) merchantName = product.merchantName
        if (unitCost === null) unitCost = product.unitCost
      }
    }

    const qty = parseInt(String(body.qty)) || 0
    const totalValue = unitCost ? qty * unitCost : null

    const shrinkageRecord = await db.shrinkageRecord.create({
      data: {
        shrinkageId,
        rtvId: body.rtvId || null,
        merchantId,
        merchantName,
        productId: body.productId || '',
        productName: body.productName || '',
        qty,
        unitCost,
        totalValue,
        reason: body.reason || '',
        reportedBy: body.reportedBy || _user.name,
        status: body.status || 'pending',
        debitMerchant: body.debitMerchant ?? false,
      },
    })

    // Update product stock — the units are gone (check sufficient first)
    if (body.productId && body.qty) {
      try {
        const product = await db.product.findUnique({
          where: { productId: body.productId },
          select: { currentStock: true, productLabel: true },
        })
        if (product && product.currentStock < body.qty) {
          return NextResponse.json({
            error: 'Insufficient stock for shrinkage',
            details: `${product.productLabel}: only ${product.currentStock} units on shelf, but shrinkage records ${body.qty} units`,
          }, { status: 409 })
        }
        await db.product.update({
          where: { productId: body.productId },
          data: { currentStock: { decrement: body.qty } },
        })
      } catch (stockErr) {
        console.error('Stock decrement failed (non-blocking):', stockErr)
      }
    }

    // If this shrinkage is linked to an RTV, update the RTV record accordingly
    if (body.rtvId) {
      try {
        const rtvRecord = await db.rTVRecord.findUnique({ where: { id: body.rtvId } })
        if (rtvRecord) {
          await db.rTVRecord.update({
            where: { id: body.rtvId },
            data: {
              status: 'processed',
              processedBy: body.reportedBy || _user.name,
            },
          })
        }
      } catch (rtvErr) {
        console.error('RTV update failed (non-blocking):', rtvErr)
      }
    }

    return NextResponse.json(shrinkageRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to create shrinkage record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // ===========================================================================
    // Workflow 4: on resolution with debitMerchant=true, update the merchant's
    // totalShrinkageValue cumulative figure so it shows up on their next statement.
    // ===========================================================================
    if (data.status === 'resolved' && !data.resolvedBy) {
      data.resolvedBy = _user.name
      data.resolvedAt = new Date()
    }

    // If resolving and debitMerchant is true, increment the merchant's shrinkage total
    if (data.status === 'resolved' && (data.debitMerchant || body.debitMerchant)) {
      const existing = await db.shrinkageRecord.findUnique({ where: { id } })
      if (existing && existing.merchantId && existing.totalValue) {
        try {
          await db.merchant.update({
            where: { merchantId: existing.merchantId },
            data: {
              totalShrinkageValue: { increment: existing.totalValue },
            },
          })
        } catch (merchantErr) {
          console.error('Merchant shrinkage debit failed (non-blocking):', merchantErr)
        }
      }
    }

    const shrinkageRecord = await db.shrinkageRecord.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(shrinkageRecord)
  } catch (error) {
    console.error('Error updating shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to update shrinkage record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.shrinkageRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to delete shrinkage record' }, { status: 500 })
  }
}
