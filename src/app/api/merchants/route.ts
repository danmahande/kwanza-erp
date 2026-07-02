import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const deliveryType = req.nextUrl.searchParams.get('deliveryType') || ''
    const status = req.nextUrl.searchParams.get('status') || ''

    const where: Record<string, unknown> = {
      OR: [
        { businessName: { contains: search } },
        { contact: { contains: search } },
        { merchantId: { contains: search } },
        { email: { contains: search } },
        { contactPerson: { contains: search } },
      ],
    }
    if (deliveryType) where.deliveryType = deliveryType
    if (status === 'active') where.isActive = true
    if (status === 'inactive') where.isActive = false

    const merchants = await db.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Enrich with product count and order count per merchant (#9, #10)
    const enriched = await Promise.all(merchants.map(async (m) => {
      const productCount = await db.product.count({ where: { merchantId: m.merchantId, isActive: true } })
      const orderCount = await db.outboundRecord.count({ where: { vendorId: m.merchantId } })
      const lastInbound = await db.inboundRecord.findFirst({
        where: { merchantId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const lastOutbound = await db.outboundRecord.findFirst({
        where: { vendorId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const lastPayment = await db.merchantPayment.findFirst({
        where: { merchantId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      return {
        ...m,
        productCount,
        orderCount,
        lastInboundAt: lastInbound?.createdAt || null,
        lastOutboundAt: lastOutbound?.createdAt || null,
        lastPaymentAt: lastPayment?.createdAt || null,
      }
    }))

    return NextResponse.json(enriched)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch merchants' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.merchant.count()
    const merchantId = `MCH-${String(count + 1).padStart(3, '0')}`
    const merchant = await db.merchant.create({
      data: { ...body, merchantId },
    })
    await logAudit({
      action: 'CREATE',
      module: 'merchants',
      entityId: merchantId,
      details: `Created merchant ${merchant.businessName} (${merchantId})`,
    })
    return NextResponse.json(merchant, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    const merchant = await db.merchant.update({ where: { id }, data })
    await logAudit({
      action: 'UPDATE',
      module: 'merchants',
      entityId: merchant.merchantId,
      details: `Updated merchant ${merchant.businessName}`,
    })
    return NextResponse.json(merchant)
  } catch {
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.merchant.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete merchant' }, { status: 500 })
  }
}
