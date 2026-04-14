import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const payments = await db.merchantPayment.findMany({
      where: {
        OR: [
          { merchantName: { contains: search } },
          { reference: { contains: search } },
          { paymentId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(payments)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.merchantPayment.count()
    const paymentId = `PAY-${String(count + 1).padStart(3, '0')}`
    const payment = await db.merchantPayment.create({
      data: { ...body, paymentId },
    })
    return NextResponse.json(payment, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    const payment = await db.merchantPayment.update({ where: { id }, data })
    return NextResponse.json(payment)
  } catch {
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.merchantPayment.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
  }
}
