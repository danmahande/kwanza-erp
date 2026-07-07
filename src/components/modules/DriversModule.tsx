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
  MessageSquare, Plus, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
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
  shiftStart: string | null; shiftEnd: string | null
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
  if (n == null || isNaN(n)) return 'UGX 0'
  return `UGX ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
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

  // ── Filters ──
  const [filterStatus, setFilterStatus] = useState<string | null>(null)

  // ── SlideOvers ──
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<Driver | null>(null)
  const [profileDriver, setProfileDriver] = useState<Driver | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Driver performance state (parity with Merchants Performance tab)
  const [driverPerf, setDriverPerf] = useState<Record<string, unknown> | null>(null)
  const [driverPerfLoading, setDriverPerfLoading] = useState(false)
  const [driverPerfWindow, setDriverPerfWindow] = useState(30)

  // Driver communication log state
  const [driverCommEntries, setDriverCommEntries] = useState<Array<Record<string, unknown>>>([])
  const [driverCommLoading, setDriverCommLoading] = useState(false)
  const [driverCommForm, setDriverCommForm] = useState({ type: 'call', direction: 'outbound', subject: '', notes: '', customerName: '', customerContact: '', orderNumber: '', followUpAt: '', isResolved: true })
  const [driverCommLoaded, setDriverCommLoaded] = useState(false)

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
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
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

  const handleShiftToggle = async (driver: Driver) => {
    const isOnShift = !!driver.shiftStart && !driver.shiftEnd
    if (isOnShift) {
      await fetch('/api/drivers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: driver.id, shiftEnd: new Date().toISOString() }) })
      toast.success(`${driver.name} checked out`)
    } else {
      await fetch('/api/drivers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: driver.id, shiftStart: new Date().toISOString(), shiftEnd: null }) })
      toast.success(`${driver.name} checked in`)
    }
    fetchData()
  }

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

  // Load driver performance data on slide-over open
  const loadDriverPerf = useCallback(async (driver: Driver | null, days: number) => {
    if (!driver) return
    setDriverPerfLoading(true)
    try {
      const res = await fetch(`/api/drivers/${driver.id}/performance?days=${days}`)
      const d = await res.json()
      setDriverPerf(d)
    } catch {
      setDriverPerf(null)
    } finally {
      setDriverPerfLoading(false)
    }
  }, [])

  const handleDriverPerfWindowChange = (days: number) => {
    setDriverPerfWindow(days)
    loadDriverPerf(selectedRecord, days)
  }

  // Load driver communication entries
  const loadDriverComm = useCallback(async (driver: Driver | null) => {
    if (!driver) return
    setDriverCommLoading(true)
    try {
      const res = await fetch(`/api/driver-communication?driverId=${driver.driverId}&limit=50`)
      const d = await res.json()
      setDriverCommEntries(Array.isArray(d) ? d : [])
      setDriverCommLoaded(true)
    } catch {
      setDriverCommEntries([])
    } finally {
      setDriverCommLoading(false)
    }
  }, [])

  const handleSaveDriverComm = async () => {
    if (!selectedRecord) return
    if (!driverCommForm.subject.trim()) { toast.error('Subject is required'); return }
    try {
      const res = await fetch('/api/driver-communication', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedRecord.driverId,
          driverName: selectedRecord.name,
          type: driverCommForm.type, direction: driverCommForm.direction,
          subject: driverCommForm.subject, notes: driverCommForm.notes || null,
          customerName: driverCommForm.customerName || null,
          customerContact: driverCommForm.customerContact || null,
          orderNumber: driverCommForm.orderNumber || null,
          recordedBy: 'admin',
          followUpAt: driverCommForm.followUpAt ? new Date(driverCommForm.followUpAt).toISOString() : null,
          isResolved: driverCommForm.isResolved,
        }),
      })
      if (res.ok) {
        toast.success('Driver communication logged')
        setDriverCommForm({ type: 'call', direction: 'outbound', subject: '', notes: '', customerName: '', customerContact: '', orderNumber: '', followUpAt: '', isResolved: true })
        loadDriverComm(selectedRecord)
      } else { toast.error('Failed to log') }
    } catch { toast.error('Failed to log') }
  }

  const handleDeleteDriverComm = async (id: string) => {
    if (!selectedRecord) return
    await fetch(`/api/driver-communication?id=${id}`, { method: 'DELETE' })
    toast.success('Entry deleted')
    loadDriverComm(selectedRecord)
  }

  const handleToggleDriverCommResolved = async (entry: Record<string, unknown>) => {
    if (!selectedRecord) return
    await fetch('/api/driver-communication', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, isResolved: !entry.isResolved }),
    })
    loadDriverComm(selectedRecord)
  }

  // Open slide-over with perf + comm data loading
  const openDriverDetail = (driver: Driver) => {
    setSelectedRecord(driver)
    setDetailOpen(true)
    setDriverPerf(null)
    setDriverCommEntries([])
    setDriverCommLoaded(false)
    loadDriverPerf(driver, driverPerfWindow)
    loadDriverComm(driver)
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

      {/* ── Loading / Empty / Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" /></div>
      ) : paginatedData.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No drivers found</p>
          <p className="text-xs mt-1">Try adjusting your search or add a new driver</p>
        </div>
      ) : (
        <DataTable
          data={paginatedData}
          columns={tableColumns}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => openDriverDetail(r)}
          rowClassName={() => ''}
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
        width="lg"
        footer={
          selectedRecord ? (
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                size="sm"
                className={`rounded-xl ${selectedRecord.shiftStart && !selectedRecord.shiftEnd ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-700 border-green-200 hover:bg-green-50'}`}
                onClick={() => handleShiftToggle(selectedRecord)}
              >
                {selectedRecord.shiftStart && !selectedRecord.shiftEnd ? 'Check Out' : 'Check In'}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); setProfileDriver(selectedRecord) }} className="rounded-xl text-[#FF6B35] border-[#FF6B35]/30 hover:bg-[#FF6B35]/5">
                  Full Profile
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); handleEdit(selectedRecord) }} className="rounded-xl">
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50">
                      <Trash2 size={12} className="mr-1" />Delete
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

            {/* Performance, single dense card with stacked progress bars */}
            {selectedRecord.ordersReceived > 0 && (
              <div className="space-y-3">
                {/* Window selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Performance window:</span>
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => handleDriverPerfWindowChange(d)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${driverPerfWindow === d ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {d}d
                    </button>
                  ))}
                  {driverPerfLoading && <span className="text-[10px] text-gray-400 ml-1">Loading…</span>}
                </div>

                {/* Single dense card, all rates stacked with thin progress bars */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                    Delivery Performance ({(driverPerf as Record<string, { days?: number }>)?.window?.days || driverPerfWindow}d)
                  </h4>
                  {driverPerfLoading ? (
                    <p className="text-xs text-gray-400 text-center py-4">Computing performance metrics...</p>
                  ) : driverPerf ? (
                    <div className="space-y-3">
                      {(() => {
                        const rates = (driverPerf as { rates: Record<string, number> }).rates
                        const totals = (driverPerf as { totals: Record<string, number> }).totals
                        return [
                          { label: 'Success Rate', value: rates.successRate, sub: `${totals.delivered} of ${totals.orders} delivered`, good: 85, ok: 60, invert: false },
                          { label: 'First Attempt Success', value: rates.firstAttemptRate, sub: 'delivered on first try', good: 70, ok: 50, invert: false },
                          { label: 'Failure Rate', value: rates.failureRate, sub: `${totals.failed} failed`, good: 5, ok: 15, invert: true },
                          { label: 'Cancellation Rate', value: rates.cancellationRate, sub: `${totals.cancelled} cancelled`, good: 5, ok: 10, invert: true },
                          { label: 'COD Collection Rate', value: rates.codRate, sub: 'cash collected vs sale value', good: 90, ok: 70, invert: false },
                          { label: 'Banking Rate', value: rates.bankingRate, sub: `${totals.bankingsVerified}/${totals.bankingsCount} verified`, good: 90, ok: 70, invert: false },
                        ].map((m, i) => {
                          const color = m.invert
                            ? (m.value <= m.good ? 'green' : m.value <= m.ok ? 'orange' : 'red')
                            : (m.value >= m.good ? 'green' : m.value >= m.ok ? 'orange' : 'red')
                          const barColor = color === 'green' ? 'bg-green-500' : color === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                          const textColor = color === 'green' ? 'text-green-700' : color === 'orange' ? 'text-orange-700' : 'text-red-700'
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">{m.label}</span>
                                <span className={`font-mono font-bold text-sm ${textColor}`}>{m.value}%</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(m.value, 100)}%` }} />
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5">{m.sub}</p>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">No performance data</p>
                  )}
                </div>

                {/* Cycle time + risk + sparkline */}
                {driverPerf && !driverPerfLoading && (() => {
                  const p = driverPerf as {
                    cycleTime: { avgHours: number; avgMins: number; samples: number }
                    rates: { riskPercent: number }
                    totals: { trips: number; distance: number; inTransit: number; bankingsPending: number }
                    cod: { totalSale: number; totalCollected: number; totalBanked: number; unbanked: number; bankingShortfall: number }
                    damages: { damages: number; loss: number; total: number }
                    sparkline: Array<{ date: string; total: number; delivered: number }>
                  }
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Cycle Time & Trips</h4>
                        <p className="text-2xl font-mono font-bold text-gray-900">{p.cycleTime.avgHours}<span className="text-xs text-gray-400 ml-1">h</span></p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{p.cycleTime.avgMins} min avg, {p.cycleTime.samples} samples</p>
                        <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-[10px]">
                          <div><span className="text-gray-400">Trips:</span> <span className="font-mono font-bold text-blue-600">{p.totals.trips}</span></div>
                          <div><span className="text-gray-400">Distance:</span> <span className="font-mono font-bold text-gray-700">{p.totals.distance}km</span></div>
                          <div><span className="text-gray-400">In Transit:</span> <span className="font-mono font-bold text-blue-600">{p.totals.inTransit}</span></div>
                          <div><span className="text-gray-400">Pending Bank:</span> <span className="font-mono font-bold text-orange-600">{p.totals.bankingsPending}</span></div>
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">7-Day Volume</h4>
                        <div className="flex items-end gap-1 h-12 mt-1">
                          {p.sparkline.map((d, i) => {
                            const maxVol = Math.max(...p.sparkline.map(s => s.total), 1)
                            const totalH = (d.total / maxVol) * 100
                            const delivH = d.total > 0 ? (d.delivered / d.total) * totalH : 0
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.delivered}/${d.total} delivered`}>
                                <div className="w-full flex flex-col justify-end h-10 relative">
                                  <div className="w-full bg-orange-200 rounded-t" style={{ height: `${totalH}%` }} />
                                  <div className="w-full bg-orange-500 absolute bottom-0" style={{ height: `${delivH}%` }} />
                                </div>
                                <span className="text-[8px] text-gray-400">{d.date.slice(-2)}</span>
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1">Dark = delivered, light = total</p>
                      </div>
                    </div>
                  )
                })()}

                {/* COD + damages reconciliation, single card with stacked rows */}
                {driverPerf && !driverPerfLoading && (() => {
                  const p = driverPerf as {
                    cod: { totalSale: number; totalCollected: number; totalBanked: number; unbanked: number; bankingShortfall: number }
                    damages: { damages: number; loss: number; total: number }
                    rates: { riskPercent: number }
                  }
                  return (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Financial Reconciliation ({driverPerfWindow}d)</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-500">Total Sales Delivered</span>
                          <span className="font-mono font-bold text-gray-900">{fmtMoney(p.cod.totalSale)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-500">Cash Collected</span>
                          <span className="font-mono font-bold text-green-700">{fmtMoney(p.cod.totalCollected)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-500">Cash Banked</span>
                          <span className="font-mono font-bold text-blue-700">{fmtMoney(p.cod.totalBanked)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-500">Unbanked Cash (on hand)</span>
                          <span className={`font-mono font-bold ${p.cod.unbanked > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{fmtMoney(p.cod.unbanked)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-500">Banking Shortfall</span>
                          <span className={`font-mono font-bold ${p.cod.bankingShortfall > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtMoney(p.cod.bankingShortfall)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-gray-500">Damages + Loss</span>
                          <span className={`font-mono font-bold ${p.damages.total > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtMoney(p.damages.total)}</span>
                        </div>
                      </div>
                      {p.cod.bankingShortfall > 0 && (
                        <p className="text-[10px] text-orange-600 mt-2 pt-2 border-t border-gray-100">⚠ Banking shortfall, investigate missing cash from driver's bankings.</p>
                      )}
                      {p.damages.total > 0 && (
                        <p className="text-[10px] text-red-600 mt-1">⚠ {fmtMoney(p.damages.total)} in damages/loss. risk score: {p.rates.riskPercent}%</p>
                      )}
                    </div>
                  )
                })()}
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

            {/* ── Communication Log (customer calls/SMS during delivery) ── */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MessageSquare size={13} /> Customer Communication Log
              </h4>

              {/* Add new entry form */}
              <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-2 mb-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1"><Plus size={10} /> Log Customer Communication</p>
                <p className="text-[10px] text-gray-500">Record calls/SMS with customers during delivery attempts, e.g. "customer not at home", "rescheduled", "refused delivery".</p>
                <div className="grid grid-cols-3 gap-2">
                  <select value={driverCommForm.type} onChange={e => setDriverCommForm({ ...driverCommForm, type: e.target.value })}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs">
                    <option value="call">Call</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="visit">Visit</option>
                    <option value="other">Other</option>
                  </select>
                  <select value={driverCommForm.direction} onChange={e => setDriverCommForm({ ...driverCommForm, direction: e.target.value })}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs">
                    <option value="outbound">Outbound (driver called)</option>
                    <option value="inbound">Inbound (customer called)</option>
                  </select>
                  <Input type="datetime-local" value={driverCommForm.followUpAt} onChange={e => setDriverCommForm({ ...driverCommForm, followUpAt: e.target.value })}
                    className="rounded-md text-xs h-8" title="Schedule follow-up (optional)" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Customer name (optional)" value={driverCommForm.customerName}
                    onChange={e => setDriverCommForm({ ...driverCommForm, customerName: e.target.value })} className="rounded-md text-xs h-8" />
                  <Input placeholder="Customer phone (optional)" value={driverCommForm.customerContact}
                    onChange={e => setDriverCommForm({ ...driverCommForm, customerContact: e.target.value })} className="rounded-md text-xs h-8" />
                </div>
                <Input placeholder="Order # (optional, e.g. DS-001)" value={driverCommForm.orderNumber}
                  onChange={e => setDriverCommForm({ ...driverCommForm, orderNumber: e.target.value })} className="rounded-md text-xs h-8" />
                <Input placeholder="Subject, e.g. 'Customer not at home, rescheduled to tomorrow'" value={driverCommForm.subject}
                  onChange={e => setDriverCommForm({ ...driverCommForm, subject: e.target.value })} className="rounded-md text-xs h-8" />
                <textarea placeholder="Notes, what was discussed, what was agreed..." value={driverCommForm.notes}
                  onChange={e => setDriverCommForm({ ...driverCommForm, notes: e.target.value })} rows={2}
                  className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={driverCommForm.isResolved} onChange={e => setDriverCommForm({ ...driverCommForm, isResolved: e.target.checked })}
                      className="rounded" />
                    Resolved (no follow-up needed)
                  </label>
                  <Button size="sm" className="h-7 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={handleSaveDriverComm}>
                    <Plus size={11} className="mr-1" /> Log Entry
                  </Button>
                </div>
              </div>

              {/* Entries list */}
              {driverCommLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading communication log...</p>
              ) : driverCommEntries.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No communication logged.<br />Use the form above to log the first call or WhatsApp with a customer.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {driverCommEntries.map((rawEntry) => {
                    const entry = rawEntry as Record<string, unknown>
                    const isOverdue = !entry.isResolved && entry.followUpAt && new Date(String(entry.followUpAt)) < new Date()
                    const typeColor: Record<string, string> = { call: 'bg-blue-500', whatsapp: 'bg-green-500', sms: 'bg-teal-500', visit: 'bg-orange-500', other: 'bg-gray-400' }
                    const typeIcon: Record<string, string> = { call: '📞', whatsapp: '💬', sms: '✉', visit: '🚶', other: '•' }
                    const eType = String(entry.type || 'other')
                    return (
                      <div key={String(entry.id)} className={`bg-white border rounded-lg p-2.5 ${isOverdue ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`w-6 h-6 rounded-full ${typeColor[eType] || 'bg-gray-400'} text-white flex items-center justify-center text-xs shrink-0`}>{typeIcon[eType] || '•'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] uppercase font-semibold text-gray-500">{eType}</span>
                              <span className={`text-[9px] px-1 rounded ${entry.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{entry.direction === 'inbound' ? '← in' : '→ out'}</span>
                              {entry.isResolved ? (
                                <span className="text-[9px] px-1 rounded bg-green-100 text-green-700">RESOLVED</span>
                              ) : (
                                <span className={`text-[9px] px-1 rounded ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>OPEN{isOverdue ? ', OVERDUE' : ''}</span>
                              )}
                              {entry.orderNumber ? <span className="text-[9px] px-1 rounded bg-gray-200 text-gray-700 font-mono">{String(entry.orderNumber)}</span> : null}
                              <span className="text-[9px] text-gray-400 ml-auto">{new Date(String(entry.createdAt)).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-xs text-gray-900 font-medium mt-0.5">{String(entry.subject || '')}</p>
                            {entry.notes ? <p className="text-[11px] text-gray-600 mt-0.5">{String(entry.notes)}</p> : null}
                            {entry.customerName ? <p className="text-[10px] text-gray-500 mt-0.5">Customer: {String(entry.customerName)}{entry.customerContact ? `, ${String(entry.customerContact)}` : ''}</p> : null}
                            {entry.followUpAt ? (
                              <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                Follow-up: {new Date(String(entry.followUpAt)).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            ) : null}
                            <p className="text-[9px] text-gray-400 mt-0.5">by {String(entry.recordedBy || 'admin')}</p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => handleToggleDriverCommResolved(entry)} title={entry.isResolved ? 'Mark as open' : 'Mark as resolved'}
                              className={`p-1 rounded ${entry.isResolved ? 'text-gray-400 hover:bg-gray-100' : 'text-green-600 hover:bg-green-100'}`}>
                              <CheckCircle2 size={12} />
                            </button>
                            <button onClick={() => handleDeleteDriverComm(String(entry.id))} title="Delete entry"
                              className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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
