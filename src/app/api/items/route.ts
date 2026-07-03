import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

// GET /api/items — list inventory items with optional filters
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''
    const status = req.nextUrl.searchParams.get('status') || ''
    const productId = req.nextUrl.searchParams.get('productId') || ''
    const outboundId = req.nextUrl.searchParams.get('outboundId') || ''
    const itemId = req.nextUrl.searchParams.get('itemId') || ''
    const withEvents = req.nextUrl.searchParams.get('events') === 'true'

    const where: Record<string, unknown> = {}

    if (itemId) {
      const item = withEvents
        ? await db.inventoryItem.findUnique({
            where: { itemId },
            include: { events: { orderBy: { createdAt: 'asc' } } },
          })
        : await db.inventoryItem.findUnique({ where: { itemId } })
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      return NextResponse.json({ item })
    }

    if (search) {
      where.OR = [
        { itemId: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { variant: { contains: search, mode: 'insensitive' } },
        { outboundId: { contains: search, mode: 'insensitive' } },
        { inboundId: { contains: search, mode: 'insensitive' } },
        { merchantName: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (status) where.status = status
    if (productId) where.productId = productId
    if (outboundId) where.outboundId = outboundId

    const items = await db.inventoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Items fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }
}

// POST /api/items — create inventory items (called from inbound)
export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { items, performedBy } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
    }

    const created: Record<string, unknown>[] = []

    for (const item of items) {
      const { productId, productName, brand, variant, unitPrice, merchantId, merchantName, inboundId, storageLocation, expiryDate, trackingLevel, boxQty } = item

      if (!productId || !productName) continue

      const now = Date.now()
      const suffix = String(now).slice(-6) + String(Math.random()).slice(2, 5)
      const itemIdVal = `ITM-${suffix}`

      const createdItem = await db.inventoryItem.create({
        data: {
          itemId: itemIdVal,
          productId,
          productName,
          brand: brand || null,
          variant: variant || null,
          unitPrice: unitPrice || null,
          merchantId: merchantId || '',
          merchantName: merchantName || '',
          inboundId: inboundId || null,
          storageLocation: storageLocation || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          trackingLevel: trackingLevel || 'unit',
          boxQty: boxQty || null,
          status: 'IN_WAREHOUSE',
        },
      })

      // Log the RECEIVED event
      await db.itemEvent.create({
        data: {
          eventId: `EVT-${Date.now()}-${suffix}`,
          itemId: itemIdVal,
          eventType: 'RECEIVED',
          description: `Item received into warehouse${storageLocation ? ` at ${storageLocation}` : ''}`,
          performedBy: performedBy || 'system',
          inboundId: inboundId || null,
          previousStatus: null,
          newStatus: 'IN_WAREHOUSE',
        },
      })

      created.push(createdItem)
    }

    return NextResponse.json({ items: created, count: created.length }, { status: 201 })
  } catch (error) {
    console.error('Items create error:', error)
    return NextResponse.json({ error: 'Failed to create items' }, { status: 500 })
  }
}

// PUT /api/items — update item status or condition
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { itemId, status, condition, outboundId, runsheetId, assignedRider, performedBy, finalOutcome, cancellationReason, cancelledBy } = body

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    const existing = await db.inventoryItem.findUnique({ where: { itemId } })
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (condition !== undefined) updateData.condition = condition
    if (outboundId !== undefined) updateData.outboundId = outboundId
    if (runsheetId !== undefined) updateData.runsheetId = runsheetId
    if (assignedRider !== undefined) updateData.assignedRider = assignedRider
    if (finalOutcome !== undefined) updateData.finalOutcome = finalOutcome
    if (cancellationReason !== undefined) {
      updateData.cancellationReason = cancellationReason
      updateData.cancelledAt = new Date()
    }
    if (cancelledBy !== undefined) updateData.cancelledBy = cancelledBy

    const updated = await db.inventoryItem.update({
      where: { itemId },
      data: updateData,
    })

    // Auto-log event
    const eventType = status || condition || 'UPDATED'
    await db.itemEvent.create({
      data: {
        eventId: `EVT-${Date.now()}-${itemId.slice(-4)}`,
        itemId,
        eventType,
        description: `Item updated: ${Object.keys(updateData).join(', ')}`,
        performedBy: performedBy || 'system',
        outboundId: outboundId || null,
        runsheetId: runsheetId || null,
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    })

    return NextResponse.json({ item: updated })
  } catch (error) {
    console.error('Item update error:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}
