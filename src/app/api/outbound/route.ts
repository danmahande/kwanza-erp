import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const records = await db.outboundRecord.findMany({
      where: {
        OR: [
          { customerName: { contains: search } },
          { productName: { contains: search } },
          { outboundId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch outbound records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.outboundRecord.count()
    const outboundId = `OUT-${String(count + 1).padStart(3, '0')}`
    
    // Update product stock
    if (body.productId && body.qty) {
      await db.product.update({
        where: { productId: body.productId },
        data: { currentStock: { decrement: body.qty } },
      })
    }
    
    const record = await db.outboundRecord.create({
      data: { ...body, outboundId },
    })
    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create outbound record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    const record = await db.outboundRecord.update({ where: { id }, data })
    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update outbound record' }, { status: 500 })
  }
}
