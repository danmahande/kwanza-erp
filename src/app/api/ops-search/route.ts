import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Ops Search API
 *
 * GET /api/ops-search?q=bread
 *
 * Multi-field, token-based, ranked search across:
 *   - Products   (label, brand, variant, category, merchantName)
 *   - Orders     (orderNumber, outboundId, customerName, customerContact, productName)
 *
 * Returns ONLY products that currently have at least one active order, with
 * their orders (capped at PER_PRODUCT_ORDER_CAP per product; excess counted
 * in `moreOrdersCount`). Each order carries `matchedQuery` (true if the order
 * itself matched the query, false if it's just a context order from the same
 * product).
 *
 * Active = outbound records whose status is NOT terminal
 * (returned, failed, cancelled) UNLESS delivered today.
 *
 * Algorithm:
 *   1. Tokenize query on whitespace + punctuation
 *   2. Broad Prisma fetch: products OR orders containing ANY token
 *      (SQLite LIKE is case-insensitive for ASCII)
 *   3. Collect product IDs from both passes; fetch full product info +
 *      ALL active orders for those products (context)
 *   4. Score each entity: for each query token, find its best score across
 *      the entity's fields. All tokens must match somewhere (min > 0).
 *      Score tiers:
 *        100  exact field match       ("bread" matches "Bread")
 *         80  field starts with query  ("bread" matches "Bread 800g")
 *         60  exact word match         ("bread" matches word "bread" in "Garlic Bread")
 *         40  word starts with token   ("brea" matches word "bread")
 *         30  normalized substring     ("DS014" matches "DS-014")
 *         20  word contains token      ("oil" matches word "boiled")
 *          0  no match for this token  → entity score = 0
 *   5. Filter entities with score >= MIN_SCORE_THRESHOLD (kills "oil" → "Boiled Eggs")
 *   6. Sort products: score desc, then stale-order count desc, then total orders desc
 *   7. Within each product, sort orders:
 *        - matched orders first (orderScore desc)
 *        - then stale first
 *        - then newest first
 *   8. Cap orders per product; track moreOrdersCount
 */

// ── Constants ──

const TERMINAL_STATUSES = ['returned', 'failed', 'cancelled']

const PER_PRODUCT_ORDER_CAP = 10
const MIN_SCORE_THRESHOLD = 30   // filters out weak substring matches
const MAX_PRODUCTS = 30          // safety cap on final result set
const MAX_CANDIDATE_PRODUCTS = 200
const MAX_CANDIDATE_ORDERS = 200
const MAX_ACTIVE_ORDERS_FETCH = 500

// Stale thresholds (minutes) per stage — keep in sync with frontend
const STALE_THRESHOLDS: Record<string, number> = {
  sort: 120,
  stage: 240,
  dispatch: 120,
  inTransit: 360,
}

// ── Helpers ──

// Map an outbound status to a station key + human label.
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

// Compute minutes since the order entered its current stage + isStale flag
function computeStageEntryMinutes(
  status: string,
  stageKey: string,
  createdAt: Date,
  dispatchedAt: Date | null,
  deliveredAt: Date | null,
  now: Date,
): { entryMinutes: number | null; isStale: boolean } {
  let entryTime: Date | null = null
  switch (stageKey) {
    case 'sort':
    case 'stage':
      entryTime = createdAt
      break
    case 'dispatch':
    case 'inTransit':
      entryTime = dispatchedAt
      break
    case 'delivered':
      entryTime = deliveredAt
      break
    default:
      return { entryMinutes: null, isStale: false }
  }
  if (!entryTime) return { entryMinutes: null, isStale: false }
  const entryMinutes = Math.floor((now.getTime() - new Date(entryTime).getTime()) / 60000)
  const threshold = STALE_THRESHOLDS[stageKey]
  const isStale = threshold != null && entryMinutes > threshold && stageKey !== 'delivered'
  return { entryMinutes, isStale }
}

// Split a string into lowercase alphanumeric tokens (split on whitespace + punctuation)
function tokenize(s: string): string[] {
  return s.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0)
}

// Split a field value into lowercase words
function splitWords(s: string | null | undefined): string[] {
  if (!s) return []
  return s.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 0)
}

