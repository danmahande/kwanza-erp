'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Search, Package, Clock, CheckCircle2, TrendingDown, CalendarDays, UserCircle, AlertOctagon, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader, StatusPill, rowTint, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { WorkflowActions, NextStepBanner, StatusStepper } from '@/components/shared/workflow'
import { getStage } from '@/lib/workflow'

const MODULE = 'shrinkage'

// ── Types ──
interface Product { id: string; productId: string; productLabel: string; currentStock: number; unit: string }

interface ShrinkageRecord {
  id: string
  shrinkageId: string
  productId: string
  productName: string
  qty: number
  reason: string
  reportedBy: string
  status: string
  createdAt: string
}

// ── Reason badge config ──
const reasonConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  damage: { label: 'Damage',  bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200/60' },
  theft:  { label: 'Theft',   bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60' },
  expiry: { label: 'Expiry',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200/60' },
  other:  { label: 'Other',   bg: 'bg-gray-100',  text: 'text-gray-600',   border: 'border-gray-200/60' },
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
    case 'resolved': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Resolved</Badge>
    case 'pending':  return <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50/50 hover:bg-amber-50">Pending</Badge>
    case 'investigating': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">Investigating</Badge>
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
export default function ShrinkageModule() {
  const [data, setData] = useState<ShrinkageRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')

  // Slide-over states
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<ShrinkageRecord | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({
    productId: '', productName: '', qty: '', reason: '', reportedBy: '',
  })

  // ── Fetch Data ──
  useEffect(() => { fetch('/api/products').then(r => r.json()).then(setProducts) }, [])

  const fetchData = useCallback(() => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  useEffect(() => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  // ── Form Handlers ──
  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '' })
  }

  const handleSubmit = async () => {
    if (!form.productId || !form.qty || !form.reason || !form.reportedBy) {
      toast.error('Please fill all required fields')
      return
    }
    await fetch('/api/shrinkage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, qty: parseInt(form.qty) }),
    })
    toast.success('Shrinkage reported')
    setCreateOpen(false)
    setForm({ productId: '', productName: '', qty: '', reason: '', reportedBy: '' })
    fetchData()
  }

  // ── Card click → detail ──
  const openDetail = (record: ShrinkageRecord) => {
    setSelectedRecord(record)
    setDetailOpen(true)
  }

  // Workflow transition (Phase 1-2-4)
  const handleTransition = async (record: ShrinkageRecord, toStatus: string) => {
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
    setForm({ productId: '', productName: '', qty: '', reason: '', reportedBy: '' })
    setCreateOpen(true)
  }

  // ── Computed stats ──
  const totalLoss = data.reduce((s, r) => s + r.qty, 0)
  const pendingCount = data.filter(r => r.status === 'pending').length
  const resolvedCount = data.filter(r => r.status === 'resolved').length

  const stats = [
    { label: 'Total Incidents', value: data.length,      icon: AlertTriangle, color: '#EF4444', bg: 'bg-red-500/15',     border: 'border-red-500/20',     gradient: 'from-red-500/10 to-red-500/5' },
    { label: 'Total Loss',      value: `${totalLoss} units`, icon: TrendingDown, color: '#DC2626', bg: 'bg-red-500/15', border: 'border-red-500/20', gradient: 'from-red-600/10 to-red-600/5' },
    { label: 'Pending',         value: pendingCount,      icon: Clock,          color: '#F59E0B', bg: 'bg-amber-500/15',   border: 'border-amber-500/20',   gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Resolved',        value: resolvedCount,     icon: CheckCircle2,   color: '#22C55E', bg: 'bg-green-500/15',   border: 'border-green-500/20',   gradient: 'from-green-500/10 to-green-500/5' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="Shrinkage"
        description="Track and report inventory losses and discrepancies"
        kpiCells={[
          { label: 'TOTAL', value: data.length },
          { label: 'PENDING', value: data.filter(r => r.status === 'pending').length, highlight: true, highlightColor: 'orange' },
          { label: 'INVESTIGATING', value: data.filter(r => r.status === 'investigating').length },
          { label: 'RESOLVED', value: data.filter(r => r.status === 'resolved').length },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search shrinkage records..."
        actionLabel="Report Shrinkage"
        onAction={openCreate}
      />

      {/* ── Dense table with inline expansion ── */}
      {data.length > 0 ? (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">SHRINKAGE ID</DenseTh>
              <DenseTh>Product</DenseTh>
              <DenseTh className="w-16 text-right">Qty</DenseTh>
              <DenseTh className="w-32">Reason</DenseTh>
              <DenseTh className="w-28">Reported By</DenseTh>
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
                  <DenseTr
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    tint={rowTint(item.status)}
                  >
                    <DenseTd mono className="text-gray-500">{item.shrinkageId}</DenseTd>
                    <DenseTd className="text-gray-900 font-medium truncate max-w-[200px]">{item.productName}</DenseTd>
                    <DenseTd mono right className="text-red-600 font-bold">{item.qty}</DenseTd>
                    <DenseTd className="text-gray-500 text-[10px] truncate max-w-[120px]">{item.reason}</DenseTd>
                    <DenseTd className="text-gray-600 text-[11px] truncate">{item.reportedBy}</DenseTd>
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
                  </DenseTr>
                  {isExpanded && (
                    <tr key={`${item.id}-detail`} className="bg-white border-b border-gray-200">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Product</p>
                            <p className="text-gray-900">{item.productName}</p>
                            <p className="text-gray-500 font-mono text-[11px]">{item.productId}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Quantity Lost</p>
                            <p className="text-red-600 font-bold text-base">{item.qty} units</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Reason</p>
                            <p className="text-gray-700">{item.reason}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Reported</p>
                            <p className="text-gray-500">{new Date(item.createdAt).toLocaleString('en-UG')}</p>
                            <p className="text-gray-500 text-[11px] mt-1">By: {item.reportedBy}</p>
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">No shrinkage records found</p>
          <p className="text-xs text-gray-300 mt-1">Report a loss to get started</p>
        </motion.div>
      )}

      {/* ── Detail SlideOver ── */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedRecord?.shrinkageId || ''}
        subtitle="Shrinkage Record Details"
        width="lg"
      >
        {selectedRecord && (
          <div className="space-y-3">
            {/* Status & Reason */}
            <div className="flex items-center gap-3">
              {statusBadge(selectedRecord.status)}
              {reasonBadge(selectedRecord.reason)}
            </div>

            {/* Qty lost - hero */}
            <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-2xl p-6 text-center border border-red-100">
              <AlertOctagon size={24} className="text-red-400 mx-auto mb-2" />
              <p className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Total Quantity Lost</p>
              <p className="text-4xl font-extrabold text-red-600 tabular-nums mt-1">{selectedRecord.qty}</p>
            </div>

            {/* Detail fields */}
            <div className="space-y-4">
              <DetailField label="Product" value={selectedRecord.productName} />
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Reported By" value={selectedRecord.reportedBy} />
                <DetailField label="Status" value={selectedRecord.status} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Date Reported" value={new Date(selectedRecord.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
                <DetailField label="Shrinkage ID" value={selectedRecord.shrinkageId} mono />
              </div>
            </div>

            {/* Product Info */}
            <div className="bg-gray-50/80 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} className="text-red-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Details</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.productName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Product ID: {selectedRecord.productId}</p>
            </div>

            {/* Reporter Info */}
            <div className="bg-gray-50/80 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserCircle size={14} className="text-[#FF6B35]" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reported By</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{selectedRecord.reportedBy}</p>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ── Create Shrinkage SlideOver ── */}
      <DetailSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Report Shrinkage"
        subtitle="Record an inventory loss or discrepancy"
        width="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              Report
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product *</Label>
            <Select value={form.productId} onValueChange={handleProductSelect}>
              <SelectTrigger className="mt-1.5 rounded-xl h-11"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.productId} value={p.productId}>
                    {p.productLabel} (Stock: {p.currentStock})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity Lost *</Label>
            <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="mt-1.5 rounded-xl h-11" placeholder="0" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason *</Label>
            <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
              <SelectTrigger className="mt-1.5 rounded-xl h-11"><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="damage">Damage</SelectItem>
                <SelectItem value="theft">Theft</SelectItem>
                <SelectItem value="expiry">Expiry</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reported By *</Label>
            <Input value={form.reportedBy} onChange={e => setForm({ ...form, reportedBy: e.target.value })} className="mt-1.5 rounded-xl h-11" placeholder="Your name" />
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
