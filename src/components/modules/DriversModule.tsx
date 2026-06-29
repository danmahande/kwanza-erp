'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Search, Truck, UserCheck, UserX, Phone,
  Car, Shield, ShieldAlert, Loader2, Package,
  X, CheckSquare, Upload, Trash2, TrendingUp,
  Banknote, AlertTriangle, Bell, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import ViewToggle from '@/components/shared/ViewToggle'
import DataTable, { type Column } from '@/components/shared/DataTable'
import DriverProfile from '@/components/modules/DriverProfile'

// ── Types ──
interface DriverNotification { type: string; title: string; message: string; severity: 'info' | 'warning' | 'urgent' }

interface Driver {
  id: string; driverId: string; name: string; phone: string
  nationalId: string | null; licenseNumber: string | null
  vehicleType: string | null; vehicleNumber: string | null
  createdBy: string | null; profileImage: string | null
  dateHired: string | null; salaryAmount: number | null; salaryPayDay: number
  status: string; damages: number; loss: number
  expectedBankings: number; banked: number
  createdAt: string; updatedAt: string
  // Computed from API
  ordersReceived: number; ordersDelivered: number; successRate: number
  totalDamages: number; totalLoss: number; totalSaleAmount: number; riskPercent: number
  totalTrips: number; totalDistance: number; totalCOD: number
  latestTripDate: string | null; latestGeoLocation: string | null; hasGeoTracking: boolean
  notifications: DriverNotification[]; notificationCount: number
}

// ── Constants ──
const PAGE_SIZES = [25, 50, 100, 200]

const VEHICLE_TYPES = ['Motorcycle', 'Van', 'Truck', 'Bicycle', 'Pickup', 'Tuk Tuk', 'Other']

