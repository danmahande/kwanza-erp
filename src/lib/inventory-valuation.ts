/**
 * Inventory Valuation Engine — ACCA Management Decision & Control (MDC) + IAS 2
 *
 * Implements the inventory-related calculations prescribed by:
 *   • IAS 2 — Inventories (costing methods, lower-of-cost-or-NRV, write-downs & reversals)
 *   • ACCA MDC / CPA Uganda Paper MDC — variance analysis, holding costs,
 *     inventory turnover & DIO, EOQ, ROP, ABC classification
 *
 * Reference: research/acca_mdc_inventory_research.md
 *
 * This module is pure / deterministic — no DB writes, no side effects.
 * All DB access happens at the API layer; this engine takes plain JS objects.
 */

import type { Product, InboundRecord, OutboundRecord, ShrinkageRecord, NrvWriteDown } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CostingMethod = 'fifo' | 'avco' | 'standard' | 'specific_id'

export interface ValuationSettings {
  defaultCostingMethod: CostingMethod
  capitalCostRate: number       // %, e.g. 0.12 = 12%
  storageCostRate: number
  riskCostRate: number
  serviceCostRate: number
  varianceMaterialityPct: number  // %, e.g. 0.05 = 5%
  defaultCostToSellPct: number
  daysInYear: number
}

export const DEFAULT_SETTINGS: ValuationSettings = {
  defaultCostingMethod: 'fifo',
  capitalCostRate: 0.12,
  storageCostRate: 0.06,
  riskCostRate: 0.03,
  serviceCostRate: 0.02,
  varianceMaterialityPct: 0.05,
  defaultCostToSellPct: 0.05,
  daysInYear: 365,
}

export interface CostLayer {
  inboundId: string
  qtyReceived: number
  qtyRemaining: number
  unitCost: number
  receivedAt: Date
}

export interface ProductValuation {
  productId: string
  productLabel: string
  brand: string | null
  variant: string | null
  merchantId: string
  merchantName: string
  category: string
  unit: string
  currentStock: number
  costingMethod: CostingMethod
  standardCost: number          // effective standard cost
  unitSellingPrice: number
  costToSell: number            // effective cost-to-sell per unit
  // Cost layers (FIFO order)
  layers: CostLayer[]
  // Valuations (per IAS 2)
  fifoValue: number
  avcoValue: number
  standardValue: number
  selectedValue: number         // value using product's costingMethod
  // Per-unit costs
  fifoUnitCost: number          // weighted-avg cost of remaining layers
  avcoUnitCost: number
  // NRV (IAS 2 §9)
  nrvPerUnit: number
  nrvValue: number              // nrvPerUnit × currentStock
  // Lower of Cost or NRV
  carryingValue: number         // min(selectedValue, nrvValue)
  carryingValuePerUnit: number
  writeDownRequired: boolean    // true if NRV < cost
  writeDownPerUnit: number      // max(0, selectedUnitCost - nrvPerUnit)
  writeDownTotal: number        // writeDownPerUnit × currentStock
  // Existing NRV register balance (sum of active write-downs minus reversals)
  existingWriteDownBalance: number
  // Variance (ACCA MDC)
  materialPriceVariance: number // (StdCost − ActualCost) × Qty, summed across recent inbounds
  materialUsageVariance: number // (StdQty − ActualQty) × StdCost, using shrinkage as actual
  // Performance (ACCA MDC)
  annualDemand: number          // units shipped in trailing 365 days
  inventoryTurnover: number     // COGS / AvgInvValue
  daysInventoryOutstanding: number
  stockoutRisk: 'safe' | 'monitor' | 'critical'
  // EOQ / ROP (ACCA MDC inventory control)
  eoq: number                   // economic order quantity
  reorderPoint: number          // (avgDailyDemand × leadTime) + safetyStock
  safetyStock: number
  leadTimeDays: number
  orderingCost: number
  holdingCostPerUnit: number
  // ABC (Pareto) — populated by caller
  abcClass: 'A' | 'B' | 'C'
  // Variance flag (management by exception)
  varianceFlagged: boolean
}

