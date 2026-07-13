'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, ChevronRight, ChevronDown, Lock, RefreshCw,
  AlertTriangle, CheckCircle2, HelpCircle, Package,
  Boxes, Truck, ClipboardList, RotateCcw, ArrowRight, X,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ── Types ──

interface SearchOrder {
  id: string; customerName: string; customerAddress: string | null; qty: number
  status: string; stage: string; stageKey: string
  codCollected: number | null; saleAmount: number | null
  assignedDriver: string | null; runsheetId: string | null
  createdAt: string; dispatchedAt: string | null; deliveredAt: string | null
  entryMinutes: number | null; isStale: boolean; matchedQuery: boolean
}

interface SearchProduct {
  productId: string; productName: string; brand: string | null; variant: string | null
  merchantName: string; category: string; unit: string; currentStock: number
  totalActiveOrders: number; moreOrdersCount: number; orders: SearchOrder[]
}

interface SearchResponse { query: string; results: SearchProduct[]; totalOrders: number }

interface StationItem {
  id?: string; inboundId?: string; outboundId?: string; orderNumber?: string; afterSalesId?: string
  name?: string; customerName?: string; productName?: string; merchantName?: string
  customerAddress?: string; qty?: number; qtyIn?: number; status?: string; returnStatus?: string
  runsheetId?: string | null; assignedDriver?: string | null
  codCollected?: number | null; saleAmount?: number | null
  deliveryNotes?: string | null; deliveryAttempts?: number
  dispatchedAt?: string; deliveredAt?: string; createdAt?: string; bankedAt?: string
  reason?: string; refundAmount?: number | null; shrinkageId?: string; bankingId?: string
  driverName?: string; amount?: number; phone?: string
  expectedBankings?: number; banked?: number
  dispatchedToday?: number; deliveredToday?: number; pendingBankings?: number
}

interface Station {
  count: number; items: StationItem[]; label: string; description: string
  action: string; targetModule: string; avgDwellMinutes?: number | null
}

interface HubData {
  date: string; range: string
  stations: {
    intake: Station & { stockArrivals?: StationItem[]; orderIntake?: StationItem[] }
    sort: Station; stage: Station; dispatch: Station; inTransit: Station; delivered: Station; returns: Station
  }
  exceptions: { failedDeliveries: StationItem[]; pendingShrinkage: StationItem[]; count: number }
  riders: StationItem[]
  pendingBankings: { count: number; items: StationItem[]; totalAmount: number }
  followUps: { count: number; items: Array<{ id: string; merchantId: string; merchantName: string; merchantOnHold: boolean; type: string; subject: string; followUpAt: string; createdAt: string }> }
  lateBankings: { count: number; items: Array<{ driverId: string; driverName: string; phone: string; unbankedAmount: number; daysSinceBanking: number; isLate: boolean }>; totalUnbanked: number }
  dayClose: { canClose: boolean; unaccountedParcels: number; pendingBankingsCount: number; pipelineOrders: number; pendingShrinkageCount: number }
  totals: { inboundToday: number; outboundToday: number; codCollectedToday: number; salesToday: number }
}

type StationKey = 'intake' | 'sort' | 'stage' | 'dispatch' | 'inTransit' | 'delivered' | 'returns'

const STATIONS: { key: StationKey; label: string; shortLabel: string; icon: typeof Package }[] = [
  { key: 'intake',    label: 'INTAKE',     shortLabel: 'Intake',     icon: Package },
  { key: 'sort',      label: 'SORT & PACK',shortLabel: 'Sort',       icon: Boxes },
  { key: 'stage',     label: 'STAGING',    shortLabel: 'Stage',      icon: ClipboardList },
  { key: 'dispatch',  label: 'DISPATCH',   shortLabel: 'Dispatch',   icon: Truck },
  { key: 'inTransit', label: 'IN TRANSIT', shortLabel: 'Transit',    icon: ArrowRight },
  { key: 'delivered', label: 'DELIVERED',  shortLabel: 'Delivered',  icon: CheckCircle2 },
  { key: 'returns',   label: 'RETURNS',    shortLabel: 'Returns',    icon: RotateCcw },
]

const STALE_THRESHOLD_MINUTES: Record<string, number> = { sort: 120, stage: 240, dispatch: 120, inTransit: 360 }

const STATION_MODULE: Record<string, string> = {
  intake: 'inventory', sort: 'outbound', stage: 'outbound', dispatch: 'outbound',
  inTransit: 'outbound', delivered: 'outbound', returns: 'returns',
}

function formatDwell(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60); const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Compute dwell color for a station's avg dwell time
function dwellColor(dwell: number | null | undefined, threshold: number | null | undefined, count: number): string {
  if (dwell == null || threshold == null || count === 0) return 'bg-gray-200'
  if (dwell > threshold) return 'bg-red-500'
  if (dwell > threshold * 0.6) return 'bg-amber-500'
  return 'bg-green-500'
}

