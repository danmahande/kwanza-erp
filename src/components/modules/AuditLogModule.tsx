'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ClipboardList, HelpCircle, Download, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import { format } from 'date-fns'

interface AuditLog {
  id: string
  userId: string | null
  userName: string | null
  action: string
  module: string
  entityId: string | null
  details: string | null
  createdAt: string
}

interface ApiResponse {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const MODULES = [
  'all', 'outbound', 'inbound', 'inventory', 'payments', 'driver_banking',
  'after_sales', 'rtv', 'shrinkage', 'risk', 'drivers', 'customers',
  'users', 'settings', 'system', 'merchants', 'charges', 'disputes',
  'statements', 'order_processing', 'driver-communication', 'merchant-communication',
]

const ACTIONS = [
  'all', 'CREATE', 'CREATED', 'UPDATE', 'UPDATED', 'DELETE', 'DELETED',
  'APPROVE', 'APPROVED', 'REJECT', 'REJECTED', 'STATUS_CHANGE',
  'BLOCK', 'SCAN_ADVANCE', 'BULK_STATUS_CHANGE', 'DAY_CLOSED',
  'RISK_OVERRIDE', 'BLOCKLIST_ADD', 'BLOCKLIST_REMOVE',
]

export default function AuditLogModule() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(100)
  const [helpOpen, setHelpOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (moduleFilter !== 'all') params.set('module', moduleFilter)
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/audit-log?${params}`)
      const d = await res.json()
      setData(d)
    } catch {
      toast.error('Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [search, moduleFilter, actionFilter, fromDate, toDate, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, moduleFilter, actionFilter, fromDate, toDate])

  const handleExport = async () => {
    try {
      toast.info('Generating CSV export...')
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (moduleFilter !== 'all') params.set('module', moduleFilter)
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      params.set('export', 'csv')

      const res = await fetch(`/api/audit-log?${params}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Export failed')
    }
  }

  const handleClearFilters = () => {
    setSearch('')
    setModuleFilter('all')
    setActionFilter('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const hasFilters = search || moduleFilter !== 'all' || actionFilter !== 'all' || fromDate || toDate

  const actionColor = (action: string) => {
    const a = action.toUpperCase()
    if (a.includes('CREATE')) return 'bg-green-100 text-green-700 border-0'
    if (a.includes('UPDATE') || a.includes('APPROVE')) return 'bg-blue-100 text-blue-700 border-0'
    if (a.includes('DELETE') || a.includes('REJECT')) return 'bg-red-100 text-red-700 border-0'
    if (a.includes('STATUS') || a.includes('SCAN') || a.includes('BULK')) return 'bg-purple-100 text-purple-700 border-0'
    if (a.includes('BLOCK') || a.includes('RISK')) return 'bg-amber-100 text-amber-700 border-0'
    if (a.includes('DAY_CLOSED')) return 'bg-cyan-100 text-cyan-700 border-0'
    return 'bg-gray-100 text-gray-700 border-0'
  }

  const moduleColor = (mod: string) => {
    const colors: Record<string, string> = {
      payments: 'bg-green-50 text-green-700',
      outbound: 'bg-orange-50 text-orange-700',
      inbound: 'bg-blue-50 text-blue-700',
      risk: 'bg-red-50 text-red-700',
      drivers: 'bg-cyan-50 text-cyan-700',
      users: 'bg-purple-50 text-purple-700',
      system: 'bg-gray-100 text-gray-600',
    }
    return colors[mod] || 'bg-gray-50 text-gray-700'
  }

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 0
  const currentPage = data?.page || 1

  return (
    <div className="space-y-3">
      <OpsHeader
        title="Audit Log"
        description="Every state change recorded — for compliance and dispute resolution"
        kpiCells={[
          { label: 'TOTAL ENTRIES', value: total },
          { label: 'CURRENT PAGE', value: `${currentPage}/${totalPages || 1}` },
          { label: 'PAGE SIZE', value: pageSize },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={() => fetchData()}
        searchPlaceholder="Search by action, user, or details..."
      >
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md">
          <HelpCircle size={12} className="mr-1" /> How does this work?
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-xs rounded-md">
          <Download size={12} className="mr-1" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={fetchData} className="h-7 text-xs rounded-md">
          <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </OpsHeader>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-lg border border-gray-200 px-3 py-2">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Filter size={12} /> Filters:
        </div>
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs h-7"
        >
          {MODULES.map(m => <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>)}
        </select>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs h-7"
        >
          {ACTIONS.map(a => <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>)}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs h-7"
          title="From date"
        />
        <span className="text-gray-400 text-xs">→</span>
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs h-7"
          title="To date"
        />
        {hasFilters && (
          <button onClick={handleClearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium ml-2">
            Clear all
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Table */}
      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ClipboardList size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No audit log entries</p>
          <p className="text-sm text-gray-400 mt-1">
            {hasFilters ? 'No entries match your filters. Try clearing them.' : 'Audit entries appear here as users perform actions across the system.'}
          </p>
        </div>
      ) : !loading && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left px-3 py-2 font-semibold">Timestamp</th>
                    <th className="text-left px-3 py-2 font-semibold">User</th>
                    <th className="text-left px-3 py-2 font-semibold">Module</th>
                    <th className="text-left px-3 py-2 font-semibold">Action</th>
                    <th className="text-left px-3 py-2 font-semibold">Entity</th>
                    <th className="text-left px-3 py-2 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap text-[10px]">
                        {format(new Date(l.createdAt), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{l.userName || l.userId || 'system'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${moduleColor(l.module)}`}>
                          {l.module}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${actionColor(l.action)}`}>
                          {l.action}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-600 text-[10px]">{l.entityId || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-md truncate" title={l.details || ''}>{l.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total.toLocaleString()} entries
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-3 text-xs font-mono text-gray-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Audit Log Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Audit Log is the system's permanent record of every significant action. Every create, update, delete, approval, rejection, status change, and configuration change is written here — who did it, when, what module, what entity, and what changed. This is your compliance trail, your dispute resolver, and your "who pressed the button" investigation tool.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> In a warehouse system that handles money, inventory, and customer data, accountability is non-negotiable. When a merchant disputes a charge, when stock goes missing, when a user's role changes, when a payment is reversed — the audit log tells you exactly what happened, who did it, and when. Without it, every dispute becomes a "he said, she said" with no evidence. With it, you have a timestamped, tamper-evident record that holds everyone accountable.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>1. Search.</strong> Type in the search bar to find entries by action, user name, entity ID, or details. Press Enter or click the search icon.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>2. Filter.</strong> Use the dropdowns to filter by module (payments, outbound, inventory, etc.) and action type (CREATE, DELETE, APPROVE, etc.). Use the date pickers to narrow to a specific time range. Multiple filters combine (AND logic).
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>3. Paginate.</strong> The log shows 100 entries per page. Use the pagination controls (first, previous, page number, next, last) to navigate. The total count shows how many entries match your filters.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>4. Export.</strong> Click "Export CSV" to download all matching entries as a CSV file. The export respects your current filters. Useful for compliance audits, external investigations, or sharing with a merchant who disputes a charge.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>5. Investigate.</strong> Hover over truncated details to see the full text. The details column records exactly what changed — field-level diffs for updates, amounts for payments, statuses for workflow transitions.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most ERP systems have audit logging as an afterthought — a debug table that nobody reads, with no filtering, no pagination, and no export. This module makes the audit log a first-class investigative tool. Every mutation across every module writes to it. Every entry has who, when, what module, what entity, and what changed. You can filter by any combination of module, action, user, and date range. You can export to CSV for external review. And the log is append-only — entries can never be edited or deleted through the API, making it tamper-evident for compliance.
              </p>
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

// Button import needed for OpsHeader children
import { Button } from '@/components/ui/button'
