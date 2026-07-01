'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, ScanLine, ChevronRight, ChevronDown, Lock, RefreshCw,
  AlertTriangle, CheckCircle2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ── Types ──
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

const STATIONS: { key: StationKey; label: string; pillClass: string }[] = [
  { key: 'intake',    label: 'INTAKE',    pillClass: 'text-blue-600' },
  { key: 'sort',      label: 'SORT & PACK', pillClass: 'text-orange-600' },
  { key: 'stage',     label: 'STAGING',   pillClass: 'text-purple-600' },
  { key: 'dispatch',  label: 'DISPATCH',  pillClass: 'text-yellow-700' },
  { key: 'inTransit', label: 'IN TRANSIT', pillClass: 'text-cyan-600' },
  { key: 'delivered', label: 'DELIVERED', pillClass: 'text-green-700' },
  { key: 'returns',   label: 'RETURNS',   pillClass: 'text-red-600' },
]

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
function KpiRibbon({ totals, exceptionsCount, ridersCount, codPending }: {
  totals: HubData['totals']
  exceptionsCount: number
  ridersCount: number
  codPending: number
}) {
  const cells = [
    { label: 'INBOUND', value: String(totals.inboundToday) },
    { label: 'OUTBOUND', value: String(totals.outboundToday) },
    { label: 'DELIVERED', value: String(totals.outboundToday > 0 ? '—' : '0') },
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

function CodPanel({ bankings }: { bankings: { count: number; items: StationItem[]; totalAmount: number } }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
          Pending COD <InfoTip term="codBanked" size={11} />
        </span>
        <span className="text-[11px] font-mono font-bold text-orange-700">{formatCurrencyCompact(bankings.totalAmount)}</span>
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

function ExceptionsPanel({ exceptions }: { exceptions: HubData['exceptions'] }) {
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
        <span className="text-[11px] text-red-700 font-mono font-bold">{exceptions.count}</span>
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
export default function HubTodayModule() {
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStation, setActiveStation] = useState<StationKey>('sort')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [dayCloseOpen, setDayCloseOpen] = useState(false)
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
      // Auto-pick the first station with items
      if (d.stations) {
        const firstWithItems = (['intake', 'sort', 'stage', 'dispatch', 'inTransit', 'delivered', 'returns'] as StationKey[])
          .find(k => d.stations[k]?.count > 0)
        if (firstWithItems) setActiveStation(firstWithItems)
      }
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

  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanInput.trim()) return
    const value = scanInput.trim()
    setScanInput('')
    setScanStatus('scanning')
    try {
      const res = await fetch('/api/scan-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanValue: value, performedBy: 'admin' }),
      })
      const result = await res.json()
      if (res.ok && result.success) {
        toast.success(result.message)
        setScanStatus('success')
        // Auto-switch to the station the parcel just left (so the user sees it move)
        if (result.module === 'outbound') {
          const map: Record<string, StationKey> = {
            picking: 'sort', picked: 'sort', packing: 'sort', packed: 'stage',
            dispatched: 'dispatch', delivered: 'delivered',
          }
          const targetStation = map[result.toStatus]
          if (targetStation) setActiveStation(targetStation)
        } else if (result.module === 'inbound') {
          if (result.toStatus === 'put_away') setActiveStation('intake')
          if (result.toStatus === 'stored') setActiveStation('intake')
        } else if (result.module === 'after_sales') {
          setActiveStation('returns')
        }
        fetchData()
      } else if (res.ok && !result.success) {
        // Terminal state — info, not error
        toast.info(result.message)
        setScanStatus('idle')
      } else {
        toast.error(result.error || 'Parcel not found')
        setScanStatus('error')
      }
    } catch {
      toast.error('Scan failed — network error')
      setScanStatus('error')
    }
    // Reset status indicator after 1.5s
    setTimeout(() => setScanStatus('idle'), 1500)
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
          <h1 className="text-lg font-bold text-gray-900">Operations Console</h1>
          <p className="text-[11px] text-gray-500">
            {new Date(data.date).toLocaleDateString('en-UG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            <span className="ml-2 text-gray-400">· Auto-refresh 30s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* ── Scan input (persistent, top) ── */}
      <form
        onSubmit={handleScan}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
          scanStatus === 'success' ? 'bg-green-700' :
          scanStatus === 'error' ? 'bg-red-700' :
          'bg-[#1B2A4A]'
        }`}
      >
        <ScanLine size={16} className={scanStatus === 'idle' ? 'text-blue-300' : 'text-white animate-pulse'} />
        <input
          type="text"
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          placeholder={scanStatus === 'success' ? '✓ Advanced — scan next parcel...' : scanStatus === 'error' ? '✗ Not found — scan again...' : 'Scan parcel or location barcode...'}
          autoFocus
          className="flex-1 bg-transparent text-white placeholder-blue-200/50 text-sm outline-none font-mono"
        />
        {scanStatus === 'scanning' && <span className="text-blue-200 text-xs">...</span>}
        <button type="submit" className="text-[11px] text-blue-200 hover:text-white px-2 py-1 rounded border border-blue-200/30 hover:bg-blue-200/10">
          Enter ↵
        </button>
      </form>

      {/* ── KPI Ribbon ── */}
      <KpiRibbon
        totals={data.totals}
        exceptionsCount={data.exceptions.count}
        ridersCount={data.riders.length}
        codPending={codPendingAmount}
      />

      {/* ── Station Tabs ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {STATIONS.map(s => {
          const station = data.stations[s.key]
          const count = station?.count ?? 0
          const isActive = activeStation === s.key
          return (
            <button
              key={s.key}
              onClick={() => { setActiveStation(s.key); setExpandedId(null) }}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-[#FF6B35] text-[#FF6B35]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{s.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isActive ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

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

        {/* Right: rail with Riders + COD + Exceptions */}
        <div className="space-y-3">
          <ExceptionsPanel exceptions={data.exceptions} />
          <RidersPanel riders={data.riders} />
          <CodPanel bankings={data.pendingBankings} />
        </div>
      </div>

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
