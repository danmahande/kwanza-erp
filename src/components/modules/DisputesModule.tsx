'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Eye, Check, X, Filter, AlertTriangle, Clock, CheckCircle2, FileText, ArrowLeft as BackIcon } from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'

interface Dispute {
  id: string
  disputeId: string
  merchantId: string
  merchantName: string
  statementId: string
  lineItemReference: string | null
  disputeType: string
  reason: string
  creditAmountRequested: number
  creditAmountApproved: number | null
  status: string
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNotes: string | null
  paymentId: string | null
  createdBy: string
  createdAt: string
}

interface Statement { id: string; statementId: string; merchantId: string; merchantName: string; period: string }
interface Merchant { id: string; merchantId: string; businessName: string }

interface Summary {
  totals: {
    openCount: number; openAmount: number
    underReviewCount: number; underReviewAmount: number
    creditedCount: number; creditedAmount: number
    rejectedCount: number
  }
}

const FILTER_CHIPS = [
  { key: 'all', label: 'All', status: '' },
  { key: 'open', label: 'Open', status: 'open' },
  { key: 'review', label: 'Under Review', status: 'under_review' },
  { key: 'credited', label: 'Credited', status: 'credited' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
]

const DISPUTE_TYPES = [
  { value: 'overcharge', label: 'Overcharge' },
  { value: 'missing_credit', label: 'Missing Credit' },
  { value: 'wrong_rate', label: 'Wrong Rate Applied' },
  { value: 'duplicate_charge', label: 'Duplicate Charge' },
  { value: 'other', label: 'Other' },
]

const typeColor = (t: string): string => ({
  overcharge: 'bg-red-500', missing_credit: 'bg-orange-500', wrong_rate: 'bg-amber-500',
  duplicate_charge: 'bg-purple-500', other: 'bg-gray-500',
}[t] || 'bg-gray-400')

const statusPill = (s: string): { label: string; cls: string } => ({
  open: { label: 'OPEN', cls: 'bg-orange-100 text-orange-700' },
  under_review: { label: 'UNDER REVIEW', cls: 'bg-blue-100 text-blue-700' },
  credited: { label: 'CREDITED', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'REJECTED', cls: 'bg-red-100 text-red-700' },
}[s] || { label: s.toUpperCase(), cls: 'bg-gray-100 text-gray-700' })

export default function DisputesModule() {
  const [data, setData] = useState<Dispute[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [statements, setStatements] = useState<Statement[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selected, setSelected] = useState<Dispute | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [view, setView] = useState<'list' | 'add'>('list')
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveAction, setResolveAction] = useState<'credit' | 'reject'>('credit')
  const [resolveForm, setResolveForm] = useState({ creditAmountApproved: '', resolutionNotes: '' })
  const [createForm, setCreateForm] = useState({
    statementId: '', merchantId: '', merchantName: '', lineItemReference: '',
    disputeType: 'overcharge', reason: '', creditAmountRequested: '',
  })

  const fetchData = () => {
    const chip = FILTER_CHIPS.find(c => c.key === activeFilter) || FILTER_CHIPS[0]
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (chip.status) params.set('status', chip.status)
    fetch(`/api/disputes?${params.toString()}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
    fetch('/api/disputes?summary=true').then(r => r.json()).then(setSummary).catch(() => {})
  }

  useEffect(() => { fetchData() }, [search, activeFilter])
  useEffect(() => {
    fetch('/api/merchant-statements').then(r => r.json()).then(d => setStatements(Array.isArray(d) ? d : []))
  }, [])

  const openCount = summary?.totals.openCount || 0
  const openAmount = summary?.totals.openAmount || 0
  const reviewCount = summary?.totals.underReviewCount || 0
  const creditedAmount = summary?.totals.creditedAmount || 0

  const kpiCells = [
    { label: 'OPEN', value: openCount, highlight: openCount > 0, highlightColor: 'orange' as const },
    { label: 'OPEN VALUE', value: formatCurrencyCompact(openAmount), highlight: openAmount > 0, highlightColor: 'orange' as const },
    { label: 'UNDER REVIEW', value: reviewCount, highlight: reviewCount > 0, highlightColor: 'orange' as const },
    { label: 'CREDITED', value: formatCurrencyCompact(creditedAmount) },
  ]

  const handleCreate = async () => {
    if (!createForm.statementId || !createForm.reason || !createForm.creditAmountRequested) {
      toast.error('Statement, reason, and credit amount are required'); return
    }
    const stmt = statements.find(s => s.statementId === createForm.statementId)
    try {
      const res = await fetch('/api/disputes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: stmt?.merchantId || createForm.merchantId,
          merchantName: stmt?.merchantName || createForm.merchantName,
          statementId: createForm.statementId,
          lineItemReference: createForm.lineItemReference || null,
          disputeType: createForm.disputeType,
          reason: createForm.reason,
          creditAmountRequested: parseFloat(createForm.creditAmountRequested),
          createdBy: 'admin',
        }),
      })
      if (res.ok) {
        toast.success('Dispute opened')
        setView('list')
        setCreateForm({ statementId: '', merchantId: '', merchantName: '', lineItemReference: '', disputeType: 'overcharge', reason: '', creditAmountRequested: '' })
        fetchData()
      } else { const e = await res.json(); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const openResolve = (action: 'credit' | 'reject') => {
    if (!selected) return
    setResolveAction(action)
    setResolveForm({
      creditAmountApproved: action === 'credit' ? String(selected.creditAmountRequested) : '',
      resolutionNotes: '',
    })
    setResolveOpen(true)
  }

  const confirmResolve = async () => {
    if (!selected) return
    try {
      const body: Record<string, unknown> = { id: selected.id, action: resolveAction, by: 'admin' }
      if (resolveAction === 'credit') {
        body.creditAmountApproved = parseFloat(resolveForm.creditAmountApproved) || selected.creditAmountRequested
        body.resolutionNotes = resolveForm.resolutionNotes || `Credit memo issued for ${body.creditAmountApproved}`
      } else {
        body.resolutionNotes = resolveForm.resolutionNotes || 'Rejected by finance'
      }
      const res = await fetch('/api/disputes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await res.json()
      if (res.ok) {
        if (resolveAction === 'credit') {
          toast.success(`Credit memo ${result.creditMemo?.paymentId} issued for ${formatCurrency(body.creditAmountApproved as number)}`)
        } else {
          toast.success('Dispute rejected')
        }
        setResolveOpen(false); setProfileOpen(false); fetchData()
      } else { toast.error(result.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const handleStartReview = async () => {
    if (!selected) return
    const res = await fetch('/api/disputes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id, action: 'review', by: 'admin' }) })
    if (res.ok) { toast.success('Moved to under review'); setProfileOpen(false); fetchData() }
  }

  const openProfile = (d: Dispute) => { setSelected(d); setProfileOpen(true) }

  // When statement selected in create form, auto-fill merchant
  const handleStatementSelect = (statementId: string) => {
    const stmt = statements.find(s => s.statementId === statementId)
    setCreateForm({
      ...createForm,
      statementId,
      merchantId: stmt?.merchantId || '',
      merchantName: stmt?.merchantName || '',
    })
  }

  // ── Render: Open Dispute (full-page) ──
  if (view === 'add') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="add">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><AlertTriangle size={16} className="text-[#FF6B35]" /> Open Dispute</h1>
                  <p className="text-[11px] text-gray-500">Merchant challenges a charge on their statement</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">Dispute Details</h2>
                  <p className="text-xs text-gray-500">Select the statement being disputed, enter the credit amount requested, and explain the reason. Finance reviews and may issue a credit memo.</p>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Statement <span className="text-red-400">*</span></Label>
                  <select value={createForm.statementId} onChange={e => handleStatementSelect(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                    <option value="">Select statement...</option>
                    {statements.slice(0, 100).map(s => <option key={s.id} value={s.statementId}>{s.statementId}, {s.merchantName} ({s.period})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Dispute Type</Label>
                    <select value={createForm.disputeType} onChange={e => setCreateForm({ ...createForm, disputeType: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                      {DISPUTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Credit Requested (UGX) <span className="text-red-400">*</span></Label>
                    <Input type="number" value={createForm.creditAmountRequested} onChange={e => setCreateForm({ ...createForm, creditAmountRequested: e.target.value })} placeholder="0" className="rounded-xl" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Line Item Reference (optional)</Label>
                  <Input value={createForm.lineItemReference} onChange={e => setCreateForm({ ...createForm, lineItemReference: e.target.value })} placeholder="e.g. IN001234 or storage-2026-06" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Reason <span className="text-red-400">*</span></Label>
                  <textarea value={createForm.reason} onChange={e => setCreateForm({ ...createForm, reason: e.target.value })}
                    placeholder="What is being disputed and why?" rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleCreate}>Open Dispute</Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
      <OpsHeader
        title="Disputes & Credit Memos"
        description="Merchant challenges to statement charges. issue credit memos with audit trail"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by dispute ID, merchant, or statement..."
      />

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={() => setView('add')}>
          <Plus size={12} className="mr-1" /> Open Dispute
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(d => d.status === chip.status).length
          const isActive = activeFilter === chip.key
          return (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No disputes found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">Dispute ID</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-32">Type</DenseTh>
              <DenseTh>Reason</DenseTh>
              <DenseTh className="w-28">Statement</DenseTh>
              <DenseTh className="w-28 text-right">Credit Requested</DenseTh>
              <DenseTh className="w-28 text-right">Credit Approved</DenseTh>
              <DenseTh className="w-28 text-center">Status</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => {
              const sp = statusPill(d.status)
              return (
                <AnimatedDenseTr key={d.id} index={i} onClick={() => openProfile(d)} tint={d.status === 'open' ? 'bg-orange-50/30' : d.status === 'credited' ? 'bg-green-50/30' : d.status === 'rejected' ? 'bg-red-50/30' : ''}>
                  <DenseTd mono className="text-gray-500">{d.disputeId}</DenseTd>
                  <DenseTd className="text-gray-900 font-medium">{d.merchantName}</DenseTd>
                  <DenseTd>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${typeColor(d.disputeType)}`} />
                      <span className="text-[10px] text-gray-600 uppercase">{d.disputeType.replace(/_/g, ' ')}</span>
                    </span>
                  </DenseTd>
                  <DenseTd className="text-gray-600 truncate max-w-[200px]">{d.reason}</DenseTd>
                  <DenseTd mono className="text-gray-500">{d.statementId}</DenseTd>
                  <DenseTd mono right className="text-orange-700 font-bold">{formatCurrencyCompact(d.creditAmountRequested)}</DenseTd>
                  <DenseTd mono right className={d.creditAmountApproved ? 'text-green-700 font-bold' : 'text-gray-400'}>
                    {d.creditAmountApproved ? formatCurrencyCompact(d.creditAmountApproved) : '—'}
                  </DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${sp.cls}`}>{sp.label}</span>
                  </DenseTd>
                </AnimatedDenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Profile slide-over, single dense card pattern */}
      <DetailSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={selected?.merchantName || 'Dispute'}
        subtitle={selected?.disputeId}
        width="lg"
      >
        {selected && (() => {
          const sp = statusPill(selected.status)
          return (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-100">
                <span className={`w-3 h-3 rounded-full ${typeColor(selected.disputeType)}`} />
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{selected.disputeType.replace(/_/g, ' ')}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sp.cls}`}>{sp.label}</span>
                <span className="text-[10px] font-mono text-gray-400 ml-auto">{selected.disputeId}</span>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {selected.status === 'open' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs rounded-md" onClick={handleStartReview}>
                    <Eye size={12} className="mr-1" /> Start Review
                  </Button>
                )}
                {(selected.status === 'open' || selected.status === 'under_review') && (
                  <>
                    <Button size="sm" className="h-7 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white" onClick={() => openResolve('credit')}>
                      <Check size={12} className="mr-1" /> Issue Credit Memo
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50" onClick={() => openResolve('reject')}>
                      <X size={12} className="mr-1" /> Reject
                    </Button>
                  </>
                )}
              </div>

              {/* Single dense card, dispute details */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Dispute Details</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Merchant</span>
                    <span className="font-medium text-gray-900">{selected.merchantName} <span className="text-gray-400 font-mono">({selected.merchantId})</span></span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Statement</span>
                    <span className="font-mono font-medium text-gray-900">{selected.statementId}</span>
                  </div>
                  {selected.lineItemReference && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Line Item</span>
                      <span className="font-mono text-gray-700">{selected.lineItemReference}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Dispute Type</span>
                    <span className="font-medium text-gray-900 uppercase">{selected.disputeType.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Credit Requested</span>
                    <span className="font-mono font-bold text-orange-700 text-lg">{formatCurrency(selected.creditAmountRequested)}</span>
                  </div>
                  {selected.creditAmountApproved !== null && (
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Credit Approved</span>
                      <span className="font-mono font-bold text-green-700 text-lg">{formatCurrency(selected.creditAmountApproved)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Opened By</span>
                    <span className="font-medium text-gray-700">{selected.createdBy}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Opened</span>
                    <span className="text-gray-700">{new Date(selected.createdAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  {selected.paymentId && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-gray-500">Credit Memo Payment</span>
                      <span className="font-mono text-green-700 font-bold">{selected.paymentId}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Reason</p>
                  <p className="text-xs text-gray-700 italic">"{selected.reason}"</p>
                </div>
              </div>

              {/* Resolution card */}
              {selected.resolvedBy && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Resolution</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500 flex items-center gap-1">
                        {selected.status === 'credited' ? <CheckCircle2 size={11} className="text-green-600" /> : <X size={11} className="text-red-600" />}
                        Resolved by
                      </span>
                      <span className="font-medium text-gray-900">{selected.resolvedBy} <span className="text-gray-400">· {selected.resolvedAt ? new Date(selected.resolvedAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></span>
                    </div>
                    {selected.resolutionNotes && (
                      <div className="py-1">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Notes</p>
                        <p className="text-xs text-gray-700">{selected.resolutionNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </DetailSlideOver>

      {/* Resolve dialog */}
      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {resolveAction === 'credit' ? <><Check size={18} className="text-green-600" /> Issue Credit Memo</> : <><X size={18} className="text-red-600" /> Reject Dispute</>}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resolveAction === 'credit'
                ? `A negative MerchantPayment will be created and linked to this dispute. The merchant's pending payment will be reduced.`
                : `The dispute will be closed as rejected. The merchant will be informed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            {resolveAction === 'credit' && (
              <div>
                <Label className="text-xs font-medium mb-1 block">Credit Amount Approved (UGX)</Label>
                <Input type="number" value={resolveForm.creditAmountApproved} onChange={e => setResolveForm({ ...resolveForm, creditAmountApproved: e.target.value })}
                  placeholder="May differ from requested amount" className="rounded-xl" />
                {selected && parseFloat(resolveForm.creditAmountApproved) !== selected.creditAmountRequested && (
                  <p className="text-[10px] text-orange-600 mt-1">⚠ Differs from requested {formatCurrency(selected.creditAmountRequested)}</p>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs font-medium mb-1 block">Resolution Notes</Label>
              <textarea value={resolveForm.resolutionNotes} onChange={e => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                placeholder={resolveAction === 'credit' ? 'e.g. Verified overcharge, credit issued' : 'e.g. Charge verified as correct. no credit due'}
                rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResolve}
              className={resolveAction === 'credit' ? 'bg-green-600 hover:bg-green-700 rounded-xl' : 'bg-red-500 hover:bg-red-600 rounded-xl'}>
              {resolveAction === 'credit' ? 'Issue Credit Memo' : 'Reject Dispute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
