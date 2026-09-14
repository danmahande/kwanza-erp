'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, RefreshCw, Download, Plus, Settings as SettingsIcon,
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, X, ChevronDown,
  HelpCircle, Calculator,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr,
} from '@/components/shared/ops-ui'
import {
  portfolioValuationNarrative,
  turnoverNarrative, dioNarrative, holdingCostNarrative, mpvNarrative,
  nrvNarrative, varianceFlaggedNarrative, stockoutNarrative,
  turnoverCompact, dioCompact, holdingCompact, mpvCompact,
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

// ── Benchmarks (ACCA MDC + IAS 2) ──
const BENCHMARKS = {
  turnover: { min: 4, max: 6, label: '4–6 turns/year', source: 'ACCA MDC' },
  dio:      { min: 60, max: 90, label: '60–90 days', source: 'ACCA MDC' },
  holding:  { min: 0.15, max: 0.30, label: '15–30% of inventory value', source: 'ACCA MDC' },
  nrv:      { max: 0.05, label: '< 5% of inventory value', source: 'IAS 2 §9' },
  variance: { max: 0.05, label: '< 5% of standard cost', source: 'ACCA MDC materiality' },
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
    } catch (e: any) { toast.error(e.message || 'Failed to save settings') }
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
    } catch (e: any) { toast.error(e.message || 'Failed to change method') }
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
    } catch (e: any) { toast.error(e.message || 'Failed to record write-down') }
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
    } catch (e: any) { toast.error(e.message || 'Failed to record reversal') }
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
    }
    const ps = filteredProducts
    return {
      turnover: ps.filter(p => p.inventoryTurnover > 0 && p.inventoryTurnover < 4).sort((a, b) => a.inventoryTurnover - b.inventoryTurnover),
      dio: ps.filter(p => p.daysInventoryOutstanding > 90).sort((a, b) => b.daysInventoryOutstanding - a.daysInventoryOutstanding),
      holding: ps.filter(p => p.holdingCostPerUnit > 0).sort((a, b) => b.holdingCostPerUnit - a.holdingCostPerUnit).slice(0, 20),
      mpv: ps.filter(p => p.varianceFlagged).sort((a, b) => Math.abs(b.materialPriceVariance) - Math.abs(a.materialPriceVariance)),
      nrv: ps.filter(p => p.writeDownRequired).sort((a, b) => b.writeDownTotal - a.writeDownTotal),
      variance: ps.filter(p => p.varianceFlagged).sort((a, b) => Math.abs(b.materialPriceVariance) - Math.abs(a.materialPriceVariance)),
      stockout: ps.filter(p => p.stockoutRisk === 'critical').sort((a, b) => a.currentStock - b.currentStock),
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
  const withinRange = total >= methodTotals.range.min && total <= methodTotals.range.max

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
        <Button size="sm" variant="outline" onClick={load} className="h-7 text-xs rounded-md">
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} className="h-7 text-xs rounded-md">
          <SettingsIcon size={12} className="mr-1" /> Settings
        </Button>
        <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md">
          <HelpCircle size={12} className="mr-1" /> Help
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs rounded-md">
          <Download size={12} className="mr-1" /> Export
        </Button>
        <Button size="sm" onClick={() => setNrvOpen(true)} className="h-7 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white">
          <Plus size={12} className="mr-1" /> NRV Write-Down
        </Button>
      </OpsHeader>

      {/* ── Method toggle (yeezy.com MALE | FEMALE pattern) ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Costing Method · IAS 2</span>
          <span className="text-[10px] text-gray-400">LIFO prohibited under IAS 2 §25</span>
        </div>
        {/* Toggle — text labels, active=orange bold, inactive=gray (like MALE | FEMALE) */}
        <div className="flex items-center gap-6 border-b border-gray-100 pb-3">
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
                className={`group flex flex-col items-start transition-all ${isActive ? '' : 'hover:opacity-70'}`}
              >
                <span className={`text-sm font-bold tracking-wide transition-colors ${
                  isActive ? 'text-[#FF6B35]' : 'text-gray-400'
                }`}>
                  {m.label}
                </span>
                <span className={`text-[10px] font-mono mt-0.5 transition-colors ${
                  isActive ? 'text-gray-700' : 'text-gray-300'
                }`}>
                  {fmtUGX(methodTotal, true)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Selected method detail row */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
          {/* Section 01 — Portfolio Valuation */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              01 — Portfolio Valuation
            </p>
            <p className="text-[13px] text-gray-900 leading-relaxed">
              {portfolioValuationNarrative({
                total,
                methodName: activeMethod.label,
                methodFull: activeMethod.full,
                iasRef: activeMethod.ias,
                rangeMin: methodTotals.range.min,
                rangeMax: methodTotals.range.max,
                withinRange,
              })}
            </p>
            {/* Inline range bar — small, supports the sentence */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 relative h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="absolute h-full bg-green-100" style={{
                  left: `${Math.max(0, Math.min(100, (methodTotals.range.min / methodTotals.range.max) * 100))}%`,
                  width: `${Math.max(0, Math.min(100, ((methodTotals.range.max - methodTotals.range.min) / methodTotals.range.max) * 100))}%`,
                }} />
                {(() => {
                  const pct = Math.max(0, Math.min(100, (total / methodTotals.range.max) * 100))
                  return (
                    <div
                      className={`absolute h-2.5 w-0.5 -top-0.5 ${withinRange ? 'bg-green-600' : 'bg-red-600'}`}
                      style={{ left: `${pct}%` }}
                    />
                  )
                })()}
              </div>
              <span className="text-[10px] text-gray-400 font-mono shrink-0">
                {fmtUGX(methodTotals.range.min, true)} – {fmtUGX(methodTotals.range.max, true)}
              </span>
            </div>
          </div>

          {/* Section 02 — Performance (compact, clickable) */}
          <div className="space-y-1.5 pt-3 border-t border-gray-50">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
              02 — Performance
            </p>
            <IssueExpander
              status={portfolio.turnoverStatus}
              compact={turnoverCompact(portfolio.turnover, portfolio.turnoverStatus)}
              detail={turnoverNarrative({ turnover: portfolio.turnover, status: portfolio.turnoverStatus })}
              affectedProducts={affectedProducts.turnover}
              affectedColumns={['turnover', 'dio']}
              affectedTitle="Products with turnover below 4×"
            />
            <IssueExpander
              status={portfolio.dioStatus}
              compact={dioCompact(portfolio.dio, portfolio.dioStatus)}
              detail={dioNarrative({ dio: portfolio.dio, status: portfolio.dioStatus })}
              affectedProducts={affectedProducts.dio}
              affectedColumns={['dio', 'turnover']}
              affectedTitle="Products with DIO above 90 days"
            />
            <IssueExpander
              status={portfolio.holdingStatus}
              compact={holdingCompact(portfolio.holdingPct, portfolio.holdingStatus)}
              detail={holdingCostNarrative({ pct: portfolio.holdingPct, total: portfolio.holdingTotal, status: portfolio.holdingStatus })}
              affectedProducts={affectedProducts.holding}
              affectedColumns={['holdingCost', 'carryingValue']}
              affectedTitle="Products by holding cost per unit (top 20)"
            />
            <IssueExpander
              status={portfolio.varianceStatus}
              compact={mpvCompact(kpis.totalMaterialPriceVariance, portfolio.varianceStatus)}
              detail={mpvNarrative({ variance: kpis.totalMaterialPriceVariance, status: portfolio.varianceStatus, materialityPct: data.settings.varianceMaterialityPct })}
              affectedProducts={affectedProducts.mpv}
              affectedColumns={['mpv', 'standardCost']}
              affectedTitle="Products with material price variance flagged"
            />
          </div>

          {/* Section 03 — Warnings (compact, clickable) */}
          <div className="space-y-1.5 pt-3 border-t border-gray-50">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
              03 — Warnings
            </p>
            {warnings.length === 0 ? (
              <p className="text-[13px] text-gray-700 leading-relaxed">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-2 align-middle" />
                No warnings. All metrics within benchmark.
              </p>
            ) : (
              warnings.map((w, i) => (
                <IssueExpander
                  key={i}
                  status={w.status}
                  compact={w.compact}
                  detail={w.narrative}
                  affectedProducts={w.affectedProducts}
                  affectedColumns={w.affectedColumns}
                  affectedTitle={w.affectedTitle}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Section 04 — Filters ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">04 — Filters</p>
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
      </div>

      {/* ── Section 05 — Products ── */}
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">05 — Products</p>
      </div>
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
    <div className="border-b border-gray-50 last:border-0 pb-1.5">
      {/* Compact one-liner — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left py-1 hover:bg-gray-50 -mx-1 px-1 rounded transition-colors"
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
        <span className="text-[12px] text-gray-900 font-mono flex-1">{compact}</span>
        {hasAffected && (
          <span className="text-[10px] text-gray-400 font-mono shrink-0">
            {affectedProducts.length} product{affectedProducts.length > 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded detail — full narrative + affected products table */}
      {expanded && (
        <div className="mt-1.5 ml-3.5 space-y-2">
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
        <DenseTd mono right>{fmtNum(p.currentStock)}</DenseTd>
        {/* Selected method value — orange bold */}
        <DenseTd mono right className="text-[#FF6B35] font-bold">{fmtUGX(methodValue, true)}</DenseTd>
        {/* Selected method unit cost */}
        <DenseTd mono right className="text-gray-500">{fmtUGX(methodUnitCost, true)}</DenseTd>
        <DenseTd mono right className="font-bold text-gray-900">{fmtUGX(p.carryingValue, true)}</DenseTd>
        <DenseTd mono right className={p.writeDownRequired ? 'text-red-700 font-semibold' : 'text-gray-600'}>
          {fmtUGX(p.nrvPerUnit, true)}
        </DenseTd>
        <DenseTd>
          {p.writeDownRequired ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700">
              <TrendingDown size={11} /> −{fmtUGX(p.writeDownTotal, true)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
              <CheckCircle2 size={11} /> OK
            </span>
          )}
        </DenseTd>
        <DenseTd>
          <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-[10px] font-bold rounded border ${
            p.abcClass === 'A' ? 'bg-red-100 text-red-700 border-red-200'
            : p.abcClass === 'B' ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-gray-100 text-gray-600 border-gray-200'
          }`}>
            {p.abcClass}
          </span>
        </DenseTd>
        <DenseTd mono right>{p.inventoryTurnover > 0 ? p.inventoryTurnover.toFixed(2) : '—'}</DenseTd>
        <DenseTd mono right className={p.daysInventoryOutstanding > 90 ? 'text-amber-700' : p.daysInventoryOutstanding > 180 ? 'text-red-700' : ''}>
          {p.daysInventoryOutstanding > 0 ? p.daysInventoryOutstanding.toFixed(0) : '—'}
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
              <div className="flex justify-between"><span>Inventory turnover</span><span className="font-mono">{BENCHMARKS.turnover.label} ({BENCHMARKS.turnover.source})</span></div>
              <div className="flex justify-between"><span>Days inventory outstanding</span><span className="font-mono">{BENCHMARKS.dio.label} ({BENCHMARKS.dio.source})</span></div>
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
