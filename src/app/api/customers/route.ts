import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const customers = await db.customer.findMany({
      where: {
        OR: [
          { name: { contains: search } },
          { contact: { contains: search } },
          { customerId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(customers)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.customer.count()
    const customerId = `CUS-${String(count + 1).padStart(3, '0')}`
    const customer = await db.customer.create({
      data: { ...body, customerId },
    })
    return NextResponse.json(customer, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
