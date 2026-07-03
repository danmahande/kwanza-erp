import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const year = req.nextUrl.searchParams.get('year') || ''
    const month = req.nextUrl.searchParams.get('month') || ''
    const day = req.nextUrl.searchParams.get('day') || ''

    const where: Record<string, unknown> = {
      OR: [
        { merchantName: { contains: search } },
        { reference: { contains: search } },
        { paymentId: { contains: search } },
      ],
    }
    if (year) where.year = parseInt(year)
    if (month) where.month = parseInt(month)
    if (day) where.day = parseInt(day)

    const payments = await db.merchantPayment.findMany({
      where,
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

    // Set year/month/day from current date for filtering
    const now = new Date()
    const paymentData = {
      ...body,
      paymentId,
      year: body.year || now.getFullYear(),
      month: body.month || (now.getMonth() + 1),
      day: body.day || now.getDate(),
      deductions: body.deductions || 0,
      netAmount: body.netAmount || (body.amount - (body.deductions || 0)),
    }

    const payment = await db.merchantPayment.create({ data: paymentData })

    // Update merchant cumulative figures (only for positive payments, not credit memos)
    if (payment.amount > 0 && payment.merchantId) {
      await db.merchant.update({
        where: { merchantId: payment.merchantId },
        data: {
          actualPayment: { increment: payment.amount },
          pendingPayment: { decrement: payment.amount },
        },
      }).catch(() => { /* merchant may not exist */ })
    }

    await logAudit({
      action: 'CREATE',
      module: 'payments',
      entityId: paymentId,
      details: `Recorded payment ${paymentId} for ${payment.merchantName}: ${payment.amount} (net: ${payment.netAmount})`,
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to create payment', detail: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body

    // Recalculate netAmount if amount or deductions changed
    if (data.amount !== undefined || data.deductions !== undefined) {
      const existing = await db.merchantPayment.findUnique({ where: { id } })
      if (existing) {
        const amt = data.amount !== undefined ? parseFloat(String(data.amount)) : existing.amount
        const ded = data.deductions !== undefined ? parseFloat(String(data.deductions)) : (existing.deductions || 0)
        data.netAmount = amt - ded
      }
    }

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
