'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, User, Phone, Car, Hash, CreditCard, Shield, ShieldAlert, TrendingUp,
  Banknote, MapPin, Calendar, Bell, Clock, Package, Truck, Route, Navigation,
  DollarSign, AlertTriangle, CheckCircle2, Info, Loader2, X, Camera,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──
interface DriverNotification {
  type: string; title: string; message: string; severity: 'info' | 'warning' | 'urgent'
}

interface DriverData {
  id: string; driverId: string; name: string; phone: string
  nationalId: string | null; licenseNumber: string | null
  vehicleType: string | null; vehicleNumber: string | null
  createdBy: string | null; profileImage: string | null
  dateHired: string | null; salaryAmount: number | null; salaryPayDay: number
  status: string; damages: number; loss: number
  expectedBankings: number; banked: number
  shiftStart: string | null; shiftEnd: string | null
  ordersReceived: number; ordersDelivered: number; successRate: number
  riskPercent: number; totalSaleAmount: number
  totalTrips: number; totalDistance: number; totalCOD: number
  latestTripDate: string | null; latestGeoLocation: string | null; hasGeoTracking: boolean
  notifications: DriverNotification[]; notificationCount: number
  createdAt: string
}

interface TripBucket {
  label: string; trips: number; delivered: number; failed: number
  cod: number; sales: number; distance: number
  successRate: number; totalStops: number
}

interface TripData {
  timeline: TripBucket[]; summary: {
    totalTrips: number; totalDelivered: number; totalFailed: number
    totalCOD: number; totalSales: number; totalDistance: number
  }
}

// ── Helpers ──
const fmt = (n: number) => n == null || isNaN(n) ? '0' : n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const fmtMoney = (n: number) => `UGX ${fmt(n)}`

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-0',
    inactive: 'bg-gray-100 text-gray-500 border-0',
    on_leave: 'bg-amber-100 text-amber-700 border-0',
  }
  return <Badge className={`${map[status] || ''} text-xs font-medium`}>{status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>
}

const severityStyle = (s: string) => {
  switch (s) {
    case 'urgent': return 'border-red-300 bg-red-50'
    case 'warning': return 'border-amber-300 bg-amber-50'
    default: return 'border-blue-200 bg-blue-50'
  }
}

const severityIcon = (s: string) => {
  switch (s) {
    case 'urgent': return <AlertTriangle size={14} className="text-red-500 shrink-0" />
    case 'warning': return <Bell size={14} className="text-amber-500 shrink-0" />
    default: return <Info size={14} className="text-blue-500 shrink-0" />
  }
}

type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
]

