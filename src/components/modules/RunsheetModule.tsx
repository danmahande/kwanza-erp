'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ClipboardList, Plus, Truck, CheckCircle2, Clock, XCircle,
  MapPin, Package, DollarSign, ChevronRight, ArrowRight,
  AlertTriangle, FileText, Search, Eye, X,
  ScanBarcode, Ban, CalendarClock, Filter,
  HelpCircle, ArrowLeft as BackIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import PageTransition from '@/components/shared/PageTransition'

// ── Types ──
interface Driver { id: string; driverId: string; name: string; phone: string; vehicleNumber: string | null; status: string }
interface UnassignedOrder { id: string; outboundId: string; customerName: string; customerContact: string; productName: string; qty: number }

interface Stop {
  id: string; outboundId: string; customerName: string; customerContact: string
  customerAddress: string | null; productName: string; productId: string; qty: number
  assignedDriver: string | null; vehicleNumber: string | null; runsheetId: string | null
  stopSequence: number | null; actualDeliveredQty: number | null; codCollected: number | null
  deliveryNotes: string | null; status: string; dispatchedAt: string | null; deliveredAt: string | null
  createdAt: string
  deliveryAttempts?: number | null
  maxAttempts?: number | null
  nextAttemptDate?: string | null
  lastAttemptReason?: string | null
  lastAttemptDate?: string | null
  cancellationReason?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
}

interface Runsheet {
  runsheetId: string; driver: string | null; vehicleNumber: string | null
  date: string; totalStops: number; delivered: number; pending: number; failed: number
  dispatched: number; status: string; totalExpected: number; totalDelivered: number
  totalCOD: number; stops: Stop[]
  cancelled?: number
  rescheduled?: number
}

interface RunsheetData {
  runsheets: Runsheet[]
  unassigned: UnassignedOrder[]
}

