'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Package, ArrowDownRight, ArrowUpRight, Truck, CheckCircle2, RotateCcw,
  AlertTriangle, Wallet, Lock, RefreshCw, ChevronRight, MapPin, User,
  ClipboardList, Boxes,
} from 'lucide-react'
import { toast } from 'sonner'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

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
    failedDeliveries: Array<Record<string, unknown>>
    pendingShrinkage: Array<Record<string, unknown>>
    count: number
  }
  riders: Array<{
    driverId: string
    name: string
    phone: string
    expectedBankings: number
    banked: number
    dispatchedToday: number
    deliveredToday: number
    pendingBankings: number
  }>
  pendingBankings: {
    count: number
    items: Array<Record<string, unknown>>
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

interface Station {
  count: number
  items: Array<Record<string, unknown>>
  label: string
  description: string
  action: string
  targetModule: string
}

interface StationCardProps {
  station: Station
  stationKey: string
  icon: typeof Package
  color: string
  bgColor: string
  borderColor: string
  gradient: string
  onExpand: () => void
  isExpanded: boolean
}

const STATION_META: Record<string, { icon: typeof Package; color: string; bgColor: string; borderColor: string; gradient: string }> = {
  intake:     { icon: ArrowDownRight, color: '#3B82F6', bgColor: 'bg-blue-500/20',     borderColor: 'border-blue-400/30',     gradient: 'from-blue-500/10 to-blue-500/5' },
  sort:       { icon: Boxes,          color: '#FF6B35', bgColor: 'bg-orange-500/20',   borderColor: 'border-orange-400/30',   gradient: 'from-orange-500/10 to-orange-500/5' },
  stage:      { icon: ClipboardList,  color: '#8B5CF6', bgColor: 'bg-purple-500/20',   borderColor: 'border-purple-400/30',   gradient: 'from-purple-500/10 to-purple-500/5' },
  dispatch:   { icon: Truck,          color: '#F59E0B', bgColor: 'bg-yellow-500/20',   borderColor: 'border-yellow-400/30',   gradient: 'from-yellow-500/10 to-yellow-500/5' },
  inTransit:  { icon: ArrowUpRight,   color: '#06B6D4', bgColor: 'bg-cyan-500/20',     borderColor: 'border-cyan-400/30',     gradient: 'from-cyan-500/10 to-cyan-500/5' },
  delivered:  { icon: CheckCircle2,   color: '#22C55E', bgColor: 'bg-green-500/20',    borderColor: 'border-green-400/30',    gradient: 'from-green-500/10 to-green-500/5' },
  returns:    { icon: RotateCcw,      color: '#EF4444', bgColor: 'bg-red-500/20',      borderColor: 'border-red-400/30',      gradient: 'from-red-500/10 to-red-500/5' },
}

function StationCard({ station, stationKey, icon: Icon, color, bgColor, borderColor, gradient, onExpand, isExpanded }: StationCardProps) {
  const items = station.items || []
  return (
    <motion.div
      layout
      className={`bg-white rounded-2xl border ${borderColor} overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
    >
      <button
        onClick={onExpand}
        className={`w-full p-4 text-left bg-gradient-to-br ${gradient}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}>
            <Icon size={20} style={{ color }} />
          </div>
          <span className="text-3xl font-bold text-gray-900">{station.count}</span>
        </div>
        <h3 className="font-semibold text-gray-900 text-sm">{station.label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{station.description}</p>
        {station.count > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color }}>
            {station.action}
            <ChevronRight size={12} />
          </div>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && items.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100"
          >
            <div className="max-h-80 overflow-y-auto">
              {items.slice(0, 10).map((item, idx) => {
                const orderNumber = String(item.orderNumber || '')
                const inboundId = String(item.inboundId || '')
                const outboundId = String(item.outboundId || '')
                const afterSalesId = String(item.afterSalesId || '')
                const customerName = String(item.customerName || '')
                const productName = String(item.productName || '')
                const merchantName = String(item.merchantName || '')
                const qty = String(item.qty || '')
                const qtyIn = String(item.qtyIn || '')
                const codCollected = item.codCollected ? Number(item.codCollected) : 0
                const saleAmount = item.saleAmount ? Number(item.saleAmount) : 0
                return (
                  <div key={idx} className="px-4 py-2 border-b border-gray-50 hover:bg-gray-50 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {orderNumber && <p className="font-mono text-xs font-semibold text-gray-900">{orderNumber}</p>}
                      {inboundId && <p className="font-mono text-xs font-semibold text-gray-900">{inboundId}</p>}
                      {outboundId && !orderNumber && <p className="font-mono text-xs font-semibold text-gray-900">{outboundId}</p>}
                      {afterSalesId && <p className="font-mono text-xs font-semibold text-gray-900">{afterSalesId}</p>}
                      <p className="text-xs text-gray-500 truncate">
                        {customerName || productName || merchantName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                      {qty && <span className="font-mono">×{qty}</span>}
                      {qtyIn && <span className="font-mono">×{qtyIn}</span>}
                      {codCollected ? (
                        <span className="text-green-600 font-medium">{formatCurrencyCompact(codCollected)}</span>
                      ) : saleAmount ? (
                        <span className="text-gray-600">{formatCurrencyCompact(saleAmount)}</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {items.length > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400 text-center">
                  + {items.length - 10} more
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function HubTodayModule() {
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStation, setExpandedStation] = useState<string | null>(null)
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
    setLoading(true)
    try {
      const res = await fetch('/api/hub-today')
      const d = await res.json()
      setData(d)
    } catch {
      toast.error('Failed to load hub data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

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
        <span className="ml-2 text-gray-500">Loading today's hub...</span>
      </div>
    )
  }

  const stations = data.stations
  const stationKeys = ['intake', 'sort', 'stage', 'dispatch', 'inTransit', 'delivered', 'returns'] as const

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Today at the Hub
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(data.date).toLocaleDateString('en-UG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            <span className="ml-2 text-gray-400">·</span>
            <span className="ml-2 text-xs text-gray-400">Auto-refreshes every 30s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="rounded-xl"
          >
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleDayCloseCheck}
            className={`rounded-xl ${data.dayClose.canClose ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'} text-white`}
          >
            <Lock size={14} className="mr-1" /> Close Day
          </Button>
        </div>
      </div>

      {/* Today's totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Inbound Today</p>
          <p className="text-xl font-bold text-gray-900">{data.totals.inboundToday}</p>
          <p className="text-xs text-gray-500">parcels received</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Outbound Today</p>
          <p className="text-xl font-bold text-gray-900">{data.totals.outboundToday}</p>
          <p className="text-xs text-gray-500">parcels created</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">COD Collected</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(data.totals.codCollectedToday)}</p>
          <p className="text-xs text-gray-500">from deliveries</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Sales Value</p>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(data.totals.salesToday)}</p>
          <p className="text-xs text-gray-500">delivered today</p>
        </div>
      </div>

      {/* 7 Station Cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <ClipboardList size={16} /> Station Queues
          <InfoTip term="runsheets" size={13} className="ml-1" />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stationKeys.map((key) => {
            const station = stations[key]
            const meta = STATION_META[key]
            return (
              <StationCard
                key={key}
                station={station}
                stationKey={key}
                icon={meta.icon}
                color={meta.color}
                bgColor={meta.bgColor}
                borderColor={meta.borderColor}
                gradient={meta.gradient}
                onExpand={() => setExpandedStation(expandedStation === key ? null : key)}
                isExpanded={expandedStation === key}
              />
            )
          })}
        </div>
      </div>

      {/* Exceptions + Riders + COD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Exceptions */}
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="p-4 bg-gradient-to-br from-red-500/10 to-red-500/5 border-b border-red-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-600" />
              <h3 className="font-semibold text-gray-900">Exceptions</h3>
              <Badge className="ml-auto bg-red-100 text-red-700 border-0">{data.exceptions.count}</Badge>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {data.exceptions.count === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">No exceptions. All clear.</p>
            ) : (
              <>
                {data.exceptions.failedDeliveries.slice(0, 5).map((item, idx) => {
                  const id = String(item.orderNumber || item.outboundId || '')
                  const customerName = String(item.customerName || '')
                  const driver = String(item.assignedDriver || 'No driver')
                  const notes = item.deliveryNotes ? String(item.deliveryNotes) : ''
                  return (
                    <div key={`fail-${idx}`} className="px-4 py-2 border-b border-gray-50 hover:bg-red-50/30">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-semibold text-gray-900">{id}</p>
                        <Badge className="bg-red-100 text-red-700 border-0 text-[9px]">FAILED</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{customerName} · {driver}</p>
                      {notes && <p className="text-xs text-red-600 mt-1">{notes}</p>}
                    </div>
                  )
                })}
                {data.exceptions.pendingShrinkage.slice(0, 5).map((item, idx) => {
                  const id = String(item.shrinkageId || '')
                  const productName = String(item.productName || '')
                  const qty = String(item.qty || '')
                  return (
                    <div key={`shrink-${idx}`} className="px-4 py-2 border-b border-gray-50 hover:bg-red-50/30">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-semibold text-gray-900">{id}</p>
                        <Badge className="bg-orange-100 text-orange-700 border-0 text-[9px]">SHRINKAGE</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{productName} × {qty}</p>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Riders today */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-4 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Truck size={18} className="text-cyan-600" />
              <h3 className="font-semibold text-gray-900">Riders Today</h3>
              <Badge className="ml-auto bg-cyan-100 text-cyan-700 border-0">{data.riders.length}</Badge>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {data.riders.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">No active riders today.</p>
            ) : (
              data.riders.slice(0, 8).map((rider) => (
                <div key={rider.driverId} className="px-4 py-2 border-b border-gray-50 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm text-gray-900">{rider.name}</p>
                    {rider.pendingBankings > 0 && (
                      <Badge className="bg-orange-100 text-orange-700 border-0 text-[9px]">
                        {rider.pendingBankings} pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <ArrowUpRight size={10} /> {rider.dispatchedToday} dispatched
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={10} /> {rider.deliveredToday} delivered
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending COD Bankings */}
        <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
          <div className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-b border-orange-100">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-orange-600" />
              <h3 className="font-semibold text-gray-900">Pending COD <InfoTip term="codBanked" size={13} /></h3>
              <Badge className="ml-auto bg-orange-100 text-orange-700 border-0">{data.pendingBankings.count}</Badge>
            </div>
            {data.pendingBankings.count > 0 && (
              <p className="text-xs text-orange-700 mt-1">Total: {formatCurrency(data.pendingBankings.totalAmount)}</p>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {data.pendingBankings.count === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">All bankings verified.</p>
            ) : (
              data.pendingBankings.items.slice(0, 8).map((item, idx) => {
                const bankingId = String(item.bankingId || '')
                const amount = Number(item.amount || 0)
                const driverName = String(item.driverName || '')
                const bankedAt = String(item.bankedAt || '')
                return (
                  <div key={idx} className="px-4 py-2 border-b border-gray-50 hover:bg-orange-50/30">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs text-gray-700">{bankingId}</p>
                      <p className="font-bold text-sm text-orange-700">{formatCurrency(amount)}</p>
                    </div>
                    <p className="text-xs text-gray-500">{driverName} · {new Date(bankedAt).toLocaleTimeString()}</p>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Day Close Dialog */}
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
            <div className="space-y-3 py-2">
              {/* Blockers */}
              {dayCloseData.blockers.unaccountedParcels.length > 0 && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-1">
                    ⚠️ {dayCloseData.blockers.unaccountedParcels.length} parcels unaccounted for
                  </p>
                  <p className="text-xs text-red-700">
                    These parcels were dispatched today but are not yet marked delivered or returned. Resolve them before closing.
                  </p>
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {dayCloseData.blockers.unaccountedParcels.slice(0, 10).map((p, idx) => {
                      const id = String(p.orderNumber || p.outboundId || '')
                      const customerName = String(p.customerName || '')
                      const status = String(p.status || '')
                      return (
                        <p key={idx} className="text-xs text-red-700 font-mono">
                          {id} — {customerName} ({status})
                        </p>
                      )
                    })}
                  </div>
                </div>
              )}
              {dayCloseData.blockers.pendingBankings.length > 0 && (
                <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                  <p className="text-sm font-medium text-orange-900 mb-1">
                    ⚠️ {dayCloseData.blockers.pendingBankings.length} pending COD bankings
                  </p>
                  <p className="text-xs text-orange-700">
                    Drivers have unverified cash deposits. Verify them in COD Reconciliation before closing.
                  </p>
                </div>
              )}

              {/* Summary if can close */}
              {dayCloseData.canClose && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200">
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
                    <div>
                      <p className="text-gray-500">Inbound</p>
                      <p className="font-bold text-gray-900">{String(dayCloseData.summary.inboundCount)} records</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Inbound units</p>
                      <p className="font-bold text-gray-900">{String(dayCloseData.summary.inboundUnits)}</p>
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
