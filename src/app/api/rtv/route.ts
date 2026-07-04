import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const records = await db.rTVRecord.findMany({
      where: {
        OR: [
          { merchantName: { contains: search } },
          { productName: { contains: search } },
          { rtvId: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch RTV records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()
    const count = await db.rTVRecord.count()
    const rtvId = `RTV-${String(count + 1).padStart(3, '0')}`
    const record = await db.rTVRecord.create({
      data: { ...body, rtvId },
    })

    // Decrement product stock — goods are leaving the warehouse
    if (body.productId && body.qty) {
      try {
        await db.product.update({
          where: { productId: body.productId },
          data: { currentStock: { decrement: parseInt(body.qty) } },
        })
      } catch (productErr) {
        console.error('Product stock decrement failed (non-blocking):', productErr)
      }
    }

    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create RTV record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, ...data } = body
    const record = await db.rTVRecord.update({ where: { id }, data })
    return NextResponse.json(record)
  } catch {
    return NextResponse.json({ error: 'Failed to update RTV record' }, { status: 500 })
  }
}
