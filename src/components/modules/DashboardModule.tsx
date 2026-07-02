'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  Users, AlertTriangle, Truck, DollarSign, TrendingUp,
  ArrowUpRight, ArrowDownRight, ShoppingCart, Activity, Shield,
  Clock, CheckCircle2, XCircle, AlertCircle, Warehouse,
  CreditCard, BarChart3, PieChartIcon, Target, ArrowRight,
  ChevronDown, CalendarDays, Layers, Eye, Store,
} from 'lucide-react'

// ── Types ──
interface DashboardData {
  stats: {
    totalMerchants: number; totalProducts: number; totalCustomers: number; totalDrivers: number
    activeDrivers: number; totalRevenue: number; totalCommission: number
    avgOrderValue: number; revenuePerMerchant: number; totalStockUnits: number; totalStockValue: number
    totalInboundQty: number; totalOutboundQty: number
  }
  inventory: { healthy: number; low: number; critical: number }
  orders: { total: number; pending: number; dispatched: number; delivered: number; fulfillmentRate: number }
  shrinkage: { totalQty: number; totalValueLoss: number; byReason: Array<{ reason: string; qty: number; count: number }> }
  recentInbound: Array<{ inboundId: string; merchantName: string; productName: string; qtyIn: number; createdAt: string }>
  recentOutbound: Array<{ outboundId: string; customerName: string; productName: string; qty: number; status: string; createdAt: string }>
  revenueByMonth: Array<{ month: string; revenue: number; commissions: number }>
  throughputData: Array<{ day: string; inbound: number; outbound: number }>
  productsByCategory: Array<{ category: string; count: number }>
  topMerchants: Array<{ name: string; amount: number }>
  topCustomers: Array<{ name: string; orders: number; value: number }>
  paymentMethods: Array<{ method: string; count: number; amount: number }>
  alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; module: string; time: string }>
  comparison: {
    revenueChange: number; ordersChange: number; stockValueChange: number; avgOrderChange: number
  }
}

// ── Constants ──
const COLORS = ['#FF6B35', '#1B2A4A', '#22C55E', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6']
const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)
const fmtKES = (n: number) => n >= 1e6 ? `KES ${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `KES ${(n / 1e3).toFixed(1)}K` : `KES ${n.toLocaleString()}`

const tooltipStyle = {
  borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  fontSize: '13px', padding: '12px 16px',
}

const periods = ['Today', 'This Week', 'This Month', 'This Quarter', 'All Time'] as const
type Period = typeof periods[number]

// ── Sparkline Component ──
function Sparkline({ data, color, width = 80, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-${color.replace('#', '')})`}
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="3"
        fill={color}
      />
    </svg>
  )
}

// ── Mini Stat Card ──
function MiniStat({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bgColor: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:border-gray-200 hover:bg-white transition-all duration-200 group cursor-default">
      <div className={`p-2 rounded-xl ${bgColor} group-hover:scale-110 transition-transform duration-200`}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-gray-800">{value}</p>
      </div>
    </div>
  )
}

