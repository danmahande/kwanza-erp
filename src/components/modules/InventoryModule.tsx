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
import OfficeHeader from '@/components/shared/OfficeHeader'
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
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
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
    { label: 'Total Value', value: `KES ${fmt(totalStockValue)}`, icon: BarChart3, color: '#22C55E', bg: 'bg-green-500/15', border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
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

  const tableColumns: Column<Product>[] = useMemo(() => [
    { key: 'productId', label: 'ID', sortable: true, className: 'font-mono text-xs text-gray-400' },
    { key: 'productLabel', label: 'Product', sortable: true, className: 'font-semibold text-gray-900 max-w-[200px] truncate' },
    { key: 'brand', label: 'Brand', sortable: true, className: 'text-gray-500' },
    { key: 'category', label: 'Category', sortable: true, render: (val) => val ? <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-600 border-0">{String(val)}</Badge> : <span className="text-gray-300">—</span> },
    { key: 'merchantName', label: 'Merchant', sortable: true, className: 'text-gray-600', render: (_v, row) => <span className="flex items-center gap-1"><Building2 size={12} className="text-gray-400 shrink-0" />{String(row.merchantName)}</span> },
    { key: 'computedCurrentQty', label: 'Stock', sortable: true, className: 'tabular-nums font-bold', render: (val) => { const q = safe(val as number); return <span className={q < 0 ? 'text-red-600' : q === 0 ? 'text-gray-400' : 'text-[#1B2A4A]'}>{fmt(q)}</span> } },
    { key: 'unit', label: 'Unit', sortable: true, className: 'text-gray-500' },
    { key: 'unitSellingPrice', label: 'Price', sortable: true, className: 'tabular-nums', render: (val) => `KES ${fmt(val as number)}` },
    { key: 'currentStockValue', label: 'Stock Value', sortable: true, className: 'tabular-nums font-semibold', render: (val) => { const v = val as number; return <span className={v < 0 ? 'text-red-600' : 'text-gray-800'}>KES {fmt(v)}</span> } },
  ], [])

  // ════════════════════════════════════════
  // ── RENDER ──
  // ════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* ── Office Header ── */}
      <OfficeHeader
        title="Inventory Office"
        description="Manage products, stock levels, and valuations"
        icon={Warehouse}
        stats={stats}
        actionLabel="Add Product"
        onAction={() => { resetForm(); setOpen(true) }}
      >
        {/* Toolbar */}
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input ref={searchInputRef} placeholder="Search products, vendors, IDs..." value={search} onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-9 rounded-xl border-gray-200 text-sm bg-white" />
        </div>
        <SearchableFilter label="Vendor" options={vendors} selected={filterVendor.length > 1 ? filterVendor : filterVendor[0] || null} onSelect={handleFilterVendorChange} counts={vendorCounts} multi />
        <SearchableFilter label="Category" options={categories} selected={filterCategory.length > 1 ? filterCategory : filterCategory[0] || null} onSelect={handleFilterCategoryChange} counts={categoryCounts} multi />
        <StatusFilter selected={filterStatus} onSelect={handleFilterStatusChange} statuses={STOCK_STATUSES} counts={statusCounts} />
        <NumericRangeFilter label="Qty" value={filterQtyRange} onChange={setFilterQtyRange} presets={qtyPresets} />
        <NumericRangeFilter label="Value" value={filterValueRange} onChange={setFilterValueRange} presets={valuePresets} />
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <Select value={String(pageSize)} onValueChange={v => handlePageSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[100px] rounded-xl border-gray-200 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}</SelectContent>
        </Select>
      </OfficeHeader>

      {/* ── Active Filters ── */}
      <FilterChips chips={activeChips} onClearAll={handleClearFilters} />

      {/* ── Batch Actions Bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-[#1B2A4A] text-white rounded-xl p-2.5 flex items-center gap-3">
            <CheckSquare size={16} className="text-[#FF6B35]" />
            <span className="text-sm font-semibold">{selectedIds.size.toLocaleString()} selected</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="rounded-lg text-xs border-white/20 text-white hover:bg-white/10" onClick={handleExportAll}><Upload size={13} className="mr-1.5" /> Export All</Button>
            <Button variant="outline" size="sm" className="rounded-lg text-xs border-white/20 text-white hover:bg-white/10" onClick={handleBatchExport}><Upload size={13} className="mr-1.5" /> Export Selected</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="rounded-lg text-xs border-red-400/30 text-red-300 hover:bg-red-500/20"><Trash2 size={13} className="mr-1.5" /> Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selectedIds.size} products?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBatchDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" className="rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10" onClick={clearSelection}>Clear</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results count ── */}
      {viewMode === 'card' && (
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{filteredData.length.toLocaleString()} product{filteredData.length !== 1 ? 's' : ''} found</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected }} onChange={() => {
              if (allOnPageSelected) clearSelection()
              else setSelectedIds(prev => { const n = new Set(prev); paginatedData.forEach(p => n.add(p.id)); return n })
            }} className="rounded" />
            <span>Select page</span>
          </label>
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleCSVUpload} className="hidden" aria-label="Import CSV or TSV file" title="Import CSV or TSV file" />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-lg border-gray-200 text-xs h-7">
            <Upload size={12} className="mr-1.5" /> Import
          </Button>
        </div>
        </div>
      )}

      {/* ── Card Grid / Table View ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
      ) : paginatedData.length === 0 ? (
        <div className="text-center py-20 text-gray-400"><Package size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm font-medium">No products found</p><p className="text-xs mt-1">Try adjusting your filters or add a new product</p></div>
      ) : viewMode === 'card' ? (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
          {paginatedData.map((product) => {
            const status = stockStatus(product)
            const qty = safe(product.computedCurrentQty)
            const isSelected = selectedIds.has(product.id)
            const isNeg = qty < 0
            const maxBar = Math.max(product.minStock * 3, Math.abs(qty), 1)
            const barPct = Math.min((Math.abs(qty) / maxBar) * 100, 100)
            return (
              <motion.div key={product.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className={`group relative bg-white rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#FF6B35]/30 ${isSelected ? 'border-[#FF6B35] shadow-md' : 'border-gray-100'}`}
                onClick={() => { setSelectedRecord(product); setDetailOpen(true) }}>
                {/* Checkbox */}
                <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleSelect(product.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300 bg-transparent'}`}>
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </button>
                </div>
                {/* Top row: ID + Status */}
                <div className="flex items-center gap-2 mb-3 pr-8">
                  <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">{product.productId}</span>
                  {statusBadge(status)}
                </div>
                {/* Product name */}
                <h3 className="text-base font-semibold text-gray-900 leading-snug mb-1 line-clamp-2 group-hover:text-[#FF6B35] transition-colors">{product.productLabel}</h3>
                {/* Brand + Merchant */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  {product.brand && <span className="truncate">{product.brand}</span>}
                  {product.brand && product.variant && <span className="text-gray-300">·</span>}
                  {product.variant && <span className="truncate text-gray-400">{product.variant}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                  <Building2 size={12} /><span className="truncate">{product.merchantName}</span>
                </div>
                {/* Stock quantity bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Stock</span>
                    <span className={`text-sm font-bold tabular-nums ${isNeg ? 'text-red-600' : qty === 0 ? 'text-gray-400' : 'text-[#1B2A4A]'}`}>
                      {isNeg ? `(${fmt(qty)})` : fmt(qty)} <span className="text-[10px] text-gray-400 font-normal">{product.unit}</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${stockBarColor(qty, product.minStock)}`} style={{ width: `${barPct}%` }} />
                  </div>
                  {qty > 0 && qty <= product.minStock && (
                    <p className="text-[10px] text-amber-600 mt-1 font-medium">⚠ Below minimum ({product.minStock})</p>
                  )}
                </div>
                {/* Metrics row */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Price</p>
                    <p className="text-sm font-bold text-gray-800">KES {fmt(product.unitSellingPrice)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Stock Value</p>
                    <p className={`text-sm font-bold ${isNeg ? 'text-red-600' : 'text-gray-800'}`}>
                      {isNeg ? `(${fmt(Math.abs(safe(product.currentStockValue)))})` : `KES ${fmt(product.currentStockValue)}`}
                    </p>
                  </div>
                </div>
                {/* Bottom row: Category + Commission */}
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">{product.category}</span>
                  <span className="text-gray-400">{product.commissionPercent}% comm</span>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      ) : (
        <DataTable
          data={paginatedData}
          columns={tableColumns}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => { setSelectedRecord(p); setDetailOpen(true) }}
          rowClassName={(p) => selectedIds.has(p.id) ? 'bg-[#FF6B35]/5' : ''}
          pageSize={100}
        />
      )}

      {/* ── Pagination (card mode only, table has its own) ── */}
      {viewMode === 'card' && sortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-gray-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedData.length)} of {sortedData.length.toLocaleString()}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(1)}><ChevronsLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) pageNum = i + 1
              else if (page <= 4) pageNum = i + 1
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i
              else pageNum = page - 3 + i
              return (
                <Button key={pageNum} variant={pageNum === page ? 'default' : 'outline'} size="icon"
                  className={`h-7 w-7 text-xs rounded-lg ${pageNum === page ? 'bg-[#1B2A4A] hover:bg-[#1B2A4A]' : ''}`}
                  onClick={() => setPage(pageNum)}>{pageNum}</Button>
              )
            })}
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ── Detail SlideOver ── */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title={selectedRecord?.productLabel || 'Product Details'}
        subtitle={selectedRecord?.productId}
        width="xl"
        footer={selectedRecord ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleEdit(selectedRecord)} className="rounded-xl"><Pencil size={14} className="mr-1.5" />Edit</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"><Trash2 size={14} className="mr-1.5" />Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this product?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteRecord(selectedRecord.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={() => { setDetailOpen(false); setSelectedRecord(null) }} className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white rounded-xl">Close</Button>
          </div>
        ) : undefined}
      >
        {selectedRecord && (
          <div className="space-y-5">
            {/* Status & Date */}
            <div className="flex items-center justify-between">
              <div>{statusBadge(stockStatus(selectedRecord))}</div>
              <div className="text-xs text-gray-400">{new Date(selectedRecord.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            {/* Merchant */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Supplier / Merchant</p>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Building2 size={14} />{selectedRecord.merchantName}</p>
              <p className="text-xs text-gray-400 mt-0.5">ID: {selectedRecord.merchantId}</p>
            </div>

            {/* Product Details */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Product Details</p>
              <p className="text-sm font-semibold text-gray-800 mb-1">{selectedRecord.productLabel}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs">Product ID:</span><p className="font-mono font-medium">{selectedRecord.productId}</p></div>
                {selectedRecord.brand && <div><span className="text-gray-400 text-xs">Brand:</span><p className="font-medium">{selectedRecord.brand}</p></div>}
                {selectedRecord.variant && <div><span className="text-gray-400 text-xs">Variant:</span><p className="font-medium">{selectedRecord.variant}</p></div>}
                <div><span className="text-gray-400 text-xs">Category:</span><p><span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">{selectedRecord.category}</span></p></div>
                <div><span className="text-gray-400 text-xs">Unit:</span><p className="font-medium">{selectedRecord.unit}</p></div>
                {selectedRecord.weight && <div><span className="text-gray-400 text-xs">Weight:</span><p className="font-medium">{selectedRecord.weight}</p></div>}
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Pricing</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs">Unit Cost:</span><p className="font-semibold">KES {fmt(selectedRecord.unitCost)}</p></div>
                <div><span className="text-gray-400 text-xs">Selling Price:</span><p className="font-semibold">KES {fmt(selectedRecord.unitSellingPrice)}</p></div>
                <div><span className="text-gray-400 text-xs">Commission:</span><p className="font-medium">{selectedRecord.commissionPercent}%</p></div>
                <div><span className="text-gray-400 text-xs">Margin:</span>
                  <p className={`font-semibold ${(selectedRecord.unitSellingPrice - selectedRecord.unitCost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    KES {fmt(selectedRecord.unitSellingPrice - selectedRecord.unitCost)}
                  </p>
                </div>
              </div>
            </div>

            {/* Stock Levels */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Stock Levels</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs">Current Stock:</span>
                  <p className={`text-lg font-bold ${safe(selectedRecord.computedCurrentQty) < 0 ? 'text-red-600' : 'text-[#1B2A4A]'}`}>
                    {fmt(safe(selectedRecord.computedCurrentQty))} <span className="text-xs font-normal text-gray-400">{selectedRecord.unit}</span>
                  </p>
                </div>
                <div><span className="text-gray-400 text-xs">Min Stock Level:</span><p className="font-medium">{selectedRecord.minStock} {selectedRecord.unit}</p></div>
                <div><span className="text-gray-400 text-xs">Stock Value:</span>
                  <p className={`font-bold ${safe(selectedRecord.computedCurrentQty) < 0 ? 'text-red-600' : 'text-[#1B2A4A]'}`}>
                    {safe(selectedRecord.computedCurrentQty) < 0 ? `(${fmt(Math.abs(safe(selectedRecord.currentStockValue)))})` : `KES ${fmt(selectedRecord.currentStockValue)}`}
                  </p>
                </div>
                <div><span className="text-gray-400 text-xs">Active:</span>
                  <p><Badge className={selectedRecord.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-100'}>{selectedRecord.isActive ? 'Active' : 'Inactive'}</Badge></p>
                </div>
              </div>
            </div>

            {/* Movement Summary */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Movement Summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs">Received:</span><p className="font-semibold text-green-600 flex items-center gap-1"><ArrowDownRight size={12} />{fmt(safe(selectedRecord.inQty))}</p></div>
                <div><span className="text-gray-400 text-xs">Sent Out:</span><p className="font-semibold text-orange-600 flex items-center gap-1"><ArrowUpRight size={12} />{fmt(safe(selectedRecord.outQty))}</p></div>
                <div><span className="text-gray-400 text-xs">Shrinkage:</span><p className="font-semibold text-red-500 flex items-center gap-1"><TrendingDown size={12} />{fmt(safe(selectedRecord.shrinkQty))}</p></div>
                <div><span className="text-gray-400 text-xs">RTV:</span><p className="font-semibold text-purple-500 flex items-center gap-1"><RotateCcw size={12} />{fmt(safe(selectedRecord.rtvQty))}</p></div>
              </div>
            </div>

            {/* Cross-Reference */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Cross-Reference</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => { window.dispatchEvent(new CustomEvent('navigate-module', { detail: { module: 'inbound', search: selectedRecord.productId } })) }}>
                  <ArrowDownRight size={13} className="mr-1.5" /> Inbound History
                </Button>
                <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => { window.dispatchEvent(new CustomEvent('navigate-module', { detail: { module: 'outbound', search: selectedRecord.productId } })) }}>
                  <ArrowUpRight size={13} className="mr-1.5" /> Outbound History
                </Button>
              </div>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ── Create/Edit SlideOver ── */}
      <DetailSlideOver
        open={open}
        onClose={() => { setOpen(false); resetForm() }}
        title={editing ? 'Edit Product' : 'Add New Product'}
        subtitle={editing ? editing.productId : 'Fill in product details'}
        width="lg"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm() }} className="rounded-xl">Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              {editing ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Product Name *</Label>
            <Input placeholder="e.g. Coca-Cola 500ml" value={form.productLabel} onChange={e => setForm({ ...form, productLabel: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Brand</Label>
              <Input placeholder="e.g. Coca-Cola" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Variant</Label>
              <Input placeholder="e.g. 500ml" value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Category *</Label>
            <Input placeholder="e.g. Beverages" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Supplier / Merchant *</Label>
            <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
              <SelectTrigger className="h-9 rounded-lg border-gray-200 text-sm"><SelectValue placeholder="Select merchant" /></SelectTrigger>
              <SelectContent>
                {merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Unit Cost (KES) *</Label>
              <Input type="number" placeholder="0" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Selling Price (KES) *</Label>
              <Input type="number" placeholder="0" value={form.unitSellingPrice} onChange={e => setForm({ ...form, unitSellingPrice: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Commission %</Label>
              <Input type="number" value={form.commissionPercent} onChange={e => setForm({ ...form, commissionPercent: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Min Stock</Label>
              <Input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Unit</Label>
              <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Weight</Label>
              <Input placeholder="e.g. 500g" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Opening Stock</Label>
              <Input type="number" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
          </div>
        </div>
      </DetailSlideOver>

      {/* ── CSV Import Dialog ── */}
      <AnimatePresence>
        {importOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setImportOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Import Products</h2>
                <p className="text-xs text-gray-400 mb-4">Paste tab-separated data (TSV) with headers. Required columns: product label, unit cost, selling price.</p>
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
