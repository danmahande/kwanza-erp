import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Products API — Production-hardened
 *
 * Every mutation is audited. Input is validated. IDs use timestamp+random.
 * Price changes are tracked in ProductPriceHistory. DELETE checks for
 * dependent records (inbound, outbound, RTV, shrinkage) and blocks if
 * stock > 0 or any history exists.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const merchantId = req.nextUrl.searchParams.get('merchantId') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { productLabel: { contains: search } },
        { category: { contains: search } },
        { productId: { contains: search } },
        { merchantName: { contains: search } },
        { brand: { contains: search } },
      ]
    }
    if (merchantId) where.merchantId = merchantId

    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
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
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.productLabel || !body.productLabel.trim()) {
      return NextResponse.json({ error: 'productLabel is required' }, { status: 400 })
    }
    if (!body.merchantId) {
      return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
    }
    if (!body.category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }

    const unitCost = parseFloat(String(body.unitCost)) || 0
    const unitSellingPrice = parseFloat(String(body.unitSellingPrice)) || 0

    if (unitCost < 0 || unitSellingPrice < 0) {
      return NextResponse.json({ error: 'Prices cannot be negative' }, { status: 400 })
    }

    // Block LIFO at API layer — IAS 2 §25 prohibits it
    const VALID_COSTING_METHODS = ['fifo', 'avco', 'standard', 'specific_id']
    if (body.costingMethod && !VALID_COSTING_METHODS.includes(body.costingMethod)) {
      return NextResponse.json(
        { error: `Invalid costing method. Permitted: ${VALID_COSTING_METHODS.join(', ')}. LIFO is prohibited under IAS 2 §25.` },
        { status: 400 },
      )
    }

    // Warn (not block) if selling price < cost (loss-making product)
    let priceWarning: string | null = null
    if (unitSellingPrice > 0 && unitCost > 0 && unitSellingPrice < unitCost) {
      priceWarning = `WARNING: Selling price (${unitSellingPrice}) is below unit cost (${unitCost}). This product will be sold at a loss.`
    }

    // Verify merchant exists
    const merchant = await db.merchant.findUnique({
      where: { merchantId: body.merchantId },
      select: { businessName: true },
    })
    if (!merchant) {
      return NextResponse.json({
        error: `Merchant "${body.merchantId}" does not exist`,
        code: 'MERCHANT_NOT_FOUND',
      }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE
    // ═══════════════════════════════════════════════════════════════

    const prodTs = Date.now().toString(36).toUpperCase()
    const prodRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const productId = `PRD-${prodTs}-${prodRand}`

    const product = await db.product.create({
      data: {
        ...body,
        productId,
        productLabel: body.productLabel.trim(),
        merchantName: merchant.businessName,
        unitCost,
        unitSellingPrice,
      },
    })

    await logAudit({
      action: 'PRODUCT_CREATED',
      module: 'products',
      entityId: productId,
      details: `Created product ${body.productLabel} (${productId}) for merchant ${merchant.businessName}. Category: ${body.category}. Cost: ${unitCost}, Price: ${unitSellingPrice}.${priceWarning ? ' ' + priceWarning : ''}`,
    })

    return NextResponse.json({ ...product, priceWarning }, { status: 201 })
  } catch (error) {
    console.error('Product create error:', error)
    return NextResponse.json({
      error: 'Failed to create product',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.product.findUnique({
      where: { id },
      select: { productId: true, productLabel: true, unitSellingPrice: true, unitCost: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Validate prices if being changed
    if (data.unitSellingPrice !== undefined) {
      const price = parseFloat(String(data.unitSellingPrice))
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: 'unitSellingPrice must be a non-negative number' }, { status: 400 })
      }
      data.unitSellingPrice = price
    }
    if (data.unitCost !== undefined) {
      const cost = parseFloat(String(data.unitCost))
      if (isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 })
      }
      data.unitCost = cost
    }

    // Block LIFO at API layer — IAS 2 §25 prohibits it
    const VALID_COSTING_METHODS = ['fifo', 'avco', 'standard', 'specific_id']
    if (data.costingMethod !== undefined && !VALID_COSTING_METHODS.includes(data.costingMethod)) {
      return NextResponse.json(
        { error: `Invalid costing method. Permitted: ${VALID_COSTING_METHODS.join(', ')}. LIFO is prohibited under IAS 2 §25.` },
        { status: 400 },
      )
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — record price history + update product
    // ═══════════════════════════════════════════════════════════════

    const newPrice = data.unitSellingPrice !== undefined ? data.unitSellingPrice : existing.unitSellingPrice
    const newCost = data.unitCost !== undefined ? data.unitCost : existing.unitCost
    const priceChanged = newPrice !== existing.unitSellingPrice || newCost !== existing.unitCost

    const product = await db.$transaction(async (tx) => {
      // Record price history if selling price or cost changed
      if (priceChanged) {
        await tx.productPriceHistory.create({
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
      }

      const updated = await tx.product.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      })
      return updated
    })

    // Audit — track what changed
    const changes: string[] = []
    if (data.productLabel && data.productLabel !== existing.productLabel) changes.push(`label: ${existing.productLabel} → ${data.productLabel}`)
    if (priceChanged) changes.push(`price: ${existing.unitSellingPrice} → ${newPrice}, cost: ${existing.unitCost} → ${newCost}`)
    if (data.isActive !== undefined && data.isActive !== (await db.product.findUnique({ where: { id }, select: { isActive: true } }))?.isActive) changes.push(`active: ${data.isActive}`)
    if (data.category !== undefined && data.category !== existing.productId) changes.push(`category changed`)
    if (changes.length === 0) changes.push(Object.keys(data).join(', '))

    await logAudit({
      action: 'PRODUCT_UPDATED',
      module: 'products',
      entityId: existing.productId,
      details: `Product ${existing.productLabel} (${existing.productId}): ${changes.join(', ')}. By ${_user.name}.`,
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Product update error:', error)
    return NextResponse.json({
      error: 'Failed to update product',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const product = await db.product.findUnique({
      where: { id },
      select: { productId: true, productLabel: true, currentStock: true },
    })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    // Block if stock > 0
    if (product.currentStock > 0) {
      return NextResponse.json({
        error: `Cannot delete "${product.productLabel}" — ${product.currentStock} units are currently in stock`,
        suggestion: 'Set the product to inactive instead, or reduce stock to zero first.',
        code: 'HAS_STOCK',
      }, { status: 409 })
    }

    // Block if any dependent records exist
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
        code: 'HAS_DEPENDENCIES',
      }, { status: 409 })
    }

    await db.product.delete({ where: { id } })

    await logAudit({
      action: 'PRODUCT_DELETED',
      module: 'products',
      entityId: product.productId,
      details: `Deleted product ${product.productLabel} (${product.productId}). No stock, no dependent records. By ${_user.name}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Product delete error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
