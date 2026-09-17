'use client'

import { useEffect, useState, useMemo, useCallback, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RefreshCw, Download, Plus, Settings as SettingsIcon,
  TrendingDown, AlertTriangle, X, ChevronDown,
  HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr,
} from '@/components/shared/ops-ui'
import {
  turnoverNarrative, dioNarrative, holdingCostNarrative, mpvNarrative,
  nrvNarrative, varianceFlaggedNarrative, stockoutNarrative,
  nrvCompact, varianceFlaggedCompact, stockoutCompact,
} from '@/lib/inventory-valuation-narrative'

// ── Types (mirror of API response) ──
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
  seasonality: 'in-season' | 'off-season' | 'steady' | 'no-history' | 'tracking'
  activeMonths: number[]
  soldThisMonthHistorically: boolean
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

// ── Methods: yeezy-style toggle (text labels, active bold/orange, inactive gray) ──
const METHODS: Array<{ key: MethodKey; label: string; full: string; ias: string; hint: string }> = [
  { key: 'fifo',        label: 'FIFO',         full: 'First-In, First-Out',          ias: 'IAS 2 §25', hint: 'Oldest cost issued first. Closing inventory reflects most recent costs.' },
  { key: 'avco',        label: 'AVCO',        full: 'Weighted Average Cost',         ias: 'IAS 2 §27', hint: 'Moving weighted average after each receipt. Smooths price volatility.' },
  { key: 'standard',    label: 'STANDARD',    full: 'Standard Cost',                  ias: 'IAS 2 §21', hint: 'Predetermined cost benchmark. Variance analysis highlights inefficiency.' },
  { key: 'specific_id', label: 'SPECIFIC ID', full: 'Specific Identification',        ias: 'IAS 2 §23', hint: 'Cost traced to specific physical item. For non-interchangeable goods.' },
]

// ── Benchmarks — corrected sources per research/inventory_benchmarks.md ──
// Sources: APICS/ASCM Dictionary, IAS 2, ISA 320, Silver-Pyke-Thomas textbook
const BENCHMARKS = {
  // Throughput Turn (3PL-appropriate, replaces COGS-based Inventory Turnover)
  // Source: APICS/ASCM body of knowledge (not IFRS/ACCA — 3PLs have no COGS)
  // Range applies to durable goods / general manufacturing; 3PL equivalent.
  throughputTurn: { min: 4, max: 6, label: '4–6 turns/year', source: 'APICS/ASCM' },
  // Days of Supply (3PL-appropriate, replaces DIO which requires COGS)
  // Source: APICS/ASCM — operational metric, not financial
  daysOfSupply: { min: 60, max: 90, label: '60–90 days', source: 'APICS/ASCM' },
  // Holding cost 4-component split: Capital/Storage/Service/Risk
  // Source: APICS/ASCM (not ACCA/CIMA — corrected from previous attribution)
  holding:  { min: 0.15, max: 0.30, label: '15–30% of inventory value', source: 'APICS/ASCM' },
  // NRV write-down: IAS 2 §9 is principles-based — NO % threshold exists.
  // Any write-down is required when NRV < cost, regardless of size.
  // The 5% below is an internal analytical convention, not an IFRS standard.
  nrv:      { max: 0.05, label: '< 5% (internal convention)', source: 'IAS 2 §9 (principles-based, no % threshold)' },
  // MPV materiality: NOT an ACCA standard. Originates from US GAAP audit rule of thumb.
  // Authoritative anchor is ISA 320 (judgment-based, no fixed %).
  variance: { max: 0.05, label: '< 5% of standard cost', source: 'ISA 320 (internal policy)' },
}

// ── Formatters ──
const fmtUGX = (n: number, compact = false): string => {
  if (n == null || isNaN(n)) return 'UGX 0'
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `UGX ${(n / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000)     return `UGX ${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000)         return `UGX ${(n / 1_000).toFixed(1)}K`
  }
  return `UGX ${n.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`
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

// ── Status helpers ──
type Status = 'healthy' | 'monitor' | 'critical'
function turnoverStatus(t: number): Status {
  if (t === 0) return 'monitor'
  if (t < BENCHMARKS.throughputTurn.min) return 'critical'
  if (t > BENCHMARKS.throughputTurn.max) return 'monitor'
  return 'healthy'
}
function dioStatus(d: number): Status {
  if (d === 0) return 'monitor'
  if (d > 120) return 'critical'
  if (d > BENCHMARKS.daysOfSupply.max) return 'monitor'
  if (d < BENCHMARKS.daysOfSupply.min) return 'monitor'
  return 'healthy'
}
function holdingStatus(pct: number): Status {
  if (pct > 0.30) return 'critical'
  if (pct > BENCHMARKS.holding.max) return 'monitor'
  if (pct < 0.10) return 'monitor'
  return 'healthy'
}

/**
 * Plain-English translation of a turnover figure: how long one full
 * sell-through of the stock takes at the current pace. Chosen over the
 * raw "turns" unit because time is instantly graspable for non-accountants
 * (e.g. 0.05x → "≈ a full sell-through every 21 years").
 */
function sellThroughPhrase(turnover: number): string {
  if (turnover <= 0) return ''
  const days = 365 / turnover
  if (days >= 730) {
    const y = Math.round(days / 365)
    return `≈ a full sell-through every ${y} ${y === 1 ? 'year' : 'years'}`
  }
  if (days >= 60) {
    const m = Math.round(days / 30)
    return `≈ a full sell-through every ${m} ${m === 1 ? 'month' : 'months'}`
  }
  return `≈ a full sell-through every ${Math.max(1, Math.round(days))} days`
}

/**
 * Plain-English companion to the Days of Supply figure. Normal ranges read
 * as "of stock at today's pace"; extreme stock cover is translated into
 * years, which is what makes the number land (e.g. 7,566 days → "≈ 21 years").
 */
function dioPlainPhrase(dio: number): string {
  if (dio <= 0) return ''
  if (dio >= 730) {
    const y = Math.round(dio / 365)
    return `≈ ${y} ${y === 1 ? 'year' : 'years'} of stock at today's pace`
  }
  return "of stock at today's pace"
}
function nrvStatus(writeDown: number, totalCost: number): Status {
  if (totalCost === 0) return 'healthy'
  const pct = writeDown / totalCost
  if (pct > 0.10) return 'critical'
  if (pct > BENCHMARKS.nrv.max) return 'monitor'
  return 'healthy'
}
function varianceStatus(variance: number, cogs: number): Status {
  if (cogs === 0) return 'healthy'
  const pct = Math.abs(variance) / cogs
  if (pct > 0.15) return 'critical'
  if (pct > BENCHMARKS.variance.max) return 'monitor'
  return 'healthy'
}