// ── Helpers ──
const fmtUGX = (n: number) => n >= 1e6 ? `UGX ${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `UGX ${(n / 1e3).toFixed(1)}K` : `UGX ${n.toLocaleString()}`

const statusStyle = (status: string) => {
  switch (status) {
    case 'delivered': return 'bg-green-500 text-white border-0'
    case 'dispatched': return 'bg-blue-500 text-white border-0'
    case 'pending': return 'bg-amber-100 text-amber-700 border-0'
    case 'failed': return 'bg-red-500 text-white border-0'
    case 'cancelled': return 'bg-gray-400 text-white border-0'
    default: return 'bg-gray-100 text-gray-600 border-0'
  }
}

const rsStatusStyle = (status: string) => {
  switch (status) {
    case 'completed': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: CheckCircle2, iconColor: '#22C55E' }
    case 'in_progress': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Truck, iconColor: '#3B82F6' }
    case 'draft': return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: FileText, iconColor: '#6B7280' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: FileText, iconColor: '#9CA3AF' }
  }
}

const stopStatusIcon = (status: string) => {
  switch (status) {
    case 'delivered': return <CheckCircle2 size={14} className="text-green-500" />
    case 'dispatched': return <Truck size={14} className="text-blue-500" />
    case 'pending': return <Clock size={14} className="text-amber-500" />
    case 'failed': return <XCircle size={14} className="text-red-500" />
    case 'cancelled': return <X size={14} className="text-gray-400" />
    default: return <Clock size={14} className="text-gray-400" />
  }
}

// ── Attempt Tracker ──
const AttemptTracker = ({ attempts = 0, max = 5 }: { attempts?: number; max?: number }) => {
  const isMax = attempts >= max
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < attempts
                ? isMax ? 'bg-red-500' : i === attempts - 1 ? 'bg-amber-500' : 'bg-orange-400'
                : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-semibold ${isMax ? 'text-red-600' : attempts > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
        {attempts}/{max}
      </span>
    </div>
  )
}

// ── Main Component ──
export default function RunsheetModule() {
  const [data, setData] = useState<RunsheetData | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [view, setView] = useState<'list' | 'create' | Runsheet | null>('list')
  const [stopUpdateOpen, setStopUpdateOpen] = useState(false)
  const [updatingStop, setUpdatingStop] = useState<Stop | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Create runsheet form
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [formDriver, setFormDriver] = useState('')
  const [formVehicle, setFormVehicle] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [orderSearch, setOrderSearch] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  // Stop update form
  const [stopForm, setStopForm] = useState({ actualDeliveredQty: '', codCollected: '', deliveryNotes: '', status: '' })

  // Cancel order
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancellingStop, setCancellingStop] = useState<Stop | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNotes, setCancelNotes] = useState('')

  // Reschedule
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [reschedulingStop, setReschedulingStop] = useState<Stop | null>(null)
  const [failReason, setFailReason] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [minRescheduleDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })

  const fetchData = useCallback(() => {
    let url = '/api/runsheet'
    if (search) url += `?search=${search}`
    if (statusFilter && statusFilter !== 'all') url += `${search ? '&' : '?'}status=${statusFilter}`
    fetch(url).then(r => r.json()).then(d => { if (d.runsheets) setData(d) })
  }, [search, statusFilter])

  useEffect(() => { fetch('/api/drivers?status=active').then(r => r.json()).then(setDrivers) }, [])
  useEffect(() => { fetchData() }, [fetchData])

  // ── Create Runsheet ──
  const resetCreateForm = () => {
    setSelectedOrders([]); setFormDriver(''); setFormVehicle(''); setFormNotes('')
    setScanInput(''); setScanMessage(null); setOrderSearch('')
  }

  const handleOpenCreate = () => {
    resetCreateForm()
    setView('create')
  }

  const handleCloseCreate = () => {
    resetCreateForm()
    setView('list')
  }

  const handleCreateRunsheet = async () => {
    if (!formDriver || selectedOrders.length === 0) {
      toast.error('Select a rider and at least one order')
      return
    }
    const driver = drivers.find(d => d.driverId === formDriver)
    const res = await fetch('/api/runsheet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver: driver?.name, vehicleNumber: formVehicle || driver?.vehicleNumber, outboundIds: selectedOrders, notes: formNotes }),
    })
    const result = await res.json()
    if (res.ok) {
      toast.success(`Runsheet ${result.runsheetId} created with ${selectedOrders.length} stops!`)
      handleCloseCreate()
      fetchData()
    } else {
      toast.error(result.error || 'Failed to create runsheet')
    }
  }

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const selectAllOrders = () => {
    if (!data) return
    const filtered = getFilteredUnassigned()
    setSelectedOrders(filtered.map(o => o.id))
  }

  const clearAllOrders = () => {
    setSelectedOrders([])
  }

  const removeFromSelection = (id: string) => {
    setSelectedOrders(prev => prev.filter(x => x !== id))
  }

  // Scan handler -- supports single scan, Enter key, and bulk paste (comma/newline separated)
  const handleScanOrder = () => {
    if (!scanInput.trim() || !data) return
    const raw = scanInput.trim()
    // Support bulk: comma-separated or newline-separated
    const entries = raw.includes(',') || raw.includes('\n')
      ? raw.split(/[,\\n]/).map(s => s.trim()).filter(Boolean)
      : [raw]

    let added = 0
    let skipped = 0
    let notFound = 0

    for (const entry of entries) {
      const query = entry.toUpperCase()
      const found = data.unassigned.find(o => o.outboundId.toUpperCase() === query)
      if (found) {
        if (selectedOrders.includes(found.id)) {
          skipped++
        } else {
          setSelectedOrders(prev => [...prev, found.id])
          added++
        }
      } else {
        notFound++
      }
    }

    if (entries.length > 1) {
      // Bulk result
      const parts: string[] = []
      if (added > 0) parts.push(`${added} added`)
      if (skipped > 0) parts.push(`${skipped} already in list`)
      if (notFound > 0) parts.push(`${notFound} not found`)
      setScanMessage({ type: added > 0 ? 'success' : 'error', text: parts.join(', ') })
    } else {
      if (added > 0) {
        const found = data.unassigned.find(o => o.outboundId.toUpperCase() === raw.toUpperCase())
        setScanMessage({ type: 'success', text: `Added ${found?.outboundId} -- ${found?.customerName}` })
      } else if (skipped > 0) {
        setScanMessage({ type: 'error', text: `Order already in list` })
      } else {
        setScanMessage({ type: 'error', text: `Order not found or already assigned` })
      }
    }

    setScanInput('')
    setTimeout(() => setScanMessage(null), 3000)
    // Auto-refocus for rapid scanning
    setTimeout(() => scanInputRef.current?.focus(), 50)
  }

  // Sorted and filtered unassigned orders (oldest first)
  const getFilteredUnassigned = () => {
    if (!data) return []
    let orders = [...data.unassigned]
    // Filter by search
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase()
      orders = orders.filter(o =>
        o.outboundId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q)
      )
    }
    // Sort oldest first (most urgent)
    return orders
  }

  // Selected orders as full objects for the trip summary
  const getSelectedOrders = () => {
    if (!data) return []
    return selectedOrders.map(id => data.unassigned.find(o => o.id === id)).filter(Boolean) as UnassignedOrder[]
  }

  // ── Update Stop ──
  const openStopUpdate = (stop: Stop) => {
    setUpdatingStop(stop)
    setStopForm({
      actualDeliveredQty: String(stop.actualDeliveredQty ?? ''),
      codCollected: String(stop.codCollected ?? ''),
      deliveryNotes: stop.deliveryNotes ?? '',
      status: stop.status,
    })
    setStopUpdateOpen(true)
  }

  const handleUpdateStop = async () => {
    if (!updatingStop) return
    const res = await fetch('/api/runsheet', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: updatingStop.id,
        actualDeliveredQty: stopForm.actualDeliveredQty ? parseInt(stopForm.actualDeliveredQty) : undefined,
        codCollected: stopForm.codCollected ? parseFloat(stopForm.codCollected) : undefined,
        deliveryNotes: stopForm.deliveryNotes || undefined,
        status: stopForm.status !== updatingStop.status ? stopForm.status : undefined,
      }),
    })
    if (res.ok) {
      toast.success('Stop updated')
      setStopUpdateOpen(false); setUpdatingStop(null)
      fetchData()
      if (view && typeof view === 'object') {
        const updated = await fetch(`/api/runsheet?search=${view.runsheetId}`).then(r => r.json())
        if (updated.runsheets) {
          const rs = updated.runsheets.find((r: Runsheet) => r.runsheetId === view.runsheetId)
          if (rs) setView(rs)
        }
      }
    }
  }

  // ── Cancel Order ──
  const openCancelDialog = (stop: Stop) => {
    setCancellingStop(stop)
    setCancelReason('')
    setCancelNotes('')
    setCancelOpen(true)
  }

  const handleCancelOrder = async () => {
    if (!cancellingStop || !cancelReason) {
      toast.error('Please select a cancellation reason')
      return
    }
    const res = await fetch('/api/runsheet', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cancellingStop.id,
        action: 'cancel',
        reason: `${cancelReason}${cancelNotes ? ': ' + cancelNotes : ''}`,
        cancelledBy: 'Admin',
      }),
    })
    const result = await res.json()
    if (res.ok) {
      toast.success('Order cancelled successfully')
      setCancelOpen(false)
      setCancellingStop(null)
      fetchData()
      // refresh detail view if open
      if (view && typeof view === 'object') {
        const updated = await fetch(`/api/runsheet?search=${view.runsheetId}`).then(r => r.json())
        if (updated.runsheets) {
          const rs = updated.runsheets.find((r: Runsheet) => r.runsheetId === view.runsheetId)
          if (rs) setView(rs)
        }
      }
    } else {
      toast.error(result.error || 'Failed to cancel order')
    }
  }

  // ── Reschedule (delivery failed) ──
  const openRescheduleDialog = (stop: Stop) => {
    setReschedulingStop(stop)
    setFailReason('')
    // Set min date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setRescheduleDate(tomorrow.toISOString().slice(0, 10))
    setRescheduleOpen(true)
  }

  const handleReschedule = async () => {
    if (!reschedulingStop || !failReason || !rescheduleDate) {
      toast.error('Please provide failure reason and reschedule date')
      return
    }
    const res = await fetch('/api/runsheet', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reschedulingStop.id,
        action: 'reschedule',
        failReason,
        nextAttemptDate: new Date(rescheduleDate).toISOString(),
        performedBy: reschedulingStop.assignedDriver || 'Admin',
      }),
    })
    const result = await res.json()
    if (res.ok) {
      if (result.isMaxReached) {
        toast.error(result.message)
      } else {
        toast.success(result.message)
      }
      setRescheduleOpen(false)
      setReschedulingStop(null)
      fetchData()
      if (view && typeof view === 'object') {
        const updated = await fetch(`/api/runsheet?search=${view.runsheetId}`).then(r => r.json())
        if (updated.runsheets) {
          const rs = updated.runsheets.find((r: Runsheet) => r.runsheetId === view.runsheetId)
          if (rs) setView(rs)
        }
      }
    } else {
      toast.error(result.error || 'Failed to reschedule')
    }
  }

  // ── Derived Stats ──
  const totalRunsheets = data?.runsheets.length ?? 0
  const completedRunsheets = data?.runsheets.filter(r => r.status === 'completed').length ?? 0
  const inProgressRunsheets = data?.runsheets.filter(r => r.status === 'in_progress').length ?? 0
  const unassignedCount = data?.unassigned.length ?? 0
  const totalCOD = data?.runsheets.reduce((s, r) => s + r.totalCOD, 0) ?? 0
  const totalStopsCount = data?.runsheets.reduce((s, r) => s + r.totalStops, 0) ?? 0

  const statCards = [
    { title: 'Total Runsheets', value: totalRunsheets, icon: ClipboardList, color: '#FF6B35', bg: 'bg-orange-50', bgGradient: 'from-orange-500/10 to-amber-50', borderColor: 'border-orange-200/60' },
    { title: 'In Progress', value: inProgressRunsheets, icon: Truck, color: '#3B82F6', bg: 'bg-blue-50', bgGradient: 'from-blue-500/10 to-sky-50', borderColor: 'border-blue-200/60' },
    { title: 'Completed', value: completedRunsheets, icon: CheckCircle2, color: '#22C55E', bg: 'bg-green-50', bgGradient: 'from-green-500/10 to-emerald-50', borderColor: 'border-green-200/60' },
    { title: 'Unassigned Orders', value: unassignedCount, icon: AlertTriangle, color: '#F59E0B', bg: 'bg-amber-50', bgGradient: 'from-amber-500/10 to-yellow-50', borderColor: 'border-amber-200/60' },
    { title: 'COD Collected', value: fmtUGX(totalCOD), icon: DollarSign, color: '#8B5CF6', bg: 'bg-purple-50', bgGradient: 'from-purple-500/10 to-violet-50', borderColor: 'border-purple-200/60' },
    { title: 'Total Stops', value: totalStopsCount, icon: MapPin, color: '#1B2A4A', bg: 'bg-slate-50', bgGradient: 'from-slate-500/10 to-gray-50', borderColor: 'border-slate-200/60' },
  ]

  // ── Detail View ──
  if (view && typeof view === 'object') {
    const rs = view
    const st = rsStatusStyle(rs.status)
    const StIcon = st.icon
    const deliveryRate = rs.totalStops > 0 ? Math.round((rs.delivered / rs.totalStops) * 100) : 0

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
        {/* Back button + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setView(null)} className="rounded-xl hover:bg-gray-100">
            <ChevronRight size={18} className="rotate-180 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{rs.runsheetId}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                <StIcon size={12} style={{ color: st.iconColor }} />
                {rs.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{rs.driver} {rs.vehicleNumber ? `· ${rs.vehicleNumber}` : ''}, {new Date(rs.date).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total Stops', val: rs.totalStops, color: '#1B2A4A' },
            { label: 'Delivered', val: rs.delivered, color: '#22C55E' },
            { label: 'Pending', val: rs.pending, color: '#F59E0B' },
            { label: 'Failed', val: rs.failed, color: '#EF4444' },
            { label: 'Cancelled', val: rs.cancelled ?? 0, color: '#6B7280' },
            { label: 'COD', val: fmtUGX(rs.totalCOD), color: '#8B5CF6' },
          ].map((item, i) => (
            <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100">
              <div className="text-sm font-bold text-gray-900">{item.val}</div>
              <div className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Delivery Progress */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Delivery Progress</span>
            <span className="text-sm font-bold" style={{ color: deliveryRate >= 80 ? '#22C55E' : deliveryRate >= 50 ? '#F59E0B' : '#EF4444' }}>{deliveryRate}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${deliveryRate}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500" />
          </div>
        </div>

        {/* Stops Table */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Customer</TableHead>
                  <TableHead className="text-white font-semibold">Product</TableHead>
                  <TableHead className="text-white font-semibold">Address</TableHead>
                  <TableHead className="text-white font-semibold text-right">Expected</TableHead>
                  <TableHead className="text-white font-semibold text-right">Delivered</TableHead>
                  <TableHead className="text-white font-semibold text-right">COD</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  <TableHead className="text-white font-semibold">Attempts</TableHead>
                  <TableHead className="text-white font-semibold">Notes</TableHead>
                  <TableHead className="text-white font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rs.stops.map((stop, i) => (
                  <TableRow key={stop.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${stop.status === 'failed' ? '!bg-red-50/50' : ''} ${stop.status === 'cancelled' ? '!bg-gray-50/80' : ''}`}>
                    <TableCell>
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {stop.stopSequence}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={stop.status === 'cancelled' ? 'line-through opacity-60' : ''}>
                        <p className="font-medium text-gray-900">{stop.customerName}</p>
                        <p className="text-[11px] text-gray-400">{stop.customerContact}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-sm text-gray-700 ${stop.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <Package size={13} className="text-[#FF6B35]" />
                        {stop.productName}
                      </span>
                    </TableCell>
                    <TableCell className={`text-sm text-gray-500 max-w-[180px] truncate ${stop.status === 'cancelled' ? 'opacity-60' : ''}`}>{stop.customerAddress || '-'}</TableCell>
                    <TableCell className={`text-right font-semibold text-gray-700 ${stop.status === 'cancelled' ? 'opacity-60' : ''}`}>{stop.qty}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold ${(stop.actualDeliveredQty ?? 0) < stop.qty ? 'text-amber-600' : 'text-green-600'} ${stop.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        {stop.actualDeliveredQty ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right text-sm ${stop.status === 'cancelled' ? 'opacity-60' : ''}`}>{stop.codCollected ? fmtUGX(stop.codCollected) : '-'}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs font-semibold ${statusStyle(stop.status)}`}>
                        {stop.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AttemptTracker attempts={stop.deliveryAttempts ?? 0} max={stop.maxAttempts ?? 5} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-400 max-w-[150px] truncate">{stop.deliveryNotes || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {stop.status === 'cancelled' ? (
                          <Badge className="text-xs bg-gray-200 text-gray-500 border-0">
                            <Ban size={10} className="mr-1" /> Cancelled
                          </Badge>
                        ) : stop.status === 'delivered' || stop.status === 'failed' ? (
                          <Button variant="ghost" size="icon" className="rounded-lg hover:bg-gray-100 h-8 w-8" onClick={() => openStopUpdate(stop)}>
                            <Eye size={14} className="text-gray-500" />
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="rounded-lg hover:bg-gray-100 h-8 w-8" onClick={() => openStopUpdate(stop)}>
                              <Eye size={14} className="text-gray-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="rounded-lg hover:bg-amber-50 h-8 w-8" onClick={() => openRescheduleDialog(stop)} title="Reschedule">
                              <CalendarClock size={14} className="text-amber-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="rounded-lg hover:bg-red-50 h-8 w-8" onClick={() => openCancelDialog(stop)} title="Cancel Order">
                              <Ban size={14} className="text-red-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Cancel Order Dialog ── */}
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2 text-red-600">
                <XCircle size={20} />
                Cancel Order
              </DialogTitle>
            </DialogHeader>
            {cancellingStop && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm font-semibold text-red-800">Stop #{cancellingStop.stopSequence} -- {cancellingStop.customerName}</p>
                  <p className="text-xs text-red-600 mt-0.5">{cancellingStop.outboundId}, {cancellingStop.productName} x{cancellingStop.qty}</p>
                </div>
                <div>
                  <Label className="text-gray-700">Reason for Cancellation *</Label>
                  <Select value={cancelReason} onValueChange={setCancelReason}>
                    <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer Request">Customer Request</SelectItem>
                      <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                      <SelectItem value="Wrong Order">Wrong Order</SelectItem>
                      <SelectItem value="Duplicate Order">Duplicate Order</SelectItem>
                      <SelectItem value="Customer Unreachable">Customer Unreachable</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700">Additional Notes</Label>
                  <Textarea value={cancelNotes} onChange={e => setCancelNotes(e.target.value)} placeholder="Any additional details..." rows={2} className="rounded-xl mt-1" />
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-700">
                    Cancelling will release this order. Items will be returned to warehouse stock.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)} className="rounded-xl">Keep Order</Button>
              <Button onClick={handleCancelOrder} disabled={!cancelReason} className="bg-red-500 hover:bg-red-600 text-white rounded-xl">
                Cancel Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Reschedule Dialog ── */}
        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2 text-amber-600">
                <AlertTriangle size={20} />
                Reschedule Delivery
              </DialogTitle>
            </DialogHeader>
            {reschedulingStop && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-sm font-semibold text-gray-900">Stop #{reschedulingStop.stopSequence} -- {reschedulingStop.customerName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{reschedulingStop.outboundId}, {reschedulingStop.productName} x{reschedulingStop.qty}</p>
                  <div className="mt-2">
                    <AttemptTracker attempts={(reschedulingStop.deliveryAttempts ?? 0) + 1} max={reschedulingStop.maxAttempts ?? 5} />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-700">Why did delivery fail? *</Label>
                  <Select value={failReason} onValueChange={setFailReason}>
                    <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer Not Home">Customer Not Home</SelectItem>
                      <SelectItem value="Wrong Address">Wrong Address</SelectItem>
                      <SelectItem value="Customer Refused">Customer Refused</SelectItem>
                      <SelectItem value="No Access">No Access / Gate Locked</SelectItem>
                      <SelectItem value="Customer Busy">Customer Busy</SelectItem>
                      <SelectItem value="Phone Off">Phone Off / Unreachable</SelectItem>
                      <SelectItem value="Incomplete Payment">Incomplete Payment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700">Reschedule Date *</Label>
                  <Input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} min={minRescheduleDate} className="rounded-xl mt-1" />
                </div>
                {((reschedulingStop.deliveryAttempts ?? 0) + 1) >= (reschedulingStop.maxAttempts ?? 5) - 1 && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-xs text-red-700 font-semibold">
                      WARNING: This is attempt {(reschedulingStop.deliveryAttempts ?? 0) + 1} of {reschedulingStop.maxAttempts ?? 5}. After the next failure, the order will be permanently marked as failed and items returned to warehouse.
                    </p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleOpen(false)} className="rounded-xl">Back</Button>
              <Button onClick={handleReschedule} disabled={!failReason || !rescheduleDate} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl">
                <AlertTriangle size={16} className="mr-2" />
                Reschedule Delivery
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    )
  }

  // ── Computed: Create dialog values ──
  const filteredUnassigned = getFilteredUnassigned()
  const selectedOrdersList = getSelectedOrders()
  const allSelected = filteredUnassigned.length > 0 && filteredUnassigned.every(o => selectedOrders.includes(o.id))
  const driverInfo = drivers.find(d => d.driverId === formDriver)
  const canCreate = formDriver && selectedOrders.length > 0

  // ── Create Runsheet (full-page) ──
  if (view === 'create') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="create">
          <div className="min-h-full flex flex-col">
            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={handleCloseCreate}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                    <Truck size={16} className="text-[#FF6B35]" /> Create Runsheet
                  </h1>
                  <p className="text-[11px] text-gray-500">Step 1: Who → Step 2: What → Step 3: Review → Step 4: Commit</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                {/* ── STEP 1: WHO IS RIDING? ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-[#FF6B35] text-white flex items-center justify-center text-xs font-bold">1</div>
                    <span className="text-sm font-semibold text-gray-800">Who is riding?</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-600 text-xs">Rider *</Label>
                      <Select value={formDriver} onValueChange={v => { setFormDriver(v); const d = drivers.find(d => d.driverId === v); if (d) setFormVehicle(d.vehicleNumber || '') }}>
                        <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select rider" /></SelectTrigger>
                        <SelectContent>{drivers.filter(d => d.status === 'active').map(d => <SelectItem key={d.driverId} value={d.driverId}>{d.name} {d.vehicleNumber ? `(${d.vehicleNumber})` : ''}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-gray-600 text-xs">Bike Registration</Label>
                      <Input value={formVehicle} onChange={e => setFormVehicle(e.target.value)} placeholder="e.g., KMC 234J" className="rounded-xl mt-1" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <Label className="text-gray-600 text-xs">Trip Notes</Label>
                    <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Special instructions for the rider..." rows={2} className="rounded-xl mt-1" />
                  </div>
                </div>

                {/* ── STEP 2: WHAT GOES ON THE BIKE? ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-[#FF6B35] text-white flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-sm font-semibold text-gray-800">What goes on the bike?</span>
                    <Badge variant="secondary" className="text-[10px] font-semibold bg-orange-50 text-[#FF6B35] border-0 ml-1">
                      {selectedOrders.length} selected
                    </Badge>
                  </div>

                  {/* Scan bar */}
                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1">
                      <ScanBarcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#FF6B35]" />
                      <Input
                        ref={scanInputRef}
                        value={scanInput}
                        onChange={e => setScanInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScanOrder() } }}
                        placeholder="Scan barcode or type order ID... (Enter to add)"
                        className="pl-9 rounded-xl border-gray-200 text-sm font-mono"
                      />
                    </div>
                    <Button type="button" onClick={handleScanOrder} disabled={!scanInput.trim()} variant="outline" className="rounded-xl border-[#FF6B35] text-[#FF6B35] hover:bg-[#FF6B35] hover:text-white shrink-0">
                      <Plus size={16} className="mr-1" /> Add
                    </Button>
                  </div>

                  {/* Scan feedback */}
                  <AnimatePresence>
                    {scanMessage && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <p className={`text-xs font-medium mb-2 ${scanMessage.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                          {scanMessage.type === 'success' ? '✓' : '✗'} {scanMessage.text}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-[10px] text-gray-400 mb-3">
                    Scan barcodes rapidly — input auto-focuses after each scan. Paste multiple IDs separated by commas for bulk add.
                  </p>

                  {/* Filter + Select All / Clear All */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                        placeholder="Filter orders..."
                        className="pl-8 h-8 rounded-lg border-gray-200 text-xs"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={allSelected ? clearAllOrders : selectAllOrders}
                      className="rounded-lg text-xs h-8 border-gray-200 hover:bg-gray-50 shrink-0">
                      {allSelected ? 'Clear All' : 'Select All'}
                    </Button>
                  </div>

                  {/* Orders list */}
                  {data && (
                    <div className="space-y-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 p-1.5">
                      {filteredUnassigned.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          {data.unassigned.length === 0 ? 'All orders have been assigned' : 'No orders match your filter'}
                        </p>
                      ) : (
                        filteredUnassigned.map((order) => (
                          <label
                            key={order.id}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                              selectedOrders.includes(order.id)
                                ? 'bg-[#FF6B35]/5 border border-[#FF6B35]/30'
                                : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOrders.includes(order.id)}
                              onChange={() => toggleOrderSelection(order.id)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35]"
                            />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{order.outboundId}</span>
                              <span className="font-medium text-gray-900 truncate">{order.customerName}</span>
                              <span className="text-gray-400 truncate hidden sm:inline">· {order.productName}</span>
                            </div>
                            <span className="text-xs text-gray-500 font-semibold shrink-0">x{order.qty}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* ── STEP 3: TRIP SUMMARY ── */}
                <AnimatePresence>
                  {selectedOrdersList.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-[#FF6B35] text-white flex items-center justify-center text-xs font-bold">3</div>
                        <span className="text-sm font-semibold text-gray-800">Review trip</span>
                      </div>

                      {/* Summary header */}
                      <div className="bg-gradient-to-r from-[#1B2A4A] to-[#243656] rounded-t-xl px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-[#FF6B35]" />
                          <span className="text-sm font-semibold text-white">
                            {selectedOrdersList.length} stop{selectedOrdersList.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {driverInfo && (
                          <div className="text-right">
                            <p className="text-xs font-medium text-white">{driverInfo.name}</p>
                            <p className="text-[10px] text-blue-200/60">
                              {formVehicle || driverInfo.vehicleNumber || 'No bike plate'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Summary table */}
                      <div className="border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 sticky top-0">
                                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-10 px-3 py-2">#</th>
                                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2">Order</th>
                                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2">Customer</th>
                                <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2 hidden sm:table-cell">Product</th>
                                <th className="text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2">Qty</th>
                                <th className="w-10 px-2 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedOrdersList.map((order, i) => (
                                <tr key={order.id} className="border-t border-gray-50 hover:bg-red-50/30 transition-colors group/row">
                                  <td className="px-3 py-2">
                                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                      {i + 1}
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 font-mono text-xs text-gray-400">{order.outboundId}</td>
                                  <td className="px-2 py-2 font-medium text-gray-900">{order.customerName}</td>
                                  <td className="px-2 py-2 text-gray-500 hidden sm:table-cell">{order.productName}</td>
                                  <td className="px-2 py-2 text-right font-semibold text-gray-700">{order.qty}</td>
                                  <td className="px-2 py-2">
                                    <button
                                      onClick={() => removeFromSelection(order.id)}
                                      className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded hover:bg-red-100"
                                      aria-label={`Remove ${order.outboundId}`}
                                    >
                                      <X size={12} className="text-red-400" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
                <Button variant="ghost" size="sm" className="rounded-xl text-gray-500" onClick={handleCloseCreate}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateRunsheet}
                  disabled={!canCreate}
                  className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl px-6"
                >
                  <Truck size={14} className="mr-2" />
                  Create Runsheet
                  {selectedOrders.length > 0 && (
                    <Badge className="ml-2 bg-white/20 text-white border-0 text-xs">
                      {selectedOrders.length} stop{selectedOrders.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── List View ──
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Runsheets"
            description="Plan and track rider delivery trips"
            kpiCells={[
              { label: 'RUNSHEETS', value: data?.runsheets.length || 0 },
              { label: 'IN PROGRESS', value: data?.runsheets.filter(r => r.status === 'in_progress').length || 0 },
              { label: 'COMPLETED', value: data?.runsheets.filter(r => r.status === 'completed').length || 0 },
              { label: 'UNASSIGNED', value: data?.unassigned.length || 0, highlight: (data?.unassigned.length || 0) > 0, highlightColor: 'orange' as const },
            ]}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by rider, customer, or runsheet ID..."
          />

          {/* Action bar (below KPI, left-aligned) */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={handleOpenCreate}>
              <Plus size={12} className="mr-1" /> Create Runsheet
            </Button>
          </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {[
          { key: 'all', label: 'All' },
          { key: 'draft', label: 'Draft' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'completed', label: 'Completed' },
        ].map(chip => {
          const count = chip.key === 'all' ? (data?.runsheets.length || 0) : (data?.runsheets.filter(r => r.status === chip.key).length || 0)
          const isActive = statusFilter === chip.key
          return (
            <button key={chip.key} onClick={() => setStatusFilter(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Dense table */}
      {(!data?.runsheets || data.runsheets.length === 0) ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          No runsheets found. Create one from unassigned orders.
        </div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">Runsheet ID</DenseTh>
              <DenseTh>Driver</DenseTh>
              <DenseTh className="w-20 text-right">Stops</DenseTh>
              <DenseTh className="w-20 text-right">Delivered</DenseTh>
              <DenseTh className="w-20 text-right">Rate</DenseTh>
              <DenseTh className="w-24 text-right">COD</DenseTh>
              <DenseTh className="w-20 text-center">Status</DenseTh>
              <DenseTh className="w-20">Date</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.runsheets.map((rs, i) => {
              const deliveryRate = rs.totalStops > 0 ? Math.round((rs.delivered / rs.totalStops) * 100) : 0
              const st = rsStatusStyle(rs.status)
              return (
                <AnimatedDenseTr key={rs.runsheetId} index={i} onClick={() => setView(rs)}
                  tint={rs.status === 'completed' ? 'bg-green-50/30' : rs.status === 'in_progress' ? 'bg-blue-50/30' : ''}>
                  <DenseTd mono className="text-gray-500 text-[10px]">{rs.runsheetId}</DenseTd>
                  <DenseTd>
                    <p className="text-gray-900 font-medium text-xs">{rs.driver}</p>
                    {rs.vehicleNumber && <p className="text-[10px] text-gray-400">{rs.vehicleNumber}</p>}
                  </DenseTd>
                  <DenseTd mono right className="text-gray-700">{rs.totalStops}</DenseTd>
                  <DenseTd mono right className={rs.delivered > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>{rs.delivered}</DenseTd>
                  <DenseTd mono right className={deliveryRate >= 80 ? 'text-green-600 font-bold' : deliveryRate >= 50 ? 'text-orange-600 font-bold' : 'text-red-600 font-bold'}>{deliveryRate}%</DenseTd>
                  <DenseTd mono right className={rs.totalCOD > 0 ? 'text-purple-700 font-bold' : 'text-gray-300'}>{rs.totalCOD > 0 ? fmtUGX(rs.totalCOD) : '—'}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${st.bg} ${st.text} ${st.border}`}>{rs.status.replace(/_/g, ' ').toUpperCase()}</span>
                  </DenseTd>
                  <DenseTd className="text-gray-500 text-[10px]">{new Date(rs.date).toLocaleDateString('en-UG')}</DenseTd>
                </AnimatedDenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Unassigned Orders Section */}
      {data && data.unassigned.length > 0 && (
        <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle size={12} /> Unassigned Orders
            </span>
            <span className="text-[11px] text-amber-700 font-mono font-bold">{data.unassigned.length}</span>
          </div>
          <DenseTable>
            <thead>
              <tr>
                <DenseTh className="w-24">Outbound ID</DenseTh>
                <DenseTh>Customer</DenseTh>
                <DenseTh>Product</DenseTh>
                <DenseTh className="w-16 text-right">Qty</DenseTh>
              </tr>
            </thead>
            <tbody>
              {data.unassigned.map((order, i) => (
                <AnimatedDenseTr key={order.id} index={i} tint="bg-amber-50/20">
                  <DenseTd mono className="text-gray-500 text-[10px]">{order.outboundId}</DenseTd>
                  <DenseTd className="text-gray-900 text-xs font-medium">{order.customerName}</DenseTd>
                  <DenseTd className="text-gray-600 text-[11px] truncate max-w-[150px]">{order.productName}</DenseTd>
                  <DenseTd mono right className="text-gray-700">{order.qty}</DenseTd>
                </AnimatedDenseTr>
              ))}
            </tbody>
          </DenseTable>
        </div>
      )}

      {/* ── Update Stop Dialog ── */}
      <Dialog open={stopUpdateOpen} onOpenChange={setStopUpdateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Update Stop</DialogTitle>
          </DialogHeader>
          {updatingStop && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 text-sm">
                <p className="font-semibold text-gray-900">{updatingStop.customerName}</p>
                <p className="text-gray-500">{updatingStop.productName}, Expected: {updatingStop.qty}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-700">Status</Label>
                  <Select value={stopForm.status} onValueChange={v => setStopForm({ ...stopForm, status: v })}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-700">Qty Delivered</Label>
                  <Input type="number" value={stopForm.actualDeliveredQty} onChange={e => setStopForm({ ...stopForm, actualDeliveredQty: e.target.value })} placeholder="0" className="rounded-xl" />
                </div>
              </div>
              <div>
                <Label className="text-gray-700">COD Collected (KES)</Label>
                <Input type="number" value={stopForm.codCollected} onChange={e => setStopForm({ ...stopForm, codCollected: e.target.value })} placeholder="0" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700">Notes</Label>
                <Textarea value={stopForm.deliveryNotes} onChange={e => setStopForm({ ...stopForm, deliveryNotes: e.target.value })} placeholder="Delivery notes, return reason, etc." rows={2} className="rounded-xl" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopUpdateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleUpdateStop} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}