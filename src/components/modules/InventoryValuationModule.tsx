'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Loader2, Search, ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'

// ── Types (mirror of API response shape) ──
interface Settings {
  defaultCostingMethod: string
  capitalCostRate: number
  storageCostRate: number
  riskCostRate: number
  serviceCostRate: number
  varianceMaterialityPct: number
  defaultCostToSellPct: number
  daysInYear: number
}

interface CostLayer {
  inboundId: string
  qtyReceived: number
  qtyRemaining: number
  unitCost: number
  receivedAt: string
}

interface ProductValuation {
  productId: string
  productLabel: string
  brand: string | null
  variant: string | null
  merchantId: string
  merchantName: string
  category: string
  unit: string
  currentStock: number
  costingMethod: string
  standardCost: number
  unitSellingPrice: number
  costToSell: number
  layers: CostLayer[]
  fifoValue: number
  avcoValue: number
  standardValue: number
  selectedValue: number
  fifoUnitCost: number
  avcoUnitCost: number
  nrvPerUnit: number
  nrvValue: number
  carryingValue: number
  carryingValuePerUnit: number
  writeDownRequired: boolean
  writeDownPerUnit: number
  writeDownTotal: number
  existingWriteDownBalance: number
  materialPriceVariance: number
  materialUsageVariance: number
  annualDemand: number
  inventoryTurnover: number
  daysInventoryOutstanding: number
  stockoutRisk: 'safe' | 'monitor' | 'critical'
  eoq: number
  reorderPoint: number
  safetyStock: number
  leadTimeDays: number
  orderingCost: number
  holdingCostPerUnit: number
  abcClass: 'A' | 'B' | 'C'
  varianceFlagged: boolean
}

interface VarianceRow {
  inboundId: string
  productId: string
  productLabel: string
  merchantName: string
  receivedAt: string
  qty: number
  actualUnitCost: number
  standardUnitCost: number
  priceVariance: number
  priceVariancePerUnit: number
  kind: 'F' | 'A'
  material: boolean
}

interface NrvRow {
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
  createdAt: string
}

interface HoldingCost {
  avgInventoryValue: number
  capital: number
  storage: number
  risk: number
  service: number
  total: number
  totalPctOfInvValue: number
}

interface ValuationResponse {
  settings: Settings
  kpis: {
    totalInventoryAtCost: number
    totalInventoryAtRetail: number
    totalCarryingValue: number
    totalNrvWriteDown: number
    totalMaterialPriceVariance: number
    portfolioTurnover: number
    portfolioDio: number
    holdingCostPct: number
    holdingCostTotal: number
    cogsTrailing: number
  }
  holdingCost: HoldingCost
  products: ProductValuation[]
  varianceRows: VarianceRow[]
  nrvRegister: NrvRow[]
  totals: { cogsTrailing: number; totalInboundValue: number; totalDeliveredValue: number }
}

type MethodKey = 'fifo' | 'avco' | 'standard' | 'specific_id'

const METHODS: Array<{
  key: MethodKey
  label: string
  full: string
  ias: string
  hint: string
}> = [
  { key: 'fifo',        label: 'FIFO',        full: 'First-In, First-Out', ias: 'IAS 2 §25', hint: 'Oldest cost issued first. Closing inventory reflects most recent costs. Balance sheet approximates current cost.' },
  { key: 'avco',        label: 'AVCO',        full: 'Weighted Average', ias: 'IAS 2 §27', hint: 'Moving weighted average after each receipt. Smooths price volatility. Simple to compute.' },
  { key: 'standard',    label: 'STANDARD',   full: 'Standard Cost', ias: 'IAS 2 §21', hint: 'Predetermined cost benchmark. Variance analysis highlights inefficiency.' },
  { key: 'specific_id', label: 'SPECIFIC ID', full: 'Specific Identification', ias: 'IAS 2 §23', hint: 'Cost traced to specific physical item. Required for non-interchangeable goods.' },
]

// ── Benchmarks (per ACCA MDC + IAS 2 research) ──
const BENCHMARKS = {
  turnover: { min: 4, max: 6, label: 'turns/year', source: 'ACCA MDC' },
  dio:      { min: 60, max: 90, label: 'days', source: 'ACCA MDC' },
  holding:  { min: 0.15, max: 0.30, label: 'of inventory value', source: 'ACCA MDC' },
  nrvWriteDown: { max: 0.05, label: 'of inventory value', source: 'IAS 2 §9' },
  variance:    { max: 0.05, label: 'of standard cost', source: 'ACCA MDC materiality' },
}

