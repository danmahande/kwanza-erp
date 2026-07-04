import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // G: Record price history if selling price or cost changed
    if (data.unitSellingPrice !== undefined || data.unitCost !== undefined) {
      const existing = await db.product.findUnique({
        where: { id },
        select: { productId: true, productLabel: true, unitSellingPrice: true, unitCost: true },
      })
      if (existing) {
        const newPrice = data.unitSellingPrice !== undefined ? parseFloat(String(data.unitSellingPrice)) : existing.unitSellingPrice
        const newCost = data.unitCost !== undefined ? parseFloat(String(data.unitCost)) : existing.unitCost
        if (newPrice !== existing.unitSellingPrice || newCost !== existing.unitCost) {
          try {
            await db.productPriceHistory.create({
              data: {
                productId: existing.productId,
                productName: existing.productLabel,
                oldPrice: existing.unitSellingPrice,
                newPrice,
                oldCost: existing.unitCost,
                newCost,
                changedBy: _user.name,
              },
            })
          } catch (histErr) {
            console.error('Price history recording failed (non-blocking):', histErr)
          }
        }
      }
    }

    const product = await db.product.update({ where: { id }, data })
    return NextResponse.json(product)
  } catch {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as import('@/lib/auth-api').AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // F3: Check for existing records before deleting
    const product = await db.product.findUnique({ where: { id: id! }, select: { productId: true, productLabel: true, currentStock: true } })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    if (product.currentStock > 0) {
      return NextResponse.json({
        error: `Cannot delete "${product.productLabel}" — ${product.currentStock} units are currently in stock`,
        suggestion: 'Set the product to inactive instead, or reduce stock to zero first.',
      }, { status: 409 })
    }

    const [inbounds, outbounds, rtvs, shrinkage] = await Promise.all([
      db.inboundRecord.count({ where: { productId: product.productId } }),
      db.outboundRecord.count({ where: { productId: product.productId } }),
      db.rTVRecord.count({ where: { productId: product.productId } }),
      db.shrinkageRecord.count({ where: { productId: product.productId } }),
    ])
    const totalDeps = inbounds + outbounds + rtvs + shrinkage

    if (totalDeps > 0) {
      const details: string[] = []
      if (inbounds) details.push(`${inbounds} inbound records`)
      if (outbounds) details.push(`${outbounds} outbound records`)
      if (rtvs) details.push(`${rtvs} RTV records`)
      if (shrinkage) details.push(`${shrinkage} shrinkage records`)
      return NextResponse.json({
        error: `Cannot delete "${product.productLabel}" — ${totalDeps} dependent records exist`,
        details,
        suggestion: 'Set the product to inactive instead.',
      }, { status: 409 })
    }

    await db.product.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