const DRIVER_STATUSES = [
  { key: 'active', label: 'Active', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 hover:bg-green-100 border-0' },
  { key: 'inactive', label: 'Inactive', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0' },
  { key: 'on_leave', label: 'On Leave', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0' },
]

// ── Helpers ──
const fmtMoney = (n: number) => {
  if (n == null || isNaN(n)) return 'KES 0'
  return `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const statusBadge = (status: string) => {
  const s = DRIVER_STATUSES.find(st => st.key === status)
  if (s) return <Badge className={`${s.badge} text-xs font-medium`}>{s.label}</Badge>
  return <Badge variant="secondary" className="text-xs">{status}</Badge>
}

const statusBorderAccent = (status: string) => {
  switch (status) {
    case 'active': return 'border-l-green-400'
    case 'inactive': return 'border-l-gray-400'
    case 'on_leave': return 'border-l-amber-400'
    default: return 'border-l-gray-200'
  }
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

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function DriversModule() {
  // ── Data State ──
  const [data, setData] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Pagination ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

  // ── Filters ──
  const [filterStatus, setFilterStatus] = useState<string | null>(null)

  // ── SlideOvers ──
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<Driver | null>(null)
  const [profileDriver, setProfileDriver] = useState<Driver | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    name: '', phone: '', nationalId: '', licenseNumber: '',
    vehicleType: '', vehicleNumber: '', status: 'active',
    damages: '', loss: '', expectedBankings: '', banked: '',
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
  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterStatus) params.set('status', filterStatus)
    fetch(`/api/drivers?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load drivers') })
  }, [search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setPage(1) }, [])
  const handleFilterStatusChange = useCallback((value: string | null) => { setFilterStatus(value); setPage(1) }, [])
  const handleClearFilters = useCallback(() => { setFilterStatus(null); setPage(1) }, [])
  const handlePageSizeChange = useCallback((size: number) => { setPageSize(size); setPage(1) }, [])

  // ── Derived Data ──
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    data.forEach(d => { c[d.status] = (c[d.status] || 0) + 1 })
    return c
  }, [data])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (filterStatus && d.status !== filterStatus) return false
      return true
    })
  }, [data, filterStatus])

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

  // ── KPI ──
  const activeCount = data.filter(d => d.status === 'active').length
  const inactiveCount = data.filter(d => d.status !== 'active').length

  // Best driver: highest success rate with at least 5 orders
  const bestDriver = useMemo(() => {
    const qualified = data.filter(d => d.ordersReceived >= 5)
    if (qualified.length === 0) return null
    return qualified.reduce((best, d) => d.successRate > best.successRate ? d : best, qualified[0])
  }, [data])

  const totalExpected = data.reduce((s, d) => s + d.expectedBankings, 0)
  const totalBanked = data.reduce((s, d) => s + d.banked, 0)
  const totalPending = totalExpected - totalBanked

  const stats = [
    { label: 'Active Drivers', value: activeCount, icon: UserCheck, color: '#22C55E', bg: 'bg-green-500/15', border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Inactive', value: inactiveCount, icon: UserX, color: '#94A3B8', bg: 'bg-gray-400/15', border: 'border-gray-400/20', gradient: 'from-gray-400/10 to-gray-400/5' },
    { label: 'Pending Banking', value: fmtMoney(totalPending), icon: Banknote, color: '#FF6B35', bg: 'bg-orange-500/15', border: 'border-orange-500/20', gradient: 'from-orange-500/10 to-orange-500/5' },
    ...(bestDriver ? [{ label: 'Best Driver', value: bestDriver.name, icon: TrendingUp, color: '#8B5CF6', bg: 'bg-purple-500/15', border: 'border-purple-500/20', gradient: 'from-purple-500/10 to-purple-500/5' }] : []),
  ]

  // ── Filter Chips ──
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    if (filterStatus) {
      const label = DRIVER_STATUSES.find(s => s.key === filterStatus)?.label || filterStatus
      chips.push({ key: 'status', label: `Status: ${label}`, onRemove: () => setFilterStatus(null) })
    }
    return chips
  }, [filterStatus])

  const allOnPageSelected = paginatedData.length > 0 && paginatedData.every(r => selectedIds.has(r.id))
  const someOnPageSelected = paginatedData.some(r => selectedIds.has(r.id)) && !allOnPageSelected

  // ── Table Columns ──
  const tableColumns: Column<Driver>[] = useMemo(() => [
    { key: 'driverId', label: 'Driver ID', sortable: true, className: 'font-mono text-xs text-gray-400' },
    { key: 'name', label: 'Driver Name', sortable: true, className: 'font-semibold text-gray-900' },
    { key: 'phone', label: 'Phone', sortable: true, className: 'text-gray-600', render: (val) => <span className="flex items-center gap-1"><Phone size={12} className="text-gray-400 shrink-0" />{String(val)}</span> },
    { key: 'nationalId', label: 'National ID', sortable: true, className: 'text-xs text-gray-500 font-mono' },
    { key: 'licenseNumber', label: 'License No', sortable: true, className: 'text-xs text-gray-500 font-mono' },
    { key: 'vehicleType', label: 'Vehicle Type', sortable: true, render: (val) => val ? <span className="bg-gray-50 text-gray-700 px-2 py-0.5 rounded-md text-xs">{String(val)}</span> : <span className="text-gray-300">—</span> },
    { key: 'vehicleNumber', label: 'Plate No', sortable: true, className: 'text-xs font-mono' },
    { key: 'status', label: 'Status', sortable: true, render: (val) => statusBadge(String(val)) },
    { key: 'createdBy', label: 'Created By', sortable: true, className: 'text-xs text-gray-500' },
    { key: 'ordersReceived', label: 'Orders Recvd', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center' },
    { key: 'ordersDelivered', label: 'Delivered', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center' },
    { key: 'successRate', label: 'Success %', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center', render: (val) => { const v = val as number; return <span className={`font-semibold ${v >= 80 ? 'text-green-600' : v >= 50 ? 'text-amber-600' : v > 0 ? 'text-red-600' : 'text-gray-400'}`}>{v}%</span> } },
    { key: 'damages', label: 'Damages', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center', render: (val) => { const v = val as number; return v > 0 ? <span className="text-red-600 font-medium">{fmtMoney(v)}</span> : <span className="text-gray-300">0</span> } },
    { key: 'loss', label: 'Loss', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center', render: (val) => { const v = val as number; return v > 0 ? <span className="text-red-600 font-medium">{fmtMoney(v)}</span> : <span className="text-gray-300">0</span> } },
    { key: 'riskPercent', label: 'Risk %', sortable: true, className: 'tabular-nums text-center', headerClassName: 'text-center', render: (val) => { const v = val as number; return <span className={`font-semibold ${v <= 10 ? 'text-green-600' : v <= 30 ? 'text-amber-600' : v > 0 ? 'text-red-600' : 'text-gray-400'}`}>{v}%</span> } },
    { key: 'expectedBankings', label: 'Expected Bank', sortable: true, className: 'tabular-nums', render: (val) => fmtMoney(val as number) },
    { key: 'banked', label: 'Banked', sortable: true, className: 'tabular-nums', render: (val) => fmtMoney(val as number) },
  ], [])

  // ── Batch Export ──
  const handleBatchExport = useCallback(() => {
    const selected = data.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    exportCSV('drivers-export.csv',
      ['Driver ID', 'Name', 'Phone', 'National ID', 'License No', 'Vehicle Type', 'Plate No', 'Status', 'Created By', 'Orders Received', 'Orders Delivered', 'Success Rate', 'Damages', 'Loss', 'Risk %', 'Expected Bankings', 'Banked', 'Pending'],
      selected.map(d => [d.driverId, d.name, d.phone, d.nationalId, d.licenseNumber, d.vehicleType, d.vehicleNumber, d.status, d.createdBy, d.ordersReceived, d.ordersDelivered, d.successRate, d.damages, d.loss, d.riskPercent, d.expectedBankings, d.banked, d.expectedBankings - d.banked]))
    toast.success(`Exported ${selected.length} drivers`)
  }, [data, selectedIds])

  const handleExportAll = useCallback(() => {
    if (filteredData.length === 0) return
    exportCSV('drivers-export.csv',
      ['Driver ID', 'Name', 'Phone', 'National ID', 'License No', 'Vehicle Type', 'Plate No', 'Status', 'Created By', 'Orders Received', 'Orders Delivered', 'Success Rate', 'Damages', 'Loss', 'Risk %', 'Expected Bankings', 'Banked', 'Pending'],
      filteredData.map(d => [d.driverId, d.name, d.phone, d.nationalId, d.licenseNumber, d.vehicleType, d.vehicleNumber, d.status, d.createdBy, d.ordersReceived, d.ordersDelivered, d.successRate, d.damages, d.loss, d.riskPercent, d.expectedBankings, d.banked, d.expectedBankings - d.banked]))
    toast.success(`Exported ${filteredData.length} drivers`)
  }, [filteredData])

  // ── Batch Delete ──
  const handleBatchDelete = useCallback(async () => {
    const selected = data.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return
    let deleted = 0
    const results = await Promise.allSettled(
      selected.map(async d => {
        const res = await fetch(`/api/drivers?id=${d.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const err = await res.json()
          return { ok: false, name: d.name, error: err.error }
        }
        return { ok: true, name: d.name }
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.ok) deleted++
        else toast.error(r.value.error)
      }
    }
    if (deleted > 0) toast.success(`Deleted ${deleted} driver${deleted > 1 ? 's' : ''}`)
    setSelectedIds(new Set())
    fetchData()
  }, [data, selectedIds, fetchData])

  // ── Single Delete ──
  const handleDelete = useCallback(async (driver: Driver) => {
    try {
      const res = await fetch(`/api/drivers?id=${driver.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      setDetailOpen(false)
      setSelectedRecord(null)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(driver.id); return n })
      fetchData()
    } catch { toast.error('Failed to delete driver') }
  }, [fetchData])

  // ── Form Handlers ──
  const resetForm = () => {
    setForm({ name: '', phone: '', nationalId: '', licenseNumber: '', vehicleType: '', vehicleNumber: '', status: 'active', damages: '', loss: '', expectedBankings: '', banked: '' })
    setEditing(null)
  }

  const openCreate = () => { resetForm(); setOpen(true) }

  const handleEdit = (driver: Driver) => {
    setEditing(driver)
    setForm({
      name: driver.name,
      phone: driver.phone,
      nationalId: driver.nationalId || '',
      licenseNumber: driver.licenseNumber || '',
      vehicleType: driver.vehicleType || '',
      vehicleNumber: driver.vehicleNumber || '',
      status: driver.status,
      damages: String(driver.damages || 0),
      loss: String(driver.loss || 0),
      expectedBankings: String(driver.expectedBankings || 0),
      banked: String(driver.banked || 0),
    })
    setOpen(true)
  }

  const handleClose = () => { setOpen(false); resetForm() }

  const handleSubmit = async () => {
    if (!form.name || !form.phone) { toast.error('Name and phone are required'); return }
    setSubmitting(true)
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        nationalId: form.nationalId || null,
        licenseNumber: form.licenseNumber || null,
        vehicleType: form.vehicleType || null,
        vehicleNumber: form.vehicleNumber || null,
        status: form.status,
        damages: parseFloat(form.damages) || 0,
        loss: parseFloat(form.loss) || 0,
        expectedBankings: parseFloat(form.expectedBankings) || 0,
        banked: parseFloat(form.banked) || 0,
      }
      if (editing) {
        await fetch('/api/drivers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success(`Driver "${form.name}" updated`)
      } else {
        await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success(`Driver "${form.name}" added`)
      }
      setOpen(false); resetForm(); fetchData()
    } catch { toast.error('Failed to save driver. Please try again.') } finally { setSubmitting(false) }
  }

  // ════════════════════════════════════════
  // ── RENDER ──
  // ════════════════════════════════════════

  // If profile is open, render the full dossier page
  if (profileDriver) {
    return (
      <div className="max-w-5xl mx-auto">
        <DriverProfile driver={profileDriver} onBack={() => setProfileDriver(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <OpsHeader
        title="Drivers"
        description="Manage delivery fleet, driver assignments, and performance"
        kpiCells={[
          { label: 'TOTAL', value: data.length },
          { label: 'ACTIVE', value: data.filter(d => d.status === 'active').length },
          { label: 'EXPECTED BANKINGS', value: `UGX ${data.reduce((s, d) => s + (d.expectedBankings || 0), 0).toLocaleString()}` },
          { label: 'BANKED', value: `UGX ${data.reduce((s, d) => s + (d.banked || 0), 0).toLocaleString()}` },
        ]}
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search drivers, phone, ID..."
        actionLabel="Add Driver"
        onAction={openCreate}
      >
        <StatusFilter selected={filterStatus} onSelect={handleFilterStatusChange} statuses={DRIVER_STATUSES} counts={statusCounts} />
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <Button variant="outline" size="sm" className="rounded-xl border-gray-200 h-9 text-xs font-medium gap-1.5" onClick={handleExportAll}>
          <Upload size={13} />Export
        </Button>
        <Select value={String(pageSize)} onValueChange={v => handlePageSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[100px] rounded-xl border-gray-200 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}</SelectContent>
        </Select>
      </OpsHeader>

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
            <Button variant="outline" size="sm" className="rounded-lg text-xs border-white/20 text-white hover:bg-white/10" onClick={handleBatchExport}><Upload size={13} className="mr-1.5" />Export Selected</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="rounded-lg text-xs border-red-400/30 text-red-300 hover:bg-red-500/20"><Trash2 size={13} className="mr-1.5" />Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selectedIds.size} drivers?</AlertDialogTitle><AlertDialogDescription>Only drivers without outbound movement will be deleted. Drivers with assigned orders will be skipped.</AlertDialogDescription></AlertDialogHeader>
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
          <span>{filteredData.length.toLocaleString()} driver{filteredData.length !== 1 ? 's' : ''} found</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected }} onChange={() => {
                if (allOnPageSelected) clearSelection()
                else setSelectedIds(prev => { const n = new Set(prev); paginatedData.forEach(r => n.add(r.id)); return n })
              }} className="rounded" />
              <span>Select page</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Loading / Empty / Card Grid / Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
      ) : paginatedData.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No drivers found</p>
          <p className="text-xs mt-1">Try adjusting your search or add a new driver</p>
        </div>
      ) : viewMode === 'card' ? (
        <>
          <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
            {paginatedData.map((driver) => {
              const isSelected = selectedIds.has(driver.id)
              const pending = driver.expectedBankings - driver.banked
              const successColor = driver.successRate >= 80 ? 'text-green-600' : driver.successRate >= 50 ? 'text-amber-600' : driver.ordersReceived > 0 ? 'text-red-600' : 'text-gray-400'
              const riskColor = driver.riskPercent <= 10 ? 'text-green-600' : driver.riskPercent <= 30 ? 'text-amber-600' : driver.ordersReceived > 0 ? 'text-red-600' : 'text-gray-400'
              return (
                <motion.div key={driver.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                  className={`group relative bg-white rounded-2xl border-2 border-l-4 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#FF6B35]/30 ${statusBorderAccent(driver.status)} ${isSelected ? 'border-[#FF6B35] shadow-md' : 'border-gray-100'}`}
                  onClick={() => { setSelectedRecord(driver); setDetailOpen(true) }}
                  onDoubleClick={() => { setDetailOpen(false); setProfileDriver(driver) }}>
                  {/* Checkbox */}
                  <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(driver.id)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300 bg-transparent'}`}>
                      {isSelected && <span className="text-white text-[10px]">✓</span>}
                    </button>
                  </div>
                  {/* Top row: Avatar + ID + Status + Notifications */}
                  <div className="flex items-start gap-3 mb-3 pr-8">
                    <div className="w-10 h-10 rounded-xl border-2 border-white shadow-sm overflow-hidden shrink-0 bg-gradient-to-br from-[#FF6B35]/20 to-[#FF6B35]/5 flex items-center justify-center -mt-1">
                      {driver.profileImage ? (
                        <img src={driver.profileImage} alt={driver.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-[#FF6B35]">{driver.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">{driver.driverId}</span>
                        {statusBadge(driver.status)}
                        {driver.notificationCount > 0 && (
                          <span className="flex items-center gap-1 bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                            <Bell size={10} />{driver.notificationCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Name */}
                  <h3 className="text-base font-semibold text-gray-900 leading-snug mb-1 group-hover:text-[#FF6B35] transition-colors">{driver.name}</h3>
                  {/* Phone + Vehicle */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1"><Phone size={12} className="text-gray-400 shrink-0" />{driver.phone}</span>
                    {driver.vehicleNumber && (
                      <span className="flex items-center gap-1"><Car size={12} className="text-gray-400 shrink-0" />{driver.vehicleNumber}</span>
                    )}
                  </div>
                  {/* Performance metrics row */}
                  {driver.ordersReceived > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Delivered</p>
                        <p className="text-sm font-bold text-gray-800">{driver.ordersDelivered}/{driver.ordersReceived}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Success</p>
                        <p className={`text-sm font-bold ${successColor}`}>{driver.successRate}%</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Risk</p>
                        <p className={`text-sm font-bold ${riskColor}`}>{driver.riskPercent}%</p>
                      </div>
                    </div>
                  )}
                  {/* Banking row */}
                  {driver.expectedBankings > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Expected</p>
                        <p className="text-sm font-bold text-gray-800">{fmtMoney(driver.expectedBankings)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Pending</p>
                        <p className={`text-sm font-bold ${pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmtMoney(pending)}</p>
                      </div>
                    </div>
                  )}
                  {/* Bottom row: hint + Date */}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      {driver.vehicleType && <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-md text-[11px]">{driver.vehicleType}</span>}
                      {(driver.damages > 0 || driver.loss > 0) && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={10} />Losses</span>}
                    </div>
                    <span>Double-click for full profile</span>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>

          {/* Card pagination */}
          {sortedData.length > pageSize && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-gray-500">
                Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, sortedData.length)} of {sortedData.length.toLocaleString()}
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
        </>
      ) : (
        <DataTable
          data={paginatedData}
          columns={tableColumns}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => { setSelectedRecord(r); setDetailOpen(true) }}
          rowClassName={(r) => selectedIds.has(r.id) ? 'bg-[#FF6B35]/5' : ''}
          pageSize={100}
        />
      )}

      {/* ══════════════════════════════════ */}
      {/* ── DETAIL SLIDE-OVER ── */}
      {/* ══════════════════════════════════ */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title={selectedRecord?.name || 'Driver Details'}
        subtitle={selectedRecord ? `ID: ${selectedRecord.driverId}` : ''}
        width="xl"
        footer={
          selectedRecord ? (
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => { setDetailOpen(false); setProfileDriver(selectedRecord) }} className="rounded-xl text-[#FF6B35] border-[#FF6B35]/30 hover:bg-[#FF6B35]/5">
                View Full Profile
              </Button>
              <Button variant="outline" onClick={() => { setDetailOpen(false); handleEdit(selectedRecord) }} className="rounded-xl">
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50">
                    <Trash2 size={14} className="mr-1.5" />Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete driver &ldquo;{selectedRecord.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {selectedRecord.ordersReceived > 0
                        ? `This driver has ${selectedRecord.ordersReceived} outbound order(s) and cannot be deleted. Only drivers without any movement can be deleted.`
                        : 'This action cannot be undone. The driver record will be permanently removed.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    {selectedRecord.ordersReceived === 0 && (
                      <AlertDialogAction onClick={() => handleDelete(selectedRecord)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    )}
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : undefined
        }
      >
        {selectedRecord && (
          <div className="space-y-5">
            {/* Status + Quick Stats */}
            <div className="flex items-center gap-3">
              {statusBadge(selectedRecord.status)}
              {selectedRecord.ordersReceived > 0 && (
                <div className="flex items-center gap-3 ml-auto text-xs">
                  <span className="flex items-center gap-1 text-green-600 font-medium"><TrendingUp size={13} />{selectedRecord.successRate}% success</span>
                  {selectedRecord.riskPercent > 0 && (
                    <span className={`flex items-center gap-1 font-medium ${selectedRecord.riskPercent <= 20 ? 'text-green-600' : 'text-red-600'}`}>
                      <ShieldAlert size={13} />{selectedRecord.riskPercent}% risk
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Personal Information */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Driver ID</p>
                  <p className="font-mono text-gray-700">{selectedRecord.driverId}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                  {statusBadge(selectedRecord.status)}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Phone</p>
                  <p className="text-gray-700 flex items-center gap-1"><Phone size={13} className="text-gray-400" />{selectedRecord.phone}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">National ID</p>
                  <p className="text-gray-700 font-mono">{selectedRecord.nationalId || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created By</p>
                  <p className="text-gray-700">{selectedRecord.createdBy || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                  <p className="text-gray-700">{new Date(selectedRecord.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Vehicle Information */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vehicle Information</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Vehicle Type</p>
                  <p className="text-gray-700">{selectedRecord.vehicleType || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Plate No</p>
                  <p className="text-gray-700 font-mono">{selectedRecord.vehicleNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">License No</p>
                  <p className="text-gray-700 font-mono">{selectedRecord.licenseNumber || '—'}</p>
                </div>
              </div>
            </div>

            {/* Performance Metrics */}
            {selectedRecord.ordersReceived > 0 && (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Performance</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider">Success Rate</span>
                      <Shield size={14} className={selectedRecord.successRate >= 80 ? 'text-green-500' : selectedRecord.successRate >= 50 ? 'text-amber-500' : 'text-red-500'} />
                    </div>
                    <p className={`text-2xl font-bold ${selectedRecord.successRate >= 80 ? 'text-green-600' : selectedRecord.successRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{selectedRecord.successRate}%</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${selectedRecord.successRate >= 80 ? 'bg-green-500' : selectedRecord.successRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ '--bar-pct': `${selectedRecord.successRate}%` } as React.CSSProperties} />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider">Risk Level</span>
                      <ShieldAlert size={14} className={selectedRecord.riskPercent <= 10 ? 'text-green-500' : selectedRecord.riskPercent <= 30 ? 'text-amber-500' : 'text-red-500'} />
                    </div>
                    <p className={`text-2xl font-bold ${selectedRecord.riskPercent <= 10 ? 'text-green-600' : selectedRecord.riskPercent <= 30 ? 'text-amber-600' : 'text-red-600'}`}>{selectedRecord.riskPercent}%</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${selectedRecord.riskPercent <= 10 ? 'bg-green-500' : selectedRecord.riskPercent <= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ '--bar-pct': `${Math.min(selectedRecord.riskPercent, 100)}%` } as React.CSSProperties} />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Orders Received</p>
                    <p className="text-xl font-bold text-gray-800">{selectedRecord.ordersReceived.toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Orders Delivered</p>
                    <p className="text-xl font-bold text-green-600">{selectedRecord.ordersDelivered.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Financial Tracking */}
            {(selectedRecord.expectedBankings > 0 || selectedRecord.damages > 0 || selectedRecord.loss > 0) && (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Financial Tracking</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Expected Bankings</p>
                    <p className="text-lg font-bold text-gray-800">{fmtMoney(selectedRecord.expectedBankings)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Banked</p>
                    <p className="text-lg font-bold text-green-600">{fmtMoney(selectedRecord.banked)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Pending</p>
                    <p className={`text-lg font-bold ${selectedRecord.expectedBankings - selectedRecord.banked > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmtMoney(selectedRecord.expectedBankings - selectedRecord.banked)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Damages & Loss</p>
                    <p className={`text-lg font-bold ${(selectedRecord.damages + selectedRecord.loss) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtMoney(selectedRecord.damages + selectedRecord.loss)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailSlideOver>

      {/* ══════════════════════════════════ */}
      {/* ── CREATE / EDIT SLIDE-OVER ── */}
      {/* ══════════════════════════════════ */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `Edit: ${editing.name}` : 'New Driver'}
        subtitle={editing ? `ID: ${editing.driverId}` : 'Fill in the details to add a new driver'}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              {editing ? 'Update Driver' : 'Add Driver'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Driver ID</p>
                <p className="font-mono text-gray-700">{editing.driverId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                {statusBadge(editing.status)}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            {editing.ordersReceived > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Package size={12} />{editing.ordersReceived} orders received</span>
                <span className="flex items-center gap-1 text-green-600"><TrendingUp size={12} />{editing.successRate}% success</span>
                {editing.riskPercent > 0 && <span className="flex items-center gap-1 text-amber-600"><ShieldAlert size={12} />{editing.riskPercent}% risk</span>}
              </div>
            )}
          </div>
        )}

        <div className="space-y-5">
          {/* Personal Info */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Full Name <span className="text-red-400">*</span></Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Stephen Opalakiro" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-red-400">*</span></Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g., 0771234567" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">National ID</Label>
                <Input value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} placeholder="e.g., CF12345678" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">License No</Label>
                <Input value={form.licenseNumber} onChange={e => setForm({ ...form, licenseNumber: e.target.value })} placeholder="e.g., DL-45231" className="rounded-xl" />
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vehicle Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Vehicle Type</Label>
                <Select value={form.vehicleType} onValueChange={v => setForm({ ...form, vehicleType: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{VEHICLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Plate Number</Label>
                <Input value={form.vehicleNumber} onChange={e => setForm({ ...form, vehicleNumber: e.target.value })} placeholder="e.g., UBA 234J" className="rounded-xl" />
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block">Driver Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Financial (only when editing) */}
          {editing && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Financial Tracking</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Expected Bankings (KES)</Label>
                  <Input type="number" value={form.expectedBankings} onChange={e => setForm({ ...form, expectedBankings: e.target.value })} placeholder="0" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Banked (KES)</Label>
                  <Input type="number" value={form.banked} onChange={e => setForm({ ...form, banked: e.target.value })} placeholder="0" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Damages (KES)</Label>
                  <Input type="number" value={form.damages} onChange={e => setForm({ ...form, damages: e.target.value })} placeholder="0" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Loss (KES)</Label>
                  <Input type="number" value={form.loss} onChange={e => setForm({ ...form, loss: e.target.value })} placeholder="0" className="rounded-xl" />
                </div>
              </div>
            </div>
          )}
        </div>
      </DetailSlideOver>
    </div>
  )
}
