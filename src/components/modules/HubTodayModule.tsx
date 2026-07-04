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
  AlertTriangle, CheckCircle2, X, HelpCircle, ArrowRight, Package,
  Boxes, Truck, ClipboardList, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ── Types ──

interface SearchOrder {
  id: string
  customerName: string
  customerAddress: string | null
  qty: number
  status: string
  stage: string
  stageKey: string
  codCollected: number | null
  saleAmount: number | null
  assignedDriver: string | null
  runsheetId: string | null
  createdAt: string
  dispatchedAt: string | null
  deliveredAt: string | null
}

interface SearchProduct {
  productId: string
  productName: string
  brand: string | null
  variant: string | null
  merchantName: string
  category: string
  unit: string
  currentStock: number
  orders: SearchOrder[]
}

interface SearchResponse {
  query: string
  results: SearchProduct[]
  totalOrders: number
}

interface StationItem {
  id?: string
  inboundId?: string
  outboundId?: string
  orderNumber?: string
  afterSalesId?: string
  name?: string  // rider name (used by riders list)
  customerName?: string
  productName?: string
  merchantName?: string
  customerAddress?: string
  qty?: number
  qtyIn?: number
  status?: string
  returnStatus?: string
  runsheetId?: string | null
  assignedDriver?: string | null
  codCollected?: number | null
  saleAmount?: number | null
  deliveryNotes?: string | null
  deliveryAttempts?: number
  dispatchedAt?: string
  deliveredAt?: string
  createdAt?: string
  bankedAt?: string
  reason?: string
  refundAmount?: number | null
  shrinkageId?: string
  bankingId?: string
  driverName?: string
  amount?: number
  phone?: string
  expectedBankings?: number
  banked?: number
  dispatchedToday?: number
  deliveredToday?: number
  pendingBankings?: number
}

interface Station {
  count: number
  items: StationItem[]
  label: string
  description: string
  action: string
  targetModule: string
}

interface HubData {
  date: string
  stations: {
    intake: Station
    sort: Station
    stage: Station
    dispatch: Station
    inTransit: Station
    delivered: Station
    returns: Station
  }
  exceptions: {
    failedDeliveries: StationItem[]
    pendingShrinkage: StationItem[]
    count: number
  }
  riders: StationItem[]
  pendingBankings: {
    count: number
    items: StationItem[]
    totalAmount: number
  }
  followUps: {
    count: number
    items: Array<{
      id: string
      merchantId: string
      merchantName: string
      merchantOnHold: boolean
      type: string
      subject: string
      followUpAt: string
      createdAt: string
    }>
  }
  dayClose: {
    canClose: boolean
    unaccountedParcels: number
    pendingBankingsCount: number
  }
  totals: {
    inboundToday: number
    outboundToday: number
    codCollectedToday: number
    salesToday: number
  }
}

type StationKey = 'intake' | 'sort' | 'stage' | 'dispatch' | 'inTransit' | 'delivered' | 'returns'

const STATIONS: { key: StationKey; label: string; shortLabel: string; description: string; icon: typeof Package; pillClass: string }[] = [
  { key: 'intake',    label: 'INTAKE',         shortLabel: 'Intake',          description: 'Stock that arrived — needs to be put away on shelves (received → put away → stored)', icon: Package,       pillClass: 'text-blue-600' },
  { key: 'sort',      label: 'SORT & PACK',    shortLabel: 'Sort & Pack',     description: 'Orders being prepared — picking from shelves, then packing into boxes (pending → picking → picked → packing → packed)', icon: Boxes,        pillClass: 'text-orange-600' },
  { key: 'stage',     label: 'STAGING',        shortLabel: 'Staging',         description: 'Packed and ready — waiting for a rider to be assigned',   icon: ClipboardList, pillClass: 'text-purple-600' },
  { key: 'dispatch',  label: 'DISPATCH',       shortLabel: 'Dispatch',        description: 'Assigned to a rider — ready to leave the warehouse', icon: Truck,     pillClass: 'text-yellow-700' },
  { key: 'inTransit', label: 'IN TRANSIT',     shortLabel: 'In Transit',      description: 'Out for delivery — rider is on the road',        icon: ArrowRight,    pillClass: 'text-cyan-600' },
  { key: 'delivered', label: 'DELIVERED',      shortLabel: 'Delivered',       description: 'Successfully delivered to the customer today', icon: CheckCircle2, pillClass: 'text-green-700' },
  { key: 'returns',   label: 'RETURNS',        shortLabel: 'Returns',         description: 'Customer returns received — needs inspection and disposition',   icon: RotateCcw,     pillClass: 'text-red-600' },
]

// ── Workflow progress stages (for the Order Status visualizer) ──
// Only the outbound flow is shown — Intake and Returns are separate flows.
const STAGES_FLOW: { key: StationKey; shortLabel: string; color: string }[] = [
  { key: 'sort',      shortLabel: 'Sort',     color: 'bg-orange-400' },
  { key: 'stage',     shortLabel: 'Stage',    color: 'bg-purple-400' },
  { key: 'dispatch',  shortLabel: 'Dispatch', color: 'bg-yellow-400' },
  { key: 'inTransit', shortLabel: 'Transit',  color: 'bg-cyan-400' },
  { key: 'delivered', shortLabel: 'Delivered',color: 'bg-green-500' },
]

