'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Search, ArrowDownRight, Inbox, BarChart3,
  MapPin, DollarSign, Package, Calendar, Filter, X,
  Loader2, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  CheckSquare, Square, Upload, Trash2, User, Building2, Clock,
  HelpCircle, Layers, ArrowLeft as BackIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import ViewToggle from '@/components/shared/ViewToggle'
import DataTable, { type Column } from '@/components/shared/DataTable'
import { WorkflowActions, NextStepBanner, StatusStepper } from '@/components/shared/workflow'
import { getStage } from '@/lib/workflow'

const MODULE = 'inbound'

// ── Types ──
interface Merchant { id: string; merchantId: string; businessName: string }
interface Product { id: string; productId: string; productLabel: string; brand: string | null; variant: string | null; merchantId: string; currentStock: number; unit: string; unitCost: number }

interface InboundRecord {
  id: string
  inboundId: string
  vendorId: string | null
  merchantId: string
  merchantName: string
  productName: string
  productId: string
  brand: string | null
  variant: string | null
  qtyIn: number
  unitPrice: number | null
  inboundValue: number | null
  expiryDate: string | null
  receivedBy: string
  storedBy: string | null
  storageLocation: string | null
  status: string
  userComment: string | null
  createdAt: string
}

// ── Constants ──
const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5']
const PALLETS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']
const PAGE_SIZES = [25, 50, 100, 200]

