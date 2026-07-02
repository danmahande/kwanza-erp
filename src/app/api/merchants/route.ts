import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const merchants = await db.merchant.findMany({
      where: {
        OR: [
          { businessName: { contains: search } },
          { contact: { contains: search } },
          { merchantId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(merchants)
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
