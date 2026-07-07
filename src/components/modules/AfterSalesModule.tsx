'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  PackageX, Search, Plus, CheckCircle2, XCircle, RotateCcw, Cpu, Filter, ChevronDown, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import {
  WorkflowActions, NextStepBanner, StatusStepper, WorkflowStatusBadge,
} from '@/components/shared/workflow'
import { getStage } from '@/lib/workflow'

const MODULE = 'after_sales'

interface RMA {
  id: string
  afterSalesId: string
  originalOrderId: string | null
  returnOrderNumber: string | null
  customerId: string
  customerName: string
  reason: string
  returnStatus: string
  agentId: string | null
  agentName: string | null
  approvedBy: string | null
  approvedAt: string | null
  refundAmount: number | null
  replacementProductId: string | null
  replacementProductName: string | null
  returnTrackingNumber: string | null
  itemIds: string | null
  dispositions: string | null
  resolutionNotes: string | null
  createdAt: string
}

interface Order {
  id: string
  orderId: string
  orderNumber: string
  customerName: string
}

export default function AfterSalesModule() {
  const [data, setData] = useState<RMA[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [dispositionOpen, setDispositionOpen] = useState(false)
  const [editing, setEditing] = useState<RMA | null>(null)
  const [form, setForm] = useState({
    originalOrderId: '',
    customerId: '',
    customerName: '',
    reason: '',
    refundAmount: '',
    itemIds: '',
  })
  const [dispositions, setDispositions] = useState<Array<{ itemId: string; disposition: string }>>([])

  const fetchData = useCallback(() => {
    fetch(`/api/after-sales?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  useEffect(() => {
    fetchData()
    fetch('/api/order-processing').then(r => r.json()).then(d => setOrders(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Phase 1-2-4: filter chips + expandable rows
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const FILTER_CHIPS = [
    { key: 'all', label: 'All', statuses: [] as string[] },
    { key: 'initiated', label: 'Initiated', statuses: ['initiated'] },
    { key: 'received', label: 'Received', statuses: ['received'] },
    { key: 'in_review', label: 'In Review', statuses: ['in_review'] },
    { key: 'approved', label: 'Approved', statuses: ['approved'] },
    { key: 'processed', label: 'Processed', statuses: ['processed'] },
    { key: 'rejected', label: '⚠️ Rejected', statuses: ['rejected'] },
  ]

  const filteredRmas = activeFilter === 'all'
    ? data
    : data.filter(r => {
        const chip = FILTER_CHIPS.find(c => c.key === activeFilter)
        return chip?.statuses.includes(r.returnStatus)
      })

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRows)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedRows(next)
  }

  const handleTransition = async (rma: RMA, toStatus: string) => {
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: MODULE, id: rma.id, toStatus, performedBy: 'admin' }),
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

  const stats = [
    { label: 'Total RMAs', value: data.length, icon: PackageX, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Pending Approval', value: data.filter(r => r.returnStatus === 'initiated' || r.returnStatus === 'in_review').length, icon: RotateCcw, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Approved', value: data.filter(r => r.returnStatus === 'approved' || r.returnStatus === 'processed').length, icon: CheckCircle2, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Refund Value', value: formatCurrencyCompact(data.reduce((s, r) => s + (r.refundAmount || 0), 0)), icon: XCircle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.customerName || !form.reason) {
      toast.error('Customer name and reason are required')
      return
    }
    const itemIds = form.itemIds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const payload = {
      originalOrderId: form.originalOrderId || undefined,
      customerId: form.customerId || `CUST-RMA-${Date.now()}`,
      customerName: form.customerName,
      reason: form.reason,
      refundAmount: form.refundAmount ? parseFloat(form.refundAmount) : undefined,
      itemIds,
    }
    try {
      const res = await fetch('/api/after-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('RMA created. Order number flipped from DS to RT')
        setOpen(false)
        setForm({ originalOrderId: '', customerId: '', customerName: '', reason: '', refundAmount: '', itemIds: '' })
        fetchData()
      } else {
        toast.error('Failed to create RMA')
      }
    } catch {
      toast.error('Failed to create RMA')
    }
  }

  const openDisposition = (rma: RMA) => {
    setEditing(rma)
    let itemIds: string[] = []
    try {
      if (rma.itemIds) itemIds = JSON.parse(rma.itemIds)
    } catch { /* ignore parse errors */ }
    setDispositions(itemIds.map(itemId => ({ itemId, disposition: 'RESTOCK' })))
    setDispositionOpen(true)
  }

  const handleApprove = async () => {
    if (!editing) return
    try {
      const res = await fetch('/api/after-sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          returnStatus: 'approved',
          dispositions,
        }),
      })
      if (res.ok) {
        toast.success('RMA approved. Dispositions applied')
        setDispositionOpen(false)
        fetchData()
      } else {
        toast.error('Failed to approve RMA')
      }
    } catch {
      toast.error('Failed to approve RMA')
    }
  }

  const handleReject = async (rma: RMA) => {
    try {
      const res = await fetch('/api/after-sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rma.id, returnStatus: 'rejected' }),
      })
      if (res.ok) {
        toast.success('RMA rejected')
        fetchData()
      }
    } catch {
      toast.error('Failed to reject RMA')
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ originalOrderId: '', customerId: '', customerName: '', reason: '', refundAmount: '', itemIds: '' })
    setOpen(true)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'initiated': return 'bg-blue-100 text-blue-700 border-0'
      case 'in_review': return 'bg-yellow-100 text-yellow-700 border-0'
      case 'approved': return 'bg-green-100 text-green-700 border-0'
      case 'rejected': return 'bg-red-100 text-red-700 border-0'
      case 'processed': return 'bg-purple-100 text-purple-700 border-0'
      default: return 'bg-gray-100 text-gray-700 border-0'
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="After-Sales (RMA)"
        description="Approve returns and set disposition per item"
        kpiCells={[
          { label: 'TOTAL RMAs', value: data.length },
          { label: 'PENDING', value: data.filter(r => r.returnStatus === 'initiated' || r.returnStatus === 'in_review').length },
          { label: 'APPROVED', value: data.filter(r => r.returnStatus === 'approved' || r.returnStatus === 'processed').length },
          { label: 'REFUND VALUE', value: formatCurrencyCompact(data.reduce((s, r) => s + (r.refundAmount || 0), 0)) },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by RMA ID, customer, or reason..."
        actionLabel="New RMA"
        onAction={openCreate}
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const isActive = activeFilter === chip.key
          const count = chip.statuses.length === 0
            ? data.length
            : data.filter(r => chip.statuses.includes(r.returnStatus)).length
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

      {filteredRmas.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <PackageX size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No RMAs match this filter</p>
          <p className="text-sm text-gray-400 mt-1">Try a different filter or create a new RMA</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">RMA ID</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Return Order #</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Customer</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Reason</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Refund</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Progress</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRmas.map((r, i) => {
                  const isExpanded = expandedRows.has(r.id)
                  return (
                    <>
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(i * 0.01, 0.5) }}
                        className="border-b border-gray-50 hover:bg-gray-50"
                      >
                        <td className="px-3 py-3 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                          {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-700">{r.afterSalesId}</td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-gray-900">{r.returnOrderNumber || '—'}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{r.customerName}</p>
                          <p className="text-xs text-gray-400">{r.customerId}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs max-w-xs truncate">{r.reason}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{r.refundAmount ? formatCurrency(r.refundAmount) : '—'}</td>
                        <td className="px-3 py-3">
                          <StatusStepper module={MODULE} currentStatus={r.returnStatus} size="sm" />
                        </td>
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <WorkflowActions
                              module={MODULE}
                              currentStatus={r.returnStatus}
                              onTransition={(to) => {
                                if (to === 'approved') {
                                  openDisposition(r)
                                } else {
                                  handleTransition(r, to)
                                }
                              }}
                              size="sm"
                            />
                          </div>
                        </td>
                      </motion.tr>
                      {isExpanded && (
                        <tr key={`${r.id}-expanded`} className="bg-gray-50/50">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Original Order</p>
                                <p className="text-gray-700 font-mono">{r.originalOrderId || '—'}</p>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mt-2 mb-1">Agent</p>
                                <p className="text-gray-700">{r.agentName || 'Unassigned'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Item IDs <InfoTip term="disposition" size={11} /></p>
                                <p className="text-gray-700 font-mono text-[10px]">
                                  {r.itemIds ? JSON.parse(r.itemIds).join(', ') : 'No specific items'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Created</p>
                                <p className="text-gray-500">{new Date(r.createdAt).toLocaleString()}</p>
                                {r.approvedAt && <p className="text-gray-500">Approved: {new Date(r.approvedAt).toLocaleString()}</p>}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <NextStepBanner
                                module={MODULE}
                                currentStatus={r.returnStatus}
                                onAdvance={(to) => {
                                  if (to === 'approved') {
                                    openDisposition(r)
                                  } else {
                                    handleTransition(r, to)
                                  }
                                }}
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

      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="New RMA (Customer Return)"
        subtitle="The original order # will be flipped from DS to RT automatically"
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create RMA</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Original Order (optional)</Label>
            <select
              value={form.originalOrderId}
              onChange={e => {
                const order = orders.find(o => o.orderId === e.target.value)
                setForm({
                  ...form,
                  originalOrderId: e.target.value,
                  customerName: order?.customerName || form.customerName,
                })
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select order (or skip for walk-in return)...</option>
              {orders.slice(0, 50).map(o => (
                <option key={o.orderId} value={o.orderId}>{o.orderNumber}, {o.customerName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Customer Name <span className="text-red-400">*</span></Label>
              <Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Customer ID (optional)</Label>
              <Input value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} placeholder="Auto if blank" className="rounded-xl" />
            </div>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Reason for Return <span className="text-red-400">*</span></Label>
            <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wrong_item">Wrong item delivered</SelectItem>
                <SelectItem value="damaged_arrival">Damaged on arrival</SelectItem>
                <SelectItem value="customer_changed_mind">Customer changed mind</SelectItem>
                <SelectItem value="expired">Product expired</SelectItem>
                <SelectItem value="quality_issue">Quality issue</SelectItem>
                <SelectItem value="wrong_address">Wrong address</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Refund Amount (UGX, optional)</Label>
            <Input type="number" value={form.refundAmount} onChange={e => setForm({ ...form, refundAmount: e.target.value })} placeholder="e.g. 50000" className="rounded-xl" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">
              Returned Item IDs <InfoTip term="disposition" size={12} className="ml-1" />
            </Label>
            <Input
              value={form.itemIds}
              onChange={e => setForm({ ...form, itemIds: e.target.value })}
              placeholder="Comma-separated item barcodes (e.g. ITM-001, ITM-002, ITM-003)"
              className="rounded-xl font-mono text-xs"
            />
            <p className="text-xs text-gray-500 mt-2">
              Item IDs let you track each returned unit individually. On approval, you decide what happens to each one.
            </p>
          </div>
        </div>
      </DetailSlideOver>

      <AlertDialog open={dispositionOpen} onOpenChange={setDispositionOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Cpu size={18} />
              Approve RMA: Set Disposition per Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              For each returned item, decide what to do with it. <InfoTip term="disposition" size={12} className="ml-1" />
              <br />
              <strong>RESTOCK</strong> = put back on shelf, <strong>RTV</strong> = return to vendor (auto-creates RTV record), <strong>DISPOSE</strong> = destroy, <strong>LIQUIDATE</strong> = sell off cheap.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-3 max-h-80 overflow-y-auto">
            {dispositions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No specific items were logged for this RMA. The approval will still go through.</p>
            ) : (
              <div className="space-y-2">
                {dispositions.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100">
                    <span className="font-mono text-xs text-gray-700 flex-1">{d.itemId}</span>
                    <select
                      value={d.disposition}
                      onChange={e => {
                        const next = [...dispositions]
                        next[i] = { ...next[i], disposition: e.target.value }
                        setDispositions(next)
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="RESTOCK">RESTOCK: back on shelf</option>
                      <option value="RTV">RTV: return to vendor</option>
                      <option value="DISPOSE">DISPOSE: destroy</option>
                      <option value="LIQUIDATE">LIQUIDATE: sell off cheap</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} className="bg-green-600 hover:bg-green-700 rounded-xl">
              <CheckCircle2 size={14} className="mr-2" /> Approve & Apply Dispositions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
