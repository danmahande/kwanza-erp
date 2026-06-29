'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RotateCcw, Search, Package, Clock, Layers, CalendarDays, User } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { WorkflowActions, NextStepBanner, StatusStepper } from '@/components/shared/workflow'
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
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RTVRecord | null>(null)

  const [form, setForm] = useState({
    merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '',
  })

  // ── Fetch Data ──
  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const fetchData = useCallback(() => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  useEffect(() => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  // ── Form Handlers ──
  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', productId: '', productName: '' })
    fetch(`/api/products?search=${merchantId}`).then(r => r.json()).then((d: Product[]) => setProducts(d))
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
    setCreateOpen(false)
    setForm({ merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '' })
    fetchData()
  }

  // ── Card click → detail ──
  const openDetail = (record: RTVRecord) => {
    setSelectedRecord(record)
    setDetailOpen(true)
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
    setCreateOpen(true)
  }

  // ── Computed stats ──
  const totalQty = data.reduce((s, r) => s + r.qty, 0)
  const pendingCount = data.filter(r => r.status === 'pending').length

  const stats = [
    { label: 'Total RTV',    value: data.length,   icon: RotateCcw,    color: '#FF6B35', bg: 'bg-[#FF6B35]/15',   border: 'border-[#FF6B35]/20', gradient: 'from-[#FF6B35]/10 to-[#FF6B35]/5' },
    { label: 'Pending',      value: pendingCount,    icon: Clock,        color: '#F59E0B', bg: 'bg-amber-500/15',   border: 'border-amber-500/20', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Total Qty Returned', value: totalQty, icon: Layers,       color: '#22C55E', bg: 'bg-green-500/15',   border: 'border-green-500/20', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
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
        actionLabel="New RTV"
        onAction={openCreate}
      />

      {/* ── Card Grid ── */}
      {data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.map((item, i) => (
            <motion.div
              key={item.id}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.2 }}
              onClick={() => openDetail(item)}
              className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors group"
            >
              {/* Card header: ID + date */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-gray-400 truncate">{item.rtvId}</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{item.merchantName}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0 ml-2">
                  <CalendarDays size={12} />
                  {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>

              {/* Product */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <Package size={14} className="text-[#FF6B35]" />
                </div>
                <span className="text-sm text-gray-600 truncate">{item.productName}</span>
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Quantity</span>
                <span className="text-lg font-extrabold text-red-500 tabular-nums">-{item.qty}</span>
              </div>

              {/* Reason + Status row */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                {reasonBadge(item.reason)}
                {statusBadge(item.status)}
              </div>

              {/* Workflow actions */}
              <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                <StatusStepper module={MODULE} currentStatus={item.status} size="sm" />
                <div className="mt-2">
                  <WorkflowActions
                    module={MODULE}
                    currentStatus={item.status}
                    onTransition={(to) => handleTransition(item, to)}
                    size="sm"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <RotateCcw size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">No RTV records found</p>
          <p className="text-xs text-gray-300 mt-1">Create a new return to get started</p>
        </motion.div>
      )}

      {/* ── Detail SlideOver ── */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedRecord?.rtvId || ''}
        subtitle="RTV Record Details"
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
            <div className="bg-gray-50/80 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <User size={14} className="text-[#FF6B35]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant Details</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.merchantName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Merchant ID: {selectedRecord.merchantId}</p>
            </div>

            {/* Product Info */}
            <div className="bg-gray-50/80 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} className="text-[#FF6B35]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Details</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.productName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Product ID: {selectedRecord.productId}</p>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ── Create RTV SlideOver ── */}
      <DetailSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New RTV Record"
        subtitle="Create a product return to vendor"
        width="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              Submit RTV
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
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
      </DetailSlideOver>
    </motion.div>
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