export interface VarianceRow {
  inboundId: string
  productId: string
  productLabel: string
  merchantName: string
  receivedAt: Date
  qty: number
  actualUnitCost: number
  standardUnitCost: number
  priceVariance: number         // (Std − Actual) × Qty
  priceVariancePerUnit: number
  kind: 'F' | 'A'               // Favourable / Adverse
  material: boolean             // true if |variance%| > materiality threshold
}

export interface NrvRow {
  id: string
  productId: string
  productName: string
  merchantName: string | null
  kind: 'write_down' | 'reversal'
  qty: number
  unitCost: number
  nrvPerUnit: number
  amountPerUnit: number
  totalAmount: number
  reason: string
  status: string
  reversesId: string | null
  recordedBy: string
  createdAt: Date
}

export interface HoldingCostBreakdown {
  avgInventoryValue: number
  capital: number
  storage: number
  risk: number
  service: number
  total: number
  totalPctOfInvValue: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. COSTING METHODS (IAS 2 §25)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build FIFO cost layers for a single product by walking inbound records
 * in chronological order and decrementing remaining quantity by outbound
 * and shrinkage (which represent issues from inventory).
 *
 * InboundRecord.unitPrice is the actual cost per unit at GRN.
 * OutboundRecord.qty and ShrinkageRecord.qty are consumption.
 */
export function buildFifoLayers(args: {
  inbounds: Pick<InboundRecord, 'id' | 'qtyIn' | 'unitPrice' | 'createdAt'>[]
  outboundQty: number   // total units issued (outbound + RTV + shrinkage)
}): CostLayer[] {
  const sorted = [...args.inbounds]
    .filter(r => r.unitPrice != null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  let remainingToConsume = args.outboundQty
  const layers: CostLayer[] = []

  for (const r of sorted) {
    const unitCost = r.unitPrice ?? 0
    if (remainingToConsume >= r.qtyIn) {
      // Whole layer consumed
      remainingToConsume -= r.qtyIn
      // skip — nothing left in this layer
      continue
    }
    const qtyRemaining = r.qtyIn - remainingToConsume
    remainingToConsume = 0
    layers.push({
      inboundId: r.id,
      qtyReceived: r.qtyIn,
      qtyRemaining,
      unitCost,
      receivedAt: r.createdAt,
    })
  }
  return layers
}

/** FIFO total carrying cost = sum(qtyRemaining × unitCost) across layers */
export function fifoValue(layers: CostLayer[]): number {
  return layers.reduce((s, l) => s + l.qtyRemaining * l.unitCost, 0)
}

/** FIFO weighted-average per-unit cost across remaining layers */
export function fifoUnitCost(layers: CostLayer[]): number {
  const totalQty = layers.reduce((s, l) => s + l.qtyRemaining, 0)
  if (totalQty === 0) return 0
  return fifoValue(layers) / totalQty
}

/**
 * Weighted Average Cost (AVCO) — perpetual moving average.
 * Walk inbounds in chronological order, recalculating the average after each
 * receipt and decrementing the pool by issues.
 */
export function avcoValue(args: {
  inbounds: Pick<InboundRecord, 'qtyIn' | 'unitPrice' | 'createdAt'>[]
  outboundQty: number
}): { value: number; unitCost: number; qtyOnHand: number } {
  const sorted = [...args.inbounds]
    .filter(r => r.unitPrice != null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  let poolQty = 0
  let poolValue = 0
  let issuesRemaining = args.outboundQty

  for (const r of sorted) {
    const unitCost = r.unitPrice ?? 0
    // Step 1: consume from pool (FIFO-ish consumption, but priced at current AVG)
    if (issuesRemaining > 0 && poolQty > 0) {
      const consume = Math.min(issuesRemaining, poolQty)
      const currentAvg = poolQty > 0 ? poolValue / poolQty : 0
      poolQty -= consume
      poolValue -= consume * currentAvg
      issuesRemaining -= consume
    }
    // Step 2: receive into pool
    poolQty += r.qtyIn
    poolValue += r.qtyIn * unitCost
  }
  // Final consumption if any issues remain after all receipts
  if (issuesRemaining > 0 && poolQty > 0) {
    const consume = Math.min(issuesRemaining, poolQty)
    const currentAvg = poolQty > 0 ? poolValue / poolQty : 0
    poolQty -= consume
    poolValue -= consume * currentAvg
  }

  if (poolQty <= 0) return { value: 0, unitCost: 0, qtyOnHand: 0 }
  return { value: poolValue, unitCost: poolValue / poolQty, qtyOnHand: poolQty }
}

/** Standard cost valuation — currentStock × standardCost. */
export function standardValue(currentStock: number, standardCost: number): number {
  return currentStock * standardCost
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. NRV TEST (IAS 2 §9, §33)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Net Realisable Value per IAS 2.
 *   NRV = estimated selling price − cost to complete − cost to sell
 *
 * For a 3PL/warehouse, "cost to complete" is typically 0 (goods are finished),
 * so NRV ≈ unitSellingPrice − costToSell.
 */
export function computeNrvPerUnit(args: {
  unitSellingPrice: number
  costToSell: number
  costToComplete?: number
}): number {
  const ctc = args.costToComplete ?? 0
  return Math.max(0, args.unitSellingPrice - ctc - args.costToSell)
}

/**
 * Lower of Cost or NRV (IAS 2 §9).
 * Inventory must be carried at min(cost, NRV) — applied item-by-item (no offsetting).
 *
 * @returns carrying value + write-down amount if NRV < cost
 */
export function lowerOfCostOrNrv(args: {
  costValue: number
  qtyOnHand: number
  nrvPerUnit: number
}) {
  const costPerUnit = args.qtyOnHand > 0 ? args.costValue / args.qtyOnHand : 0
  const nrvValue = args.nrvPerUnit * args.qtyOnHand
  const carryingValue = Math.min(args.costValue, nrvValue)
  const writeDownRequired = nrvValue < args.costValue && args.qtyOnHand > 0
  const writeDownPerUnit = writeDownRequired ? Math.max(0, costPerUnit - args.nrvPerUnit) : 0
  const writeDownTotal = writeDownPerUnit * args.qtyOnHand
  return {
    carryingValue,
    carryingValuePerUnit: args.qtyOnHand > 0 ? carryingValue / args.qtyOnHand : 0,
    writeDownRequired,
    writeDownPerUnit,
    writeDownTotal,
    nrvValue,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VARIANCE ANALYSIS (ACCA MDC §Variance Analysis)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Material Price Variance (MPV).
 *   MPV = (Standard Cost − Actual Cost) × Actual Qty purchased
 *   Favourable (F) if positive (actual < standard)
 *   Adverse (A)   if negative (actual > standard)
 *
 * Isolated at Goods Received Note (GRN) — i.e., at InboundRecord creation.
 */
export function materialPriceVariance(args: {
  standardCost: number
  actualUnitCost: number
  qty: number
}): { variance: number; perUnit: number; kind: 'F' | 'A' } {
  const perUnit = args.standardCost - args.actualUnitCost
  const variance = perUnit * args.qty
  return {
    variance,
    perUnit,
    kind: variance >= 0 ? 'F' : 'A',
  }
}

/**
 * Material Usage Variance (MUV).
 *   MUV = (Standard Qty − Actual Qty) × Standard Cost
 *
 * In a 3PL context, "standard qty" = qty that should have been used = delivered qty.
 * "Actual qty" = qty received from merchant + qty shrinkage (lost units).
 * Shrinkage represents the deviation from expected usage.
 *
 * We compute MUV per product using trailing-365d shrinkage as the usage gap.
 */
export function materialUsageVariance(args: {
  expectedQty: number      // units that should have been used (e.g., delivered to customers)
  actualQty: number        // units actually consumed (expected + shrinkage)
  standardCost: number
}): { variance: number; kind: 'F' | 'A' } {
  const variance = (args.expectedQty - args.actualQty) * args.standardCost
  return { variance, kind: variance >= 0 ? 'F' : 'A' }
}

/** Flag variance as material if |variance%| > materiality threshold. */
export function isVarianceMaterial(args: {
  variance: number
  standardCost: number
  qty: number
  materialityPct: number
}): boolean {
  const stdValue = args.standardCost * args.qty
  if (stdValue === 0) return false
  return Math.abs(args.variance / stdValue) > args.materialityPct
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PERFORMANCE METRICS (ACCA MDC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inventory Turnover Ratio.
 *   Turnover = COGS / Average Inventory Value
 *
 * For 3PL: COGS = delivered sales value (at cost, not retail) over the period.
 * Avg Inventory = (opening + closing) / 2 — we approximate as closing × 1
 *                  when opening is unavailable (first period).
 */
export function inventoryTurnover(args: {
  cogs: number
  avgInventoryValue: number
}): number {
  if (args.avgInventoryValue <= 0) return 0
  return args.cogs / args.avgInventoryValue
}

/** Days Inventory Outstanding = daysInYear / Turnover */
export function daysInventoryOutstanding(args: {
  turnover: number
  daysInYear: number
}): number {
  if (args.turnover <= 0) return 0
  return args.daysInYear / args.turnover
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HOLDING COSTS (ACCA MDC — 4 components)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inventory Holding Cost breakdown — 4 components per ACCA MDC:
 *   1. Capital (opportunity) cost — avg inv value × capitalCostRate
 *   2. Storage cost              — avg inv value × storageCostRate
 *   3. Risk cost (obsolescence, deterioration, shrinkage) — × riskCostRate
 *   4. Service cost (insurance, taxes, IT)                 — × serviceCostRate
 *
 * Returns annualised values + total % of inventory value.
 */
export function holdingCostBreakdown(args: {
  avgInventoryValue: number
  settings: ValuationSettings
}): HoldingCostBreakdown {
  const capital = args.avgInventoryValue * args.settings.capitalCostRate
  const storage = args.avgInventoryValue * args.settings.storageCostRate
  const risk = args.avgInventoryValue * args.settings.riskCostRate
  const service = args.avgInventoryValue * args.settings.serviceCostRate
  const total = capital + storage + risk + service
  return {
    avgInventoryValue: args.avgInventoryValue,
    capital,
    storage,
    risk,
    service,
    total,
    totalPctOfInvValue: args.avgInventoryValue > 0 ? total / args.avgInventoryValue : 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. EOQ & ROP (ACCA MDC Inventory Control)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Economic Order Quantity — Wilson formula.
 *   EOQ = √(2DS / H)
 * where:
 *   D = annual demand (units/year)
 *   S = ordering cost per order (UGX)
 *   H = holding cost per unit per year (UGX/unit/year)
 *
 * Assumptions (per ACCA MDC):
 *   • Demand is constant and known
 *   • Lead time is constant and known
 *   • No stockouts (instant replenishment)
 *   • Order quantity is the same each time
 */
export function economicOrderQuantity(args: {
  annualDemand: number
  orderingCost: number
  holdingCostPerUnit: number
}): number {
  if (args.annualDemand <= 0 || args.orderingCost <= 0 || args.holdingCostPerUnit <= 0) return 0
  return Math.sqrt((2 * args.annualDemand * args.orderingCost) / args.holdingCostPerUnit)
}

/**
 * Reorder Point (ROP).
 *   ROP = (average daily demand × lead time) + safety stock
 *
 * Safety stock can be set explicitly or computed via statistical method:
 *   SafetyStock = Z × σ_demand_during_lead_time
 * For simplicity, we accept an explicit safetyStock input.
 */
export function reorderPoint(args: {
  annualDemand: number
  leadTimeDays: number
  safetyStock: number
  daysInYear: number
}): number {
  if (args.daysInYear <= 0) return 0
  const avgDailyDemand = args.annualDemand / args.daysInYear
  return Math.ceil(avgDailyDemand * args.leadTimeDays + args.safetyStock)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ABC CLASSIFICATION (Pareto)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ABC classification by annual value-throughput (Pareto).
 *   A = top 80% of cumulative value (typically 10–20% of SKUs)
 *   B = next 15% of cumulative value
 *   C = bottom 5% of cumulative value
 *
 * @param products  list with { productId, annualValue }
 * @returns         map productId → 'A' | 'B' | 'C'
 */
export function abcClassify(products: Array<{ productId: string; annualValue: number }>): Map<string, 'A' | 'B' | 'C'> {
  const sorted = [...products].sort((a, b) => b.annualValue - a.annualValue)
  const totalValue = sorted.reduce((s, p) => s + p.annualValue, 0)
  const result = new Map<string, 'A' | 'B' | 'C'>()
  let cumValue = 0
  for (const p of sorted) {
    cumValue += p.annualValue
    const cumPct = totalValue > 0 ? cumValue / totalValue : 0
    if (cumPct <= 0.80) result.set(p.productId, 'A')
    else if (cumPct <= 0.95) result.set(p.productId, 'B')
    else result.set(p.productId, 'C')
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PRODUCT-LEVEL VALUATION (orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute full valuation for a single product.
 *
 * @param p            Product record (must include the new costing fields)
 * @param inbounds     All InboundRecords for this product, all time
 * @param outboundQty  Total units issued (outbound + RTV + shrinkage)
 * @param shrinkageQty Trailing-365d shrinkage units (for usage variance)
 * @param deliveredQty Trailing-365d delivered units (for usage variance + turnover)
 * @param cogsTrailing Trailing-365d COGS at cost (for turnover)
 * @param nrvRegister  Existing NRV write-downs (active) for this product
 * @param settings     Global valuation settings
 * @param abcClass     ABC class from caller
 */
export function computeProductValuation(args: {
  p: Pick<Product,
    | 'productId' | 'productLabel' | 'brand' | 'variant' | 'category'
    | 'merchantId' | 'merchantName' | 'unit'
    | 'currentStock' | 'unitCost' | 'unitSellingPrice' | 'commissionPercent'
    | 'costingMethod' | 'standardCost' | 'costToSell'
    | 'holdingCostPerUnit' | 'orderingCost' | 'leadTimeDays' | 'safetyStock'
  >
  inbounds: Pick<InboundRecord, 'id' | 'qtyIn' | 'unitPrice' | 'createdAt'>[]
  outboundQty: number
  shrinkageQty: number
  deliveredQty: number
  cogsTrailing: number
  nrvRegister: NrvWriteDown[]
  settings: ValuationSettings
  abcClass: 'A' | 'B' | 'C'
}): ProductValuation {
  const {
    p, inbounds, outboundQty, shrinkageQty, deliveredQty, cogsTrailing,
    nrvRegister, settings, abcClass,
  } = args

  const costingMethod = (p.costingMethod as CostingMethod) || settings.defaultCostingMethod
  const standardCost = p.standardCost ?? p.unitCost
  const costToSell = p.costToSell ?? (p.unitSellingPrice * settings.defaultCostToSellPct)

  // Build FIFO layers + AVCO
  const layers = buildFifoLayers({ inbounds, outboundQty })
  const fValue = fifoValue(layers)
  const fUnitCost = fifoUnitCost(layers)
  const avco = avcoValue({ inbounds, outboundQty })
  const sValue = standardValue(p.currentStock, standardCost)

  // Select valuation by costing method
  let selectedValue: number
  let selectedUnitCost: number
  switch (costingMethod) {
    case 'fifo':        selectedValue = fValue; selectedUnitCost = fUnitCost; break
    case 'avco':        selectedValue = avco.value; selectedUnitCost = avco.unitCost; break
    case 'standard':    selectedValue = sValue; selectedUnitCost = standardCost; break
    case 'specific_id': selectedValue = fValue; selectedUnitCost = fUnitCost; break // fallback to FIFO when no serial tracking
    default:            selectedValue = fValue; selectedUnitCost = fUnitCost
  }

  // NRV (IAS 2)
  const nrvPerUnit = computeNrvPerUnit({
    unitSellingPrice: p.unitSellingPrice,
    costToSell,
  })
  const nrvTest = lowerOfCostOrNrv({
    costValue: selectedValue,
    qtyOnHand: p.currentStock,
    nrvPerUnit,
  })

  // Existing NRV register balance (active write-downs − reversals already netted by status)
  const existingWriteDownBalance = nrvRegister
    .filter(r => r.status === 'active' && r.kind === 'write_down')
    .reduce((s, r) => s + r.totalAmount, 0)

  // Variance — trailing-period MPV from inbounds in the variance window
  // Use trailing 90 days as the variance analysis window (typical management review cycle)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const recentInbounds = inbounds.filter(r => r.createdAt >= ninetyDaysAgo && r.unitPrice != null)
  let mpvTotal = 0
  for (const r of recentInbounds) {
    const v = materialPriceVariance({
      standardCost,
      actualUnitCost: r.unitPrice ?? 0,
      qty: r.qtyIn,
    })
    mpvTotal += v.variance
  }

  // MUV — using shrinkage as proxy for usage gap
  const usageVariance = materialUsageVariance({
    expectedQty: deliveredQty,
    actualQty: deliveredQty + shrinkageQty,
    standardCost,
  })

  // Inventory turnover / DIO
  // Avg inventory ≈ selectedValue (closing) — we don't have an opening snapshot easily.
  // To be more correct, use (0 + selectedValue) / 2 as a fallback when no opening snapshot.
  const avgInvValue = selectedValue / 2 > 0 ? selectedValue / 2 : selectedValue
  const turnover = inventoryTurnover({ cogs: cogsTrailing, avgInventoryValue: avgInvValue })
  const dio = daysInventoryOutstanding({ turnover, daysInYear: settings.daysInYear })

  // Stockout risk (simple heuristic — refined by Days-of-Stock already shown elsewhere)
  let stockoutRisk: 'safe' | 'monitor' | 'critical' = 'safe'
  if (p.currentStock === 0) stockoutRisk = 'critical'
  else if (deliveredQty > 0) {
    const dailyDemand = deliveredQty / settings.daysInYear
    const daysOfStock = dailyDemand > 0 ? p.currentStock / dailyDemand : Infinity
    if (daysOfStock <= 7) stockoutRisk = 'critical'
    else if (daysOfStock <= 30) stockoutRisk = 'monitor'
  }

  // EOQ + ROP
  const annualDemand = deliveredQty // trailing 365-day delivered ≈ annual demand proxy
  const holdingCostPerUnit = p.holdingCostPerUnit ?? (standardCost * (
    settings.capitalCostRate + settings.storageCostRate + settings.riskCostRate + settings.serviceCostRate
  ))
  const eoq = economicOrderQuantity({
    annualDemand,
    orderingCost: p.orderingCost,
    holdingCostPerUnit,
  })
  const rop = reorderPoint({
    annualDemand,
    leadTimeDays: p.leadTimeDays,
    safetyStock: p.safetyStock,
    daysInYear: settings.daysInYear,
  })

  // Variance materiality flag (management by exception)
  const varianceFlagged = isVarianceMaterial({
    variance: mpvTotal,
    standardCost,
    qty: recentInbounds.reduce((s, r) => s + r.qtyIn, 0),
    materialityPct: settings.varianceMaterialityPct,
  })

  return {
    productId: p.productId,
    productLabel: p.productLabel,
    brand: p.brand,
    variant: p.variant,
    merchantId: p.merchantId,
    merchantName: p.merchantName,
    category: p.category,
    unit: p.unit,
    currentStock: p.currentStock,
    costingMethod,
    standardCost,
    unitSellingPrice: p.unitSellingPrice,
    costToSell,
    layers,
    fifoValue: fValue,
    avcoValue: avco.value,
    standardValue: sValue,
    selectedValue,
    fifoUnitCost: fUnitCost,
    avcoUnitCost: avco.unitCost,
    nrvPerUnit,
    nrvValue: nrvTest.nrvValue,
    carryingValue: nrvTest.carryingValue,
    carryingValuePerUnit: nrvTest.carryingValuePerUnit,
    writeDownRequired: nrvTest.writeDownRequired,
    writeDownPerUnit: nrvTest.writeDownPerUnit,
    writeDownTotal: nrvTest.writeDownTotal,
    existingWriteDownBalance,
    materialPriceVariance: mpvTotal,
    materialUsageVariance: usageVariance.variance,
    annualDemand,
    inventoryTurnover: turnover,
    daysInventoryOutstanding: dio,
    stockoutRisk,
    eoq,
    reorderPoint: rop,
    safetyStock: p.safetyStock,
    leadTimeDays: p.leadTimeDays,
    orderingCost: p.orderingCost,
    holdingCostPerUnit,
    abcClass,
    varianceFlagged,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. FORMATTERS (shared with UI)
// ─────────────────────────────────────────────────────────────────────────────

export function fmtUGX(n: number, opts?: { compact?: boolean }): string {
  if (n == null || isNaN(n)) return 'UGX 0'
  if (opts?.compact) {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `UGX ${(n / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `UGX ${(n / 1_000).toFixed(1)}K`
  }
  return `UGX ${n.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`
}

export function fmtPct(n: number, digits = 1): string {
  if (n == null || isNaN(n)) return '0%'
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtNum(n: number): string {
  if (n == null || isNaN(n)) return '0'
  return n.toLocaleString('en-UG', { maximumFractionDigits: 0 })
}