// Strip non-alphanumeric chars, lowercase — for normalized substring match
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Score an entity against the query tokens.
// For each token, find its best score across all provided fields.
// All tokens must match somewhere (min > 0) for the entity to score above 0.
// Tiered scoring (see header comment for full table).
function scoreEntity(queryTokens: string[], fields: Array<string | null | undefined>): number {
  if (queryTokens.length === 0) return 0
  let minTokenScore = Infinity
  for (const qt of queryTokens) {
    let bestForToken = 0
    for (const f of fields) {
      if (!f) continue
      const value = f.toLowerCase().trim()
      if (!value) continue

      // Exact field match
      if (value === qt) { bestForToken = Math.max(bestForToken, 100); continue }
      // Field starts with token
      if (value.startsWith(qt)) { bestForToken = Math.max(bestForToken, 80); continue }

      // Word-level match
      const fieldWords = splitWords(f)
      for (const w of fieldWords) {
        if (w === qt) { bestForToken = Math.max(bestForToken, 60); break }
        if (w.startsWith(qt)) { bestForToken = Math.max(bestForToken, 40); break }
        // Word-contains-token only for tokens >= 3 chars (avoids "a" matching everything)
        if (qt.length >= 3 && w.includes(qt)) { bestForToken = Math.max(bestForToken, 20); break }
      }
      if (bestForToken >= 60) continue

      // Normalized substring (catches "DS014" → "DS-014", "oil500" → "Oil 500ml")
      if (qt.length >= 3) {
        const nv = normalize(f)
        const nt = normalize(qt)
        if (nt.length >= 3 && nv.includes(nt)) {
          bestForToken = Math.max(bestForToken, 30)
        }
      }
    }
    if (bestForToken === 0) return 0 // every token must match somewhere
    minTokenScore = Math.min(minTokenScore, bestForToken)
  }
  return minTokenScore === Infinity ? 0 : minTokenScore
}

// ── Shared select shapes (so the two findMany calls return the same type) ──
const ORDER_SELECT = {
  id: true,
  outboundId: true,
  orderNumber: true,
  customerName: true,
  customerContact: true,
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
} as const

const PRODUCT_SELECT = {
  productId: true,
  productLabel: true,
  brand: true,
  variant: true,
  merchantName: true,
  category: true,
  currentStock: true,
  unit: true,
} as const

// Active-order OR clause (used in multiple queries)
function activeOrderClause(todayStart: Date) {
  return {
    OR: [
      { status: { notIn: [...TERMINAL_STATUSES, 'delivered'] } },
      { status: 'delivered', deliveredAt: { gte: todayStart } },
    ],
  }
}

