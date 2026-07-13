'use client'

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RotateCcw, Search, Package, Clock, Layers, CalendarDays, User, ChevronDown, ChevronRight, AlertTriangle, Plus, ArrowLeft as BackIcon } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import { WorkflowActions, NextStepBanner, StatusStepper } from '@/components/shared/workflow'
import { StatusPill, rowTint, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import { getStage } from '@/lib/workflow'

const MODULE = 'rtv'

// ── Types ──
interface Merchant { id: string; merchantId: string; businessName: string }
interface Product { id: string; productId: string; productLabel: string; merchantId: string; merchantName: string }

interface RTVRecord {
  id: string
  rtvId: string
  merchantId: string
  merchantName: string
  productId: string
  productName: string
  qty: number
  reason: string
  status: string
  processedBy: string | null
  createdAt: string
}

interface ShrinkageRecord {
  id: string
  shrinkageId: string
  rtvId: string | null
  merchantId: string | null
  merchantName: string | null
  productId: string
  productName: string
  qty: number
  unitCost: number | null
  totalValue: number | null
  reason: string
  reportedBy: string
  status: string
  debitMerchant: boolean
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

// ── Reason badge config ──
const reasonConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  expired:      { label: 'Expired',      bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200/60' },
  damaged:      { label: 'Damaged',      bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200/60' },
  quality_issue:{ label: 'Quality Issue', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60' },
  overstock:    { label: 'Overstock',    bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200/60' },
  other:        { label: 'Other',        bg: 'bg-gray-100',  text: 'text-gray-600',   border: 'border-gray-200/60' },
}

const reasonBadge = (reason: string) => {
  const c = reasonConfig[reason] || reasonConfig.other
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  )
}

// ── Status badge config ──
const statusBadge = (status: string) => {
  switch (status) {
    case 'pending':  return <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50/50 hover:bg-amber-50">Pending</Badge>
    case 'approved': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Approved</Badge>
    case 'rejected': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0">Rejected</Badge>
    default:         return <Badge variant="secondary">{status}</Badge>
  }
}

// ── Card animation ──
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.35, delay: i * 0.05, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
}

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function RTVModule() {
  const [data, setData] = useState<RTVRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')

  // Slide-over states
  const [detailOpen, setDetailOpen] = useState(false)
  const [view, setView] = useState<'list' | 'add'>('list')
  const [selectedRecord, setSelectedRecord] = useState<RTVRecord | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [linkedShrinkage, setLinkedShrinkage] = useState<ShrinkageRecord[]>([])
  const [linkedShrinkageLoading, setLinkedShrinkageLoading] = useState(false)

  const [form, setForm] = useState({
    merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '',
  })

  // ── Fetch Data ──
  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const fetchData = useCallback(() => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  useEffect(() => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  // ── Form Handlers ──
  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', productId: '', productName: '' })
    fetch(`/api/products?search=${merchantId}`).then(r => r.json()).then((d: Product[] | { products?: Product[] }) => setProducts(Array.isArray(d) ? d : (d?.products ?? [])))
  }

  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '' })
  }

  const handleSubmit = async () => {
    if (!form.merchantId || !form.productId || !form.qty || !form.reason) {
      toast.error('Please fill all required fields')
      return
    }
    await fetch('/api/rtv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, qty: parseInt(form.qty), processedBy: form.processedBy || null }),
    })
    toast.success('RTV record created')
    setView('list')
    setForm({ merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '' })
    fetchData()
  }

  // ── Card click → detail ──
  const openDetail = async (record: RTVRecord) => {
    setSelectedRecord(record)
    setDetailOpen(true)
    setLinkedShrinkage([])
    setLinkedShrinkageLoading(true)
    try {
      // Fetch shrinkage records linked to this RTV by rtvId
      const res = await fetch(`/api/shrinkage?search=${record.rtvId}`)
      const d = await res.json()
      // Filter to only those where rtvId exactly matches
      const linked = (Array.isArray(d) ? d : []).filter((s: ShrinkageRecord) => s.rtvId === record.rtvId)
      setLinkedShrinkage(linked)
    } catch {
      setLinkedShrinkage([])
    } finally {
      setLinkedShrinkageLoading(false)
    }
  }

  // Workflow transition (Phase 1-2-4)
  const handleTransition = async (record: RTVRecord, toStatus: string) => {
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: MODULE, id: record.id, toStatus, performedBy: 'admin' }),
      })
      if (res.ok) {
        const stage = getStage(MODULE, toStatus)
        toast.success(`${stage?.label || toStatus} ✓`)
        fetchData()
        if (selectedRecord?.id === record.id) {
          setSelectedRecord({ ...selectedRecord, status: toStatus })
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update status')
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const openCreate = () => {
    setForm({ merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '' })
    setView('add')
  }

  // ── Computed stats ──
  const totalQty = data.reduce((s, r) => s + r.qty, 0)
  const pendingCount = data.filter(r => r.status === 'pending').length

  const stats = [
    { label: 'Total RTV',    value: data.length,   icon: RotateCcw,    color: '#FF6B35', bg: 'bg-[#FF6B35]/15',   border: 'border-[#FF6B35]/20', gradient: 'from-[#FF6B35]/10 to-[#FF6B35]/5' },
    { label: 'Pending',      value: pendingCount,    icon: Clock,        color: '#F59E0B', bg: 'bg-amber-500/15',   border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Total Qty Returned', value: totalQty, icon: Layers,       color: '#22C55E', bg: 'bg-green-500/15',   border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  // ── Render: New RTV (full-page) ──
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
                  <h1 className="text-base font-bold text-gray-900">New RTV Record</h1>
                  <p className="text-[11px] text-gray-500">Create a product return to vendor</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">Return Details</h2>
                  <p className="text-xs text-gray-500">Select merchant and product, enter quantity and reason. Stock is decremented when the RTV is submitted.</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant *</Label>
                  <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                    <SelectTrigger className="mt-1.5 rounded-xl h-11"><SelectValue placeholder="Select merchant" /></SelectTrigger>
                    <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product *</Label>
                  <Select value={form.productId} onValueChange={handleProductSelect} disabled={!form.merchantId}>
                    <SelectTrigger className="mt-1.5 rounded-xl h-11"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity *</Label>
                    <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="mt-1.5 rounded-xl h-11" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Processed By</Label>
                    <Input value={form.processedBy} onChange={e => setForm({ ...form, processedBy: e.target.value })} className="mt-1.5 rounded-xl h-11" placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason *</Label>
                  <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
                    <SelectTrigger className="mt-1.5 rounded-xl h-11"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                      <SelectItem value="quality_issue">Quality Issue</SelectItem>
                      <SelectItem value="overstock">Overstock</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSubmit}>Submit RTV</Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: List ──
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Returns to Vendor (RTV)"
            description="Manage product returns to vendors and merchants"
            kpiCells={[
              { label: 'TOTAL RTVs', value: data.length },
              { label: 'PENDING', value: data.filter(r => r.status === 'pending' || r.status === 'pending_approval').length },
              { label: 'APPROVED', value: data.filter(r => r.status === 'approved' || r.status === 'shipped').length },
              { label: 'PROCESSED', value: data.filter(r => r.status === 'processed').length },
            ]}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search RTV records..."
          />

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={openCreate}>
              <Plus size={12} className="mr-1" /> New RTV
            </Button>
          </div>

      {/* ── Dense table with inline expansion ── */}
      {data.length > 0 ? (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">RTV ID</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh>Product</DenseTh>
              <DenseTh className="w-16 text-right">Qty</DenseTh>
              <DenseTh className="w-32">Reason</DenseTh>
              <DenseTh className="w-20">Status</DenseTh>
              <DenseTh className="w-20 text-right">Actions</DenseTh>
              <DenseTh className="w-8"></DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => {
              const isExpanded = expandedId === item.id
              return (
                <>
                  <AnimatedDenseTr key={item.id} index={i}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    tint={rowTint(item.status)}
                  >
                    <DenseTd mono className="text-gray-500">{item.rtvId}</DenseTd>
                    <DenseTd className="text-gray-900 font-medium truncate max-w-[160px]">{item.merchantName}</DenseTd>
                    <DenseTd className="text-gray-700 truncate max-w-[200px]">{item.productName}</DenseTd>
                    <DenseTd mono right className="text-red-600 font-bold">-{item.qty}</DenseTd>
                    <DenseTd className="text-gray-500 text-[10px] truncate max-w-[120px]">{item.reason}</DenseTd>
                    <DenseTd><StatusPill status={item.status} /></DenseTd>
                    <DenseTd right>
                      <div onClick={(e) => e.stopPropagation()}>
                        <WorkflowActions
                          module={MODULE}
                          currentStatus={item.status}
                          onTransition={(to) => handleTransition(item, to)}
                          size="sm"
                        />
                      </div>
                    </DenseTd>
                    <DenseTd className="text-gray-400">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </DenseTd>
                  </AnimatedDenseTr>
                  {isExpanded && (
                    <tr key={`${item.id}-detail`} className="bg-white border-b border-gray-200">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Merchant</p>
                            <p className="text-gray-900 font-medium">{item.merchantName}</p>
                            <p className="text-gray-500 font-mono text-[11px]">{item.merchantId}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Product</p>
                            <p className="text-gray-900">{item.productName}</p>
                            <p className="text-gray-500 font-mono text-[11px]">{item.productId}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Reason</p>
                            <p className="text-gray-700">{item.reason}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Created</p>
                            <p className="text-gray-500">{new Date(item.createdAt).toLocaleString('en-UG')}</p>
                            {item.processedBy && <p className="text-gray-500 text-[11px] mt-1">Processed by: {item.processedBy}</p>}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <StatusStepper module={MODULE} currentStatus={item.status} size="sm" />
                          <div className="mt-2">
                            <NextStepBanner
                              module={MODULE}
                              currentStatus={item.status}
                              onAdvance={(to) => handleTransition(item, to)}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </DenseTable>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 mx-auto bg-orange-50 rounded-full flex items-center justify-center mb-4">
            <RotateCcw size={28} className="text-orange-500" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">No RTV records</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">Create a new return to vendor to get started.</p>
          <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" /> New RTV
          </Button>
        </div>
      )}

      {/* ── Detail SlideOver ── */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedRecord?.productName || 'RTV'}
        subtitle={selectedRecord?.rtvId}
        width="lg"
      >
        {selectedRecord && (
          <div className="space-y-3">
            {/* Status & Reason */}
            <div className="flex items-center gap-3">
              {statusBadge(selectedRecord.status)}
              {reasonBadge(selectedRecord.reason)}
            </div>

            {/* Detail fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Merchant" value={selectedRecord.merchantName} />
                <DetailField label="Product" value={selectedRecord.productName} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Quantity Returned" value={`-${selectedRecord.qty}`} valueClass="text-red-600 text-lg font-extrabold" />
                <DetailField label="Processed By" value={selectedRecord.processedBy || '—'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Date Created" value={new Date(selectedRecord.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
                <DetailField label="RTV ID" value={selectedRecord.rtvId} mono />
              </div>
            </div>

            {/* Merchant Info */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <User size={14} className="text-[#FF6B35]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant Details</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.merchantName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Merchant ID: {selectedRecord.merchantId}</p>
            </div>

            {/* Product Info */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} className="text-[#FF6B35]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Details</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.productName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Product ID: {selectedRecord.productId}</p>
            </div>

            {/* Linked Shrinkage Records */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Linked Shrinkage Records</span>
                <span className="text-[10px] text-gray-400 ml-auto">Sub-component of this RTV</span>
              </div>
              {linkedShrinkageLoading ? (
                <p className="text-xs text-gray-400 text-center py-3">Loading...</p>
              ) : linkedShrinkage.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No shrinkage records linked to this RTV.</p>
              ) : (
                <DenseTable>
                  <thead>
                    <tr>
                      <DenseTh className="w-24">Shrinkage ID</DenseTh>
                      <DenseTh>Product</DenseTh>
                      <DenseTh className="w-16 text-right">Qty</DenseTh>
                      <DenseTh className="w-24 text-right">Value</DenseTh>
                      <DenseTh className="w-20 text-center">Status</DenseTh>
                      <DenseTh className="w-20">Debit?</DenseTh>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedShrinkage.map((s, i) => (
                      <AnimatedDenseTr key={s.id} index={i} tint={s.status === 'resolved' ? 'bg-green-50/30' : 'bg-orange-50/30'}>
                        <DenseTd mono className="text-gray-500 text-[10px]">{s.shrinkageId}</DenseTd>
                        <DenseTd className="text-gray-900 text-[11px] truncate max-w-[120px]">{s.productName}</DenseTd>
                        <DenseTd mono right className="text-red-600 font-bold">{s.qty}</DenseTd>
                        <DenseTd mono right className="text-gray-900 font-bold">{s.totalValue ? s.totalValue.toLocaleString() : '—'}</DenseTd>
                        <DenseTd className="text-center">
                          <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-semibold ${
                            s.status === 'resolved' ? 'bg-green-100 text-green-700'
                            : s.status === 'investigating' ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                          }`}>{s.status.toUpperCase()}</span>
                        </DenseTd>
                        <DenseTd>
                          {s.debitMerchant
                            ? <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold">DEBIT</span>
                            : <span className="text-[9px] text-gray-400">—</span>}
                        </DenseTd>
                      </AnimatedDenseTr>
                    ))}
                  </tbody>
                </DenseTable>
              )}
              {linkedShrinkage.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-2">
                  {linkedShrinkage.length} shrinkage record(s) linked, Total qty: {linkedShrinkage.reduce((s, r) => s + r.qty, 0)}, Total value: UGX {linkedShrinkage.reduce((s, r) => s + (r.totalValue || 0), 0).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
      </DetailSlideOver>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}

// ── Detail field helper ──
function DetailField({ label, value, valueClass, mono }: { label: string; value: string; valueClass?: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-sm font-semibold text-gray-800 ${valueClass || ''} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
