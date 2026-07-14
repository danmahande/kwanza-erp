import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import {
  computeProductValuation,
  holdingCostBreakdown,
  abcClassify,
  type ValuationSettings,
  type CostingMethod,
} from '@/lib/inventory-valuation'

/**
 * GET /api/inventory-valuation
 *
 * Returns the full Inventory Valuation dashboard payload:
 *   • settings            — global valuation parameters
 *   • kpis                — top-of-page KPI ribbon
 *   • holdingCost         — 4-component holding cost breakdown
 *   • products[]          — per-product valuation rows (FIFO/AVCO/Standard/NRV/variance/EOQ/ROP)
 *   • varianceRows[]      — material price variance per recent inbound
 *   • nrvRegister[]       — existing NRV write-downs & reversals
 *   • totals              — portfolio-level totals
 *
 * Source data:
 *   • Product                 (costing fields, stock levels)
 *   • InboundRecord           (qty + unitPrice, for FIFO layers and AVCO)
 *   • OutboundRecord          (delivered units + COGS, for turnover)
 *   • ShrinkageRecord         (qty + unitCost, for usage variance + outbound consumption)
 *   • NrvWriteDown            (NRV register)
 *   • InventoryValuationSetting (global rates)
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    // ── 1. Load settings (single-row table) ──
    let settingsRow = await db.inventoryValuationSetting.findUnique({ where: { key: 'default' } })
    if (!settingsRow) {
      settingsRow = await db.inventoryValuationSetting.create({ data: { key: 'default' } })
    }
    const settings: ValuationSettings = {
      defaultCostingMethod: (settingsRow.defaultCostingMethod as CostingMethod) || 'fifo',
      capitalCostRate: settingsRow.capitalCostRate,
      storageCostRate: settingsRow.storageCostRate,
      riskCostRate: settingsRow.riskCostRate,
      serviceCostRate: settingsRow.serviceCostRate,
      varianceMaterialityPct: settingsRow.varianceMaterialityPct,
      defaultCostToSellPct: settingsRow.defaultCostToSellPct,
      daysInYear: settingsRow.daysInYear,
    }

    // ── 2. Load all products (active only) ──
    const products = await db.product.findMany({
      where: { isActive: true },
      orderBy: { productLabel: 'asc' },
    })

    if (products.length === 0) {
      return NextResponse.json({
        settings,
        kpis: {
          totalInventoryAtCost: 0,
          totalInventoryAtRetail: 0,
          totalCarryingValue: 0,
          totalNrvWriteDown: 0,
          totalMaterialPriceVariance: 0,
          portfolioTurnover: 0,
          portfolioDio: 0,
          holdingCostPct: 0,
          holdingCostTotal: 0,
          cogsTrailing: 0,
        },
        holdingCost: holdingCostBreakdown({ avgInventoryValue: 0, settings }),
        products: [],
        varianceRows: [],
        nrvRegister: [],
        totals: { cogsTrailing: 0, totalInboundValue: 0, totalDeliveredValue: 0 },
      })
    }

    // ── 3. Load all inbound records (all-time, for FIFO layers) ──
    const productIdSet = new Set(products.map(p => p.productId))
    const allInbounds = await db.inboundRecord.findMany({
      where: { productId: { in: Array.from(productIdSet) } },
      select: { id: true, productId: true, qtyIn: true, unitPrice: true, createdAt: true, merchantName: true, productName: true },
      orderBy: { createdAt: 'asc' },
    })

    // ── 4. Load trailing-period metrics ──
    const trailingStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    // Delivered outbound (for turnover / annual demand)
    const delivered = await db.outboundRecord.findMany({
      where: { status: 'delivered', deliveredAt: { gte: trailingStart } },
      select: { productId: true, qty: true, saleAmount: true, unitSellingPrice: true },
    })

    // All outbound (for FIFO consumption)
    const allOutbound = await db.outboundRecord.findMany({
      where: { productId: { in: Array.from(productIdSet) } },
      select: { productId: true, qty: true },
    })

    // Shrinkage (trailing 365 days — for usage variance)
    const shrinkageTrailing = await db.shrinkageRecord.findMany({
      where: { createdAt: { gte: trailingStart } },
      select: { productId: true, qty: true, unitCost: true },
    })

    // All shrinkage (for FIFO consumption)
    const allShrinkage = await db.shrinkageRecord.findMany({
      select: { productId: true, qty: true },
    })

    // RTV (returns to vendor — also consumes from stock)
    const allRtv = await db.rTVRecord.findMany({
      select: { productId: true, qty: true },
    })

    // ── 5. NRV register ──
    const nrvRegisterAll = await db.nrvWriteDown.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // ── 6. Pre-aggregate per-product data ──
    const inboundsByProduct = new Map<string, typeof allInbounds>()
    for (const r of allInbounds) {
      const arr = inboundsByProduct.get(r.productId) || []
      arr.push(r)
      inboundsByProduct.set(r.productId, arr)
    }

    const outboundQtyByProduct = new Map<string, number>()
    for (const r of allOutbound) {
      outboundQtyByProduct.set(r.productId, (outboundQtyByProduct.get(r.productId) || 0) + r.qty)
    }
    const shrinkageAllByProduct = new Map<string, number>()
    for (const r of allShrinkage) {
      shrinkageAllByProduct.set(r.productId, (shrinkageAllByProduct.get(r.productId) || 0) + r.qty)
    }
    for (const r of allRtv) {
      shrinkageAllByProduct.set(r.productId, (shrinkageAllByProduct.get(r.productId) || 0) + r.qty)
    }
    // Total consumption = outbound + shrinkage + RTV
    const consumptionByProduct = new Map<string, number>()
    for (const [pid, oq] of outboundQtyByProduct) consumptionByProduct.set(pid, oq)
    for (const [pid, sq] of shrinkageAllByProduct) consumptionByProduct.set(pid, (consumptionByProduct.get(pid) || 0) + sq)

    const shrinkageTrailingByProduct = new Map<string, number>()
    for (const r of shrinkageTrailing) {
      shrinkageTrailingByProduct.set(r.productId, (shrinkageTrailingByProduct.get(r.productId) || 0) + r.qty)
    }

    const deliveredByProduct = new Map<string, { qty: number; cogs: number }>()
    for (const r of delivered) {
      const cur = deliveredByProduct.get(r.productId) || { qty: 0, cogs: 0 }
      cur.qty += r.qty
      cur.cogs += r.saleAmount ?? (r.qty * (r.unitSellingPrice ?? 0))
      deliveredByProduct.set(r.productId, cur)
    }

    const nrvByProduct = new Map<string, typeof nrvRegisterAll>()
    for (const r of nrvRegisterAll) {
      const arr = nrvByProduct.get(r.productId) || []
      arr.push(r)
      nrvByProduct.set(r.productId, arr)
    }

    // ── 7. ABC classification ──
    const abcInput = products.map(p => {
      const delivered = deliveredByProduct.get(p.productId)?.qty ?? 0
      return { productId: p.productId, annualValue: delivered * p.unitCost }
    })
    const abcMap = abcClassify(abcInput)

    // ── 8. Compute per-product valuation ──
    const productValuations = products.map(p => {
      const inbounds = inboundsByProduct.get(p.productId) || []
      const consumption = consumptionByProduct.get(p.productId) || 0
      const shrinkageTrailingQty = shrinkageTrailingByProduct.get(p.productId) || 0
      const delivered = deliveredByProduct.get(p.productId)
      const deliveredQty = delivered?.qty ?? 0
      const cogsTrailing = deliveredQty * p.unitCost
      const nrvRegister = nrvByProduct.get(p.productId) || []
      return computeProductValuation({
        p,
        inbounds: inbounds.map(r => ({ id: r.id, qtyIn: r.qtyIn, unitPrice: r.unitPrice, createdAt: r.createdAt })),
        outboundQty: consumption,
        shrinkageQty: shrinkageTrailingQty,
        deliveredQty,
        cogsTrailing,
        nrvRegister,
        settings,
        abcClass: abcMap.get(p.productId) || 'C',
      })
    })

    // ── 9. Variance rows (per-recent-inbound MPV) ──
    const recentInbounds = allInbounds.filter(r => r.createdAt >= ninetyDaysAgo && r.unitPrice != null)
    const productById = new Map(products.map(p => [p.productId, p]))
    const varianceRows = recentInbounds.map(r => {
      const p = productById.get(r.productId)
      const stdCost = p?.standardCost ?? p?.unitCost ?? 0
      const actualCost = r.unitPrice ?? 0
      const priceVariancePerUnit = stdCost - actualCost
      const priceVariance = priceVariancePerUnit * r.qtyIn
      const kind = priceVariance >= 0 ? 'F' as const : 'A' as const
      const material = Math.abs(priceVariance / Math.max(stdCost * r.qtyIn, 1)) > settings.varianceMaterialityPct
      return {
        inboundId: r.id,
        productId: r.productId,
        productLabel: r.productName,
        merchantName: r.merchantName,
        receivedAt: r.createdAt,
        qty: r.qtyIn,
        actualUnitCost: actualCost,
        standardUnitCost: stdCost,
        priceVariance,
        priceVariancePerUnit,
        kind,
        material,
      }
    }).sort((a, b) => Math.abs(b.priceVariance) - Math.abs(a.priceVariance))

    // ── 10. Portfolio KPIs ──
    const totalInventoryAtCost = productValuations.reduce((s, p) => s + p.selectedValue, 0)
    const totalInventoryAtRetail = productValuations.reduce((s, p) => s + p.currentStock * p.unitSellingPrice, 0)
    const totalCarryingValue = productValuations.reduce((s, p) => s + p.carryingValue, 0)
    const totalNrvWriteDown = productValuations.reduce((s, p) => s + (p.writeDownRequired ? p.writeDownTotal : 0), 0)
    const totalMaterialPriceVariance = productValuations.reduce((s, p) => s + p.materialPriceVariance, 0)

    let cogsTotal = 0
    for (const p of products) {
      const d = deliveredByProduct.get(p.productId)
      if (d) cogsTotal += d.qty * p.unitCost
    }

    const avgInvValue = totalInventoryAtCost / 2 // (0 + closing) / 2 — opening snapshot unavailable
    const portfolioTurnover = avgInvValue > 0 ? cogsTotal / avgInvValue : 0
    const portfolioDio = portfolioTurnover > 0 ? settings.daysInYear / portfolioTurnover : 0

    const holdingCost = holdingCostBreakdown({ avgInventoryValue: avgInvValue, settings })

    return NextResponse.json({
      settings,
      kpis: {
        totalInventoryAtCost,
        totalInventoryAtRetail,
        totalCarryingValue,
        totalNrvWriteDown,
        totalMaterialPriceVariance,
        portfolioTurnover,
        portfolioDio,
        holdingCostPct: holdingCost.totalPctOfInvValue,
        holdingCostTotal: holdingCost.total,
        cogsTrailing: cogsTotal,
      },
      holdingCost,
      products: productValuations,
      varianceRows,
      nrvRegister: nrvRegisterAll.map(r => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName,
        merchantName: r.merchantName,
        kind: r.kind as 'write_down' | 'reversal',
        qty: r.qty,
        unitCost: r.unitCost,
        nrvPerUnit: r.nrvPerUnit,
        amountPerUnit: r.amountPerUnit,
        totalAmount: r.totalAmount,
        reason: r.reason,
        status: r.status,
        reversesId: r.reversesId,
        recordedBy: r.recordedBy,
        createdAt: r.createdAt,
      })),
      totals: {
        cogsTrailing: cogsTotal,
        totalInboundValue: allInbounds.reduce((s, r) => s + (r.qtyIn * (r.unitPrice ?? 0)), 0),
        totalDeliveredValue: delivered.reduce((s, r) => s + (r.saleAmount ?? 0), 0),
      },
    })
  } catch (error) {
    console.error('GET /api/inventory-valuation error:', error)
    return NextResponse.json({ error: 'Failed to compute inventory valuation' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
