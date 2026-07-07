'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Check, X, Trash2, Filter, Layers, CheckCircle2, Clock, AlertOctagon } from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'

interface Charge {
  id: string
  chargeId: string
  merchantId: string
  merchantName: string
  chargeType: string
  amount: number
  description: string
  sourceType: string
  sourceId: string | null
  period: string
  status: string
  approvedBy: string | null
  approvedAt: string | null
  rejectedBy: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  statementId: string | null
  recordedBy: string
  createdAt: string
}

interface Merchant { id: string; merchantId: string; businessName: string }

interface Summary {
  totals: {
    pendingCount: number; pendingAmount: number
    approvedCount: number; approvedAmount: number
    invoicedCount: number; invoicedAmount: number
    rejectedCount: number
  }
  pendingByType: Record<string, { count: number; amount: number }>
}

const CHARGE_TYPES = [
  { value: 'inbound_receiving', label: 'Inbound Receiving' },
  { value: 'storage', label: 'Storage' },
  { value: 'pick', label: 'Pick' },
  { value: 'pack', label: 'Pack' },
  { value: 'return_processing', label: 'Return Processing' },
  { value: 'shrinkage', label: 'Shrinkage' },
  { value: 'cod_fee', label: 'COD Fee' },
  { value: 'commission', label: 'Commission' },
  { value: 'ad_hoc', label: 'Ad-hoc' },
]

