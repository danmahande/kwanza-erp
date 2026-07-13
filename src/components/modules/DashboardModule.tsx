'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  ChevronDown, Download, HelpCircle, Flame,
} from 'lucide-react'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ── Types ──

interface DashboardData {
  stats: {
    totalMerchants: number; totalProducts: number; totalCustomers: number; totalDrivers: number
    activeDrivers: number; totalRevenue: number; totalCommission: number
    avgOrderValue: number; revenuePerMerchant: number; totalStockUnits: number; totalStockValue: number
    netProfit: number; totalShrinkageValue: number; totalReturnValue: number
  }
  inventory: { healthy: number; low: number; critical: number }
  orders: { total: number; pending: number; dispatched: number; delivered: number; fulfillmentRate: number }
  cod: { collectedTotal: number; banked: number; pendingBankings: number; bankingRate: number }
  comparison: { revenueChange: number; ordersChange: number; stockValueChange: number; avgOrderChange: number }
  onTimeRate: number
  exceptionCount: number
  exceptionRate: number
  firstAttemptRate?: number
  avgCycleTimeHours?: number
  revenueByMonth: Array<{ month: string; revenue: number; commissions: number }>
  merchantProfitability: Array<{ name: string; revenue: number; commission: number; shrinkage: number; returns: number; net: number }>
  orderStatusDistribution?: Array<{ status: string; count: number }>
  shrinkage?: { totalQty: number; byReason: Array<{ reason: string; qty: number; count: number }> }
  pulse: {
    streaks: {
      daysWithoutStockout: number; stockoutStreakHasData: boolean
      hoursSinceLastFailure: number; isBestWeekThisQuarter: boolean
    }
  }
}

interface DashboardModuleProps { onNavigate?: (module: string) => void }

const tooltipStyle = {
  borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: '12px', padding: '8px 12px',
}

// ── Trend arrow ──
function TrendArrow({ value }: { value: number }) {
  if (value === 0) return <span className="text-[9px] text-gray-400 font-mono">—</span>
  return (
    <span className={`text-[9px] font-mono font-bold ${value > 0 ? 'text-green-400' : 'text-red-400'}`}>
      {value > 0 ? '↑' : '↓'}{Math.abs(value)}%
    </span>
  )
}