// Check if a station is stale
function isStationStale(dwell: number | null | undefined, threshold: number | null | undefined, count: number): boolean {
  return dwell != null && threshold != null && dwell > threshold && count > 0
}

// Compute item staleness from createdAt
function isItemStale(createdAt: string | undefined, stationKey: StationKey): boolean {
  if (!createdAt) return false
  const threshold = STALE_THRESHOLD_MINUTES[stationKey]
  if (!threshold) return false
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return minutes > threshold
}

// ── Status pill ──
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { dot: string; label: string }> = {
    pending: { dot: 'bg-gray-400', label: 'Pending' }, released: { dot: 'bg-amber-500', label: 'Released' },
    picking: { dot: 'bg-blue-500', label: 'Picking' }, picked: { dot: 'bg-blue-600', label: 'Picked' },
    packing: { dot: 'bg-orange-500', label: 'Packing' }, packed: { dot: 'bg-orange-600', label: 'Packed' },
    staged: { dot: 'bg-cyan-600', label: 'Staged' }, dispatched: { dot: 'bg-cyan-500', label: 'Dispatched' },
    delivered: { dot: 'bg-green-600', label: 'Delivered' }, failed: { dot: 'bg-red-500', label: 'Failed' },
    returned: { dot: 'bg-red-600', label: 'Returned' }, cancelled: { dot: 'bg-gray-500', label: 'Cancelled' },
    received: { dot: 'bg-blue-500', label: 'Received' }, put_away: { dot: 'bg-yellow-500', label: 'Put Away' },
    stored: { dot: 'bg-green-600', label: 'Stored' }, self_delivery: { dot: 'bg-purple-500', label: 'Self-Delivery' },
    initiated: { dot: 'bg-blue-400', label: 'Initiated' }, in_review: { dot: 'bg-yellow-500', label: 'In Review' },
    approved: { dot: 'bg-green-500', label: 'Approved' }, rejected: { dot: 'bg-red-500', label: 'Rejected' },
    processed: { dot: 'bg-green-600', label: 'Processed' },
  }
  const s = map[status] || { dot: 'bg-gray-400', label: status }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
      <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
      {s.label}
    </span>
  )
}

function rowTint(status: string): string {
  if (['delivered', 'stored', 'processed'].includes(status)) return 'bg-green-50/40'
  if (['dispatched', 'staged'].includes(status)) return 'bg-cyan-50/40'
  if (['failed', 'returned', 'rejected', 'cancelled'].includes(status)) return 'bg-red-50/40'
  if (['packed', 'put_away', 'in_review'].includes(status)) return 'bg-orange-50/40'
  if (['released', 'picking', 'packing', 'received', 'initiated'].includes(status)) return 'bg-amber-50/40'
  if (['pending', 'picked'].includes(status)) return 'bg-blue-50/40'
  return ''
}

