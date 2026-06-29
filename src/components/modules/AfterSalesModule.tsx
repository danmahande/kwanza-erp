'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  PackageX, Search, Plus, CheckCircle2, XCircle, RotateCcw, Cpu,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

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

  const fetchData = () => {
    fetch(`/api/after-sales?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    fetchData()
    fetch('/api/order-processing').then(r => r.json()).then(d => setOrders(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { fetchData() }, [search])

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
        toast.success('RMA created — order number flipped from DS to RT')
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
        toast.success('RMA approved — dispositions applied')
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="After-Sales (RMA)"
        description="Customer returns. Approve returns and decide disposition per item: restock, RTV, dispose, or liquidate."
        icon={PackageX}
        stats={stats}
        actionLabel="New RMA"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by RMA ID, return order #, customer, or reason..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {data.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <PackageX size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No RMAs yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a customer return to start the disposition workflow</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">RMA ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Return Order #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Reason</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Refund</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.afterSalesId}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{r.returnOrderNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.customerName}</p>
                      <p className="text-xs text-gray-400">{r.customerId}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{r.reason}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.refundAmount ? formatCurrency(r.refundAmount) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-[10px] ${statusColor(r.returnStatus)}`}>{r.returnStatus.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.returnStatus === 'initiated' || r.returnStatus === 'in_review' ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-green-700" onClick={() => openDisposition(r)}>
                            <CheckCircle2 size={12} className="mr-1" /> Approve
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-700" onClick={() => handleReject(r)}>
                            <XCircle size={12} className="mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
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
                <option key={o.orderId} value={o.orderId}>{o.orderNumber} — {o.customerName}</option>
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
            <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Wrong size, damaged on arrival, customer changed mind" className="rounded-xl" />
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
              Approve RMA — Set Disposition per Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              For each returned item, decide what to do with it. <InfoTip term="disposition" size={12} className="ml-1" />
              <br />
              <strong>RESTOCK</strong> = put back on shelf · <strong>RTV</strong> = return to vendor (auto-creates RTV record) · <strong>DISPOSE</strong> = destroy · <strong>LIQUIDATE</strong> = sell off cheap.
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
                      <option value="RESTOCK">RESTOCK — back on shelf</option>
                      <option value="RTV">RTV — return to vendor</option>
                      <option value="DISPOSE">DISPOSE — destroy</option>
                      <option value="LIQUIDATE">LIQUIDATE — sell off cheap</option>
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