const INBOUND_STATUSES = [
  { key: 'received', label: 'Received', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  { key: 'put_away', label: 'Put Away', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'stored', label: 'Stored', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  { key: 'partial', label: 'Partial', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  { key: 'damaged', label: 'Damaged', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
]

// ── Helpers ──
const fmt = (n: number) => {
  if (n == null || isNaN(n)) return '0'
  if (n === 0) return '0'
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

const getExpiryStatus = (expiryDate: string | null) => {
  if (!expiryDate) return null
  const now = new Date()
  const expiry = new Date(expiryDate)
  const diffMs = expiry.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-600 bg-red-50', days: diffDays }
  if (diffDays <= 30) return { label: `${diffDays}d left`, color: 'text-amber-600 bg-amber-50', days: diffDays }
  if (diffDays <= 90) return { label: `${diffDays}d left`, color: 'text-yellow-600 bg-yellow-50', days: diffDays }
  return { label: `${diffDays}d left`, color: 'text-green-600 bg-green-50', days: diffDays }
}

const statusBadge = (status: string) => {
  const s = INBOUND_STATUSES.find(st => st.key === status)
  if (s) return <Badge className={`${s.badge} hover:${s.badge} text-xs font-medium`}>{s.label}</Badge>
  return <Badge variant="secondary" className="text-xs">{status}</Badge>
}

function exportCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v ?? ''}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ──
function SearchableFilter({ label, options, selected, onSelect, counts, multi }: {
  label: string; options: string[]
  selected: string | string[] | null
  onSelect: (v: string[] | string | null) => void
  counts?: Record<string, number>; multi?: boolean
}) {
  const [query, setQuery] = useState('')
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options
  const isArray = Array.isArray(selected)
  const selectedArr = isArray ? selected as string[] : selected ? [selected] : []
  const isActive = multi ? selectedArr.length > 0 : !!selected
  const btnLabel = multi
    ? (selectedArr.length === 1 ? selectedArr[0] : selectedArr.length > 1 ? `${selectedArr.length} selected` : 'All')
    : (selected || 'All')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${isActive ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <Filter size={13} />
          <span className="hidden sm:inline">{label}:</span>
          <span className="max-w-[100px] truncate">{btnLabel}</span>
          {multi && selectedArr.length > 1 && (
            <span className="bg-[#FF6B35]/15 text-[#FF6B35] text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{selectedArr.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder={`Search ${label.toLowerCase()}...`} value={query} onChange={e => setQuery(e.target.value)} className="pl-8 h-8 text-xs border-gray-200" />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {multi && (
            <div className="flex gap-1 px-1 pb-1 border-b border-gray-50 mb-1">
              <button onClick={() => { onSelect(options); setQuery('') }} className="text-[10px] text-[#FF6B35] hover:bg-[#FF6B35]/5 px-1.5 py-0.5 rounded font-medium">Select All</button>
              <button onClick={() => { onSelect([]); setQuery('') }} className="text-[10px] text-gray-500 hover:bg-gray-50 px-1.5 py-0.5 rounded font-medium">Clear All</button>
            </div>
          )}
          <button onClick={() => { onSelect(null); setQuery('') }} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${!selected ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
            All {label}
          </button>
          {filtered.map(o => {
            const isSelected = multi ? selectedArr.includes(o) : selected === o
            const count = counts?.[o]
            const handleToggle = () => {
              if (multi) {
                let nextArr: string[]
                if (selectedArr.includes(o)) { nextArr = selectedArr.filter(v => v !== o) } else { nextArr = [...selectedArr, o] }
                onSelect(nextArr); setQuery('')
              } else { onSelect(selected === o ? null : o); setQuery('') }
            }
            return (
              <button key={o} onClick={handleToggle} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${isSelected ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
                {multi && (isSelected ? <CheckSquare size={13} className="shrink-0" /> : <Square size={13} className="shrink-0 text-gray-300" />)}
                <span className="flex-1 truncate">{o}</span>
                {count !== undefined && count > 0 && <span className="text-[10px] text-gray-400 tabular-nums">{count.toLocaleString()}</span>}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No matches</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StatusFilter({ selected, onSelect, statuses, counts }: {
  selected: string | null; onSelect: (v: string | null) => void
  statuses: { key: string; label: string; dot: string }[]; counts?: Record<string, number>
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${selected ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <span className={`w-2 h-2 rounded-full ${selected ? (statuses.find(s => s.key === selected)?.dot || 'bg-gray-300') : 'bg-gray-300'}`} />
          <span className="hidden sm:inline">Status:</span>
          <span>{selected ? statuses.find(s => s.key === selected)?.label : 'All'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5" align="start">
        <button onClick={() => onSelect(null)} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center ${!selected ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
          <span className="flex-1">All Statuses</span>
        </button>
        {statuses.map(s => (
          <button key={s.key} onClick={() => onSelect(selected === s.key ? null : s.key)} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${selected === s.key ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            <span className="flex-1">{s.label}</span>
            {counts && counts[s.key] !== undefined && <span className="text-[10px] text-gray-400 ml-auto tabular-nums">{counts[s.key].toLocaleString()}</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function FilterChips({ chips, onClearAll }: { chips: Array<{ key: string; label: string; onRemove: () => void }>; onClearAll: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map(chip => (
        <button key={chip.key} onClick={chip.onRemove} className="bg-[#FF6B35]/10 text-[#FF6B35] border border-[#FF6B35]/20 rounded-full px-2.5 py-1 text-xs font-medium flex items-center gap-1.5 hover:bg-[#FF6B35]/20 transition-colors">
          {chip.label} <X size={12} className="hover:text-red-500" />
        </button>
      ))}
      <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-red-500 transition-colors">Clear All</button>
    </div>
  )
}

function DateRangeFilter({ label = 'Date', value, onChange }: {
  label?: string; value: { from: string | null; to: string | null } | null
  onChange: (range: { from: string | null; to: string | null } | null) => void
}) {
  const [customFrom, setCustomFrom] = useState(value?.from || '')
  const [customTo, setCustomTo] = useState(value?.to || '')
  const today = new Date().toISOString().slice(0, 10)
  const presets = [
    { key: 'today', label: 'Today', getRange: () => ({ from: today, to: today }) },
    { key: '7d', label: 'Last 7d', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 7); return { from: d.toISOString().slice(0, 10), to: today } } },
    { key: '30d', label: 'Last 30d', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to: today } } },
    { key: 'month', label: 'This Month', getRange: () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); return { from: first.toISOString().slice(0, 10), to: today } } },
    { key: 'quarter', label: 'This Quarter', getRange: () => { const now = new Date(); const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); return { from: qStart.toISOString().slice(0, 10), to: today } } },
  ]
  const fmtShort = (d: string) => { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const isActive = !!value
  const btnText = (() => {
    if (!value) return label
    const matchingPreset = presets.find(p => { const r = p.getRange(); return r.from === value.from && r.to === value.to })
    if (matchingPreset) return `${label}: ${matchingPreset.label}`
    if (value.from && value.to) return `${label}: ${fmtShort(value.from)} – ${fmtShort(value.to)}`
    if (value.from) return `${label}: from ${fmtShort(value.from)}`
    return `${label}: until ${fmtShort(value.to || '')}`
  })()
  const handlePreset = (preset: typeof presets[0]) => { const range = preset.getRange(); onChange(range); setCustomFrom(range.from || ''); setCustomTo(range.to || '') }
  const handleCustomApply = () => { if (customFrom || customTo) onChange({ from: customFrom || null, to: customTo || null }); else onChange(null) }
  const handleClear = () => { onChange(null); setCustomFrom(''); setCustomTo('') }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${isActive ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <Calendar size={13} /><span>{btnText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => {
              const r = p.getRange(); const isPresetActive = value && r.from === value.from && r.to === value.to
              return <button key={p.key} onClick={() => handlePreset(p)} className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${isPresetActive ? 'bg-[#FF6B35]/10 text-[#FF6B35] border border-[#FF6B35]/20' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>{p.label}</button>
            })}
          </div>
          <div className="border-t border-gray-100 pt-2 space-y-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Custom Range</p>
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs border-gray-200" />
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs border-gray-200" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCustomApply} className="flex-1 h-7 text-[10px] bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg">Apply</Button>
              {isActive && <Button size="sm" variant="ghost" onClick={handleClear} className="h-7 text-[10px] text-gray-500 hover:text-red-500 rounded-lg">Clear</Button>}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function InboundModule({ onNavigate }: { onNavigate?: (module: string) => void } = {}) {
  // ── Data State ──
  const [data, setData] = useState<InboundRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Pagination ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Filters ──
  const [filterVendor, setFilterVendor] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterDateRange, setFilterDateRange] = useState<{ from: string | null; to: string | null } | null>(null)

  // ── SlideOver ──
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<InboundRecord | null>(null)
  const [view, setView] = useState<'list' | 'add' | 'table'>('list')
  const [helpOpen, setHelpOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    merchantId: '', merchantName: '', vendorId: '', productId: '', productName: '',
    brand: '', variant: '', qtyIn: '', unitPrice: '', expiryDate: '',
    receivedBy: '', storedBy: '', storageLocation: '', userComment: '',
  })
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Keyboard shortcut ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Fetch Data ──
  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/inbound?search=${search}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false); toast.error('Failed to load inbound records') } })
    return () => { cancelled = true }
  }, [search])

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`/api/inbound?search=${search}`)
      .then(r => r.json()).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
  }, [search])

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setLoading(true); setPage(1) }, [])
  const handleFilterVendorChange = useCallback((value: string | string[] | null) => { setFilterVendor(Array.isArray(value) ? value : value ? [value] : []); setPage(1) }, [])
  const handleFilterStatusChange = useCallback((value: string | null) => { setFilterStatus(value); setPage(1) }, [])
  const handleClearFilters = useCallback(() => { setFilterVendor([]); setFilterStatus(null); setFilterDateRange(null); setPage(1) }, [])
  const handlePageSizeChange = useCallback((size: number) => { setPageSize(size); setPage(1) }, [])

  // ── Derived Data ──
  const vendors = useMemo(() => [...new Set(data.map(r => r.merchantName))].sort(), [data])
  const vendorCounts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(r => { c[r.merchantName] = (c[r.merchantName] || 0) + 1 }); return c }, [data])
  const statusCounts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(r => { c[r.status] = (c[r.status] || 0) + 1 }); return c }, [data])

  const filteredData = useMemo(() => {
    return data.filter(r => {
      if (filterVendor.length > 0 && !filterVendor.includes(r.merchantName)) return false
      if (filterStatus && r.status !== filterStatus) return false
      if (filterDateRange) {
        if (filterDateRange.from && r.createdAt < filterDateRange.from) return false
        if (filterDateRange.to && r.createdAt > filterDateRange.to) return false
      }
      return true
    })
  }, [data, filterVendor, filterStatus, filterDateRange])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [filteredData])

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const paginatedData = useMemo(() => sortedData.slice((page - 1) * pageSize, page * pageSize), [sortedData, page, pageSize])

  // ── Selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id) } else { n.add(id) }; return n })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // ── Batch Export ──
  const handleBatchExport = useCallback(() => {
    const selected = data.filter(r => selectedIds.has(r.id)); if (selected.length === 0) return
    exportCSV('inbound-export.csv', ['Reference #', 'Supplier', 'Product', 'Qty', 'Cost Each', 'Total Cost', 'Expiry Date', 'Where Stored', 'Received By', 'Date', 'Status'],
      selected.map(r => [r.inboundId, r.merchantName, r.productName, r.qtyIn, r.unitPrice, r.inboundValue, r.expiryDate, r.storageLocation, r.receivedBy, r.createdAt, r.status]))
    toast.success(`Exported ${selected.length} records`)
  }, [data, selectedIds])

  const handleExportAll = useCallback(() => {
    if (filteredData.length === 0) return
    exportCSV('inbound-export.csv', ['Reference #', 'Supplier', 'Product', 'Qty', 'Cost Each', 'Total Cost', 'Expiry Date', 'Where Stored', 'Received By', 'Date', 'Status'],
      filteredData.map(r => [r.inboundId, r.merchantName, r.productName, r.qtyIn, r.unitPrice, r.inboundValue, r.expiryDate, r.storageLocation, r.receivedBy, r.createdAt, r.status]))
    toast.success(`Exported ${filteredData.length} records`)
  }, [filteredData])

  // ── Batch Delete ──
  const handleBatchDelete = useCallback(async () => {
    const selected = data.filter(r => selectedIds.has(r.id)); if (selected.length === 0) return
    try {
      await Promise.all(selected.map(r => fetch(`/api/inbound?id=${r.id}`, { method: 'DELETE' })))
      toast.success(`Deleted ${selected.length} records`); setSelectedIds(new Set()); fetchData()
    } catch { toast.error('Failed to delete records') }
  }, [data, selectedIds, fetchData])

  // ── Form Handlers ──
  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(merch => merch.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', productId: '', productName: '', brand: '', variant: '' })
    fetch(`/api/products?search=${merchantId}`).then(r => r.json()).then((d: Product[] | { products?: Product[] }) => setProducts(Array.isArray(d) ? d : (d?.products ?? [])))
  }

  const handleProductSelect = (productId: string) => {
    const p = products.find(prod => prod.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '', brand: p?.brand || '', variant: p?.variant || '', unitPrice: p?.unitCost ? String(p.unitCost) : form.unitPrice })
  }

  const handleSubmit = async () => {
    if (!form.merchantId || !form.productId || !form.qtyIn || !form.receivedBy) { toast.error('Please fill all required fields'); return }
    setSubmitting(true)
    try {
      const qtyIn = parseInt(form.qtyIn)
      const unitPrice = form.unitPrice ? parseFloat(form.unitPrice) : null
      const inboundValue = unitPrice ? qtyIn * unitPrice : null
      const fullName = [form.brand, form.productName, form.variant].filter(Boolean).join(' ')
      const payload = { ...form, qtyIn, unitPrice, inboundValue, productName: fullName, status: 'received' }
      const res = await fetch('/api/inbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        toast.success(`Inventory received successfully, ${qtyIn} units (IN record created)`)
        setView('list'); resetForm(); fetchData()
      } else if (res.status === 409) {
        const err = await res.json().catch(() => ({}))
        if (err.code === 'MERCHANT_ON_HOLD') {
          toast.error(`${err.merchantName || 'Merchant'} is on hold`, {
            description: `Reason: ${err.reason || 'Overdue balance / dispute'}`,
            duration: 8000,
            action: onNavigate ? { label: 'Release Hold', onClick: () => onNavigate('merchants') } : undefined,
          })
        } else {
          toast.error(err.error || 'Failed to create inbound')
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to create inbound')
      }
    } catch { toast.error('Failed to submit. Please try again.') } finally { setSubmitting(false) }
  }

  const resetForm = () => {
    setForm({ merchantId: '', merchantName: '', vendorId: '', productId: '', productName: '', brand: '', variant: '', qtyIn: '', unitPrice: '', expiryDate: '', receivedBy: '', storedBy: '', storageLocation: '', userComment: '' })
    setProducts([])
  }

  const handleDeleteRecord = async (id: string) => {
    try {
      await fetch(`/api/inbound?id=${id}`, { method: 'DELETE' })
      toast.success('Record deleted'); setDetailOpen(false); setSelectedRecord(null); fetchData()
    } catch { toast.error('Failed to delete') }
  }

  // Workflow transition (Phase 1-2-4)
  const handleTransition = async (record: InboundRecord, toStatus: string) => {
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: MODULE, id: record.id, toStatus, performedBy: 'admin' }),
      })
      if (res.ok) {
        const stage = getStage(MODULE, toStatus)
        toast.success(`${stage?.label || toStatus} ✓`)
        fetchData()
        if (selectedRecord?.id === record.id) {
          setSelectedRecord({ ...selectedRecord, status: toStatus })
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ── KPI ──
  const totalValue = data.reduce((s, r) => s + (r.inboundValue || 0), 0)
  const thisMonth = data.filter(r => { const d = new Date(r.createdAt); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }).length
  const pendingCount = data.filter(r => r.status === 'partial').length

  const stats = [
    { label: 'Total Receipts', value: data.length, icon: Inbox, color: '#22C55E', bg: 'bg-green-500/15', border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'This Month', value: thisMonth, icon: BarChart3, color: '#FF6B35', bg: 'bg-orange-500/15', border: 'border-orange-500/20', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Pending', value: pendingCount, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/15', border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Total Value', value: `UGX ${fmt(totalValue)}`, icon: DollarSign, color: '#8B5CF6', bg: 'bg-purple-500/15', border: 'border-purple-500/20', gradient: 'from-purple-500/10 to-purple-500/5' },
  ]

  // ── Filter Chips ──
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    filterVendor.forEach(v => { chips.push({ key: `vendor-${v}`, label: `Vendor: ${v}`, onRemove: () => setFilterVendor(prev => prev.filter(pv => pv !== v)) }) })
    if (filterStatus) { const statusLabel = INBOUND_STATUSES.find(s => s.key === filterStatus)?.label || filterStatus; chips.push({ key: 'status', label: `Status: ${statusLabel}`, onRemove: () => setFilterStatus(null) }) }
    if (filterDateRange) {
      const fmtShort = (d: string) => { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
      let dateLabel = ''; if (filterDateRange.from && filterDateRange.to) { dateLabel = `${fmtShort(filterDateRange.from)} – ${fmtShort(filterDateRange.to)}` } else if (filterDateRange.from) { dateLabel = `from ${fmtShort(filterDateRange.from)}` } else if (filterDateRange.to) { dateLabel = `until ${fmtShort(filterDateRange.to)}` }
      if (dateLabel) chips.push({ key: 'date', label: `Date: ${dateLabel}`, onRemove: () => setFilterDateRange(null) })
    }
    return chips
  }, [filterVendor, filterStatus, filterDateRange])

  const allOnPageSelected = paginatedData.length > 0 && paginatedData.every(r => selectedIds.has(r.id))
  const someOnPageSelected = paginatedData.some(r => selectedIds.has(r.id)) && !allOnPageSelected

  const tableColumns: Column<InboundRecord>[] = useMemo(() => [
    { key: 'inboundId', label: 'Ref #', sortable: true, className: 'font-mono text-xs text-gray-400' },
    { key: 'productName', label: 'Product', sortable: true, className: 'font-semibold text-gray-900 max-w-[200px] truncate' },
    { key: 'merchantName', label: 'Supplier', sortable: true, render: (_v, row) => <span className="flex items-center gap-1"><Building2 size={12} className="text-gray-400 shrink-0" />{String(row.merchantName)}</span> },
    { key: 'qtyIn', label: 'Qty', sortable: true, className: 'tabular-nums font-bold text-gray-800', render: (val) => (val as number).toLocaleString() },
    { key: 'unitPrice', label: 'Unit Price', sortable: true, className: 'tabular-nums', render: (val) => val ? `UGX ${fmt(val as number)}` : '—' },
    { key: 'inboundValue', label: 'Value', sortable: true, className: 'tabular-nums font-semibold', render: (val) => val ? `UGX ${fmt(val as number)}` : '—' },
    { key: 'storageLocation', label: 'Location', sortable: true, render: (val) => val ? <span className="bg-[#1B2A4A]/5 text-[#1B2A4A] px-2 py-0.5 rounded-md text-xs font-medium inline-flex items-center gap-1"><MapPin size={10} />{String(val)}</span> : <span className="text-gray-300">—</span> },
    { key: 'expiryDate', label: 'Expiry', sortable: true, className: 'text-xs', render: (val) => { if (!val) return <span className="text-gray-300">—</span>; const s = getExpiryStatus(val as string); return s ? <span className={`px-1.5 py-0.5 rounded-md font-medium ${s.color}`}>{s.label}</span> : <span>{String(val)}</span> } },
    { key: 'status', label: 'Status', sortable: true, render: (val) => statusBadge(String(val)) },
    { key: 'createdAt', label: 'Date', sortable: true, className: 'text-xs text-gray-500' },
  ], [])

  // ════════════════════════════════════════
  // ── RENDER: FULL-PAGE RECEIVE INVENTORY ──
  // ════════════════════════════════════════
  if (view === 'add') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="add">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900">Receive Inventory</h1>
                  <p className="text-[11px] text-gray-500">New inbound record · Stock enters the warehouse here</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                {/* Merchant */}
                <div>
                  <Label className="text-xs font-medium text-gray-600">Merchant / Supplier *</Label>
                  <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                    <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder="Select merchant" /></SelectTrigger>
                    <SelectContent>
                      {merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Product */}
                <div>
                  <Label className="text-xs font-medium text-gray-600">Product *</Label>
                  <Select value={form.productId} onValueChange={handleProductSelect} disabled={!form.merchantId}>
                    <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder={form.merchantId ? 'Select product' : 'Select merchant first'} /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel} {p.brand ? `(${p.brand})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Quantity & Price */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Quantity *</Label>
                    <Input type="number" value={form.qtyIn} onChange={e => setForm({ ...form, qtyIn: e.target.value })} placeholder="0" className="mt-1.5 rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Unit Price</Label>
                    <Input type="number" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" className="mt-1.5 rounded-xl" />
                  </div>
                </div>
                {form.qtyIn && form.unitPrice && (
                  <div className="bg-green-50 rounded-lg border border-green-100 p-3">
                    <p className="text-xs text-gray-500">Total Inbound Value</p>
                    <p className="text-lg font-bold text-green-700">UGX {(parseInt(form.qtyIn) * parseFloat(form.unitPrice)).toLocaleString()}</p>
                  </div>
                )}
                {/* Expiry Date */}
                <div>
                  <Label className="text-xs font-medium text-gray-600">Expiry Date</Label>
                  <Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className="mt-1.5 rounded-xl" />
                </div>
                {/* Storage Location */}
                <div>
                  <Label className="text-xs font-medium text-gray-600">Storage Location</Label>
                  <div className="grid grid-cols-3 gap-3 mt-1.5">
                    <Select value={form.storageLocation ? form.storageLocation.split('-')[0] : ''} onValueChange={v => setForm({ ...form, storageLocation: v ? `${v}-${form.storageLocation?.split('-')[1] || ''}-${form.storageLocation?.split('-')[2] || ''}` : '' })}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Zone" /></SelectTrigger>
                      <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={form.storageLocation ? form.storageLocation.split('-')[1] || '' : ''} onValueChange={v => setForm({ ...form, storageLocation: `${form.storageLocation?.split('-')[0] || ''}-${v}-${form.storageLocation?.split('-')[2] || ''}` })}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Level" /></SelectTrigger>
                      <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={form.storageLocation ? form.storageLocation.split('-')[2] || '' : ''} onValueChange={v => setForm({ ...form, storageLocation: `${form.storageLocation?.split('-')[0] || ''}-${form.storageLocation?.split('-')[1] || ''}-${v}` })}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Pallet" /></SelectTrigger>
                      <SelectContent>{PALLETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {form.storageLocation && form.storageLocation.split('-').filter(Boolean).length === 3 && (
                    <p className="text-xs text-[#1B2A4A] font-medium mt-1.5 flex items-center gap-1"><MapPin size={12} />Location: {form.storageLocation}</p>
                  )}
                </div>
                {/* Received By & Stored By */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Received By *</Label>
                    <Input value={form.receivedBy} onChange={e => setForm({ ...form, receivedBy: e.target.value })} placeholder="Name" className="mt-1.5 rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Stored By</Label>
                    <Input value={form.storedBy} onChange={e => setForm({ ...form, storedBy: e.target.value })} placeholder="Name" className="mt-1.5 rounded-xl" />
                  </div>
                </div>
                {/* Comment */}
                <div>
                  <Label className="text-xs font-medium text-gray-600">Comment</Label>
                  <Textarea value={form.userComment} onChange={e => setForm({ ...form, userComment: e.target.value })} placeholder="Optional notes..." className="mt-1.5 rounded-xl" rows={3} />
                </div>
              </div>
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl flex items-center gap-1.5" onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? 'Submitting...' : 'Receive Inventory'}
                </Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ════════════════════════════════════════
  // ── RENDER: FULL-PAGE ALL INBOUND ──
  // ════════════════════════════════════════
  if (view === 'table') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="table">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><Layers size={16} className="text-[#FF6B35]" /> All Inbound</h1>
                  <p className="text-[11px] text-gray-500">{data.length} records · Click any row for details</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto space-y-3">
                {/* Filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter size={14} className="text-gray-400" />
                  <button onClick={() => handleFilterStatusChange(null)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!filterStatus ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    All
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${!filterStatus ? 'bg-white/20' : 'bg-gray-100'}`}>{data.length}</span>
                  </button>
                  {INBOUND_STATUSES.map(s => {
                    const isActive = filterStatus === s.key
                    const count = statusCounts[s.key] || 0
                    return (
                      <button key={s.key} onClick={() => handleFilterStatusChange(isActive ? null : s.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
                      </button>
                    )
                  })}
                  {vendors.length > 0 && (
                    <select value={filterVendor[0] || ''} onChange={e => handleFilterVendorChange(e.target.value || null)}
                      className="ml-auto px-2 py-1.5 rounded-md text-xs border border-gray-200 text-gray-600 bg-white">
                      <option value="">All Vendors</option>
                      {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                </div>
                {/* Table */}
                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
                ) : paginatedData.length === 0 ? (
                  <div className="text-center py-20 text-gray-400"><Package size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm font-medium">No inbound records found</p></div>
                ) : (
                  <DataTable
                    data={paginatedData}
                    columns={tableColumns}
                    keyExtractor={(r) => r.id}
                    onRowClick={(r) => { setSelectedRecord(r); setDetailOpen(true) }}
                    pageSize={25}
                  />
                )}
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ════════════════════════════════════════
  // ── RENDER: OVERVIEW ──
  // ════════════════════════════════════════
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Inbound"
            description="Receive and manage incoming inventory"
            kpiCells={[
              { label: 'TOTAL', value: data.length },
              { label: 'RECEIVED', value: data.filter(r => r.status === 'received').length },
              { label: 'PUT AWAY', value: data.filter(r => r.status === 'put_away').length },
              { label: 'STORED', value: data.filter(r => r.status === 'stored').length },
              { label: 'UNITS', value: data.reduce((s, r) => s + r.qtyIn, 0) },
            ]}
            searchValue={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Search inbound records..."
          />

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={() => { resetForm(); setView('add') }}>
              <ArrowDownRight size={12} className="mr-1" /> Receive Inventory
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setView('table')} disabled={data.length === 0}>
              <Layers size={12} className="mr-1" /> View All
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={12} className="mr-1" /> Help
            </Button>
          </div>

          {/* Empty state */}
          {data.length === 0 && !loading && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <ArrowDownRight size={28} className="text-orange-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No inbound records</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                Receive inventory from merchants to start tracking stock. Each record creates individual item barcodes for per-unit tracking.
              </p>
              <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={() => { resetForm(); setView('add') }}>
                <ArrowDownRight size={14} className="mr-1.5" /> Receive Inventory
              </Button>
            </div>
          )}

          {/* Search results (inline) */}
          {search && data.length > 0 && !loading && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {data.slice(0, 10).map(r => (
                  <div key={r.id} onClick={() => { setSelectedRecord(r); setDetailOpen(true) }} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${INBOUND_STATUSES.find(s => s.key === r.status)?.dot || 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900">{r.productName}</span>
                      <span className="text-[10px] text-gray-400 ml-2">{r.inboundId}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">{r.merchantName}</span>
                    <span className="text-[11px] font-mono font-bold shrink-0 text-gray-900">{r.qtyIn}</span>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </div>
                ))}
                {data.length > 10 && (
                  <button onClick={() => setView('table')} className="w-full px-4 py-2 text-center text-[11px] text-[#FF6B35] font-semibold hover:bg-orange-50">
                    View all {data.length} records →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#FF6B35] animate-spin" /></div>}

          {/* ── Detail SlideOver ── */}
          <DetailSlideOver
            open={detailOpen}
            onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
            title={selectedRecord?.productName || 'Record Details'}
            subtitle={selectedRecord?.inboundId}
            width="lg"
            footer={selectedRecord ? (
              <div className="flex items-center justify-between">
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"><Trash2 size={14} className="mr-1.5" />Delete</Button></AlertDialogTrigger>
                  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteRecord(selectedRecord.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); setSelectedRecord(null) }} className="rounded-xl ml-auto">Close</Button>
              </div>
            ) : undefined}
          >
            {selectedRecord && (
              <div className="space-y-3">
                {/* Status + Date */}
                <div className="flex items-center justify-between">
              <div>{statusBadge(selectedRecord.status)}</div>
              <div className="text-xs text-gray-400">{new Date(selectedRecord.createdAt).toLocaleDateString('en-UG', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            </div>

            {/* Merchant */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><Building2 size={10} /> Merchant</p>
              <p className="text-sm font-medium text-gray-900">{selectedRecord.merchantName}</p>
              <p className="text-xs text-gray-500 font-mono">{selectedRecord.merchantId}</p>
            </div>

            {/* Product */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Product</p>
              <p className="text-sm font-medium text-gray-900">{selectedRecord.productName}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><span className="text-gray-400">Product ID:</span> <span className="font-mono text-gray-600">{selectedRecord.productId}</span></div>
                {selectedRecord.brand && <div><span className="text-gray-400">Brand:</span> <span className="text-gray-600">{selectedRecord.brand}</span></div>}
                {selectedRecord.variant && <div><span className="text-gray-400">Variant:</span> <span className="text-gray-600">{selectedRecord.variant}</span></div>}
              </div>
            </div>

            {/* Quantity + Value */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Qty</p>
                <p className="text-lg font-bold text-gray-900 font-mono">{selectedRecord.qtyIn.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Unit Price</p>
                <p className="text-lg font-bold text-gray-900 font-mono">{selectedRecord.unitPrice ? fmt(selectedRecord.unitPrice) : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Total</p>
                <p className="text-lg font-bold text-gray-900 font-mono">{selectedRecord.inboundValue ? fmt(selectedRecord.inboundValue) : '—'}</p>
              </div>
            </div>

            {/* Storage + Expiry */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1 flex items-center gap-1"><MapPin size={10} /> Storage</p>
                <p className="text-sm font-medium text-gray-900">{selectedRecord.storageLocation || 'Not assigned'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Expiry</p>
                {selectedRecord.expiryDate ? (() => {
                  const expiry = getExpiryStatus(selectedRecord.expiryDate)
                  return (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedRecord.expiryDate}</p>
                      {expiry && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${expiry.color}`}>{expiry.label}</span>}
                    </div>
                  )
                })() : <p className="text-sm text-gray-400">No expiry</p>}
              </div>
            </div>

            {/* People */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1 flex items-center gap-1"><User size={10} /> Received By</p>
                <p className="text-sm font-medium text-gray-900">{selectedRecord.receivedBy}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Stored By</p>
                <p className="text-sm font-medium text-gray-900">{selectedRecord.storedBy || 'Not assigned'}</p>
              </div>
            </div>

            {/* Comment */}
            {selectedRecord.userComment && (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Comment</p>
                <p className="text-sm text-gray-700">{selectedRecord.userComment}</p>
              </div>
            )}
          </div>
        )}
      </DetailSlideOver>

          {/* Help dialog */}
          <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
            <AlertDialogContent className="rounded-2xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Inbound</AlertDialogTitle>
                <AlertDialogDescription>
                  Receive stock from merchants into the warehouse. Each inbound record creates individual item barcodes for per-unit tracking and updates stock levels automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Receive Inventory</p>
                  <p>Opens a full-page form. Select merchant, then product (cascading), enter quantity and unit price. The system creates the inbound record, updates stock, and generates a barcode for each unit.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">View All</p>
                  <p>Opens a full-page table with all inbound records, filterable by status (Received, Put Away, Stored) and vendor. Click any row for details.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Storage Location</p>
                  <p>Three-part location: Zone (A-D), Level (1-4), Pallet (P1-P10). Helps warehouse staff find stock quickly during picking.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Profile</p>
                  <p>Click any row to see full details: status workflow, product info, quantities, pricing, storage location, and who received/stored it.</p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
