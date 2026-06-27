'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Search, ArrowUpRight, Truck, Clock, CheckCircle2, BarChart3,
  Calendar, Filter, X, Loader2,
  CheckSquare, Square, Upload, Trash2, User, Mail, Phone, MapPin,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import ViewToggle from '@/components/shared/ViewToggle'
import DataTable, { type Column } from '@/components/shared/DataTable'

// ── Types ──
interface Product {
  id: string; productId: string; productLabel: string; brand: string | null;
  variant: string | null; currentStock: number; unit: string;
  unitSellingPrice: number; merchantId: string; merchantName: string
}
interface Driver { id: string; driverId: string; name: string; phone: string }
interface OutboundRecord {
  id: string; outboundId: string; orderNumber: string | null; userId: string | null;
  trackingNumber: string | null; vendorId: string | null; businessName: string | null;
  customerName: string; customerContact: string; customerEmail: string | null;
  customerAddress: string | null; productName: string; productId: string;
  brand: string | null; variant: string | null; qty: number;
  unitSellingPrice: number | null; saleAmount: number | null;
  assignedBy: string | null; assignedDriver: string | null; vehicleNumber: string | null;
  runsheetId: string | null; stopSequence: number | null;
  actualDeliveredQty: number | null; codCollected: number | null;
  deliveryNotes: string | null; status: string;
  dispatchedAt: string | null; deliveredAt: string | null; createdAt: string
}

// ── Constants ──
const PAGE_SIZES = [25, 50, 100, 200]
const statusOptions = [
  { key: 'pending', label: 'Pending', dot: 'bg-amber-500' },
  { key: 'dispatched', label: 'Dispatched', dot: 'bg-blue-500' },
  { key: 'delivered', label: 'Delivered', dot: 'bg-green-500' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-gray-400' },
  { key: 'failed', label: 'Failed', dot: 'bg-red-500' },
]

function statusBadge(status: string) {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs font-medium">Pending</Badge>
    case 'dispatched': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs font-medium">Dispatched</Badge>
    case 'delivered': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs font-medium">Delivered</Badge>
    case 'cancelled': return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-xs font-medium">Cancelled</Badge>
    case 'failed': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs font-medium">Failed</Badge>
    default: return <Badge variant="secondary" className="text-xs">{status}</Badge>
  }
}

function statusBorderAccent(status: string) {
  switch (status) {
    case 'pending': return 'border-l-amber-400'
    case 'dispatched': return 'border-l-blue-400'
    case 'delivered': return 'border-l-green-400'
    case 'failed': return 'border-l-red-400'
    default: return 'border-l-gray-300'
  }
}

const fmt = (n: number) => { if (n == null || isNaN(n)) return '0'; return n.toLocaleString(undefined, { maximumFractionDigits: 0 }) }

function exportCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v ?? ''}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return ''; return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Sub-components ──
function SearchableFilter({ label, options, selected, onSelect, counts, multi }: {
  label: string; options: string[]; selected: string | null | string[]; onSelect: (v: string | null | string[]) => void; clearable?: boolean; counts?: Record<string, number>; multi?: boolean
}) {
  const [query, setQuery] = useState('')
  const isMulti = multi === true
  const selectedArr: string[] = isMulti ? (Array.isArray(selected) ? selected : []) : []
  const selectedSingle = isMulti ? null : selected as string | null
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options
  const isActive = isMulti ? selectedArr.length > 0 : !!selectedSingle
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${isActive ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <Filter size={13} /><span className="hidden sm:inline">{label}:</span>
          {isMulti ? (
            selectedArr.length === 0 ? <span>All</span> : selectedArr.length === 1 ? <span className="max-w-[100px] truncate">{selectedArr[0]}</span> : <span className="inline-flex items-center gap-1"><span>{selectedArr.length} selected</span><span className="bg-[#FF6B35] text-white text-[9px] rounded-full px-1.5 py-0.5 font-bold">{selectedArr.length}</span></span>
          ) : <span className="max-w-[100px] truncate">{selectedSingle || 'All'}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b border-gray-100">
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><Input placeholder={`Search ${label.toLowerCase()}...`} value={query} onChange={e => setQuery(e.target.value)} className="pl-8 h-8 text-xs border-gray-200" /></div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {isMulti && (<div className="flex gap-1 px-1 pb-1 border-b border-gray-100 mb-1"><button onClick={() => { onSelect(options); setQuery('') }} className="flex-1 text-center px-2 py-1 rounded text-[10px] font-medium bg-[#FF6B35]/10 text-[#FF6B35]">Select All</button><button onClick={() => { onSelect([]); setQuery('') }} className="flex-1 text-center px-2 py-1 rounded text-[10px] font-medium text-gray-500 hover:bg-gray-100">Clear All</button></div>)}
          <button onClick={() => { onSelect(null); setQuery('') }} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${!selectedSingle ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>All {label}</button>
          {filtered.map(o => {
            const isSel = isMulti ? selectedArr.includes(o) : selectedSingle === o
            const count = counts?.[o]
            return (
              <button key={o} onClick={() => {
                if (isMulti) { const arr = selectedArr as string[]; onSelect(arr.includes(o) ? arr.filter(v => v !== o) : [...arr, o]) } else { onSelect(selectedSingle === o ? null : o); setQuery('') }
              }} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${isSel ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
                {isMulti && (isSel ? <CheckSquare size={13} className="shrink-0 text-[#FF6B35]" /> : <Square size={13} className="shrink-0 text-gray-300" />)}
                <span className="flex-1 truncate">{o}</span>
                {count !== undefined && <span className="text-[10px] text-gray-400 ml-auto shrink-0">{count}</span>}
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
          <span className={`w-2 h-2 rounded-full bg-gray-300`} />
          <span className="hidden sm:inline">Status:</span>
          <span>{selected ? statuses.find(s => s.key === selected)?.label : 'All'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1.5" align="start">
        <button onClick={() => onSelect(null)} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${!selected ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>All Statuses</button>
        {statuses.map(s => {
          const count = counts?.[s.key]
          return (<button key={s.key} onClick={() => onSelect(selected === s.key ? null : s.key)} className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${selected === s.key ? 'bg-[#FF6B35]/10 text-[#FF6B35]' : 'text-gray-600 hover:bg-gray-50'}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} /> <span className="flex-1">{s.label}</span>
            {count !== undefined && <span className="text-[10px] text-gray-400 ml-auto shrink-0">{count}</span>}
          </button>)
        })}
      </PopoverContent>
    </Popover>
  )
}

function FilterChips({ chips, onClearAll }: { chips: Array<{ key: string; label: string; onRemove: () => void }>; onClearAll: () => void }) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map(chip => (
        <span key={chip.key} className="bg-[#FF6B35]/10 text-[#FF6B35] border border-[#FF6B35]/20 rounded-full px-2.5 py-1 text-xs font-medium flex items-center gap-1.5">
          {chip.label}
          <button onClick={chip.onRemove} className="hover:text-red-500 transition-colors" aria-label="Remove filter"><X size={12} /></button>
        </span>
      ))}
      {chips.length > 1 && <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-red-500 transition-colors">Clear All</button>}
    </div>
  )
}

function DateRangeFilter({ label = 'Date', value, onChange }: {
  label?: string; value: { from: string | null; to: string | null } | null; onChange: (range: { from: string | null; to: string | null } | null) => void
}) {
  const [customFrom, setCustomFrom] = useState(value?.from || '')
  const [customTo, setCustomTo] = useState(value?.to || '')
  const presets = [
    { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7d' }, { key: '30d', label: 'Last 30d' }, { key: 'month', label: 'This Month' }, { key: 'quarter', label: 'This Quarter' },
  ]
  const isActive = !!value && (!!value.from || !!value.to)
  const applyPreset = (key: string) => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let from: Date
    switch (key) {
      case 'today': from = new Date(today); break; case '7d': from = new Date(today); from.setDate(from.getDate() - 7); break
      case '30d': from = new Date(today); from.setDate(from.getDate() - 30); break
      case 'month': from = new Date(now.getFullYear(), now.getMonth(), 1); break
      case 'quarter': from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break
      default: return
    }
    setCustomFrom(from.toISOString().split('T')[0]); setCustomTo(today.toISOString().split('T')[0]); onChange({ from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0] })
  }
  const handleCustomApply = () => { if (customFrom || customTo) onChange({ from: customFrom || null, to: customTo || null }) }
  const handleClear = () => { setCustomFrom(''); setCustomTo(''); onChange(null) }
  const displayLabel = isActive ? `${label}: ${formatDateShort(value?.from)} – ${formatDateShort(value?.to)}` : label
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5 ${isActive ? 'bg-[#FF6B35]/5 border-[#FF6B35]/30 text-[#FF6B35]' : ''}`}>
          <Calendar size={13} /><span className="hidden sm:inline">{displayLabel}</span><span className="sm:hidden">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Quick Presets</p>
            <div className="flex flex-wrap gap-1">{presets.map(p => <button key={p.key} onClick={() => applyPreset(p.key)} className="text-[10px] px-2 py-1 rounded-full border transition-colors bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200">{p.label}</button>)}</div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1.5">Custom Range</p>
            <div className="space-y-1.5">
              <Input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); handleCustomApply() }} className="h-8 text-xs border-gray-200" />
              <Input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); handleCustomApply() }} className="h-8 text-xs border-gray-200" />
            </div>
          </div>
          {isActive && <button onClick={handleClear} className="text-[10px] text-gray-500 hover:text-red-500 transition-colors">Clear date range</button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function OutboundModule() {
  // ── Data State ──
  const [data, setData] = useState<OutboundRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [filterVendor, setFilterVendor] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterDateRange, setFilterDateRange] = useState<{ from: string | null; to: string | null } | null>(null)

  // ── Pagination ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1])

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── UI State ──
  const [open, setOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<OutboundRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [form, setForm] = useState({
    userId: '', customerName: '', customerContact: '', customerEmail: '', customerAddress: '',
    productId: '', productName: '', brand: '', variant: '',
    qty: '', unitSellingPrice: '', saleAmount: '', assignedBy: '', assignedDriver: '',
  })

  // ── Keyboard shortcut ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); searchInputRef.current?.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Fetch Data ──
  useEffect(() => {
    const controller = new AbortController(); const signal = controller.signal
    Promise.all([
      fetch('/api/products', { signal }).then(r => r.json()),
      fetch('/api/drivers?status=active', { signal }).then(r => r.json()),
      fetch(`/api/outbound?search=${search}`, { signal }).then(r => r.json()),
    ]).then(([productsData, driversData, outboundData]) => {
      if (!signal.aborted) { setProducts(productsData); setDrivers(driversData); setData(outboundData); setLoading(false) }
    }).catch(() => { if (!signal.aborted) { setLoading(false); toast.error('Failed to load outbound records') } })
    return () => controller.abort()
  }, [search])

  const fetchData = useCallback(() => {
    fetch(`/api/outbound?search=${search}`).then(r => r.json()).then(d => setData(d))
  }, [search])

  const resetPaging = useCallback(() => { setPage(1) }, [])

  // ── Derived ──
  const vendors = useMemo(() => [...new Set(data.map(r => r.businessName).filter((v): v is string => Boolean(v)))].sort(), [data])
  const vendorCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of data) { if (r.businessName) c[r.businessName] = (c[r.businessName] || 0) + 1 }; return c }, [data])
  const statusCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of data) { c[r.status] = (c[r.status] || 0) + 1 }; return c }, [data])

  const filteredData = useMemo(() => {
    let result = [...data]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r => (r.orderNumber && r.orderNumber.toLowerCase().includes(q)) || (r.trackingNumber && r.trackingNumber.toLowerCase().includes(q)) || r.customerName.toLowerCase().includes(q) || r.productName.toLowerCase().includes(q) || (r.businessName && r.businessName.toLowerCase().includes(q)) || (r.assignedDriver && r.assignedDriver.toLowerCase().includes(q)))
    }
    if (filterVendor.length > 0) result = result.filter(r => filterVendor.includes(r.businessName || ''))
    if (filterStatus) result = result.filter(r => r.status === filterStatus)
    if (filterDateRange) result = result.filter(r => { if (filterDateRange.from && r.createdAt < filterDateRange.from) return false; if (filterDateRange.to && r.createdAt > filterDateRange.to) return false; return true })
    return result
  }, [data, search, filterVendor, filterStatus, filterDateRange])

  const sortedData = useMemo(() => [...filteredData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [filteredData])
  const paginatedData = useMemo(() => sortedData.slice((page - 1) * pageSize, page * pageSize), [sortedData, page, pageSize])
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))

  const stats = useMemo(() => ({
    pending: data.filter(r => r.status === 'pending').length,
    dispatched: data.filter(r => r.status === 'dispatched').length,
    delivered: data.filter(r => r.status === 'delivered').length,
    total: data.length,
    totalSaleAmount: data.reduce((s, r) => s + (r.saleAmount || 0), 0),
  }), [data])

  // ── Handlers ──
  const handleSearchChange = useCallback((value: string) => { setSearch(value); resetPaging() }, [resetPaging])
  const handleVendorSelect = useCallback((value: string | string[] | null) => { setFilterVendor(Array.isArray(value) ? value : value ? [value] : []); resetPaging() }, [resetPaging])
  const handleStatusSelect = useCallback((value: string | null) => { setFilterStatus(value); resetPaging() }, [resetPaging])
  const clearAllFilters = useCallback(() => { setSearch(''); setFilterVendor([]); setFilterStatus(null); setFilterDateRange(null); resetPaging() }, [resetPaging])
  const handlePageSizeChange = useCallback((size: number) => { setPageSize(size); setPage(1) }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBatchExport = useCallback(() => {
    const selectedRecords = data.filter(r => selectedIds.has(r.id)); if (selectedRecords.length === 0) return
    exportCSV('outbound-orders.csv', ['Order', 'Tracking', 'Supplier', 'Product', 'Qty', 'Price Each', 'Total Sale', 'Customer', 'Status', 'Date'],
      selectedRecords.map(r => [r.orderNumber || '', r.trackingNumber || '', r.businessName || '', r.productName, r.qty, r.unitSellingPrice || '', r.saleAmount || '', r.customerName, r.status, r.createdAt]))
    toast.success(`Exported ${selectedRecords.length} records`)
  }, [data, selectedIds])

  const handleExportAll = useCallback(() => {
    if (filteredData.length === 0) return
    exportCSV('outbound-orders.csv', ['Order', 'Tracking', 'Supplier', 'Product', 'Qty', 'Price Each', 'Total Sale', 'Customer', 'Status', 'Date'],
      filteredData.map(r => [r.orderNumber || '', r.trackingNumber || '', r.businessName || '', r.productName, r.qty, r.unitSellingPrice || '', r.saleAmount || '', r.customerName, r.status, r.createdAt]))
    toast.success(`Exported ${filteredData.length} records`)
  }, [filteredData])

  const handleBatchDelete = useCallback(async () => {
    const selected = data.filter(r => selectedIds.has(r.id)); if (selected.length === 0) return
    try { await Promise.all(selected.map(r => fetch(`/api/outbound?id=${r.id}`, { method: 'DELETE' }))); toast.success(`Deleted ${selected.length} records`); setSelectedIds(new Set()); fetchData() }
    catch { toast.error('Failed to delete records') }
  }, [data, selectedIds, fetchData])

  // ── Form Handlers ──
  const handleProductSelect = useCallback((productId: string) => {
    const p = products.find(pr => pr.productId === productId)
    setForm(prev => ({ ...prev, productId, productName: p?.productLabel || '', brand: p?.brand || '', variant: p?.variant || '', unitSellingPrice: p?.unitSellingPrice ? String(p.unitSellingPrice) : prev.unitSellingPrice }))
    setSelectedProductStock(null)
    fetch('/api/products?search=' + productId).then(r => r.json()).then(d => { if (d[0]) setSelectedProductStock(d[0].computedCurrentQty ?? d[0].currentStock) })
  }, [products])

  const resetForm = useCallback(() => {
    setForm({ userId: '', customerName: '', customerContact: '', customerEmail: '', customerAddress: '', productId: '', productName: '', brand: '', variant: '', qty: '', unitSellingPrice: '', saleAmount: '', assignedBy: '', assignedDriver: '' }); setSelectedProductStock(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!form.customerName || !form.customerContact || !form.productId || !form.qty) { toast.error('Please fill all required fields'); return }
    setSubmitting(true)
    try {
      const qty = parseInt(form.qty)
      const unitSellingPrice = form.unitSellingPrice ? parseFloat(form.unitSellingPrice) : null
      const saleAmount = form.saleAmount ? parseFloat(form.saleAmount) : (unitSellingPrice ? unitSellingPrice * qty : null)
      const selectedProduct = products.find(p => p.productId === form.productId)
      const payload = { ...form, qty, unitSellingPrice, saleAmount, assignedDriver: form.assignedDriver || null, assignedBy: form.assignedBy || null, brand: form.brand || null, variant: form.variant || null, userId: form.userId || null, customerEmail: form.customerEmail || null, vendorId: selectedProduct?.merchantId || null, businessName: selectedProduct?.merchantName || null }
      await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Order created successfully'); setOpen(false); resetForm(); fetchData()
    } catch { toast.error('Failed to submit. Please try again.') } finally { setSubmitting(false) }
  }, [form, products, resetForm, fetchData])

  const handleDeleteRecord = async (id: string) => {
    try { await fetch(`/api/outbound?id=${id}`, { method: 'DELETE' }); toast.success('Record deleted'); setDetailOpen(false); setSelectedRecord(null); fetchData() } catch { toast.error('Failed to delete') }
  }

  // ── KPI Stats ──
  const headerStats = [
    { label: 'Total Orders', value: stats.total, icon: BarChart3, color: '#1B2A4A', bg: 'bg-slate-500/15', border: 'border-slate-500/20', gradient: 'from-slate-500/10 to-slate-500/5' },
    { label: 'Dispatched', value: stats.dispatched, icon: Truck, color: '#3B82F6', bg: 'bg-blue-500/15', border: 'border-blue-500/20', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Delivered', value: stats.delivered, icon: CheckCircle2, color: '#22C55E', bg: 'bg-green-500/15', border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/15', border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-500/5' },
  ]

  // ── Filter Chips ──
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    if (search) chips.push({ key: 'search', label: `Search: ${search}`, onRemove: () => setSearch('') })
    filterVendor.forEach(v => chips.push({ key: `vendor-${v}`, label: `Vendor: ${v}`, onRemove: () => setFilterVendor(prev => prev.filter(pv => pv !== v)) }))
    if (filterStatus) chips.push({ key: 'status', label: `Status: ${statusOptions.find(s => s.key === filterStatus)?.label || filterStatus}`, onRemove: () => setFilterStatus(null) })
    if (filterDateRange) chips.push({ key: 'date', label: `Date: ${formatDateShort(filterDateRange.from)} – ${formatDateShort(filterDateRange.to)}`, onRemove: () => setFilterDateRange(null) })
    return chips
  }, [search, filterVendor, filterStatus, filterDateRange])

  const allOnPageSelected = paginatedData.length > 0 && paginatedData.every(r => selectedIds.has(r.id))
  const someOnPageSelected = paginatedData.some(r => selectedIds.has(r.id)) && !allOnPageSelected

  const tableColumns: Column<OutboundRecord>[] = useMemo(() => [
    { key: 'orderNumber', label: 'Order #', sortable: true, className: 'font-mono text-xs text-gray-400', render: (_v, row) => row.orderNumber ? <span className="font-mono text-xs text-gray-400 flex items-center gap-1"><Hash size={10} />{row.orderNumber}</span> : <span className="font-mono text-xs text-gray-300">#{row.outboundId.slice(-6)}</span> },
    { key: 'customerName', label: 'Customer', sortable: true, className: 'font-semibold text-gray-900' },
    { key: 'productName', label: 'Product', sortable: true, className: 'text-gray-600 max-w-[180px] truncate' },
    { key: 'qty', label: 'Qty', sortable: true, className: 'tabular-nums font-bold text-gray-800', render: (val) => (val as number).toLocaleString() },
    { key: 'saleAmount', label: 'Amount', sortable: true, className: 'tabular-nums font-semibold', render: (val) => val ? `KES ${fmt(val as number)}` : '—' },
    { key: 'assignedDriver', label: 'Driver', sortable: true, render: (val) => val ? <span className="flex items-center gap-1 text-gray-700"><User size={12} className="text-[#FF6B35] shrink-0" />{String(val)}</span> : <span className="text-gray-300">—</span> },
    { key: 'businessName', label: 'Vendor', sortable: true, className: 'text-gray-500', render: (val) => val ? String(val) : '—' },
    { key: 'status', label: 'Status', sortable: true, render: (val) => statusBadge(String(val)) },
    { key: 'createdAt', label: 'Date', sortable: true, className: 'text-xs text-gray-500', render: (val) => formatDateShort(val as string) },
  ], [])

  // ════════════════════════════════════════
  // ── RENDER ──
  // ════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* ── Office Header ── */}
      <OfficeHeader
        title="Outbound Office"
        description="Manage dispatch, delivery orders, and fulfillment"
        icon={ArrowUpRight}
        stats={headerStats}
        actionLabel="New Order"
        onAction={() => { resetForm(); setOpen(true) }}
      >
        {/* Toolbar */}
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input ref={searchInputRef} placeholder="Search orders, customers, tracking..." value={search} onChange={e => handleSearchChange(e.target.value)} className="pl-9 h-9 rounded-xl border-gray-200 text-sm bg-white" />
        </div>
        <SearchableFilter label="Vendor" options={vendors} selected={filterVendor.length > 1 ? filterVendor : filterVendor[0] || null} onSelect={handleVendorSelect} counts={vendorCounts} multi />
        <StatusFilter selected={filterStatus} onSelect={handleStatusSelect} statuses={statusOptions} counts={statusCounts} />
        <DateRangeFilter value={filterDateRange} onChange={setFilterDateRange} />
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <Select value={String(pageSize)} onValueChange={v => handlePageSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[100px] rounded-xl border-gray-200 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}</SelectContent>
        </Select>
      </OfficeHeader>

      {/* ── Active Filters ── */}
      <FilterChips chips={activeChips} onClearAll={clearAllFilters} />

      {/* ── Batch Actions ── */}
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
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selectedIds.size} records?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
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
        <span>{filteredData.length.toLocaleString()} order{filteredData.length !== 1 ? 's' : ''} found</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected }} onChange={() => {
            if (allOnPageSelected) clearSelection()
            else setSelectedIds(prev => { const n = new Set(prev); paginatedData.forEach(r => n.add(r.id)); return n })
          }} className="rounded" />
          <span>Select page</span>
        </label>
      </div>
      )}

      {/* ── Card Grid / Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
      ) : paginatedData.length === 0 ? (
        <div className="text-center py-20 text-gray-400"><Truck size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm font-medium">No outbound orders found</p><p className="text-xs mt-1">Try adjusting your filters or create a new order</p></div>
      ) : viewMode === 'card' ? (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
          {paginatedData.map((record) => {
            const isSelected = selectedIds.has(record.id)
            return (
              <motion.div key={record.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className={`group relative bg-white rounded-2xl border-2 border-l-4 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#FF6B35]/30 ${statusBorderAccent(record.status)} ${isSelected ? 'border-[#FF6B35] shadow-md' : 'border-gray-100 border-l-[6px]'}`}
                onClick={() => { setSelectedRecord(record); setDetailOpen(true) }}>
                {/* Checkbox */}
                <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleSelect(record.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300 bg-transparent'}`}>
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </button>
                </div>

                {/* Order number + Status */}
                <div className="flex items-center gap-2 mb-2 pr-8">
                  {record.orderNumber ? (
                    <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md flex items-center gap-1"><Hash size={10} />{record.orderNumber}</span>
                  ) : (
                    <span className="font-mono text-[11px] text-gray-300 bg-gray-50 px-2 py-0.5 rounded-md">#{record.outboundId.slice(-6)}</span>
                  )}
                  {statusBadge(record.status)}
                </div>

                {/* Customer name (large) */}
                <h3 className="text-base font-semibold text-gray-900 leading-snug mb-1 group-hover:text-[#FF6B35] transition-colors">{record.customerName}</h3>

                {/* Product */}
                <p className="text-xs text-gray-500 truncate mb-3">{record.productName}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Qty</p>
                    <p className="text-sm font-bold text-gray-800">{record.qty.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Amount</p>
                    <p className="text-sm font-bold text-gray-800">{record.saleAmount ? `KES ${fmt(record.saleAmount)}` : '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Price</p>
                    <p className="text-sm font-bold text-gray-800">{record.unitSellingPrice ? `KES ${fmt(record.unitSellingPrice)}` : '—'}</p>
                  </div>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    {record.assignedDriver && (
                      <span className="flex items-center gap-1 text-gray-500"><User size={10} className="text-[#FF6B35]" />{record.assignedDriver}</span>
                    )}
                    {record.trackingNumber && (
                      <span className="bg-[#1B2A4A]/5 text-[#1B2A4A] px-1.5 py-0.5 rounded-md font-mono text-[10px]">{record.trackingNumber.slice(-8)}</span>
                    )}
                  </div>
                  <span>{formatDateShort(record.createdAt)}</span>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      ) : (
        <DataTable
          data={paginatedData as unknown as Record<string, unknown>[]}
          columns={tableColumns}
          keyExtractor={(row) => (row as unknown as OutboundRecord).id}
          onRowClick={(row) => { const r = row as unknown as OutboundRecord; setSelectedRecord(r); setDetailOpen(true) }}
          rowClassName={(row) => {
            const r = row as unknown as OutboundRecord
            return selectedIds.has(r.id) ? 'bg-[#FF6B35]/5' : ''
          }}
          pageSize={100}
        />
      )}

      {/* ── Pagination ── */}
      {viewMode === 'card' && sortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-gray-500">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedData.length)} of {sortedData.length.toLocaleString()}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(1)}><ChevronsLeft size={14} /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) pageNum = i + 1
              else if (page <= 4) pageNum = i + 1
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i
              else pageNum = page - 3 + i
              return <Button key={pageNum} variant={pageNum === page ? 'default' : 'outline'} size="icon" className={`h-7 w-7 text-xs rounded-lg ${pageNum === page ? 'bg-[#1B2A4A] hover:bg-[#1B2A4A]' : ''}`} onClick={() => setPage(pageNum)}>{pageNum}</Button>
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
        title={selectedRecord?.customerName || 'Order Details'}
        subtitle={selectedRecord?.orderNumber || selectedRecord?.outboundId}
        width="xl"
        footer={selectedRecord ? (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"><Trash2 size={14} className="mr-1.5" />Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this order?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
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
              <div>{statusBadge(selectedRecord.status)}</div>
              <div className="text-xs text-gray-400">{new Date(selectedRecord.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            {/* Order info */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Order Information</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs">Order Number:</span><p className="font-mono font-medium">{selectedRecord.orderNumber || '—'}</p></div>
                <div><span className="text-gray-400 text-xs">Tracking #:</span><p className="font-mono font-medium">{selectedRecord.trackingNumber || '—'}</p></div>
                <div><span className="text-gray-400 text-xs">Created:</span><p className="font-medium">{selectedRecord.createdAt}</p></div>
                <div><span className="text-gray-400 text-xs">Dispatched:</span><p className="font-medium">{selectedRecord.dispatchedAt || '—'}</p></div>
                <div><span className="text-gray-400 text-xs">Delivered:</span><p className="font-medium">{selectedRecord.deliveredAt || '—'}</p></div>
                <div><span className="text-gray-400 text-xs">Supplier:</span><p className="font-medium">{selectedRecord.businessName || '—'}</p></div>
              </div>
            </div>

            {/* Customer */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Customer Details</p>
              <p className="text-base font-semibold text-gray-800 mb-2">{selectedRecord.customerName}</p>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-gray-600"><Phone size={12} />{selectedRecord.customerContact}</div>
                {selectedRecord.customerEmail && <div className="flex items-center gap-2 text-gray-600"><Mail size={12} />{selectedRecord.customerEmail}</div>}
                {selectedRecord.customerAddress && <div className="flex items-center gap-2 text-gray-600"><MapPin size={12} />{selectedRecord.customerAddress}</div>}
              </div>
            </div>

            {/* Product & Amount */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Product & Amount</p>
              <p className="text-sm font-semibold text-gray-800 mb-1">{selectedRecord.productName}</p>
              {selectedRecord.brand && <p className="text-xs text-gray-400">Brand: {selectedRecord.brand} {selectedRecord.variant ? `/ ${selectedRecord.variant}` : ''}</p>}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Qty</p>
                  <p className="text-lg font-bold">{selectedRecord.qty}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Unit Price</p>
                  <p className="text-lg font-bold">{selectedRecord.unitSellingPrice ? `KES ${fmt(selectedRecord.unitSellingPrice)}` : '—'}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total</p>
                  <p className="text-lg font-bold">{selectedRecord.saleAmount ? `KES ${fmt(selectedRecord.saleAmount)}` : '—'}</p>
                </div>
              </div>
            </div>

            {/* Driver & Delivery */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Driver</p>
                <p className="text-sm font-semibold text-gray-800">{selectedRecord.assignedDriver || 'Not assigned'}</p>
                {selectedRecord.vehicleNumber && <p className="text-xs text-gray-400 mt-0.5">Vehicle: {selectedRecord.vehicleNumber}</p>}
                {selectedRecord.assignedBy && <p className="text-xs text-gray-400">Assigned by: {selectedRecord.assignedBy}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Delivery</p>
                {selectedRecord.actualDeliveredQty != null && <p className="text-sm"><span className="text-gray-400">Delivered qty:</span> <span className="font-semibold">{selectedRecord.actualDeliveredQty}</span></p>}
                {selectedRecord.codCollected != null && <p className="text-sm"><span className="text-gray-400">COD:</span> <span className="font-semibold">KES {fmt(selectedRecord.codCollected)}</span></p>}
                {selectedRecord.deliveryNotes && <p className="text-xs text-gray-500 mt-1">{selectedRecord.deliveryNotes}</p>}
                {!selectedRecord.actualDeliveredQty && !selectedRecord.codCollected && <p className="text-sm text-gray-400">No delivery info</p>}
              </div>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ── Create New Order SlideOver ── */}
      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Create Order"
        subtitle="New outbound order"
        width="xl"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl flex items-center gap-1.5">
              {submitting && <Loader2 size={14} className="animate-spin" />}{submitting ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Product */}
          <div>
            <Label className="text-xs font-medium text-gray-600">Product *</Label>
            <Select value={form.productId} onValueChange={handleProductSelect}>
              <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel} {p.brand ? `(${p.brand})` : ''} — Stock: {p.currentStock}</SelectItem>)}</SelectContent>
            </Select>
            {selectedProductStock !== null && (
              <p className="text-xs text-gray-400 mt-1">Current stock: <span className="font-semibold text-gray-600">{selectedProductStock} units</span></p>
            )}
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-gray-600">Quantity *</Label>
              <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-600">Unit Selling Price</Label>
              <Input type="number" value={form.unitSellingPrice} onChange={e => setForm({ ...form, unitSellingPrice: e.target.value })} placeholder="0.00" className="mt-1.5 rounded-xl" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-gray-600">Sale Amount (override)</Label>
            <Input type="number" value={form.saleAmount} onChange={e => setForm({ ...form, saleAmount: e.target.value })} placeholder="Auto-calculated" className="mt-1.5 rounded-xl" />
            {form.qty && form.unitSellingPrice && !form.saleAmount && (
              <p className="text-xs text-green-600 mt-1">Auto: KES {(parseInt(form.qty) * parseFloat(form.unitSellingPrice)).toLocaleString()}</p>
            )}
          </div>

          {/* Customer */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">Customer Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Customer Name *</Label>
                <Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Full name" className="mt-1.5 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Phone *</Label>
                <Input value={form.customerContact} onChange={e => setForm({ ...form, customerContact: e.target.value })} placeholder="Phone number" className="mt-1.5 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Email</Label>
                <Input type="email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} placeholder="email@example.com" className="mt-1.5 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Address</Label>
                <Input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} placeholder="Delivery address" className="mt-1.5 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Driver Assignment */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">Driver Assignment</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Assign Driver</Label>
                <Select value={form.assignedDriver} onValueChange={v => setForm({ ...form, assignedDriver: v })}>
                  <SelectTrigger className="mt-1.5 rounded-xl"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>{drivers.map(d => <SelectItem key={d.driverId} value={d.name}>{d.name} — {d.phone}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Assigned By</Label>
                <Input value={form.assignedBy} onChange={e => setForm({ ...form, assignedBy: e.target.value })} placeholder="Your name" className="mt-1.5 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </DetailSlideOver>
    </div>
  )
}