const STAGE_ORDER: Record<string, number> = {
  sort: 0, stage: 1, dispatch: 2, inTransit: 3, delivered: 4,
}

const STAGE_CALLOUT_TINT: Record<string, string> = {
  sort:      'bg-orange-50 border-orange-200',
  stage:     'bg-purple-50 border-purple-200',
  dispatch:  'bg-yellow-50 border-yellow-200',
  inTransit: 'bg-cyan-50 border-cyan-200',
  delivered: 'bg-green-50 border-green-200',
  returns:   'bg-red-50 border-red-200',
}

// Maps a station key to the sidebar module the worker should jump to
// to actually do work on that station's parcels.
const STATION_MODULE: Record<string, string> = {
  intake: 'inventory',
  sort: 'outbound',
  stage: 'outbound',
  dispatch: 'outbound',
  inTransit: 'outbound',
  delivered: 'outbound',
  returns: 'returns',
}

// ── Status pill: colored dot + 2-letter code ──
function StatusPill({ status, station }: { status: string; station: StationKey }) {
  const map: Record<string, { dot: string; code: string; label: string }> = {
    // outbound statuses
    pending:    { dot: 'bg-gray-400',   code: 'PD', label: 'Pending' },
    picking:    { dot: 'bg-blue-500',   code: 'PK', label: 'Picking' },
    picked:     { dot: 'bg-blue-600',   code: 'PD', label: 'Picked' },
    packing:    { dot: 'bg-orange-500', code: 'PG', label: 'Packing' },
    packed:     { dot: 'bg-orange-600', code: 'PC', label: 'Packed' },
    dispatched: { dot: 'bg-cyan-500',   code: 'DP', label: 'Dispatched' },
    delivered:  { dot: 'bg-green-600',  code: 'DL', label: 'Delivered' },
    failed:     { dot: 'bg-red-500',    code: 'FL', label: 'Failed' },
    returned:   { dot: 'bg-red-600',    code: 'RT', label: 'Returned' },
    cancelled:  { dot: 'bg-gray-500',   code: 'CL', label: 'Cancelled' },
    // inbound
    received:   { dot: 'bg-blue-500',   code: 'RC', label: 'Received' },
    put_away:   { dot: 'bg-yellow-500', code: 'PA', label: 'Put Away' },
    stored:     { dot: 'bg-green-600',  code: 'ST', label: 'Stored' },
    // rma
    initiated:  { dot: 'bg-blue-400',   code: 'IN', label: 'Initiated' },
    in_review:  { dot: 'bg-yellow-500', code: 'RV', label: 'In Review' },
    approved:   { dot: 'bg-green-500',  code: 'AP', label: 'Approved' },
    rejected:   { dot: 'bg-red-500',    code: 'RJ', label: 'Rejected' },
    processed:  { dot: 'bg-green-600',  code: 'PR', label: 'Processed' },
  }
  const s = map[status] || { dot: 'bg-gray-400', code: '??', label: status }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-gray-700" title={s.label}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.code}
    </span>
  )
}

// ── Row tint based on status ──
function rowTint(status: string): string {
  if (['delivered', 'stored', 'processed'].includes(status)) return 'bg-green-50/40'
  if (['dispatched'].includes(status)) return 'bg-cyan-50/40'
  if (['failed', 'returned', 'rejected', 'cancelled'].includes(status)) return 'bg-red-50/40'
  if (['packed', 'put_away', 'in_review'].includes(status)) return 'bg-orange-50/40'
  if (['picking', 'packing', 'received', 'initiated'].includes(status)) return 'bg-blue-50/40'
  return ''
}

