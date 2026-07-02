'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2, XCircle, AlertCircle, Shield,
  TrendingUp, TrendingDown, ChevronRight, Clock,
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

export default function DashboardModule({ onNavigate }: DashboardModuleProps = {}) {
  const [data, setData] = useState<DashboardData | null>(null)

  const fetchData = useCallback(() => {
    fetch('/api/dashboard?period=This Month')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

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
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-700">Live</span>
        </div>
      </div>

      {/* KPI Ribbon */}
      <KpiRibbon cells={kpiCells} />

      {/* What Needs Attention (#4) */}
      {data.attentionItems.length > 0 && (
        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-orange-100 bg-orange-50 flex items-center gap-2">
            <AlertTriangle size={14} className="text-orange-600" />
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Needs Attention</span>
            <span className="text-[10px] text-orange-600 ml-auto">{data.attentionItems.length} issues</span>
          </div>
          <div className="divide-y divide-gray-50">
            {data.attentionItems.map((item, i) => (
              <button
                key={i}
                onClick={() => onNavigate?.(item.module)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left ${
                  item.severity === 'critical' ? 'bg-red-50/30' : 'bg-orange-50/20'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.severity === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900">{item.message}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {item.items.slice(0, 3).map((it, j) => (
                      <span key={j} className="text-[10px] text-gray-400 font-mono">
                        {String(it.label || '')}
                        {j < Math.min(item.items.length, 3) - 1 ? ',' : ''}
                      </span>
                    ))}
                    {item.items.length > 3 && <span className="text-[10px] text-gray-400">+{item.items.length - 3} more</span>}
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{item.module} →</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