function statusColor(s: Status): string {
  return s === 'healthy' ? 'text-green-700'
    : s === 'monitor' ? 'text-amber-700'
    : 'text-red-700'
}
function statusDot(s: Status): string {
  return s === 'healthy' ? 'bg-green-500'
    : s === 'monitor' ? 'bg-amber-500'
    : 'bg-red-500'
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function InventoryValuationModule() {
  const [data, setData] = useState<ValuationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<MethodKey>('fifo')

  // Filters
  const [search, setSearch] = useState('')
  const [merchant, setMerchant] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nrvOpen, setNrvOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  // Active property-sheet tab in the Performance section (Section 02)
  const [perfTab, setPerfTab] = useState<'turnover' | 'dio' | 'holding'>('turnover')

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
      if (json.settings?.defaultCostingMethod) {
        setSelectedMethod(json.settings.defaultCostingMethod as MethodKey)
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setLoadError(msg)
      toast.error(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!data) return []
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 : null
    const minN = priceMin ? parseFloat(priceMin) : null
    const maxN = priceMax ? parseFloat(priceMax) : null

    return data.products.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.productLabel.toLowerCase().includes(q) &&
            !p.merchantName.toLowerCase().includes(q) &&
            !p.productId.toLowerCase().includes(q)) return false
      }
      if (merchant && p.merchantName !== merchant) return false
      if (fromTs || toTs) {
        const layerTs = p.layers[0]?.receivedAt ? new Date(p.layers[0].receivedAt).getTime() : null
        if (layerTs == null) return false
        if (fromTs && layerTs < fromTs) return false
        if (toTs && layerTs > toTs) return false
      }
      const unitVal = p.carryingValuePerUnit
      if (minN != null && unitVal < minN) return false
      if (maxN != null && unitVal > maxN) return false
      return true
    })
  }, [data, search, merchant, dateFrom, dateTo, priceMin, priceMax])

  // ── Helper: get the selected method's value + unit cost for a product ──
  const methodValue = useCallback((p: ProductValuation, method: MethodKey): number => {
    return method === 'fifo' ? p.fifoValue
      : method === 'avco' ? p.avcoValue
      : method === 'standard' ? p.standardValue
      : p.fifoValue // specific_id falls back to FIFO
  }, [])

  const methodUnitCost = useCallback((p: ProductValuation, method: MethodKey): number => {
    return method === 'fifo' ? p.fifoUnitCost
      : method === 'avco' ? p.avcoUnitCost
      : method === 'standard' ? p.standardCost
      : p.fifoUnitCost
  }, [])

  // ── Grouped + sorted products by category (not alphabetical) ──
  // Categories are sorted by total selected-method value (descending) so the
  // highest-value product groups appear first. Within each category, products
  // are sorted by selected-method value (descending) for easy comparison.
  const groupedProducts = useMemo(() => {
    if (!data) return []
    const groups = new Map<string, ProductValuation[]>()
    for (const p of filteredProducts) {
      const cat = p.category || 'Uncategorized'
      const arr = groups.get(cat) || []
      arr.push(p)
      groups.set(cat, arr)
    }
    // Build group objects with subtotals
    const groupArray = Array.from(groups.entries()).map(([category, products]) => {
      const sortedProducts = [...products].sort((a, b) => methodValue(b, selectedMethod) - methodValue(a, selectedMethod))
      const subtotal = sortedProducts.reduce((s, p) => s + methodValue(p, selectedMethod), 0)
      const carryingSubtotal = sortedProducts.reduce((s, p) => s + p.carryingValue, 0)
      const writeDownSubtotal = sortedProducts.reduce((s, p) => s + (p.writeDownRequired ? p.writeDownTotal : 0), 0)
      const stockUnits = sortedProducts.reduce((s, p) => s + p.currentStock, 0)
      return {
        category,
        products: sortedProducts,
        subtotal,
        carryingSubtotal,
        writeDownSubtotal,
        stockUnits,
        count: sortedProducts.length,
      }
    })
    // Sort groups by subtotal descending (highest-value category first)
    groupArray.sort((a, b) => b.subtotal - a.subtotal)
    return groupArray
  }, [filteredProducts, selectedMethod, methodValue])

  // Totals per method (over filtered set)
  const methodTotals = useMemo(() => {
    if (!data) return null
    const ps = filteredProducts
    let fifoTotal = 0, avcoTotal = 0, stdTotal = 0
    let writeDownTotal = 0, nrvWriteDownCount = 0
    let varianceFlaggedCount = 0, stockoutCriticalCount = 0
    let totalStock = 0, totalRetail = 0
    for (const p of ps) {
      fifoTotal += p.fifoValue
      avcoTotal += p.avcoValue
      stdTotal  += p.standardValue
      if (p.writeDownRequired) { writeDownTotal += p.writeDownTotal; nrvWriteDownCount++ }
      if (p.varianceFlagged) varianceFlaggedCount++
      if (p.stockoutRisk === 'critical') stockoutCriticalCount++
      totalStock += p.currentStock
      totalRetail += p.currentStock * p.unitSellingPrice
    }
    const selectedTotal = selectedMethod === 'fifo' ? fifoTotal
      : selectedMethod === 'avco' ? avcoTotal
      : selectedMethod === 'standard' ? stdTotal
      : fifoTotal
    const avg = (fifoTotal + avcoTotal + stdTotal) / 3
    return {
      fifoTotal, avcoTotal, stdTotal, selectedTotal,
      writeDownTotal, nrvWriteDownCount, varianceFlaggedCount, stockoutCriticalCount,
      totalStock, totalRetail,
      range: { min: avg * 0.80, max: avg * 1.20 },
      productCount: ps.length,
    }
  }, [data, selectedMethod, filteredProducts])

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
      nrvStatus: nrvStatus(k.totalNrvWriteDown, k.totalInventoryAtCost),
      varianceStatus: varianceStatus(k.totalMaterialPriceVariance, k.cogsTrailing),
    }
  }, [data])

  const merchants = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.products.map(p => p.merchantName))).sort()
  }, [data])

  const clearFilters = () => {
    setSearch(''); setMerchant(''); setDateFrom(''); setDateTo(''); setPriceMin(''); setPriceMax('')
  }
  const hasActiveFilters = !!(search || merchant || dateFrom || dateTo || priceMin || priceMax)

  // ── Save settings ──
  const handleSaveSettings = async (s: Partial<Settings>) => {
    try {
      const res = await fetch('/api/inventory-valuation/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed') }
      toast.success('Valuation settings updated')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save settings') }
  }

  const handleMethodChange = async (productId: string, method: string) => {
    try {
      const res = await fetch('/api/inventory-valuation/method', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, costingMethod: method }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed') }
      toast.success(`Costing method changed to ${method.toUpperCase()}`)
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to change method') }
  }

  const handleNrvSubmit = async (d: { productId: string; qty: number; unitCost: number; nrvPerUnit: number; reason: string }) => {
    try {
      const res = await fetch('/api/inventory-valuation/nrv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'write_down', ...d }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed') }
      toast.success('NRV write-down recorded (IAS 2 §9)')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to record write-down') }
  }

  const handleNrvReverse = async (row: NrvRow) => {
    const newNrv = prompt(`Enter new NRV per unit (must be > ${row.nrvPerUnit.toLocaleString()} UGX to reverse):`)
    if (!newNrv) return
    const reason = prompt('Reason for reversal (audit trail):')
    if (!reason) return
    try {
      const res = await fetch('/api/inventory-valuation/nrv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'reversal', reversesId: row.id, qty: row.qty, nrvPerUnitNew: parseFloat(newNrv), reason }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed') }
      toast.success('NRV reversal recorded (IAS 2 §33)')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to record reversal') }
  }

  const exportCsv = () => {
    if (!data || !methodTotals) return
    const methodLabel = METHODS.find(m => m.key === selectedMethod)?.label || selectedMethod
    const headers = ['Category', 'Product', 'Merchant', 'On Hand', `${methodLabel} Value`, `${methodLabel} Cost/unit`, 'Carrying Value', 'NRV/unit', 'Write-down', 'ABC', 'Turnover', 'DIO', 'EOQ', 'ROP']
    const rows: (string | number)[][] = []
    for (const group of groupedProducts) {
      for (const p of group.products) {
        rows.push([
          group.category,
          p.productLabel, p.merchantName, p.currentStock,
          methodValue(p, selectedMethod).toFixed(0),
          methodUnitCost(p, selectedMethod).toFixed(0),
          p.carryingValue.toFixed(0), p.nrvPerUnit.toFixed(0),
          p.writeDownRequired ? p.writeDownTotal.toFixed(0) : '0',
          p.abcClass, p.inventoryTurnover.toFixed(2), p.daysInventoryOutstanding.toFixed(0),
          p.eoq.toFixed(0), p.reorderPoint,
        ])
      }
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `inventory-valuation-${selectedMethod}-${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Affected products per metric (for clickable issue tables) ──
  // MUST be before early returns — React hooks cannot be after conditional returns.
  const affectedProducts = useMemo(() => {
    if (!data) return {
      turnover: [] as ProductValuation[],
      dio: [] as ProductValuation[],
      holding: [] as ProductValuation[],
      mpv: [] as ProductValuation[],
      nrv: [] as ProductValuation[],
      variance: [] as ProductValuation[],
      stockout: [] as ProductValuation[],
      reorderQueue: [] as ProductValuation[],
      seasonal: [] as ProductValuation[],
      investigate: [] as ProductValuation[],
      merchantFollowUp: [] as ProductValuation[],
      tracking: [] as ProductValuation[],
      obsolete: [] as ProductValuation[],
    }
    const ps = filteredProducts
    const slowMoving = ps.filter(p => p.daysInventoryOutstanding > 90 || p.inventoryTurnover < 4)

    return {
      turnover: ps.filter(p => p.inventoryTurnover > 0 && p.inventoryTurnover < 4).sort((a, b) => a.inventoryTurnover - b.inventoryTurnover),
      dio: ps.filter(p => p.daysInventoryOutstanding > 90).sort((a, b) => b.daysInventoryOutstanding - a.daysInventoryOutstanding),
      holding: ps.filter(p => p.holdingCostPerUnit > 0).sort((a, b) => b.holdingCostPerUnit - a.holdingCostPerUnit).slice(0, 20),
      mpv: ps.filter(p => p.varianceFlagged).sort((a, b) => Math.abs(b.materialPriceVariance) - Math.abs(a.materialPriceVariance)),
      nrv: ps.filter(p => p.writeDownRequired).sort((a, b) => b.writeDownTotal - a.writeDownTotal),
      variance: ps.filter(p => p.varianceFlagged).sort((a, b) => Math.abs(b.materialPriceVariance) - Math.abs(a.materialPriceVariance)),
      stockout: ps.filter(p => p.stockoutRisk === 'critical').sort((a, b) => a.currentStock - b.currentStock),
      // Reorder queue: products at/below reorder point, ranked by days of cover (ascending)
      reorderQueue: ps.filter(p => p.reorderPoint > 0 && p.currentStock <= p.reorderPoint)
        .sort((a, b) => {
          const aDays = a.annualDemand > 0 ? (a.currentStock / (a.annualDemand / 365)) : 999
          const bDays = b.annualDemand > 0 ? (b.currentStock / (b.annualDemand / 365)) : 999
          return aDays - bDays
        }),
      // Slow-moving stock segmented by likely cause:
      seasonal: slowMoving.filter(p => p.seasonality === 'off-season'),
      investigate: slowMoving.filter(p => p.seasonality === 'in-season' || p.seasonality === 'steady'),
      merchantFollowUp: slowMoving.filter(p => p.seasonality === 'no-history' && p.currentStock > 0),
      tracking: slowMoving.filter(p => p.seasonality === 'tracking' && p.currentStock > 0),
      obsolete: slowMoving.filter(p => p.daysInventoryOutstanding > 365 && p.seasonality !== 'off-season' && p.seasonality !== 'tracking'),
    }
  }, [data, filteredProducts])

  // ── Loading state ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <RefreshCw size={16} className="animate-spin mr-2" />
        <span className="text-xs uppercase tracking-wider">Computing valuation…</span>
      </div>
    )
  }

  // ── Error panel ──
  if (loadError && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-red-900 mb-1">Failed to load Inventory Valuation</h3>
              <p className="text-xs text-red-700 font-mono break-words mb-3">{loadError}</p>
              <div className="mt-3 pt-3 border-t border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Most likely cause — run these in order:</p>
                <ol className="text-xs text-red-800 space-y-1 list-decimal list-inside font-mono">
                  <li>npx prisma generate</li>
                  <li>npx prisma db push</li>
                  <li>npm run dev</li>
                </ol>
              </div>
              <button onClick={() => { setLoadError(null); load() }} className="mt-3 text-xs font-medium text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-md border border-red-200">
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data || !portfolio || !methodTotals) return null

  // ── After null check: safe to use data, portfolio, methodTotals without null guards ──
  const { kpis } = data
  const activeMethod = METHODS.find(m => m.key === selectedMethod) || METHODS[0]
  const total = methodTotals.selectedTotal

  // Warnings list — built after null check so methodTotals/portfolio/kpis are safe
  const warnings: Array<{
    compact: string; narrative: string; status: Status
    affectedProducts: ProductValuation[]; affectedColumns: string[]; affectedTitle: string
  }> = []
  if (methodTotals.nrvWriteDownCount > 0) {
    warnings.push({
      compact: nrvCompact(methodTotals.nrvWriteDownCount, methodTotals.writeDownTotal, portfolio.nrvStatus),
      narrative: nrvNarrative({
        count: methodTotals.nrvWriteDownCount,
        total: methodTotals.writeDownTotal,
        inventoryValue: kpis.totalInventoryAtCost,
        status: portfolio.nrvStatus,
      }),
      status: portfolio.nrvStatus,
      affectedProducts: affectedProducts.nrv,
      affectedColumns: ['nrvPerUnit', 'writeDownTotal', 'carryingValue'],
      affectedTitle: 'Products requiring NRV write-down',
    })
  }
  if (methodTotals.varianceFlaggedCount > 0) {
    warnings.push({
      compact: varianceFlaggedCompact(methodTotals.varianceFlaggedCount, portfolio.varianceStatus),
      narrative: varianceFlaggedNarrative({
        count: methodTotals.varianceFlaggedCount,
        status: portfolio.varianceStatus,
        materialityPct: data.settings.varianceMaterialityPct,
      }),
      status: portfolio.varianceStatus,
      affectedProducts: affectedProducts.variance,
      affectedColumns: ['mpv', 'standardCost', 'actualCost'],
      affectedTitle: 'Products with material price variance flagged',
    })
  }
  if (methodTotals.stockoutCriticalCount > 0) {
    warnings.push({
      compact: stockoutCompact(methodTotals.stockoutCriticalCount),
      narrative: stockoutNarrative({ count: methodTotals.stockoutCriticalCount }),
      status: 'critical',
      affectedProducts: affectedProducts.stockout,
      affectedColumns: ['currentStock', 'reorderPoint', 'eoq'],
      affectedTitle: 'Products at critical stockout risk',
    })
  }

  // KPI cells
  const kpiCells = [
    { label: 'INV AT COST', value: fmtUGX(kpis.totalInventoryAtCost, true) },
    { label: 'CARRYING VALUE', value: fmtUGX(kpis.totalCarryingValue, true), highlight: kpis.totalNrvWriteDown > 0, highlightColor: 'orange' as const },
    { label: 'NRV WRITE-DOWN', value: fmtUGX(kpis.totalNrvWriteDown, true), highlight: kpis.totalNrvWriteDown > 0, highlightColor: 'red' as const },
    { label: 'TURNOVER', value: `${kpis.portfolioTurnover.toFixed(2)}×` },
    { label: 'DIO', value: kpis.portfolioDio > 0 ? `${kpis.portfolioDio.toFixed(0)}d` : '—' },
    { label: 'HOLDING %', value: fmtPct(kpis.holdingCostPct), highlight: kpis.holdingCostPct > 0.30, highlightColor: 'red' as const },
    { label: 'COGS (365d)', value: fmtUGX(kpis.cogsTrailing, true) },
  ]

  // ── Performance tab config (Section 02) ──
  // Each metric is a property-sheet tab: headline number + acceptable-range
  // comparison bar + a sortable details list of the products driving it.
  // Per-product holding rate = holdingCostPerUnit / carryingValuePerUnit —
  // the same definition as the portfolio holdingCostPct, so both sit on the
  // same 15–30% scale and are directly comparable on the bar.
  const perfTabs = [
    {
      key: 'turnover' as const,
      label: 'Throughput Turn',
      anim: 'turn' as const,
      // Concept-glyph loop speed follows the real value: slow turnover = slow cycle.
      glyphSeconds: Math.min(9, Math.max(1.5, 2.5 / Math.max(portfolio.turnover, 0.01))),
      status: portfolio.turnoverStatus,
      value: portfolio.turnover > 0 ? `${portfolio.turnover.toFixed(2)}×` : '—',
      shortValue: portfolio.turnover > 0 ? `${portfolio.turnover.toFixed(2)}×` : '—',
      unit: sellThroughPhrase(portfolio.turnover),
      benchmark: '4–6 turns a year',
      source: 'APICS/ASCM',
      band: { min: 4, max: 6 },
      domain: 8,
      metricLabel: 'Turns/yr',
      portfolioValue: portfolio.turnover,
      metricOf: (p: ProductValuation) => p.inventoryTurnover,
      fmtMetric: (n: number) => (n > 0 ? `${n.toFixed(2)}×` : '—'),
      statusOf: (p: ProductValuation) => turnoverStatus(p.inventoryTurnover),
      worstFirst: 'low' as const,
      affectedCount: affectedProducts.turnover.length,
      detail: turnoverNarrative({ turnover: portfolio.turnover, status: portfolio.turnoverStatus }),
      affectedProducts: affectedProducts.turnover,
      columns: [
        { label: 'Days', get: (p: ProductValuation) => (p.daysInventoryOutstanding > 0 ? `${p.daysInventoryOutstanding.toFixed(0)}d` : '—') },
        { label: 'Carrying value', get: (p: ProductValuation) => fmtUGX(p.carryingValue, true) },
      ],
    },
    {
      key: 'dio' as const,
      label: 'Days of Supply',
      anim: 'days' as const,
      // The pile drains over one loop per supply horizon: long supply = glacial drain.
      glyphSeconds: Math.min(10, Math.max(2, portfolio.dio / 12)),
      status: portfolio.dioStatus,
      value: portfolio.dio > 0 ? `${Math.round(portfolio.dio).toLocaleString('en-US')} days` : '—',
      shortValue: portfolio.dio > 0 ? `${portfolio.dio.toFixed(0)}d` : '—',
      unit: dioPlainPhrase(portfolio.dio),
      benchmark: '60–90 days',
      source: 'APICS/ASCM',
      band: { min: 60, max: 90 },
      domain: 365,
      metricLabel: 'Days',
      portfolioValue: portfolio.dio,
      metricOf: (p: ProductValuation) => p.daysInventoryOutstanding,
      fmtMetric: (n: number) => (n > 0 ? `${n.toFixed(0)}d` : '—'),
      statusOf: (p: ProductValuation) => dioStatus(p.daysInventoryOutstanding),
      worstFirst: 'high' as const,
      affectedCount: affectedProducts.dio.length,
      detail: dioNarrative({ dio: portfolio.dio, status: portfolio.dioStatus }),
      affectedProducts: affectedProducts.dio,
      columns: [
        { label: 'Turns/yr', get: (p: ProductValuation) => (p.inventoryTurnover > 0 ? `${p.inventoryTurnover.toFixed(2)}×` : '—') },
        { label: 'Carrying value', get: (p: ProductValuation) => fmtUGX(p.carryingValue, true) },
      ],
    },
    {
      key: 'holding' as const,
      label: 'Holding Cost',
      anim: 'hold' as const,
      glyphSeconds: 3.2,
      status: portfolio.holdingStatus,
      value: fmtPct(portfolio.holdingPct),
      shortValue: fmtPct(portfolio.holdingPct),
      unit: `≈ UGX ${Math.round(portfolio.holdingPct * 100)} per UGX 100 of stock, per year`,
      benchmark: '15–30% a year',
      source: 'APICS/ASCM',
      band: { min: 15, max: 30 },
      domain: 60,
      metricLabel: 'Rate/yr',
      portfolioValue: portfolio.holdingPct * 100,
      metricOf: (p: ProductValuation) => (p.carryingValuePerUnit > 0 ? (p.holdingCostPerUnit / p.carryingValuePerUnit) * 100 : 0),
      fmtMetric: (n: number) => `${n.toFixed(1)}%`,
      statusOf: (p: ProductValuation) => holdingStatus(p.carryingValuePerUnit > 0 ? p.holdingCostPerUnit / p.carryingValuePerUnit : 0),
      worstFirst: 'high' as const,
      affectedCount: affectedProducts.holding.length,
      detail: holdingCostNarrative({ pct: portfolio.holdingPct, total: portfolio.holdingTotal, status: portfolio.holdingStatus }),
      affectedProducts: affectedProducts.holding,
      columns: [
        { label: 'Hold /unit/yr', get: (p: ProductValuation) => fmtUGX(p.holdingCostPerUnit, true) },
        { label: 'Carrying value', get: (p: ProductValuation) => fmtUGX(p.carryingValue, true) },
      ],
    },
  ]
  const activePerf = perfTabs.find(t => t.key === perfTab) ?? perfTabs[0]

  return (
    <div className="space-y-3">
      {/* ── Header + KPI ribbon (same as every other module) ── */}
      <OpsHeader
        title="Inventory Valuation"
        description="IAS 2 costing · Lower-of-cost-or-NRV · ACCA MDC variance, turnover & holding cost"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products..."
      >
        <Button size="sm" variant="outline" onClick={load} className="h-7 text-xs rounded-md shadow-sm hover:shadow-md active:shadow-inner active:translate-y-px transition-all">
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} className="h-7 text-xs rounded-md shadow-sm hover:shadow-md active:shadow-inner active:translate-y-px transition-all">
          <SettingsIcon size={12} className="mr-1" /> Settings
        </Button>
        <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md shadow-sm hover:shadow-md active:shadow-inner active:translate-y-px transition-all">
          <HelpCircle size={12} className="mr-1" /> Help
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs rounded-md shadow-sm hover:shadow-md active:shadow-inner active:translate-y-px transition-all">
          <Download size={12} className="mr-1" /> Export
        </Button>
        <Button size="sm" onClick={() => setNrvOpen(true)} className="h-7 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white shadow-sm hover:shadow-md active:shadow-inner active:translate-y-px transition-all">
          <Plus size={12} className="mr-1" /> NRV Write-Down
        </Button>
      </OpsHeader>

      {/* ── Method toggle — physical control panel ── */}
      <Panel title="Costing Method Selection" number="▸" variant="raised">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-400">Select a costing method to recompute the entire module · IAS 2</span>
          <span className="text-[10px] text-gray-400">LIFO prohibited §25</span>
        </div>
        {/* Physical tab buttons — active tab appears pressed in */}
        <div className="flex items-center gap-1 border-b-2 border-gray-200 pb-0">
          {METHODS.map(m => {
            const isActive = selectedMethod === m.key
            const methodTotal = m.key === 'fifo' ? methodTotals.fifoTotal
              : m.key === 'avco' ? methodTotals.avcoTotal
              : m.key === 'standard' ? methodTotals.stdTotal
              : methodTotals.fifoTotal
            return (
              <button
                key={m.key}
                onClick={() => setSelectedMethod(m.key)}
                className={`group flex flex-col items-start px-4 py-2.5 rounded-t-md transition-all ${
                  isActive
                    ? 'bg-gray-100 shadow-inner border-2 border-gray-300 border-b-gray-100 -mb-px text-[#FF6B35]'
                    : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100 hover:shadow-sm active:translate-y-px'
                }`}
              >
                <span className={`text-sm font-bold tracking-wide transition-colors ${
                  isActive ? 'text-[#FF6B35]' : 'text-gray-400 group-hover:text-gray-600'
                }`}>
                  {m.label}
                </span>
                <span className={`text-[10px] font-mono mt-0.5 transition-colors ${
                  isActive ? 'text-gray-700' : 'text-gray-300 group-hover:text-gray-400'
                }`}>
                  {fmtUGX(methodTotal, true)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected method detail */}
        <div className="mt-3 space-y-4">
          {/* Section 01 — Portfolio Valuation with Gauge */}
          <Panel title={activeMethod.full + ' · ' + activeMethod.ias} number="01" variant="inset">
            {/* NRV explanation */}
            <p className="text-[11px] text-gray-500 leading-relaxed italic mb-3">
              Net Realisable Value (NRV) is what you could sell the product for today, minus selling costs.
              IAS 2 requires inventory at the lower of cost or NRV — so if you bought stock for UGX 500 but can only sell it for UGX 450, you must write it down to UGX 450.
            </p>
            {/* The gauge IS the data — number is secondary */}
            <Gauge
              value={total}
              min={methodTotals.range.min}
              max={methodTotals.range.max}
              label="Portfolio Value"
              sublabel="orange = within range · red = outside"
            />
            {/* Cross-method comparison chips */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">Cross-method:</span>
              <span className={`font-mono px-2 py-0.5 rounded text-[11px] ${selectedMethod === 'fifo' ? 'bg-[#FF6B35]/10 text-[#FF6B35] font-bold border border-[#FF6B35]/20' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                FIFO {fmtUGX(methodTotals.fifoTotal, true)}
              </span>
              <span className={`font-mono px-2 py-0.5 rounded text-[11px] ${selectedMethod === 'avco' ? 'bg-[#FF6B35]/10 text-[#FF6B35] font-bold border border-[#FF6B35]/20' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                AVCO {fmtUGX(methodTotals.avcoTotal, true)}
              </span>
              <span className={`font-mono px-2 py-0.5 rounded text-[11px] ${selectedMethod === 'standard' ? 'bg-[#FF6B35]/10 text-[#FF6B35] font-bold border border-[#FF6B35]/20' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                STD {fmtUGX(methodTotals.stdTotal, true)}
              </span>
            </div>
          </Panel>

          {/* Section 02 — Performance — property-sheet tabs in the module's
              control-panel aesthetic: gray chrome, LED status, orange accent */}
          <Panel title="Performance" number="02" variant="raised">
            <p className="text-[11px] text-gray-500 leading-relaxed mb-2">
              Each tab shows one metric compared with its acceptable range. The bar marks the current value, and the
              table lists the products involved. Click a column header to sort.
            </p>
            <div className="rounded-md border border-gray-300 bg-white overflow-hidden shadow-md">
              {/* Tab strip — property-sheet header on the module's gray chrome */}
              <div role="tablist" aria-label="Performance metrics" className="flex items-end gap-[3px] px-2.5 pt-2 bg-gray-100 border-b border-gray-300">
                {perfTabs.map(t => {
                  const active = t.key === activePerf.key
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      id={`perf-tab-${t.key}`}
                      aria-selected={active}
                      aria-controls={`perf-panel-${t.key}`}
                      onClick={() => setPerfTab(t.key)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-t-[4px] border text-[11px] transition-colors -mb-px ${
                        active
                          ? 'relative z-10 bg-white border-gray-300 border-b-white text-gray-900 font-semibold shadow-[0_-1px_2px_rgba(0,0,0,0.06)]'
                          : 'bg-gray-50 border-gray-200 border-b-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      <LED status={t.status} size={7} />
                      <span>{t.label}</span>
                      <span className={`font-mono text-[10px] ${active ? 'text-[#FF6B35] font-bold' : 'text-gray-400'}`}>{t.shortValue}</span>
                    </button>
                  )
                })}
              </div>

              {/* Active tab panel — form row + comparison bar + details list + narrative */}
              <div role="tabpanel" id={`perf-panel-${activePerf.key}`} aria-labelledby={`perf-tab-${activePerf.key}`} className="p-3 space-y-2.5">
                {/* Summary form row — label + recessed value field, XP form style */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <LED status={activePerf.status} size={8} />
                    <span className="text-[11px] font-semibold text-gray-700">{activePerf.label}:</span>
                  </div>
                  <div className="relative h-7 w-32 shrink-0 bg-gray-100 border border-gray-300 rounded-sm shadow-inner flex items-center gap-1.5 px-2">
                    {activePerf.value !== '—' && <MetricGlyph kind={activePerf.anim} seconds={activePerf.glyphSeconds} />}
                    <span className="text-xs font-mono font-bold text-gray-900 truncate">{activePerf.value}</span>
                  </div>
                  {activePerf.value !== '—' && (
                    <span className="text-[10px] text-gray-500 shrink-0">{activePerf.unit}</span>
                  )}
                  <span className="text-[9px] text-green-600 font-mono shrink-0">Acceptable: {activePerf.benchmark}</span>
                  {activePerf.affectedCount > 0 && (
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 border ${
                      activePerf.status === 'critical' ? 'bg-red-50 text-red-600 border-red-200'
                        : activePerf.status === 'monitor' ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>{activePerf.affectedCount} product{activePerf.affectedCount > 1 ? 's' : ''} {activePerf.worstFirst === 'low' ? 'below' : 'above'} range</span>
                  )}
                </div>

                {/* Portfolio value vs acceptable range — the comparison bar */}
                <div className="flex items-center gap-2" title={`${activePerf.label}: ${activePerf.fmtMetric(activePerf.portfolioValue)} · acceptable range ${activePerf.benchmark}`}>
                  <BenchmarkBar
                    key={activePerf.label}
                    value={activePerf.portfolioValue}
                    bandMin={activePerf.band.min}
                    bandMax={activePerf.band.max}
                    domainMax={activePerf.domain}
                    status={activePerf.status}
                    className="flex-1"
                  />
                  <span className="w-24 shrink-0 text-right text-[9px] text-green-600 font-mono">{activePerf.benchmark}</span>
                </div>

                {/* Affected products — sortable details list in the module's aesthetic */}
                <PerfProductList
                  key={activePerf.label}
                  products={activePerf.affectedProducts}
                  metricLabel={activePerf.metricLabel}
                  metricOf={activePerf.metricOf}
                  fmtMetric={activePerf.fmtMetric}
                  statusOf={activePerf.statusOf}
                  band={activePerf.band}
                  domainMax={activePerf.domain}
                  benchmarkLabel={activePerf.benchmark}
                  worstFirst={activePerf.worstFirst}
                  columns={activePerf.columns}
                />

                {/* Details pane — recessed footer strip carrying the narrative */}
                <div className="flex items-start gap-2 rounded-sm border border-gray-200 bg-gray-50 px-3 py-2">
                  <LED status={activePerf.status} size={8} />
                  <p className="text-[11px] text-gray-600 leading-relaxed">{activePerf.detail}</p>
                </div>
              </div>

              {/* Status strip — recessed segments along the panel bottom */}
              <div className="flex items-center gap-1 border-t border-gray-300 bg-gray-100 px-1.5 py-1">
                <span className="border border-gray-200 bg-gray-50 rounded-sm px-2 py-0.5 text-[9px] font-mono text-gray-500">
                  {Math.min(activePerf.affectedProducts.length, PERF_LIST_CAP)} of {activePerf.affectedProducts.length} affected products shown
                </span>
                <span className="border border-gray-200 bg-gray-50 rounded-sm px-2 py-0.5 text-[9px] font-mono text-gray-500">
                  Acceptable range: {activePerf.benchmark} · source {activePerf.source}
                </span>
                <span className="ml-auto flex items-center gap-1.5 border border-gray-200 bg-gray-50 rounded-sm px-2 py-0.5 text-[9px] font-mono text-gray-500">
                  <LED status={activePerf.status} size={7} />
                  {activePerf.status === 'critical' ? 'Critical' : activePerf.status === 'monitor' ? 'Monitor' : 'Healthy'}
                </span>
              </div>
            </div>

            {/* Price Variance — single expandable metric below the tabs */}
            <div className="mt-2 pt-2 border-t border-gray-200">
              <PerformanceRow
                label="Price Variance"
                status={portfolio.varianceStatus}
                value={kpis.totalMaterialPriceVariance === 0 ? '—' : `${kpis.totalMaterialPriceVariance >= 0 ? '+' : ''}${fmtUGX(kpis.totalMaterialPriceVariance, true)}`}
                benchmark="< 5%"
                barPct={kpis.cogsTrailing > 0 ? Math.min(100, (Math.abs(kpis.totalMaterialPriceVariance) / (kpis.cogsTrailing * 0.15)) * 100) : 0}
                benchmarkPct={(0.05 / 0.15) * 100}
                affectedCount={affectedProducts.mpv.length}
                detail={mpvNarrative({ variance: kpis.totalMaterialPriceVariance, status: portfolio.varianceStatus, materialityPct: data.settings.varianceMaterialityPct })}
                affectedProducts={affectedProducts.mpv}
                affectedColumns={['mpv', 'standardCost']}
              />
            </div>
          </Panel>

          {/* Section 03 — Slow-moving stock — status cards, not text descriptions */}
          <Panel title="Slow-moving Stock Review" number="03" variant="raised">
            {(() => {
              const totalSlow = affectedProducts.seasonal.length + affectedProducts.investigate.length + affectedProducts.merchantFollowUp.length + affectedProducts.tracking.length + affectedProducts.obsolete.length + affectedProducts.nrv.length
              if (totalSlow === 0) {
                return (
                  <div className="flex items-center gap-2 py-4">
                    <LED status="healthy" size={12} />
                    <span className="text-[13px] text-gray-700">No slow-moving stock — all products healthy.</span>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {affectedProducts.seasonal.length > 0 && (
                    <StatusChip
                      status="monitor"
                      label="Seasonal"
                      count={affectedProducts.seasonal.length}
                      action="Hold — review when season returns"
                      detail="These products have a seasonal pattern and are currently off-season. No write-down needed unless damaged."
                      affectedProducts={affectedProducts.seasonal}
                      affectedColumns={['dio', 'turnover']}
                    />
                  )}
                  {affectedProducts.investigate.length > 0 && (
                    <StatusChip
                      status="critical"
                      label="Investigate"
                      count={affectedProducts.investigate.length}
                      action="Check pricing — should be selling"
                      detail="These products should be selling but aren't. Suggests pricing, quality, or market shift."
                      affectedProducts={affectedProducts.investigate}
                      affectedColumns={['dio', 'turnover', 'mpv']}
                    />
                  )}
                  {affectedProducts.merchantFollowUp.length > 0 && (
                    <StatusChip
                      status="monitor"
                      label="Merchant Follow-up"
                      count={affectedProducts.merchantFollowUp.length}
                      action="Contact merchant — no sales history"
                      detail="No delivery history in 365 days. Merchant may have abandoned this product."
                      affectedProducts={affectedProducts.merchantFollowUp}
                      affectedColumns={['currentStock', 'carryingValue']}
                    />
                  )}
                  {affectedProducts.tracking.length > 0 && (
                    <StatusChip
                      status="monitor"
                      label="Tracking"
                      count={affectedProducts.tracking.length}
                      action="No action — data collecting"
                      detail="Less than 12 months of data. System will classify seasonality after 1 year."
                      affectedProducts={affectedProducts.tracking}
                      affectedColumns={['currentStock', 'carryingValue']}
                    />
                  )}
                  {affectedProducts.obsolete.length > 0 && (
                    <StatusChip
                      status="critical"
                      label="Obsolete"
                      count={affectedProducts.obsolete.length}
                      action="Discount, RTV, or dispose"
                      detail="No movement in 365+ days, not seasonal. Options: discount to clear, return to vendor, or dispose."
                      affectedProducts={affectedProducts.obsolete}
                      affectedColumns={['carryingValue', 'dio']}
                    />
                  )}
                  {affectedProducts.nrv.length > 0 && (
                    <StatusChip
                      status={portfolio.nrvStatus}
                      label="Price Below Cost"
                      count={affectedProducts.nrv.length}
                      action={`Write down ${fmtUGX(affectedProducts.nrv.reduce((s, p) => s + p.writeDownTotal, 0), true)}`}
                      detail="Selling price has fallen below cost. IAS 2 requires writing down to NRV."
                      affectedProducts={affectedProducts.nrv}
                      affectedColumns={['nrvPerUnit', 'writeDownTotal', 'carryingValue']}
                    />
                  )}
                </div>
              )
            })()}
          </Panel>

          {/* Section 03b — Reorder Queue */}
          {affectedProducts.reorderQueue.length > 0 && (
            <Panel title="Reorder Queue" number="03b" variant="inset">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-400">
                  {affectedProducts.reorderQueue.length} product{affectedProducts.reorderQueue.length > 1 ? 's' : ''} at/below reorder point
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 text-[9px] uppercase">
                      <th className="px-2 py-1 text-left font-semibold">Product</th>
                      <th className="px-2 py-1 text-right font-semibold">Stock</th>
                      <th className="px-2 py-1 text-right font-semibold">Days cover</th>
                      <th className="px-2 py-1 text-right font-semibold">EOQ</th>
                      <th className="px-2 py-1 text-right font-semibold">Order value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affectedProducts.reorderQueue.slice(0, 15).map(p => {
                      const daysCover = p.annualDemand > 0 ? (p.currentStock / (p.annualDemand / 365)) : 999
                      const orderValue = p.eoq > 0 ? p.eoq * p.standardCost : 0
                      return (
                        <tr key={p.productId} className="border-t border-gray-100 hover:bg-white">
                          <td className="px-2 py-1 text-gray-900 truncate max-w-[180px]">{p.productLabel}</td>
                          <td className="px-2 py-1 text-right font-mono text-gray-700">{fmtNum(p.currentStock)}</td>
                          <td className={`px-2 py-1 text-right font-mono font-semibold ${daysCover <= 3 ? 'text-red-700' : daysCover <= 7 ? 'text-amber-700' : 'text-gray-700'}`}>
                            {daysCover === 999 ? '—' : `${daysCover.toFixed(0)}d`}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-blue-700">{p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'}</td>
                          <td className="px-2 py-1 text-right font-mono text-gray-900">{fmtUGX(orderValue, true)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {affectedProducts.reorderQueue.length > 15 && (
                  <div className="px-2 py-1 text-[10px] text-gray-400 text-center">
                    + {affectedProducts.reorderQueue.length - 15} more
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </Panel>

      {/* ── Section 04 — Filters ── */}
      <Panel title="Filters" number="04" variant="inset">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Product</Label>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, ID, or merchant"
              className="h-8 mt-1 text-xs rounded-md"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Merchant</Label>
            <select
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              className="w-full h-8 mt-1 px-2 rounded-md border border-gray-200 text-xs bg-white"
            >
              <option value="">All</option>
              {merchants.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Received from</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 mt-1 text-xs rounded-md" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Received to</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 mt-1 text-xs rounded-md" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Value/unit ≤</Label>
            <Input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="UGX" className="h-8 mt-1 text-xs rounded-md font-mono" />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {hasActiveFilters ? `${filteredProducts.length} of ${data.products.length} products` : `${data.products.length} products`}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="ml-3 text-[#FF6B35] hover:underline flex items-center gap-1">
                <X size={10} /> Clear filters
              </button>
            )}
          </span>
          <span className="uppercase tracking-wider">Showing {activeMethod.label} valuation</span>
        </div>
      </Panel>

      {/* ── Section 05 — Products ── */}
      <Panel title="Products" number="05" variant="raised">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">{filteredProducts.length} products · click any row to expand</span>
        </div>
        <div className="shadow-md rounded-lg overflow-hidden border border-gray-300">
      <DenseTable>
        <thead>
          <tr>
            <DenseTh>Product</DenseTh>
            <DenseTh>Merchant</DenseTh>
            <DenseTh className="text-right">On Hand</DenseTh>
            <DenseTh className="text-right">{activeMethod.label} Value</DenseTh>
            <DenseTh className="text-right">{activeMethod.label} Cost/unit</DenseTh>
            <DenseTh className="text-right">Carrying</DenseTh>
            <DenseTh className="text-right">NRV/unit</DenseTh>
            <DenseTh>NRV Test</DenseTh>
            <DenseTh>ABC</DenseTh>
            <DenseTh className="text-right">Turnover</DenseTh>
            <DenseTh className="text-right">DIO</DenseTh>
            <DenseTh className="text-right">EOQ</DenseTh>
            <DenseTh className="text-right">ROP</DenseTh>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.length === 0 && (
            <tr><td colSpan={13} className="text-center py-8 text-gray-400 text-xs">No products match the current filters.</td></tr>
          )}
          {groupedProducts.map(group => (
            <CategoryGroup
              key={group.category}
              group={group}
              selectedMethod={selectedMethod}
              methodValue={methodValue}
              methodUnitCost={methodUnitCost}
              portfolioTotal={methodTotals.selectedTotal}
              expandedProduct={expandedProduct}
              setExpandedProduct={setExpandedProduct}
              onMethodChange={handleMethodChange}
            />
          ))}
        </tbody>
        {filteredProducts.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <DenseTd className="font-bold text-gray-900 uppercase tracking-wider text-[10px]">Portfolio Total</DenseTd>
              <DenseTd></DenseTd>
              <DenseTd mono right className="font-bold text-gray-900">{fmtNum(methodTotals.totalStock)}</DenseTd>
              <DenseTd mono right className="font-bold text-[#FF6B35]">{fmtUGX(methodTotals.selectedTotal, true)}</DenseTd>
              <DenseTd></DenseTd>
              <DenseTd mono right className="font-bold text-gray-900">{fmtUGX(kpis.totalCarryingValue, true)}</DenseTd>
              <DenseTd></DenseTd>
              <DenseTd>{kpis.totalNrvWriteDown > 0 && <span className="text-[10px] font-bold text-red-700">−{fmtUGX(kpis.totalNrvWriteDown, true)}</span>}</DenseTd>
              <DenseTd></DenseTd>
              <DenseTd mono right>{portfolio.turnover > 0 ? `${portfolio.turnover.toFixed(2)}×` : '—'}</DenseTd>
              <DenseTd mono right>{portfolio.dio > 0 ? `${portfolio.dio.toFixed(0)}d` : '—'}</DenseTd>
              <DenseTd></DenseTd>
              <DenseTd></DenseTd>
            </tr>
          </tfoot>
        )}
      </DenseTable>
        </div>
      </Panel>

      {/* ── Settings modal ── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={data.settings}
        onSave={handleSaveSettings}
      />

      {/* ── NRV Write-Down modal ── */}
      <NrvWriteDownModal
        open={nrvOpen}
        onClose={() => setNrvOpen(false)}
        products={data.products}
        onSubmit={handleNrvSubmit}
      />

      {/* ── Help dialog ── */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* ── Sources footnote ── */}
      <div className="mt-6 pt-4 border-t border-gray-100 text-[10px] text-gray-400 leading-relaxed">
        <p className="font-semibold uppercase tracking-wider text-gray-500 mb-1">Benchmark sources</p>
        <p>
          Throughput Turn &amp; Days of Supply: <span className="font-mono">APICS/ASCM Supply Chain Dictionary</span> (operational metrics, not IFRS).
          Holding cost 4-component split: <span className="font-mono">APICS/ASCM body of knowledge</span> (Capital/Storage/Service/Risk).
          Costing methods &amp; NRV test: <span className="font-mono">IAS 2 — Inventories</span> (IFRS Foundation).
          MPV materiality threshold: <span className="font-mono">ISA 320</span> (judgment-based internal policy, no fixed %).
          LIFO prohibited: <span className="font-mono">IAS 2 §25</span>.
          Cross-method comparison is factual, not benchmarked — no authoritative range exists.
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PANEL — window-style container with title bar + raised border.
// Creates a "station" feel — each panel is a self-contained context.
// ════════════════════════════════════════════════════════════════════════════
function Panel({ title, number, children, variant = 'raised' }: {
  title: string
  number?: string
  children: React.ReactNode
  variant?: 'raised' | 'inset'
}) {
  return (
    <div className={`rounded-lg border border-gray-300 overflow-hidden ${
      variant === 'raised' ? 'bg-white shadow-md' : 'bg-gray-50 shadow-inner'
    }`}>
      {/* Title bar — like a window title, communicates "you are at this station" */}
      <div className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-300 ${
        variant === 'raised' ? 'bg-gray-100' : 'bg-gray-200/50'
      }`}>
        <div className="flex items-center gap-2">
          {number && <span className="text-[9px] font-mono font-bold text-gray-400">{number}</span>}
          <span className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">{title}</span>
        </div>
      </div>
      {/* Content area */}
      <div className="p-3">
        {children}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// GAUGE — visual instrument showing where a value sits within a range.
// The gauge IS the data — the number is secondary, shown below.
// Inspired by retro progress bars: a recessed channel with a filled block.
// ════════════════════════════════════════════════════════════════════════════
function Gauge({ value, min, max, label, sublabel }: {
  value: number
  min: number
  max: number
  label: string
  sublabel?: string
}) {
  const valuePct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const minPct = max > 0 ? (min / max) * 100 : 0
  const healthyWidth = Math.max(0, 100 - minPct)
  const withinRange = value >= min && value <= max

  return (
    <div className="space-y-1">
      {/* Label row */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
        {sublabel && <span className="text-[9px] text-gray-400">{sublabel}</span>}
      </div>
      {/* The gauge — recessed channel with fill block */}
      <div className="relative h-6 bg-gray-200 rounded overflow-hidden border border-gray-300 shadow-inner">
        {/* Healthy zone marker */}
        <div className="absolute h-full bg-green-600/25 border-x border-green-600/45"
          style={{ left: `${minPct}%`, width: `${healthyWidth}%` }} />
        {/* Value fill */}
        <div
          className={`absolute h-full transition-all duration-300 ${withinRange ? 'bg-[#FF6B35]' : 'bg-red-500'}`}
          style={{ width: `${valuePct}%` }}
        />
        {/* Min/max tick marks */}
        <div className="absolute h-full w-px bg-gray-400" style={{ left: `${minPct}%` }} />
        <div className="absolute h-full w-px bg-gray-400" style={{ left: `100%` }} />
      </div>
      {/* Value + range below */}
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-mono font-bold ${withinRange ? 'text-gray-900' : 'text-red-700'}`}>
          {fmtUGX(value, true)}
        </span>
        <span className="text-[9px] text-gray-400 font-mono">
          {fmtUGX(min, true)} – {fmtUGX(max, true)}
        </span>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// LED — physical status indicator. Looks like an LED on a machine panel.
// Green = healthy, Amber = monitor, Red = critical.
// ════════════════════════════════════════════════════════════════════════════
function LED({ status, size = 10 }: {
  status: Status
  size?: number
}) {
  const colors: Record<Status, { glow: string; core: string; ring: string }> = {
    healthy:  { glow: 'bg-green-300',  core: 'bg-green-500',  ring: 'ring-green-200' },
    monitor:  { glow: 'bg-amber-300',  core: 'bg-amber-500',  ring: 'ring-amber-200' },
    critical: { glow: 'bg-red-300',   core: 'bg-red-500',   ring: 'ring-red-200' },
  }
  const c = colors[status]
  return (
    <span
      className={`inline-block rounded-full ring-2 ${c.ring} shrink-0 relative`}
      style={{ width: size, height: size }}
    >
      <span className={`absolute inset-0 rounded-full ${c.core}`} />
      <span className={`absolute inset-0 rounded-full ${c.glow} opacity-50`} />
      {/* Highlight dot — simulates light reflection on an LED */}
      <span className="absolute top-[1px] left-[1px] rounded-full bg-white/60" style={{ width: Math.max(2, size / 3), height: Math.max(2, size / 3) }} />
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MINI GAUGE — compact stock level indicator for table rows.
// Shows stock as a fill bar with ROP threshold + green/amber/red zones.
// ════════════════════════════════════════════════════════════════════════════
function MiniGauge({ stock, reorderPoint }: {
  stock: number
  reorderPoint: number
}) {
  const max = Math.max(reorderPoint * 2, 50)
  const pct = Math.min(100, (stock / max) * 100)
  const ropPct = Math.min(100, (reorderPoint / max) * 100)
  const status: Status = stock === 0 ? 'critical' : stock <= reorderPoint ? 'monitor' : 'healthy'
  const fillColor = status === 'critical' ? 'bg-red-500' : status === 'monitor' ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="font-mono text-xs text-gray-700">{fmtNum(stock)}</span>
      <div className="relative w-10 h-3 bg-gray-200 rounded-sm overflow-hidden border border-gray-300 shadow-inner shrink-0">
        {/* ROP threshold line */}
        <div className="absolute h-full w-px bg-gray-500/50 z-10" style={{ left: `${ropPct}%` }} />
        {/* Fill */}
        <div className={`h-full ${fillColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// METRIC WIDGET — visual instrument card for Performance section.
// Shows: LED + label + big value + mini bar gauge + affected count.
// Click to expand: shows narrative + affected product chips (not a table).
// ════════════════════════════════════════════════════════════════════════════
function MetricWidget({ status, label, value, benchmark, barPct, benchmarkPct, affectedCount, detail, affectedProducts, affectedColumns }: {
  status: Status
  label: string
  value: string
  benchmark: string
  barPct: number
  benchmarkPct: number
  affectedCount: number
  detail: string
  affectedProducts: ProductValuation[]
  affectedColumns: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const fillColor = status === 'healthy' ? 'bg-green-500'
    : status === 'monitor' ? 'bg-amber-500'
    : 'bg-red-500'

  return (
    <div className={`rounded-lg border bg-white p-3 transition-all cursor-pointer ${
      expanded ? 'border-[#FF6B35] shadow-md' : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300'
    }`} onClick={() => setExpanded(!expanded)}>
      {/* Top row: LED + label + value */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <LED status={status} size={10} />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
        </div>
        <span className="text-base font-mono font-bold text-gray-900">{value}</span>
      </div>
      {/* Mini bar gauge — the visual instrument */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden border border-gray-300 shadow-inner mb-1">
        {/* Benchmark threshold mark */}
        <div className="absolute h-full w-px bg-gray-500 z-10" style={{ left: `${benchmarkPct}%` }} />
        {/* Value fill */}
        <div className={`h-full ${fillColor} transition-all duration-300`} style={{ width: `${barPct}%` }} />
      </div>
      {/* Bottom row: benchmark + count */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-green-600 font-mono">Acceptable: {benchmark}</span>
        {affectedCount > 0 && (
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
            status === 'critical' ? 'bg-red-50 text-red-600' : status === 'monitor' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'
          }`}>{affectedCount} out of range</span>
        )}
      </div>
      {/* Expanded detail — narrative + product chips */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          <p className="text-[11px] text-gray-600 leading-relaxed">{detail}</p>
          {affectedProducts.length > 0 && (
            <ProductChips products={affectedProducts} columns={affectedColumns} />
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PERFORMANCE ROW — Windows XP Display Properties style form row.
// Label on the left, recessed value display on the right, bar gauge below.
// Like XP's "Theme: [Windows XP]" form layout.
// ════════════════════════════════════════════════════════════════════════════
function PerformanceRow({ label, status, value, benchmark, barPct, benchmarkPct, affectedCount, detail, affectedProducts, affectedColumns }: {
  label: string
  status: Status
  value: string
  benchmark: string
  barPct: number
  benchmarkPct: number
  affectedCount: number
  detail: string
  affectedProducts: ProductValuation[]
  affectedColumns: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const fillColor = status === 'healthy' ? 'bg-green-500'
    : status === 'monitor' ? 'bg-amber-500'
    : 'bg-red-500'
  const borderColor = status === 'healthy' ? 'border-green-300'
    : status === 'monitor' ? 'border-amber-300'
    : 'border-red-300'

  return (
    <div className={`rounded transition-all ${
      expanded ? 'ring-1 ring-[#FF6B35] ring-offset-1' : ''
    }`}>
      {/* Form row: Label (left, bold) + sunken field (right) — like XP "Theme: [dropdown]" */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-1.5 text-left group"
      >
        {/* Label — bold, left-aligned, like XP form labels */}
        <div className="flex items-center gap-2 w-36 shrink-0">
          <LED status={status} size={8} />
          <span className="text-[11px] font-semibold text-gray-700">{label}:</span>
        </div>
        {/* Sunken input field — looks like a recessed XP combo box */}
        <div className="flex-1 flex items-center gap-2">
          <div className={`flex-1 relative h-6 bg-white rounded-sm overflow-hidden border ${borderColor} shadow-inner`}>
            {/* Benchmark zone (green band showing acceptable range) */}
            <div className="absolute h-full bg-green-600/20"
              style={{ left: '0%', width: `${benchmarkPct}%` }} />
            {/* Benchmark threshold mark */}
            <div className="absolute h-full w-px bg-gray-400 z-10" style={{ left: `${benchmarkPct}%` }} />
            {/* Value fill — like liquid filling the field */}
            <div className={`h-full ${fillColor} opacity-60 transition-all duration-300`} style={{ width: `${barPct}%` }} />
            {/* Value text inside the field — like text in a dropdown */}
            <span className="absolute inset-0 flex items-center px-2 text-[11px] font-mono font-bold text-gray-900">
              {value}
            </span>
          </div>
          {/* Benchmark label — like a helper hint next to the field */}
          <span className="text-[9px] text-green-600 font-mono whitespace-nowrap shrink-0">Acceptable: {benchmark}</span>
          {/* Affected count — like a system notification */}
          {affectedCount > 0 && (
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 border ${
              status === 'critical' ? 'bg-red-50 text-red-600 border-red-200'
              : status === 'monitor' ? 'bg-amber-50 text-amber-600 border-amber-200'
              : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}>{affectedCount} flagged</span>
          )}
          {/* Dropdown-style arrow — like XP combo box arrow */}
          <div className={`w-5 h-5 flex items-center justify-center rounded-sm border border-gray-300 bg-gradient-to-b from-white to-gray-100 shadow-sm shrink-0 transition-transform ${expanded ? 'from-gray-100 to-gray-200' : 'group-hover:from-gray-50'}`}>
            <ChevronDown size={10} className={`text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>
      {/* Expanded detail — slides down like an XP "Details" section */}
      {expanded && (
        <div className="ml-39 pl-2 pr-2 pb-2 pt-1 border-l-2 border-[#FF6B35]/20 space-y-2">
          <p className="text-[11px] text-gray-600 leading-relaxed pl-3">{detail}</p>
          {affectedProducts.length > 0 && (
            <div className="pl-3">
              <ProductChips products={affectedProducts} columns={affectedColumns} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// METRIC GLYPH — looping pictograms inside the value box that show what each
// metric MEANS, no words required.
// - turn:  two box trucks on ONE SHARED YEAR CLOCK (the filling timeline under
//          each stage — one loop = one year, quarter ticks = seasons). A box
//          is lowered into the cargo before every trip and rides out with
//          the truck; each load (coin) sells while the truck is parked, then
//          rolls to the dock and RESTS there, so the pile GROWS as the year
//          fills. GRAY = today: its one box sells and no box ever comes
//          (cargo empty, waiting dots pulsing, orange timeline = the real
//          year burning down) — ONE coin in its pile. GREEN = acceptable
//          pace (echoes the band): box after box, five coins stacked by year
//          end. Same clock on both sides, so counting the pile at year end
//          IS "turns per year".
// - days:  a factory tank holding green water up to the dashed 90-day line;
//          cross it and the water flips red while coins fall out of the door
// - hold:  chips leaking off a sitting stock (the falling bits ARE the yearly cost)
// Hover on any glyph states the standard in one plain sentence — no storytelling.
function MetricGlyph({ kind, seconds }: { kind: 'turn' | 'days' | 'hold'; seconds: number }) {
  const dur = { animationDuration: `${seconds}s` }
  if (kind === 'turn') {
    // The year clock is FIXED (6s) so both trucks share one timeline — the
    // comparison is same-year-different-load-count, not different speeds.
    const YEAR = 6
    return (
      <span className="flex items-center gap-1.5 shrink-0" title="A stock item should sell 4 to 6 times a year.">
        <TurnTruckStage variant="now" year={YEAR} />
        <span className="w-px h-4 shrink-0 bg-gray-200" aria-hidden />
        <TurnTruckStage variant="ideal" year={YEAR} />
      </span>
    )
  }
  if (kind === 'days') {
    // One loop tells the standard's story: the factory holds green water up
    // to the dashed 90-day line (full = the max acceptable). The moment the
    // level crosses the line the water flips red and coins fall out of the
    // door — every extra day is money sitting on the shelf — then the level
    // drains back to the line and settles green again.
    return (
      <span className="relative w-5 h-5 shrink-0" title="The stock in the store should last 60 to 90 days.">
        {/* Factory body — the tank. Water fills from the bottom. */}
        <span className="absolute bottom-0 left-0 w-[18px] h-[11px] rounded-[1px] border border-gray-500 bg-gray-50 overflow-hidden">
          <span className="factory-water absolute inset-0" style={dur} />
          <span className="absolute inset-x-0 top-[2px] border-t border-dashed border-white/80" />
        </span>
        {/* Sawtooth roof + chimney make it read as a factory, not a jar */}
        <span className="absolute bottom-[11px] left-0 w-[18px] h-[4px] bg-gray-500 [clip-path:polygon(0_0,33%_100%,33%_0,66%_100%,66%_0,100%_100%,100%_0)]" />
        <span className="absolute bottom-[14px] left-[13px] w-[3px] h-[5px] rounded-t-[1px] bg-gray-500" />
        {/* Door + the coins that slip out while over the line */}
        <span className="absolute bottom-0 left-[13px] w-[2px] h-[2px] bg-gray-600" />
        <span className="factory-coin absolute bottom-0 left-[12px] w-[3px] h-[3px] rounded-full bg-[#FF6B35]" style={dur} />
        <span className="factory-coin2 absolute bottom-0 left-[13px] w-[3px] h-[3px] rounded-full bg-[#FF6B35]" style={dur} />
      </span>
    )
  }
  return (
    <span className="relative w-5 h-5 shrink-0" title="Keeping stock for a year should cost 15 to 30% of its value.">
      <span className="absolute bottom-0 left-0 w-[14px] h-[4px] rounded-[1px] bg-[#FF6B35]/80" />
      <span className="absolute bottom-[5px] left-0 w-[12px] h-[4px] rounded-[1px] bg-[#FF6B35]/65" />
      <span className="absolute bottom-[10px] left-0 w-[9px] h-[4px] rounded-[1px] bg-[#FF6B35]/50" />
      <span className="glyph-leak absolute bottom-[10px] left-[9px] w-[3px] h-[3px] rounded-full bg-gray-500" style={dur} />
      <span className="glyph-leak2 absolute bottom-[5px] left-[12px] w-[3px] h-[3px] rounded-full bg-gray-400" style={dur} />
    </span>
  )
}

// TURN TRUCK STAGE — truck + its one-year timeline bar (fill synced to the
// truck loop, quarter ticks so the year visibly "passes"). Both stages share
// the same YEAR duration, so the two clocks always tick together. The "now"
// timeline burns orange (the real year passing while stock sits); the ideal
// one stays gray.
function TurnTruckStage({ variant, year }: { variant: 'now' | 'ideal'; year: number }) {
  return (
    <span className="flex flex-col items-center gap-[2px] shrink-0">
      <span className="relative w-[22px] h-[18px] overflow-hidden">
        <TurnTruck variant={variant} year={year} />
      </span>
      <span className="relative w-[22px] h-[3px] rounded-[1px] bg-gray-100 border border-gray-200 overflow-hidden" aria-hidden>
        <span
          className={`year-fill absolute inset-y-0 left-0 w-full ${variant === 'now' ? 'bg-[#FF6B35]/70' : 'bg-gray-400/70'}`}
          style={{ transformOrigin: 'left', animationDuration: `${year}s` }}
        />
        <span className="absolute inset-y-0 left-1/4 w-px bg-gray-200" />
        <span className="absolute inset-y-0 left-2/4 w-px bg-gray-200" />
        <span className="absolute inset-y-0 left-3/4 w-px bg-gray-200" />
      </span>
    </span>
  )
}

// TURN TRUCK — 16px box-truck sprite on a one-year timeline. A 4px box is
// lowered into the cargo before every trip and rides out with the truck
// ("ideal"); the "now" truck starts with one box, sells it, and its cargo
// stays empty for the rest of the year — no box ever comes. Every load
// (coin) sells while the truck is parked, then rolls to the dock on the
// right and RESTS there — the pile grows 1..5 as the year fills and resets
// when the year does. Loaded-then-gone vs empty-all-year, counted in coins:
// the turnover story needs no words.
function TurnTruck({ variant, year }: { variant: 'now' | 'ideal'; year: number }) {
  const ideal = variant === 'ideal'
  const body = ideal ? 'border-green-600 bg-green-100' : 'border-gray-400 bg-gray-200'
  const wheel = ideal ? 'bg-green-700' : 'bg-gray-500'
  const dur = { animationDuration: `${year}s` }
  // Each entry: [sell moment % of year, dock rest spot x, y]. The dock's
  // bottom row fills left to right, its top row stacks on it; "now" uses
  // only the first spot, so its pile holds a single coin at year end.
  const loads: Array<[number, string, string]> = ideal
    ? [[6, '9px', '5px'], [24, '12px', '5px'], [42, '15px', '5px'], [60, '12.5px', '2px'], [78, '15.5px', '2px']]
    : [[8, '9px', '5px']]
  return (
    <>
      <span className={`absolute bottom-[3px] left-[1px] w-4 h-2 ${ideal ? 'truck-busy' : 'truck-idle'}`} style={dur}>
        <span className={`absolute left-0 top-0 w-[9px] h-[7px] rounded-[1px] border ${body}`} />
        <span className={`absolute bottom-0 left-[9px] w-[6px] h-[5px] rounded-[1px] border ${body}`} />
        <span className={`absolute -bottom-[2px] left-[2px] w-[3px] h-[3px] rounded-full ${wheel}`} />
        <span className={`absolute -bottom-[2px] left-[10px] w-[3px] h-[3px] rounded-full ${wheel}`} />
        {/* The load: lowered in before every trip (ideal) / sold once and
            never replaced (now). Sits inside the cargo, so it rides along
            when the truck drives off and is gone by the time it returns. */}
        <span
          className={`absolute left-[2px] top-[1px] w-1 h-1 rounded-[1px] border border-gray-500 bg-white ${ideal ? 'truck-box-load' : 'truck-box-once'}`}
          style={dur}
        />
      </span>
      {loads.map(([start, px, py], i) => (
        <span
          key={i}
          className="truck-coin absolute bottom-[6px] left-[4px] w-[3px] h-[3px] rounded-full bg-[#FF6B35] shadow-sm"
          style={{
            ...dur,
            // Positive delay = the coin waits hidden ("backwards" fill) for
            // its own sell moment, then rests in the pile until year reset.
            animationDelay: `${(start / 100 * year).toFixed(2)}s`,
            '--px': px,
            '--py': py,
          } as CSSProperties}
        />
      ))}
      {!ideal && (
        <span className="absolute top-[1px] left-[2px] flex gap-[2px]" aria-hidden>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="glyph-waitdot w-[2px] h-[2px] rounded-full bg-gray-500"
              style={{ animationDelay: `${(i * 0.35).toFixed(2)}s` }}
            />
          ))}
        </span>
      )}
    </>
  )
}

// BENCHMARK BAR — acceptable-range comparison bar (bullet-graph style).
// Gray recessed track = full scale, green band = acceptable range, colored
// marker = actual value. Marker color follows the LED status so the bar
// reads at a glance: inside the band is acceptable, outside needs attention.
// Motion carries the meaning without words: the marker travels the scale
// from zero and lands in or out of the breathing green zone; a marker that
// lands outside keeps blinking — readable in any language.
function BenchmarkBar({ value, bandMin, bandMax, domainMax, status, hint, className = '' }: {
  value: number
  bandMin: number
  bandMax: number
  domainMax: number
  status: Status
  hint?: string
  className?: string
}) {
  // Start every marker at the zero end of the scale, then release it to its
  // real position one frame after mount — the travel + landing IS the story.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLanded(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const pct = (n: number) => Math.max(0, Math.min(100, (n / domainMax) * 100))
  const markerCore = status === 'healthy' ? 'bg-green-500'
    : status === 'monitor' ? 'bg-amber-500'
    : 'bg-red-500'
  // Blink only after landing (1s delay) so the alarm fires at the value's
  // real position, not mid-flight. Inside the band = calm, no blink.
  const alarm = status === 'critical' ? 'perf-alarm-red'
    : status === 'monitor' ? 'perf-alarm-amber'
    : ''
  return (
    <div
      className={`relative h-2.5 rounded-[2px] bg-gray-200 border border-gray-300 shadow-inner ${className}`}
      title={hint}
    >
      {/* Acceptable band — the comparison zone (breathing = "this green area is the target") */}
      <div
        className="perf-bar-band absolute inset-y-0 bg-green-600/25 border-x border-green-600/45"
        style={{ left: `${pct(bandMin)}%`, width: `${pct(bandMax) - pct(bandMin)}%` }}
      />
      {/* Actual-value marker — slides from zero to its position on mount/tab switch */}
      <div
        className={`perf-bar-marker absolute -top-[3px] w-[5px] h-[14px] rounded-[2px] border border-white shadow-sm ${markerCore} ${alarm}`}
        style={{ left: landed ? `calc(${pct(value)}% - 2.5px)` : 'calc(0% - 2.5px)' }}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PERF PRODUCT LIST — sortable details view for per-product data, dressed in
// the module's control-panel aesthetic: gray chrome, LED status lights, orange
// accent. Replaces the small product chips: column headers on a recessed
// band, zebra rows, per-product LED, and an acceptable-range comparison bar in
// every row so products can be compared against the benchmark (and each
// other) at a glance. Click the metric header to flip sort order.
// ════════════════════════════════════════════════════════════════════════════
const PERF_LIST_CAP = 50

function PerfProductList({ products, metricLabel, metricOf, fmtMetric, statusOf, band, domainMax, benchmarkLabel, worstFirst, columns }: {
  products: ProductValuation[]
  metricLabel: string
  metricOf: (p: ProductValuation) => number
  fmtMetric: (n: number) => string
  statusOf: (p: ProductValuation) => Status
  band: { min: number; max: number }
  domainMax: number
  benchmarkLabel: string
  worstFirst: 'high' | 'low'
  columns: Array<{ label: string; get: (p: ProductValuation) => string }>
}) {
  const [flip, setFlip] = useState(false)
  const sorted = useMemo(() => {
    const base = worstFirst === 'high' ? -1 : 1 // worst-first direction
    const dir = flip ? -base : base
    return [...products].sort((a, b) => {
      const d = (metricOf(a) - metricOf(b)) * dir
      if (d !== 0) return d
      return b.carryingValue - a.carryingValue // tie-break: bigger exposure first
    })
  }, [products, flip, worstFirst, metricOf])
  const shown = sorted.slice(0, PERF_LIST_CAP)

  if (products.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-gray-200 bg-gray-50 px-3 py-2.5">
        <LED status="healthy" size={8} />
        <span className="text-[11px] text-gray-600">All products are within the acceptable range for this metric.</span>
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-gray-300 bg-white shadow-inner overflow-hidden">
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-[11px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-gray-100 border-b border-r border-gray-300 px-2 py-1 text-left font-semibold text-gray-600">
                Product
              </th>
              {columns.map(c => (
                <th key={c.label} className="sticky top-0 z-10 hidden md:table-cell bg-gray-100 border-b border-r border-gray-300 px-2 py-1 text-right font-semibold text-gray-600 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-100 border-b border-r border-gray-300 px-2 py-1 text-right">
                <button
                  onClick={() => setFlip(!flip)}
                  className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-[#FF6B35]"
                  title="Click to flip sort order"
                >
                  {metricLabel}
                  <ChevronDown size={9} className={`transition-transform ${flip ? 'rotate-180' : ''}`} />
                </button>
              </th>
              <th className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-2 py-1 text-left font-semibold text-green-600 w-[28%]">
                Acceptable
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => {
              const st = statusOf(p)
              const v = metricOf(p)
              return (
                <tr key={p.productId} className={`${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors`}>
                  <td className="border-b border-gray-200 px-2 py-[3px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <LED status={st} size={6} />
                      <span className="text-gray-900 truncate max-w-[200px]" title={p.productLabel}>{p.productLabel}</span>
                      <span className="hidden lg:inline text-[9px] text-gray-400 truncate max-w-[150px]">{p.merchantName}</span>
                      <span className="text-[8px] font-mono text-gray-500 border border-gray-300 bg-gray-100 rounded-sm px-1 shrink-0">{p.abcClass}</span>
                    </div>
                  </td>
                  {columns.map(c => (
                    <td key={c.label} className="hidden md:table-cell border-b border-gray-200 px-2 py-[3px] text-right font-mono text-gray-500 whitespace-nowrap">
                      {c.get(p)}
                    </td>
                  ))}
                  <td className="border-b border-gray-200 px-2 py-[3px] text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                    {fmtMetric(v)}
                  </td>
                  <td className="border-b border-gray-200 px-2 py-[5px]">
                    <BenchmarkBar
                      value={v}
                      bandMin={band.min}
                      bandMax={band.max}
                      domainMax={domainMax}
                      status={st}
                      hint={`${p.productLabel}: ${fmtMetric(v)} · acceptable ${benchmarkLabel}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > shown.length && (
        <div className="border-t border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-500 font-mono">
          + {sorted.length - shown.length} more products
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// STATUS CHIP — visual status card for Slow-moving stock section.
// Shows: LED + label + big count number + action recommendation.
// Click to expand: shows detail + affected product chips.
// ════════════════════════════════════════════════════════════════════════════
function StatusChip({ status, label, count, action, detail, affectedProducts, affectedColumns }: {
  status: Status
  label: string
  count: number
  action: string
  detail: string
  affectedProducts: ProductValuation[]
  affectedColumns: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-lg border bg-white p-3 transition-all cursor-pointer ${
      expanded ? 'border-[#FF6B35] shadow-md' : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300'
    }`} onClick={() => setExpanded(!expanded)}>
      {/* Top: LED + label */}
      <div className="flex items-center gap-1.5 mb-2">
        <LED status={status} size={10} />
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      </div>
      {/* Big count number — the primary visual */}
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-2xl font-bold text-gray-900 font-mono">{count}</span>
        <span className="text-[10px] text-gray-400">products</span>
      </div>
      {/* Action recommendation — short, one line */}
      <p className="text-[11px] text-gray-600 leading-snug">{action}</p>
      {/* Expand chevron */}
      <div className="flex items-center justify-end mt-1">
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180 text-[#FF6B35]' : ''}`} />
      </div>
      {/* Expanded: detail + product chips */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          <p className="text-[11px] text-gray-500 leading-relaxed">{detail}</p>
          {affectedProducts.length > 0 && (
            <ProductChips products={affectedProducts} columns={affectedColumns} />
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT CHIPS — visual product list (replaces MiniProductTable).
// Each product is a card/chip with name + key metric, not a table row.
// ════════════════════════════════════════════════════════════════════════════
function ProductChips({ products, columns }: {
  products: ProductValuation[]
  columns: string[]
}) {
  const getColumnValue = (p: ProductValuation, col: string): string => {
    switch (col) {
      case 'turnover': return p.inventoryTurnover > 0 ? `${p.inventoryTurnover.toFixed(2)}×` : '—'
      case 'dio': return p.daysInventoryOutstanding > 0 ? `${p.daysInventoryOutstanding.toFixed(0)}d` : '—'
      case 'holdingCost': return fmtUGX(p.holdingCostPerUnit, true)
      case 'carryingValue': return fmtUGX(p.carryingValue, true)
      case 'mpv': return p.materialPriceVariance >= 0 ? `+${fmtUGX(p.materialPriceVariance, true)}` : fmtUGX(p.materialPriceVariance, true)
      case 'standardCost': return fmtUGX(p.standardCost, true)
      case 'nrvPerUnit': return fmtUGX(p.nrvPerUnit, true)
      case 'writeDownTotal': return p.writeDownRequired ? `−${fmtUGX(p.writeDownTotal, true)}` : '—'
      case 'currentStock': return fmtNum(p.currentStock)
      default: return '—'
    }
  }
  const getColumnLabel = (col: string): string => {
    const labels: Record<string, string> = {
      turnover: 'Turn', dio: 'DIO', holdingCost: 'Hold', carryingValue: 'Carry',
      mpv: 'MPV', standardCost: 'Std', nrvPerUnit: 'NRV', writeDownTotal: 'W/D',
      currentStock: 'Stock',
    }
    return labels[col] || col
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {products.slice(0, 15).map(p => (
        <div key={p.productId} className="inline-flex flex-col gap-0.5 px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all">
          <span className="text-[11px] font-semibold text-gray-900 truncate max-w-[140px]">{p.productLabel}</span>
          <div className="flex items-center gap-2">
            {columns.map(col => (
              <span key={col} className="text-[9px] text-gray-500 font-mono">
                {getColumnLabel(col)}: <span className="text-gray-700 font-semibold">{getColumnValue(p, col)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      {products.length > 15 && (
        <span className="text-[10px] text-gray-400 self-center">+ {products.length - 15} more</span>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ISSUE EXPANDER — compact one-liner that expands on click to show full
// narrative + a mini table of affected products. Used in Performance + Warnings.
// ════════════════════════════════════════════════════════════════════════════
function IssueExpander({ status, compact, detail, affectedProducts, affectedColumns, affectedTitle }: {
  status: Status
  compact: string
  detail: string
  affectedProducts: ProductValuation[]
  affectedColumns: string[]
  affectedTitle: string
}) {
  const [expanded, setExpanded] = useState(false)
  const dotColor = status === 'healthy' ? 'bg-green-500'
    : status === 'monitor' ? 'bg-amber-500'
    : 'bg-red-500'
  const hasAffected = affectedProducts.length > 0

  return (
    <div className="border-b border-gray-100 last:border-0 pb-0.5">
      {/* Compact one-liner — always visible, hover shows left accent */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 text-left py-1.5 px-2 -mx-1 rounded-md transition-all border-l-2 ${
          expanded
            ? 'bg-gray-50 border-l-[#FF6B35]'
            : 'border-l-transparent hover:bg-gray-50 hover:border-l-gray-200'
        }`}
      >
        <LED status={status} size={10} />
        <span className="text-[12px] text-gray-900 font-mono flex-1">{compact}</span>
        {hasAffected && (
          <span className="text-[10px] text-gray-500 font-mono shrink-0 px-1.5 py-0.5 rounded bg-gray-100">
            {affectedProducts.length} product{affectedProducts.length > 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180 text-[#FF6B35]' : ''}`}
        />
      </button>

      {/* Expanded detail — full narrative + affected products table */}
      {expanded && (
        <div className="mt-1 ml-4 pl-3 border-l-2 border-gray-100 space-y-2">
          <p className="text-[12px] text-gray-600 leading-relaxed">{detail}</p>
          {hasAffected && (
            <MiniProductTable
              products={affectedProducts}
              columns={affectedColumns}
              title={affectedTitle}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MINI PRODUCT TABLE — compact table showing only the columns relevant to
// the specific issue. Used inside IssueExpander to show affected products.
// ════════════════════════════════════════════════════════════════════════════
function MiniProductTable({ products, columns, title }: {
  products: ProductValuation[]
  columns: string[]
  title: string
}) {
  const getColumnLabel = (col: string): string => {
    const labels: Record<string, string> = {
      turnover: 'Turnover',
      dio: 'DIO',
      holdingCost: 'Hold/unit',
      carryingValue: 'Carrying',
      mpv: 'MPV',
      standardCost: 'Std cost',
      actualCost: 'Actual',
      nrvPerUnit: 'NRV/unit',
      writeDownTotal: 'Write-down',
      currentStock: 'Stock',
      reorderPoint: 'ROP',
      eoq: 'EOQ',
    }
    return labels[col] || col
  }

  const getColumnValue = (p: ProductValuation, col: string): string => {
    switch (col) {
      case 'turnover': return p.inventoryTurnover > 0 ? `${p.inventoryTurnover.toFixed(2)}×` : '—'
      case 'dio': return p.daysInventoryOutstanding > 0 ? `${p.daysInventoryOutstanding.toFixed(0)}d` : '—'
      case 'holdingCost': return fmtUGX(p.holdingCostPerUnit, true)
      case 'carryingValue': return fmtUGX(p.carryingValue, true)
      case 'mpv': return p.materialPriceVariance >= 0 ? `+${fmtUGX(p.materialPriceVariance, true)}` : fmtUGX(p.materialPriceVariance, true)
      case 'standardCost': return fmtUGX(p.standardCost, true)
      case 'actualCost': return fmtUGX(p.fifoUnitCost, true)
      case 'nrvPerUnit': return fmtUGX(p.nrvPerUnit, true)
      case 'writeDownTotal': return p.writeDownRequired ? `−${fmtUGX(p.writeDownTotal, true)}` : '—'
      case 'currentStock': return fmtNum(p.currentStock)
      case 'reorderPoint': return p.reorderPoint > 0 ? String(p.reorderPoint) : '—'
      case 'eoq': return p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'
      default: return '—'
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md overflow-hidden">
      <div className="px-2 py-1 bg-gray-100 border-b border-gray-100">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{title}</span>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-400 text-[9px] uppercase">
            <th className="px-2 py-1 text-left font-semibold">Product</th>
            {columns.map(col => (
              <th key={col} className="px-2 py-1 text-right font-semibold">{getColumnLabel(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.slice(0, 20).map(p => (
            <tr key={p.productId} className="border-t border-gray-100 hover:bg-white">
              <td className="px-2 py-1 text-gray-900 truncate max-w-[180px]">{p.productLabel}</td>
              {columns.map(col => (
                <td key={col} className="px-2 py-1 text-right font-mono text-gray-700">{getColumnValue(p, col)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {products.length > 20 && (
        <div className="px-2 py-1 text-[10px] text-gray-400 text-center">
          + {products.length - 20} more — narrow filters to see all
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY GROUP — category header row + product rows for that category
// ════════════════════════════════════════════════════════════════════════════
function CategoryGroup({ group, selectedMethod, methodValue, methodUnitCost, portfolioTotal, expandedProduct, setExpandedProduct, onMethodChange }: {
  group: {
    category: string
    products: ProductValuation[]
    subtotal: number
    carryingSubtotal: number
    writeDownSubtotal: number
    stockUnits: number
    count: number
  }
  selectedMethod: MethodKey
  methodValue: (p: ProductValuation, m: MethodKey) => number
  methodUnitCost: (p: ProductValuation, m: MethodKey) => number
  portfolioTotal: number
  expandedProduct: string | null
  setExpandedProduct: (v: string | null) => void
  onMethodChange: (productId: string, method: string) => void
}) {
  const pctOfPortfolio = portfolioTotal > 0 ? (group.subtotal / portfolioTotal) * 100 : 0

  return (
    <>
      {/* Category header row */}
      <tr className="bg-gray-50 border-y border-gray-200" style={{ height: '32px' }}>
        <DenseTd className="font-bold text-gray-900 uppercase tracking-wider text-[10px]">
          {group.category}
        </DenseTd>
        <DenseTd className="text-[10px] text-gray-400">{group.count} products</DenseTd>
        <DenseTd mono right className="text-[10px] text-gray-500">{fmtNum(group.stockUnits)} units</DenseTd>
        <DenseTd mono right className="font-bold text-[#FF6B35] text-xs">{fmtUGX(group.subtotal, true)}</DenseTd>
        <DenseTd></DenseTd>
        <DenseTd mono right className="text-[10px] text-gray-600">{fmtUGX(group.carryingSubtotal, true)}</DenseTd>
        <DenseTd></DenseTd>
        <DenseTd>{group.writeDownSubtotal > 0 && <span className="text-[10px] font-bold text-red-700">−{fmtUGX(group.writeDownSubtotal, true)}</span>}</DenseTd>
        <DenseTd className="text-[10px] text-gray-400">{pctOfPortfolio.toFixed(1)}% of portfolio</DenseTd>
        <DenseTd></DenseTd>
        <DenseTd></DenseTd>
        <DenseTd></DenseTd>
        <DenseTd></DenseTd>
      </tr>
      {/* Product rows */}
      {group.products.slice(0, 100).map((p, i) => (
        <ValuationRow
          key={p.productId}
          p={p}
          index={i}
          selectedMethod={selectedMethod}
          methodValue={methodValue(p, selectedMethod)}
          methodUnitCost={methodUnitCost(p, selectedMethod)}
          expanded={expandedProduct === p.productId}
          onToggle={() => setExpandedProduct(expandedProduct === p.productId ? null : p.productId)}
          onMethodChange={(m) => onMethodChange(p.productId, m)}
        />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VALUATION ROW — shows only the selected method's value + unit cost
// ════════════════════════════════════════════════════════════════════════════
function ValuationRow({ p, index, selectedMethod, methodValue, methodUnitCost, expanded, onToggle, onMethodChange }: {
  p: ProductValuation
  index: number
  selectedMethod: MethodKey
  methodValue: number
  methodUnitCost: number
  expanded: boolean
  onToggle: () => void
  onMethodChange: (m: string) => void
}) {
  const tint = p.writeDownRequired
    ? 'bg-red-50/40'
    : p.varianceFlagged
    ? 'bg-amber-50/40'
    : p.stockoutRisk === 'critical'
    ? 'bg-orange-50/40'
    : ''

  return (
    <>
      <AnimatedDenseTr index={index} tint={tint} onClick={onToggle}>
        <DenseTd>
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate max-w-[200px]">{p.productLabel}</div>
              <div className="text-[10px] text-gray-400">{p.productId}{p.brand ? ` · ${p.brand}` : ''}{p.variant ? ` · ${p.variant}` : ''}</div>
            </div>
          </div>
        </DenseTd>
        <DenseTd className="text-gray-600 truncate max-w-[120px]">{p.merchantName}</DenseTd>
        {/* Stock — MiniGauge instrument (number + bar with ROP threshold) */}
        <DenseTd right>
          <MiniGauge stock={p.currentStock} reorderPoint={p.reorderPoint} />
        </DenseTd>
        {/* Selected method value — orange bold */}
        <DenseTd mono right className="text-[#FF6B35] font-bold">{fmtUGX(methodValue, true)}</DenseTd>
        {/* Selected method unit cost */}
        <DenseTd mono right className="text-gray-500">{fmtUGX(methodUnitCost, true)}</DenseTd>
        <DenseTd mono right className="font-bold text-gray-900">{fmtUGX(p.carryingValue, true)}</DenseTd>
        <DenseTd mono right className={p.writeDownRequired ? 'text-red-700 font-semibold' : 'text-gray-600'}>
          {fmtUGX(p.nrvPerUnit, true)}
        </DenseTd>
        {/* NRV Test — LED + status badge */}
        <DenseTd>
          <div className="flex items-center gap-1.5">
            <LED status={p.writeDownRequired ? 'critical' : 'healthy'} size={8} />
            {p.writeDownRequired ? (
              <span className="text-[10px] font-bold text-red-700">
                −{fmtUGX(p.writeDownTotal, true)}
              </span>
            ) : (
              <span className="text-[10px] text-green-600">OK</span>
            )}
          </div>
        </DenseTd>
        <DenseTd>
          <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-[10px] font-bold rounded border ${
            p.abcClass === 'A' ? 'bg-red-50 text-red-700 border-red-200'
            : p.abcClass === 'B' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            {p.abcClass}
          </span>
        </DenseTd>
        <DenseTd mono right>
          <div className="flex items-center justify-end gap-1.5">
            <span>{p.inventoryTurnover > 0 ? p.inventoryTurnover.toFixed(2) : '—'}</span>
            {p.inventoryTurnover > 0 && (
              <LED status={p.inventoryTurnover >= 4 ? 'healthy' : p.inventoryTurnover >= 2 ? 'monitor' : 'critical'} size={8} />
            )}
          </div>
        </DenseTd>
        <DenseTd mono right>
          <span className={p.daysInventoryOutstanding > 180 ? 'text-red-700 font-semibold' : p.daysInventoryOutstanding > 90 ? 'text-amber-700' : ''}>
            {p.daysInventoryOutstanding > 0 ? p.daysInventoryOutstanding.toFixed(0) : '—'}
          </span>
        </DenseTd>
        <DenseTd mono right className="text-blue-700">{p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'}</DenseTd>
        <DenseTd mono right className="text-purple-700">{p.reorderPoint > 0 ? p.reorderPoint : '—'}</DenseTd>
      </AnimatedDenseTr>

      {expanded && (
        <tr className="bg-gray-50/60 border-b border-gray-100">
          <td colSpan={13} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {/* Costing */}
              <div>
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">Costing (IAS 2)</p>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-gray-500">Method:</span>
                    <select
                      value={p.costingMethod}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { onMethodChange(e.target.value); e.stopPropagation() }}
                      className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white"
                    >
                      <option value="fifo">FIFO</option>
                      <option value="avco">AVCO</option>
                      <option value="standard">Standard</option>
                      <option value="specific_id">Specific ID</option>
                    </select>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Standard cost:</span><span className="font-mono">{fmtUGX(p.standardCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">FIFO unit cost:</span><span className="font-mono">{fmtUGX(p.fifoUnitCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">AVCO unit cost:</span><span className="font-mono">{fmtUGX(p.avcoUnitCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cost to sell (est.):</span><span className="font-mono">{fmtUGX(p.costToSell)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Selling price:</span><span className="font-mono">{fmtUGX(p.unitSellingPrice)}</span></div>
                </div>
              </div>

              {/* FIFO layers */}
              <div>
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">FIFO Cost Layers</p>
                <div className="space-y-0.5 text-[11px]">
                  {p.layers.length === 0 && <div className="text-gray-400 italic">No active layers (all consumed)</div>}
                  {p.layers.slice(0, 6).map((l, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-500 font-mono">{fmtDate(typeof l.receivedAt === 'string' ? l.receivedAt : String(l.receivedAt))}</span>
                      <span className="font-mono">{l.qtyRemaining}/{l.qtyReceived} @ {fmtUGX(l.unitCost, true)}</span>
                    </div>
                  ))}
                  {p.layers.length > 6 && <div className="text-[10px] text-gray-400">+ {p.layers.length - 6} more layers</div>}
                </div>
              </div>

              {/* NRV test */}
              <div>
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">NRV Test (IAS 2 §9)</p>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-500">NRV/unit:</span><span className="font-mono">{fmtUGX(p.nrvPerUnit)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">NRV total:</span><span className="font-mono">{fmtUGX(p.nrvValue, true)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Selected cost:</span><span className="font-mono">{fmtUGX(p.selectedValue, true)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Carrying value:</span><span className="font-mono font-bold">{fmtUGX(p.carryingValue, true)}</span></div>
                  {p.writeDownRequired && (
                    <>
                      <div className="flex justify-between text-red-700"><span>Write-down/unit:</span><span className="font-mono">{fmtUGX(p.writeDownPerUnit)}</span></div>
                      <div className="flex justify-between text-red-700 font-bold"><span>Write-down total:</span><span className="font-mono">{fmtUGX(p.writeDownTotal, true)}</span></div>
                    </>
                  )}
                  {p.existingWriteDownBalance > 0 && (
                    <div className="flex justify-between text-amber-700"><span>Existing register:</span><span className="font-mono">{fmtUGX(p.existingWriteDownBalance, true)}</span></div>
                  )}
                </div>
              </div>

              {/* Performance + EOQ */}
              <div>
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">Performance &amp; EOQ</p>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-500">Annual demand:</span><span className="font-mono">{fmtNum(p.annualDemand)} units</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Turnover (×):</span><span className="font-mono">{p.inventoryTurnover.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">DIO (days):</span><span className="font-mono">{p.daysInventoryOutstanding.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">EOQ (units):</span><span className="font-mono font-bold text-blue-700">{p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Reorder point:</span><span className="font-mono font-bold text-purple-700">{p.reorderPoint}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Safety stock:</span><span className="font-mono">{p.safetyStock}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Lead time:</span><span className="font-mono">{p.leadTimeDays}d</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Order cost:</span><span className="font-mono">{fmtUGX(p.orderingCost, true)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Hold cost/unit/yr:</span><span className="font-mono">{fmtUGX(p.holdingCostPerUnit)}</span></div>
                </div>
              </div>

              {/* Variance */}
              <div className="col-span-2 md:col-span-4 mt-2 pt-3 border-t border-gray-200">
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">Variance Analysis (ACCA MDC — 90d window)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                  <div>
                    <span className="text-gray-500 block">Material Price Variance</span>
                    <span className={`font-mono font-bold ${p.materialPriceVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {p.materialPriceVariance >= 0 ? '▲' : '▼'} {fmtUGX(Math.abs(p.materialPriceVariance), true)} ({p.materialPriceVariance >= 0 ? 'Favourable' : 'Adverse'})
                    </span>
                    {p.varianceFlagged && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Investigate</span>}
                  </div>
                  <div>
                    <span className="text-gray-500 block">Material Usage Variance</span>
                    <span className={`font-mono font-bold ${p.materialUsageVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {p.materialUsageVariance >= 0 ? '▲' : '▼'} {fmtUGX(Math.abs(p.materialUsageVariance), true)} ({p.materialUsageVariance >= 0 ? 'Favourable' : 'Adverse'})
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Stockout risk</span>
                    <span className={`font-bold ${
                      p.stockoutRisk === 'critical' ? 'text-red-700' :
                      p.stockoutRisk === 'monitor' ? 'text-amber-700' : 'text-green-700'
                    }`}>
                      {p.stockoutRisk === 'critical' ? 'CRITICAL (≤7d)' :
                       p.stockoutRisk === 'monitor' ? 'MONITOR (≤30d)' : 'SAFE (>30d)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">ABC class (Pareto)</span>
                    <span className="font-bold">{p.abcClass} — {
                      p.abcClass === 'A' ? 'top 80% of value — tight control' :
                      p.abcClass === 'B' ? 'next 15% — moderate control' :
                      'bottom 5% — lenient control'
                    }</span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════════════════════════════
function SettingsModal({ open, onClose, settings, onSave }: {
  open: boolean
  onClose: () => void
  settings: Settings | null
  onSave: (s: Partial<Settings>) => Promise<void>
}) {
  const [form, setForm] = useState<Settings | null>(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(settings) }, [settings, open])
  if (!form) return null

  const update = (k: keyof Settings, v: string) => {
    if (k === 'defaultCostingMethod') {
      setForm({ ...form, defaultCostingMethod: v })
    } else if (k === 'daysInYear') {
      setForm({ ...form, daysInYear: parseInt(v) || 365 })
    } else {
      const num = parseFloat(v) / 100
      setForm({ ...form, [k]: isNaN(num) ? 0 : num })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        defaultCostingMethod: form.defaultCostingMethod,
        capitalCostRate: form.capitalCostRate,
        storageCostRate: form.storageCostRate,
        riskCostRate: form.riskCostRate,
        serviceCostRate: form.serviceCostRate,
        varianceMaterialityPct: form.varianceMaterialityPct,
        defaultCostToSellPct: form.defaultCostToSellPct,
        daysInYear: form.daysInYear,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const pct = (v: number) => (v * 100).toString()

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <SettingsIcon size={18} /> Valuation Settings — ACCA MDC Parameters
          </AlertDialogTitle>
          <AlertDialogDescription>
            Global parameters for inventory valuation, variance analysis, and holding-cost computation.
            Per IAS 2 (Inventories) and ACCA Management Decision &amp; Control. LIFO is prohibited under IAS 2 §25.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold text-gray-700">Default Costing Method (IAS 2)</Label>
            <select
              value={form.defaultCostingMethod}
              onChange={e => update('defaultCostingMethod', e.target.value)}
              className="w-full h-9 mt-2 px-3 rounded-xl border border-gray-200 text-sm bg-white"
            >
              <option value="fifo">FIFO — First-In, First-Out</option>
              <option value="avco">AVCO — Weighted Average Cost</option>
              <option value="standard">Standard Cost</option>
              <option value="specific_id">Specific Identification (serialized high-value SKUs)</option>
            </select>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Holding Cost Rates (% of inventory value, annualised)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: 'capitalCostRate' as const, l: 'Capital (opportunity) cost %' },
                { k: 'storageCostRate' as const, l: 'Storage cost %' },
                { k: 'riskCostRate' as const, l: 'Risk cost % (obsolescence, shrinkage)' },
                { k: 'serviceCostRate' as const, l: 'Service cost % (insurance, taxes, IT)' },
              ].map(field => (
                <div key={field.k}>
                  <Label className="text-xs">{field.l}</Label>
                  <Input type="number" step="0.1" value={pct(form[field.k])} onChange={e => update(field.k, e.target.value)} className="h-9 mt-1" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Total holding cost = {((form.capitalCostRate + form.storageCostRate + form.riskCostRate + form.serviceCostRate) * 100).toFixed(1)}% of average inventory value.
              Industry benchmark: 15–30%. Above 30% suggests overstocking.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Variance &amp; NRV</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Variance materiality %</Label>
                <Input type="number" step="0.1" value={pct(form.varianceMaterialityPct)} onChange={e => update('varianceMaterialityPct', e.target.value)} className="h-9 mt-1" />
                <p className="text-[10px] text-gray-400 mt-1">Variances above this % of standard cost are flagged for investigation.</p>
              </div>
              <div>
                <Label className="text-xs">Default cost-to-sell %</Label>
                <Input type="number" step="0.1" value={pct(form.defaultCostToSellPct)} onChange={e => update('defaultCostToSellPct', e.target.value)} className="h-9 mt-1" />
                <p className="text-[10px] text-gray-400 mt-1">Used in NRV when product has no explicit costToSell.</p>
              </div>
              <div>
                <Label className="text-xs">Days in financial year</Label>
                <Input type="number" value={form.daysInYear} onChange={e => update('daysInYear', e.target.value)} className="h-9 mt-1" />
                <p className="text-[10px] text-gray-400 mt-1">365 (normal) or 360 (some accounting conventions).</p>
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleSave() }}
            disabled={saving}
            className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            Save settings
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// NRV WRITE-DOWN MODAL
// ════════════════════════════════════════════════════════════════════════════
function NrvWriteDownModal({ open, onClose, products, onSubmit }: {
  open: boolean
  onClose: () => void
  products: ProductValuation[]
  onSubmit: (data: { productId: string; qty: number; unitCost: number; nrvPerUnit: number; reason: string }) => Promise<void>
}) {
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [nrvPerUnit, setNrvPerUnit] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = products.find(p => p.productId === productId)
  const unitCost = selected?.standardCost ?? selected?.fifoUnitCost ?? 0
  const writeDownPerUnit = Math.max(0, unitCost - (parseFloat(nrvPerUnit) || 0))
  const total = writeDownPerUnit * (parseInt(qty) || 0)

  useEffect(() => {
    if (open) { setProductId(''); setQty(''); setNrvPerUnit(''); setReason('') }
  }, [open])

  const canSubmit = productId && parseInt(qty) > 0 && parseFloat(nrvPerUnit) >= 0 && parseFloat(nrvPerUnit) < unitCost && reason.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSubmit({
        productId,
        qty: parseInt(qty),
        unitCost,
        nrvPerUnit: parseFloat(nrvPerUnit),
        reason: reason.trim(),
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TrendingDown size={18} /> Record NRV Write-Down — IAS 2 §9
          </AlertDialogTitle>
          <AlertDialogDescription>
            Write inventory down from cost to Net Realisable Value when NRV &lt; cost.
            Per IAS 2 §33, reversals are REQUIRED in a subsequent period if NRV recovers.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold">Product</Label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full h-9 mt-1 px-3 rounded-xl border border-gray-200 text-sm bg-white"
            >
              <option value="">Select product...</option>
              {products.map(p => (
                <option key={p.productId} value={p.productId}>
                  {p.productLabel} — {p.merchantName} (On hand: {fmtNum(p.currentStock)})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Standard / FIFO unit cost:</span><span className="font-mono font-semibold">{fmtUGX(unitCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Current selling price:</span><span className="font-mono">{fmtUGX(selected.unitSellingPrice)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Current NRV (auto):</span><span className="font-mono">{fmtUGX(selected.nrvPerUnit)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">On-hand units:</span><span className="font-mono">{fmtNum(selected.currentStock)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Units to write down</Label>
              <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 50" className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">New NRV per unit (UGX)</Label>
              <Input type="number" value={nrvPerUnit} onChange={e => setNrvPerUnit(e.target.value)} placeholder="e.g. 8000" className="h-9 mt-1" />
              {selected && parseFloat(nrvPerUnit) >= unitCost && (
                <p className="text-[10px] text-red-600 mt-1">NRV must be less than cost ({fmtUGX(unitCost)}) to require a write-down.</p>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Reason (required — audit trail)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged packaging, market price drop, obsolescence" className="h-9 mt-1" />
          </div>

          {canSubmit && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-xs">
              <div className="flex justify-between"><span className="text-red-700">Write-down per unit:</span><span className="font-mono font-semibold text-red-700">{fmtUGX(writeDownPerUnit)}</span></div>
              <div className="flex justify-between mt-1"><span className="text-red-700">Total write-down:</span><span className="font-mono font-bold text-red-700">{fmtUGX(total)}</span></div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleSubmit() }}
            disabled={!canSubmit || saving}
            className="rounded-xl bg-red-600 hover:bg-red-700"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            Record write-down
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// HELP DIALOG
// ════════════════════════════════════════════════════════════════════════════
function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <HelpCircle size={18} /> How Inventory Valuation Works
          </AlertDialogTitle>
          <AlertDialogDescription>
            Inventory valued per IAS 2 (Inventories) and ACCA Management Decision &amp; Control.
            Click a costing method at the top to see the portfolio total recompute for that method.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
            <p className="text-xs leading-relaxed">
              <strong className="text-sm">What this module does:</strong> For every active product, the system
              builds FIFO cost layers from inbound records, computes Weighted Average Cost, runs the
              Lower-of-Cost-or-NRV test per IAS 2 §9, and computes Material Price Variance + Material Usage
              Variance per ACCA MDC. The portfolio view shows inventory turnover, days-inventory-outstanding (DIO),
              and a 4-component holding-cost breakdown. EOQ and Reorder Point are calculated per product using the
              Wilson formula. ABC classification (Pareto) is applied automatically based on annual value-throughput.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Costing Methods (IAS 2)</p>
            <div className="space-y-2 text-xs">
              {METHODS.map(m => (
                <div key={m.key} className="p-2 rounded bg-gray-50 border border-gray-100">
                  <p className="text-gray-900"><strong>{m.label}</strong> <span className="text-gray-500">· {m.full} · {m.ias}</span></p>
                  <p className="text-gray-600 mt-0.5">{m.hint}</p>
                </div>
              ))}
              <p className="text-[10px] text-gray-400">LIFO is prohibited under IAS 2 §25 — not available.</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Benchmarks</p>
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between"><span>Throughput Turn</span><span className="font-mono">{BENCHMARKS.throughputTurn.label} ({BENCHMARKS.throughputTurn.source})</span></div>
              <div className="flex justify-between"><span>Days of Supply</span><span className="font-mono">{BENCHMARKS.daysOfSupply.label} ({BENCHMARKS.daysOfSupply.source})</span></div>
              <div className="flex justify-between"><span>Holding cost</span><span className="font-mono">{BENCHMARKS.holding.label} ({BENCHMARKS.holding.source})</span></div>
              <div className="flex justify-between"><span>NRV write-down</span><span className="font-mono">{BENCHMARKS.nrv.label} ({BENCHMARKS.nrv.source})</span></div>
              <div className="flex justify-between"><span>Variance materiality</span><span className="font-mono">{BENCHMARKS.variance.label} ({BENCHMARKS.variance.source})</span></div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
            <p className="text-xs leading-relaxed">
              <strong className="text-sm">Why this is different from ShipBob:</strong> ShipBob explicitly doesn't do
              valuation because the merchant owns the stock. For East African COD merchants without QuickBooks,
              this is the only place they'll see FIFO/AVCO/Standard/NRV/variance computed against IAS 2 + ACCA MDC.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