const FILTER_CHIPS = [
  { key: 'all', label: 'All', status: '' },
  { key: 'pending', label: 'Pending', status: 'pending' },
  { key: 'approved', label: 'Approved', status: 'approved' },
  { key: 'invoiced', label: 'Invoiced', status: 'invoiced' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
]

const typeColor = (t: string): string => ({
  inbound_receiving: 'bg-blue-500', storage: 'bg-cyan-500', pick: 'bg-orange-500',
  pack: 'bg-amber-500', return_processing: 'bg-purple-500', shrinkage: 'bg-red-500',
  cod_fee: 'bg-green-500', commission: 'bg-pink-500', ad_hoc: 'bg-gray-500',
}[t] || 'bg-gray-400')

const statusPill = (s: string): { label: string; cls: string } => ({
  pending: { label: 'PENDING', cls: 'bg-orange-100 text-orange-700' },
  approved: { label: 'APPROVED', cls: 'bg-green-100 text-green-700' },
  invoiced: { label: 'INVOICED', cls: 'bg-blue-100 text-blue-700' },
  rejected: { label: 'REJECTED', cls: 'bg-red-100 text-red-700' },
}[s] || { label: s.toUpperCase(), cls: 'bg-gray-100 text-gray-700' })

export default function ChargesModule() {
  const [data, setData] = useState<Charge[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selected, setSelected] = useState<Charge | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectIds, setRejectIds] = useState<string[]>([])
  const [rejectReason, setRejectReason] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({
    merchantId: '', chargeType: 'inbound_receiving', amount: '', description: '', period: new Date().toISOString().slice(0, 7),
  })

  const fetchData = () => {
    const chip = FILTER_CHIPS.find(c => c.key === activeFilter) || FILTER_CHIPS[0]
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (chip.status) params.set('status', chip.status)
    fetch(`/api/charges?${params.toString()}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
    fetch('/api/charges?summary=true').then(r => r.json()).then(setSummary).catch(() => {})
  }

  useEffect(() => { fetchData() }, [search, activeFilter])
  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const pendingCount = summary?.totals.pendingCount || 0
  const pendingAmount = summary?.totals.pendingAmount || 0
  const approvedAmount = summary?.totals.approvedAmount || 0
  const invoicedAmount = summary?.totals.invoicedAmount || 0

  const kpiCells = [
    { label: 'PENDING', value: pendingCount, highlight: pendingCount > 0, highlightColor: 'orange' as const },
    { label: 'PENDING VALUE', value: formatCurrencyCompact(pendingAmount), highlight: pendingAmount > 0, highlightColor: 'orange' as const },
    { label: 'APPROVED', value: formatCurrencyCompact(approvedAmount) },
    { label: 'INVOICED', value: formatCurrencyCompact(invoicedAmount) },
  ]

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const selectAllPending = () => {
    const pendingIds = data.filter(c => c.status === 'pending').map(c => c.id)
    setSelectedIds(new Set(pendingIds))
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) { toast.error('Select at least one charge'); return }
    try {
      const res = await fetch('/api/charges', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids: Array.from(selectedIds), by: 'admin' }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`${result.approved} charge(s) approved`)
        setSelectedIds(new Set()); fetchData()
      } else { toast.error(result.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const handleBulkReject = () => {
    if (selectedIds.size === 0) { toast.error('Select at least one charge'); return }
    setRejectIds(Array.from(selectedIds))
    setRejectReason('')
    setRejectOpen(true)
  }

  const confirmReject = async () => {
    try {
      const res = await fetch('/api/charges', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', ids: rejectIds, reason: rejectReason || 'Rejected by reviewer', by: 'admin' }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`${result.rejected} charge(s) rejected`)
        setRejectOpen(false); setSelectedIds(new Set()); fetchData()
      } else { toast.error(result.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const handleCreate = async () => {
    if (!form.merchantId || !form.amount || !form.period) { toast.error('Merchant, amount, and period are required'); return }
    const m = merchants.find(m => m.merchantId === form.merchantId)
    try {
      const res = await fetch('/api/charges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: form.merchantId,
          merchantName: m?.businessName,
          chargeType: form.chargeType,
          amount: parseFloat(form.amount),
          description: form.description || `${form.chargeType} charge`,
          period: form.period,
          recordedBy: 'admin',
        }),
      })
      if (res.ok) {
        toast.success('Charge created')
        setCreateOpen(false)
        setForm({ merchantId: '', chargeType: 'inbound_receiving', amount: '', description: '', period: new Date().toISOString().slice(0, 7) })
        fetchData()
      } else { const e = await res.json(); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/charges?id=${id}`, { method: 'DELETE' })
    toast.success('Charge deleted')
    setProfileOpen(false); fetchData()
  }

  const openProfile = (c: Charge) => { setSelected(c); setProfileOpen(true) }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Charge Ledger"
        description="Individual fee events awaiting review before they hit a statement"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by merchant, charge ID, or description..."
        actionLabel="Add Charge"
        onAction={() => setCreateOpen(true)}
      >
        {selectedIds.size > 0 && (
          <>
            <Button size="sm" className="h-7 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white" onClick={handleBulkApprove}>
              <Check size={12} className="mr-1" /> Approve ({selectedIds.size})
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50" onClick={handleBulkReject}>
              <X size={12} className="mr-1" /> Reject ({selectedIds.size})
            </Button>
          </>
        )}
      </OpsHeader>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(c => c.status === chip.status).length
          const isActive = activeFilter === chip.key
          return (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
        {data.some(c => c.status === 'pending') && selectedIds.size === 0 && (
          <button onClick={selectAllPending} className="ml-auto text-[11px] text-[#FF6B35] hover:text-[#E55A25] font-medium">
            Select all pending
          </button>
        )}
      </div>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No charges found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-8"></DenseTh>
              <DenseTh className="w-24">Charge ID</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-32">Type</DenseTh>
              <DenseTh>Description</DenseTh>
              <DenseTh className="w-20">Period</DenseTh>
              <DenseTh className="w-28 text-right">Amount</DenseTh>
              <DenseTh className="w-24 text-center">Status</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const sp = statusPill(c.status)
              const isSelected = selectedIds.has(c.id)
              return (
                <DenseTr key={c.id} onClick={() => openProfile(c)} tint={c.status === 'rejected' ? 'bg-red-50/30' : c.status === 'approved' ? 'bg-green-50/30' : ''}>
                  <DenseTd>
                    {c.status === 'pending' && (
                      <div onClick={(e) => { e.stopPropagation(); toggleSelect(c.id) }}>
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="rounded" />
                      </div>
                    )}
                  </DenseTd>
                  <DenseTd mono className="text-gray-500">{c.chargeId}</DenseTd>
                  <DenseTd className="text-gray-900 font-medium">{c.merchantName}</DenseTd>
                  <DenseTd>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${typeColor(c.chargeType)}`} />
                      <span className="text-[10px] text-gray-600 uppercase">{c.chargeType.replace(/_/g, ' ')}</span>
                    </span>
                  </DenseTd>
                  <DenseTd className="text-gray-600 truncate max-w-[200px]">{c.description}</DenseTd>
                  <DenseTd mono className="text-gray-500">{c.period}</DenseTd>
                  <DenseTd mono right className="text-gray-900 font-bold">{formatCurrency(c.amount)}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${sp.cls}`}>{sp.label}</span>
                  </DenseTd>
                </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Profile slide-over, single dense card pattern */}
      <DetailSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={selected?.merchantName || 'Charge'}
        subtitle={selected?.chargeId}
        width="lg"
      >
        {selected && (() => {
          const sp = statusPill(selected.status)
          return (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-100">
                <span className={`w-3 h-3 rounded-full ${typeColor(selected.chargeType)}`} />
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{selected.chargeType.replace(/_/g, ' ')}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sp.cls}`}>{sp.label}</span>
                <span className="text-[10px] font-mono text-gray-400 ml-auto">{selected.chargeId}</span>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {selected.status === 'pending' && (
                  <>
                    <Button size="sm" className="h-7 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        const res = await fetch('/api/charges', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', ids: [selected.id], by: 'admin' }) })
                        if (res.ok) { toast.success('Charge approved'); setProfileOpen(false); fetchData() }
                      }}>
                      <Check size={12} className="mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50"
                      onClick={async () => {
                        const reason = prompt('Reason for rejection:')
                        if (reason === null) return
                        const res = await fetch('/api/charges', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', ids: [selected.id], reason: reason || 'Rejected', by: 'admin' }) })
                        if (res.ok) { toast.success('Charge rejected'); setProfileOpen(false); fetchData() }
                      }}>
                      <X size={12} className="mr-1" /> Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50 ml-auto"
                  onClick={() => handleDelete(selected.id)}>
                  <Trash2 size={12} className="mr-1" /> Delete
                </Button>
              </div>

              {/* Single dense card, all details stacked */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Charge Details</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Merchant</span>
                    <span className="font-medium text-gray-900">{selected.merchantName} <span className="text-gray-400 font-mono">({selected.merchantId})</span></span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Charge Type</span>
                    <span className="font-medium text-gray-900 uppercase">{selected.chargeType.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Period <InfoTip term="storageLiability" size={11} /></span>
                    <span className="font-mono font-bold text-gray-900">{selected.period}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-mono font-bold text-lg text-gray-900">{formatCurrency(selected.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Source</span>
                    <span className="font-medium text-gray-700 capitalize">{selected.sourceType}{selected.sourceId ? `, ${selected.sourceId}` : ''}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Recorded By</span>
                    <span className="font-medium text-gray-700">{selected.recordedBy}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-700">{new Date(selected.createdAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-500">Linked Statement</span>
                    <span className="font-mono text-gray-700">{selected.statementId || '—'}</span>
                  </div>
                </div>
                {selected.description && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Description</p>
                    <p className="text-xs text-gray-700">{selected.description}</p>
                  </div>
                )}
              </div>

              {/* Approval trail card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Approval Trail</h3>
                <div className="space-y-2 text-xs">
                  {selected.status === 'pending' && (
                    <p className="text-gray-400 text-center py-2">Awaiting review</p>
                  )}
                  {selected.approvedBy && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500 flex items-center gap-1"><CheckCircle2 size={11} className="text-green-600" /> Approved by</span>
                      <span className="font-medium text-gray-900">{selected.approvedBy} <span className="text-gray-400">· {selected.approvedAt ? new Date(selected.approvedAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></span>
                    </div>
                  )}
                  {selected.rejectedBy && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500 flex items-center gap-1"><AlertOctagon size={11} className="text-red-600" /> Rejected by</span>
                      <span className="font-medium text-gray-900">{selected.rejectedBy} <span className="text-gray-400">· {selected.rejectedAt ? new Date(selected.rejectedAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></span>
                    </div>
                  )}
                  {selected.rejectionReason && (
                    <div className="py-1">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Rejection Reason</p>
                      <p className="text-xs text-red-700 italic">"{selected.rejectionReason}"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </DetailSlideOver>

      {/* Create dialog */}
      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Plus size={18} /> Add Manual Charge</AlertDialogTitle>
            <AlertDialogDescription>Manual ad-hoc charge to be reviewed before invoicing.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-xs font-medium mb-1 block">Merchant <span className="text-red-400">*</span></Label>
              <select value={form.merchantId} onChange={e => setForm({ ...form, merchantId: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">Select merchant...</option>
                {merchants.map(m => <option key={m.id} value={m.merchantId}>{m.businessName} ({m.merchantId})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium mb-1 block">Charge Type <span className="text-red-400">*</span></Label>
                <select value={form.chargeType} onChange={e => setForm({ ...form, chargeType: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  {CHARGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Period <span className="text-red-400">*</span></Label>
                <Input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Amount (UGX) <span className="text-red-400">*</span></Label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What is this charge for?" className="rounded-xl" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Create Charge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk reject dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><X size={18} /> Reject {rejectIds.length} charge(s)?</AlertDialogTitle>
            <AlertDialogDescription>Rejected charges won't be invoiced. A reason will be recorded in the audit trail.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Label className="text-sm font-medium mb-1.5 block">Reason for rejection</Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Wrong rate applied / duplicate / not billable" className="rounded-xl" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReject} className="bg-red-500 hover:bg-red-600 rounded-xl">Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