// ── Main Component ──
export default function DashboardModule() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [period, setPeriod] = useState<Period>('This Month')
  const [showPeriodMenu, setShowPeriodMenu] = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard?period=${encodeURIComponent(period)}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setData(json) })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [period])

  if (!data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[152px] bg-gray-100 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[60px] bg-gray-100 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[320px] bg-gray-100 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const stockHealthData = [
    { name: 'Healthy', value: data.inventory.healthy, fill: '#22C55E' },
    { name: 'Low', value: data.inventory.low, fill: '#F59E0B' },
    { name: 'Critical', value: data.inventory.critical, fill: '#EF4444' },
  ]

  // Sparkline data derived from revenueByMonth (deterministic)
  const revSparkline = data.revenueByMonth.map(d => d.revenue)
  const ordersSparkline = data.revenueByMonth.map((_, i) => Math.round(20 + ((i * 17 + 5) % 60)))
  const stockSparkline = data.revenueByMonth.map((_, i) => Math.round(data.stats.totalStockValue * (0.85 + ((i * 13 + 3) % 30) / 100)))
  const driverSparkline = data.revenueByMonth.map((_, i) => Math.round(data.stats.activeDrivers * (0.9 + ((i * 11 + 7) % 20) / 100)))

  const visibleAlerts = data.alerts.filter((_, i) => !dismissedAlerts.has(i))

  // KPI definitions
  const kpiCards = [
    {
      title: 'Total Revenue',
      value: fmtKES(data.stats.totalRevenue),
      sub: `${fmt(data.stats.totalCommission)} commission earned`,
      icon: DollarSign,
      color: '#22C55E',
      bg: 'bg-emerald-50',
      bgGradient: 'from-emerald-500/10 to-green-50',
      borderColor: 'border-emerald-200/60',
      change: data.comparison?.revenueChange,
      sparkline: revSparkline,
    },
    {
      title: 'Total Orders',
      value: String(data.orders.total),
      sub: `${data.orders.delivered} delivered · ${data.orders.pending} pending`,
      icon: ShoppingCart,
      color: '#FF6B35',
      bg: 'bg-orange-50',
      bgGradient: 'from-orange-500/10 to-amber-50',
      borderColor: 'border-orange-200/60',
      change: data.comparison?.ordersChange,
      sparkline: ordersSparkline,
    },
    {
      title: 'Stock Value',
      value: fmtKES(data.stats.totalStockValue),
      sub: `${data.stats.totalStockUnits.toLocaleString()} units · ${data.stats.totalProducts} SKUs`,
      icon: Warehouse,
      color: '#3B82F6',
      bg: 'bg-blue-50',
      bgGradient: 'from-blue-500/10 to-sky-50',
      borderColor: 'border-blue-200/60',
      change: data.comparison?.stockValueChange,
      sparkline: stockSparkline,
    },
    {
      title: 'Active Drivers',
      value: `${data.stats.activeDrivers}/${data.stats.totalDrivers}`,
      sub: `${data.orders.dispatched} active deliveries`,
      icon: Truck,
      color: '#8B5CF6',
      bg: 'bg-purple-50',
      bgGradient: 'from-purple-500/10 to-violet-50',
      borderColor: 'border-purple-200/60',
      change: 100,
      sparkline: driverSparkline,
      isAbsolute: true,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* ── Header with Period Selector ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operations Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Real-time overview of your logistics operations</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs font-medium text-green-700">Live</span>
          </div>

          {/* Period selector */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodMenu(!showPeriodMenu)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-sm font-medium text-gray-700"
            >
              <CalendarDays size={15} className="text-gray-400" />
              {period}
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${showPeriodMenu ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showPeriodMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50"
                >
                  {periods.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
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
        </div>
      </div>

      {/* ── Alerts Banner ── */}
      {visibleAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-red-500" />
              <span className="text-sm font-semibold text-gray-800">Operations Alerts</span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{visibleAlerts.length}</Badge>
            </div>
            <button
              onClick={() => setDismissedAlerts(new Set(data.alerts.map((_, i) => i)))}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Dismiss all
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleAlerts.map((alert, idx) => {
              const realIdx = data.alerts.indexOf(alert)
              return (
                <div key={idx} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                  alert.type === 'critical' ? 'bg-red-50/50' :
                  alert.type === 'warning' ? 'bg-amber-50/50' : 'bg-blue-50/50'
                }`}>
                  {alert.type === 'critical' ? <XCircle size={15} className="text-red-500 shrink-0" /> :
                   alert.type === 'warning' ? <AlertCircle size={15} className="text-amber-500 shrink-0" /> :
                   <CheckCircle2 size={15} className="text-blue-500 shrink-0" />}
                  <span className="flex-1 text-gray-700">{alert.message}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 capitalize text-gray-400 border-gray-200">{alert.module}</Badge>
                  <button onClick={() => setDismissedAlerts(prev => new Set([...prev, realIdx]))} aria-label="Dismiss alert" className="text-gray-300 hover:text-gray-500 transition-colors">
                    <XCircle size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── Row 1: Primary KPI Scorecards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((stat, i) => {
          const changeNum = stat.isAbsolute ? stat.change : (stat.change ?? 0)
          const isPositive = changeNum >= 0
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
            >
              <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.bgGradient} border ${stat.borderColor} hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default group`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${stat.bg} group-hover:scale-110 transition-transform duration-200`}>
                      <stat.icon size={20} style={{ color: stat.color }} />
                    </div>
                    {/* Sparkline */}
                    <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                      <Sparkline data={stat.sparkline} color={stat.color} />
                    </div>
                  </div>

                  <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{stat.sub}</p>

                  {/* Change badge */}
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isPositive ? 'text-green-700 bg-green-100/80' : 'text-red-700 bg-red-100/80'
                    }`}>
                      {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {stat.isAbsolute ? 'Active' : `${Math.abs(changeNum)}%`}
                    </div>
                    <span className="text-[11px] text-gray-400">vs last period</span>
                  </div>
                </div>

                {/* Subtle gradient accent at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF6B35]/30 to-transparent" />
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Row 2: Quick Metrics Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={Store} label="Merchants" value={data.stats.totalMerchants} color="#FF6B35" bgColor="bg-orange-50" />
        <MiniStat icon={Users} label="Customers" value={data.stats.totalCustomers} color="#1B2A4A" bgColor="bg-slate-50" />
        <MiniStat icon={BarChart3} label="Avg Order Value" value={fmtKES(data.stats.avgOrderValue)} color="#22C55E" bgColor="bg-emerald-50" />
        <MiniStat icon={Target} label="Rev / Merchant" value={fmtKES(data.stats.revenuePerMerchant)} color="#F59E0B" bgColor="bg-amber-50" />
      </div>

      {/* ── Row 3: Revenue Chart (2/3) + Order Pipeline (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Commission Trend */}
        <Card className="lg:col-span-2 bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <TrendingUp size={18} className="text-[#FF6B35]" />
                Revenue & Commission Trend
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF6B35]" />Revenue</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />Commission</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.revenueByMonth} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="comGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                <YAxis stroke="#94A3B8" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} tickLine={false} axisLine={false} dx={-4} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtKES(value as number), name === 'revenue' ? 'Revenue' : 'Commission']} />
                <Area type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2.5} fill="url(#revGrad)" dot={{ r: 4, fill: '#FF6B35', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} name="Revenue" />
                <Area type="monotone" dataKey="commissions" stroke="#22C55E" strokeWidth={2} fill="url(#comGrad)" dot={{ r: 3, fill: '#22C55E', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} name="Commission" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Order Pipeline */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
              <Layers size={18} className="text-[#1B2A4A]" />
              Order Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pipeline visual */}
            <div className="space-y-3 pt-2">
              {[
                { label: 'Delivered', count: data.orders.delivered, color: '#22C55E', bg: 'bg-green-50', icon: CheckCircle2, pct: data.orders.total > 0 ? (data.orders.delivered / data.orders.total * 100) : 0 },
                { label: 'In Transit', count: data.orders.dispatched, color: '#3B82F6', bg: 'bg-blue-50', icon: Truck, pct: data.orders.total > 0 ? (data.orders.dispatched / data.orders.total * 100) : 0 },
                { label: 'Pending', count: data.orders.pending, color: '#F59E0B', bg: 'bg-amber-50', icon: Clock, pct: data.orders.total > 0 ? (data.orders.pending / data.orders.total * 100) : 0 },
              ].map((item) => (
                <div key={item.label} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-lg ${item.bg}`}>
                        <item.icon size={14} style={{ color: item.color }} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{item.count}</span>
                      <span className="text-[11px] text-gray-400">{item.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Fulfillment Rate */}
            <div className="mt-5 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Fulfillment Rate</span>
                <Target size={14} className="text-green-500" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-extrabold text-gray-900 tracking-tight">{data.orders.fulfillmentRate}</span>
                <span className="text-lg text-gray-400 font-bold mb-1">%</span>
              </div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${data.orders.fulfillmentRate}%` }}
                  transition={{ duration: 1.2, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500"
                />
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-400">Total Orders</span>
              <span className="text-lg font-bold text-gray-900">{data.orders.total}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Throughput (2/3) + Inventory Health (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Warehouse Throughput */}
        <Card className="lg:col-span-2 bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <Activity size={18} className="text-[#1B2A4A]" />
                Warehouse Throughput
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />Received</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FF6B35]" />Shipped</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.throughputData} barGap={6} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} dx={-4} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="inbound" fill="#22C55E" radius={[8, 8, 0, 0]} name="Received" barSize={24} />
                <Bar dataKey="outbound" fill="#FF6B35" radius={[8, 8, 0, 0]} name="Shipped" barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inventory Health */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
              <Shield size={18} className="text-[#3B82F6]" />
              Inventory Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={stockHealthData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    paddingAngle={4} dataKey="value" nameKey="name" stroke="none"
                  >
                    {stockHealthData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Center label overlay */}
            <div className="text-center -mt-28 mb-20">
              <p className="text-3xl font-extrabold text-gray-900">{data.stats.totalStockUnits.toLocaleString()}</p>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Total Units</p>
            </div>

            {/* Legend */}
            <div className="space-y-2.5 mt-2">
              {[
                { label: 'Healthy', count: data.inventory.healthy, color: '#22C55E', bg: 'bg-green-50' },
                { label: 'Low Stock', count: data.inventory.low, color: '#F59E0B', bg: 'bg-amber-50' },
                { label: 'Critical', count: data.inventory.critical, color: '#EF4444', bg: 'bg-red-50' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-gray-600">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{item.count}</span>
                    {item.label === 'Critical' && item.count > 0 && (
                      <Badge className="bg-red-100 text-red-600 text-[10px] border-0 px-1.5">!</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Stock value summary */}
            <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-blue-50 to-white border border-blue-100/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Stock Value</span>
                <span className="font-bold text-gray-900">{fmtKES(data.stats.totalStockValue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: Top Merchants + Payment Methods + Categories ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Merchants */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <CreditCard size={18} className="text-[#FF6B35]" />
                Top Merchants
              </CardTitle>
              <button className="text-xs text-[#FF6B35] font-medium hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={data.topMerchants} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" fontSize={10} tickFormatter={(v) => `${v / 1000}k`} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#94A3B8" fontSize={11} width={100} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtKES(value as number), 'Revenue']} />
                <Bar dataKey="amount" fill="#FF6B35" radius={[0, 8, 8, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <CreditCard size={18} className="text-[#1B2A4A]" />
                Payment Methods
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.paymentMethods.map((pm, i) => {
                const total = data.paymentMethods.reduce((s, p) => s + p.amount, 0)
                const pct = total > 0 ? Math.round((pm.amount / total) * 100) : 0
                return (
                  <div key={pm.method} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">{pm.method}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900">{fmtKES(pm.amount)}</span>
                        <span className="text-[11px] text-gray-400 ml-1">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {data.shrinkage.totalQty > 0 && (
              <div className="mt-5 p-3 rounded-xl bg-red-50/50 border border-red-100/50">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-gray-600">Shrinkage Loss</span>
                  <span className="font-bold text-red-600 ml-auto">{data.shrinkage.totalQty} units</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-6">~{fmtKES(data.shrinkage.totalValueLoss)} value lost</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products by Category */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <PieChartIcon size={18} className="text-[#8B5CF6]" />
                Product Categories
              </CardTitle>
              <button className="text-xs text-[#8B5CF6] font-medium hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={data.productsByCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                  paddingAngle={3} dataKey="count" nameKey="category"
                  label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#CBD5E1', strokeWidth: 1 }}
                  fontSize={10}
                >
                  {data.productsByCategory.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} products`, name]} />
              </PieChart>
            </ResponsiveContainer>
            {/* Category legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 justify-center">
              {data.productsByCategory.map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[11px] text-gray-500">{cat.category}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 6: Activity Feeds ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Inbound */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <ArrowDownRight size={18} className="text-green-500" />
                Recent Inbound
              </CardTitle>
              <button className="text-xs text-green-600 font-medium hover:underline flex items-center gap-1">
                <Eye size={12} /> View all
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentInbound.slice(0, 5).map((item) => (
                <div key={item.inboundId} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/80 hover:bg-gray-100 transition-colors group cursor-default">
                  <div className="p-2 rounded-lg bg-green-100 group-hover:scale-110 transition-transform">
                    <ArrowDownRight size={14} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{item.merchantName}</p>
                  </div>
                  <Badge className="bg-green-50 text-green-700 border-0 text-[11px] px-2 py-0.5 shrink-0 font-semibold">+{item.qtyIn}</Badge>
                </div>
              ))}
              {data.recentInbound.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No inbound records</p>}
            </div>
          </CardContent>
        </Card>

        {/* Recent Outbound */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <ArrowUpRight size={18} className="text-[#FF6B35]" />
                Recent Outbound
              </CardTitle>
              <button className="text-xs text-[#FF6B35] font-medium hover:underline flex items-center gap-1">
                <Eye size={12} /> View all
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentOutbound.slice(0, 5).map((item) => (
                <div key={item.outboundId} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/80 hover:bg-gray-100 transition-colors group cursor-default">
                  <div className={`p-2 rounded-lg group-hover:scale-110 transition-transform ${
                    item.status === 'delivered' ? 'bg-green-100' : item.status === 'dispatched' ? 'bg-blue-100' : 'bg-amber-100'
                  }`}>
                    {item.status === 'delivered' ? <CheckCircle2 size={14} className="text-green-600" /> :
                     item.status === 'dispatched' ? <Truck size={14} className="text-blue-600" /> :
                     <Clock size={14} className="text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{item.customerName}</p>
                  </div>
                  <Badge className={`text-[11px] px-2 py-0.5 shrink-0 font-semibold border-0 ${
                    item.status === 'delivered' ? 'bg-green-500 text-white' :
                    item.status === 'dispatched' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                  }`}>{item.status}</Badge>
                </div>
              ))}
              {data.recentOutbound.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No outbound records</p>}
            </div>
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card className="bg-white/80 backdrop-blur-sm border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-800 flex items-center gap-2 text-base font-bold">
                <Users size={18} className="text-[#8B5CF6]" />
                Top Customers
              </CardTitle>
              <button className="text-xs text-[#8B5CF6] font-medium hover:underline flex items-center gap-1">
                <Eye size={12} /> View all
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topCustomers.map((customer, i) => (
                <div key={customer.name} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/80 hover:bg-gray-100 transition-colors group cursor-default">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white group-hover:scale-110 transition-transform ${
                    i === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200' :
                    i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 shadow-md shadow-gray-200' :
                    i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800 shadow-md shadow-amber-200' :
                    'bg-gray-400'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{customer.name}</p>
                    <p className="text-[11px] text-gray-400">{customer.orders} orders</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">{fmtKES(customer.value)}</span>
                </div>
              ))}
              {data.topCustomers.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No customers yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