// ── Module Status Board (simplified: name + dot + action) ──
function ModuleStatusBoard({ data, onNavigate }: { data: DashboardData; onNavigate?: (m: string) => void }) {
  type Row = { key: string; name: string; module: string; status: 'critical' | 'warning' | 'active' | 'ok' | 'quiet'; label: string; action: string }

  const rows: Row[] = []

  // Inventory
  if (data.inventory.critical > 0) rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'critical', label: `${data.inventory.critical} out of stock`, action: `Reorder →` })
  else if (data.inventory.low > 0) rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'warning', label: `${data.inventory.low} running low`, action: `Review →` })
  else rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'ok', label: 'All healthy', action: '' })

  // Outbound — pending orders are 'active' (blue), not 'ok' (green)
  if (data.orders.pending > 0) rows.push({ key: 'ob', name: 'Outbound', module: 'outbound', status: 'active', label: `${data.orders.pending} in progress`, action: '' })
  else rows.push({ key: 'ob', name: 'Outbound', module: 'outbound', status: 'quiet', label: 'No active orders', action: '' })

  // Payments — 'ok' only when COD was actually collected AND all banked
  if (data.cod.pendingBankings > 0) rows.push({ key: 'pay', name: 'Payments', module: 'payments', status: 'warning', label: `${formatCurrencyCompact(data.cod.pendingBankings)} unbanked`, action: 'Verify →' })
  else if (data.cod.collectedTotal > 0) rows.push({ key: 'pay', name: 'Payments', module: 'payments', status: 'ok', label: 'All banked', action: '' })
  else rows.push({ key: 'pay', name: 'Payments', module: 'payments', status: 'quiet', label: 'No COD activity', action: '' })

  // Returns
  if (data.exceptionCount > 0) rows.push({ key: 'ret', name: 'Returns', module: 'returns', status: 'critical', label: `${data.exceptionCount} exceptions`, action: 'Process →' })
  else rows.push({ key: 'ret', name: 'Returns', module: 'returns', status: 'ok', label: 'No exceptions', action: '' })

  // Drivers — 'ok' only when there ARE active drivers
  if (data.stats.activeDrivers > 0) rows.push({ key: 'drv', name: 'Drivers', module: 'drivers', status: 'ok', label: `${data.stats.activeDrivers} active`, action: '' })
  else rows.push({ key: 'drv', name: 'Drivers', module: 'drivers', status: 'quiet', label: 'No active drivers', action: '' })

  // Merchants
  const lossMakers = data.merchantProfitability.filter(m => m.net < 0).length
  if (lossMakers > 0) rows.push({ key: 'mch', name: 'Merchants', module: 'merchants', status: 'warning', label: `${lossMakers} at a loss`, action: 'Review →' })
  else if (data.stats.totalMerchants > 0) rows.push({ key: 'mch', name: 'Merchants', module: 'merchants', status: 'ok', label: `${data.stats.totalMerchants} profitable`, action: '' })
  else rows.push({ key: 'mch', name: 'Merchants', module: 'merchants', status: 'quiet', label: 'No merchants', action: '' })

  const order = { critical: 0, warning: 1, active: 2, ok: 3, quiet: 4 }
  rows.sort((a, b) => order[a.status] - order[b.status])

  const dot: Record<string, string> = { critical: 'bg-red-500', warning: 'bg-orange-500', active: 'bg-blue-400', ok: 'bg-green-500', quiet: 'bg-gray-300' }
  const text: Record<string, string> = { critical: 'text-red-700', warning: 'text-orange-700', active: 'text-blue-700', ok: 'text-green-700', quiet: 'text-gray-400' }

  return (
    <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
      <table className="w-full text-xs">
        <tbody>
          {rows.map(r => (
            <tr key={r.key} onClick={() => r.action && onNavigate?.(r.module)} className={`border-b border-gray-50 last:border-0 ${r.action ? 'cursor-pointer hover:bg-gray-50' : ''}`} style={{ height: '36px' }}>
              <td className="px-4 py-2 w-28"><span className="font-semibold text-gray-900">{r.name}</span></td>
              <td className="px-4 py-2 w-40">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot[r.status]}`} />
                  <span className={`text-[11px] font-medium ${text[r.status]}`}>{r.label}</span>
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                {r.action ? <span className="text-[11px] text-[#FF6B35] font-semibold">{r.action}</span> : <span className="text-[11px] text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function DashboardModule({ onNavigate }: DashboardModuleProps = {}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [period, setPeriod] = useState('This Month')
  const [helpOpen, setHelpOpen] = useState(false)
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
      const rows: string[] = []
      const now = new Date()
      // ── Header ──
      rows.push('KWANZA ERP — OPERATIONS DASHBOARD REPORT')
      rows.push(`Generated: ${now.toLocaleString('en-UG')}`)
      rows.push(`Period: ${period}`)
      rows.push(`Report By: ${typeof window !== 'undefined' ? 'System User' : 'System'}`)
      rows.push('')
      rows.push('═'.repeat(60))
      rows.push('')

      // ── Executive Summary ──
      rows.push('1. EXECUTIVE SUMMARY')
      rows.push('-'.repeat(40))
      rows.push(`Total Revenue (Delivered Sales),${data.stats.totalRevenue}`)
      rows.push(`Commission Earned,${data.stats.totalCommission}`)
      rows.push(`Net Profit (Commission - Shrinkage - Returns),${data.stats.netProfit || 0}`)
      rows.push(`Average Order Value,${data.stats.avgOrderValue}`)
      rows.push(`Fulfillment Rate,${data.orders.fulfillmentRate}%`)
      rows.push(`On-Time Rate,${data.onTimeRate}%`)
      rows.push(`Exception Rate,${data.exceptionRate}%`)
      rows.push(`First-Attempt Success Rate,${data.firstAttemptRate || 0}%`)
      rows.push(`Avg Cycle Time (hours),${data.avgCycleTimeHours || 0}`)
      rows.push(`Stock Value,${data.stats.totalStockValue}`)
      rows.push(`Active Merchants,${data.stats.totalMerchants}`)
      rows.push(`Active Products,${data.stats.totalProducts}`)
      rows.push(`Active Drivers,${data.stats.activeDrivers}`)
      rows.push(`Total Customers,${data.stats.totalCustomers}`)
      rows.push('')

      // ── Period Comparison ──
      rows.push('2. PERIOD COMPARISON (vs Last Month)')
      rows.push('-'.repeat(40))
      rows.push(`Revenue Change,${data.comparison.revenueChange}%`)
      rows.push(`Orders Change,${data.comparison.ordersChange}%`)
      rows.push(`Stock Value Change,${data.comparison.stockValueChange}%`)
      rows.push(`Avg Order Value Change,${data.comparison.avgOrderChange}%`)
      rows.push('')

      // ── Order Status ──
      rows.push('3. ORDER STATUS DISTRIBUTION')
      rows.push('-'.repeat(40))
      rows.push('Status,Count')
      rows.push(`Pending,${data.orders.pending}`)
      rows.push(`Dispatched,${data.orders.dispatched}`)
      rows.push(`Delivered,${data.orders.delivered}`)
      ;(data.orderStatusDistribution || []).forEach(s => {
        if (!['pending', 'dispatched', 'delivered'].includes(s.status)) {
          rows.push(`${s.status},${s.count}`)
        }
      })
      rows.push(`Total Orders,${data.orders.total}`)
      rows.push('')

      // ── Inventory Health ──
      rows.push('4. INVENTORY HEALTH')
      rows.push('-'.repeat(40))
      rows.push(`Healthy Products,${data.inventory.healthy}`)
      rows.push(`Low Stock Products,${data.inventory.low}`)
      rows.push(`Critical (Out of Stock),${data.inventory.critical}`)
      rows.push(`Total Stock Units,${data.stats.totalStockUnits}`)
      rows.push(`Total Stock Value,${data.stats.totalStockValue}`)
      rows.push('')

      // ── COD Reconciliation ──
      rows.push('5. COD RECONCILIATION')
      rows.push('-'.repeat(40))
      rows.push(`COD Collected,${data.cod.collectedTotal}`)
      rows.push(`COD Banked,${data.cod.banked}`)
      rows.push(`COD Pending,${data.cod.pendingBankings}`)
      rows.push(`Banking Rate,${data.cod.bankingRate}%`)
      rows.push('')

      // ── Merchant Profitability ──
      rows.push('6. MERCHANT PROFITABILITY')
      rows.push('-'.repeat(40))
      rows.push('Merchant,Delivered Sales,Commission (Our Cut),Shrinkage,Returns,Merchant Net')
      data.merchantProfitability.forEach(m => {
        rows.push(`"${m.name}",${m.revenue},${m.commission},${m.shrinkage},${m.returns},${m.net}`)
      })
      rows.push('')

      // ── Revenue Trend (6 months) ──
      rows.push('7. REVENUE TREND (6 MONTHS)')
      rows.push('-'.repeat(40))
      rows.push('Month,Revenue,Commission')
      data.revenueByMonth.forEach(m => {
        rows.push(`${m.month},${m.revenue},${m.commissions}`)
      })
      rows.push('')

      // ── Shrinkage Summary ──
      rows.push('8. SHRINKAGE SUMMARY')
      rows.push('-'.repeat(40))
      rows.push(`Total Shrinkage Qty,${data.shrinkage?.totalQty || 0}`)
      rows.push(`Total Shrinkage Value,${data.stats.totalShrinkageValue || 0}`)
      rows.push('Reason,Qty,Count')
      ;(data.shrinkage?.byReason || []).forEach(s => {
        rows.push(`${s.reason},${s.qty},${s.count}`)
      })
      rows.push('')

      // ── System Status ──
      rows.push('9. SYSTEM STATUS')
      rows.push('-'.repeat(40))
      rows.push('Module,Status,Label')
      if (data.inventory.critical > 0) rows.push(`Inventory,Critical,${data.inventory.critical} out of stock`)
      else if (data.inventory.low > 0) rows.push(`Inventory,Warning,${data.inventory.low} running low`)
      else rows.push('Inventory,OK,All healthy')
      if (data.orders.pending > 0) rows.push(`Outbound,Active,${data.orders.pending} in progress`)
      else rows.push('Outbound,Quiet,No active orders')
      if (data.cod.pendingBankings > 0) rows.push(`Payments,Warning,${data.cod.pendingBankings} unbanked`)
      else rows.push('Payments,OK,All banked')
      if (data.exceptionCount > 0) rows.push(`Returns,Critical,${data.exceptionCount} exceptions`)
      else rows.push('Returns,OK,No exceptions')
      rows.push(`Drivers,${data.stats.activeDrivers > 0 ? 'OK' : 'Quiet'},${data.stats.activeDrivers} active`)
      rows.push('')

      rows.push('═'.repeat(60))
      rows.push('End of Report')
      rows.push(`This report was generated by Kwanza ERP on ${now.toLocaleString('en-UG')}`)

      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kwanza-dashboard-${period.replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`
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

  // Use net profit from API (commission - shrinkage - returns = our earnings)
  const totalNet = data.stats.netProfit || 0

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <p className="text-[11px] text-gray-500">Auto-refresh 30s</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
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
                    <button key={p} onClick={() => { setPeriod(p); setShowPeriodMenu(false) }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${p === period ? 'bg-[#FF6B35] text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {p}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md"><HelpCircle size={12} className="mr-1" /> Help</Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="h-7 text-xs rounded-md"><Download size={12} className="mr-1" /> {exporting ? 'Exporting...' : 'Export'}</Button>
        </div>
      </div>

      {/* ── Number strip (strategic metrics, different from Operations Desk) ── */}
      <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
        {[
          { label: 'REVENUE', value: formatCurrencyCompact(data.stats.totalRevenue), trend: data.comparison.revenueChange },
          { label: 'NET PROFIT', value: formatCurrencyCompact(totalNet), trend: data.comparison.revenueChange },
          { label: 'AVG ORDER', value: formatCurrencyCompact(data.stats.avgOrderValue), trend: data.comparison.avgOrderChange },
          { label: 'FULFILLMENT', value: `${data.orders.fulfillmentRate}%`, trend: null },
          { label: 'STOCK VALUE', value: formatCurrencyCompact(data.stats.totalStockValue), trend: data.comparison.stockValueChange },
          { label: 'MERCHANTS', value: String(data.stats.totalMerchants), trend: null },
        ].map((c, i) => (
          <div key={c.label} className={`flex-1 px-3 py-2 flex flex-col justify-center border-r border-white/10 ${i === 5 ? 'border-r-0' : ''}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-blue-200/60 uppercase tracking-wider font-medium">{c.label}</span>
              {c.trend !== null && <TrendArrow value={c.trend} />}
            </div>
            <span className="font-mono font-bold text-base tabular-nums">{c.value}</span>
          </div>
        ))}
      </div>

      {/* ── System Status ── */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 block">System Status</span>
        <ModuleStatusBoard data={data} onNavigate={onNavigate} />
      </div>

      {/* ── Inventory Health Gauge + COD Reconciliation Bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Inventory health gauge */}
        {(() => {
          const total = data.inventory.healthy + data.inventory.low + data.inventory.critical
          const healthyPct = total > 0 ? (data.inventory.healthy / total) * 100 : 100
          const lowPct = total > 0 ? (data.inventory.low / total) * 100 : 0
          const critPct = total > 0 ? (data.inventory.critical / total) * 100 : 0
          const isCrisis = data.inventory.critical > 0 && (data.inventory.critical / Math.max(total, 1)) > 0.1
          return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Inventory Health</span>
                <span className={`text-[10px] font-bold ${isCrisis ? 'text-red-600' : data.inventory.critical > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {isCrisis ? 'CRITICAL' : data.inventory.critical > 0 ? 'AT RISK' : 'HEALTHY'}
                </span>
              </div>
              {/* Stacked bar */}
              <div className="h-6 rounded-lg overflow-hidden flex bg-gray-100">
                {healthyPct > 0 && <div className="bg-green-500 flex items-center justify-center" style={{ width: `${healthyPct}%` }} title={`${data.inventory.healthy} healthy`}>{healthyPct > 15 && <span className="text-[9px] text-white font-mono font-bold">{data.inventory.healthy}</span>}</div>}
                {lowPct > 0 && <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${lowPct}%` }} title={`${data.inventory.low} low`}>{lowPct > 10 && <span className="text-[9px] text-white font-mono font-bold">{data.inventory.low}</span>}</div>}
                {critPct > 0 && <div className="bg-red-500 flex items-center justify-center" style={{ width: `${critPct}%` }} title={`${data.inventory.critical} critical`}>{critPct > 5 && <span className="text-[9px] text-white font-mono font-bold">{data.inventory.critical}</span>}</div>}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{data.inventory.healthy} healthy</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{data.inventory.low} low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{data.inventory.critical} critical</span>
                <span className="ml-auto text-gray-400 font-mono">{total} total SKUs</span>
              </div>
            </div>
          )
        })()}

        {/* COD reconciliation progress bar */}
        {(() => {
          const collected = data.cod.collectedTotal || 0
          const banked = data.cod.banked || 0
          const pending = data.cod.pendingBankings || 0
          const bankedPct = collected > 0 ? Math.round((banked / collected) * 100) : 0
          const pendingPct = collected > 0 ? 100 - bankedPct : 0
          const isGood = bankedPct >= 90
          const isWarning = bankedPct >= 70 && bankedPct < 90
          return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">COD Reconciliation</span>
                <span className={`text-[10px] font-bold ${isGood ? 'text-green-600' : isWarning ? 'text-amber-600' : 'text-red-600'}`}>
                  {bankedPct}% banked
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-6 rounded-lg overflow-hidden flex bg-gray-100">
                <div className={`flex items-center justify-center ${isGood ? 'bg-green-500' : isWarning ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${bankedPct}%` }} title={`${formatCurrencyCompact(banked)} banked`}>
                  {bankedPct > 20 && <span className="text-[9px] text-white font-mono font-bold">{formatCurrencyCompact(banked)}</span>}
                </div>
                {pendingPct > 0 && <div className="bg-gray-300 flex items-center justify-center" style={{ width: `${pendingPct}%` }} title={`${formatCurrencyCompact(pending)} pending`}>
                  {pendingPct > 15 && <span className="text-[9px] text-gray-600 font-mono font-bold">{formatCurrencyCompact(pending)}</span>}
                </div>}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Banked: {formatCurrencyCompact(banked)}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" />Pending: {formatCurrencyCompact(pending)}</span>
                <span className="ml-auto text-gray-400 font-mono">Collected: {formatCurrencyCompact(collected)}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Streaks (single line) ── */}
      {data.pulse?.streaks && (
        <div className="flex items-center gap-4 text-[11px] text-gray-600 px-1">
          <Flame size={12} className="text-orange-400 shrink-0" />
          {data.pulse.streaks.daysWithoutStockout > 0 && data.pulse.streaks.stockoutStreakHasData && (
            <span className="text-green-700 font-medium"><span className="font-mono font-bold">{data.pulse.streaks.daysWithoutStockout}d</span> no stockout</span>
          )}
          {data.pulse.streaks.hoursSinceLastFailure > 0 && (
            <span className="text-green-700 font-medium"><span className="font-mono font-bold">{data.pulse.streaks.hoursSinceLastFailure}h</span> no failed delivery</span>
          )}
          {data.pulse.streaks.isBestWeekThisQuarter && (
            <span className="text-green-700 font-medium">Best week this quarter</span>
          )}
          {data.pulse.streaks.daysWithoutStockout === 0 && data.pulse.streaks.hoursSinceLastFailure === 0 && !data.pulse.streaks.isBestWeekThisQuarter && (
            <span className="text-gray-400 italic">No active streaks</span>
          )}
        </div>
      )}

      {/* ── Revenue trend (single chart, no toggle) ── */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 block">Revenue Trend</span>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <ResponsiveContainer width="100%" height={180}>
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
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => { const abs = Math.abs(v); if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`; if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`; return String(abs) }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
              <Area type="monotone" dataKey="commissions" stroke="#1B2A4A" strokeWidth={2} fill="url(#commGrad)" name="Commission" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Merchant Profitability (top 5 by net) ── */}
      {data.merchantProfitability.length > 0 && (() => {
        const sorted = [...data.merchantProfitability].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 5)
        const maxAbs = Math.max(...sorted.map(m => Math.abs(m.net)), 1)
        return (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 block">Top Merchants by Net Profit</span>
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
              {sorted.map((m, i) => {
                const isProfit = m.net >= 0
                const barPct = Math.min(100, (Math.abs(m.net) / maxAbs) * 100)
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-700 w-32 truncate shrink-0">{m.name}</span>
                    <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden relative">
                      <div
                        className={`h-full rounded ${isProfit ? 'bg-green-400' : 'bg-red-400'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono font-bold w-24 text-right shrink-0 ${isProfit ? 'text-green-700' : 'text-red-600'}`}>
                      {isProfit ? '+' : ''}{formatCurrencyCompact(m.net)}
                    </span>
                  </div>
                )
              })}
              <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                Showing top {sorted.length} of {data.merchantProfitability.length} merchants · {data.merchantProfitability.filter(m => m.net < 0).length} at a loss
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Help Dialog (terse, professional) ── */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Dashboard</AlertDialogTitle>
            <AlertDialogDescription>
              Strategic overview of your warehouse operation. Change the time range using the period selector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Number Strip</p>
              <p>Six metrics: revenue, net profit, average order value, fulfillment rate, stock value, active merchants. Arrows show change vs last period.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">System Status</p>
              <p>One row per module with a status indicator. Click any row with an action link to jump to that module.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Inventory Health</p>
              <p>Stacked bar showing the proportion of healthy, low, and critical stock. Label changes from HEALTHY to AT RISK to CRITICAL based on critical count.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">COD Reconciliation</p>
              <p>Progress bar showing what percentage of collected COD cash has been banked. Green (90%+), amber (70-89%), red (below 70%).</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Streaks</p>
              <p>Positive trends: days without stockout, hours since last failed delivery, best week this quarter.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Revenue Trend</p>
              <p>Six-month area chart showing monthly revenue and commission. Orange is revenue, navy is commission earned.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Top Merchants by Net Profit</p>
              <p>Horizontal bars showing the top 5 merchants by net profit magnitude. Green bars are profitable, red bars are loss-making. Footer shows total merchant count and how many are at a loss.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Export</p>
              <p>Download all metrics as CSV for reporting or external sharing.</p>
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
