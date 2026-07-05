'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2,
  TrendingUp, ChevronDown, Download,
} from 'lucide-react'
import { KpiRibbon, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

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

  // KPI cells with trends + clickable navigation
  const kpiCells = [
    { label: 'REVENUE', value: formatCurrencyCompact(data.stats.totalRevenue), trend: data.comparison.revenueChange, trendLabel: 'vs last month' },
    { label: 'ORDERS', value: data.orders.total, trend: data.comparison.ordersChange, trendLabel: 'vs last month' },
    { label: 'DELIVERED', value: data.orders.delivered },
    { label: 'CYCLE TIME', value: data.avgCycleTimeHours > 0 ? `${data.avgCycleTimeHours}h` : '—', trendLabel: 'avg order→delivery' },
    { label: 'ON-TIME %', value: `${data.onTimeRate}%`, highlight: data.onTimeRate < 80, highlightColor: 'red' as const },
    { label: '1ST ATTEMPT %', value: `${data.firstAttemptRate}%`, highlight: data.firstAttemptRate < 70, highlightColor: 'orange' as const },
    { label: 'COD PENDING', value: formatCurrencyCompact(data.cod.pendingBankings), highlight: data.cod.pendingBankings > 0, highlightColor: 'orange' as const },
    { label: 'EXCEPTIONS', value: data.exceptionCount, highlight: data.exceptionCount > 0, highlightColor: 'red' as const },
  ]

  const stockHealthData = [
    { name: 'Healthy', value: data.inventory.healthy, fill: '#22C55E' },
    { name: 'Low', value: data.inventory.low, fill: '#F59E0B' },
    { name: 'Critical', value: data.inventory.critical, fill: '#EF4444' },
  ]

  const orderStatusData = data.orderStatusDistribution
    .filter(s => s.count > 0)
    .map(s => ({ name: STATUS_LABELS[s.status] || s.status, value: s.count, fill: STATUS_COLORS[s.status] || '#9CA3AF' }))

  const shrinkageChartData = data.shrinkage.byReason.map((s, i) => ({
    name: s.reason || 'Unknown',
    qty: s.qty,
    fill: COLORS[i % COLORS.length],
  }))

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

      {/* Dashboard Story — the single voice of the dashboard. Headline + bullets. */}
      <DashboardStory data={data} period={period} onNavigate={onNavigate} />

      {/* KPI Ribbon */}
      <KpiRibbon cells={kpiCells} />

      {/* Row 1: Revenue Trend + Order Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:col-span-2">
          {(() => { const t = revenueTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueByMonth}>
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

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {(() => { const t = orderStatusTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          {orderStatusData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">No orders</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {orderStatusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {orderStatusData.map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Driver Performance + COD Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden lg:col-span-2">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            {(() => { const t = driverTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
            {onNavigate && <button onClick={() => onNavigate('drivers')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase">View all →</button>}
          </div>
          {data.driverPerformance.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No active drivers</p>
          ) : (
            <DenseTable>
              <thead>
                <tr>
                  <DenseTh>Driver</DenseTh>
                  <DenseTh className="text-right">Disp</DenseTh>
                  <DenseTh className="text-right">Del</DenseTh>
                  <DenseTh className="text-right">Failed</DenseTh>
                  <DenseTh className="text-right">COD</DenseTh>
                  <DenseTh className="text-center">Banking</DenseTh>
                </tr>
              </thead>
              <tbody>
                {data.driverPerformance.map((d, i) => (
                  <DenseTr key={d.driverId} tint={d.failed > 0 ? 'bg-red-50/40' : ''}>
                    <DenseTd className="text-gray-900 font-medium">{d.name}</DenseTd>
                    <DenseTd mono right>{d.dispatched}</DenseTd>
                    <DenseTd mono right className="text-green-700">{d.delivered}</DenseTd>
                    <DenseTd mono right className={d.failed > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>{d.failed}</DenseTd>
                    <DenseTd mono right className="text-orange-700">{d.codCollected > 0 ? formatCurrencyCompact(d.codCollected) : '—'}</DenseTd>
                    <DenseTd className="text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        d.bankingStatus === 'pending' ? 'bg-orange-100 text-orange-700'
                        : d.bankingStatus === 'shortfall' ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                      }`}>
                        {d.bankingStatus.toUpperCase()}
                      </span>
                    </DenseTd>
                  </DenseTr>
                ))}
              </tbody>
            </DenseTable>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {(() => { const t = codTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Collected</span>
              <span className="font-mono font-bold text-green-700">{formatCurrency(data.cod.collectedTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Banked</span>
              <span className="font-mono font-bold text-blue-700">{formatCurrency(data.cod.banked)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Pending</span>
              <span className={`font-mono font-bold ${data.cod.pendingBankings > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                {formatCurrency(data.cod.pendingBankings)}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Banking Rate</span>
                <span className={`font-mono font-bold ${data.cod.bankingRate >= 90 ? 'text-green-700' : data.cod.bankingRate >= 70 ? 'text-orange-700' : 'text-red-700'}`}>
                  {data.cod.bankingRate}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${data.cod.bankingRate >= 90 ? 'bg-green-500' : data.cod.bankingRate >= 70 ? 'bg-orange-500' : 'bg-red-500'}`}
                  style={{ width: `${data.cod.bankingRate}%` }}
                />
              </div>
            </div>
            {/* First-attempt success rate (#6) */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">1st Attempt Success</span>
                <span className={`font-mono font-bold ${data.firstAttemptRate >= 80 ? 'text-green-700' : data.firstAttemptRate >= 60 ? 'text-orange-700' : 'text-red-700'}`}>
                  {data.firstAttemptRate}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${data.firstAttemptRate >= 80 ? 'bg-green-500' : data.firstAttemptRate >= 60 ? 'bg-orange-500' : 'bg-red-500'}`}
                  style={{ width: `${data.firstAttemptRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Throughput + Inventory + Shrinkage Chart (#7) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:col-span-2">
          {(() => { const t = throughputTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.throughputData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="inbound" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Inbound" />
              <Bar dataKey="outbound" fill="#FF6B35" radius={[4, 4, 0, 0]} name="Outbound" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {(() => { const t = inventoryTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={stockHealthData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2}>
                {stockHealthData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-3 mt-1">
            {stockHealthData.map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Shrinkage Chart (#7) + Merchant Profitability (#8) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Shrinkage by Reason (#7) */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {(() => { const t = shrinkageTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          {onNavigate && <button onClick={() => onNavigate('returns')} className="float-right text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase -mt-5">View →</button>}
          {shrinkageChartData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No shrinkage recorded</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={shrinkageChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                  {shrinkageChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Merchant Profitability (#8) */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            {(() => { const t = merchantProfitabilityTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
            {onNavigate && <button onClick={() => onNavigate('merchants')} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase">View all →</button>}
          </div>
          {data.merchantProfitability.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No merchant data</p>
          ) : (
            <DenseTable>
              <thead>
                <tr>
                  <DenseTh>Merchant</DenseTh>
                  <DenseTh className="text-right">Revenue</DenseTh>
                  <DenseTh className="text-right">Costs</DenseTh>
                  <DenseTh className="text-right">Net</DenseTh>
                </tr>
              </thead>
              <tbody>
                {data.merchantProfitability.slice(0, 8).map((m, i) => {
                  const costs = m.commission + m.shrinkage + m.returns
                  return (
                    <DenseTr key={i} tint={m.net < 0 ? 'bg-red-50/40' : ''}>
                      <DenseTd className="text-gray-900 font-medium truncate max-w-[120px]">{m.name}</DenseTd>
                      <DenseTd mono right className="text-gray-700">{formatCurrencyCompact(m.revenue)}</DenseTd>
                      <DenseTd mono right className="text-red-600">{costs > 0 ? formatCurrencyCompact(costs) : '—'}</DenseTd>
                      <DenseTd mono right className={m.net >= 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>
                        {formatCurrencyCompact(m.net)}
                      </DenseTd>
                    </DenseTr>
                  )
                })}
              </tbody>
            </DenseTable>
          )}
        </div>
      </div>

      {/* Row 5: Top Merchants + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            {(() => { const t = topMerchantsTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          </div>
          {data.topMerchants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payments recorded</p>
          ) : (
            <DenseTable>
              <thead><tr><DenseTh>Merchant</DenseTh><DenseTh className="text-right">Revenue</DenseTh></tr></thead>
              <tbody>
                {data.topMerchants.slice(0, 5).map((m, i) => (
                  <DenseTr key={i}>
                    <DenseTd className="text-gray-900 font-medium">{m.name}</DenseTd>
                    <DenseTd mono right className="text-green-700">{formatCurrency(m.amount)}</DenseTd>
                  </DenseTr>
                ))}
              </tbody>
            </DenseTable>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {(() => { const t = paymentMethodsTakeaway(data); return <ChartTakeaway text={t.text} tone={t.tone} /> })()}
          {data.paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payments recorded</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={data.paymentMethods.map(p => ({ name: p.method, value: p.amount }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55}>
                    {data.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {data.paymentMethods.map((p, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {p.method} ({p.count})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Duplicates removed:
          - Live Activity Feed (Recent Inbound + Recent Outbound) — pure noise, no story value
          - Alerts section — already covered by Dashboard Story bullets above
          - Comparison strip — already covered by Dashboard Story headline + KPI ribbon trends
          Keeping the dashboard focused: Story → KPIs → 5 chart rows. That's it. */}
    </motion.div>
  )
}
