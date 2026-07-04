import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Ops Search API
 *
 * GET /api/ops-search?q=bread
 *
 * Searches for products by name (label, brand, variant, category) and returns
 * ONLY those products that currently have at least one order being processed
 * today (or in any active, non-terminal state). For each matching product,
 * returns the list of active DS/ORD numbers tied to it, with their current
 * stage so the worker can see where each parcel is.
 *
 * Active = outbound records whose status is NOT in the terminal set
 * (delivered, returned, failed, cancelled) UNLESS delivered today.
 *
 * Response shape:
 *   {
 *     query: "bread",
 *     results: [
 *       {
 *         productId: "P001",
 *         productName: "Bread 800g",
 *         brand: "Farmers Bakery",
 *         variant: "800g",
 *         merchantName: "Farmers Bakery",
 *         currentStock: 240,
 *         orders: [
 *           {
 *             id: "DS-014",                  // orderNumber || outboundId
 *             customerName: "Akinyi's Shop",
 *             customerAddress: "Kampala Road",
 *             qty: 12,
 *             status: "packing",             // raw outbound status
 *             stage: "Sort & Pack",          // human label
 *             stageKey: "sort",              // station key for UI navigation
 *             codCollected: 24000,
 *             assignedDriver: "John",
 *             runsheetId: null,
 *             createdAt: "...",
 *             dispatchedAt: null,
 *             deliveredAt: null
 *           },
 *           ...
 *         ]
 *       }
 *     ],
 *     totalOrders: 7
 *   }
 */

// Outbound statuses that are "done" — we don't surface them unless they
// happened today. This keeps the desk focused on live work.
const TERMINAL_STATUSES = ['returned', 'failed', 'cancelled']

// Map an outbound status to a station key + human label, mirroring the
// STATIONS array in HubTodayModule.tsx. Keep these in sync.
function statusToStage(status: string): { stageKey: string; stageLabel: string } {
  switch (status) {
    case 'pending':
    case 'picking':
    case 'picked':
    case 'packing':
      return { stageKey: 'sort', stageLabel: 'Sort & Pack' }
    case 'packed':
      return { stageKey: 'stage', stageLabel: 'Staging' }
    case 'dispatched':
      return { stageKey: 'dispatch', stageLabel: 'Dispatch' }
    case 'delivered':
      return { stageKey: 'delivered', stageLabel: 'Delivered' }
    case 'returned':
    case 'failed':
    case 'cancelled':
      return { stageKey: 'returns', stageLabel: 'Returns / Exception' }
    default:
      return { stageKey: 'sort', stageLabel: status }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()

    if (!q || q.length < 1) {
      return NextResponse.json({ query: q, results: [], totalOrders: 0 })
    }
    if (q.length > 100) {
      return NextResponse.json({ error: 'Query too long' }, { status: 400 })
    }

    // ── Compute "today" bounds (used to include today's delivered parcels) ──
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // ── 1. Find matching products ──
    // Match on label, brand, variant, or category. Case-insensitive contains.
    // (SQLite's LIKE is case-insensitive for ASCII by default, so no `mode` needed.)
    const products = await db.product.findMany({
      where: {
        isActive: true,
        OR: [
          { productLabel: { contains: q } },
          { brand: { contains: q } },
          { variant: { contains: q } },
          { category: { contains: q } },
        ],
      },
      select: {
        productId: true,
        productLabel: true,
        brand: true,
        variant: true,
        merchantName: true,
        category: true,
        currentStock: true,
        unit: true,
      },
      take: 30, // safety cap
    })

    if (products.length === 0) {
      return NextResponse.json({ query: q, results: [], totalOrders: 0 })
    }

    // ── 2. Find active outbound records for those products ──
    // Active = not in terminal state, OR delivered today.
    const productIds = products.map(p => p.productId)
    const records = await db.outboundRecord.findMany({
      where: {
        productId: { in: productIds },
        OR: [
          { status: { notIn: [...TERMINAL_STATUSES, 'delivered'] } },
          { status: 'delivered', deliveredAt: { gte: todayStart } },
        ],
      },
      select: {
        id: true,
        outboundId: true,
        orderNumber: true,
        customerName: true,
        customerAddress: true,
        productName: true,
        productId: true,
        qty: true,
        saleAmount: true,
        codCollected: true,
        status: true,
        assignedDriver: true,
        runsheetId: true,
        createdAt: true,
        dispatchedAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // ── 3. Group records by product ──
    const recordsByProduct = new Map<string, typeof records>()
    for (const r of records) {
      const arr = recordsByProduct.get(r.productId) || []
      arr.push(r)
      recordsByProduct.set(r.productId, arr)
    }

    // ── 4. Build response — only include products that have at least one active order ──
    const results = products
      .map(p => {
        const productRecords = recordsByProduct.get(p.productId) || []
        const orders = productRecords.map(r => {
          const stage = statusToStage(r.status)
          return {
            id: String(r.orderNumber || r.outboundId),
            customerName: r.customerName,
            customerAddress: r.customerAddress || null,
            qty: r.qty,
            status: r.status,
            stage: stage.stageLabel,
            stageKey: stage.stageKey,
            codCollected: r.codCollected ?? null,
            saleAmount: r.saleAmount ?? null,
            assignedDriver: r.assignedDriver || null,
            runsheetId: r.runsheetId || null,
            createdAt: r.createdAt,
            dispatchedAt: r.dispatchedAt || null,
            deliveredAt: r.deliveredAt || null,
          }
        })
        return {
          productId: p.productId,
          productName: p.productLabel,
          brand: p.brand,
          variant: p.variant,
          merchantName: p.merchantName,
          category: p.category,
          unit: p.unit,
          currentStock: p.currentStock,
          orders,
        }
      })
      .filter(p => p.orders.length > 0) // only products being processed

    const totalOrders = results.reduce((sum, r) => sum + r.orders.length, 0)

    return NextResponse.json({
      query: q,
      results,
      totalOrders,
    })
  } catch (error) {
    console.error('Error in ops-search:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
