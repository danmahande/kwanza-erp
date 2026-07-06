'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCw, Plus, Search } from 'lucide-react'
import { ReactNode } from 'react'

/**
 * Shared Operations Console UI components
 *
 * These components enforce the operations-console aesthetic across all modules:
 * - Dark navy KPI ribbons (not card grids)
 * - Dense tables with 32px rows
 * - Status pills (colored dot + 2-letter code)
 * - Row tints by status
 * - Monospace tabular numbers
 *
 * Used by: HubTodayModule, MerchantsModule, OutboundModule, OrderProcessingModule,
 * PaymentsModule, ProductsModule, DriversModule, AfterSalesModule, RTVModule,
 * ShrinkageModule, InboundModule, DashboardModule.
 */

// ── Status Pill: colored dot + 2-letter code ──
// Compact, scannable. Replaces padded word-badges.
const STATUS_MAP: Record<string, { dot: string; code: string; label: string }> = {
  // outbound
  pending:     { dot: 'bg-gray-400',   code: 'PD', label: 'Pending' },
  picking:     { dot: 'bg-blue-500',   code: 'PK', label: 'Picking' },
  picked:      { dot: 'bg-blue-600',   code: 'PC', label: 'Picked' },
  packing:     { dot: 'bg-orange-500', code: 'PG', label: 'Packing' },
  packed:      { dot: 'bg-orange-600', code: 'PD', label: 'Packed' },
  dispatched:  { dot: 'bg-cyan-500',   code: 'DP', label: 'Dispatched' },
  delivered:   { dot: 'bg-green-600',  code: 'DL', label: 'Delivered' },
  failed:      { dot: 'bg-red-500',    code: 'FL', label: 'Failed' },
  returned:    { dot: 'bg-red-600',    code: 'RT', label: 'Returned' },
  cancelled:   { dot: 'bg-gray-500',   code: 'CL', label: 'Cancelled' },
  // inbound
  received:    { dot: 'bg-blue-500',   code: 'RC', label: 'Received' },
  put_away:    { dot: 'bg-yellow-500', code: 'PA', label: 'Put Away' },
  stored:      { dot: 'bg-green-600',  code: 'ST', label: 'Stored' },
  // rma / after-sales
  initiated:   { dot: 'bg-blue-400',   code: 'IN', label: 'Initiated' },
  received_rma:{ dot: 'bg-blue-500',   code: 'RC', label: 'Received' },
  in_review:   { dot: 'bg-yellow-500', code: 'RV', label: 'In Review' },
  approved:    { dot: 'bg-green-500',  code: 'AP', label: 'Approved' },
  rejected:    { dot: 'bg-red-500',    code: 'RJ', label: 'Rejected' },
  processed:   { dot: 'bg-green-600',  code: 'PR', label: 'Processed' },
  // rtv
  pending_approval: { dot: 'bg-yellow-500', code: 'PA', label: 'Pending Approval' },
  // shrinkage
  investigating: { dot: 'bg-yellow-500', code: 'IV', label: 'Investigating' },
  resolved:    { dot: 'bg-green-600',  code: 'RS', label: 'Resolved' },
  // driver banking
  verified:    { dot: 'bg-green-600',  code: 'VR', label: 'Verified' },
  shortfall:   { dot: 'bg-red-500',    code: 'SF', label: 'Shortfall' },
  disputed:    { dot: 'bg-orange-500', code: 'DS', label: 'Disputed' },
  // payments
  draft:       { dot: 'bg-gray-400',   code: 'DR', label: 'Draft' },
  submitted:   { dot: 'bg-blue-500',   code: 'SB', label: 'Submitted' },
  disbursed:   { dot: 'bg-green-600',  code: 'DB', label: 'Disbursed' },
  // statements
  issued:      { dot: 'bg-blue-500',   code: 'IS', label: 'Issued' },
  paid:        { dot: 'bg-green-600',  code: 'PD', label: 'Paid' },
}