// ── Formatters ──
const fmtUGX = (n: number, opts?: { compact?: boolean; symbol?: boolean }): string => {
  if (n == null || isNaN(n)) return opts?.symbol === false ? '0' : 'UGX 0'
  const sym = opts?.symbol === false ? '' : 'UGX '
  if (opts?.compact) {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000)     return `${sym}${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000)         return `${sym}${(n / 1_000).toFixed(1)}K`
  }
  return `${sym}${n.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`
}

const fmtNum = (n: number): string => {
  if (n == null || isNaN(n)) return '0'
  return n.toLocaleString('en-UG', { maximumFractionDigits: 0 })
}

const fmtPct = (n: number, digits = 1): string => {
  if (n == null || isNaN(n)) return '0%'
  return `${(n * 100).toFixed(digits)}%`
}

const fmtDate = (d: string): string => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

// ── Status check helpers ──
type Status = 'healthy' | 'monitor' | 'critical'
function turnoverStatus(t: number): Status {
  if (t === 0) return 'monitor'
  if (t < BENCHMARKS.turnover.min) return 'critical'
  if (t > BENCHMARKS.turnover.max) return 'monitor'
  return 'healthy'
}
function dioStatus(d: number): Status {
  if (d === 0) return 'monitor'
  if (d > 120) return 'critical'
  if (d > BENCHMARKS.dio.max) return 'monitor'
  if (d < BENCHMARKS.dio.min) return 'monitor'
  return 'healthy'
}
function holdingStatus(pct: number): Status {
  if (pct > 0.30) return 'critical'
  if (pct > BENCHMARKS.holding.max) return 'monitor'
  if (pct < 0.10) return 'monitor'
  return 'healthy'
}
function nrvWriteDownStatus(writeDown: number, totalCost: number): Status {
  if (totalCost === 0) return 'healthy'
  const pct = writeDown / totalCost
  if (pct > 0.10) return 'critical'
  if (pct > BENCHMARKS.nrvWriteDown.max) return 'monitor'
  return 'healthy'
}
function varianceStatus(variance: number, cogs: number): Status {
  if (cogs === 0) return 'healthy'
  const pct = Math.abs(variance) / cogs
  if (pct > 0.15) return 'critical'
  if (pct > BENCHMARKS.variance.max) return 'monitor'
  return 'healthy'
}

// ── Master component ──
export default function InventoryValuationModule() {
  const [data, setData] = useState<ValuationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<MethodKey | null>(null)

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [merchant, setMerchant] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/inventory-valuation', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      // Auto-select the default method from settings
      if (json.settings?.defaultCostingMethod) {
        setSelectedMethod(json.settings.defaultCostingMethod as MethodKey)
      }
    } catch (e: any) {
      console.error(e)
      const msg = e?.message || 'Unknown error'
      setLoadError(msg)
      toast.error(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtered products ──
  const filteredProducts = useMemo(() => {
    if (!data) return []
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs = dateTo ? new Date(dateTo).getTime() + 24*60*60*1000 : null // inclusive end of day
    const minN = priceMin ? parseFloat(priceMin) : null
    const maxN = priceMax ? parseFloat(priceMax) : null

    return data.products.filter(p => {
      // Product search
      if (search) {
        const q = search.toLowerCase()
        if (!p.productLabel.toLowerCase().includes(q) &&
            !p.merchantName.toLowerCase().includes(q) &&
            !p.productId.toLowerCase().includes(q)) return false
      }
      // Merchant filter
      if (merchant && p.merchantName !== merchant) return false
      // Date filter — apply to oldest FIFO layer receivedAt
      if (fromTs || toTs) {
        const layerTs = p.layers[0]?.receivedAt ? new Date(p.layers[0].receivedAt).getTime() : null
        if (layerTs == null) return false
        if (fromTs && layerTs < fromTs) return false
        if (toTs && layerTs > toTs) return false
      }
      // Price filter — applied to selectedValue per unit (carryingValuePerUnit)
      const unitVal = p.carryingValuePerUnit
      if (minN != null && unitVal < minN) return false
      if (maxN != null && unitVal > maxN) return false
      return true
    })
  }, [data, search, merchant, dateFrom, dateTo, priceMin, priceMax])

  // ── Computed totals for selected method (applied to filtered set) ──
  const methodTotals = useMemo(() => {
    if (!data || !selectedMethod) return null
    const ps = filteredProducts
    let fifoTotal = 0, avcoTotal = 0, stdTotal = 0
    let writeDownTotal = 0, nrvWriteDownCount = 0
    let varianceFlaggedCount = 0, stockoutCriticalCount = 0
    let cogsTrailing = 0
    let totalStock = 0, totalRetail = 0

    for (const p of ps) {
      fifoTotal += p.fifoValue
      avcoTotal += p.avcoValue
      stdTotal  += p.standardValue
      if (p.writeDownRequired) {
        writeDownTotal += p.writeDownTotal
        nrvWriteDownCount++
      }
      if (p.varianceFlagged) varianceFlaggedCount++
      if (p.stockoutRisk === 'critical') stockoutCriticalCount++
      cogsTrailing += p.annualDemand * p.standardCost
      totalStock += p.currentStock
      totalRetail += p.currentStock * p.unitSellingPrice
    }

    const selectedTotal = selectedMethod === 'fifo' ? fifoTotal
      : selectedMethod === 'avco' ? avcoTotal
      : selectedMethod === 'standard' ? stdTotal
      : fifoTotal // specific_id falls back to FIFO

    // Healthy range for total inventory value = 80%-120% of the average across all 3 methods
    const avg = (fifoTotal + avcoTotal + stdTotal) / 3
    const range = { min: avg * 0.80, max: avg * 1.20 }

    return {
      fifoTotal, avcoTotal, stdTotal, selectedTotal,
      writeDownTotal, nrvWriteDownCount,
      varianceFlaggedCount, stockoutCriticalCount,
      cogsTrailing, totalStock, totalRetail,
      range,
      productCount: ps.length,
    }
  }, [data, selectedMethod, filteredProducts])

  // ── Portfolio KPIs (always whole-portfolio, not filtered) ──
  const portfolio = useMemo(() => {
    if (!data) return null
    const k = data.kpis
    return {
      turnover: k.portfolioTurnover,
      dio: k.portfolioDio,
      holdingPct: k.holdingCostPct,
      holdingTotal: k.holdingCostTotal,
      turnoverStatus: turnoverStatus(k.portfolioTurnover),
      dioStatus: dioStatus(k.portfolioDio),
      holdingStatus: holdingStatus(k.holdingCostPct),
      nrvStatus: nrvWriteDownStatus(k.totalNrvWriteDown, k.totalInventoryAtCost),
      varianceStatus: varianceStatus(k.totalMaterialPriceVariance, k.cogsTrailing),
    }
  }, [data])

  // ── Merchants list for filter ──
  const merchants = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.products.map(p => p.merchantName))).sort()
  }, [data])

  // ── Clear all filters ──
  const clearFilters = () => {
    setSearch(''); setMerchant(''); setDateFrom(''); setDateTo(''); setPriceMin(''); setPriceMax('')
  }
  const hasActiveFilters = search || merchant || dateFrom || dateTo || priceMin || priceMax

  // ── Loading ──
  if (loading && !data) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs uppercase tracking-[0.3em]">Computing</span>
        </div>
      </div>
    )
  }

  // ── Error panel ──
  if (loadError && !data) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-6">
        <div className="max-w-xl space-y-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">Error</p>
          <h2 className="text-3xl font-light tracking-tight text-neutral-900">Valuation unavailable</h2>
          <p className="text-sm text-neutral-500 leading-relaxed font-mono break-words">{loadError}</p>
          <div className="pt-6 border-t border-neutral-200">
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 mb-3">Recovery</p>
            <ol className="text-xs text-neutral-700 space-y-2 list-decimal list-inside text-left font-mono">
              <li>npx prisma generate</li>
              <li>npx prisma db push</li>
              <li>npm run dev</li>
            </ol>
          </div>
          <button
            onClick={() => { setLoadError(null); load() }}
            className="mt-6 text-xs uppercase tracking-[0.3em] text-neutral-900 underline underline-offset-8 hover:text-neutral-500"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!data || !portfolio || !methodTotals) return null

  const { settings, kpis } = data
  const method = METHODS.find(m => m.key === selectedMethod) || METHODS[0]
  const total = methodTotals.selectedTotal

  // ── Warnings list ──
  const warnings: Array<{ label: string; value: string; status: Status }> = []
  if (methodTotals.nrvWriteDownCount > 0) {
    warnings.push({
      label: `${methodTotals.nrvWriteDownCount} product${methodTotals.nrvWriteDownCount > 1 ? 's' : ''} require NRV write-down`,
      value: fmtUGX(methodTotals.writeDownTotal, { compact: true }),
      status: portfolio.nrvStatus,
    })
  }
  if (methodTotals.varianceFlaggedCount > 0) {
    warnings.push({
      label: `${methodTotals.varianceFlaggedCount} variance${methodTotals.varianceFlaggedCount > 1 ? 's' : ''} flagged for investigation`,
      value: `>${(settings.varianceMaterialityPct * 100).toFixed(1)}% of std cost`,
      status: portfolio.varianceStatus,
    })
  }
  if (methodTotals.stockoutCriticalCount > 0) {
    warnings.push({
      label: `${methodTotals.stockoutCriticalCount} stockout risk critical`,
      value: '≤ 7 days cover',
      status: 'critical',
    })
  }
  if (portfolio.holdingStatus === 'critical' || portfolio.holdingStatus === 'monitor') {
    warnings.push({
      label: `Holding cost ${portfolio.holdingStatus === 'critical' ? 'excessive' : 'above benchmark'}`,
      value: fmtPct(portfolio.holdingPct),
      status: portfolio.holdingStatus,
    })
  }
  if (portfolio.turnoverStatus === 'critical' || portfolio.turnoverStatus === 'monitor') {
    warnings.push({
      label: `Inventory turnover ${portfolio.turnoverStatus === 'critical' ? 'too slow' : 'below benchmark'}`,
      value: `${portfolio.turnover.toFixed(2)}× / yr`,
      status: portfolio.turnoverStatus,
    })
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-neutral-900">
      {/* ════════════════════════════════════════════════════════════
          HEADER — massive title, no decoration
         ════════════════════════════════════════════════════════════ */}
      <section className="px-6 md:px-12 pt-16 md:pt-24 pb-8 md:pb-12 border-b border-neutral-200">
        <div className="max-w-7xl">
          <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 mb-6 md:mb-8">
            IAS 2 · ACCA MDC · CPA Uganda
          </p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-light tracking-tight leading-[0.95]">
            Inventory<br />
            <span className="text-neutral-400">Valuation</span>
          </h1>
          <p className="mt-6 md:mt-8 max-w-2xl text-sm md:text-base text-neutral-600 leading-relaxed">
            Cost layers built from inbound records. Lower-of-cost-or-NRV per IAS 2 §9.
            Variances, turnover, and holding costs per ACCA Management Decision &amp; Control.
          </p>
          <div className="mt-8 md:mt-12 flex flex-wrap gap-8 md:gap-16 text-[10px] uppercase tracking-[0.3em] text-neutral-500">
            <div>
              <div className="text-neutral-300 mb-1">Products</div>
              <div className="text-neutral-900 text-sm normal-case tracking-normal font-mono">{methodTotals.productCount}</div>
            </div>
            <div>
              <div className="text-neutral-300 mb-1">Stock units</div>
              <div className="text-neutral-900 text-sm normal-case tracking-normal font-mono">{fmtNum(methodTotals.totalStock)}</div>
            </div>
            <div>
              <div className="text-neutral-300 mb-1">At retail</div>
              <div className="text-neutral-900 text-sm normal-case tracking-normal font-mono">{fmtUGX(methodTotals.totalRetail, { compact: true })}</div>
            </div>
            <div>
              <div className="text-neutral-300 mb-1">COGS (365d)</div>
              <div className="text-neutral-900 text-sm normal-case tracking-normal font-mono">{fmtUGX(methodTotals.cogsTrailing, { compact: true })}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          METHOD SELECTOR — 4 huge tiles, no borders
         ════════════════════════════════════════════════════════════ */}
      <section className="px-6 md:px-12 py-12 md:py-20 border-b border-neutral-200">
        <div className="max-w-7xl">
          <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 mb-8 md:mb-12">
            01 — Costing Method
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-200">
            {METHODS.map(m => {
              const isSelected = selectedMethod === m.key
              const methodTotal = m.key === 'fifo' ? methodTotals.fifoTotal
                : m.key === 'avco' ? methodTotals.avcoTotal
                : m.key === 'standard' ? methodTotals.stdTotal
                : methodTotals.fifoTotal
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedMethod(m.key)}
                  className={`
                    group bg-[#FAFAF7] p-6 md:p-8 text-left transition-all duration-300
                    ${isSelected ? 'bg-neutral-900 text-[#FAFAF7]' : 'hover:bg-neutral-50'}
                  `}
                >
                  <div className="flex items-start justify-between mb-6 md:mb-8">
                    <span className={`text-[10px] uppercase tracking-[0.3em] ${isSelected ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      {m.ias}
                    </span>
                    {isSelected && (
                      <CheckCircle2 size={14} className="text-[#FAFAF7]" />
                    )}
                  </div>
                  <h3 className={`text-2xl md:text-3xl font-light tracking-tight mb-2 ${isSelected ? 'text-[#FAFAF7]' : 'text-neutral-900'}`}>
                    {m.label}
                  </h3>
                  <p className={`text-xs mb-6 md:mb-8 ${isSelected ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {m.full}
                  </p>
                  <div className={`text-[10px] uppercase tracking-[0.3em] mb-1 ${isSelected ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    Portfolio total
                  </div>
                  <div className={`text-lg md:text-xl font-mono ${isSelected ? 'text-[#FAFAF7]' : 'text-neutral-900'}`}>
                    {fmtUGX(methodTotal, { compact: true })}
                  </div>
                </button>
              )
            })}
          </div>

          {/* LIFO block notice */}
          <p className="mt-6 md:mt-8 text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            LIFO prohibited under IAS 2 §25 · not available
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SELECTED METHOD — huge total + benchmark range + warnings
         ════════════════════════════════════════════════════════════ */}
      {selectedMethod && method && (
        <section className="px-6 md:px-12 py-16 md:py-24 border-b border-neutral-200">
          <div className="max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
              {/* LEFT — Massive total */}
              <div className="lg:col-span-7">
                <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 mb-6">
                  02 — {method.label} Valuation
                </p>
                <h2 className="text-[10vw] md:text-[7vw] lg:text-[5.5vw] font-light tracking-tight leading-none text-neutral-900 font-mono">
                  {fmtUGX(total, { compact: true, symbol: false })}
                </h2>
                <p className="mt-4 md:mt-6 text-sm text-neutral-500 max-w-md leading-relaxed">
                  {method.hint}
                </p>

                {/* Benchmark range */}
                <div className="mt-10 md:mt-12 pt-6 border-t border-neutral-200">
                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                      Healthy range
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                      {BENCHMARKS.turnover.source}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-xl md:text-2xl font-mono text-neutral-900">
                      {fmtUGX(methodTotals.range.min, { compact: true })}
                    </span>
                    <span className="text-neutral-300 text-sm">—</span>
                    <span className="text-xl md:text-2xl font-mono text-neutral-900">
                      {fmtUGX(methodTotals.range.max, { compact: true })}
                    </span>
                  </div>
                  {/* Range bar */}
                  <div className="relative h-px bg-neutral-200">
                    <div
                      className="absolute h-px bg-neutral-900"
                      style={{
                        left: `${Math.max(0, Math.min(100, (methodTotals.range.min / methodTotals.range.max) * 100))}%`,
                        right: `${Math.max(0, Math.min(100, (1 - methodTotals.range.max / methodTotals.range.max) * 100))}%`,
                      }}
                    />
                    {/* Marker for current value */}
                    {(() => {
                      const pct = Math.max(0, Math.min(100, (total / methodTotals.range.max) * 100))
                      const within = total >= methodTotals.range.min && total <= methodTotals.range.max
                      return (
                        <div
                          className={`absolute w-2 h-2 -top-[3px] -ml-1 ${within ? 'bg-neutral-900' : 'bg-red-600'}`}
                          style={{ left: `${pct}%` }}
                        />
                      )
                    })()}
                  </div>
                  <p className="mt-3 text-[11px] text-neutral-500 leading-relaxed">
                    Range = 80–120% of the cross-method average (FIFO, AVCO, Standard).
                    Indicates whether the chosen method produces a value consistent with peers.
                  </p>
                </div>
              </div>

              {/* RIGHT — Portfolio KPIs */}
              <div className="lg:col-span-5 lg:border-l lg:border-neutral-200 lg:pl-12">
                <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 mb-8">
                  Portfolio metrics
                </p>

                <MetricRow
                  label="Inventory turnover"
                  value={`${portfolio.turnover.toFixed(2)}×`}
                  benchmark={`${BENCHMARKS.turnover.min}–${BENCHMARKS.turnover.max} ${BENCHMARKS.turnover.label}`}
                  status={portfolio.turnoverStatus}
                />
                <MetricRow
                  label="Days inventory outstanding"
                  value={portfolio.dio > 0 ? `${portfolio.dio.toFixed(0)} days` : '—'}
                  benchmark={`${BENCHMARKS.dio.min}–${BENCHMARKS.dio.max} ${BENCHMARKS.dio.label}`}
                  status={portfolio.dioStatus}
                />
                <MetricRow
                  label="Holding cost (annual)"
                  value={fmtUGX(portfolio.holdingTotal, { compact: true })}
                  benchmark={`${(BENCHMARKS.holding.min * 100).toFixed(0)}–${(BENCHMARKS.holding.max * 100).toFixed(0)} ${BENCHMARKS.holding.label}`}
                  status={portfolio.holdingStatus}
                  sub={`${fmtPct(portfolio.holdingPct)} of inventory value`}
                />
                <MetricRow
                  label="NRV write-down"
                  value={fmtUGX(kpis.totalNrvWriteDown, { compact: true })}
                  benchmark={`< ${(BENCHMARKS.nrvWriteDown.max * 100).toFixed(0)} ${BENCHMARKS.nrvWriteDown.label}`}
                  status={portfolio.nrvStatus}
                />
                <MetricRow
                  label="Material price variance"
                  value={fmtUGX(kpis.totalMaterialPriceVariance, { compact: true })}
                  benchmark={`< ${(BENCHMARKS.variance.max * 100).toFixed(0)} ${BENCHMARKS.variance.label}`}
                  status={portfolio.varianceStatus}
                  sub={kpis.totalMaterialPriceVariance >= 0 ? 'Favourable' : 'Adverse'}
                  last
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════
          WARNINGS — inline list, no cards
         ════════════════════════════════════════════════════════════ */}
      {warnings.length > 0 && (
        <section className="px-6 md:px-12 py-12 md:py-16 border-b border-neutral-200 bg-neutral-900 text-[#FAFAF7]">
          <div className="max-w-7xl">
            <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 mb-8">
              03 — Warnings
            </p>
            <div className="divide-y divide-neutral-700">
              {warnings.map((w, i) => (
                <div key={i} className="py-5 md:py-6 flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4 md:gap-6 min-w-0">
                    <StatusDot status={w.status} />
                    <span className="text-sm md:text-base text-[#FAFAF7] truncate">{w.label}</span>
                  </div>
                  <span className="text-sm md:text-base font-mono text-neutral-400 shrink-0">
                    {w.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-8 text-[11px] text-neutral-500 leading-relaxed max-w-2xl">
              Warnings are computed against the filtered product set above. Clear filters to see portfolio-wide warnings.
            </p>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════
          FILTERS — inline, minimal
         ════════════════════════════════════════════════════════════ */}
      <section className="px-6 md:px-12 py-10 md:py-14 border-b border-neutral-200 sticky top-0 bg-[#FAFAF7] z-20">
        <div className="max-w-7xl">
          <div className="flex items-baseline justify-between mb-6 md:mb-8">
            <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400">
              04 — Filters
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
            {/* Product search */}
            <div className="col-span-2 md:col-span-2 lg:col-span-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 block mb-2">Product</label>
              <div className="relative">
                <Search size={12} className="absolute left-0 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Name, ID, or merchant"
                  className="w-full pl-5 pr-2 py-2 bg-transparent border-b border-neutral-300 focus:border-neutral-900 text-sm placeholder:text-neutral-300 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Merchant */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 block mb-2">Merchant</label>
              <select
                value={merchant}
                onChange={e => setMerchant(e.target.value)}
                className="w-full py-2 bg-transparent border-b border-neutral-300 focus:border-neutral-900 text-sm focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">All</option>
                {merchants.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 block mb-2">Received from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full py-2 bg-transparent border-b border-neutral-300 focus:border-neutral-900 text-sm focus:outline-none transition-colors"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 block mb-2">Received to</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full py-2 bg-transparent border-b border-neutral-300 focus:border-neutral-900 text-sm focus:outline-none transition-colors"
              />
            </div>

            {/* Price max */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 block mb-2">Value/unit ≤</label>
              <input
                type="number"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                placeholder="UGX"
                className="w-full py-2 bg-transparent border-b border-neutral-300 focus:border-neutral-900 text-sm placeholder:text-neutral-300 focus:outline-none transition-colors font-mono"
              />
            </div>
          </div>

          {/* Active filter count + results count */}
          <div className="mt-4 md:mt-6 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            <span>
              {hasActiveFilters ? `${filteredProducts.length} of ${data.products.length} products` : `${data.products.length} products`}
            </span>
            {selectedMethod && (
              <span>
                Showing {method.label} valuation
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          PRODUCT LIST — dense, monospace, minimal
         ════════════════════════════════════════════════════════════ */}
      <section className="px-6 md:px-12 py-12 md:py-16">
        <div className="max-w-7xl">
          <div className="flex items-baseline justify-between mb-8 md:mb-10">
            <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400">
              05 — Products
            </p>
            <button
              onClick={load}
              className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 hover:text-neutral-900"
            >
              Refresh
            </button>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-16 md:py-24 text-center">
              <p className="text-sm text-neutral-400">No products match the current filters.</p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 text-xs uppercase tracking-[0.3em] text-neutral-900 underline underline-offset-8 hover:text-neutral-500"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="hidden md:grid grid-cols-12 gap-4 py-3 border-b border-neutral-900 text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                <div className="col-span-4">Product</div>
                <div className="col-span-2">Merchant</div>
                <div className="col-span-1 text-right">On hand</div>
                <div className="col-span-2 text-right">FIFO value</div>
                <div className="col-span-2 text-right">Carrying value</div>
                <div className="col-span-1 text-right">NRV</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-neutral-100">
                {filteredProducts.slice(0, 200).map((p, i) => (
                  <ProductRow
                    key={p.productId}
                    p={p}
                    selectedMethod={selectedMethod}
                    index={i}
                  />
                ))}
              </div>

              {filteredProducts.length > 200 && (
                <div className="py-8 text-center">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                    Showing 200 of {filteredProducts.length} — narrow filters to see more
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          FOOTER — methodology references
         ════════════════════════════════════════════════════════════ */}
      <footer className="px-6 md:px-12 py-16 md:py-24 border-t border-neutral-200">
        <div className="max-w-7xl">
          <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 mb-8">
            Methodology
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-900 mb-3">IAS 2 — Inventories</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Costing methods §25–27. Lower-of-cost-or-NRV §9. Write-downs §33.
                Reversals required under IFRS when NRV recovers.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-900 mb-3">ACCA MDC</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Material price variance. Material usage variance. Inventory turnover.
                Holding cost (4 components). EOQ Wilson formula. ABC Pareto classification.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-900 mb-3">CPA Uganda</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Paper MDC — Management Decision &amp; Control.
                Aligned with IFRS Foundation, URA, and East African accounting practice.
              </p>
            </div>
          </div>
          <p className="mt-12 text-[10px] uppercase tracking-[0.3em] text-neutral-300">
            LIFO is prohibited under IAS 2 §25 — not available in this system
          </p>
        </div>
      </footer>
    </div>
  )
}

// ── Metric row (right column under selected method total) ──
function MetricRow({ label, value, benchmark, status, sub, last }: {
  label: string
  value: string
  benchmark: string
  status: Status
  sub?: string
  last?: boolean
}) {
  return (
    <div className={`py-4 md:py-5 ${last ? '' : 'border-b border-neutral-100'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={status} />
          <span className="text-xs text-neutral-600">{label}</span>
        </div>
        <span className="text-sm md:text-base font-mono text-neutral-900 shrink-0">{value}</span>
      </div>
      <div className="flex items-center justify-between mt-2 pl-7">
        <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
          {benchmark}
        </span>
        {sub && (
          <span className={`text-[10px] uppercase tracking-[0.3em] ${
            sub === 'Favourable' ? 'text-neutral-900' : sub === 'Adverse' ? 'text-red-700' : 'text-neutral-400'
          }`}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Status dot — minimal, monochrome with one accent ──
function StatusDot({ status }: { status: Status }) {
  const color = status === 'healthy' ? 'bg-neutral-900'
    : status === 'monitor' ? 'bg-amber-500'
    : 'bg-red-600'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shrink-0`} />
}

// ── Product row ──
function ProductRow({ p, selectedMethod, index }: {
  p: ProductValuation
  selectedMethod: MethodKey | null
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  const selectedValue = selectedMethod === 'fifo' ? p.fifoValue
    : selectedMethod === 'avco' ? p.avcoValue
    : selectedMethod === 'standard' ? p.standardValue
    : p.fifoValue

  return (
    <>
      <div
        onClick={() => setExpanded(!expanded)}
        className={`grid grid-cols-12 gap-4 py-4 md:py-5 cursor-pointer hover:bg-neutral-50 transition-colors ${expanded ? 'bg-neutral-50' : ''}`}
      >
        {/* Product */}
        <div className="col-span-12 md:col-span-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-neutral-300 font-mono w-6">{(index + 1).toString().padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="text-sm text-neutral-900 truncate">{p.productLabel}</div>
              <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                {p.productId}
                {p.brand ? ` · ${p.brand}` : ''}
                {p.variant ? ` · ${p.variant}` : ''}
              </div>
            </div>
          </div>
        </div>
        {/* Merchant */}
        <div className="col-span-6 md:col-span-2 text-xs text-neutral-600 truncate self-center">
          {p.merchantName}
        </div>
        {/* On hand */}
        <div className="col-span-2 md:col-span-1 text-right text-sm font-mono text-neutral-900 self-center">
          {fmtNum(p.currentStock)}
        </div>
        {/* FIFO value */}
        <div className="col-span-2 md:col-span-2 text-right text-sm font-mono text-neutral-900 self-center">
          {fmtUGX(p.fifoValue, { compact: true })}
        </div>
        {/* Carrying value */}
        <div className="col-span-2 md:col-span-2 text-right text-sm font-mono text-neutral-900 self-center">
          {fmtUGX(p.carryingValue, { compact: true })}
          {p.writeDownRequired && (
            <ArrowDownRight size={11} className="inline-block ml-1 text-red-600" />
          )}
        </div>
        {/* NRV status */}
        <div className="col-span-12 md:col-span-1 text-right self-center flex justify-end">
          {p.writeDownRequired ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-red-700">NRV</span>
          ) : p.varianceFlagged ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-700">VAR</span>
          ) : p.stockoutRisk === 'critical' ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-red-700">RISK</span>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-300">OK</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="pb-8 md:pb-10 pl-9 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-xs">
          {/* All 4 method values */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 mb-3">All methods</p>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">FIFO</span>
                <span className={selectedMethod === 'fifo' ? 'text-neutral-900' : 'text-neutral-400'}>{fmtUGX(p.fifoValue, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">AVCO</span>
                <span className={selectedMethod === 'avco' ? 'text-neutral-900' : 'text-neutral-400'}>{fmtUGX(p.avcoValue, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Standard</span>
                <span className={selectedMethod === 'standard' ? 'text-neutral-900' : 'text-neutral-400'}>{fmtUGX(p.standardValue, { compact: true })}</span>
              </div>
            </div>
          </div>

          {/* Per-unit costs */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 mb-3">Per unit</p>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">FIFO cost</span>
                <span className="text-neutral-900">{fmtUGX(p.fifoUnitCost, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">AVCO cost</span>
                <span className="text-neutral-900">{fmtUGX(p.avcoUnitCost, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Std cost</span>
                <span className="text-neutral-900">{fmtUGX(p.standardCost, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Sell price</span>
                <span className="text-neutral-900">{fmtUGX(p.unitSellingPrice, { compact: true })}</span>
              </div>
            </div>
          </div>

          {/* NRV + Write-down */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 mb-3">NRV (IAS 2 §9)</p>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">NRV/unit</span>
                <span className={p.writeDownRequired ? 'text-red-700' : 'text-neutral-900'}>{fmtUGX(p.nrvPerUnit, { compact: true })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Carrying</span>
                <span className="text-neutral-900">{fmtUGX(p.carryingValue, { compact: true })}</span>
              </div>
              {p.writeDownRequired && (
                <>
                  <div className="flex justify-between text-red-700">
                    <span>Write-down</span>
                    <span>−{fmtUGX(p.writeDownTotal, { compact: true })}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Per unit</span>
                    <span>−{fmtUGX(p.writeDownPerUnit, { compact: true })}</span>
                  </div>
                </>
              )}
              {p.existingWriteDownBalance > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Register</span>
                  <span>{fmtUGX(p.existingWriteDownBalance, { compact: true })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Performance + EOQ */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 mb-3">Performance</p>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">Turnover</span>
                <span className="text-neutral-900">{p.inventoryTurnover > 0 ? `${p.inventoryTurnover.toFixed(2)}×` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">DIO</span>
                <span className={`text-neutral-900 ${p.daysInventoryOutstanding > 120 ? 'text-red-700' : p.daysInventoryOutstanding > 90 ? 'text-amber-700' : ''}`}>
                  {p.daysInventoryOutstanding > 0 ? `${p.daysInventoryOutstanding.toFixed(0)}d` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">EOQ</span>
                <span className="text-neutral-900">{p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">ROP</span>
                <span className="text-neutral-900">{p.reorderPoint > 0 ? p.reorderPoint : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">ABC</span>
                <span className="text-neutral-900">{p.abcClass}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
