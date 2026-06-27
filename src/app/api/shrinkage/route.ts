import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
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
    const body = await req.json()
    const count = await db.shrinkageRecord.count()
    const shrinkageId = `SH-${String(count + 1).padStart(4, '0')}`

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
        ...body,
        shrinkageId,
        merchantId,
        merchantName,
        unitCost,
        totalValue,
        status: body.status || 'pending',
        debitMerchant: body.debitMerchant ?? false,
      },
    })

    // If this shrinkage is linked to an RTV, update the RTV record accordingly
    if (body.rtvId) {
      const rtvRecord = await db.rTVRecord.findUnique({
        where: { id: body.rtvId }
      });

      if (rtvRecord) {
        // Update RTV record to reflect shrinkage details
        await db.rTVRecord.update({
          where: { id: body.rtvId },
          data: {
            status: 'processed',
            processedBy: body.reportedBy || 'system'
          }
        });
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
    const body = await req.json()
    const { id, ...data } = body

    // ===========================================================================
    // Workflow 4: on resolution with debitMerchant=true, update the merchant's
    // totalShrinkageValue cumulative figure so it shows up on their next statement.
    // ===========================================================================
    if (data.status === 'resolved' && !data.resolvedBy) {
      data.resolvedBy = 'current_user' // TODO: replace with real session
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
      }
    })

    return NextResponse.json(shrinkageRecord)
  } catch (error) {
    console.error('Error updating shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to update shrinkage record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.shrinkageRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to delete shrinkage record' }, { status: 500 })
  }
}