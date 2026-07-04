import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    // Check merchant hold — same gate as inbound + order processing
    if (body.vendorId) {
      const merchant = await db.merchant.findUnique({
        where: { merchantId: body.vendorId },
        select: { businessName: true, isOnHold: true, holdReason: true },
      })
      if (merchant?.isOnHold) {
        return NextResponse.json({
          error: 'Merchant on hold',
          reason: merchant.holdReason || 'Overdue balance / dispute',
          merchantName: merchant.businessName,
          code: 'MERCHANT_ON_HOLD',
        }, { status: 409 })
      }
    }

    const count = await db.outboundRecord.count()
    const outboundId = `OUT-${String(count + 1).padStart(3, '0')}`
    
    // Update product stock — check sufficient stock first
    if (body.productId && body.qty) {
      const product = await db.product.findUnique({
        where: { productId: body.productId },
        select: { currentStock: true, productLabel: true },
      })
      if (product && product.currentStock < body.qty) {
        return NextResponse.json({
          error: 'Insufficient stock',
          details: `${product.productLabel}: only ${product.currentStock} units available, but outbound requires ${body.qty}`,
        }, { status: 409 })
      }
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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body
    const record = await db.outboundRecord.update({ where: { id }, data })
    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update outbound record' }, { status: 500 })
  }
}