// ── Main handler ──

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

    const queryTokens = tokenize(q)
    if (queryTokens.length === 0) {
      return NextResponse.json({ query: q, results: [], totalOrders: 0 })
    }

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // ── Step 1: Broad fetch — candidate products by product fields ──
    // For each token, OR across all product search fields. SQLite LIKE is
    // case-insensitive for ASCII, so no `mode: 'insensitive'` needed.
    const productTokenConditions = queryTokens.flatMap(t => [
      { productLabel: { contains: t } },
      { brand: { contains: t } },
      { variant: { contains: t } },
      { category: { contains: t } },
      { merchantName: { contains: t } },
    ])

    const candidateProducts = await db.product.findMany({
      where: { isActive: true, OR: productTokenConditions },
      select: PRODUCT_SELECT,
      take: MAX_CANDIDATE_PRODUCTS,
    })

    // ── Step 2: Broad fetch — candidate orders by order fields (only active) ──
    const orderTokenConditions = queryTokens.flatMap(t => [
      { orderNumber: { contains: t } },
      { outboundId: { contains: t } },
      { customerName: { contains: t } },
      { customerContact: { contains: t } },
      { productName: { contains: t } },
    ])

    const candidateOrders = await db.outboundRecord.findMany({
      where: { AND: [{ OR: orderTokenConditions }, activeOrderClause(todayStart)] },
      select: { ...ORDER_SELECT, productId: true },
      take: MAX_CANDIDATE_ORDERS,
    })

    // ── Step 3: Collect all product IDs from both passes ──
    const productIdsFromProducts = new Set(candidateProducts.map(p => p.productId))
    const productIdsFromOrders = new Set(
      candidateOrders.map(o => o.productId).filter((id): id is string => Boolean(id))
    )
    const allProductIds = new Set<string>([
      ...productIdsFromProducts,
      ...productIdsFromOrders,
    ])

    if (allProductIds.size === 0) {
      return NextResponse.json({ query: q, results: [], totalOrders: 0 })
    }

    // ── Step 4: Fetch any product records we don't already have ──
    const missingProductIds = Array.from(allProductIds).filter(id => !productIdsFromProducts.has(id))
    let additionalProducts: typeof candidateProducts = []
    if (missingProductIds.length > 0) {
      additionalProducts = await db.product.findMany({
        where: { productId: { in: missingProductIds } },
        select: PRODUCT_SELECT,
      })
    }
    const productMap = new Map<string, (typeof candidateProducts)[number]>()
    for (const p of [...candidateProducts, ...additionalProducts]) {
      productMap.set(p.productId, p)
    }

    // ── Step 5: Fetch ALL active orders for those products (for context) ──
    const allActiveOrders = await db.outboundRecord.findMany({
      where: {
        productId: { in: Array.from(allProductIds) },
        ...activeOrderClause(todayStart),
      },
      select: ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVE_ORDERS_FETCH,
    })

    // ── Step 6: Group orders by product ──
    const ordersByProduct = new Map<string, typeof allActiveOrders>()
    for (const o of allActiveOrders) {
      if (!o.productId) continue
      const arr = ordersByProduct.get(o.productId) || []
      arr.push(o)
      ordersByProduct.set(o.productId, arr)
    }

    // ── Step 7: Score products + their orders ──
    type ScoredOrder = {
      order: (typeof allActiveOrders)[number]
      stageKey: string
      stageLabel: string
      entryMinutes: number | null
      isStale: boolean
      orderScore: number
    }
    type ScoredProduct = {
      product: (typeof candidateProducts)[number]
      scoredOrders: ScoredOrder[]
      score: number
    }

    const scoredProducts: ScoredProduct[] = []

    for (const pid of allProductIds) {
      const product = productMap.get(pid)
      if (!product) continue // shouldn't happen, but guard

      const productOrders = ordersByProduct.get(pid) || []
      if (productOrders.length === 0) continue // no active orders = not relevant to ops desk

      // Score product fields (label, brand, variant, category, merchantName)
      const productScore = scoreEntity(queryTokens, [
        product.productLabel,
        product.brand,
        product.variant,
        product.category,
        product.merchantName,
      ])

      // Score each order
      const scoredOrders: ScoredOrder[] = productOrders.map(o => {
        const stage = statusToStage(o.status)
        let stageKey = stage.stageKey
        let stageLabel = stage.stageLabel
        if (o.status === 'dispatched' && o.dispatchedAt && new Date(o.dispatchedAt) >= todayStart) {
          stageKey = 'inTransit'
          stageLabel = 'In Transit'
        }
        const { entryMinutes, isStale } = computeStageEntryMinutes(
          o.status, stageKey, o.createdAt, o.dispatchedAt, o.deliveredAt, now,
        )
        const orderScore = scoreEntity(queryTokens, [
          o.orderNumber,
          o.outboundId,
          o.customerName,
          o.customerContact,
          o.productName,
        ])
        return { order: o, stageKey, stageLabel, entryMinutes, isStale, orderScore }
      })

      // Product score = max(product field score, best order score)
      const maxOrderScore = scoredOrders.reduce((m, so) => Math.max(m, so.orderScore), 0)
      const score = Math.max(productScore, maxOrderScore)

      scoredProducts.push({ product, scoredOrders, score })
    }

    // ── Step 8: Filter by threshold, sort, cap to MAX_PRODUCTS ──
    const filtered = scoredProducts
      .filter(r => r.score >= MIN_SCORE_THRESHOLD)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const aStale = a.scoredOrders.filter(so => so.isStale).length
        const bStale = b.scoredOrders.filter(so => so.isStale).length
        if (bStale !== aStale) return bStale - aStale
        return b.scoredOrders.length - a.scoredOrders.length
      })
      .slice(0, MAX_PRODUCTS)

    // ── Step 9: Build response — sort orders within each product, cap ──
    const results = filtered.map(r => {
      const sortedOrders = [...r.scoredOrders].sort((a, b) => {
        // Matched orders (score >= threshold) first
        const aMatched = a.orderScore >= MIN_SCORE_THRESHOLD ? 1 : 0
        const bMatched = b.orderScore >= MIN_SCORE_THRESHOLD ? 1 : 0
        if (bMatched !== aMatched) return bMatched - aMatched
        // Higher order score first
        if (b.orderScore !== a.orderScore) return b.orderScore - a.orderScore
        // Stale first
        if (a.isStale !== b.isStale) return a.isStale ? -1 : 1
        // Newest first
        const aTime = new Date(a.order.createdAt).getTime()
        const bTime = new Date(b.order.createdAt).getTime()
        return bTime - aTime
      })

      const moreOrdersCount = Math.max(0, sortedOrders.length - PER_PRODUCT_ORDER_CAP)
      const cappedOrders = sortedOrders.slice(0, PER_PRODUCT_ORDER_CAP)
      const p = r.product

      return {
        productId: p.productId,
        productName: p.productLabel,
        brand: p.brand,
        variant: p.variant,
        merchantName: p.merchantName,
        category: p.category,
        unit: p.unit,
        currentStock: p.currentStock,
        score: r.score,
        totalActiveOrders: sortedOrders.length,
        moreOrdersCount,
        orders: cappedOrders.map(so => ({
          id: String(so.order.orderNumber || so.order.outboundId),
          customerName: so.order.customerName,
          customerAddress: so.order.customerAddress || null,
          qty: so.order.qty,
          status: so.order.status,
          stage: so.stageLabel,
          stageKey: so.stageKey,
          codCollected: so.order.codCollected ?? null,
          saleAmount: so.order.saleAmount ?? null,
          assignedDriver: so.order.assignedDriver || null,
          runsheetId: so.order.runsheetId || null,
          createdAt: so.order.createdAt,
          dispatchedAt: so.order.dispatchedAt || null,
          deliveredAt: so.order.deliveredAt || null,
          entryMinutes: so.entryMinutes,
          isStale: so.isStale,
          matchedQuery: so.orderScore >= MIN_SCORE_THRESHOLD,
        })),
      }
    })

    // totalOrders counts ALL active orders (visible + hidden by cap)
    const totalOrders = results.reduce(
      (sum, r) => sum + r.orders.length + r.moreOrdersCount,
      0,
    )

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
