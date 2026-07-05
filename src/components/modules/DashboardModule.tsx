'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2, XCircle, AlertCircle, Shield,
  TrendingUp, TrendingDown, ChevronRight, Clock, ChevronDown, Download,
} from 'lucide-react'
import { KpiRibbon, DenseTable, DenseTh, DenseTd, DenseTr, StatusPill } from '@/components/shared/ops-ui'
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

// ── Period Headline ──
// Plain-English summary of the selected period, generated from live data.
// This is the FIRST thing the supervisor reads when they land on the dashboard.
// It answers "what happened this period?" in 1-3 sentences.
function PeriodHeadline({ data, period }: { data: DashboardData; period: string }) {
  const parts: string[] = []

  // Revenue + trend
  if (data.stats.totalRevenue > 0) {
    const revChange = data.comparison.revenueChange
    let revPhrase = `${formatCurrency(data.stats.totalRevenue)} in revenue`
    if (revChange !== 0) {
      revPhrase += ` — ${revChange > 0 ? 'up' : 'down'} ${Math.abs(revChange)}% vs last month`
    }
    parts.push(revPhrase)
  } else if (data.orders.total === 0) {
    parts.push('No revenue or orders this period yet')
  }

  // Orders + delivery
  if (data.orders.total > 0) {
    const deliveredPct = data.orders.total > 0 ? Math.round((data.orders.delivered / data.orders.total) * 100) : 0
    parts.push(`${data.orders.total} orders, ${data.orders.delivered} delivered (${deliveredPct}%)`)
  }

  // On-time rate (with target context)
  if (data.onTimeRate > 0 && data.orders.delivered > 0) {
    const target = 90
    if (data.onTimeRate < target) {
      parts.push(`on-time delivery at ${data.onTimeRate}% — below your ${target}% target`)
    } else {
      parts.push(`on-time delivery at ${data.onTimeRate}% — meeting target`)
    }
  }

  // Stock issues
  if (data.inventory.critical > 0) {
    parts.push(`${data.inventory.critical} product${data.inventory.critical !== 1 ? 's' : ''} critically low on stock`)
  } else if (data.inventory.low > 0) {
    parts.push(`${data.inventory.low} product${data.inventory.low !== 1 ? 's' : ''} running low on stock`)
  }

  // Pending COD
  if (data.cod.pendingBankings > 0) {
    parts.push(`${formatCurrencyCompact(data.cod.pendingBankings)} in COD cash pending verification`)
  }

  // Exceptions
  if (data.exceptionCount > 0) {
    parts.push(`${data.exceptionCount} exception${data.exceptionCount !== 1 ? 's' : ''} recorded`)
  }

  // Compose
  let text: string
  if (parts.length === 0) {
    text = 'Nothing recorded for this period yet.'
  } else if (parts.length === 1) {
    text = parts[0] + '.'
  } else {
    // First sentence = revenue + orders (the most important)
    // Remaining sentences = on-time, stock, COD, exceptions
    const first = parts[0] + (parts[1] ? `, ${parts[1]}` : '') + '.'
    const rest = parts.slice(2)
    text = first + (rest.length > 0 ? ' ' + rest.join('. ') + '.' : '')
  }

  // Determine tone
  const hasProblems = data.exceptionCount > 0 || data.cod.pendingBankings > 0 || data.inventory.critical > 0 || (data.onTimeRate > 0 && data.onTimeRate < 80)
  const isQuiet = data.orders.total === 0 && data.stats.totalRevenue === 0

  return (
    <div className={`rounded-lg px-4 py-3 border ${
      hasProblems ? 'bg-red-50 border-red-200' :
      isQuiet ? 'bg-gray-50 border-gray-200' :
      'bg-blue-50 border-blue-200'
    }`}>
      <div className="flex items-start gap-2">
        {hasProblems ? (
          <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
        ) : isQuiet ? (
          <CheckCircle2 size={14} className="text-gray-500 mt-0.5 shrink-0" />
        ) : (
          <TrendingUp size={14} className="text-blue-600 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
            {period} · {new Date().toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <p className={`text-sm font-medium ${
            hasProblems ? 'text-red-900' : isQuiet ? 'text-gray-700' : 'text-blue-900'
          }`}>
            {text}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Today's Story panel ──
// Always-visible replacement for the conditional "Needs Attention" panel.
// When everything's good: green strip with a positive summary.
// When there are issues: orange/red list with navigation links.
// This is the dashboard's voice — it always tells you what's worth knowing.
function TodaysStory({
  data,
  onNavigate,
}: {
  data: DashboardData
  onNavigate?: (module: string) => void
}) {
  // Collect story items — each is a sentence with a severity and a destination
  type StoryItem = { severity: 'critical' | 'warning' | 'good'; message: string; module?: string }
  const items: StoryItem[] = []

  // Critical stock
  if (data.inventory.critical > 0) {
    items.push({
      severity: 'critical',
      message: `${data.inventory.critical} product${data.inventory.critical !== 1 ? 's' : ''} critically low on stock — reorder now`,
      module: 'products',
    })
  }
  // Low stock
  if (data.inventory.low > 0) {
    items.push({
      severity: 'warning',
      message: `${data.inventory.low} product${data.inventory.low !== 1 ? 's' : ''} running low on stock`,
      module: 'products',
    })
  }
  // Pending COD
  if (data.cod.pendingBankings > 0) {
    items.push({
      severity: 'warning',
      message: `${formatCurrency(data.cod.pendingBankings)} in COD cash waiting to be verified`,
      module: 'payments',
    })
  }
  // On-time below target
  if (data.onTimeRate > 0 && data.onTimeRate < 80 && data.orders.delivered > 0) {
    items.push({
      severity: 'warning',
      message: `On-time delivery is ${data.onTimeRate}% — below the 80% acceptable threshold`,
      module: 'outbound',
    })
  }
  // First-attempt below threshold
  if (data.firstAttemptRate > 0 && data.firstAttemptRate < 60 && data.orders.delivered > 0) {
    items.push({
      severity: 'warning',
      message: `First-attempt success rate is ${data.firstAttemptRate}% — many deliveries need a second attempt`,
      module: 'outbound',
    })
  }
  // Exceptions
  if (data.exceptionCount > 0) {
    items.push({
      severity: 'critical',
      message: `${data.exceptionCount} exception${data.exceptionCount !== 1 ? 's' : ''} recorded — failed deliveries, returns, or shrinkage`,
      module: 'returns',
    })
  }
  // Shrinkage
  if (data.shrinkage.totalQty > 0) {
    items.push({
      severity: 'warning',
      message: `${data.shrinkage.totalQty} units lost to shrinkage this period`,
      module: 'returns',
    })
  }
  // Drivers with pending bankings
  const driversWithPendingBankings = data.driverPerformance.filter(d => d.bankingStatus === 'pending').length
  if (driversWithPendingBankings > 0) {
    items.push({
      severity: 'warning',
      message: `${driversWithPendingBankings} driver${driversWithPendingBankings !== 1 ? 's' : ''} haven't banked their COD cash yet`,
      module: 'drivers',
    })
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

  // If literally nothing to say
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-gray-400 shrink-0" />
        <span className="text-[11px] text-gray-500 font-medium">
          Not enough data yet to tell a story for this period.
        </span>
      </div>
    )
  }

  const hasCritical = items.some(i => i.severity === 'critical')
  const hasWarning = items.some(i => i.severity === 'warning')
  const allGood = items.every(i => i.severity === 'good')

  // Tone + header
  const borderColor = allGood ? 'border-green-200' : hasCritical ? 'border-red-200' : 'border-orange-200'
  const bgColor = allGood ? 'bg-green-50' : hasCritical ? 'bg-red-50' : 'bg-orange-50'
  const headerTextColor = allGood ? 'text-green-700' : hasCritical ? 'text-red-700' : 'text-orange-700'
  const iconColor = allGood ? 'text-green-600' : hasCritical ? 'text-red-600' : 'text-orange-600'
  const headerText = allGood
    ? "What's going well"
    : hasCritical
      ? `${items.filter(i => i.severity === 'critical').length + items.filter(i => i.severity === 'warning').length} things need your attention`
      : `${items.length} things to keep an eye on`

  return (
    <div className={`bg-white rounded-lg border ${borderColor} overflow-hidden`}>
      <div className={`px-4 py-2 border-b ${borderColor} ${bgColor} flex items-center gap-2`}>
        {allGood ? <CheckCircle2 size={14} className={iconColor} /> : <AlertTriangle size={14} className={iconColor} />}
        <span className={`text-xs font-semibold uppercase tracking-wider ${headerTextColor}`}>{headerText}</span>
      </div>
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
    </div>
  )
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

      {/* Period Headline — plain-English summary, the first thing the supervisor reads */}
      <PeriodHeadline data={data} period={period} />

      {/* KPI Ribbon */}
      <KpiRibbon cells={kpiCells} />

      {/* Today's Story — always-visible replacement for the conditional Needs Attention panel */}
      <TodaysStory data={data} onNavigate={onNavigate} />

      {/* Row 1: Revenue Trend + Order Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Revenue Trend (6 months)</h3>
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Order Status</h3>
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
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Driver Performance</h3>
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">COD Status</h3>
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Warehouse Throughput (7 days)</h3>
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Inventory Health</h3>
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Shrinkage by Reason
            {onNavigate && <button onClick={() => onNavigate('returns')} className="float-right text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold uppercase">View →</button>}
          </h3>
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
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Merchant Profitability</h3>
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
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Top Merchants by Revenue</h3>
          </div>
          {data.topMerchants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payments recorded</p>
          ) : (
            <DenseTable>
              <thead><tr><DenseTh>Merchant</DenseTh><DenseTh className="text-right">Revenue</DenseTh></tr></thead>
              <tbody>
                {data.topMerchants.map((m, i) => (
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
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Payment Methods</h3>
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

      {/* Live Activity Feed (#18) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Recent Inbound</h3>
          </div>
          {data.recentInbound.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No recent inbound</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {data.recentInbound.slice(0, 8).map((r, i) => {
                const id = String(r.inboundId || '')
                const product = String(r.productName || '')
                const merchant = String(r.merchantName || '')
                const qty = String(r.qtyIn || '')
                const time = r.createdAt ? new Date(String(r.createdAt)).toLocaleString('en-UG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : ''
                return (
                  <div key={i} className="px-4 py-1.5 border-b border-gray-50 flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-gray-500 w-20">{id}</span>
                    <span className="flex-1 text-gray-700 truncate">{product}</span>
                    <span className="text-gray-400 truncate max-w-[80px]">{merchant}</span>
                    <span className="font-mono text-blue-600">x{qty}</span>
                    <span className="text-gray-400 w-20 text-right">{time}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Recent Outbound</h3>
          </div>
          {data.recentOutbound.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No recent outbound</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {data.recentOutbound.slice(0, 8).map((r, i) => {
                const id = String(r.orderNumber || r.outboundId || '')
                const customer = String(r.customerName || '')
                const product = String(r.productName || '')
                const qty = String(r.qty || '')
                const status = String(r.status || '')
                const time = r.createdAt ? new Date(String(r.createdAt)).toLocaleString('en-UG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : ''
                return (
                  <div key={i} className="px-4 py-1.5 border-b border-gray-50 flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-gray-500 w-20">{id}</span>
                    <span className="flex-1 text-gray-700 truncate">{customer}</span>
                    <span className="text-gray-400 truncate max-w-[80px]">{product}</span>
                    <span className="font-mono text-orange-600">x{qty}</span>
                    <StatusPill status={status} />
                    <span className="text-gray-400 w-20 text-right">{time}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Shield size={14} className="text-red-500" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Alerts</span>
            <Badge className="bg-red-100 text-red-700 border-0 text-[10px] ml-auto">{data.alerts.length}</Badge>
          </div>
          <div className="divide-y divide-gray-50">
            {data.alerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2 text-xs ${
                alert.type === 'critical' ? 'bg-red-50/50' : alert.type === 'warning' ? 'bg-orange-50/50' : 'bg-blue-50/50'
              }`}>
                {alert.type === 'critical' ? <XCircle size={13} className="text-red-500 shrink-0" /> :
                 alert.type === 'warning' ? <AlertCircle size={13} className="text-orange-500 shrink-0" /> :
                 <CheckCircle2 size={13} className="text-blue-500 shrink-0" />}
                <span className="flex-1 text-gray-700">{alert.message}</span>
                <Badge variant="outline" className="text-[9px] shrink-0 text-gray-400 border-gray-200">{alert.module}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Revenue Change', value: data.comparison.revenueChange },
          { label: 'Orders Change', value: data.comparison.ordersChange },
          { label: 'Stock Value Change', value: data.comparison.stockValueChange },
          { label: 'Avg Order Change', value: data.comparison.avgOrderChange },
        ].map((c, i) => {
          const isPositive = c.value >= 0
          return (
            <div key={i} className="bg-white rounded-lg border border-gray-100 px-4 py-2 flex items-center gap-2">
              {isPositive ? <TrendingUp size={14} className="text-green-500" /> : <TrendingDown size={14} className="text-red-500" />}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{c.label}</p>
                <p className={`text-sm font-mono font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
                  {isPositive ? '+' : ''}{c.value}%
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