export function StatusPill({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const s = STATUS_MAP[status] || { dot: 'bg-gray-400', code: '??', label: status }
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${textSize} font-semibold text-gray-700`} title={s.label}>
      <span className={`${dotSize} rounded-full ${s.dot}`} />
      {s.code}
    </span>
  )
}

// ── Row tint based on status ──
// Color encodes state. Green=success, red=exception, yellow=warning, blue=active, gray=idle.
export function rowTint(status: string): string {
  if (['delivered', 'stored', 'processed', 'verified', 'disbursed', 'paid', 'resolved'].includes(status)) return 'bg-green-50/40'
  if (['dispatched'].includes(status)) return 'bg-cyan-50/40'
  if (['failed', 'returned', 'rejected', 'cancelled', 'shortfall', 'disputed'].includes(status)) return 'bg-red-50/40'
  if (['packed', 'put_away', 'in_review', 'pending_approval', 'investigating', 'issued', 'submitted'].includes(status)) return 'bg-orange-50/40'
  if (['picking', 'packing', 'received', 'initiated', 'picking', 'approved'].includes(status)) return 'bg-blue-50/40'
  return ''
}

// ── KPI Ribbon ──
// Single dense horizontal bar. Replaces 3-4 card stats. Dark navy, white tabular numbers.
// Supports optional trend arrows (↑/↓ with % change).
export function KpiRibbon({ cells }: { cells: Array<{ label: string; value: string | number; highlight?: boolean; highlightColor?: 'red' | 'green' | 'orange'; trend?: number; trendLabel?: string }> }) {
  return (
    <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
      {cells.map((c, i) => {
        const bg = c.highlight
          ? c.highlightColor === 'green' ? 'bg-green-500/20'
          : c.highlightColor === 'orange' ? 'bg-orange-500/20'
          : 'bg-red-500/20'
          : ''
        const trendUp = (c.trend ?? 0) >= 0
        return (
          <div
            key={c.label}
            className={`flex-1 px-3 py-2 flex flex-col justify-center border-r border-white/10 ${bg} ${i === cells.length - 1 ? 'border-r-0' : ''} min-w-0`}
          >
            <span className="text-[9px] text-blue-200/60 uppercase tracking-wider font-medium truncate">{c.label}</span>
            <div className="flex items-baseline gap-1">
              <span className="font-mono font-bold text-base tabular-nums truncate">{c.value}</span>
              {c.trend !== undefined && (
                <span className={`text-[9px] font-mono ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
                  {trendUp ? '↑' : '↓'}{Math.abs(c.trend)}%
                </span>
              )}
            </div>
            {c.trendLabel && <span className="text-[8px] text-blue-200/40 truncate">{c.trendLabel}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── OpsHeader ──
// Replaces OfficeHeader. Dark title bar + KPI ribbon + action bar (search + buttons).
// No icons, no gradients, no card stats. Just the work.
interface OpsHeaderProps {
  title: string
  description?: string
  kpiCells?: Array<{ label: string; value: string | number; highlight?: boolean; highlightColor?: 'red' | 'green' | 'orange' }>
  searchValue?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}

export function OpsHeader({
  title, description, kpiCells, searchValue, onSearchChange, searchPlaceholder,
  actionLabel, onAction, children,
}: OpsHeaderProps) {
  return (
    <div className="space-y-2">
      {/* Title bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
          {description && <p className="text-[11px] text-gray-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {children}
          {actionLabel && onAction && (
            <Button size="sm" onClick={onAction} className="h-7 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white">
              <Plus size={12} className="mr-1" /> {actionLabel}
            </Button>
          )}
        </div>
      </div>

      {/* KPI ribbon */}
      {kpiCells && kpiCells.length > 0 && <KpiRibbon cells={kpiCells} />}

      {/* Search bar */}
      {(searchValue !== undefined || onSearchChange) && (
        <div className="relative max-w-md">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={searchPlaceholder || 'Search...'}
            value={searchValue || ''}
            onChange={e => onSearchChange?.(e.target.value)}
            className="pl-7 h-8 text-xs rounded-md"
          />
        </div>
      )}
    </div>
  )
}

// ── Dense Table wrapper ──
// Enforces 32px row height, tight columns, monospace numbers.
export function DenseTable({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          {children}
        </table>
      </div>
    </div>
  )
}

export function DenseTh({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`text-left px-3 py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[10px] bg-gray-50 border-b border-gray-200 ${className}`}>
      {children}
    </th>
  )
}

export function DenseTd({ children, className = '', mono = false, right = false }: { children?: ReactNode; className?: string; mono?: boolean; right?: boolean }) {
  return (
    <td className={`px-3 py-1 ${mono ? 'font-mono tabular-nums' : ''} ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  )
}

export function DenseTr({
  children, onClick, tint = '', selected = false, style,
}: {
  children: ReactNode
  onClick?: () => void
  tint?: string
  selected?: boolean
  style?: React.CSSProperties
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${tint} ${selected ? 'bg-orange-50' : ''}`}
      style={{ height: '32px', ...style }}
    >
      {children}
    </tr>
  )
}

// ── Mini-table for right rails ──
// Compact 28px rows, used for side panels (Riders, COD, Exceptions).
export function MiniTable({
  title, count, headers, rows, accent = 'gray',
}: {
  title: string
  count?: string | number
  headers: string[]
  rows: Array<Array<ReactNode>>
  accent?: 'gray' | 'red' | 'orange' | 'green'
}) {
  const accentClass = {
    gray: 'border-gray-200',
    red: 'border-red-200',
    orange: 'border-orange-200',
    green: 'border-green-200',
  }[accent]
  const headerBg = {
    gray: 'bg-gray-50',
    red: 'bg-red-50',
    orange: 'bg-orange-50',
    green: 'bg-green-50',
  }[accent]
  const headerText = {
    gray: 'text-gray-700',
    red: 'text-red-700',
    orange: 'text-orange-700',
    green: 'text-green-700',
  }[accent]

  return (
    <div className={`bg-white rounded-lg border ${accentClass} overflow-hidden`}>
      <div className={`px-3 py-2 border-b border-gray-100 ${headerBg} flex items-center justify-between`}>
        <span className={`text-[11px] font-semibold ${headerText} uppercase tracking-wider`}>{title}</span>
        {count !== undefined && <span className="text-[11px] text-gray-500 font-mono">{count}</span>}
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-400 text-[9px] uppercase">
            {headers.map((h, i) => (
              <th key={i} className={`px-3 py-1 font-semibold ${i === headers.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-3 text-center text-gray-400">No items</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-50 hover:bg-gray-50" style={{ height: '28px' }}>
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-1 ${j === row.length - 1 ? 'text-right font-mono tabular-nums' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
