'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Search, Settings as SettingsIcon, Plus, TrendingDown, TrendingUp, Calculator,
  AlertTriangle, CheckCircle2, XCircle, ArrowDownRight, ArrowUpRight,
  Download, Loader2, HelpCircle, Sliders, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  OpsHeader, KpiRibbon, DenseTable, DenseTh, DenseTd, AnimatedDenseTr, MiniTable,
} from '@/components/shared/ops-ui'

// ── Types ──
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

// ── Formatters ──
const fmtUGX = (n: number, compact = false): string => {
  if (n == null || isNaN(n)) return 'UGX 0'
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `UGX ${(n / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `UGX ${(n / 1_000).toFixed(1)}K`
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

// ── Sub-tab navigation ──
type SubTab = 'valuation' | 'variance' | 'nrv' | 'holding'
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'valuation', label: 'Valuation' },
  { key: 'variance',  label: 'Variance Analysis' },
  { key: 'nrv',       label: 'NRV Register' },
  { key: 'holding',   label: 'Holding Cost' },
]

// ── ABC class badge ──
function AbcBadge({ cls }: { cls: 'A' | 'B' | 'C' }) {
  const styles = {
    A: 'bg-red-100 text-red-700 border-red-200',
    B: 'bg-amber-100 text-amber-700 border-amber-200',
    C: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 text-[10px] font-bold rounded border ${styles[cls]}`} title={`ABC Class ${cls} — Pareto`}>
      {cls}
    </span>
  )
}

