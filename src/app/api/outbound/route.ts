import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
    
    const records = await db.outboundRecord.findMany({
      where: {
        OR: [
          { customerName: { contains: search } },
          { customerContact: { contains: search } },
          { productName: { contains: search } },
          { orderNumber: { contains: search } },
          { trackingNumber: { contains: search } },
          { businessName: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
    
    return NextResponse.json(records)
  } catch (error) {
    console.error('Error fetching outbound records:', error)
    return NextResponse.json({ error: 'Failed to fetch outbound records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.outboundRecord.count()
    const outboundId = `OUT${String(count + 1).padStart(6, '0')}`
    
    // Generate tracking number if not provided
    const trackingNumber = body.trackingNumber || `TRK-${Date.now()}`
    
    // Generate order number if not provided
    const orderNumber = body.orderNumber || `ORD-${String(count + 1).padStart(4, '0')}`
    
    // Update product stock
    if (body.productId) {
      await db.product.update({
        where: { productId: body.productId },
        data: { currentStock: { decrement: body.qty } },
      })
    }
    
    const record = await db.outboundRecord.create({
      data: {
        ...body,
        outboundId,
        trackingNumber,
        orderNumber,
      },
    })
    
    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Error creating outbound record:', error)
    return NextResponse.json({ error: 'Failed to create outbound record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    const record = await db.outboundRecord.update({
      where: { id },
      data,
    })
    
    return NextResponse.json(record)
  } catch (error) {
    console.error('Error updating outbound record:', error)
    return NextResponse.json({ error: 'Failed to update outbound record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.outboundRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete outbound record' }, { status: 500 })
  }
}