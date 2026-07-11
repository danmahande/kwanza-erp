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
  }
  inventory: { healthy: number; low: number; critical: number }
  orders: { total: number; pending: number; dispatched: number; delivered: number; fulfillmentRate: number }
  cod: { collectedTotal: number; banked: number; pendingBankings: number; bankingRate: number }
  comparison: { revenueChange: number; ordersChange: number; stockValueChange: number; avgOrderChange: number }
  onTimeRate: number
  exceptionCount: number
  exceptionRate: number
  revenueByMonth: Array<{ month: string; revenue: number; commissions: number }>
  merchantProfitability: Array<{ name: string; revenue: number; commission: number; shrinkage: number; returns: number; net: number }>
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
  type Row = { key: string; name: string; module: string; status: 'critical' | 'warning' | 'ok' | 'quiet'; label: string; action: string }

  const rows: Row[] = []

  // Inventory
  if (data.inventory.critical > 0) rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'critical', label: `${data.inventory.critical} out of stock`, action: `Reorder →` })
  else if (data.inventory.low > 0) rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'warning', label: `${data.inventory.low} running low`, action: `Review →` })
  else rows.push({ key: 'inv', name: 'Inventory', module: 'inventory', status: 'ok', label: 'All healthy', action: '' })

  // Outbound
  rows.push({ key: 'ob', name: 'Outbound', module: 'outbound', status: data.orders.pending > 0 ? 'ok' : 'quiet', label: data.orders.pending > 0 ? `${data.orders.pending} pending` : 'No active orders', action: '' })

  // Payments
  if (data.cod.pendingBankings > 0) rows.push({ key: 'pay', name: 'Payments', module: 'payments', status: 'warning', label: `${formatCurrencyCompact(data.cod.pendingBankings)} pending`, action: 'Verify →' })
  else rows.push({ key: 'pay', name: 'Payments', module: 'payments', status: 'ok', label: 'All banked', action: '' })

  // Returns
  if (data.exceptionCount > 0) rows.push({ key: 'ret', name: 'Returns', module: 'returns', status: 'critical', label: `${data.exceptionCount} exceptions`, action: 'Process →' })
  else rows.push({ key: 'ret', name: 'Returns', module: 'returns', status: 'ok', label: 'All clear', action: '' })

  // Drivers
  rows.push({ key: 'drv', name: 'Drivers', module: 'drivers', status: 'ok', label: `${data.stats.activeDrivers} active`, action: '' })

  // Merchants
  const lossMakers = data.merchantProfitability.filter(m => m.net < 0).length
  if (lossMakers > 0) rows.push({ key: 'mch', name: 'Merchants', module: 'merchants', status: 'warning', label: `${lossMakers} at a loss`, action: 'Review →' })
  else rows.push({ key: 'mch', name: 'Merchants', module: 'merchants', status: 'ok', label: 'All profitable', action: '' })

  const order = { critical: 0, warning: 1, ok: 2, quiet: 3 }
  rows.sort((a, b) => order[a.status] - order[b.status])

  const dot: Record<string, string> = { critical: 'bg-red-500', warning: 'bg-orange-500', ok: 'bg-green-500', quiet: 'bg-gray-300' }
  const text: Record<string, string> = { critical: 'text-red-700', warning: 'text-orange-700', ok: 'text-green-700', quiet: 'text-gray-400' }

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
      rows.push('Kwanza ERP, Dashboard Export')
      rows.push(`Period: ${period}`)
      rows.push(`Generated: ${new Date().toLocaleString('en-UG')}`)
      rows.push('')
      rows.push('KPI Summary')
      rows.push(`Revenue,${data.stats.totalRevenue}`)
      rows.push(`Commission,${data.stats.totalCommission}`)
      rows.push(`Orders,${data.orders.total}`)
      rows.push(`Delivered,${data.orders.delivered}`)
      rows.push(`Fulfillment Rate,${data.orders.fulfillmentRate}%`)
      rows.push(`On-Time Rate,${data.onTimeRate}%`)
      rows.push(`Avg Order Value,${data.stats.avgOrderValue}`)
      rows.push(`Stock Value,${data.stats.totalStockValue}`)
      rows.push(`Active Merchants,${data.stats.totalMerchants}`)
      rows.push(`COD Collected,${data.cod.collectedTotal}`)
      rows.push(`COD Pending,${data.cod.pendingBankings}`)
      rows.push(`Exceptions,${data.exceptionCount}`)
      rows.push('')
      rows.push('Merchant Profitability')
      rows.push('Merchant,Revenue,Commission,Shrinkage,Returns,Net')
      data.merchantProfitability.forEach(m => {
        rows.push(`${m.name},${m.revenue},${m.commission},${m.shrinkage},${m.returns},${m.net}`)
      })
      rows.push('')
      rows.push('Revenue by Month')
      rows.push('Month,Revenue,Commission')
      data.revenueByMonth.forEach(m => {
        rows.push(`${m.month},${m.revenue},${m.commissions}`)
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

  // Calculate net profit from merchant profitability
  const totalNet = data.merchantProfitability.reduce((s, m) => s + m.net, 0)

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

      {/* ── Module health (simplified: name + dot + action) ── */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 block">Module Health</span>
        <ModuleStatusBoard data={data} onNavigate={onNavigate} />
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
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrencyCompact(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
              <Area type="monotone" dataKey="commissions" stroke="#1B2A4A" strokeWidth={2} fill="url(#commGrad)" name="Commission" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Help Dialog (terse, professional) ── */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Dashboard</AlertDialogTitle>
            <AlertDialogDescription>
              Strategic overview of your warehouse operation. Use the period selector to change the time range.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Number Strip</p>
              <p>Six metrics: revenue, net profit, average order value, fulfillment rate, stock value, active merchants. Arrows show change vs last period.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Module Health</p>
              <p>One row per module with a status indicator. Click any row with an action link to jump to that module.</p>
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