// ── Mini bar chart (pure CSS) ──
function MiniBarChart({ data, valueKey, color = '#22C55E', maxBars = 30 }: {
  data: TripBucket[]; valueKey: 'delivered' | 'failed' | 'sales' | 'cod' | 'successRate'; color?: string; maxBars?: number
}) {
  const sliced = data.slice(-maxBars)
  if (sliced.length === 0) return <div className="text-xs text-gray-400 text-center py-4">No data for this period</div>
  const maxVal = Math.max(...sliced.map(d => Math.abs(d[valueKey])), 1)
  return (
    <div className="flex items-end gap-[3px] h-24">
      {sliced.map((d, i) => {
        const h = Math.max(2, (Math.abs(d[valueKey]) / maxVal) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className={`w-full rounded-t-sm transition-all duration-300 ${valueKey === 'failed' ? 'bg-red-400/70' : color}`}
              style={{ height: `${h}%` }}
              title={`${d.label}: ${d[valueKey]}`}
            />
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════
// ── MAIN: DRIVER PROFILE ──
// ════════════════════════════════════════════
export default function DriverProfile({
  driver: initialDriver, onBack,
}: {
  driver: DriverData; onBack: () => void
}) {
  const [driver, setDriver] = useState<DriverData>(initialDriver)
  const [period, setPeriod] = useState<Period>('monthly')
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [tripLoading, setTripLoading] = useState(false)
  const [perfData, setPerfData] = useState<Record<string, unknown> | null>(null)
  const [showEditSalary, setShowEditSalary] = useState(false)
  const [editForm, setEditForm] = useState({ salaryAmount: '', salaryPayDay: '', dateHired: '' })

  // Fetch time-series trips
  const fetchTrips = useCallback(async () => {
    setTripLoading(true)
    try {
      const res = await fetch(`/api/drivers/trips?driverId=${driver.driverId}&period=${period}`)
      const data = await res.json()
      setTripData(data)
    } catch { toast.error('Failed to load trip data') }
    finally { setTripLoading(false) }
  }, [driver.driverId, period])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  // Fetch performance metrics (success rate, cycle time, COD rate, sparkline)
  const fetchPerformance = useCallback(async () => {
    try {
      const res = await fetch(`/api/drivers/${driver.id}/performance?days=30`)
      if (res.ok) {
        const data = await res.json()
        setPerfData(data)
      }
    } catch { /* non-blocking */ }
  }, [driver.id])

  useEffect(() => { fetchPerformance() }, [fetchPerformance])

  // Refresh driver data
  const refreshDriver = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers')
      const all: DriverData[] = await res.json()
      const updated = all.find(d => d.id === driver.id)
      if (updated) setDriver(updated)
    } catch { /* silent */ }
  }, [driver.id])

  // ── Salary edit handler ──
  const handleSaveSalary = async () => {
    try {
      await fetch('/api/drivers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: driver.id,
          salaryAmount: parseFloat(editForm.salaryAmount) || null,
          salaryPayDay: parseInt(editForm.salaryPayDay) || 28,
          dateHired: editForm.dateHired || null,
        }),
      })
      toast.success('Driver details updated')
      setShowEditSalary(false)
      refreshDriver()
    } catch { toast.error('Failed to update') }
  }

  const openEditSalary = () => {
    setEditForm({
      salaryAmount: String(driver.salaryAmount || ''),
      salaryPayDay: String(driver.salaryPayDay || 28),
      dateHired: driver.dateHired ? driver.dateHired.slice(0, 10) : '',
    })
    setShowEditSalary(true)
  }

  const pending = driver.expectedBankings - driver.banked
  const tenure = driver.dateHired ? Math.floor((Date.now() - new Date(driver.dateHired).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null

  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-5">
      {/* ── Back Button ── */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft size={16} /> Back to Drivers
      </button>

      {/* ══════════════════════════════════ */}
      {/* ── PROFILE HEADER ── */}
      {/* ══════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Banner */}
        <div className="h-28 bg-gradient-to-r from-[#1B2A4A] via-[#243656] to-[#1B2A4A] relative">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
          {/* Notification badge */}
          {driver.notificationCount > 0 && (
            <div className="absolute top-4 right-4">
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5">
                <Bell size={14} className="text-white" />
                <span className="text-white text-xs font-bold">{driver.notificationCount} alert{driver.notificationCount > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>

        {/* Profile info row */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row gap-6 -mt-12">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-gradient-to-br from-[#FF6B35]/20 to-[#FF6B35]/5 flex items-center justify-center">
                {driver.profileImage ? (
                  <img src={driver.profileImage} alt={driver.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-[#FF6B35]">{driver.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              {driver.status === 'active' && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white" />
              )}
            </div>

            {/* Name + metadata */}
            <div className="flex-1 pt-2">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{driver.name}</h1>
                {statusBadge(driver.status)}
                {(() => {
                  const onShift = driver.shiftStart && !driver.shiftEnd
                  return onShift ? (
                    <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> ON SHIFT
                    </span>
                  ) : null
                })()}
              </div>
              <p className="font-mono text-sm text-gray-400 mb-2">{driver.driverId}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Phone size={13} />{driver.phone}</span>
                {driver.vehicleNumber && <span className="flex items-center gap-1"><Car size={13} />{driver.vehicleNumber}</span>}
                {driver.vehicleType && <span className="flex items-center gap-1"><Truck size={13} />{driver.vehicleType}</span>}
                {tenure !== null && <span className="flex items-center gap-1"><Calendar size={13} />{tenure} yr{tenure !== 1 ? 's' : ''} tenure</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════ */}
      {/* ── NOTIFICATIONS PANEL ── */}
      {/* ══════════════════════════════════ */}
      {(driver.notifications?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Bell size={13} /> Alerts & Notifications
          </h3>
          <AnimatePresence>
            {(driver.notifications || []).map((n, i) => (
              <motion.div key={n.type} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`flex items-start gap-3 p-3 rounded-xl border ${severityStyle(n.severity)}`}>
                {severityIcon(n.severity)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ══════════════════════════════════ */}
      {/* ── KPI STRIP ── */}
      {/* ══════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Delivered', value: `${driver.ordersDelivered}/${driver.ordersReceived}`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Success Rate', value: `${driver.successRate}%`, icon: Shield, color: driver.successRate >= 80 ? 'text-green-600' : driver.successRate >= 50 ? 'text-amber-600' : 'text-red-600', bg: driver.successRate >= 80 ? 'bg-green-50' : driver.successRate >= 50 ? 'bg-amber-50' : 'bg-red-50' },
          { label: 'Risk', value: `${driver.riskPercent}%`, icon: ShieldAlert, color: driver.riskPercent <= 10 ? 'text-green-600' : driver.riskPercent <= 30 ? 'text-amber-600' : 'text-red-600', bg: driver.riskPercent <= 10 ? 'bg-green-50' : driver.riskPercent <= 30 ? 'bg-amber-50' : 'bg-red-50' },
          { label: 'Total Sales', value: fmtMoney(driver.totalSaleAmount), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-gray-50 rounded-lg border border-gray-100 p-3 ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon size={14} className={kpi.color} />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{kpi.label}</span>
            </div>
            <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════ */}
      {/* ── PERFORMANCE METRICS (30-day window from /api/drivers/[id]/performance) ── */}
      {/* ══════════════════════════════════ */}
      {perfData && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-[#FF6B35]" /> 30-Day Performance Metrics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(() => {
              const rates = (perfData.rates || {}) as Record<string, number>
              const totals = (perfData.totals || {}) as Record<string, number>
              const cycle = (perfData.cycleTime || {}) as Record<string, number>
              const cod = (perfData.cod || {}) as Record<string, number>
              const metrics = [
                { label: 'Success Rate', value: `${rates.successRate ?? 0}%`, color: (rates.successRate ?? 0) >= 80 ? 'text-green-600' : 'text-amber-600' },
                { label: '1st Attempt Rate', value: `${rates.firstAttemptRate ?? 0}%`, color: 'text-blue-600' },
                { label: 'Avg Cycle Time', value: cycle.avgHours ? `${cycle.avgHours}h` : '—', color: 'text-purple-600' },
                { label: 'COD Rate', value: `${rates.codRate ?? 0}%`, color: 'text-green-600' },
                { label: 'Banking Rate', value: `${rates.bankingRate ?? 0}%`, color: (rates.bankingRate ?? 0) >= 80 ? 'text-green-600' : 'text-amber-600' },
                { label: 'Risk %', value: `${rates.riskPercent ?? 0}%`, color: (rates.riskPercent ?? 0) <= 10 ? 'text-green-600' : 'text-red-600' },
                { label: 'Orders', value: fmt(totals.orders ?? 0), color: 'text-gray-700' },
                { label: 'Delivered', value: fmt(totals.delivered ?? 0), color: 'text-green-600' },
                { label: 'Failed', value: fmt(totals.failed ?? 0), color: 'text-red-600' },
                { label: 'Distance', value: `${fmt(totals.distance ?? 0)} km`, color: 'text-blue-600' },
                { label: 'COD Collected', value: fmtMoney(cod.totalCollected ?? 0), color: 'text-green-700' },
                { label: 'Unbanked', value: fmtMoney(cod.unbanked ?? 0), color: (cod.unbanked ?? 0) > 0 ? 'text-red-600' : 'text-gray-400' },
              ]
              return metrics.map(m => (
                <div key={m.label} className="bg-gray-50 rounded-lg border border-gray-100 p-2.5">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{m.label}</p>
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))
            })()}
          </div>
          {/* 7-day sparkline */}
          {Array.isArray(perfData.sparkline) && (perfData.sparkline as Array<Record<string, unknown>>).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Last 7 Days</p>
              <div className="flex items-end gap-2 h-16">
                {(perfData.sparkline as Array<{ date: string; total: number; delivered: number }>).map((day, i) => {
                  const max = Math.max(...(perfData.sparkline as Array<{ total: number }>).map(d => d.total), 1)
                  const h = Math.max(2, (day.total / max) * 100)
                  const dh = day.total > 0 ? Math.max(2, (day.delivered / day.total) * h) : 0
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end h-12 relative">
                        <div className="w-full bg-gray-200 rounded-t-sm" style={{ height: `${h}%` }} title={`Total: ${day.total}`} />
                        <div className="w-full bg-green-400 rounded-t-sm absolute bottom-0" style={{ height: `${dh}%` }} title={`Delivered: ${day.delivered}`} />
                      </div>
                      <span className="text-[8px] text-gray-400 font-mono">{day.date}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════ */}
      {/* ── PERFORMANCE TIMELINE ── */}
      {/* ══════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={15} className="text-[#FF6B35]" /> Performance Timeline</h3>
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${period === p.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {tripLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#FF6B35] animate-spin" /></div>
        ) : tripData ? (
          <div className="space-y-5">
            {/* Summary row */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: 'Trips', val: tripData.summary.totalTrips },
                { label: 'Delivered', val: tripData.summary.totalDelivered },
                { label: 'Failed', val: tripData.summary.totalFailed },
                { label: 'COD', val: fmtMoney(tripData.summary.totalCOD) },
                { label: 'Sales', val: fmtMoney(tripData.summary.totalSales) },
                { label: 'Distance', val: `${fmt(tripData.summary.totalDistance)} km` },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">{s.label}</p>
                  <p className="text-sm font-bold text-gray-800">{s.val}</p>
                </div>
              ))}
            </div>

            {/* Bar charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Deliveries (green) vs Failures (red)</p>
                <MiniBarChart data={tripData.timeline} valueKey="delivered" color="#22C55E" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Success Rate (%)</p>
                <MiniBarChart data={tripData.timeline} valueKey="successRate" color="#3B82F6" />
              </div>
            </div>

            {/* Trip table */}
            {tripData.timeline.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Period</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Trips</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Delivered</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Failed</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Success</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold">COD</th>
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripData.timeline.slice().reverse().map((t, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-mono text-gray-700">{t.label}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{t.trips}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-green-600 font-semibold">{t.delivered}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{t.failed > 0 ? <span className="text-red-600 font-medium">{t.failed}</span> : <span className="text-gray-300">0</span>}</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          <span className={`font-semibold ${t.successRate >= 80 ? 'text-green-600' : t.successRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{t.successRate}%</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.cod)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(t.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No trip data available for this period</p>
        )}
      </div>

      {/* ══════════════════════════════════ */}
      {/* ── BOTTOM ROW: GPS + Financials + Personal ── */}
      {/* ══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* GPS / Trip Tracker */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4"><Navigation size={15} className="text-[#FF6B35]" /> Trip Tracker</h3>
          {driver.hasGeoTracking && driver.latestGeoLocation ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                GPS Active
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 h-40 flex items-center justify-center">
                <div className="text-center">
                  <MapPin size={24} className="text-[#FF6B35] mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Geo-location integration</p>
                  <p className="text-[10px] text-gray-400 mt-1">Connecting to your geolocator service...</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-400 uppercase">Total Distance</p>
                  <p className="font-bold text-gray-800">{fmt(driver.totalDistance)} km</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-400 uppercase">Total Trips</p>
                  <p className="font-bold text-gray-800">{driver.totalTrips}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 h-40 flex items-center justify-center">
              <div className="text-center">
                <Navigation size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-medium">GPS Not Active</p>
                <p className="text-[10px] text-gray-400 mt-1">Enable geolocation tracking to see live position and route data</p>
              </div>
            </div>
          )}
        </div>

        {/* Financials + Personal */}
        <div className="space-y-5">
          {/* Financial Tracking */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Banknote size={15} className="text-[#FF6B35]" /> Financials</h3>
              <Button variant="ghost" size="sm" className="text-xs text-[#FF6B35]" onClick={openEditSalary}>Edit</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Expected Bankings</p>
                <p className="text-lg font-bold text-gray-800">{fmtMoney(driver.expectedBankings)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Banked</p>
                <p className="text-lg font-bold text-green-600">{fmtMoney(driver.banked)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Pending</p>
                <p className={`text-lg font-bold ${pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmtMoney(pending)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Damages + Loss</p>
                <p className={`text-lg font-bold ${(driver.damages + driver.loss) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmtMoney(driver.damages + driver.loss)}</p>
              </div>
            </div>
            {pending > 0 && (
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${driver.banked / driver.expectedBankings >= 0.9 ? 'bg-green-500' : driver.banked / driver.expectedBankings >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, (driver.banked / Math.max(driver.expectedBankings, 1)) * 100)}%` }} />
              </div>
            )}
          </div>

          {/* Salary & Employment */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4"><CreditCard size={15} className="text-[#FF6B35]" /> Employment & Salary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Salary</p>
                <p className="font-bold text-gray-800">{driver.salaryAmount ? fmtMoney(driver.salaryAmount) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Pay Day</p>
                <p className="font-bold text-gray-800">{driver.salaryPayDay ? `Every ${driver.salaryPayDay}${driver.salaryPayDay === 1 ? 'st' : driver.salaryPayDay === 2 ? 'nd' : driver.salaryPayDay === 3 ? 'rd' : 'th'}` : 'Not set'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Date Hired</p>
                <p className="text-gray-700">{driver.dateHired ? new Date(driver.dateHired).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Tenure</p>
                <p className="text-gray-700">{tenure !== null ? `${tenure} year${tenure !== 1 ? 's' : ''}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">National ID</p>
                <p className="text-gray-700 font-mono">{driver.nationalId || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">License No</p>
                <p className="text-gray-700 font-mono">{driver.licenseNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Created By</p>
                <p className="text-gray-700">{driver.createdBy || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Driver Since</p>
                <p className="text-gray-700">{new Date(driver.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════ */}
      {/* ── SALARY EDIT MODAL ── */}
      {/* ══════════════════════════════════ */}
      <AnimatePresence>
        {showEditSalary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowEditSalary(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-gray-900">Edit Employment & Salary</h3>
                <button onClick={() => setShowEditSalary(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Salary Amount (KES)</Label>
                  <Input type="number" value={editForm.salaryAmount} onChange={e => setEditForm({ ...editForm, salaryAmount: e.target.value })} placeholder="e.g., 35000" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Salary Pay Day (day of month)</Label>
                  <Input type="number" min={1} max={31} value={editForm.salaryPayDay} onChange={e => setEditForm({ ...editForm, salaryPayDay: e.target.value })} placeholder="e.g., 28" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Date Hired</Label>
                  <Input type="date" value={editForm.dateHired} onChange={e => setEditForm({ ...editForm, dateHired: e.target.value })} className="rounded-xl" />
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <Button variant="outline" onClick={() => setShowEditSalary(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={handleSaveSalary} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save Changes</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
