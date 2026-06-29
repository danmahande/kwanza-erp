'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ArrowUpRight, Search, Download, AlertTriangle, ChevronDown, ChevronRight,
  Boxes, ClipboardList, FileText, Layers, CheckCircle2, X, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import {
  WorkflowActions, NextStepBanner, StatusStepper, WorkflowStatusBadge,
} from '@/components/shared/workflow'
import { getMainStages, getStage } from '@/lib/workflow'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const MODULE = 'outbound'

interface OutboundRecord {
  id: string
  outboundId: string
  orderNumber: string | null
  trackingNumber: string | null
  customerName: string
  customerContact: string
  customerEmail: string | null
  customerAddress: string | null
  productName: string
  productId: string
  brand: string | null
  variant: string | null
  qty: number
  unitSellingPrice: number | null
  saleAmount: number | null
  codCollected: number | null
  status: string
  assignedDriver: string | null
  runsheetId: string | null
  deliveryNotes: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

const FILTER_CHIPS = [
  { key: 'all', label: 'All', statuses: [] as string[] },
  { key: 'ready_to_pick', label: 'Ready to Pick', statuses: ['pending'] },
  { key: 'picking', label: 'Picking', statuses: ['picking'] },
  { key: 'picked', label: 'Picked, Ready to Pack', statuses: ['picked'] },
  { key: 'packing', label: 'Packing', statuses: ['packing'] },
  { key: 'packed', label: 'Packed, Ready to Dispatch', statuses: ['packed'] },
  { key: 'dispatched', label: 'Dispatched', statuses: ['dispatched'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { key: 'exceptions', label: '⚠️ Exceptions', statuses: ['cancelled', 'returned', 'failed'] },
]

export default function OutboundModule() {
  const [data, setData] = useState<OutboundRecord[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewing, setViewing] = useState<OutboundRecord | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [exceptionRecord, setExceptionRecord] = useState<OutboundRecord | null>(null)
  const [exceptionForm, setExceptionForm] = useState({ type: 'damaged', notes: '', qty: '1' })

  const fetchData = useCallback(() => {
    fetch(`/api/outbound?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredData = activeFilter === 'all'
    ? data
    : data.filter(r => {
        const chip = FILTER_CHIPS.find(c => c.key === activeFilter)
        return chip?.statuses.includes(r.status)
      })

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRows)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedRows(next)
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredData.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredData.map(r => r.id)))
  }

  const handleTransition = async (record: OutboundRecord, toStatus: string) => {
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: MODULE,
          id: record.id,
          toStatus,
          performedBy: 'admin',
        }),
      })
      if (res.ok) {
        const stage = getStage(MODULE, toStatus)
        toast.success(`${stage?.label || toStatus} ✓`)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleBulkTransition = async (toStatus: string) => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one record first')
      return
    }
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: MODULE,
          ids: Array.from(selectedIds),
          toStatus,
          performedBy: 'admin',
        }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`${result.count} records transitioned to ${toStatus}`)
        setSelectedIds(new Set())
        fetchData()
      } else {
        toast.error(result.error || 'Failed to bulk update')
      }
    } catch {
      toast.error('Failed to bulk update')
    }
  }

  const handlePrintPickList = async (singleRecord?: OutboundRecord) => {
    const ids = singleRecord ? [singleRecord.id] : Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Select at least one order or print from a single record')
      return
    }
    try {
      const res = await fetch(`/api/order-processing/pick-list?ids=${ids.join(',')}`)
      const result = await res.json()
      if (res.ok) {
        toast.success(`Pick list generated for ${result.orderCount} order(s)`)
        console.log('Pick list saved to:', result.filePath)
      } else {
        toast.error(result.error || 'Failed to generate pick list')
      }
    } catch {
      toast.error('Failed to generate pick list')
    }
  }

  const handlePrintPackingSlip = async (record: OutboundRecord) => {
    try {
      const res = await fetch(`/api/order-processing/pack-slip?id=${record.id}`)
      const result = await res.json()
      if (res.ok) {
        toast.success(`Packing slip generated for ${record.orderNumber || record.outboundId}`)
        console.log('Packing slip saved to:', result.filePath)
      } else {
        toast.error(result.error || 'Failed to generate packing slip')
      }
    } catch {
      toast.error('Failed to generate packing slip')
    }
  }

  const openException = (record: OutboundRecord) => {
    setExceptionRecord(record)
    setExceptionForm({ type: 'damaged', notes: '', qty: '1' })
    setExceptionOpen(true)
  }

  const handleSubmitException = async () => {
    if (!exceptionRecord) return
    try {
      const res = await fetch('/api/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: MODULE,
          recordId: exceptionRecord.id,
          exceptionType: exceptionForm.type,
          notes: exceptionForm.notes,
          qtyAffected: parseInt(exceptionForm.qty) || 1,
          reportedBy: 'admin',
        }),
      })
      if (res.ok) {
        toast.success('Exception reported — linked shrinkage record created')
        setExceptionOpen(false)
        fetchData()
      } else {
        toast.error('Failed to report exception')
      }
    } catch {
      toast.error('Failed to report exception')
    }
  }

  // Stats
  const counts = FILTER_CHIPS.reduce((acc, chip) => {
    acc[chip.key] = chip.statuses.length === 0
      ? data.length
      : data.filter(r => chip.statuses.includes(r.status)).length
    return acc
  }, {} as Record<string, number>)

  const stats = [
    { label: 'Total Orders', value: data.length, icon: ArrowUpRight, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Ready to Pick', value: counts.ready_to_pick || 0, icon: ClipboardList, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Packed, Ready to Dispatch', value: counts.packed || 0, icon: Boxes, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Exceptions', value: counts.exceptions || 0, icon: AlertTriangle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  // Bulk action options based on selected records' statuses
  const selectedRecords = filteredData.filter(r => selectedIds.has(r.id))
  const bulkActions: Array<{ toStatus: string; label: string }> = []
  if (selectedRecords.every(r => r.status === 'pending')) {
    bulkActions.push({ toStatus: 'picking', label: 'Start Picking All' })
  }
  if (selectedRecords.every(r => r.status === 'picking')) {
    bulkActions.push({ toStatus: 'picked', label: 'Mark All Picked' })
  }
  if (selectedRecords.every(r => r.status === 'picked')) {
    bulkActions.push({ toStatus: 'packing', label: 'Start Packing All' })
  }
  if (selectedRecords.every(r => r.status === 'packing')) {
    bulkActions.push({ toStatus: 'packed', label: 'Mark All Packed' })
  }
  if (selectedRecords.every(r => r.status === 'packed')) {
    bulkActions.push({ toStatus: 'dispatched', label: 'Dispatch All' })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="Outbound Records"
        description="Forward-moving workflow: Pick → Pack → Dispatch → Deliver"
        kpiCells={[
          { label: 'TOTAL', value: data.length },
          { label: 'READY TO PICK', value: counts.ready_to_pick || 0 },
          { label: 'PACKED', value: counts.packed || 0 },
          { label: 'EXCEPTIONS', value: counts.exceptions || 0, highlight: (counts.exceptions || 0) > 0, highlightColor: 'red' },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by order, customer, or tracking..."
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const isActive = activeFilter === chip.key
          const count = counts[chip.key] || 0
          return (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${isActive
                  ? 'bg-[#FF6B35] text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }
              `}
            >
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isActive ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Bulk action bar (appears when records selected) */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 flex-wrap"
          >
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {bulkActions.length > 0 ? (
                bulkActions.map(action => (
                  <Button
                    key={action.toStatus}
                    size="sm"
                    onClick={() => handleBulkTransition(action.toStatus)}
                    className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-lg h-7 text-xs"
                  >
                    {action.label}
                  </Button>
                ))
              ) : (
                <span className="text-xs text-blue-700">
                  Mixed statuses — select records in the same stage to bulk-advance them
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrintPickList()}
                className="h-7 text-xs rounded-lg"
              >
                <ClipboardList size={12} className="mr-1" /> Print Pick List
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="h-7 text-xs rounded-lg"
              >
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Records table with expandable rows */}
      {filteredData.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ArrowUpRight size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No outbound records</p>
          <p className="text-sm text-gray-400 mt-1">Orders appear here automatically when created in Order Processing</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredData.length && filteredData.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35]"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Order / Customer</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Item</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Qty</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Total</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                    Progress <InfoTip term="runsheets" size={11} />
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((r, i) => {
                  const isExpanded = expandedRows.has(r.id)
                  const isSelected = selectedIds.has(r.id)
                  return (
                    <>
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(i * 0.01, 0.5) }}
                        className={`border-b border-gray-50 hover:bg-gray-50 ${isSelected ? 'bg-orange-50' : ''}`}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                            className="h-4 w-4 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35]"
                          />
                        </td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                          {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-gray-900">{r.orderNumber || r.outboundId}</p>
                          <p className="text-xs text-gray-500">{r.customerName}</p>
                          {r.trackingNumber && <p className="text-[10px] text-gray-400 font-mono">{r.trackingNumber}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-xs text-gray-900">{r.productName}</p>
                          <p className="text-[10px] text-gray-400">
                            {r.brand && `${r.brand} · `}
                            {r.variant && r.variant}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-gray-900">{r.qty}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{formatCurrency(r.saleAmount || 0)}</td>
                        <td className="px-3 py-3">
                          <StatusStepper module={MODULE} currentStatus={r.status} size="sm" />
                        </td>
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <WorkflowActions
                              module={MODULE}
                              currentStatus={r.status}
                              onTransition={(to) => handleTransition(r, to)}
                              size="sm"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handlePrintPackingSlip(r)}
                              title="Print packing slip"
                            >
                              <FileText size={12} className="text-gray-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openException(r)}
                              title="Report exception"
                            >
                              <AlertTriangle size={12} className="text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                      {isExpanded && (
                        <tr key={`${r.id}-expanded`} className="bg-gray-50/50">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Customer Contact</p>
                                <p className="text-gray-700">{r.customerContact || '—'}</p>
                                <p className="text-gray-500">{r.customerEmail || '—'}</p>
                                <p className="text-gray-500">{r.customerAddress || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Driver / Runsheet</p>
                                <p className="text-gray-700">{r.assignedDriver || 'Not assigned'}</p>
                                <p className="text-gray-500">{r.runsheetId || 'No runsheet'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">COD <InfoTip term="codCollected" size={11} /></p>
                                <p className="text-gray-700">{r.codCollected ? formatCurrency(r.codCollected) : 'Not COD'}</p>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mt-2 mb-1">Unit Price</p>
                                <p className="text-gray-700">{formatCurrency(r.unitSellingPrice || 0)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Timestamps</p>
                                <p className="text-gray-500">Created: {new Date(r.createdAt).toLocaleString()}</p>
                                {r.dispatchedAt && <p className="text-gray-500">Dispatched: {new Date(r.dispatchedAt).toLocaleString()}</p>}
                                {r.deliveredAt && <p className="text-gray-500">Delivered: {new Date(r.deliveredAt).toLocaleString()}</p>}
                                {r.deliveryNotes && <p className="text-orange-600 mt-1">Notes: {r.deliveryNotes}</p>}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <NextStepBanner
                                module={MODULE}
                                currentStatus={r.status}
                                onAdvance={(to) => handleTransition(r, to)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exception Dialog */}
      <AlertDialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              Report Exception
            </AlertDialogTitle>
            <AlertDialogDescription>
              Reporting an exception for order <strong>{exceptionRecord?.orderNumber || exceptionRecord?.outboundId}</strong>.
              This will mark the order as failed and create a linked shrinkage record for investigation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Exception Type</Label>
              <select
                value={exceptionForm.type}
                onChange={e => setExceptionForm({ ...exceptionForm, type: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="damaged">Damaged in warehouse</option>
                <option value="short_stock">Short stock (not enough to fulfil)</option>
                <option value="wrong_location">Wrong location / can't find</option>
                <option value="customer_refused">Customer refused delivery</option>
                <option value="expired">Product expired</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Quantity affected</Label>
              <Input
                type="number"
                value={exceptionForm.qty}
                onChange={e => setExceptionForm({ ...exceptionForm, qty: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Notes</Label>
              <Textarea
                value={exceptionForm.notes}
                onChange={e => setExceptionForm({ ...exceptionForm, notes: e.target.value })}
                placeholder="Describe what happened..."
                className="rounded-xl"
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitException} className="bg-red-500 hover:bg-red-600 rounded-xl">
              Report Exception
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