// ── KPI Ribbon ── (replaces the 4-card totals strip — single dense bar, no icons, no gradients)
function KpiRibbon({ totals, exceptionsCount, ridersCount, codPending, deliveredCount }: {
  totals: HubData['totals']
  exceptionsCount: number
  ridersCount: number
  codPending: number
  deliveredCount: number
}) {
  const cells = [
    { label: 'INBOUND', value: String(totals.inboundToday) },
    { label: 'OUTBOUND', value: String(totals.outboundToday) },
    { label: 'DELIVERED', value: String(deliveredCount) },
    { label: 'EXCEPTIONS', value: String(exceptionsCount), highlight: exceptionsCount > 0 },
    { label: 'COD', value: formatCurrencyCompact(totals.codCollectedToday) },
    { label: 'SALES', value: formatCurrencyCompact(totals.salesToday) },
    { label: 'RIDERS', value: String(ridersCount) },
    { label: 'COD PENDING', value: formatCurrencyCompact(codPending), highlight: codPending > 0 },
  ]
  return (
    <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`flex-1 px-3 py-2 flex flex-col justify-center border-r border-white/10 ${c.highlight ? 'bg-red-500/20' : ''} ${i === cells.length - 1 ? 'border-r-0' : ''}`}
        >
          <span className="text-[9px] text-blue-200/60 uppercase tracking-wider font-medium">{c.label}</span>
          <span className="font-mono font-bold text-base tabular-nums">{c.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Dense Table for a station ──
function StationTable({
  station,
  stationKey,
  expandedId,
  onToggleExpand,
}: {
  station: Station
  stationKey: StationKey
  expandedId: string | null
  onToggleExpand: (id: string) => void
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
      if (sortBy === 'amount') {
        return Number(b.codCollected || b.saleAmount || 0) - Number(a.codCollected || a.saleAmount || 0)
      }
      if (sortBy === 'status') {
        return String(a.status || a.returnStatus || '').localeCompare(String(b.status || b.returnStatus || ''))
      }
      // time: newest first
      const aTime = new Date(a.dispatchedAt || a.deliveredAt || a.createdAt || 0).getTime()
      const bTime = new Date(b.dispatchedAt || b.deliveredAt || b.createdAt || 0).getTime()
      return bTime - aTime
    })
    return items
  }, [station.items, search, sortBy])

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        No items in this queue.
      </div>
    )
  }

  return (
    <div>
      {/* Inline filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Filter this queue..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs rounded-md"
          />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Sort:</span>
          {(['time', 'amount', 'status'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 rounded text-[11px] ${sortBy === s ? 'bg-[#1B2A4A] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {s === 'time' ? 'Time' : s === 'amount' ? 'Amount' : 'Status'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400 font-mono">
          {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Dense table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
              <th className="text-left px-3 py-1.5 font-semibold w-32">ID</th>
              <th className="text-left px-3 py-1.5 font-semibold">Customer / Product</th>
              {stationKey === 'inTransit' || stationKey === 'delivered' || stationKey === 'dispatch' ? (
                <th className="text-left px-3 py-1.5 font-semibold w-28">Driver</th>
              ) : null}
              {stationKey === 'intake' ? (
                <th className="text-left px-3 py-1.5 font-semibold w-28">Merchant</th>
              ) : null}
              <th className="text-right px-3 py-1.5 font-semibold w-16">Qty</th>
              <th className="text-right px-3 py-1.5 font-semibold w-28">Amount</th>
              <th className="text-left px-3 py-1.5 font-semibold w-20">Status</th>
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
                <>
                  <tr
                    key={id}
                    onClick={() => onToggleExpand(id)}
                    className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${rowTint(status)} ${isExpanded ? 'bg-blue-50' : ''}`}
                    style={{ height: '32px' }}
                  >
                    <td className="px-3 py-1 font-mono font-semibold text-gray-900 text-[11px]">
                      {item.orderNumber || item.outboundId || item.inboundId || item.afterSalesId || '—'}
                    </td>
                    <td className="px-3 py-1 text-gray-700 truncate max-w-xs">
                      {item.customerName || item.productName || '—'}
                    </td>
                    {(stationKey === 'inTransit' || stationKey === 'delivered' || stationKey === 'dispatch') && (
                      <td className="px-3 py-1 text-gray-600 text-[11px]">{item.assignedDriver || '—'}</td>
                    )}
                    {stationKey === 'intake' && (
                      <td className="px-3 py-1 text-gray-600 text-[11px] truncate">{item.merchantName || '—'}</td>
                    )}
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-gray-700">
                      {item.qty || item.qtyIn || '—'}
                    </td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-gray-900 font-medium">
                      {amount > 0 ? formatCurrencyCompact(amount) : '—'}
                    </td>
                    <td className="px-3 py-1">
                      <StatusPill status={status} station={stationKey} />
                    </td>
                    <td className="px-2 text-gray-400">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-detail`} className="bg-white border-b border-gray-200">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Customer</p>
                            <p className="text-gray-900 font-medium">{item.customerName || '—'}</p>
                            {item.customerAddress && <p className="text-gray-500 text-[11px] mt-0.5">{item.customerAddress}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Product / Item</p>
                            <p className="text-gray-900">{item.productName || '—'}</p>
                            {item.merchantName && <p className="text-gray-500 text-[11px] mt-0.5">{item.merchantName}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Driver / Runsheet</p>
                            <p className="text-gray-900">{item.assignedDriver || 'Unassigned'}</p>
                            {item.runsheetId && <p className="text-gray-500 text-[11px] font-mono mt-0.5">{item.runsheetId}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Money</p>
                            <p className="text-gray-900">
                              {item.codCollected ? `COD ${formatCurrency(Number(item.codCollected))}` : item.saleAmount ? formatCurrency(Number(item.saleAmount)) : '—'}
                            </p>
                            {item.refundAmount && <p className="text-red-600 text-[11px] mt-0.5">Refund: {formatCurrency(Number(item.refundAmount))}</p>}
                          </div>
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
                        {item.deliveryNotes && (
                          <div className="mt-2 p-2 rounded bg-red-50 border border-red-100 text-[11px] text-red-700">
                            ⚠ {item.deliveryNotes}
                          </div>
                        )}
                        {item.reason && (
                          <div className="mt-2 p-2 rounded bg-orange-50 border border-orange-100 text-[11px] text-orange-700">
                            Reason: {item.reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Right-rail mini-tables ──
function RidersPanel({ riders }: { riders: StationItem[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Riders</span>
        <span className="text-[11px] text-gray-500 font-mono">{riders.length} active</span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-gray-400 text-[9px] uppercase">
          <tr>
            <th className="text-left px-3 py-1 font-semibold">Name</th>
            <th className="text-right px-2 py-1 font-semibold">Disp</th>
            <th className="text-right px-2 py-1 font-semibold">Del</th>
            <th className="text-right px-3 py-1 font-semibold">Bank</th>
          </tr>
        </thead>
        <tbody>
          {riders.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-3 text-center text-gray-400">No active riders</td></tr>
          ) : riders.slice(0, 10).map((r, i) => (
            <tr key={i} className="border-t border-gray-50 hover:bg-gray-50" style={{ height: '28px' }}>
              <td className="px-3 py-1 text-gray-900 font-medium truncate max-w-[120px]">{r.name || '—'}</td>
              <td className="px-2 py-1 text-right font-mono tabular-nums text-gray-700">{r.dispatchedToday ?? 0}</td>
              <td className="px-2 py-1 text-right font-mono tabular-nums text-green-700">{r.deliveredToday ?? 0}</td>
              <td className={`px-3 py-1 text-right font-mono tabular-nums ${(r.pendingBankings ?? 0) > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}`}>
                {r.pendingBankings ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FollowUpsPanel({ followUps, onNavigate }: {
  followUps: HubData['followUps']
  onNavigate?: (m: string) => void
}) {
  if (followUps.count === 0) {
    return (
      <div className="bg-white rounded-lg border border-green-200 px-3 py-2 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-green-600" />
        <span className="text-[11px] text-green-700 font-medium">No merchant follow-ups due.</span>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-orange-700 uppercase tracking-wider flex items-center gap-1">
          <AlertTriangle size={12} /> Follow-ups Due
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-orange-700 font-mono font-bold">{followUps.count}</span>
          <button onClick={() => onNavigate?.('merchants')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Open →</button>
        </div>
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {followUps.items.slice(0, 8).map((f, i) => {
            const isOverdue = new Date(f.followUpAt) < new Date()
            const typeColor: Record<string, string> = { call: 'bg-blue-100 text-blue-700', whatsapp: 'bg-green-100 text-green-700', email: 'bg-purple-100 text-purple-700', visit: 'bg-orange-100 text-orange-700', meeting: 'bg-pink-100 text-pink-700', other: 'bg-gray-100 text-gray-700' }
            return (
              <tr key={f.id} className={`border-t border-orange-50 hover:bg-orange-50/30 ${isOverdue ? 'bg-red-50/20' : ''}`} style={{ height: '32px' }}>
                <td className="px-3 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1 py-0.5 rounded text-[8px] uppercase font-semibold ${typeColor[f.type] || 'bg-gray-100 text-gray-700'}`}>{f.type}</span>
                    {f.merchantOnHold && <span className="bg-red-100 text-red-700 text-[8px] px-1 py-0.5 rounded font-semibold uppercase">HOLD</span>}
                  </div>
                  <p className="text-gray-900 font-medium truncate max-w-[180px] mt-0.5">{f.subject}</p>
                </td>
                <td className="px-2 py-1 text-right">
                  <p className="text-gray-700 truncate max-w-[80px]">{f.merchantName}</p>
                  <p className={`text-[9px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                    {isOverdue ? 'Overdue ' : 'Due '}{new Date(f.followUpAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
                  </p>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {followUps.count > 8 && (
        <div className="px-3 py-1.5 border-t border-orange-100 bg-orange-50/50 text-center">
          <button onClick={() => onNavigate?.('merchants')} className="text-[10px] text-orange-700 hover:text-orange-900 font-medium">
            + {followUps.count - 8} more — view all in Merchants
          </button>
        </div>
      )}
    </div>
  )
}

function CodPanel({ bankings, onNavigate }: { bankings: { count: number; items: StationItem[]; totalAmount: number }; onNavigate?: (m: string) => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
          Pending COD <InfoTip term="codBanked" size={11} />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-orange-700">{formatCurrencyCompact(bankings.totalAmount)}</span>
          {bankings.count > 0 && (
            <button onClick={() => onNavigate?.('payments')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Verify →</button>
          )}
        </div>
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-gray-400 text-[9px] uppercase">
          <tr>
            <th className="text-left px-3 py-1 font-semibold">Banking</th>
            <th className="text-left px-2 py-1 font-semibold">Driver</th>
            <th className="text-right px-3 py-1 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bankings.count === 0 ? (
            <tr><td colSpan={3} className="px-3 py-3 text-center text-gray-400">All verified</td></tr>
          ) : bankings.items.slice(0, 10).map((b, i) => (
            <tr key={i} className="border-t border-gray-50 hover:bg-orange-50/30" style={{ height: '28px' }}>
              <td className="px-3 py-1 font-mono text-gray-600">{b.bankingId || '—'}</td>
              <td className="px-2 py-1 text-gray-700 truncate max-w-[80px]">{b.driverName || '—'}</td>
              <td className="px-3 py-1 text-right font-mono tabular-nums font-bold text-orange-700">
                {formatCurrencyCompact(Number(b.amount || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExceptionsPanel({ exceptions, onNavigate }: { exceptions: HubData['exceptions']; onNavigate?: (m: string) => void }) {
  if (exceptions.count === 0) {
    return (
      <div className="bg-white rounded-lg border border-green-200 px-3 py-2 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-green-600" />
        <span className="text-[11px] text-green-700 font-medium">No exceptions. All clear.</span>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-red-100 bg-red-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1">
          <AlertTriangle size={12} /> Exceptions
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-red-700 font-mono font-bold">{exceptions.count}</span>
          <button onClick={() => onNavigate?.('returns')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">Fix →</button>
        </div>
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {exceptions.failedDeliveries.slice(0, 5).map((item, i) => (
            <tr key={`f-${i}`} className="border-t border-red-50 bg-red-50/20 hover:bg-red-50/40" style={{ height: '28px' }}>
              <td className="px-3 py-1 font-mono text-gray-700">{item.orderNumber || item.outboundId}</td>
              <td className="px-2 py-1 text-gray-600 truncate max-w-[100px]">{item.customerName}</td>
              <td className="px-3 py-1 text-right">
                <span className="inline-block px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-semibold">FAILED</span>
              </td>
            </tr>
          ))}
          {exceptions.pendingShrinkage.slice(0, 5).map((item, i) => (
            <tr key={`s-${i}`} className="border-t border-red-50 bg-orange-50/20 hover:bg-orange-50/40" style={{ height: '28px' }}>
              <td className="px-3 py-1 font-mono text-gray-700">{item.shrinkageId}</td>
              <td className="px-2 py-1 text-gray-600 truncate max-w-[100px]">{item.productName} ×{item.qty}</td>
              <td className="px-3 py-1 text-right">
                <span className="inline-block px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-semibold">SHRINK</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ──
interface HubTodayModuleProps {
  onNavigate?: (module: string) => void
}

export default function HubTodayModule({ onNavigate }: HubTodayModuleProps = {}) {
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStation, setActiveStation] = useState<StationKey>('sort')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Product search state ──
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<SearchOrder | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [dayCloseOpen, setDayCloseOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dayCloseData, setDayCloseData] = useState<{
    canClose: boolean
    blockers: {
      unaccountedParcels: Array<Record<string, unknown>>
      pendingBankings: Array<Record<string, unknown>>
      pendingShrinkage: Array<Record<string, unknown>>
    }
    summary: Record<string, unknown>
  } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/hub-today')
      const d = await res.json()
      setData(d)
      // Only auto-pick station on FIRST load (when data was null), not on every refresh
      // This prevents the station from jumping around while the user is working
    } catch {
      toast.error('Failed to load hub data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // ── Debounced product search ──
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ops-search?q=${encodeURIComponent(q)}`)
        const d = await res.json()
        setSearchResults(d)
      } catch {
        toast.error('Search failed — network error')
      } finally {
        setIsSearching(false)
      }
    }, 250)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  // Close dropdown on outside click / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  // Focus search input on mount only — NOT on every re-render
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  const handleSelectOrder = (order: SearchOrder) => {
    setSelectedOrder(order)
    setSearchOpen(false)
    // Jump the station tabs below to where this parcel is sitting, so the worker
    // sees it in context in the dense table too.
    if (['sort', 'stage', 'dispatch', 'inTransit', 'delivered', 'returns'].includes(order.stageKey)) {
      setActiveStation(order.stageKey as StationKey)
      setExpandedId(order.id)
    }
  }

  const handleDayCloseCheck = async () => {
    try {
      const res = await fetch('/api/day-close')
      const d = await res.json()
      setDayCloseData(d)
      setDayCloseOpen(true)
    } catch {
      toast.error('Failed to check day-close status')
    }
  }

  const handleDayCloseConfirm = async () => {
    try {
      const res = await fetch('/api/day-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performedBy: 'admin' }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Day closed: ${result.summary.deliveredCount} delivered, COD ${formatCurrency(result.summary.codCollected)}`)
        setDayCloseOpen(false)
        fetchData()
      } else {
        toast.error(result.error || 'Cannot close day — blockers exist')
      }
    } catch {
      toast.error('Failed to close day')
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading operations console...</span>
      </div>
    )
  }

  const codPendingAmount = data.pendingBankings.totalAmount

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Operations Desk</h1>
          <p className="text-[11px] text-gray-500">
            {new Date(data.date).toLocaleDateString('en-UG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            <span className="ml-2 text-gray-400">· Auto-refresh 30s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md">
            <HelpCircle size={12} className="mr-1" /> How does this work?
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-7 text-xs rounded-md">
            <RefreshCw size={12} className="mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleDayCloseCheck}
            className={`h-7 text-xs rounded-md ${data.dayClose.canClose ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'} text-white`}
          >
            <Lock size={12} className="mr-1" /> Close Day
          </Button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* LAYER 1: THE WORK LAYER — what a worker sees and uses          */}
      {/* ════════════════════════════════════════════════════════════ */}

      {/* ── HERO: Product search bar (big, obvious, can't miss it) ── */}
      <div className="relative" ref={dropdownRef}>
        <div className="rounded-xl px-4 py-4 bg-[#1B2A4A]">
          <div className="flex items-center gap-3 mb-2">
            <Search size={20} className="text-blue-300" />
            <label className="text-white font-semibold text-sm">
              Search for a product to see where its orders are
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Type a product name (e.g. oil, bread, sugar...)"
              ref={searchInputRef}
              className="flex-1 bg-white/10 text-white placeholder-blue-200/40 text-base outline-none rounded-lg px-3 py-2.5 border border-white/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults(null)
                  setSelectedOrder(null)
                  setSearchOpen(false)
                  searchInputRef.current?.focus()
                }}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-blue-200/50 text-[11px] mt-2">
            Type any product name — the system shows only products being processed right now, with their order numbers and current stage.
          </p>
        </div>

        {/* Dropdown results */}
        {searchOpen && searchQuery.trim() && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-xl max-h-[480px] overflow-y-auto">
            {isSearching && (
              <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" /> Searching...
              </div>
            )}
            {!isSearching && searchResults && searchResults.results.length === 0 && (
              <div className="px-4 py-4 text-xs text-gray-500">
                No active orders for <span className="font-mono font-semibold">{searchQuery}</span> today.
              </div>
            )}
            {!isSearching && searchResults && searchResults.results.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100 sticky top-0 bg-white">
                  {searchResults.results.length} product{searchResults.results.length !== 1 ? 's' : ''} · {searchResults.totalOrders} active order{searchResults.totalOrders !== 1 ? 's' : ''}
                </div>
                {searchResults.results.map(product => (
                  <div key={product.productId} className="border-b border-gray-50 last:border-0">
                    <div className="px-3 py-1.5 bg-gray-50/60 flex items-center gap-2">
                      <Package size={12} className="text-gray-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-800 truncate">{product.productName}</span>
                      {product.brand && <span className="text-[10px] text-gray-400">· {product.brand}</span>}
                      <span className="text-[10px] text-gray-400 ml-auto">{product.merchantName}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">· {product.currentStock} {product.unit} in stock</span>
                    </div>
                    {product.orders.map(order => (
                      <button
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-blue-50/60 text-left"
                      >
                        <span className="font-mono text-xs font-bold text-[#1B2A4A] w-24 shrink-0">{order.id}</span>
                        <span className="text-xs text-gray-700 flex-1 truncate">{order.customerName}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{order.qty} units</span>
                        <span className="text-[10px] text-gray-500 shrink-0 w-24 text-right">{order.stage}</span>
                        <ChevronRight size={12} className="text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Today's progress bar ── */}
      {data.totals.outboundToday > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Today's progress</span>
            <span className="text-[11px] font-mono text-gray-500">
              {data.stations.delivered.count} of {data.totals.outboundToday} delivered
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {/* Delivered (green) */}
            {data.stations.delivered.count > 0 && (
              <div className="bg-green-500" style={{ width: `${(data.stations.delivered.count / data.totals.outboundToday) * 100}%` }} title={`${data.stations.delivered.count} delivered`} />
            )}
            {/* In transit (cyan) */}
            {data.stations.inTransit.count > 0 && (
              <div className="bg-cyan-400" style={{ width: `${(data.stations.inTransit.count / data.totals.outboundToday) * 100}%` }} title={`${data.stations.inTransit.count} in transit`} />
            )}
            {/* Dispatched (yellow) */}
            {data.stations.dispatch.count > 0 && (
              <div className="bg-yellow-400" style={{ width: `${(data.stations.dispatch.count / data.totals.outboundToday) * 100}%` }} title={`${data.stations.dispatch.count} dispatched`} />
            )}
            {/* Sort/Pack (orange) */}
            {data.stations.sort.count > 0 && (
              <div className="bg-orange-400" style={{ width: `${(data.stations.sort.count / data.totals.outboundToday) * 100}%` }} title={`${data.stations.sort.count} sorting/packing`} />
            )}
            {/* Stage (purple) */}
            {data.stations.stage.count > 0 && (
              <div className="bg-purple-400" style={{ width: `${(data.stations.stage.count / data.totals.outboundToday) * 100}%` }} title={`${data.stations.stage.count} staging`} />
            )}
            {/* Exceptions (red) */}
            {data.exceptions.count > 0 && (
              <div className="bg-red-400" style={{ width: `${(data.exceptions.count / data.totals.outboundToday) * 100}%` }} title={`${data.exceptions.count} exceptions`} />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Delivered</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> In transit</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Dispatched</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span> Sorting</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Staging</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span> Exceptions</span>
          </div>
        </div>
      )}

      {/* ── Order Status — shows the stage of the order selected from search ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {selectedOrder ? `Order Status · ${selectedOrder.id}` : 'Order Status'}
          </h2>
          {selectedOrder && (
            <button
              onClick={() => onNavigate?.(STATION_MODULE[selectedOrder.stageKey] || 'outbound')}
              className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider"
            >
              Open in {STATIONS.find(s => s.key === selectedOrder.stageKey)?.shortLabel || 'Outbound'} →
            </button>
          )}
        </div>

        {!selectedOrder ? (
          <div className="px-4 py-8 text-center">
            <Search size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">Search for a product above</p>
            <p className="text-[11px] text-gray-400 mt-1 max-w-md mx-auto">
              Type a product name like "oil" or "bread" — click an order number to see its current stage here.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Order header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-lg font-bold text-gray-900">{selectedOrder.id}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{selectedOrder.customerName}</p>
                {selectedOrder.customerAddress && (
                  <p className="text-[11px] text-gray-400 truncate">{selectedOrder.customerAddress}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Qty</p>
                <p className="font-mono font-bold text-gray-900">{selectedOrder.qty}</p>
              </div>
            </div>

            {/* Current stage callout */}
            <div className={`rounded-lg px-4 py-3 border ${STAGE_CALLOUT_TINT[selectedOrder.stageKey] || 'bg-gray-50 border-gray-200'}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Currently at</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{selectedOrder.stage}</p>
              {selectedOrder.assignedDriver && (
                <p className="text-[11px] text-gray-600 mt-1">Driver: {selectedOrder.assignedDriver}</p>
              )}
              {selectedOrder.runsheetId && (
                <p className="text-[11px] text-gray-500">Runsheet: {selectedOrder.runsheetId}</p>
              )}
              {selectedOrder.dispatchedAt && (
                <p className="text-[11px] text-gray-500">
                  Dispatched: {new Date(selectedOrder.dispatchedAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {selectedOrder.deliveredAt && (
                <p className="text-[11px] text-green-700 font-medium">
                  Delivered: {new Date(selectedOrder.deliveredAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>

            {/* Stage progress bar — shows where this order is in the outbound flow */}
            {selectedOrder.stageKey !== 'returns' && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Workflow progress</p>
                <div className="flex items-center gap-1">
                  {STAGES_FLOW.map((stage, i) => {
                    const currentIdx = STAGE_ORDER[selectedOrder.stageKey] ?? -1
                    const isPast = currentIdx > i
                    const isCurrent = selectedOrder.stageKey === stage.key
                    return (
                      <div
                        key={stage.key}
                        className={`flex-1 h-2 rounded-full transition-colors ${
                          isCurrent ? stage.color :
                          isPast ? stage.color.replace('400', '500').replace('500', '600') :
                          'bg-gray-100'
                        }`}
                        title={stage.shortLabel}
                      />
                    )
                  })}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {STAGES_FLOW.map(stage => (
                    <div key={stage.key} className="flex-1 text-center">
                      <p className={`text-[9px] ${selectedOrder.stageKey === stage.key ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                        {stage.shortLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Money + timing */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">COD</p>
                <p className="text-xs font-mono font-bold text-gray-900">
                  {selectedOrder.codCollected != null ? formatCurrencyCompact(selectedOrder.codCollected) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Sale</p>
                <p className="text-xs font-mono font-bold text-gray-900">
                  {selectedOrder.saleAmount != null ? formatCurrencyCompact(selectedOrder.saleAmount) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Created</p>
                <p className="text-xs font-mono text-gray-700">
                  {new Date(selectedOrder.createdAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* LAYER 2: THE SUPERVISOR LAYER — overview for the hub manager   */}
      {/* ════════════════════════════════════════════════════════════ */}

      {/* ── KPI Ribbon (supervisor overview — view only) ── */}
      <div className="flex items-center gap-2 pt-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Supervisor Overview (view only)</span>
        <div className="flex-1 h-px bg-gray-100"></div>
      </div>
      <KpiRibbon
        totals={data.totals}
        exceptionsCount={data.exceptions.count}
        ridersCount={data.riders.length}
        codPending={codPendingAmount}
        deliveredCount={data.stations.delivered.count}
      />

      {/* ── Station Tabs (with plain-English labels + attention dots) ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {STATIONS.map(s => {
          const station = data.stations[s.key]
          const count = station?.count ?? 0
          const isActive = activeStation === s.key
          const needsAttention = count > 0 && ['intake', 'sort', 'stage', 'dispatch', 'returns'].includes(s.key)
          const Icon = s.icon
          return (
            <button
              key={s.key}
              onClick={() => { setActiveStation(s.key); setExpandedId(null) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-[#FF6B35] text-[#FF6B35]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={12} className={isActive ? 'text-[#FF6B35]' : 'text-gray-400'} />
              <span>{s.shortLabel}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isActive ? 'bg-[#FF6B35] text-white' : needsAttention ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active station description (plain English) */}
      <p className="text-[11px] text-gray-500">
        {STATIONS.find(s => s.key === activeStation)?.description}
      </p>

      {/* ── Main: Station Table + Right Rail ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        {/* Left: dense table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <StationTable
            station={data.stations[activeStation]}
            stationKey={activeStation}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          />
        </div>

        {/* Right: rail with Riders + COD + Exceptions + Follow-ups */}
        <div className="space-y-3">
          <ExceptionsPanel exceptions={data.exceptions} onNavigate={onNavigate} />
          <FollowUpsPanel followUps={data.followUps} onNavigate={onNavigate} />
          <RidersPanel riders={data.riders} />
          <CodPanel bankings={data.pendingBankings} onNavigate={onNavigate} />
        </div>
      </div>

      {/* ── Help Dialog (plain-English workflow explanation) ── */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How does this work?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is your starting point. It shows what needs doing and takes you to the right screen to do it. Here's the workflow, step by step:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {[
              { num: 1, title: 'Parcels arrive', desc: 'Stock comes in from merchants. It needs to be received and put away on shelves. → Go to Inventory → Inbound tab.' },
              { num: 2, title: 'We sort and pack', desc: 'Orders are picked from shelves, packed into boxes, and labeled with tracking numbers. → Go to Outbound → Order Processing tab.' },
              { num: 3, title: 'Parcels wait for riders', desc: 'Packed parcels sit in Staging until a driver is assigned. → Go to Outbound → Runsheets tab to assign riders.' },
              { num: 4, title: 'Riders pick up', desc: 'A rider gets their list of parcels for the day and leaves the warehouse. → Go to Outbound → Runsheets tab to dispatch.' },
              { num: 5, title: 'Riders deliver', desc: 'The rider drives to each customer. If the customer pays cash, the rider collects it. → Track in Outbound → Outbound Records tab.' },
              { num: 6, title: 'Riders bring back cash', desc: 'At the end of the day, riders deposit the cash they collected. We verify it matches. → Go to Payments → COD Reconciliation tab.' },
              { num: 7, title: 'We close the day', desc: 'When every parcel is accounted for and all cash is verified, the supervisor closes the day. → Click "Close Day" at the top of this screen.' },
            ].map(step => (
              <div key={step.num} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50">
                <div className="w-7 h-7 rounded-full bg-[#FF6B35] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {step.num}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

            <div className="space-y-2">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs text-blue-800">
                <strong>The search bar at the top</strong> lets you find any order by typing a product name like "oil" or "bread". The dropdown shows only products being processed right now, with their DS/ORD numbers and current stage. Click an order number to see exactly where it is in the workflow.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
              <p className="text-xs text-orange-800">
                <strong>The "Order Status" panel</strong> shows the stage of whichever order you picked from the search. Use the "Open in →" link to jump to the module where the actual work happens (sorting, dispatching, etc.).
              </p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
              <p className="text-xs text-gray-600">
                <strong>The supervisor overview below</strong> is for viewing the state of the warehouse. It shows KPIs, station queues, riders, and pending cash — but you can't take actions from here. To act, use the "Order Status" panel or the sidebar.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Day Close Dialog ── */}
      <AlertDialog open={dayCloseOpen} onOpenChange={setDayCloseOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock size={18} />
              Close Day — {new Date().toLocaleDateString('en-UG')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Closing the day finalizes today's operations. All parcels must be delivered, returned, or staged. All driver COD must be banked.
              <br />
              <span className="text-[11px] text-gray-400 mt-1 block">
                Current time: {new Date().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })} ·
                {' '}{data.totals.outboundToday} orders processed today ·
                {' '}{data.stations.delivered.count} delivered
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dayCloseData && (
            <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
              {dayCloseData.blockers.unaccountedParcels.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-1">
                    ⚠ {dayCloseData.blockers.unaccountedParcels.length} parcels unaccounted for
                  </p>
                  <p className="text-xs text-red-700 mb-2">
                    Dispatched today but not yet marked delivered or returned.
                  </p>
                  <div className="max-h-24 overflow-y-auto">
                    {dayCloseData.blockers.unaccountedParcels.slice(0, 15).map((p, idx) => {
                      const id = String(p.orderNumber || p.outboundId || '')
                      const customer = String(p.customerName || '')
                      const status = String(p.status || '')
                      return (
                        <p key={idx} className="text-[11px] text-red-700 font-mono">
                          {id} — {customer} ({status})
                        </p>
                      )
                    })}
                  </div>
                </div>
              )}
              {dayCloseData.blockers.pendingBankings.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-sm font-medium text-orange-900">
                    ⚠ {dayCloseData.blockers.pendingBankings.length} pending COD bankings
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    Verify them in COD Reconciliation before closing.
                  </p>
                </div>
              )}
              {dayCloseData.canClose && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-medium text-green-900 mb-2">✓ Ready to close. Today's summary:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Delivered</p>
                      <p className="font-bold text-gray-900">{String(dayCloseData.summary.deliveredCount)} parcels</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Sales value</p>
                      <p className="font-bold text-gray-900">{formatCurrency(Number(dayCloseData.summary.deliveredValue))}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">COD collected</p>
                      <p className="font-bold text-green-700">{formatCurrency(Number(dayCloseData.summary.codCollected))}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Returns</p>
                      <p className="font-bold text-red-700">{String(dayCloseData.summary.returnedCount)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDayCloseConfirm}
              disabled={!dayCloseData?.canClose}
              className={`rounded-xl ${dayCloseData?.canClose ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300'}`}
            >
              {dayCloseData?.canClose ? 'Confirm Day Close' : 'Cannot Close — Blockers Exist'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
