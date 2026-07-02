import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const products = await db.product.findMany({
      where: {
        OR: [
          { productLabel: { contains: search } },
          { category: { contains: search } },
          { productId: { contains: search } },
          { merchantName: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(products)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.product.count()
    const productId = `PRD-${String(count + 1).padStart(3, '0')}`
    const product = await db.product.create({
      data: { ...body, productId },
    })
    return NextResponse.json(product, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    const product = await db.product.update({ where: { id }, data })
    return NextResponse.json(product)
  } catch {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.product.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
