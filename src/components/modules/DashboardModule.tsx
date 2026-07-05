'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2,
  TrendingUp, ChevronDown, Download,
  Activity, Clock, Flame, Zap,
} from 'lucide-react'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { InfoTip } from '@/components/ui/info-tip'

interface DashboardData {
  stats: {
    totalMerchants: number; totalProducts: number; totalCustomers: number; totalDrivers: number
    activeDrivers: number; totalRevenue: number; totalCommission: number
    avgOrderValue: number; revenuePerMerchant: number; totalStockUnits: number; totalStockValue: number
  }
  inventory: { healthy: number; low: number; critical: number }
  orders: { total: number; pending: number; dispatched: number; delivered: number; fulfillmentRate: number }
  shrinkage: { totalQty: number; byReason: Array<{ reason: string; qty: number; count: number }> }
  recentInbound: Array<Record<string, unknown>>
  recentOutbound: Array<Record<string, unknown>>
  revenueByMonth: Array<{ month: string; revenue: number; commissions: number }>
  throughputData: Array<{ day: string; inbound: number; outbound: number }>
  productsByCategory: Array<{ category: string; count: number }>
  topMerchants: Array<{ name: string; amount: number }>
  paymentMethods: Array<{ method: string; count: number; amount: number }>
  alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; module: string; time: string }>
  comparison: { revenueChange: number; ordersChange: number; stockValueChange: number; avgOrderChange: number }
  cod: { collectedTotal: number; banked: number; pendingBankings: number; bankingRate: number }
  driverPerformance: Array<{
    driverId: string; name: string; dispatched: number; delivered: number; failed: number
    codCollected: number; pendingBankings: number; bankingStatus: string
  }>
  onTimeRate: number
  avgCycleTimeHours: number
  firstAttemptRate: number
  attentionItems: Array<{
    type: string; severity: 'critical' | 'warning'; message: string; module: string; count: number
    items: Array<Record<string, unknown>>
  }>
  merchantProfitability: Array<{
    name: string; revenue: number; commission: number; shrinkage: number; returns: number; net: number
  }>
  orderStatusDistribution: Array<{ status: string; count: number }>
  exceptionRate: number
  exceptionCount: number
  pulse: {
    stakes: {
      unbankedCOD: number
      overdueParcelsCount: number
      overdueParcels: Array<{ id: string; customerName: string; driver: string; hoursOverdue: number; saleAmount: number }>
      customersWaitingCount: number
      atRiskRevenue: number
    }
    momentum: {
      todayPace: number
      yesterdayPace: number
      paceDeltaPct: number
      last30Min: { newOrders: number; delivered: number; failed: number }
    }
    predictions: {
      willGoStaleSoon: number
      alreadyStale: number
      estimatedFinishTime: string | null
      willFinishLate: boolean
      parcelsStillToDeliver: number
      deliveryRatePerHour: number
    }
    timeAwareness: {
      currentTime: string
      currentHour: number
      deliveryWindowEnd: number
      isAfterHours: boolean
      isBeforeHours: boolean
      percentThroughWindow: number
      parcelsRemaining: number
      parcelsPerHourNeeded: number
    }
    streaks: {
      daysWithoutStockout: number
      stockoutStreakHasData: boolean
      hoursSinceLastFailure: number
      isBestWeekThisQuarter: boolean
    }
  }
}

interface DashboardModuleProps {
  onNavigate?: (module: string) => void
}

const COLORS = ['#FF6B35', '#1B2A4A', '#22C55E', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6']
const STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF', picking: '#3B82F6', picked: '#1D4ED8', packing: '#F59E0B',
  packed: '#FF6B35', dispatched: '#06B6D4', delivered: '#22C55E',
  failed: '#EF4444', returned: '#DC2626', cancelled: '#6B7280',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', picking: 'Picking', picked: 'Picked', packing: 'Packing',
  packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered',
  failed: 'Failed', returned: 'Returned', cancelled: 'Cancelled',
}

const tooltipStyle = {
  borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  fontSize: '12px', padding: '8px 12px',
}