// ── Station Table ──
function StationTable({ station, stationKey, expandedId, onToggleExpand }: {
  station: Station; stationKey: StationKey; expandedId: string | null; onToggleExpand: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'time' | 'amount' | 'status'>('time')

  const filtered = useMemo(() => {
    let items = station.items || []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(it =>
        String(it.orderNumber || it.outboundId || it.inboundId || it.afterSalesId || '').toLowerCase().includes(q) ||
        String(it.customerName || '').toLowerCase().includes(q) ||
        String(it.productName || '').toLowerCase().includes(q) ||
        String(it.assignedDriver || '').toLowerCase().includes(q)
      )
    }
    items = [...items].sort((a, b) => {
      if (sortBy === 'amount') return Number(b.codCollected || b.saleAmount || 0) - Number(a.codCollected || a.saleAmount || 0)
      if (sortBy === 'status') return String(a.status || a.returnStatus || '').localeCompare(String(b.status || b.returnStatus || ''))
      const aTime = new Date(a.dispatchedAt || a.deliveredAt || a.createdAt || 0).getTime()
      const bTime = new Date(b.dispatchedAt || b.deliveredAt || b.createdAt || 0).getTime()
      return bTime - aTime
    })
    return items
  }, [station.items, search, sortBy])

  if (filtered.length === 0) return <div className="py-12 text-center text-gray-400 text-sm">No items in this queue.</div>

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-7 text-xs rounded-md" />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Sort:</span>
          {(['time', 'amount', 'status'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-0.5 rounded text-[11px] ${sortBy === s ? 'bg-[#1B2A4A] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {s === 'time' ? 'Time' : s === 'amount' ? 'Amount' : 'Status'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400 font-mono">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
              <th className="text-left px-3 py-1.5 font-semibold w-32">ID</th>
              <th className="text-left px-3 py-1.5 font-semibold">Customer / Product</th>
              {(stationKey === 'inTransit' || stationKey === 'delivered' || stationKey === 'dispatch') && <th className="text-left px-3 py-1.5 font-semibold w-28">Driver</th>}
              {stationKey === 'intake' && <th className="text-left px-3 py-1.5 font-semibold w-28">Merchant</th>}
              <th className="text-right px-3 py-1.5 font-semibold w-16">Qty</th>
              <th className="text-right px-3 py-1.5 font-semibold w-28">Amount</th>
              <th className="text-left px-3 py-1.5 font-semibold w-32">Status</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const id = String(item.orderNumber || item.outboundId || item.inboundId || item.afterSalesId || `item-${idx}`)
              const isExpanded = expandedId === id
              const status = String(item.status || item.returnStatus || '')
              const amount = Number(item.codCollected || item.saleAmount || item.refundAmount || 0)
              return (
                <React.Fragment key={id}>
                  <tr onClick={() => onToggleExpand(id)} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${rowTint(status)} ${isExpanded ? 'bg-blue-50' : ''}`} style={{ height: '32px' }}>
                    <td className="px-3 py-1 font-mono font-semibold text-gray-900 text-[11px]">
                      <div className="flex items-center gap-1">
                        {isItemStale(item.createdAt, stationKey) && <span title="Stuck — exceeds stale threshold" className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />}
                        {item.orderNumber || item.outboundId || item.inboundId || item.afterSalesId || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-1 text-gray-700 truncate max-w-xs">{item.customerName || item.productName || '—'}</td>
                    {(stationKey === 'inTransit' || stationKey === 'delivered' || stationKey === 'dispatch') && <td className="px-3 py-1 text-gray-600 text-[11px]">{item.assignedDriver || '—'}</td>}
                    {stationKey === 'intake' && <td className="px-3 py-1 text-gray-600 text-[11px] truncate">{item.merchantName || '—'}</td>}
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-gray-700">{item.qty || item.qtyIn || '—'}</td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-gray-900 font-medium">{amount > 0 ? formatCurrencyCompact(amount) : '—'}</td>
                    <td className="px-3 py-1"><StatusPill status={status} /></td>
                    <td className="px-2 text-gray-400">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-white border-b border-gray-200">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div><p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Customer</p><p className="text-gray-900 font-medium">{item.customerName || '—'}</p>{item.customerAddress && <p className="text-gray-500 text-[11px] mt-0.5">{item.customerAddress}</p>}</div>
                          <div><p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Product</p><p className="text-gray-900">{item.productName || '—'}</p>{item.merchantName && <p className="text-gray-500 text-[11px] mt-0.5">{item.merchantName}</p>}</div>
                          <div><p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Driver / Runsheet</p><p className="text-gray-900">{item.assignedDriver || 'Unassigned'}</p>{item.runsheetId && <p className="text-gray-500 text-[11px] font-mono mt-0.5">{item.runsheetId}</p>}</div>
                          <div><p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Money</p><p className="text-gray-900">{item.codCollected ? `COD ${formatCurrency(Number(item.codCollected))}` : item.saleAmount ? formatCurrency(Number(item.saleAmount)) : '—'}</p>{item.refundAmount && <p className="text-red-600 text-[11px] mt-0.5">Refund: {formatCurrency(Number(item.refundAmount))}</p>}</div>
                        </div>
                        {(item.dispatchedAt || item.deliveredAt || item.createdAt) && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Timeline</p>
                            <div className="flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
                              {item.createdAt && <span>Created: {new Date(item.createdAt).toLocaleString('en-UG')}</span>}
                              {item.dispatchedAt && <span>→ Dispatched: {new Date(item.dispatchedAt).toLocaleString('en-UG')}</span>}
                              {item.deliveredAt && <span>→ Delivered: {new Date(item.deliveredAt).toLocaleString('en-UG')}</span>}
                            </div>
                          </div>
                        )}
                        {item.deliveryNotes && <div className="mt-2 p-2 rounded bg-red-50 border border-red-100 text-[11px] text-red-700">⚠ {item.deliveryNotes}</div>}
                        {item.reason && <div className="mt-2 p-2 rounded bg-orange-50 border border-orange-100 text-[11px] text-orange-700">Reason: {item.reason}</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Driver Status Panel (at-a-glance, no clicking) ──
function DriverStatusPanel({ riders }: { riders: StationItem[] }) {
  if (riders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Drivers</span>
        </div>
        <div className="py-6 text-center text-[11px] text-gray-400">No active drivers</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Drivers</span>
        <span className="text-[10px] text-gray-400 font-mono">{riders.length} on shift</span>
      </div>
      <div className="divide-y divide-gray-50">
        {riders.slice(0, 8).map((r, i) => {
          const dispatched = r.dispatchedToday ?? 0
          const delivered = r.deliveredToday ?? 0
          const pendingBank = r.pendingBankings ?? 0
          // Status dot: green = available, blue = delivering, orange = has pending banking
          const dotColor = pendingBank > 0 ? 'bg-orange-400' : dispatched > 0 ? 'bg-blue-400' : 'bg-green-400'
          const statusText = pendingBank > 0 ? 'pending bank' : dispatched > 0 ? 'delivering' : 'available'
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5" style={{ height: '28px' }}>
              <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} title={statusText} />
              <span className="text-[11px] text-gray-900 font-medium truncate flex-1">{r.name || '—'}</span>
              <span className="text-[10px] text-gray-400 font-mono shrink-0">{dispatched}→{delivered}</span>
              {pendingBank > 0 && <span className="text-[9px] text-orange-600 font-semibold shrink-0">{pendingBank}b</span>}
            </div>
          )
        })}
      </div>
      {riders.length > 8 && <div className="px-3 py-1 text-center text-[10px] text-gray-400 border-t border-gray-50">+ {riders.length - 8} more</div>}
    </div>
  )
}

// ── Alerts Panel (consolidated: exceptions + late bankings + follow-ups) ──
function AlertsPanel({ exceptions, bankings, lateBankings, followUps, onNavigate }: {
  exceptions: HubData['exceptions']
  bankings: { count: number; totalAmount: number }
  lateBankings: HubData['lateBankings']
  followUps: HubData['followUps']
  onNavigate?: (m: string) => void
}) {
  const hasExceptions = exceptions.count > 0
  const hasCOD = bankings.count > 0
  const hasLate = lateBankings.count > 0
  const hasFollowUps = followUps.count > 0

  if (!hasExceptions && !hasCOD && !hasLate && !hasFollowUps) {
    return (
      <div className="bg-white rounded-lg border border-green-200 px-3 py-2.5 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-green-600 shrink-0" />
        <span className="text-[11px] text-green-700 font-medium">All clear</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Alerts</span>
      </div>
      <div className="divide-y divide-gray-50">
        {hasExceptions && (
          <div className="px-3 py-2 hover:bg-red-50/30 cursor-pointer" onClick={() => onNavigate?.('returns')}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={11} className="text-red-500 shrink-0" />
              <span className="text-[11px] text-red-700 font-semibold">{exceptions.count} exception{exceptions.count !== 1 ? 's' : ''}</span>
              <button className="ml-auto text-[9px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Fix →</button>
            </div>
            <div className="space-y-0.5">
              {exceptions.failedDeliveries.slice(0, 2).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-gray-600">
                  <span className="font-mono">{item.orderNumber || item.outboundId}</span>
                  <span className="truncate">{item.customerName}</span>
                  <span className="ml-auto px-1 rounded bg-red-100 text-red-700 text-[8px] font-semibold">FAILED</span>
                </div>
              ))}
              {exceptions.pendingShrinkage.slice(0, 1).map((item, i) => (
                <div key={`s-${i}`} className="flex items-center gap-2 text-[10px] text-gray-600">
                  <span className="font-mono">{item.shrinkageId}</span>
                  <span className="truncate">{item.productName} ×{item.qty}</span>
                  <span className="ml-auto px-1 rounded bg-orange-100 text-orange-700 text-[8px] font-semibold">SHRINK</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasLate && (
          <div className="px-3 py-2 bg-red-50/20">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-[11px] text-red-700 font-semibold">{lateBankings.count} late banking{lateBankings.count !== 1 ? 's' : ''}</span>
              <span className="ml-auto text-[10px] text-red-600 font-mono font-bold">{formatCurrencyCompact(lateBankings.totalUnbanked)}</span>
            </div>
            <div className="space-y-0.5">
              {lateBankings.items.slice(0, 3).map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-gray-600">
                  <span className="truncate flex-1">{d.driverName}</span>
                  <span className="text-red-600 font-mono">{d.daysSinceBanking}d</span>
                  <span className="text-gray-500 font-mono">{formatCurrencyCompact(d.unbankedAmount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasCOD && (
          <div className="px-3 py-2 hover:bg-orange-50/30 cursor-pointer" onClick={() => onNavigate?.('payments')}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-[11px] text-orange-700 font-semibold">{bankings.count} COD pending</span>
              <span className="ml-auto text-[10px] text-orange-600 font-mono font-bold">{formatCurrencyCompact(bankings.totalAmount)}</span>
              <button className="text-[9px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Verify →</button>
            </div>
          </div>
        )}
        {hasFollowUps && (
          <div className="px-3 py-2 hover:bg-orange-50/30 cursor-pointer" onClick={() => onNavigate?.('merchants')}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[11px] text-amber-700 font-semibold">{followUps.count} follow-up{followUps.count !== 1 ? 's' : ''} due</span>
              <button className="ml-auto text-[9px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Open →</button>
            </div>
            <div className="mt-1">
              {followUps.items.slice(0, 2).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-gray-600">
                  <span className="truncate flex-1">{f.subject}</span>
                  <span className="text-gray-400 truncate max-w-[80px]">{f.merchantName}</span>
                  <span className={`text-[9px] ${new Date(f.followUpAt) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                    {new Date(f.followUpAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

import React from 'react'

interface HubTodayModuleProps { onNavigate?: (module: string) => void }

export default function HubTodayModule({ onNavigate }: HubTodayModuleProps = {}) {
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStation, setActiveStation] = useState<StationKey>('sort')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dayCloseOpen, setDayCloseOpen] = useState(false)
  const [dayCloseData, setDayCloseData] = useState<{
    canClose: boolean
    blockers: { unaccountedParcels: Array<Record<string, unknown>>; pendingBankings: Array<Record<string, unknown>>; pendingShrinkage: Array<Record<string, unknown>>; pipelineOrders: Array<Record<string, unknown>> }
    summary: Record<string, unknown>
  } | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<SearchOrder | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/hub-today?range=today`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      toast.error('Failed to load operations desk')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // ── Search ──
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); setIsSearching(false); return }
    setIsSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ops-search?q=${encodeURIComponent(q)}`)
        const d = await res.json()
        setSearchResults(d)
      } catch { toast.error('Search failed') }
      finally { setIsSearching(false) }
    }, 250)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchQuery])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [])

  useEffect(() => { searchInputRef.current?.focus() }, [])

  const handleSelectOrder = (order: SearchOrder) => {
    setSelectedOrder(order)
    setSearchOpen(false)
    if (['sort', 'stage', 'dispatch', 'inTransit', 'delivered', 'returns'].includes(order.stageKey)) {
      setActiveStation(order.stageKey as StationKey)
      setExpandedId(order.id)
    }
  }

  // ── Day close ──
  const handleDayCloseCheck = async () => {
    try {
      const res = await fetch('/api/day-close')
      const d = await res.json()
      setDayCloseData(d)
      setDayCloseOpen(true)
    } catch { toast.error('Failed to check day-close status') }
  }

  const handleDayCloseConfirm = async () => {
    try {
      const res = await fetch('/api/day-close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ performedBy: 'admin' }) })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Day closed: ${result.summary.deliveredCount} delivered, COD ${formatCurrency(result.summary.codCollected)}`)
        setDayCloseOpen(false)
        fetchData()
      } else { toast.error(result.error || 'Cannot close day') }
    } catch { toast.error('Failed to close day') }
  }

  // ── Remind driver ──
  const handleRemindDriver = async (driverId: string, driverName: string, phone: string, unbankedAmount: number) => {
    try {
      const res = await fetch('/api/driver-communication', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, type: 'call', subject: `Late COD banking — ${formatCurrency(unbankedAmount)} unbanked`, notes: `Call ${phone} to remind ${driverName} to bank.`, createdBy: 'operations-desk' }),
      })
      if (res.ok) toast.success(`Reminder logged for ${driverName}`)
      else toast.error('Failed to log reminder')
    } catch { toast.error('Failed to log reminder') }
  }

  // ── Loading / Error ──
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertTriangle size={32} className="text-red-500" />
      <p className="text-sm text-gray-700 font-medium">Failed to load</p>
      <Button variant="outline" size="sm" onClick={fetchData} className="rounded-xl"><RefreshCw size={12} className="mr-1.5" /> Retry</Button>
    </div>
  )
  if (loading || !data) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw size={24} className="animate-spin text-gray-400" />
      <span className="ml-2 text-gray-500">Loading...</span>
    </div>
  )

  const dayCloseBlockers = data.dayClose.unaccountedParcels + data.dayClose.pendingBankingsCount + data.dayClose.pipelineOrders + data.dayClose.pendingShrinkageCount

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Operations Desk</h1>
          <p className="text-[11px] text-gray-500">
            {new Date(data.date).toLocaleDateString('en-UG', { weekday: 'short', month: 'short', day: 'numeric' })}
            {lastRefreshed && <span className="ml-2 text-gray-400">· Updated {lastRefreshed.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}</span>}
            <span className="ml-2 text-gray-400">· 30s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md"><HelpCircle size={12} className="mr-1" /> Help</Button>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-7 text-xs rounded-md"><RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          <Button size="sm" onClick={handleDayCloseCheck} className={`h-7 text-xs rounded-md ${data.dayClose.canClose ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'} text-white`}>
            <Lock size={12} className="mr-1" /> Close Day{dayCloseBlockers > 0 ? ` (${dayCloseBlockers})` : ''}
          </Button>
        </div>
      </div>

      {/* ── Day progress summary banner ── */}
      {(() => {
        const totalProcessed = data.totals.outboundToday || 1
        const deliveredPct = Math.round((data.stations.delivered.count / totalProcessed) * 100)
        const pipelineCount = (data.stations.intake.count || 0) + (data.stations.sort.count || 0) + (data.stations.stage.count || 0) + (data.stations.dispatch.count || 0) + (data.stations.inTransit.count || 0)
        const isOnTrack = data.exceptions.count === 0 && pipelineCount <= data.stations.delivered.count * 0.3
        const isBehind = data.exceptions.count > 2 || pipelineCount > data.stations.delivered.count * 0.5
        return (
          <div className={`rounded-lg px-4 py-2 flex items-center gap-3 text-xs border ${isBehind ? 'bg-red-50 border-red-200' : isOnTrack ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <span className={`font-bold ${isBehind ? 'text-red-700' : isOnTrack ? 'text-green-700' : 'text-amber-700'}`}>
              {isBehind ? '⚠ BEHIND' : isOnTrack ? '✓ ON TRACK' : '○ MONITOR'}
            </span>
            <span className="text-gray-600">
              {deliveredPct}% delivered · {data.exceptions.count} exception{data.exceptions.count !== 1 ? 's' : ''} · {pipelineCount} order{pipelineCount !== 1 ? 's' : ''} in pipeline
            </span>
            <span className="ml-auto text-gray-400 font-mono">
              {data.stations.delivered.count} / {totalProcessed} done
            </span>
          </div>
        )
      })()}

      {/* ── Number strip (no charts, just counts) ── */}
      <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
        {[
          { label: 'RECEIVED', value: data.totals.inboundToday },
          { label: 'PROCESSED', value: data.totals.outboundToday },
          { label: 'DELIVERED', value: data.stations.delivered.count },
          { label: 'EXCEPTIONS', value: data.exceptions.count, highlight: data.exceptions.count > 0 },
          { label: 'RIDERS', value: `${data.riders.length} active` },
          { label: 'COD PENDING', value: formatCurrencyCompact(data.pendingBankings.totalAmount), highlight: data.pendingBankings.count > 0 },
        ].map((c, i) => (
          <div key={c.label} className={`flex-1 px-3 py-2 flex flex-col justify-center border-r border-white/10 ${c.highlight ? 'bg-red-500/20' : ''} ${i === 5 ? 'border-r-0' : ''}`}>
            <span className="text-[9px] text-blue-200/60 uppercase tracking-wider font-medium">{c.label}</span>
            <span className="font-mono font-bold text-base tabular-nums">{c.value}</span>
          </div>
        ))}
      </div>

      {/* ── Search (compact, single line) ── */}
      <div className="relative" ref={dropdownRef}>
        <form onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) setSearchOpen(true) }} className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search by product, customer, or order ID..."
            ref={searchInputRef}
            className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35]/20"
          />
          {searchQuery && (
            <button type="button" onClick={() => { setSearchQuery(''); setSearchResults(null); setSelectedOrder(null); setSearchOpen(false); searchInputRef.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </form>

        {/* Search dropdown */}
        {searchOpen && searchQuery.trim() && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl max-h-[480px] overflow-y-auto">
            {isSearching && <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> Searching...</div>}
            {!isSearching && searchResults && searchResults.results.length === 0 && (
              <div className="px-4 py-4 text-xs text-gray-500"><p>No active orders match "{searchQuery}".</p></div>
            )}
            {!isSearching && searchResults && searchResults.results.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100 sticky top-0 bg-white">
                  {searchResults.results.length} product{searchResults.results.length !== 1 ? 's' : ''}, {searchResults.totalOrders} order{searchResults.totalOrders !== 1 ? 's' : ''}
                </div>
                {searchResults.results.map(product => (
                  <div key={product.productId} className="border-b border-gray-50 last:border-0">
                    <div className="px-3 py-1.5 bg-gray-50/60 flex items-center gap-2">
                      <Package size={12} className="text-gray-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-800 truncate">{product.productName}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{product.merchantName}</span>
                    </div>
                    {product.orders.map(order => (
                      <button key={order.id} onClick={() => handleSelectOrder(order)} className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${order.matchedQuery ? 'bg-blue-50/80 hover:bg-blue-100/80' : 'hover:bg-gray-50'}`}>
                        <span className="font-mono text-xs font-bold text-[#1B2A4A] w-24 shrink-0">{order.id}</span>
                        <span className="text-xs text-gray-700 flex-1 truncate">{order.customerName}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{order.qty}u</span>
                        <span className="text-[10px] text-gray-500 shrink-0 w-24 text-right flex items-center justify-end gap-1">
                          {order.isStale && <span title={`Stuck for ${formatDwell(order.entryMinutes)}`} className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
                          {order.stage}
                        </span>
                        <ChevronRight size={12} className="text-gray-300 shrink-0" />
                      </button>
                    ))}
                    {product.moreOrdersCount > 0 && <div className="px-3 py-1 text-[10px] text-gray-400 italic">+{product.moreOrdersCount} more</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Selected order summary (only when an order is selected) ── */}
      {selectedOrder && (
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-900">{selectedOrder.id}</span>
              <span className="text-xs text-gray-500">{selectedOrder.customerName}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${selectedOrder.isStale ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                {selectedOrder.isStale ? 'STALE' : selectedOrder.stage}
              </span>
            </div>
            <button onClick={() => onNavigate?.(STATION_MODULE[selectedOrder.stageKey] || 'outbound')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">
              Open in {STATIONS.find(s => s.key === selectedOrder.stageKey)?.shortLabel || 'Outbound'} →
            </button>
            <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600 ml-2"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <span>Qty: <strong className="font-mono text-gray-900">{selectedOrder.qty}</strong></span>
            {selectedOrder.saleAmount != null && <span>Sale: <strong className="font-mono text-gray-900">{formatCurrencyCompact(selectedOrder.saleAmount)}</strong></span>}
            {selectedOrder.codCollected != null && <span>COD: <strong className="font-mono text-gray-900">{formatCurrencyCompact(selectedOrder.codCollected)}</strong></span>}
            {selectedOrder.assignedDriver && <span>Driver: <strong className="text-gray-900">{selectedOrder.assignedDriver}</strong></span>}
            {selectedOrder.entryMinutes != null && <span>In stage: <strong className={`font-mono ${selectedOrder.isStale ? 'text-orange-700' : 'text-gray-900'}`}>{formatDwell(selectedOrder.entryMinutes)}</strong></span>}
          </div>
        </div>
      )}

      {/* ── Pipeline flow diagram (replaces tab bar) ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-2 overflow-x-auto">
        <div className="flex items-stretch gap-0 min-w-max">
          {STATIONS.map((s, i) => {
            const station = data.stations[s.key]
            const count = station?.count ?? 0
            const isActive = activeStation === s.key
            const dwell = station?.avgDwellMinutes ?? null
            const threshold = STALE_THRESHOLD_MINUTES[s.key]
            const stale = isStationStale(dwell, threshold, count)
            const heatColor = dwellColor(dwell, threshold, count)
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-stretch">
                {/* Arrow connector (except first) */}
                {i > 0 && (
                  <div className="flex items-center px-0.5">
                    <div className={`w-4 h-px ${count > 0 ? 'bg-gray-300' : 'bg-gray-100'}`} />
                  </div>
                )}
                {/* Node */}
                <button
                  onClick={() => { setActiveStation(s.key); setExpandedId(null) }}
                  className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-all min-w-[80px] relative ${
                    isActive ? 'bg-orange-50 ring-2 ring-[#FF6B35]' : 'hover:bg-gray-50'
                  }`}
                  title={dwell != null ? `Avg dwell: ${formatDwell(dwell)}` : undefined}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon size={12} className={isActive ? 'text-[#FF6B35]' : 'text-gray-400'} />
                    <span className={`text-[10px] font-semibold ${isActive ? 'text-[#FF6B35]' : 'text-gray-600'}`}>{s.shortLabel}</span>
                  </div>
                  <span className={`font-mono font-bold text-lg tabular-nums leading-none ${count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{count}</span>
                  {/* Dwell time */}
                  {count > 0 && dwell != null && (
                    <span className={`text-[9px] font-mono mt-0.5 ${stale ? 'text-orange-600 font-bold' : 'text-gray-400'}`}>
                      {stale ? '⚠ ' : ''}{formatDwell(dwell)}
                    </span>
                  )}
                  {/* Heat bar */}
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full overflow-hidden">
                    <div className={`h-full ${heatColor} ${stale ? 'animate-pulse' : ''}`} />
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main: table + right rail ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <StationTable station={data.stations[activeStation]} stationKey={activeStation} expandedId={expandedId} onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)} />
        </div>
        <div className="space-y-3">
          <DriverStatusPanel riders={data.riders} />
          <AlertsPanel exceptions={data.exceptions} bankings={{ count: data.pendingBankings.count, totalAmount: data.pendingBankings.totalAmount }} lateBankings={data.lateBankings} followUps={data.followUps} onNavigate={onNavigate} />
        </div>
      </div>

      {/* ── Day Close Dialog ── */}
      <AlertDialog open={dayCloseOpen} onOpenChange={setDayCloseOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Lock size={18} /> Close Day · {new Date().toLocaleDateString('en-UG')}</AlertDialogTitle>
            <AlertDialogDescription>
              Closing finalizes today's operations. All parcels must be delivered or returned. All COD must be banked.
              <br />
              <span className="text-[11px] text-gray-400 mt-1 block">
                {data.totals.outboundToday} orders today · {data.stations.delivered.count} delivered
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dayCloseData && (
            <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
              {dayCloseData.blockers.unaccountedParcels.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-1">⚠ {dayCloseData.blockers.unaccountedParcels.length} parcels unaccounted for</p>
                  <div className="max-h-24 overflow-y-auto">
                    {dayCloseData.blockers.unaccountedParcels.slice(0, 15).map((p, idx) => (
                      <p key={idx} className="text-[11px] text-red-700 font-mono">{String(p.orderNumber || p.outboundId || '')}. {String(p.customerName || '')} ({String(p.status || '')})</p>
                    ))}
                  </div>
                </div>
              )}
              {dayCloseData.blockers.pendingBankings.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-sm font-medium text-orange-900">⚠ {dayCloseData.blockers.pendingBankings.length} pending COD bankings</p>
                  <p className="text-xs text-orange-700 mt-1">Verify in COD Reconciliation before closing.</p>
                </div>
              )}
              {dayCloseData.blockers.pipelineOrders && dayCloseData.blockers.pipelineOrders.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm font-medium text-amber-900 mb-1">⚠ {dayCloseData.blockers.pipelineOrders.length} orders in pipeline</p>
                  <div className="max-h-24 overflow-y-auto">
                    {dayCloseData.blockers.pipelineOrders.slice(0, 10).map((p, idx) => <p key={idx} className="text-[11px] text-amber-700 font-mono">{String(p.orderNumber || p.outboundId || '')} ({String(p.status || '')})</p>)}
                    {dayCloseData.blockers.pipelineOrders.length > 10 && <p className="text-[10px] text-amber-600 italic mt-1">+ {dayCloseData.blockers.pipelineOrders.length - 10} more</p>}
                  </div>
                </div>
              )}
              {dayCloseData.blockers.pendingShrinkage && dayCloseData.blockers.pendingShrinkage.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-sm font-medium text-orange-900">⚠ {dayCloseData.blockers.pendingShrinkage.length} unresolved shrinkage</p>
                </div>
              )}
              {dayCloseData.canClose && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-medium text-green-900 mb-2">✓ Ready to close. Today's summary:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-gray-500">Delivered</p><p className="font-bold text-gray-900">{String(dayCloseData.summary.deliveredCount)} parcels</p></div>
                    <div><p className="text-gray-500">Sales value</p><p className="font-bold text-gray-900">{formatCurrency(Number(dayCloseData.summary.deliveredValue))}</p></div>
                    <div><p className="text-gray-500">COD collected</p><p className="font-bold text-green-700">{formatCurrency(Number(dayCloseData.summary.codCollected))}</p></div>
                    <div><p className="text-gray-500">Returns</p><p className="font-bold text-red-700">{String(dayCloseData.summary.returnedCount)}</p></div>
                  </div>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDayCloseConfirm} disabled={!dayCloseData?.canClose} className={`rounded-xl ${dayCloseData?.canClose ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300'}`}>
              {dayCloseData?.canClose ? 'Confirm Close' : 'Cannot Close'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Help Dialog (terse, professional) ── */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Operations Desk</AlertDialogTitle>
            <AlertDialogDescription>
              Real-time status of every parcel in your warehouse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Stations</p>
              <p>Seven tabs show parcels at each stage of fulfillment — from intake to delivery. Counts update every 30 seconds. Orange dwell time indicates a bottleneck.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Search</p>
              <p>Find any active order by product name, customer, or order ID. Click a result to jump to its station.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Drivers</p>
              <p>The right panel shows who's on shift and their current load. <span className="inline-block w-2 h-2 rounded-full bg-green-400 align-middle" /> available, <span className="inline-block w-2 h-2 rounded-full bg-blue-400 align-middle" /> delivering, <span className="inline-block w-2 h-2 rounded-full bg-orange-400 align-middle" /> pending banking.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Alerts</p>
              <p>The right panel flags failed deliveries, late COD bankings, and overdue follow-ups. Click to jump to the relevant module.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Close Day</p>
              <p>Available when all parcels are delivered or returned and all COD cash is banked. The number in parentheses shows remaining blockers.</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