// ── Method badge ──
function MethodBadge({ method }: { method: string }) {
  const styles: Record<string, string> = {
    fifo:        'bg-blue-50 text-blue-700 border-blue-100',
    avco:        'bg-purple-50 text-purple-700 border-purple-100',
    standard:    'bg-indigo-50 text-indigo-700 border-indigo-100',
    specific_id: 'bg-teal-50 text-teal-700 border-teal-100',
  }
  const labels: Record<string, string> = {
    fifo: 'FIFO', avco: 'AVCO', standard: 'Std', specific_id: 'Spec ID',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${styles[method] || 'bg-gray-50 text-gray-700 border-gray-200'}`} title={method.toUpperCase()}>
      {labels[method] || method}
    </span>
  )
}

// ── Settings modal ──
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
      const num = parseFloat(v) / 100 // user enters %, we store as fraction
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
    } finally {
      setSaving(false)
    }
  }

  // Helper: show rate as % (e.g. 0.12 → 12)
  const pct = (v: number) => (v * 100).toString()

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sliders size={18} />
            Valuation Settings — ACCA MDC Parameters
          </AlertDialogTitle>
          <AlertDialogDescription>
            Global parameters for inventory valuation, variance analysis, and holding-cost computation.
            Per IAS 2 (Inventories) and ACCA Management Decision &amp; Control syllabus.
            LIFO is intentionally absent — prohibited under IAS 2 §25.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {/* Costing method */}
          <div>
            <Label className="text-xs font-semibold text-gray-700">Default Costing Method (IAS 2)</Label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Applied to all products without a per-product override. LIFO is blocked under IAS 2.
            </p>
            <Select value={form.defaultCostingMethod} onValueChange={(v) => update('defaultCostingMethod', v)}>
              <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fifo">FIFO — First-In, First-Out</SelectItem>
                <SelectItem value="avco">AVCO — Weighted Average Cost</SelectItem>
                <SelectItem value="standard">Standard Cost</SelectItem>
                <SelectItem value="specific_id">Specific Identification (serialized high-value SKUs)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Holding cost rates */}
          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Holding Cost Rates (% of inventory value, annualised)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Capital (opportunity) cost %</Label>
                <Input type="number" step="0.1" value={pct(form.capitalCostRate)} onChange={e => update('capitalCostRate', e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Storage cost %</Label>
                <Input type="number" step="0.1" value={pct(form.storageCostRate)} onChange={e => update('storageCostRate', e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Risk cost % (obsolescence, shrinkage)</Label>
                <Input type="number" step="0.1" value={pct(form.riskCostRate)} onChange={e => update('riskCostRate', e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Service cost % (insurance, taxes, IT)</Label>
                <Input type="number" step="0.1" value={pct(form.serviceCostRate)} onChange={e => update('serviceCostRate', e.target.value)} className="h-9 mt-1" />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Total holding cost = {(form.capitalCostRate + form.storageCostRate + form.riskCostRate + form.serviceCostRate) * 100}% of average inventory value.
              Industry benchmark: 15–30%. Above 30% suggests overstocking.
            </p>
          </div>

          {/* Variance & NRV */}
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save settings
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── New NRV Write-Down modal ──
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
    if (open) {
      setProductId(''); setQty(''); setNrvPerUnit(''); setReason('')
    }
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
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TrendingDown size={18} />
            Record NRV Write-Down — IAS 2 §9
          </AlertDialogTitle>
          <AlertDialogDescription>
            Write inventory down from cost to Net Realisable Value when NRV &lt; cost.
            Per IAS 2 §33, reversals are REQUIRED in a subsequent period if NRV recovers.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-semibold">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select product..." /></SelectTrigger>
              <SelectContent className="max-h-72">
                {products.map(p => (
                  <SelectItem key={p.productId} value={p.productId}>
                    {p.productLabel} — {p.merchantName} (On hand: {fmtNum(p.currentStock)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Record write-down
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Main component ──
export default function InventoryValuationModule() {
  const [data, setData] = useState<ValuationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('valuation')
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<string | null>(null)
  const [writeDownFilter, setWriteDownFilter] = useState<string | null>(null)
  const [abcFilter, setAbcFilter] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nrvOpen, setNrvOpen] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory-valuation', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err?.error || `HTTP ${res.status}`
        // Show the actionable part only — the API includes "run `npx prisma db push`" hint when relevant
        throw new Error(msg)
      }
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      console.error(e)
      // Surface the actual cause — the API gives specific hints for stale Prisma client / missing tables
      const msg = e?.message || 'Unknown error'
      toast.error(msg.length > 200 ? msg.slice(0, 200) + '…' : msg)
      // Also show the full message in an inline error panel so the user can read it
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Save settings ──
  const handleSaveSettings = async (s: Partial<Settings>) => {
    try {
      const res = await fetch('/api/inventory-valuation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Valuation settings updated')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings')
    }
  }

  // ── Change costing method per product ──
  const handleMethodChange = async (productId: string, method: string) => {
    try {
      const res = await fetch('/api/inventory-valuation/method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, costingMethod: method }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success(`Costing method changed to ${method.toUpperCase()}`)
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change costing method')
    }
  }

  // ── Submit NRV write-down ──
  const handleNrvSubmit = async (d: { productId: string; qty: number; unitCost: number; nrvPerUnit: number; reason: string }) => {
    try {
      const res = await fetch('/api/inventory-valuation/nrv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'write_down', ...d }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('NRV write-down recorded (IAS 2 §9)')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record write-down')
    }
  }

  // ── Reverse a write-down ──
  const handleNrvReverse = async (row: NrvRow) => {
    const newNrv = prompt(`Enter new NRV per unit (must be > ${row.nrvPerUnit.toLocaleString()} UGX to reverse):`)
    if (!newNrv) return
    const reason = prompt('Reason for reversal (audit trail):')
    if (!reason) return
    try {
      const res = await fetch('/api/inventory-valuation/nrv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'reversal',
          reversesId: row.id,
          qty: row.qty,
          nrvPerUnitNew: parseFloat(newNrv),
          reason,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('NRV reversal recorded (IAS 2 §33 — required under IFRS)')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record reversal')
    }
  }

  // ── Export CSV ──
  const exportCsv = () => {
    if (!data) return
    const headers = ['Product', 'Merchant', 'Method', 'On Hand', 'FIFO Value', 'AVCO Value', 'Std Value', 'Selected Value', 'NRV/unit', 'Carrying Value', 'Write-down?', 'ABC', 'Turnover', 'DIO', 'EOQ', 'ROP']
    const rows = filteredProducts.map(p => [
      p.productLabel, p.merchantName, p.costingMethod, p.currentStock,
      p.fifoValue.toFixed(0), p.avcoValue.toFixed(0), p.standardValue.toFixed(0), p.selectedValue.toFixed(0),
      p.nrvPerUnit.toFixed(0), p.carryingValue.toFixed(0), p.writeDownRequired ? 'YES' : 'no',
      p.abcClass, p.inventoryTurnover.toFixed(2), p.daysInventoryOutstanding.toFixed(0),
      p.eoq.toFixed(0), p.reorderPoint,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-valuation-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filtered products ──
  const filteredProducts = useMemo(() => {
    if (!data) return []
    return data.products.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.productLabel.toLowerCase().includes(q) &&
            !p.merchantName.toLowerCase().includes(q) &&
            !p.productId.toLowerCase().includes(q)) return false
      }
      if (methodFilter && p.costingMethod !== methodFilter) return false
      if (writeDownFilter === 'required' && !p.writeDownRequired) return false
      if (writeDownFilter === 'ok' && p.writeDownRequired) return false
      if (abcFilter && p.abcClass !== abcFilter) return false
      return true
    })
  }, [data, search, methodFilter, writeDownFilter, abcFilter])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Computing inventory valuation...
      </div>
    )
  }

  // ── Inline error panel — surfaces the actual cause (missing migration, stale client, etc.) ──
  if (loadError && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-red-900 mb-1">Failed to load Inventory Valuation</h3>
              <p className="text-xs text-red-700 leading-relaxed mb-3 font-mono break-words">{loadError}</p>
              <div className="mt-3 pt-3 border-t border-red-200">
                <p className="text-xs font-semibold text-red-900 mb-2">Most likely cause — your local DB hasn't been migrated yet. Run these in order:</p>
                <ol className="text-xs text-red-800 space-y-1.5 list-decimal list-inside font-mono">
                  <li><code className="bg-red-100 px-1.5 py-0.5 rounded">npx prisma generate</code> <span className="font-sans text-red-600">— regenerate the Prisma client with the new models</span></li>
                  <li><code className="bg-red-100 px-1.5 py-0.5 rounded">npx prisma db push</code> <span className="font-sans text-red-600">— create the new tables &amp; columns in your local SQLite</span></li>
                  <li><code className="bg-red-100 px-1.5 py-0.5 rounded">npx tsx scripts/backfill-standard-cost.ts</code> <span className="font-sans text-red-600">— backfill standardCost from unitCost for existing products</span></li>
                  <li>Restart <code className="bg-red-100 px-1.5 py-0.5 rounded">npm run dev</code></li>
                </ol>
              </div>
              <div className="mt-3 pt-3 border-t border-red-200">
                <button
                  onClick={() => { setLoadError(null); load() }}
                  className="text-xs font-medium text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-md border border-red-200"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { kpis, holdingCost, settings, varianceRows, nrvRegister } = data

  // ── KPI ribbon cells ──
  const kpiCells = [
    { label: 'Inv at Cost', value: fmtUGX(kpis.totalInventoryAtCost, true) },
    { label: 'Inv at Retail', value: fmtUGX(kpis.totalInventoryAtRetail, true) },
    { label: 'Carrying Value', value: fmtUGX(kpis.totalCarryingValue, true), highlight: kpis.totalNrvWriteDown > 0, highlightColor: 'orange' as const },
    { label: 'NRV Write-down', value: fmtUGX(kpis.totalNrvWriteDown, true), highlight: kpis.totalNrvWriteDown > 0, highlightColor: 'red' as const },
    { label: 'MPV (90d)', value: fmtUGX(kpis.totalMaterialPriceVariance, true), highlight: kpis.totalMaterialPriceVariance < 0, highlightColor: 'red' as const },
    { label: 'Turnover ×', value: kpis.portfolioTurnover.toFixed(2) },
    { label: 'DIO (days)', value: kpis.portfolioDio > 0 ? kpis.portfolioDio.toFixed(0) : '—' },
    { label: 'Holding Cost %', value: fmtPct(kpis.holdingCostPct), highlight: kpis.holdingCostPct > 0.30, highlightColor: 'red' as const },
  ]

  return (
    <div className="space-y-3">
      {/* ── Header + KPIs ── */}
      <OpsHeader
        title="Inventory Valuation"
        description="IAS 2 costing · NRV lower-of-cost-or-NRV · ACCA MDC variance, turnover, holding cost, EOQ"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products..."
      >
        <Button
          size="sm" variant="outline"
          onClick={load}
          className="h-7 text-xs rounded-md"
        >
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="h-7 text-xs rounded-md"
        >
          <SettingsIcon size={12} className="mr-1" /> Settings
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={exportCsv}
          className="h-7 text-xs rounded-md"
        >
          <Download size={12} className="mr-1" /> Export
        </Button>
        <Button
          size="sm"
          onClick={() => setNrvOpen(true)}
          className="h-7 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white"
        >
          <Plus size={12} className="mr-1" /> NRV Write-Down
        </Button>
      </OpsHeader>

      {/* ── Sub-tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === t.key ? 'bg-white text-[#FF6B35] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.key === 'nrv' && nrvRegister.filter(r => r.status === 'active').length > 0 && (
              <span className="bg-red-100 text-red-700 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {nrvRegister.filter(r => r.status === 'active').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sub-tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18 }}
        >
          {subTab === 'valuation' && (
            <ValuationSubTab
              data={data}
              filteredProducts={filteredProducts}
              search={search}
              methodFilter={methodFilter}
              setMethodFilter={setMethodFilter}
              writeDownFilter={writeDownFilter}
              setWriteDownFilter={setWriteDownFilter}
              abcFilter={abcFilter}
              setAbcFilter={setAbcFilter}
              expandedProduct={expandedProduct}
              setExpandedProduct={setExpandedProduct}
              onMethodChange={handleMethodChange}
            />
          )}
          {subTab === 'variance' && (
            <VarianceSubTab varianceRows={varianceRows} settings={settings} />
          )}
          {subTab === 'nrv' && (
            <NrvSubTab rows={nrvRegister} onReverse={handleNrvReverse} />
          )}
          {subTab === 'holding' && (
            <HoldingSubTab holdingCost={holdingCost} settings={settings} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Settings modal ── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* ── NRV Write-Down modal ── */}
      <NrvWriteDownModal
        open={nrvOpen}
        onClose={() => setNrvOpen(false)}
        products={data.products}
        onSubmit={handleNrvSubmit}
      />
    </div>
  )
}

// ── Sub-tab: Valuation ──
function ValuationSubTab(args: {
  data: ValuationResponse
  filteredProducts: ProductValuation[]
  search: string
  methodFilter: string | null
  setMethodFilter: (v: string | null) => void
  writeDownFilter: string | null
  setWriteDownFilter: (v: string | null) => void
  abcFilter: string | null
  setAbcFilter: (v: string | null) => void
  expandedProduct: string | null
  setExpandedProduct: (v: string | null) => void
  onMethodChange: (productId: string, method: string) => void
}) {
  const { data, filteredProducts, methodFilter, setMethodFilter, writeDownFilter, setWriteDownFilter, abcFilter, setAbcFilter, expandedProduct, setExpandedProduct, onMethodChange } = args

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="Method" value={methodFilter} setValue={setMethodFilter} options={[
          { v: 'fifo', l: 'FIFO' }, { v: 'avco', l: 'AVCO' }, { v: 'standard', l: 'Standard' }, { v: 'specific_id', l: 'Specific ID' },
        ]} />
        <FilterChip label="NRV Test" value={writeDownFilter} setValue={setWriteDownFilter} options={[
          { v: 'required', l: 'Write-down required' }, { v: 'ok', l: 'OK (Cost ≤ NRV)' },
        ]} />
        <FilterChip label="ABC" value={abcFilter} setValue={setAbcFilter} options={[
          { v: 'A', l: 'A (top 80% value)' }, { v: 'B', l: 'B (next 15%)' }, { v: 'C', l: 'C (bottom 5%)' },
        ]} />
        <span className="text-[11px] text-gray-400 ml-auto">
          {filteredProducts.length} of {data.products.length} products · IAS 2 lower-of-cost-or-NRV applied
        </span>
      </div>

      {/* Main valuation table */}
      <DenseTable>
        <thead>
          <tr>
            <DenseTh>Product</DenseTh>
            <DenseTh>Merchant</DenseTh>
            <DenseTh>Method</DenseTh>
            <DenseTh className="text-right">On Hand</DenseTh>
            <DenseTh className="text-right">FIFO Value</DenseTh>
            <DenseTh className="text-right">AVCO Value</DenseTh>
            <DenseTh className="text-right">Std Value</DenseTh>
            <DenseTh className="text-right">Selected</DenseTh>
            <DenseTh className="text-right">NRV/unit</DenseTh>
            <DenseTh className="text-right">Carry Value</DenseTh>
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
            <tr><td colSpan={16} className="text-center py-8 text-gray-400 text-xs">No products match filters</td></tr>
          )}
          {filteredProducts.slice(0, 200).map((p, i) => (
            <ValuationRow
              key={p.productId}
              p={p}
              index={i}
              expanded={expandedProduct === p.productId}
              onToggle={() => setExpandedProduct(expandedProduct === p.productId ? null : p.productId)}
              onMethodChange={(m) => onMethodChange(p.productId, m)}
            />
          ))}
        </tbody>
        {filteredProducts.length > 200 && (
          <tfoot>
            <tr><td colSpan={16} className="text-center py-2 text-[10px] text-gray-400">
              Showing first 200 of {filteredProducts.length} products — narrow your search to see more
            </td></tr>
          </tfoot>
        )}
      </DenseTable>
    </div>
  )
}

// ── Valuation row (expandable) ──
function ValuationRow({ p, index, expanded, onToggle, onMethodChange }: {
  p: ProductValuation
  index: number
  expanded: boolean
  onToggle: () => void
  onMethodChange: (method: string) => void
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
        <DenseTd><MethodBadge method={p.costingMethod} /></DenseTd>
        <DenseTd mono right>{fmtNum(p.currentStock)}</DenseTd>
        <DenseTd mono right className="text-gray-500">{fmtUGX(p.fifoValue, true)}</DenseTd>
        <DenseTd mono right className="text-gray-500">{fmtUGX(p.avcoValue, true)}</DenseTd>
        <DenseTd mono right className="text-gray-500">{fmtUGX(p.standardValue, true)}</DenseTd>
        <DenseTd mono right className="font-bold text-gray-900">{fmtUGX(p.selectedValue, true)}</DenseTd>
        <DenseTd mono right className={p.writeDownRequired ? 'text-red-700 font-semibold' : 'text-gray-600'}>{fmtUGX(p.nrvPerUnit, true)}</DenseTd>
        <DenseTd mono right className="font-semibold text-gray-900">{fmtUGX(p.carryingValue, true)}</DenseTd>
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
        <DenseTd><AbcBadge cls={p.abcClass} /></DenseTd>
        <DenseTd mono right>{p.inventoryTurnover > 0 ? p.inventoryTurnover.toFixed(2) : '—'}</DenseTd>
        <DenseTd mono right className={p.daysInventoryOutstanding > 90 ? 'text-amber-700' : p.daysInventoryOutstanding > 180 ? 'text-red-700' : ''}>
          {p.daysInventoryOutstanding > 0 ? p.daysInventoryOutstanding.toFixed(0) : '—'}
        </DenseTd>
        <DenseTd mono right className="text-blue-700">{p.eoq > 0 ? fmtNum(Math.ceil(p.eoq)) : '—'}</DenseTd>
        <DenseTd mono right className="text-purple-700">{p.reorderPoint > 0 ? p.reorderPoint : '—'}</DenseTd>
      </AnimatedDenseTr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="bg-gray-50/60 border-b border-gray-100">
          <td colSpan={16} className="p-4">
            <div className="grid grid-cols-4 gap-4 text-xs">
              {/* Costing */}
              <div>
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">Costing (IAS 2)</p>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-500">Method:</span>
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
              <div className="col-span-4 mt-2 pt-3 border-t border-gray-200">
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wider text-[10px]">Variance Analysis (ACCA MDC — 90d window)</p>
                <div className="grid grid-cols-4 gap-4 text-[11px]">
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

// ── Sub-tab: Variance Analysis ──
function VarianceSubTab({ varianceRows, settings }: { varianceRows: VarianceRow[]; settings: Settings }) {
  const totalF = varianceRows.filter(r => r.kind === 'F').reduce((s, r) => s + r.priceVariance, 0)
  const totalA = varianceRows.filter(r => r.kind === 'A').reduce((s, r) => s + r.priceVariance, 0)
  const netVariance = totalF + totalA
  const materialCount = varianceRows.filter(r => r.material).length

  return (
    <div className="space-y-3">
      {/* Variance KPI strip */}
      <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Favourable (F)</span>
          <div className="font-mono font-bold text-base text-green-400">▲ {fmtUGX(totalF, true)}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Adverse (A)</span>
          <div className="font-mono font-bold text-base text-red-400">▼ {fmtUGX(Math.abs(totalA), true)}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Net variance (90d)</span>
          <div className={`font-mono font-bold text-base ${netVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {netVariance >= 0 ? '▲' : '▼'} {fmtUGX(Math.abs(netVariance), true)}
          </div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Material (&gt;{(settings.varianceMaterialityPct * 100).toFixed(1)}%)</span>
          <div className="font-mono font-bold text-base text-amber-400">{materialCount}</div>
        </div>
        <div className="flex-1 px-4 py-3">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Total GRNs (90d)</span>
          <div className="font-mono font-bold text-base">{varianceRows.length}</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-900 leading-relaxed">
        <strong>Material Price Variance (MPV) = (Standard Cost − Actual Cost) × Qty.</strong>{' '}
        Isolated at Goods Received Note (GRN). Per ACCA MDC, variances above the materiality threshold
        ({(settings.varianceMaterialityPct * 100).toFixed(1)}% of standard cost) should be investigated
        under management-by-exception. Favourable (F) = actual cost was below standard; Adverse (A) = above.
      </div>

      <DenseTable>
        <thead>
          <tr>
            <DenseTh>Received</DenseTh>
            <DenseTh>Product</DenseTh>
            <DenseTh>Merchant</DenseTh>
            <DenseTh className="text-right">Qty</DenseTh>
            <DenseTh className="text-right">Actual/unit</DenseTh>
            <DenseTh className="text-right">Std/unit</DenseTh>
            <DenseTh className="text-right">Var/unit</DenseTh>
            <DenseTh className="text-right">Total Var</DenseTh>
            <DenseTh>F/A</DenseTh>
            <DenseTh>Material?</DenseTh>
          </tr>
        </thead>
        <tbody>
          {varianceRows.length === 0 && (
            <tr><td colSpan={10} className="text-center py-8 text-gray-400 text-xs">No inbound receipts in the last 90 days</td></tr>
          )}
          {varianceRows.slice(0, 100).map((r, i) => (
            <AnimatedDenseTr key={r.inboundId} index={i} tint={r.material ? 'bg-amber-50/40' : r.kind === 'A' ? 'bg-red-50/30' : ''}>
              <DenseTd className="text-gray-500">{fmtDate(r.receivedAt)}</DenseTd>
              <DenseTd className="font-semibold text-gray-900 truncate max-w-[200px]">{r.productLabel}</DenseTd>
              <DenseTd className="text-gray-600 truncate max-w-[120px]">{r.merchantName}</DenseTd>
              <DenseTd mono right>{fmtNum(r.qty)}</DenseTd>
              <DenseTd mono right>{fmtUGX(r.actualUnitCost, true)}</DenseTd>
              <DenseTd mono right className="text-gray-500">{fmtUGX(r.standardUnitCost, true)}</DenseTd>
              <DenseTd mono right className={r.priceVariancePerUnit >= 0 ? 'text-green-700' : 'text-red-700'}>
                {r.priceVariancePerUnit >= 0 ? '+' : ''}{fmtUGX(r.priceVariancePerUnit, true)}
              </DenseTd>
              <DenseTd mono right className={`font-bold ${r.priceVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {r.priceVariance >= 0 ? '+' : ''}{fmtUGX(r.priceVariance, true)}
              </DenseTd>
              <DenseTd>
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  r.kind === 'F' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {r.kind === 'F' ? 'F' : 'A'}
                </span>
              </DenseTd>
              <DenseTd>
                {r.material ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                    <AlertTriangle size={11} /> Yes
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">No</span>
                )}
              </DenseTd>
            </AnimatedDenseTr>
          ))}
        </tbody>
      </DenseTable>
    </div>
  )
}

// ── Sub-tab: NRV Register ──
function NrvSubTab({ rows, onReverse }: { rows: NrvRow[]; onReverse: (r: NrvRow) => void }) {
  const active = rows.filter(r => r.status === 'active' && r.kind === 'write_down')
  const reversals = rows.filter(r => r.kind === 'reversal')
  const totalActiveWriteDown = active.reduce((s, r) => s + r.totalAmount, 0)
  const totalReversals = reversals.reduce((s, r) => s + r.totalAmount, 0)

  return (
    <div className="space-y-3">
      {/* KPI strip */}
      <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Active write-downs</span>
          <div className="font-mono font-bold text-base text-red-400">{active.length}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Total written down</span>
          <div className="font-mono font-bold text-base">{fmtUGX(totalActiveWriteDown, true)}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Reversals recorded</span>
          <div className="font-mono font-bold text-base text-green-400">{reversals.length}</div>
        </div>
        <div className="flex-1 px-4 py-3">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Total reversed</span>
          <div className="font-mono font-bold text-base text-green-400">{fmtUGX(totalReversals, true)}</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-900 leading-relaxed">
        <strong>IAS 2 §9 (Lower of Cost or NRV):</strong> Inventory is carried at the lower of cost and net realisable value,
        applied item-by-item (no offsetting). <strong>§33 Reversals:</strong> When the circumstances that caused a previous
        write-down cease, the write-down MUST be reversed (capped at the original cost). Reversals are <strong>required under
        IFRS</strong> — US-GAAP forbids them, but CPA Uganda follows IFRS.
      </div>

      <DenseTable>
        <thead>
          <tr>
            <DenseTh>Date</DenseTh>
            <DenseTh>Product</DenseTh>
            <DenseTh>Merchant</DenseTh>
            <DenseTh>Type</DenseTh>
            <DenseTh className="text-right">Qty</DenseTh>
            <DenseTh className="text-right">Unit Cost</DenseTh>
            <DenseTh className="text-right">NRV/unit</DenseTh>
            <DenseTh className="text-right">Amount/unit</DenseTh>
            <DenseTh className="text-right">Total</DenseTh>
            <DenseTh>Status</DenseTh>
            <DenseTh>Reason</DenseTh>
            <DenseTh></DenseTh>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={12} className="text-center py-8 text-gray-400 text-xs">
              No NRV write-downs or reversals recorded. Inventory is fully at cost.
            </td></tr>
          )}
          {rows.map((r, i) => (
            <AnimatedDenseTr key={r.id} index={i} tint={r.kind === 'reversal' ? 'bg-green-50/40' : r.status === 'reversed' ? 'bg-gray-50/40' : 'bg-red-50/40'}>
              <DenseTd className="text-gray-500">{fmtDate(r.createdAt)}</DenseTd>
              <DenseTd className="font-semibold text-gray-900 truncate max-w-[200px]">{r.productName}</DenseTd>
              <DenseTd className="text-gray-600 truncate max-w-[120px]">{r.merchantName || '—'}</DenseTd>
              <DenseTd>
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  r.kind === 'write_down' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  {r.kind === 'write_down' ? 'Write-down' : 'Reversal'}
                </span>
              </DenseTd>
              <DenseTd mono right>{fmtNum(r.qty)}</DenseTd>
              <DenseTd mono right>{fmtUGX(r.unitCost, true)}</DenseTd>
              <DenseTd mono right>{fmtUGX(r.nrvPerUnit, true)}</DenseTd>
              <DenseTd mono right className={r.kind === 'write_down' ? 'text-red-700' : 'text-green-700'}>
                {r.kind === 'write_down' ? '−' : '+'}{fmtUGX(r.amountPerUnit, true)}
              </DenseTd>
              <DenseTd mono right className={`font-bold ${r.kind === 'write_down' ? 'text-red-700' : 'text-green-700'}`}>
                {r.kind === 'write_down' ? '−' : '+'}{fmtUGX(r.totalAmount, true)}
              </DenseTd>
              <DenseTd>
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  r.status === 'active' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {r.status}
                </span>
              </DenseTd>
              <DenseTd className="text-gray-500 truncate max-w-[180px]">{r.reason}</DenseTd>
              <DenseTd>
                {r.kind === 'write_down' && r.status === 'active' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onReverse(r) }}
                    className="text-[10px] font-medium text-green-700 hover:bg-green-50 px-2 py-1 rounded"
                  >
                    Reverse
                  </button>
                )}
              </DenseTd>
            </AnimatedDenseTr>
          ))}
        </tbody>
      </DenseTable>
    </div>
  )
}

// ── Sub-tab: Holding Cost ──
function HoldingSubTab({ holdingCost, settings }: { holdingCost: HoldingCost; settings: Settings }) {
  const total = holdingCost.total
  const breakdown = [
    { label: 'Capital (opportunity)', amount: holdingCost.capital, pct: settings.capitalCostRate, color: 'bg-blue-500', desc: 'Cost of capital tied up in inventory. The return that could have been earned elsewhere.' },
    { label: 'Storage', amount: holdingCost.storage, pct: settings.storageCostRate, color: 'bg-purple-500', desc: 'Warehouse space, handling equipment, security, climate control, racking.' },
    { label: 'Risk', amount: holdingCost.risk, pct: settings.riskCostRate, color: 'bg-amber-500', desc: 'Obsolescence, deterioration, damage, theft/shrinkage, expiry write-offs.' },
    { label: 'Service', amount: holdingCost.service, pct: settings.serviceCostRate, color: 'bg-teal-500', desc: 'Insurance premiums, property taxes on inventory, IT systems, stocktaking.' },
  ]

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-900 leading-relaxed">
        <strong>Inventory Holding Cost (ACCA MDC) — 4 components:</strong> Capital (largest, ~40–60%), Storage, Risk
        (obsolescence/shrinkage), Service (insurance/IT/taxes). Industry benchmark: <strong>15–30%</strong> of average
        inventory value. Above 30% indicates overstocking. Below 10% may indicate under-investment in storage/security.
      </div>

      {/* Summary strip */}
      <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Avg Inventory Value</span>
          <div className="font-mono font-bold text-base">{fmtUGX(holdingCost.avgInventoryValue, true)}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Annual Holding Cost</span>
          <div className="font-mono font-bold text-base text-orange-400">{fmtUGX(total, true)}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-white/10">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">% of Inv Value</span>
          <div className={`font-mono font-bold text-base ${
            holdingCost.totalPctOfInvValue > 0.30 ? 'text-red-400' :
            holdingCost.totalPctOfInvValue > 0.20 ? 'text-amber-400' : 'text-green-400'
          }`}>
            {(holdingCost.totalPctOfInvValue * 100).toFixed(2)}%
          </div>
        </div>
        <div className="flex-1 px-4 py-3">
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider">Daily Holding Cost</span>
          <div className="font-mono font-bold text-base">{fmtUGX(total / settings.daysInYear, true)}</div>
        </div>
      </div>

      {/* Breakdown bars */}
      <DenseTable>
        <thead>
          <tr>
            <DenseTh>Component</DenseTh>
            <DenseTh className="text-right">Annual Amount</DenseTh>
            <DenseTh className="text-right">Rate %</DenseTh>
            <DenseTh className="text-right">Share of Total</DenseTh>
            <DenseTh>Distribution</DenseTh>
            <DenseTh>Description</DenseTh>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b, i) => (
            <AnimatedDenseTr key={b.label} index={i}>
              <DenseTd>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${b.color}`} />
                  <span className="font-semibold text-gray-900">{b.label}</span>
                </div>
              </DenseTd>
              <DenseTd mono right className="font-bold">{fmtUGX(b.amount, true)}</DenseTd>
              <DenseTd mono right>{(b.pct * 100).toFixed(2)}%</DenseTd>
              <DenseTd mono right>{total > 0 ? ((b.amount / total) * 100).toFixed(1) + '%' : '—'}</DenseTd>
              <DenseTd>
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${b.color}`} style={{ width: `${total > 0 ? (b.amount / total) * 100 : 0}%` }} />
                </div>
              </DenseTd>
              <DenseTd className="text-[10px] text-gray-500">{b.desc}</DenseTd>
            </AnimatedDenseTr>
          ))}
        </tbody>
      </DenseTable>

      {/* Interpretation */}
      <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-xs leading-relaxed">
        <p className="font-bold text-gray-700 mb-2">Interpretation &amp; Action</p>
        <ul className="space-y-1.5 text-gray-600">
          <li>• <strong>Capital</strong> is the largest component — negotiate better payment terms with merchants or push consignment stock to reduce it.</li>
          <li>• <strong>Storage</strong> scales with volume — if it exceeds 8%, review whether fast-moving items are taking up shelf space meant for slow-movers (apply ABC re-slotting).</li>
          <li>• <strong>Risk</strong> above 5% indicates high shrinkage or obsolescence — check Reconciliation and Shrinkage modules for patterns.</li>
          <li>• <strong>Service</strong> is mostly fixed — insurance premiums can be renegotiated annually based on actual stock value.</li>
          <li>• Total &gt; 30% — investigate overstocking. Total &lt; 10% — may indicate under-investment in storage or security.</li>
        </ul>
      </div>
    </div>
  )
}

// ── Filter chip helper ──
function FilterChip({ label, value, setValue, options }: {
  label: string
  value: string | null
  setValue: (v: string | null) => void
  options: { v: string; l: string }[]
}) {
  return (
    <div className="relative inline-block group">
      <button className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border ${
        value ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}>
        <span>{label}:</span>
        <span className="font-semibold">{value ? options.find(o => o.v === value)?.l || value : 'All'}</span>
      </button>
      <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-20 bg-white border border-gray-200 rounded-md shadow-lg min-w-[180px] py-1">
        <button
          onClick={() => setValue(null)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${!value ? 'bg-[#FF6B35]/10 text-[#FF6B35] font-medium' : 'text-gray-600'}`}
        >
          All {label}
        </button>
        {options.map(o => (
          <button
            key={o.v}
            onClick={() => setValue(o.v)}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${value === o.v ? 'bg-[#FF6B35]/10 text-[#FF6B35] font-medium' : 'text-gray-600'}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}