// ── Module Status Board ──
// The centerpiece of the emergency-first dashboard. One dense table where
// each row is a module summary: status dot, key metrics, action needed.
// No card containers — just a table with row separators. Clickable rows
// navigate to the relevant module.
function ModuleStatusBoard({
  data,
  onNavigate,
  showOnlyProblems = false,
}: {
  data: DashboardData
  onNavigate?: (module: string) => void
  showOnlyProblems?: boolean
}) {
  const p = data.pulse

  // Build module rows — each computes its own status from live data
  type ModuleRow = {
    key: string
    name: string
    module: string
    status: 'critical' | 'warning' | 'good' | 'quiet'
    statusLabel: string
    metrics: string
    action: string
  }
  const rows: ModuleRow[] = []

  // Inventory
  if (data.inventory.critical > 0) {
    rows.push({
      key: 'inventory', name: 'Inventory', module: 'inventory',
      status: 'critical', statusLabel: `${data.inventory.critical} out of stock`,
      metrics: `${data.inventory.healthy} healthy · ${data.inventory.low} low · ${data.inventory.critical} critical`,
      action: `Reorder ${data.inventory.critical} product${data.inventory.critical !== 1 ? 's' : ''}`,
    })
  } else if (data.inventory.low > 0) {
    rows.push({
      key: 'inventory', name: 'Inventory', module: 'inventory',
      status: 'warning', statusLabel: `${data.inventory.low} running low`,
      metrics: `${data.inventory.healthy} healthy · ${data.inventory.low} low · 0 critical`,
      action: `Review ${data.inventory.low} low-stock product${data.inventory.low !== 1 ? 's' : ''}`,
    })
  } else {
    rows.push({
      key: 'inventory', name: 'Inventory', module: 'inventory',
      status: 'good', statusLabel: 'All healthy',
      metrics: `${data.inventory.healthy} products in stock`,
      action: '—',
    })
  }

  // Outbound
  const inMotion = p?.stakes.customersWaitingCount ?? 0
  const overdue = p?.stakes.overdueParcelsCount ?? 0
  if (overdue > 0) {
    rows.push({
      key: 'outbound', name: 'Outbound', module: 'outbound',
      status: 'critical', statusLabel: `${overdue} overdue`,
      metrics: `${inMotion} in motion · ${overdue} overdue · ${data.orders.delivered} delivered today`,
      action: `Investigate ${overdue} overdue parcel${overdue !== 1 ? 's' : ''}`,
    })
  } else if (inMotion > 0) {
    rows.push({
      key: 'outbound', name: 'Outbound', module: 'outbound',
      status: 'good', statusLabel: `${inMotion} in motion`,
      metrics: `${inMotion} in motion · ${data.orders.delivered} delivered today`,
      action: '—',
    })
  } else {
    rows.push({
      key: 'outbound', name: 'Outbound', module: 'outbound',
      status: 'quiet', statusLabel: 'No active orders',
      metrics: `${data.orders.delivered} delivered today`,
      action: '—',
    })
  }

  // Payments / COD
  if (data.cod.pendingBankings > 0) {
    rows.push({
      key: 'payments', name: 'Payments', module: 'payments',
      status: 'warning', statusLabel: `${formatCurrencyCompact(data.cod.pendingBankings)} pending`,
      metrics: `${formatCurrencyCompact(data.cod.collectedTotal)} collected · ${data.cod.bankingRate}% banked`,
      action: `Verify pending COD bankings`,
    })
  } else if (data.cod.collectedTotal > 0) {
    rows.push({
      key: 'payments', name: 'Payments', module: 'payments',
      status: 'good', statusLabel: 'All banked',
      metrics: `${formatCurrencyCompact(data.cod.collectedTotal)} collected · 100% banked`,
      action: '—',
    })
  } else {
    rows.push({
      key: 'payments', name: 'Payments', module: 'payments',
      status: 'quiet', statusLabel: 'No COD activity',
      metrics: 'No COD collected this period',
      action: '—',
    })
  }

  // Returns / Exceptions
  if (data.exceptionCount > 0) {
    rows.push({
      key: 'returns', name: 'Returns', module: 'returns',
      status: 'critical', statusLabel: `${data.exceptionCount} exceptions`,
      metrics: `${data.exceptionCount} exceptions · ${data.shrinkage.totalQty} units shrinkage`,
      action: `Process ${data.exceptionCount} exception${data.exceptionCount !== 1 ? 's' : ''}`,
    })
  } else if (data.shrinkage.totalQty > 0) {
    rows.push({
      key: 'returns', name: 'Returns', module: 'returns',
      status: 'warning', statusLabel: `${data.shrinkage.totalQty} units shrinkage`,
      metrics: `${data.shrinkage.totalQty} units shrinkage`,
      action: 'Review shrinkage records',
    })
  } else {
    rows.push({
      key: 'returns', name: 'Returns', module: 'returns',
      status: 'good', statusLabel: 'All clear',
      metrics: 'No exceptions or shrinkage',
      action: '—',
    })
  }

  // Drivers
  const driversPending = data.driverPerformance.filter(d => d.bankingStatus === 'pending').length
  const driversFailed = data.driverPerformance.filter(d => d.failed > 0).length
  if (driversPending > 0 || driversFailed > 0) {
    const bits: string[] = []
    if (driversPending > 0) bits.push(`${driversPending} haven't banked`)
    if (driversFailed > 0) bits.push(`${driversFailed} had failures`)
    rows.push({
      key: 'drivers', name: 'Drivers', module: 'drivers',
      status: 'warning', statusLabel: bits[0],
      metrics: `${data.driverPerformance.length} active · ${bits.join(' · ')}`,
      action: driversPending > 0 ? `Follow up with ${driversPending} driver${driversPending !== 1 ? 's' : ''}` : 'Review failed deliveries',
    })
  } else if (data.driverPerformance.length > 0) {
    rows.push({
      key: 'drivers', name: 'Drivers', module: 'drivers',
      status: 'good', statusLabel: 'All banked',
      metrics: `${data.driverPerformance.length} active · all cash banked`,
      action: '—',
    })
  } else {
    rows.push({
      key: 'drivers', name: 'Drivers', module: 'drivers',
      status: 'quiet', statusLabel: 'No active drivers',
      metrics: '0 active',
      action: '—',
    })
  }

  // Merchants
  const lossMakers = data.merchantProfitability.filter(m => m.net < 0).length
  if (lossMakers > 0) {
    rows.push({
      key: 'merchants', name: 'Merchants', module: 'merchants',
      status: 'warning', statusLabel: `${lossMakers} at a loss`,
      metrics: `${data.stats.totalMerchants} active · ${lossMakers} operating at a loss`,
      action: `Review ${lossMakers} loss-maker${lossMakers !== 1 ? 's' : ''}`,
    })
  } else {
    rows.push({
      key: 'merchants', name: 'Merchants', module: 'merchants',
      status: 'good', statusLabel: 'All profitable',
      metrics: `${data.stats.totalMerchants} active · all profitable`,
      action: '—',
    })
  }

  // Inbound
  const intakeCount = p?.stakes.customersWaitingCount !== undefined ? 0 : 0 // placeholder — we don't have a direct intake count in pulse
  rows.push({
    key: 'inbound', name: 'Inbound', module: 'inventory',
    status: 'quiet', statusLabel: '—',
    metrics: `${data.stats.totalStockUnits} units in warehouse · ${formatCurrencyCompact(data.stats.totalStockValue)} value`,
    action: '—',
  })
  void intakeCount

  const statusDot: Record<string, string> = {
    critical: 'bg-red-500',
    warning: 'bg-orange-500',
    good: 'bg-green-500',
    quiet: 'bg-gray-300',
  }
  const statusText: Record<string, string> = {
    critical: 'text-red-700',
    warning: 'text-orange-700',
    good: 'text-green-700',
    quiet: 'text-gray-400',
  }

  // Sort: critical first, then warning, then good, then quiet
  const order = { critical: 0, warning: 1, good: 2, quiet: 3 }
  rows.sort((a, b) => order[a.status] - order[b.status])

  // Apply "show only problems" filter — hides good + quiet rows
  const visibleRows = showOnlyProblems
    ? rows.filter(r => r.status === 'critical' || r.status === 'warning')
    : rows

  return (
    <div>
      {/* Table header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Module Status Board
        </span>
        <span className="text-[10px] text-gray-400">
          {rows.filter(r => r.status === 'critical').length} critical · {rows.filter(r => r.status === 'warning').length} warning · {rows.filter(r => r.status === 'good').length} good
          {showOnlyProblems && visibleRows.length < rows.length && ` · showing ${visibleRows.length} of ${rows.length}`}
        </span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Dense table — no card container, just row separators */}
      <div className="bg-white rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
              <th className="text-left px-4 py-2 font-semibold w-32">Module</th>
              <th className="text-left px-4 py-2 font-semibold w-40">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Key Metrics</th>
              <th className="text-right px-4 py-2 font-semibold w-56">Action Needed</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr
                key={row.key}
                onClick={() => onNavigate?.(row.module)}
                className={`border-b border-gray-50 last:border-0 transition-colors ${
                  row.action !== '—' ? 'cursor-pointer hover:bg-gray-50' : ''
                } ${row.status === 'critical' ? 'bg-red-50/30' : row.status === 'warning' ? 'bg-orange-50/20' : ''}`}
                style={{ height: '36px' }}
              >
                <td className="px-4 py-2">
                  <span className="font-semibold text-gray-900">{row.name}</span>
                </td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${statusDot[row.status]}`} />
                    <span className={`text-[11px] font-medium ${statusText[row.status]}`}>{row.statusLabel}</span>
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600 text-[11px]">{row.metrics}</td>
                <td className="px-4 py-2 text-right">
                  {row.action !== '—' ? (
                    <span className="text-[11px] text-[#FF6B35] font-semibold">{row.action} →</span>
                  ) : (
                    <span className="text-[11px] text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2 text-gray-300">
                  {row.action !== '—' && <ChevronDown size={10} className="-rotate-90" />}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-400">
                  No problems to show — all modules are healthy or quiet. Turn off "Problems only" to see everything.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Pulse ──
// The real-time heartbeat of the business. Replaces the static Story + KPI
// ribbon at the very top of the dashboard. Five sections that make the
// business feel ALIVE — and every number is auditable: hover (i) for the
// definition, click any number to verify it in the relevant module.
//
//   1. Stakes line    — money and time at risk, right now (each component labeled, no overlap)
//   2. Momentum line  — today's pace vs yesterday, last 30 min of activity
//   3. Predictions    — what's about to go wrong in the next 30-60 min
//   4. Time awareness — where you are in the day vs where you should be
//   5. Streaks        — what's going well that you'd want to maintain
//   6. Audit basis    — small footer stating the assumptions behind every calculation
function Pulse({
  data,
  onNavigate,
}: {
  data: DashboardData
  onNavigate?: (module: string) => void
}) {
  const p = data.pulse
  if (!p) return null

  const now = new Date(p.timeAwareness.currentTime)
  const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
  const hasOverdue = p.stakes.overdueParcelsCount > 0
  const hasUnbanked = p.stakes.unbankedCOD > 0
  const hasHighStakes = hasOverdue || hasUnbanked
  const hasPredictions = p.predictions.willGoStaleSoon > 0 || p.predictions.willFinishLate
  const paceUp = p.momentum.paceDeltaPct > 0
  const paceDown = p.momentum.paceDeltaPct < 0

  // Calculate the overdue parcel revenue (for transparent breakdown)
  const overdueRevenue = p.stakes.overdueParcels.reduce((s, o) => s + o.saleAmount, 0)
  // Note: atRiskRevenue from API = overdueRevenue + unbankedCOD. We show
  // the components separately so the supervisor can audit each one.

  return (
    <div className="space-y-2">
      {/* ── Hero stakes line — the first thing you read ── */}
      {/* Each stake shown separately, labeled, with (i) for definition, clickable to verify */}
      <div className={`rounded-lg px-4 py-3 border-2 ${
        hasHighStakes ? 'bg-red-50 border-red-300' :
        'bg-[#1B2A4A] border-[#1B2A4A]'
      }`}>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <Activity size={16} className={hasHighStakes ? 'text-red-600' : 'text-blue-300'} />
          <span className={`text-[10px] uppercase tracking-wider font-semibold ${hasHighStakes ? 'text-red-700' : 'text-blue-200/70'}`}>
            Right now · {timeStr}
          </span>
          {hasHighStakes ? (
            <span className="text-[10px] uppercase tracking-wider text-red-700 font-bold ml-auto">
              {hasOverdue && hasUnbanked ? '2 things at risk' : '1 thing at risk'} — click any number to verify
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-blue-200/70 ml-auto">
              All clear — nothing at risk right now
            </span>
          )}
        </div>

        {/* Each stake is its own labeled, auditable row — no overlapping totals */}
        <div className={`space-y-1.5 ${hasHighStakes ? 'text-red-900' : 'text-white'}`}>
          {hasOverdue && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onNavigate?.('outbound')}
                className="flex items-center gap-1.5 hover:underline"
                title="Click to see these parcels in Outbound"
              >
                <span className="font-mono font-bold text-base">{p.stakes.overdueParcelsCount}</span>
                <span className={hasHighStakes ? 'text-red-700' : 'text-blue-200/70'}>
                  overdue {p.stakes.overdueParcelsCount === 1 ? 'parcel' : 'parcels'}
                </span>
                <span className={hasHighStakes ? 'text-red-600' : 'text-blue-200/50'}>(worth {formatCurrencyCompact(overdueRevenue)})</span>
              </button>
              <InfoTip term="pulseOverdueParcel" size={11} />
              <span className={`text-[10px] ${hasHighStakes ? 'text-red-600' : 'text-blue-200/50'}`}>
                = dispatched &gt; 6h ago, not yet delivered
              </span>
            </div>
          )}
          {hasUnbanked && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onNavigate?.('payments')}
                className="flex items-center gap-1.5 hover:underline"
                title="Click to verify these bankings in Payments"
              >
                <span className="font-mono font-bold text-base">{formatCurrencyCompact(p.stakes.unbankedCOD)}</span>
                <span className={hasHighStakes ? 'text-red-700' : 'text-blue-200/70'}>unbanked COD cash</span>
              </button>
              <InfoTip term="pulseUnbankedCOD" size={11} />
              <span className={`text-[10px] ${hasHighStakes ? 'text-red-600' : 'text-blue-200/50'}`}>
                = collected by riders, not yet deposited
              </span>
            </div>
          )}
          {p.stakes.customersWaitingCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onNavigate?.('outbound')}
                className="flex items-center gap-1.5 hover:underline"
                title="Click to see these orders in Outbound"
              >
                <span className="font-mono font-bold text-base">{p.stakes.customersWaitingCount}</span>
                <span className={hasHighStakes ? 'text-red-700' : 'text-blue-200/70'}>
                  customers waiting
                </span>
              </button>
              <InfoTip term="pulseCustomersWaiting" size={11} />
              <span className={`text-[10px] ${hasHighStakes ? 'text-red-600' : 'text-blue-200/50'}`}>
                = parcels in picking, packing, or staging
              </span>
            </div>
          )}
          {!hasHighStakes && p.stakes.customersWaitingCount === 0 && (
            <div className="text-blue-200/70 italic text-sm">
              No money or parcels at risk right now. Hover any (i) below to see how each metric is calculated.
            </div>
          )}
        </div>
      </div>

      {/* ── Momentum + Predictions + Time row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Momentum */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap size={12} className="text-orange-500" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Momentum</span>
            <InfoTip term="pulsePace" size={11} />
          </div>
          <p className="text-sm font-bold text-gray-900">
            {p.momentum.todayPace} <span className="text-xs font-normal text-gray-500">orders/hr today</span>
          </p>
          {p.momentum.yesterdayPace > 0 && (
            <p className={`text-[11px] mt-0.5 ${paceUp ? 'text-green-700' : paceDown ? 'text-red-700' : 'text-gray-500'}`}>
              {paceUp ? '↑' : paceDown ? '↓' : '—'} {Math.abs(p.momentum.paceDeltaPct)}% vs yesterday ({p.momentum.yesterdayPace}/hr)
              {paceDown && Math.abs(p.momentum.paceDeltaPct) >= 20 && ' — concerning'}
              {paceUp && Math.abs(p.momentum.paceDeltaPct) >= 20 && ' — busier than usual'}
            </p>
          )}
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-500">
            <span>Last 30 min:</span>
            <span className="text-blue-600 font-mono font-bold">+{p.momentum.last30Min.newOrders} new</span>
            <span className="text-green-600 font-mono font-bold">✓{p.momentum.last30Min.delivered} del</span>
            {p.momentum.last30Min.failed > 0 && (
              <span className="text-red-600 font-mono font-bold">✗{p.momentum.last30Min.failed} failed</span>
            )}
          </div>
        </div>

        {/* Predictions */}
        <div className={`bg-white rounded-lg border p-3 ${hasPredictions ? 'border-orange-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} className={hasPredictions ? 'text-orange-500' : 'text-gray-400'} />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Predictions</span>
            {p.predictions.willGoStaleSoon > 0 && <InfoTip term="pulseStaleParcel" size={11} />}
            {p.predictions.estimatedFinishTime && <InfoTip term="pulseFinishTime" size={11} />}
          </div>
          {p.predictions.willGoStaleSoon > 0 ? (
            <p className="text-sm font-bold text-orange-700">
              {p.predictions.willGoStaleSoon} parcel{p.predictions.willGoStaleSoon !== 1 ? 's' : ''} about to go stale
            </p>
          ) : p.predictions.willFinishLate ? (
            <p className="text-sm font-bold text-orange-700">
              Will finish at {p.predictions.estimatedFinishTime} — late
            </p>
          ) : p.predictions.estimatedFinishTime ? (
            <p className="text-sm font-bold text-green-700">
              On track — finish at {p.predictions.estimatedFinishTime}
            </p>
          ) : (
            <p className="text-sm font-bold text-gray-700">
              Nothing to deliver right now
            </p>
          )}
          {p.predictions.parcelsStillToDeliver > 0 && (
            <p className="text-[11px] mt-0.5 text-gray-500">
              {p.predictions.parcelsStillToDeliver} left · {p.predictions.deliveryRatePerHour}/hr current rate
              <span className="block text-gray-400 text-[10px] mt-0.5">
                {p.predictions.willGoStaleSoon > 0 ? '= in sort > 90 min (will cross 2h threshold)' : '= rate from last 2 hours of deliveries'}
              </span>
            </p>
          )}
        </div>

        {/* Time awareness */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock size={12} className="text-blue-500" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Day progress</span>
            <InfoTip term="pulseDeliveryWindow" size={11} />
          </div>
          <p className="text-sm font-bold text-gray-900">
            {p.timeAwareness.percentThroughWindow}% through delivery window
          </p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
            <div
              className={`h-full rounded-full ${p.timeAwareness.percentThroughWindow >= 80 ? 'bg-red-500' : p.timeAwareness.percentThroughWindow >= 60 ? 'bg-orange-500' : 'bg-blue-500'}`}
              style={{ width: `${p.timeAwareness.percentThroughWindow}%` }}
            />
          </div>
          {p.timeAwareness.parcelsPerHourNeeded > 0 && (
            <p className="text-[11px] mt-1 text-gray-500">
              Need <span className="font-mono font-bold text-gray-900">{p.timeAwareness.parcelsPerHourNeeded}/hr</span> to finish by {p.timeAwareness.deliveryWindowEnd}:00
              <span className="block text-gray-400 text-[10px] mt-0.5">
                = {p.timeAwareness.parcelsRemaining} parcels ÷ hours left in 8am–6pm window
              </span>
            </p>
          )}
        </div>
      </div>

      {/* ── Streaks + overdue details row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Streaks — what's going well */}
        <div className="bg-white rounded-lg border border-green-200 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Flame size={12} className="text-orange-500" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Streaks</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {p.streaks.daysWithoutStockout > 0 && (
              <span className="text-green-700 font-medium flex items-center gap-1">
                <span className="font-mono font-bold">{p.streaks.daysWithoutStockout}</span> days without stockout
                <InfoTip term="pulseDaysWithoutStockout" size={11} />
              </span>
            )}
            {p.streaks.hoursSinceLastFailure > 0 && (
              <span className="text-green-700 font-medium">
                <span className="font-mono font-bold">{p.streaks.hoursSinceLastFailure}h</span> since last failed delivery
              </span>
            )}
            {p.streaks.isBestWeekThisQuarter && (
              <span className="text-green-700 font-medium">
                Best week this quarter
              </span>
            )}
            {p.streaks.daysWithoutStockout === 0 && p.streaks.hoursSinceLastFailure === 0 && !p.streaks.isBestWeekThisQuarter && (
              <span className="text-gray-400 italic">No active streaks yet today.</span>
            )}
          </div>
        </div>

        {/* Overdue parcels detail — only if there are any */}
        {p.stakes.overdueParcels.length > 0 ? (
          <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-red-700 font-semibold">
                Overdue parcels · {p.stakes.overdueParcelsCount} (showing top {p.stakes.overdueParcels.length})
              </span>
              <button onClick={() => onNavigate?.('outbound')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase tracking-wider">View all →</button>
            </div>
            <div className="divide-y divide-red-50">
              {p.stakes.overdueParcels.map(o => (
                <div key={o.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px] bg-red-50/20">
                  <span className="font-mono font-bold text-gray-900 w-20 shrink-0">{o.id}</span>
                  <span className="text-gray-700 flex-1 truncate">{o.customerName}</span>
                  <span className="text-gray-500 truncate max-w-[80px]">{o.driver}</span>
                  <span className="font-mono text-red-700 font-bold shrink-0">{o.hoursOverdue}h</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-green-200 px-3 py-2.5 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600 shrink-0" />
            <span className="text-[11px] text-green-700 font-medium">
              No overdue parcels — all in-transit deliveries are within the 6-hour threshold.
            </span>
          </div>
        )}
      </div>

      {/* ── Audit basis footer — explains the assumptions behind every calculation ── */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <strong className="text-gray-700">Audit basis:</strong> Data as of {timeStr}. Delivery window = 8:00am–6:00pm.
          Overdue = dispatched &gt; 6 hours ago. Stale = sort &gt; 2h, staging &gt; 4h.
          "About to go stale" = sort &gt; 90 min. Pace = orders since midnight ÷ hours elapsed.
          Finish time = parcels left ÷ deliveries in last 2 hours. Streaks based on shrinkage records with "stock" in reason.
          Hover any (i) icon for the full definition + example.
        </p>
      </div>
    </div>
  )
}

// ── Dashboard Story ──
// ONE unified voice for the dashboard. Merges the old PeriodHeadline +
// TodaysStory into a single section that:
//   1. Opens with a bold headline sentence (the period summary)
//   2. Lists 3-5 bullet points of what's worth knowing (critical/warning/good)
//   3. Each bullet is clickable to the relevant module
// This is the ONLY "voice" of the dashboard. Everything below is supporting data.
function DashboardStory({
  data,
  period,
  onNavigate,
}: {
  data: DashboardData
  period: string
  onNavigate?: (module: string) => void
}) {
  // ── Build the headline sentence ──
  const headlineParts: string[] = []
  if (data.stats.totalRevenue > 0) {
    const revChange = data.comparison.revenueChange
    let revPhrase = `${formatCurrency(data.stats.totalRevenue)} in revenue`
    if (revChange !== 0) {
      revPhrase += ` — ${revChange > 0 ? 'up' : 'down'} ${Math.abs(revChange)}% vs last month`
    }
    headlineParts.push(revPhrase)
  } else if (data.orders.total === 0) {
    headlineParts.push('No revenue or orders this period yet')
  }
  if (data.orders.total > 0) {
    const deliveredPct = data.orders.total > 0 ? Math.round((data.orders.delivered / data.orders.total) * 100) : 0
    headlineParts.push(`${data.orders.total} orders, ${data.orders.delivered} delivered (${deliveredPct}%)`)
  }
  if (data.onTimeRate > 0 && data.orders.delivered > 0) {
    const target = 90
    if (data.onTimeRate < target) {
      headlineParts.push(`on-time at ${data.onTimeRate}% — below your ${target}% target`)
    } else {
      headlineParts.push(`on-time at ${data.onTimeRate}% — meeting target`)
    }
  }
  if (data.inventory.critical > 0) {
    headlineParts.push(`${data.inventory.critical} product${data.inventory.critical !== 1 ? 's' : ''} critically low on stock`)
  } else if (data.inventory.low > 0) {
    headlineParts.push(`${data.inventory.low} product${data.inventory.low !== 1 ? 's' : ''} running low on stock`)
  }
  if (data.cod.pendingBankings > 0) {
    headlineParts.push(`${formatCurrencyCompact(data.cod.pendingBankings)} in COD cash pending verification`)
  }
  if (data.exceptionCount > 0) {
    headlineParts.push(`${data.exceptionCount} exception${data.exceptionCount !== 1 ? 's' : ''} recorded`)
  }

  let headline: string
  if (headlineParts.length === 0) {
    headline = 'Nothing recorded for this period yet.'
  } else if (headlineParts.length === 1) {
    headline = headlineParts[0] + '.'
  } else {
    const first = headlineParts[0] + (headlineParts[1] ? `, ${headlineParts[1]}` : '') + '.'
    const rest = headlineParts.slice(2)
    headline = first + (rest.length > 0 ? ' ' + rest.join('. ') + '.' : '')
  }

  // ── Build the bullet items ──
  type StoryItem = { severity: 'critical' | 'warning' | 'good'; message: string; module?: string }
  const items: StoryItem[] = []

  if (data.inventory.critical > 0) {
    items.push({ severity: 'critical', message: `${data.inventory.critical} product${data.inventory.critical !== 1 ? 's' : ''} critically low on stock — reorder now`, module: 'products' })
  }
  if (data.inventory.low > 0) {
    items.push({ severity: 'warning', message: `${data.inventory.low} product${data.inventory.low !== 1 ? 's' : ''} running low on stock`, module: 'products' })
  }
  if (data.cod.pendingBankings > 0) {
    items.push({ severity: 'warning', message: `${formatCurrency(data.cod.pendingBankings)} in COD cash waiting to be verified`, module: 'payments' })
  }
  if (data.onTimeRate > 0 && data.onTimeRate < 80 && data.orders.delivered > 0) {
    items.push({ severity: 'warning', message: `On-time delivery is ${data.onTimeRate}% — below the 80% acceptable threshold`, module: 'outbound' })
  }
  if (data.firstAttemptRate > 0 && data.firstAttemptRate < 60 && data.orders.delivered > 0) {
    items.push({ severity: 'warning', message: `First-attempt success rate is ${data.firstAttemptRate}% — many deliveries need a second attempt`, module: 'outbound' })
  }
  if (data.exceptionCount > 0) {
    items.push({ severity: 'critical', message: `${data.exceptionCount} exception${data.exceptionCount !== 1 ? 's' : ''} recorded — failed deliveries, returns, or shrinkage`, module: 'returns' })
  }
  if (data.shrinkage.totalQty > 0) {
    items.push({ severity: 'warning', message: `${data.shrinkage.totalQty} units lost to shrinkage this period`, module: 'returns' })
  }
  const driversWithPendingBankings = data.driverPerformance.filter(d => d.bankingStatus === 'pending').length
  if (driversWithPendingBankings > 0) {
    items.push({ severity: 'warning', message: `${driversWithPendingBankings} driver${driversWithPendingBankings !== 1 ? 's' : ''} haven't banked their COD cash yet`, module: 'drivers' })
  }

  // POSITIVE items (only show if no critical/warning issues compete for attention)
  if (items.filter(i => i.severity !== 'good').length === 0) {
    if (data.orders.delivered > 0 && data.onTimeRate >= 90) {
      items.push({ severity: 'good', message: `On-time delivery is ${data.onTimeRate}% — exceeding target` })
    }
    if (data.cod.bankingRate >= 95 && data.cod.collectedTotal > 0) {
      items.push({ severity: 'good', message: `COD banking rate is ${data.cod.bankingRate}% — cash is being verified promptly` })
    }
    if (data.comparison.revenueChange > 0) {
      items.push({ severity: 'good', message: `Revenue is up ${data.comparison.revenueChange}% vs last month` })
    }
    if (data.inventory.critical === 0 && data.inventory.low === 0 && data.inventory.healthy > 0) {
      items.push({ severity: 'good', message: 'All stock levels are healthy' })
    }
  }

  // Determine tone
  const hasProblems = data.exceptionCount > 0 || data.cod.pendingBankings > 0 || data.inventory.critical > 0 || (data.onTimeRate > 0 && data.onTimeRate < 80)
  const isQuiet = data.orders.total === 0 && data.stats.totalRevenue === 0
  const hasCritical = items.some(i => i.severity === 'critical')
  const allGood = items.length > 0 && items.every(i => i.severity === 'good')

  const borderColor = hasProblems || hasCritical ? 'border-red-200' : allGood ? 'border-green-200' : isQuiet ? 'border-gray-200' : 'border-blue-200'
  const headlineBg = hasProblems || hasCritical ? 'bg-red-50' : allGood ? 'bg-green-50' : isQuiet ? 'bg-gray-50' : 'bg-blue-50'
  const headlineTextColor = hasProblems || hasCritical ? 'text-red-900' : allGood ? 'text-green-900' : isQuiet ? 'text-gray-700' : 'text-blue-900'
  const iconColor = hasProblems || hasCritical ? 'text-red-600' : allGood ? 'text-green-600' : isQuiet ? 'text-gray-500' : 'text-blue-600'

  return (
    <div className={`bg-white rounded-lg border ${borderColor} overflow-hidden`}>
      {/* Headline sentence */}
      <div className={`px-4 py-3 ${headlineBg} border-b ${borderColor}`}>
        <div className="flex items-start gap-2">
          {hasProblems || hasCritical ? (
            <AlertTriangle size={14} className={`${iconColor} mt-0.5 shrink-0`} />
          ) : isQuiet ? (
            <CheckCircle2 size={14} className={`${iconColor} mt-0.5 shrink-0`} />
          ) : allGood ? (
            <CheckCircle2 size={14} className={`${iconColor} mt-0.5 shrink-0`} />
          ) : (
            <TrendingUp size={14} className={`${iconColor} mt-0.5 shrink-0`} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
              {period} · {new Date().toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className={`text-sm font-medium ${headlineTextColor}`}>{headline}</p>
          </div>
        </div>
      </div>

      {/* Bullet items */}
      {items.length > 0 && (
        <div className="divide-y divide-gray-50">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => item.module && onNavigate?.(item.module)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                item.module ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                item.severity === 'critical' ? 'bg-red-500' :
                item.severity === 'warning' ? 'bg-orange-500' :
                'bg-green-500'
              }`} />
              <p className={`flex-1 text-xs font-medium ${
                item.severity === 'critical' ? 'text-red-900' :
                item.severity === 'warning' ? 'text-orange-900' :
                'text-green-900'
              }`}>
                {item.message}
              </p>
              {item.module && <span className="text-[10px] text-gray-400 uppercase tracking-wider">{item.module} →</span>}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && !isQuiet && (
        <div className="px-4 py-2.5 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <p className="flex-1 text-xs font-medium text-green-900">All clear — nothing needs your attention right now.</p>
        </div>
      )}
    </div>
  )
}

// ── Chart Takeaway ──
// A one-line sentence above each chart that says what the chart means.
// Replaces database-label titles like "Revenue Trend (6 months)" with
// actual sentences like "Revenue trending up — best month in 6."
function ChartTakeaway({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warning' | 'critical' }) {
  const toneClass = {
    neutral: 'text-gray-700',
    good: 'text-green-700',
    warning: 'text-orange-700',
    critical: 'text-red-700',
  }[tone]
  return (
    <p className={`text-xs font-medium mb-2 ${toneClass}`}>{text}</p>
  )
}

// ── Takeaway computations ──
// Each function reads the live data and returns a plain-English sentence
// summarizing what the chart/table means.

function revenueTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' | 'critical' } {
  const months = data.revenueByMonth
  if (!months || months.length === 0) return { text: 'No revenue recorded yet.', tone: 'neutral' }
  const withRevenue = months.filter(m => (m.revenue || 0) > 0)
  if (withRevenue.length === 0) return { text: 'No revenue recorded yet.', tone: 'neutral' }
  const last = withRevenue[withRevenue.length - 1]
  const previous = withRevenue.slice(0, -1)
  if (previous.length === 0) return { text: `Revenue at ${formatCurrencyCompact(last.revenue)} this month — first data point.`, tone: 'neutral' }
  const maxPrev = Math.max(...previous.map(m => m.revenue))
  const avgPrev = previous.reduce((s, m) => s + m.revenue, 0) / previous.length
  if (last.revenue > maxPrev) return { text: `Revenue trending up — ${formatCurrencyCompact(last.revenue)} is the best month in the last ${withRevenue.length}.`, tone: 'good' }
  if (last.revenue < avgPrev * 0.8) {
    const drop = Math.round(((avgPrev - last.revenue) / avgPrev) * 100)
    return { text: `Revenue down ${drop}% this month vs the ${previous.length}-month average.`, tone: 'warning' }
  }
  return { text: `Revenue steady at ${formatCurrencyCompact(last.revenue)} — in line with the ${previous.length}-month average.`, tone: 'neutral' }
}

function orderStatusTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' | 'critical' } {
  const dist = data.orderStatusDistribution
  const total = dist.reduce((s, d) => s + d.count, 0)
  if (total === 0) return { text: 'No orders this period.', tone: 'neutral' }
  const delivered = dist.find(d => d.status === 'delivered')?.count || 0
  const stuck = dist.filter(d => ['picking', 'packing', 'pending'].includes(d.status)).reduce((s, d) => s + d.count, 0)
  const failed = dist.find(d => d.status === 'failed')?.count || 0
  const pct = Math.round((delivered / total) * 100)
  if (delivered === total) return { text: `All ${total} orders delivered.`, tone: 'good' }
  const bits: string[] = [`${delivered} of ${total} delivered (${pct}%)`]
  if (stuck > 0) bits.push(`${stuck} still in picking/packing`)
  if (failed > 0) bits.push(`${failed} failed`)
  return { text: bits.join(', ') + '.', tone: failed > 0 ? 'critical' : stuck > 0 ? 'warning' : 'neutral' }
}

function throughputTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' } {
  const days = data.throughputData
  if (!days || days.length === 0) return { text: 'No throughput data yet.', tone: 'neutral' }
  const totalIn = days.reduce((s, d) => s + (d.inbound || 0), 0)
  const totalOut = days.reduce((s, d) => s + (d.outbound || 0), 0)
  if (totalIn === 0 && totalOut === 0) return { text: 'No inbound or outbound recorded this week.', tone: 'neutral' }
  const peakDay = days.reduce((max, d) => (d.inbound > max.inbound ? d : max), days[0])
  const bits: string[] = []
  if (peakDay.inbound > 0) bits.push(`inbound peaked ${peakDay.day}`)
  if (totalOut > totalIn) bits.push(`outbound higher than inbound this week`)
  else if (totalIn > totalOut) bits.push(`inbound higher than outbound this week`)
  else bits.push(`inbound and outbound balanced`)
  return { text: bits.join('; ') + '.', tone: 'neutral' }
}

function inventoryTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' | 'critical' } {
  const inv = data.inventory
  if (inv.critical > 0) return { text: `${inv.critical} product${inv.critical !== 1 ? 's' : ''} critically low on stock — reorder now.`, tone: 'critical' }
  if (inv.low > 0) return { text: `${inv.low} product${inv.low !== 1 ? 's' : ''} running low; ${inv.healthy} healthy.`, tone: 'warning' }
  if (inv.healthy > 0) return { text: `All ${inv.healthy} products at healthy stock levels.`, tone: 'good' }
  return { text: 'No stock data.', tone: 'neutral' }
}

function driverTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' } {
  const drivers = data.driverPerformance
  if (drivers.length === 0) return { text: 'No active drivers this period.', tone: 'neutral' }
  const banked = drivers.filter(d => d.bankingStatus === 'banked').length
  const pending = drivers.filter(d => d.bankingStatus === 'pending').length
  const withFailed = drivers.filter(d => d.failed > 0).length
  const bits: string[] = []
  if (pending > 0) bits.push(`${pending} of ${drivers.length} haven't banked their cash`)
  else bits.push(`all ${drivers.length} banked their cash`)
  if (withFailed > 0) bits.push(`${withFailed} had failed deliveries`)
  return { text: bits.join('; ') + '.', tone: pending > 0 ? 'warning' : 'good' }
}

function merchantProfitabilityTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' } {
  const merchants = data.merchantProfitability
  if (merchants.length === 0) return { text: 'No merchant data this period.', tone: 'neutral' }
  const totalRev = merchants.reduce((s, m) => s + m.revenue, 0)
  const top3 = merchants.slice(0, 3).reduce((s, m) => s + m.revenue, 0)
  const lossMakers = merchants.filter(m => m.net < 0).length
  const bits: string[] = []
  if (totalRev > 0) {
    const pct = Math.round((top3 / totalRev) * 100)
    bits.push(`top 3 merchants drive ${pct}% of revenue`)
  }
  if (lossMakers > 0) bits.push(`${lossMakers} operating at a loss`)
  return { text: bits.join('; ') + '.', tone: lossMakers > 0 ? 'warning' : 'neutral' }
}

function shrinkageTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'warning' } {
  if (data.shrinkage.totalQty === 0) return { text: 'No shrinkage recorded this period.', tone: 'neutral' }
  const byReason = data.shrinkage.byReason
  if (byReason.length > 0) {
    const top = byReason.reduce((max, r) => (r.qty > max.qty ? r : max), byReason[0])
    return { text: `${data.shrinkage.totalQty} units lost to shrinkage, mostly from ${top.reason || 'unknown'}.`, tone: 'warning' }
  }
  return { text: `${data.shrinkage.totalQty} units lost to shrinkage this period.`, tone: 'warning' }
}

function codTakeaway(data: DashboardData): { text: string; tone: 'neutral' | 'good' | 'warning' } {
  if (data.cod.collectedTotal === 0) return { text: 'No COD collected this period.', tone: 'neutral' }
  if (data.cod.pendingBankings === 0) return { text: `All ${formatCurrencyCompact(data.cod.collectedTotal)} in COD cash has been banked.`, tone: 'good' }
  return { text: `Banking rate at ${data.cod.bankingRate}% — ${formatCurrencyCompact(data.cod.pendingBankings)} still pending.`, tone: 'warning' }
}

function paymentMethodsTakeaway(data: DashboardData): { text: string; tone: 'neutral' } {
  const methods = data.paymentMethods
  if (methods.length === 0) return { text: 'No payments recorded.', tone: 'neutral' }
  const total = methods.reduce((s, m) => s + m.amount, 0)
  if (total === 0) return { text: 'No payments recorded.', tone: 'neutral' }
  const top = methods.reduce((max, m) => (m.amount > max.amount ? m : max), methods[0])
  const pct = Math.round((top.amount / total) * 100)
  if (pct >= 60) return { text: `${top.method} dominates at ${pct}% of payments.`, tone: 'neutral' }
  return { text: `Payments split across ${methods.length} methods, no single method dominates.`, tone: 'neutral' }
}

function topMerchantsTakeaway(data: DashboardData): { text: string; tone: 'neutral' } {
  const merchants = data.topMerchants
  if (merchants.length === 0) return { text: 'No top merchants data.', tone: 'neutral' }
  const total = merchants.reduce((s, m) => s + m.amount, 0)
  const top = merchants[0]
  const pct = total > 0 ? Math.round((top.amount / total) * 100) : 0
  return { text: `${top.name} is the top merchant at ${formatCurrencyCompact(top.amount)} (${pct}% of top ${merchants.length}).`, tone: 'neutral' }
}


export default function DashboardModule({ onNavigate }: DashboardModuleProps = {}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [period, setPeriod] = useState('This Month')
  const [showPeriodMenu, setShowPeriodMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showOnlyProblems, setShowOnlyProblems] = useState(false)
  const [revenueRange, setRevenueRange] = useState<'3M' | '6M' | '12M'>('6M')

  const fetchData = useCallback(() => {
    fetch(`/api/dashboard?period=${encodeURIComponent(period)}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [period])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const periods = ['Today', 'This Week', 'This Month', 'This Quarter', 'All Time']

  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      // Build a CSV from the dashboard data
      const rows: string[] = []
      rows.push('Kwanza Logistics — Dashboard Export')
      rows.push(`Period: ${period}`)
      rows.push(`Generated: ${new Date().toLocaleString('en-UG')}`)
      rows.push('')
      rows.push('KPI Summary')
      rows.push(`Revenue,${data.stats.totalRevenue}`)
      rows.push(`Orders,${data.orders.total}`)
      rows.push(`Delivered,${data.orders.delivered}`)
      rows.push(`On-Time Rate,${data.onTimeRate}%`)
      rows.push(`First Attempt Rate,${data.firstAttemptRate}%`)
      rows.push(`Cycle Time (hours),${data.avgCycleTimeHours}`)
      rows.push(`COD Collected,${data.cod.collectedTotal}`)
      rows.push(`COD Pending,${data.cod.pendingBankings}`)
      rows.push(`Exceptions,${data.exceptionCount}`)
      rows.push('')
      rows.push('Driver Performance')
      rows.push('Driver,Dispatched,Delivered,Failed,COD Collected,Banking Status')
      data.driverPerformance.forEach(d => {
        rows.push(`${d.name},${d.dispatched},${d.delivered},${d.failed},${d.codCollected},${d.bankingStatus}`)
      })
      rows.push('')
      rows.push('Merchant Profitability')
      rows.push('Merchant,Revenue,Commission,Shrinkage,Returns,Net')
      data.merchantProfitability.forEach(m => {
        rows.push(`${m.name},${m.revenue},${m.commission},${m.shrinkage},${m.returns},${m.net}`)
      })
      rows.push('')
      rows.push('Top Merchants by Revenue')
      rows.push('Merchant,Revenue')
      data.topMerchants.forEach(m => {
        rows.push(`${m.name},${m.amount}`)
      })
      rows.push('')
      rows.push('Alerts')
      rows.push('Type,Message,Module')
      data.alerts.forEach(a => {
        rows.push(`${a.type},${a.message},${a.module}`)
      })

      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kwanza-dashboard-${period.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    } finally {
      setExporting(false)
    }
  }

  if (!data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <p className="text-[11px] text-gray-500">Real-time overview · Auto-refresh 30s</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector (#13) */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodMenu(!showPeriodMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-xs font-medium text-gray-700"
            >
              {period}
              <ChevronDown size={12} className={`text-gray-400 transition-transform ${showPeriodMenu ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showPeriodMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50"
                >
                  {periods.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        p === period ? 'bg-[#FF6B35] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Export button (#14) */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="h-7 text-xs rounded-md"
          >
            <Download size={12} className="mr-1" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* EMERGENCY-FIRST LAYOUT                                        */}
      {/* 1. Emergency strip (borderless) — what's on fire right now    */}
      {/* 2. Module Status Board (dense table) — one row per module     */}
      {/* 3. Pulse mini-row (borderless inline) — momentum/predictions  */}
      {/* 4. Revenue chart (no card) — the one supporting visualization */}
      {/* 5. Audit basis footer                                         */}
      {/* ════════════════════════════════════════════════════════════ */}

      {/* 1. Emergency strip — borderless colored band, no card */}
      {(() => {
        const p = data.pulse
        if (!p) return null
        const now = new Date(p.timeAwareness.currentTime)
        const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
        const hasOverdue = p.stakes.overdueParcelsCount > 0
        const hasUnbanked = p.stakes.unbankedCOD > 0
        const hasAlreadyStale = p.predictions.alreadyStale > 0
        const hasEmergencies = hasOverdue || hasUnbanked || hasAlreadyStale

        if (!hasEmergencies) {
          return (
            <div className="rounded-lg px-4 py-2.5 bg-green-50 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              <span className="text-xs text-green-700 font-medium">
                All clear as of {timeStr} — no overdue parcels, no unbanked COD, nothing stale.
              </span>
            </div>
          )
        }

        const emergencies: string[] = []
        if (hasOverdue) emergencies.push(`${p.stakes.overdueParcelsCount} overdue parcel${p.stakes.overdueParcelsCount !== 1 ? 's' : ''}`)
        if (hasUnbanked) emergencies.push(`${formatCurrencyCompact(p.stakes.unbankedCOD)} unbanked COD`)
        if (hasAlreadyStale) emergencies.push(`${p.predictions.alreadyStale} already stale (in sort > 2h)`)

        return (
          <div className="rounded-lg px-4 py-2.5 bg-red-50 flex items-center gap-3 flex-wrap">
            <AlertTriangle size={14} className="text-red-600 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider text-red-700 font-bold">
              Emergency · {timeStr}
            </span>
            <span className="text-sm text-red-900 font-medium">
              {emergencies.join(' · ')}
            </span>
            <span className="text-[10px] text-red-600 ml-auto">
              See Module Status Board below for actions
            </span>
          </div>
        )
      })()}

      {/* 2. Module Status Board — the centerpiece. Dense table, one row per module. */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setShowOnlyProblems(!showOnlyProblems)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              showOnlyProblems
                ? 'bg-[#FF6B35] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Show only critical and warning modules"
          >
            {showOnlyProblems ? '✓ Problems only' : 'Problems only'}
          </button>
          <span className="text-[10px] text-gray-400">
            {showOnlyProblems ? 'Hiding healthy modules' : 'Showing all modules'}
          </span>
        </div>
        <ModuleStatusBoard data={data} onNavigate={onNavigate} showOnlyProblems={showOnlyProblems} />
      </div>

      {/* 3. Pulse mini-row — borderless inline, no cards */}
      {(() => {
        const p = data.pulse
        if (!p) return null
        const now = new Date(p.timeAwareness.currentTime)
        const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
        const paceUp = p.momentum.paceDeltaPct > 0
        const paceDown = p.momentum.paceDeltaPct < 0
        return (
          <div className="flex items-stretch gap-1 text-[11px]">
            {/* Momentum */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Zap size={10} className="text-orange-500" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Momentum</span>
                <InfoTip term="pulsePace" size={10} />
              </div>
              <span className="font-mono font-bold text-gray-900">{p.momentum.todayPace}</span>
              <span className="text-gray-500">/hr</span>
              {p.momentum.yesterdayPace > 0 && (
                <span className={`ml-1.5 ${paceUp ? 'text-green-700' : paceDown ? 'text-red-700' : 'text-gray-500'}`}>
                  {paceUp ? '↑' : paceDown ? '↓' : '—'}{Math.abs(p.momentum.paceDeltaPct)}%
                </span>
              )}
              <span className="block text-[9px] text-gray-400 mt-0.5">
                30min: +{p.momentum.last30Min.newOrders} · ✓{p.momentum.last30Min.delivered}
                {p.momentum.last30Min.failed > 0 && ` · ✗${p.momentum.last30Min.failed}`}
              </span>
            </div>

            {/* Predictions */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertTriangle size={10} className={p.predictions.willGoStaleSoon > 0 || p.predictions.alreadyStale > 0 || p.predictions.willFinishLate ? 'text-orange-500' : 'text-gray-400'} />
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Predictions</span>
                {p.predictions.estimatedFinishTime && <InfoTip term="pulseFinishTime" size={10} />}
              </div>
              {p.predictions.alreadyStale > 0 ? (
                <span className="font-bold text-red-700">{p.predictions.alreadyStale} already stale</span>
              ) : p.predictions.willGoStaleSoon > 0 ? (
                <span className="font-bold text-orange-700">{p.predictions.willGoStaleSoon} about to go stale</span>
              ) : p.predictions.willFinishLate ? (
                <span className="font-bold text-orange-700">Finish {p.predictions.estimatedFinishTime} — late</span>
              ) : p.predictions.estimatedFinishTime ? (
                <span className="font-bold text-green-700">Finish {p.predictions.estimatedFinishTime} — on track</span>
              ) : (
                <span className="text-gray-500">Nothing to deliver</span>
              )}
              {p.predictions.parcelsStillToDeliver > 0 && (
                <span className="block text-[9px] text-gray-400 mt-0.5">
                  {p.predictions.parcelsStillToDeliver} left · {p.predictions.deliveryRatePerHour}/hr
                  {p.predictions.willGoStaleSoon > 0 && ' · "about to go stale" = 90-120 min in sort'}
                </span>
              )}
            </div>

            {/* Day progress */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock size={10} className="text-blue-500" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Day progress</span>
                <InfoTip term="pulseDeliveryWindow" size={10} />
              </div>
              {p.timeAwareness.isAfterHours ? (
                <>
                  <span className="font-bold text-gray-500">Window closed</span>
                  <span className="block text-[9px] text-gray-400 mt-0.5">
                    After {p.timeAwareness.deliveryWindowEnd}:00 · {p.timeAwareness.parcelsRemaining} parcels still undelivered
                  </span>
                </>
              ) : p.timeAwareness.isBeforeHours ? (
                <>
                  <span className="font-bold text-gray-500">Not yet open</span>
                  <span className="block text-[9px] text-gray-400 mt-0.5">Window opens at 8:00am</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-bold text-gray-900">{p.timeAwareness.percentThroughWindow}%</span>
                  <span className="text-gray-500"> through window</span>
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${p.timeAwareness.percentThroughWindow >= 80 ? 'bg-red-500' : p.timeAwareness.percentThroughWindow >= 60 ? 'bg-orange-500' : 'bg-blue-500'}`}
                      style={{ width: `${p.timeAwareness.percentThroughWindow}%` }}
                    />
                  </div>
                  {p.timeAwareness.parcelsPerHourNeeded > 0 && (
                    <span className="block text-[9px] text-gray-400 mt-0.5">
                      Need {p.timeAwareness.parcelsPerHourNeeded}/hr to finish by {p.timeAwareness.deliveryWindowEnd}:00
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Streaks */}
            <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Flame size={10} className="text-orange-500" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Streaks</span>
              </div>
              {p.streaks.stockoutStreakHasData && p.streaks.daysWithoutStockout > 0 ? (
                <span className="text-green-700 font-medium">{p.streaks.daysWithoutStockout}d no stockout</span>
              ) : !p.streaks.stockoutStreakHasData ? (
                <span className="text-gray-400 text-[10px]">No shrinkage records to check</span>
              ) : null}
              {p.streaks.hoursSinceLastFailure > 0 && (
                <span className="text-green-700 font-medium ml-1.5">{p.streaks.hoursSinceLastFailure}h no failure</span>
              )}
              {p.streaks.isBestWeekThisQuarter && (
                <span className="block text-[9px] text-green-700 font-medium mt-0.5">Best week this quarter</span>
              )}
              {p.streaks.daysWithoutStockout === 0 && p.streaks.hoursSinceLastFailure === 0 && !p.streaks.isBestWeekThisQuarter && !p.streaks.stockoutStreakHasData && (
                <span className="text-gray-400 text-[10px]">No active streaks</span>
              )}
            </div>
          </div>
        )
      })()}

      {/* 4. Revenue chart — the one supporting visualization. No card container. */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Revenue Trend</span>
          <div className="flex items-center gap-1 ml-auto">
            {(['3M', '6M', '12M'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRevenueRange(r)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  revenueRange === r ? 'bg-[#1B2A4A] text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          // Slice the revenue data based on the selected range
          // API always returns 6 months; for 12M we'd need an API change,
          // so for now 3M = last 3, 6M = all 6, 12M = all 6 (capped)
          const allMonths = data.revenueByMonth
          const sliceCount = revenueRange === '3M' ? 3 : 6
          const chartData = allMonths.slice(-sliceCount)
          // Recompute takeaway on the sliced data
          const slicedData = { ...data, revenueByMonth: chartData }
          const t = revenueTakeaway(slicedData)
          return <ChartTakeaway text={t.text} tone={t.tone} />
        })()}
        <div className="bg-white rounded-lg p-4">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={(() => {
              const sliceCount = revenueRange === '3M' ? 3 : 6
              return data.revenueByMonth.slice(-sliceCount)
            })()}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1B2A4A" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#1B2A4A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
              <Area type="monotone" dataKey="commissions" stroke="#1B2A4A" strokeWidth={2} fill="url(#commGrad)" name="Commission" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. Audit basis footer */}
      {(() => {
        const p = data.pulse
        if (!p) return null
        const now = new Date(p.timeAwareness.currentTime)
        const timeStr = now.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
        return (
          <div className="px-3 py-2">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              <strong className="text-gray-600">Audit basis:</strong> Data as of {timeStr}. Delivery window = 8:00am–6:00pm.
              Overdue = dispatched &gt; 6h ago. Stale = sort &gt; 2h, staging &gt; 4h. "About to go stale" = sort &gt; 90 min.
              Pace = orders since midnight ÷ hours elapsed. Finish time = parcels left ÷ deliveries in last 2 hours.
              Streaks based on shrinkage records with "stock" in reason. Hover any (i) for full definition.
            </p>
          </div>
        )
      })()}

      {/* Old chart rows removed — replaced by Module Status Board + single revenue chart above. */}
    </motion.div>
  )
}

