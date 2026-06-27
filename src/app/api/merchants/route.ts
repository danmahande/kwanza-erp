import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const merchants = await db.merchant.findMany({
      where: {
        OR: [
          { businessName: { contains: search } },
          { contact: { contains: search } },
          { email: { contains: search } },
          { merchantId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(merchants)
  } catch (error) {
    console.error('Error fetching merchants:', error)
    return NextResponse.json({ error: 'Failed to fetch merchants' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.merchant.count()
    const merchantId = `MCH-${String(count + 1).padStart(4, '0')}`
    
    // Initialize cumulative values
    const merchant = await db.merchant.create({
      data: { 
        ...body, 
        merchantId,
        totalInboundValue: 0,
        totalSalesValue: 0,
        totalShrinkageValue: 0,
        totalReturnValue: 0,
        expectedPayment: 0,
        actualPayment: 0,
        pendingPayment: 0,
      },
    })
    return NextResponse.json(merchant, { status: 201 })
  } catch (error) {
    console.error('Error creating merchant:', error)
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    // Calculate updated cumulative values based on related records
    const merchant = await db.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new Error('Merchant not found');
    }
    
    // Calculate total inbound value from InboundRecord
    const totalInbounds = await db.inboundRecord.aggregate({
      where: { merchantId: merchant.merchantId },
      _sum: { inboundValue: true }
    });
    
    // Calculate total sales value from OutboundRecord
    const totalSales = await db.outboundRecord.aggregate({
      where: { businessName: merchant.businessName },
      _sum: { saleAmount: true }
    });
    
    // Calculate total shrinkage value from ShrinkageRecord
    const totalShrinkage = await db.shrinkageRecord.aggregate({
      where: { 
        productName: { in: (await db.product.findMany({
          where: { merchantName: merchant.businessName },
          select: { productLabel: true }
        })).map(p => p.productLabel) }
      },
      _sum: { qty: true }
    });
    
    // Calculate total return value from RTVRecord
    const totalReturns = await db.rTVRecord.aggregate({
      where: { merchantName: merchant.businessName },
      _sum: { qty: true }
    });
    
    // Calculate expected vs actual payments from MerchantPayment
    const totalExpected = await db.merchantPayment.aggregate({
      where: { merchantName: merchant.businessName },
      _sum: { amount: true }
    });
    
    const totalActual = await db.merchantPayment.aggregate({
      where: { 
        merchantName: merchant.businessName,
        status: 'completed' // Assuming there's a status field
      },
      _sum: { amount: true }
    });
    
    // Calculate pending payments
    const totalPending = totalExpected._sum.amount - totalActual._sum.amount;
    
    // Update the merchant with calculated cumulative values
    const updatedMerchant = await db.merchant.update({ 
      where: { id }, 
      data: {
        ...data,
        totalInboundValue: totalInbounds._sum.inboundValue || 0,
        totalSalesValue: totalSales._sum.saleAmount || 0,
        totalShrinkageValue: totalShrinkage._sum.qty || 0, // Using qty for now, could be multiplied by cost
        totalReturnValue: totalReturns._sum.qty || 0, // Using qty for now, could be multiplied by selling price
        expectedPayment: totalExpected._sum.amount || 0,
        actualPayment: totalActual._sum.amount || 0,
        pendingPayment: Math.max(0, totalPending),
        updatedAt: new Date(),
      }
    })
    
    return NextResponse.json(updatedMerchant)
  } catch (error) {
    console.error('Error updating merchant:', error)
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.merchant.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting merchant:', error)
    return NextResponse.json({ error: 'Failed to delete merchant' }, { status: 500 })
  }
}