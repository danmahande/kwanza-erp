'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Search, Pencil, Trash2, Package, AlertTriangle,
  BarChart3, Filter, X, Upload, CheckSquare, Square,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
  Loader2, Building2, SlidersHorizontal, Warehouse,
  ArrowDownRight, ArrowUpRight, RotateCcw, TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import ViewToggle from '@/components/shared/ViewToggle'
import DataTable, { type Column } from '@/components/shared/DataTable'

// ── Types ──
interface Merchant { id: string; merchantId: string; businessName: string }

interface Product {
  id: string; productId: string; productLabel: string; brand: string | null
  variant: string | null; category: string; merchantId: string; merchantName: string
  unit: string; weight: string | null; minStock: number; unitCost: number
  unitSellingPrice: number; commissionPercent: number; currentStock: number
  isActive: boolean; createdAt: string; inQty: number; outQty: number
  shrinkQty: number; rtvQty: number; computedCurrentQty: number; currentStockValue: number
}

// ── Constants ──
const PAGE_SIZES = [25, 50, 100, 200]

const STOCK_STATUSES = [
  { key: 'in-stock', label: 'In Stock', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  { key: 'low-stock', label: 'Low Stock', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'out-of-stock', label: 'Out of Stock', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600' },
  { key: 'negative', label: 'Negative', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
]

// ── Helpers ──
const fmt = (n: number) => {
  if (n == null || isNaN(n)) return '0'
  if (n === 0) return '0'
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
const safe = (n: number) => (n ?? 0)

const stockStatus = (p: Product) => {
  const q = safe(p.computedCurrentQty)
  if (q < 0) return { label: 'Negative', bg: 'bg-red-100 text-red-700', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 hover:bg-red-100' }
  if (q === 0) return { label: 'Out of Stock', bg: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600 hover:bg-gray-100' }
  if (q <= p.minStock) return { label: 'Low Stock', bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 hover:bg-amber-100' }
  return { label: 'In Stock', bg: 'bg-green-100 text-green-700', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 hover:bg-green-100' }
}

const stockBarColor = (qty: number, minStock: number) => {
  if (qty < 0) return 'bg-red-400'
  if (qty === 0) return 'bg-gray-300'
  if (qty <= minStock) return 'bg-amber-400'
  return 'bg-emerald-400'
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
  label: string; options: string[]; selected: string | string[] | null
  onSelect: (v: string | string[] | null) => void
  counts?: Record<string, number>; multi?: boolean
}) {
  const [query, setQuery] = useState('')
  const isArray = Array.isArray(selected)
  const selectedArr = isArray ? selected as string[] : selected ? [selected] : []
  const isActive = multi ? selectedArr.length > 0 : !!selected
  const btnLabel = multi
    ? (selectedArr.length === 1 ? selectedArr[0] : selectedArr.length > 1 ? `${selectedArr.length} selected` : 'All')
    : (selected || 'All')
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options
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

function NumericRangeFilter({ label, value, onChange, presets }: {
  label: string
  value: { min: number | null; max: number | null } | null
  onChange: (range: { min: number | null; max: number | null } | null) => void
  presets?: Array<{ label: string; min: number | null; max: number | null }>
}) {
  const [minInput, setMinInput] = useState('')
  const [maxInput, setMaxInput] = useState('')
  const fmtLabel = () => {
    if (!value) return 'All'
    if (value.min != null && value.max != null) return `${value.min.toLocaleString()}–${value.max.toLocaleString()}`
    if (value.min != null) return `> ${value.min.toLocaleString()}`
    if (value.max != null) return `< ${value.max.toLocaleString()}`
    return 'All'
  }
  const isActive = value !== null
  const isPresetActive = (p: { min: number | null; max: number | null }) => {
    if (!value) return false
    return value.min === p.min && value.max === p.max
  }
  const handlePresetClick = (p: { min: number | null; max: number | null }) => {
    if (isPresetActive(p)) { onChange(null); setMinInput(''); setMaxInput('') } else { onChange(p); setMinInput(p.min != null ? String(p.min) : ''); setMaxInput(p.max != null ? String(p.max) : '') }
  }
  const handleApplyCustom = () => {
    const min = minInput ? Number(minInput) : null
    const max = maxInput ? Number(maxInput) : null
    if (min === null && max === null) { onChange(null); return }
    onChange({ min, max })
  }
  const handleClear = () => { onChange(null); setMinInput(''); setMaxInput('') }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${isActive ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">{label}:</span>
          <span className="max-w-[100px] truncate">{fmtLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {presets && presets.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Quick Presets</p>
            <div className="flex flex-wrap gap-1">
              {presets.map((p, i) => (
                <button key={i} onClick={() => handlePresetClick(p)}
                  className={`text-[10px] px-2 py-1 rounded-full transition-colors ${isPresetActive(p) ? 'bg-[#FF6B35]/10 text-[#FF6B35] border border-[#FF6B35]/20' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Custom Range</p>
          <div className="flex items-center gap-2">
            <Input placeholder="Min" value={minInput} onChange={e => setMinInput(e.target.value)} type="number" className="h-7 text-xs w-full" />
            <span className="text-gray-300 text-xs shrink-0">–</span>
            <Input placeholder="Max" value={maxInput} onChange={e => setMaxInput(e.target.value)} type="number" className="h-7 text-xs w-full" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="flex-1 h-7 text-xs bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg" onClick={handleApplyCustom}>Apply</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={handleClear}>Clear</Button>
          </div>
        </div>
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

function statusBadge(status: ReturnType<typeof stockStatus>) {
  return <Badge className={`${status.badge} text-xs font-medium`}>{status.label}</Badge>
}

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function InventoryModule() {
  // ── Data State ──
  const [data, setData] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Pagination ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Filters ──
  const [filterVendor, setFilterVendor] = useState<string[]>([])
  const [filterCategory, setFilterCategory] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterQtyRange, setFilterQtyRange] = useState<{ min: number | null; max: number | null } | null>(null)
  const [filterValueRange, setFilterValueRange] = useState<{ min: number | null; max: number | null } | null>(null)

  // ── SlideOver ──
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<Product | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    productLabel: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
    unit: 'PCs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '11', currentStock: '0',
  })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

  // ── View Mode ──
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

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

  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/products?search=${search}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false); toast.error('Failed to load products') } })
    return () => { cancelled = true }
  }, [search, refreshKey])

  const refreshData = useCallback(() => { setRefreshKey(k => k + 1) }, [])

  // Reset page on filter changes
  useEffect(() => { setPage(1) }, [search, filterVendor, filterCategory, filterStatus, filterQtyRange, filterValueRange, pageSize])

  // ── Handlers ──
  const handleSearchChange = useCallback((value: string) => { setSearch(value); setLoading(true); setPage(1) }, [])
  const handleFilterVendorChange = useCallback((value: string | string[] | null) => { setFilterVendor(Array.isArray(value) ? value : value ? [value] : []); setPage(1) }, [])
  const handleFilterCategoryChange = useCallback((value: string | string[] | null) => { setFilterCategory(Array.isArray(value) ? value : value ? [value] : []); setPage(1) }, [])
  const handleFilterStatusChange = useCallback((value: string | null) => { setFilterStatus(value); setPage(1) }, [])
  const handleClearFilters = useCallback(() => { setFilterVendor([]); setFilterCategory([]); setFilterStatus(null); setFilterQtyRange(null); setFilterValueRange(null); setPage(1) }, [])
  const handlePageSizeChange = useCallback((size: number) => { setPageSize(size); setPage(1) }, [])

  // ── Derived Data ──
  const vendors = useMemo(() => [...new Set(data.map(p => p.merchantName))].sort(), [data])
  const categories = useMemo(() => [...new Set(data.map(p => p.category))].sort(), [data])
  const vendorCounts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(p => { c[p.merchantName] = (c[p.merchantName] || 0) + 1 }); return c }, [data])
  const categoryCounts = useMemo(() => { const c: Record<string, number> = {}; data.forEach(p => { c[p.category] = (c[p.category] || 0) + 1 }); return c }, [data])
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { 'in-stock': 0, 'low-stock': 0, 'out-of-stock': 0, negative: 0 }
    data.forEach(p => {
      const s = stockStatus(p)
      if (s.label === 'In Stock') { c['in-stock']++ }
      else if (s.label === 'Low Stock') { c['low-stock']++ }
      else if (s.label === 'Out of Stock') { c['out-of-stock']++ }
      else if (s.label === 'Negative') { c.negative++ }
    })
    return c
  }, [data])

  const filteredData = useMemo(() => {
    return data.filter(p => {
      if (filterVendor.length > 0 && !filterVendor.includes(p.merchantName)) return false
      if (filterCategory.length > 0 && !filterCategory.includes(p.category)) return false
      if (filterStatus) {
        const q = safe(p.computedCurrentQty)
        if (filterStatus === 'in-stock' && q <= p.minStock) return false
        if (filterStatus === 'low-stock' && (q > p.minStock || q <= 0)) return false
        if (filterStatus === 'out-of-stock' && q > 0) return false
        if (filterStatus === 'negative' && q >= 0) return false
      }
      if (filterQtyRange) {
        const q = safe(p.computedCurrentQty)
        if (filterQtyRange.min != null && q < filterQtyRange.min) return false
        if (filterQtyRange.max != null && q > filterQtyRange.max) return false
      }
      if (filterValueRange) {
        const v = safe(p.currentStockValue)
        if (filterValueRange.min != null && v < filterValueRange.min) return false
        if (filterValueRange.max != null && v > filterValueRange.max) return false
      }
      return true
    })
  }, [data, filterVendor, filterCategory, filterStatus, filterQtyRange, filterValueRange])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => a.productLabel.localeCompare(b.productLabel))
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
    const selected = data.filter(p => selectedIds.has(p.id)); if (selected.length === 0) return
    exportCSV('inventory-export.csv', ['Product ID', 'Product Label', 'Category', 'Vendor', 'Unit', 'Qty', 'Unit Cost', 'Selling Price', 'Status'],
      selected.map(p => [p.productId, p.productLabel, p.category, p.merchantName, p.unit, safe(p.computedCurrentQty), p.unitCost, p.unitSellingPrice, stockStatus(p).label]))
    toast.success(`Exported ${selected.length} records`)
  }, [data, selectedIds])

  const handleExportAll = useCallback(() => {
    if (filteredData.length === 0) return
    exportCSV('inventory-export.csv', ['Product ID', 'Product Label', 'Category', 'Vendor', 'Unit', 'Qty', 'Unit Cost', 'Selling Price', 'Status'],
      filteredData.map(p => [p.productId, p.productLabel, p.category, p.merchantName, p.unit, safe(p.computedCurrentQty), p.unitCost, p.unitSellingPrice, stockStatus(p).label]))
    toast.success(`Exported ${filteredData.length} records`)
  }, [filteredData])

  // ── Batch Delete ──
  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size; if (count === 0) return
    let deleted = 0
    for (const id of selectedIds) {
      try { await fetch(`/api/products?id=${id}`, { method: 'DELETE' }); deleted++ } catch { /* skip */ }
    }
    toast.success(`Deleted ${deleted} of ${count} products`); setSelectedIds(new Set()); refreshData()
  }, [selectedIds, refreshData])

  // ── Form Handlers ──
  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '' })
  }

  const resetForm = () => {
    setForm({ productLabel: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '', unit: 'PCs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '11', currentStock: '0' })
    setEditing(null)
  }

  const handleSubmit = async () => {
    if (!form.productLabel || !form.category || !form.merchantId || !form.unitCost || !form.unitSellingPrice) {
      toast.error('Please fill all required fields'); return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form, unitCost: parseFloat(form.unitCost), unitSellingPrice: parseFloat(form.unitSellingPrice),
        commissionPercent: parseFloat(form.commissionPercent), minStock: parseInt(form.minStock),
        currentStock: parseInt(form.currentStock), brand: form.brand || null, variant: form.variant || null,
        weight: form.weight || null, isActive: true,
      }
      if (editing) {
        await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Product updated')
      } else {
        await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('Product created')
      }
      setOpen(false); resetForm(); refreshData()
    } catch { toast.error('Failed to submit. Please try again.') } finally { setSubmitting(false) }
  }

  const handleEdit = (item: Product) => {
    setEditing(item)
    setForm({
      productLabel: item.productLabel, brand: item.brand || '', variant: item.variant || '',
      category: item.category, merchantId: item.merchantId, merchantName: item.merchantName,
      unit: item.unit, weight: item.weight || '', minStock: String(item.minStock),
      unitCost: String(item.unitCost), unitSellingPrice: String(item.unitSellingPrice),
      commissionPercent: String(item.commissionPercent), currentStock: String(item.currentStock),
    })
    setDetailOpen(false)
    setOpen(true)
  }

  const handleDeleteRecord = async (id: string) => {
    try {
      await fetch(`/api/products?id=${id}`, { method: 'DELETE' })
      toast.success('Product deleted'); setDetailOpen(false); setSelectedRecord(null); refreshData()
    } catch { toast.error('Failed to delete') }
  }

  // ── CSV Import ──
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setImportText(ev.target?.result as string); setImportOpen(true) }
    reader.readAsText(file)
    e.target.value = ''
  }

  const parseAndImport = async () => {
    const lines = importText.trim().split('\n')
    if (lines.length < 2) { toast.error('No data rows found'); return }
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase())
    let imported = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t').map(c => c.trim())
      if (cols.length < 5) continue
      const getCol = (keywords: string[]) => { const idx = headers.findIndex(h => keywords.some(k => h.includes(k))); return idx >= 0 ? cols[idx] : '' }
      const productLabel = getCol(['product label', 'product', 'label', 'name'])
      const category = getCol(['category', 'cat'])
      const merchantName = getCol(['business name', 'business', 'vendor'])
      const unit = getCol(['unit']) || 'PCs'
      const weight = getCol(['weight'])
      const minStock = getCol(['min-stock', 'minstock', 'min stock', 'min'])
      const unitCost = getCol(['unit cost', 'cogp', 'cost'])
      const unitSellingPrice = getCol(['unit selling price', 'selling price', 'price', 'selling'])
      const commission = getCol(['commission', 'comm'])
      const active = getCol(['active']) || 'TRUE'
      if (!productLabel || !unitCost || !unitSellingPrice) continue
      const existing = data.find(p => p.productLabel.toLowerCase() === productLabel.toLowerCase())
      const payload = {
        productLabel, brand: null, variant: null, category: category || 'General',
        merchantId: existing?.merchantId || 'IMPORT', merchantName: merchantName || 'Imported',
        unit, weight: weight || null, minStock: parseInt(minStock) || 10,
        unitCost: parseFloat(String(unitCost).replace(/,/g, '')) || 0,
        unitSellingPrice: parseFloat(String(unitSellingPrice).replace(/,/g, '')) || 0,
        commissionPercent: parseFloat(commission) || 0, currentStock: existing?.currentStock || 0,
        isActive: active.toUpperCase() === 'TRUE',
      }
      if (existing) {
        await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existing.id, ...payload }) })
      } else {
        await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      imported++
    }
    toast.success(`Imported ${imported} products`)
    setImportOpen(false); setImportText(''); refreshData()
  }

  // ── KPI ──
  const totalStockValue = data.reduce((s, p) => s + safe(p.currentStockValue), 0)
  const lowStockCount = data.filter(p => safe(p.computedCurrentQty) <= p.minStock && safe(p.computedCurrentQty) > 0).length
  const outOfStockCount = data.filter(p => safe(p.computedCurrentQty) <= 0).length

  const stats = [
    { label: 'Total Products', value: data.length, icon: Package, color: '#1B2A4A', bg: 'bg-slate-500/15', border: 'border-slate-500/20', gradient: 'from-slate-500/10 to-slate-500/5' },
    { label: 'Total Value', value: `UGX ${fmt(totalStockValue)}`, icon: BarChart3, color: '#22C55E', bg: 'bg-green-500/15', border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Low Stock', value: lowStockCount, icon: AlertTriangle, color: '#F59E0B', bg: 'bg-amber-500/15', border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Out of Stock', value: outOfStockCount, icon: Warehouse, color: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/20', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  // ── Range presets ──
  const qtyPresets = [
    { label: '< 0', min: null, max: 0 },
    { label: '1–10', min: 1, max: 10 },
    { label: '11–50', min: 11, max: 50 },
    { label: '50–100', min: 50, max: 100 },
    { label: '100+', min: 100, max: null },
  ]
  const valuePresets = [
    { label: '< 1K', min: null, max: 1000 },
    { label: '1K–10K', min: 1000, max: 10000 },
    { label: '10K–50K', min: 10000, max: 50000 },
    { label: '50K–100K', min: 50000, max: 100000 },
    { label: '100K+', min: 100000, max: null },
  ]

  // ── Filter Chips ──
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    filterCategory.forEach(v => { chips.push({ key: `cat-${v}`, label: `Category: ${v}`, onRemove: () => setFilterCategory(prev => prev.filter(pv => pv !== v)) }) })
    filterVendor.forEach(v => { chips.push({ key: `vendor-${v}`, label: `Vendor: ${v}`, onRemove: () => setFilterVendor(prev => prev.filter(pv => pv !== v)) }) })
    if (filterStatus) { const statusLabel = STOCK_STATUSES.find(s => s.key === filterStatus)?.label || filterStatus; chips.push({ key: 'status', label: `Status: ${statusLabel}`, onRemove: () => setFilterStatus(null) }) }
    if (filterQtyRange) {
      const ql = filterQtyRange.min != null && filterQtyRange.max != null ? `${filterQtyRange.min}–${filterQtyRange.max}` : filterQtyRange.min != null ? `> ${filterQtyRange.min}` : filterQtyRange.max != null ? `< ${filterQtyRange.max}` : ''
      chips.push({ key: 'qty-range', label: `Qty: ${ql}`, onRemove: () => setFilterQtyRange(null) })
    }
    if (filterValueRange) {
      const vl = filterValueRange.min != null && filterValueRange.max != null ? `${filterValueRange.min.toLocaleString()}–${filterValueRange.max.toLocaleString()}` : filterValueRange.min != null ? `> ${filterValueRange.min.toLocaleString()}` : filterValueRange.max != null ? `< ${filterValueRange.max.toLocaleString()}` : ''
      chips.push({ key: 'value-range', label: `Value: ${vl}`, onRemove: () => setFilterValueRange(null) })
    }
    return chips
  }, [filterVendor, filterCategory, filterStatus, filterQtyRange, filterValueRange])

  const allOnPageSelected = paginatedData.length > 0 && paginatedData.every(p => selectedIds.has(p.id))
  const someOnPageSelected = paginatedData.some(p => selectedIds.has(p.id)) && !allOnPageSelected

  // ABC classification: rank products by stock value, top 20% = A, next 30% = B, rest = C
  const abcClass = useMemo(() => {
    const sorted = [...data].sort((a, b) => safe(b.currentStockValue) - safe(a.currentStockValue))
    const total = sorted.length
    const aCutoff = Math.max(1, Math.ceil(total * 0.2))
    const bCutoff = Math.max(aCutoff + 1, Math.ceil(total * 0.5))
    const map: Record<string, string> = {}
    sorted.forEach((p, i) => {
      map[p.id] = i < aCutoff ? 'A' : i < bCutoff ? 'B' : 'C'
    })
    return map
  }, [data])

  // Stock age: days since product was created
  const stockAge = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (days < 1) return '<1d'
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.floor(days / 30)}mo`
    return `${Math.floor(days / 365)}y`
  }

  const tableColumns: Column<Product>[] = useMemo(() => [
    { key: 'productId', label: 'ID', sortable: true, className: 'font-mono text-xs text-gray-400' },
    { key: 'productLabel', label: 'Product', sortable: true, className: 'font-semibold text-gray-900 max-w-[200px] truncate' },
    { key: 'brand', label: 'Brand', sortable: true, className: 'text-gray-500' },
    { key: 'category', label: 'Category', sortable: true, render: (val) => val ? <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-600 border-0">{String(val)}</Badge> : <span className="text-gray-300">—</span> },
    { key: 'merchantName', label: 'Merchant', sortable: true, className: 'text-gray-600', render: (_v, row) => <span className="flex items-center gap-1"><Building2 size={12} className="text-gray-400 shrink-0" />{String(row.merchantName)}</span> },
    { key: 'computedCurrentQty', label: 'Stock', sortable: true, className: 'tabular-nums font-bold', render: (val) => { const q = safe(val as number); return <span className={q < 0 ? 'text-red-600' : q === 0 ? 'text-gray-400' : 'text-[#1B2A4A]'}>{fmt(q)}</span> } },
    { key: 'unit', label: 'Unit', sortable: true, className: 'text-gray-500' },
    { key: 'unitSellingPrice', label: 'Price', sortable: true, className: 'tabular-nums', render: (val) => `UGX ${fmt(val as number)}` },
    { key: 'currentStockValue', label: 'Stock Value', sortable: true, className: 'tabular-nums font-semibold', render: (val) => { const v = val as number; return <span className={v < 0 ? 'text-red-600' : 'text-gray-800'}>UGX {fmt(v)}</span> } },
  ], [])

  // ════════════════════════════════════════
  // ── RENDER ──
  // ════════════════════════════════════════
  return (
    <div className="space-y-3">
      <OpsHeader
        title="Stock"
        description="What's on the shelves"
        kpiCells={[
          { label: 'STOCK VALUE', value: `UGX ${fmt(totalStockValue)}` },
          { label: 'LOW STOCK', value: lowStockCount, highlight: lowStockCount > 0, highlightColor: 'orange' as const },
          { label: 'OUT OF STOCK', value: outOfStockCount, highlight: outOfStockCount > 0, highlightColor: 'red' as const },
        ]}
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search products, vendors, IDs..."
      >
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Import
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleCSVUpload} className="hidden" />
        <Button variant="outline" size="sm" onClick={handleExportAll} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Export
        </Button>
      </OpsHeader>

      {/* Dense table with inline filters in header */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
      ) : paginatedData.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          <Package size={32} className="mx-auto mb-3 text-gray-300" />
          No products. Adjust filters or add products in the Products tab.
        </div>
      ) : (
        <DenseTable>
          <thead>
            {/* Row 1: column headers */}
            <tr>
              <DenseTh className="w-20">SKU</DenseTh>
              <DenseTh>Product</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-16 text-right">On Hand</DenseTh>
              <DenseTh className="w-16 text-right">In</DenseTh>
              <DenseTh className="w-16 text-right">Out</DenseTh>
              <DenseTh className="w-16 text-right">Min</DenseTh>
              <DenseTh className="w-20 text-center">Status</DenseTh>
              <DenseTh className="w-12 text-center">ABC</DenseTh>
              <DenseTh className="w-12 text-right">Age</DenseTh>
              <DenseTh className="w-24 text-right">Stock Value</DenseTh>
            </tr>
            {/* Row 2: inline filters */}
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <td colSpan={2} className="px-3 py-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: '', label: 'All' },
                    { key: 'in-stock', label: 'In Stock' },
                    { key: 'low-stock', label: 'Low' },
                    { key: 'out-of-stock', label: 'Out' },
                    { key: 'negative', label: 'Neg' },
                  ].map(chip => {
                    const count = chip.key === '' ? data.length : statusCounts[chip.key] || 0
                    const isActive = filterStatus === chip.key || (chip.key === '' && !filterStatus)
                    return (
                      <button key={chip.key || 'all'} onClick={() => handleFilterStatusChange(chip.key || null)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        {chip.label}
                        <span className={`px-1 rounded-full text-[9px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              </td>
              <td className="px-3 py-1.5">
                {vendors.length > 0 && (
                  <select value={filterVendor[0] || ''} onChange={e => handleFilterVendorChange(e.target.value || null)}
                    className="px-1.5 py-0.5 rounded-md text-[10px] border border-gray-200 text-gray-600 bg-white max-w-[100px]">
                    <option value="">All Vendors</option>
                    {vendors.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </td>
              <td colSpan={6}></td>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map(p => {
              const status = stockStatus(p)
              const qty = safe(p.computedCurrentQty)
              const inQty = safe(p.inQty)
              const outQty = safe(p.outQty)
              return (
                <DenseTr key={p.id} onClick={() => { setSelectedRecord(p); setDetailOpen(true) }}
                  tint={qty < 0 ? 'bg-red-50/30' : qty === 0 ? 'bg-gray-50/30' : qty <= p.minStock ? 'bg-orange-50/30' : ''}>
                  <DenseTd mono className="text-gray-400 text-[10px]">{p.productId}</DenseTd>
                  <DenseTd>
                    <p className="text-gray-900 font-medium text-xs truncate max-w-[200px]">{p.productLabel}</p>
                    {p.brand && <p className="text-[10px] text-gray-400">{p.brand}{p.variant ? `, ${p.variant}` : ''}</p>}
                  </DenseTd>
                  <DenseTd className="text-gray-600 text-[11px]">{p.merchantName}</DenseTd>
                  <DenseTd mono right className={qty < 0 ? 'text-red-600 font-bold' : qty === 0 ? 'text-gray-400' : 'text-gray-900 font-bold'}>
                    {fmt(qty)}
                  </DenseTd>
                  <DenseTd mono right className="text-blue-600 text-[11px]">{inQty > 0 ? `+${fmt(inQty)}` : '—'}</DenseTd>
                  <DenseTd mono right className="text-orange-600 text-[11px]">{outQty > 0 ? `-${fmt(outQty)}` : '—'}</DenseTd>
                  <DenseTd mono right className="text-gray-400">{p.minStock}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${status.dot}`} title={status.label} />
                  </DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${abcClass[p.id] === 'A' ? 'bg-red-100 text-red-700' : abcClass[p.id] === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`} title={`ABC Class ${abcClass[p.id] || 'C'}: ${abcClass[p.id] === 'A' ? 'Top 20% by value' : abcClass[p.id] === 'B' ? 'Next 30%' : 'Bottom 50%'}`}>{abcClass[p.id] || 'C'}</span>
                  </DenseTd>
                  <DenseTd mono right className="text-gray-400 text-[10px]">{stockAge(p.createdAt)}</DenseTd>
                  <DenseTd mono right className={p.currentStockValue < 0 ? 'text-red-600 font-bold' : 'text-gray-900 font-bold'}>
                    {fmt(safe(p.currentStockValue))}
                  </DenseTd>
                </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Pagination */}
      {sortedData.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedData.length)} of {sortedData.length}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-md" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            <span className="px-2 text-gray-600">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-md" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Detail slide-over */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title={selectedRecord?.productLabel || ''}
        subtitle={selectedRecord?.productId || ''}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => { setDetailOpen(false); setSelectedRecord(null) }} className="rounded-xl">Close</Button>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-3">
            {/* Product details */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Product Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Product ID</span>
                  <span className="font-mono text-gray-700">{selectedRecord.productId}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Product</span>
                  <span className="font-medium text-gray-900">{selectedRecord.productLabel}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Brand / Variant</span>
                  <span className="text-gray-700">{selectedRecord.brand || '—'}{selectedRecord.variant ? `, ${selectedRecord.variant}` : ''}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Category</span>
                  <span className="text-gray-700">{selectedRecord.category}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Merchant</span>
                  <span className="text-gray-900 font-medium">{selectedRecord.merchantName}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Unit / Weight</span>
                  <span className="text-gray-700">{selectedRecord.unit}{selectedRecord.weight ? `, ${selectedRecord.weight}` : ''}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Status</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusBadge(stockStatus(selectedRecord)).props.className || ''}`}>
                    <span className={`w-2 h-2 rounded-full ${stockStatus(selectedRecord).dot}`} />
                    {stockStatus(selectedRecord).label}
                  </span>
                </div>
              </div>
            </div>

            {/* Stock + pricing */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Stock & Pricing</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Current Stock</span>
                  <span className={`font-mono font-bold text-lg ${safe(selectedRecord.computedCurrentQty) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {fmt(safe(selectedRecord.computedCurrentQty))} <span className="text-[10px] text-gray-400">{selectedRecord.unit}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Min Stock Level</span>
                  <span className="font-mono text-gray-700">{selectedRecord.minStock} {selectedRecord.unit}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Stock Value</span>
                  <span className={`font-mono font-bold ${safe(selectedRecord.currentStockValue) < 0 ? 'text-red-600' : 'text-gray-900'}`}>UGX {fmt(safe(selectedRecord.currentStockValue))}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Unit Cost</span>
                  <span className="font-mono text-gray-700">UGX {fmt(selectedRecord.unitCost)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Selling Price</span>
                  <span className="font-mono text-gray-700">UGX {fmt(selectedRecord.unitSellingPrice)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Margin</span>
                  <span className={`font-mono font-bold ${(selectedRecord.unitSellingPrice - selectedRecord.unitCost) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    UGX {fmt(selectedRecord.unitSellingPrice - selectedRecord.unitCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Commission</span>
                  <span className="font-mono text-gray-700">{selectedRecord.commissionPercent}%</span>
                </div>
              </div>
            </div>

            {/* Movement summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Movement Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-1"><ArrowDownRight size={11} className="text-green-600" /> Received (In)</span>
                  <span className="font-mono font-bold text-green-700">{fmt(safe(selectedRecord.inQty))}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-1"><ArrowUpRight size={11} className="text-orange-600" /> Sent Out</span>
                  <span className="font-mono font-bold text-orange-700">{fmt(safe(selectedRecord.outQty))}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500 flex items-center gap-1"><TrendingDown size={11} className="text-red-500" /> Shrinkage</span>
                  <span className="font-mono font-bold text-red-600">{fmt(safe(selectedRecord.shrinkQty))}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500 flex items-center gap-1"><RotateCcw size={11} className="text-purple-500" /> RTV</span>
                  <span className="font-mono font-bold text-purple-700">{fmt(safe(selectedRecord.rtvQty))}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              Product details and stock can be edited in the Products tab. Use Inbound tab to receive new stock.
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* CSV Import Dialog */}
      <AnimatePresence>
        {importOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setImportOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Import Products</h2>
                <p className="text-xs text-gray-400 mb-4">Paste tab-separated data (TSV) with headers. Required: product label, unit cost, selling price.</p>
                <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={8} placeholder="Paste your data here..."
                  className="w-full h-32 text-xs font-mono border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30 focus:border-[#FF6B35] resize-none" />
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => { setImportOpen(false); setImportText('') }} className="rounded-lg text-xs">Cancel</Button>
                  <Button size="sm" onClick={parseAndImport} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg text-xs">Import</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
