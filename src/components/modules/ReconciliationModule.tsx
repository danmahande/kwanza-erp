'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import {
  Scale, Banknote, Plus, ClipboardCheck, AlertCircle, User, Calendar, X,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

// ── Types ──
interface ReconRecord {
  id: string
  type: string
  referenceId: string | null
  expectedQty: number
  actualQty: number
  variance: number
  varianceReason: string | null
  reconciledBy: string
  date: string
  createdAt: string
}

// ── Helpers ──
const fmt = (n: number) => { if (n == null || isNaN(n)) return '0'; return n.toLocaleString() }

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function ReconciliationModule() {
  const [data, setData] = useState<ReconRecord[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('physical')
  const [selectedRecord, setSelectedRecord] = useState<ReconRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [form, setForm] = useState({
    type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '',
  })

  const fetchData = () => { fetch('/api/reconciliation').then(r => r.json()).then(setData) }
  useEffect(() => { fetchData() }, [])

  const physicalRecords = useMemo(() => data.filter(r => r.type === 'physical'), [data])
  const cashRecords = useMemo(() => data.filter(r => r.type === 'cash'), [data])
  const currentRecords = tab === 'physical' ? physicalRecords : cashRecords

  const handleSubmit = async () => {
    if (!form.expectedQty || !form.actualQty || !form.reconciledBy) { toast.error('Please fill all required fields'); return }
    await fetch('/api/reconciliation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, type: tab }),
    })
    toast.success('Reconciliation recorded')
    setOpen(false)
    setForm({ type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' })
    fetchData()
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/reconciliation?id=${id}`, { method: 'DELETE' })
      toast.success('Record deleted')
      setDetailOpen(false)
      setSelectedRecord(null)
      fetchData()
    } catch { toast.error('Failed to delete') }
  }

  const statValues: Record<string, number> = {
    physical: physicalRecords.length,
    cash: cashRecords.length,
    variance: data.filter(r => r.variance !== 0).length,
  }

  const headerStats = [
    { label: 'Physical Records', value: physicalRecords.length, icon: Scale, color: '#FF6B35', bg: 'bg-orange-500/15', border: 'border-orange-500/20', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Cash Records', value: cashRecords.length, icon: Banknote, color: '#1B2A4A', bg: 'bg-slate-600/15', border: 'border-slate-600/20', gradient: 'from-slate-600/10 to-slate-600/5' },
    { label: 'With Variance', value: statValues.variance, icon: AlertCircle, color: '#EF4444', bg: 'bg-red-500/15', border: 'border-red-500/20', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  const variancePreview = useMemo(() => {
    if (!form.expectedQty || !form.actualQty) return null
    const expected = parseFloat(form.expectedQty)
    const actual = parseFloat(form.actualQty)
    if (isNaN(expected) || isNaN(actual)) return null
    return expected - actual
  }, [form.expectedQty, form.actualQty])

  return (
    <div className="space-y-4">
      {/* ── Office Header ── */}
      <OfficeHeader
        title="Reconciliation Office"
        description="Reconcile physical goods and cash balances"
        icon={Scale}
        stats={headerStats}
        actionLabel="New Reconciliation"
        onAction={() => {
          setForm({ type: tab, referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' })
          setOpen(true)
        }}
      >
        {/* Tab switcher */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('physical')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === 'physical' ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Scale size={14} /> Physical
          </button>
          <button
            onClick={() => setTab('cash')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === 'cash' ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Banknote size={14} /> Cash
          </button>
        </div>
      </OfficeHeader>

      {/* ── Card Grid ── */}
      {currentRecords.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardCheck size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No {tab} records found</p>
          <p className="text-xs mt-1">Create a new reconciliation to get started</p>
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
          {currentRecords.map((record) => {
            const hasVariance = record.variance !== 0
            const isPositive = record.variance > 0
            return (
              <motion.div
                key={record.id}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className={`group bg-white rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#FF6B35]/30 ${hasVariance ? 'border-red-200/60' : 'border-green-200/60'}`}
                onClick={() => { setSelectedRecord(record); setDetailOpen(true) }}
              >
                {/* Top: Reference + Variance Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
                    {record.referenceId || `#${record.id.slice(-6)}`}
                  </span>
                  {hasVariance ? (
                    <Badge className={`${isPositive ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} text-xs font-medium`}>
                      {isPositive ? `+${record.variance}` : String(record.variance)}
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 text-xs font-medium">Match</Badge>
                  )}
                </div>

                {/* Expected vs Actual */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Expected</p>
                    <p className="text-lg font-bold text-gray-800">{record.expectedQty.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Actual</p>
                    <p className="text-lg font-bold text-gray-800">{record.actualQty.toLocaleString()}</p>
                  </div>
                </div>

                {/* Variance highlight bar */}
                {hasVariance && (
                  <div className={`rounded-lg px-3 py-2 mb-3 ${isPositive ? 'bg-red-50 border border-red-200/60' : 'bg-amber-50 border border-amber-200/60'}`}>
                    <div className="flex items-center gap-1.5">
                      <AlertCircle size={12} className={isPositive ? 'text-red-500' : 'text-amber-500'} />
                      <span className="text-xs font-medium text-gray-600">Variance: {isPositive ? '+' : ''}{record.variance}</span>
                    </div>
                    {record.varianceReason && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{record.varianceReason}</p>}
                  </div>
                )}

                {!hasVariance && (
                  <div className="rounded-lg px-3 py-2 mb-3 bg-green-50 border border-green-200/60">
                    <div className="flex items-center gap-1.5">
                      <ClipboardCheck size={12} className="text-green-600" />
                      <span className="text-xs font-medium text-green-700">Fully reconciled</span>
                    </div>
                  </div>
                )}

                {/* Bottom */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1"><User size={10} />{record.reconciledBy}</div>
                  <div className="flex items-center gap-1"><Calendar size={10} />{new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* ── Detail SlideOver ── */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title="Reconciliation Details"
        subtitle={selectedRecord?.referenceId || selectedRecord?.id.slice(-6)}
        width="lg"
        footer={selectedRecord ? (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"><X size={14} className="mr-1.5" />Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this reconciliation?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(selectedRecord.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={() => { setDetailOpen(false); setSelectedRecord(null) }} className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white rounded-xl">Close</Button>
          </div>
        ) : undefined}
      >
        {selectedRecord && (
          <div className="space-y-5">
            {/* Type Badge */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs font-medium ${selectedRecord.type === 'physical' ? 'border-orange-300 text-orange-700' : 'border-slate-300 text-slate-700'}`}>
                {selectedRecord.type === 'physical' ? <Scale size={12} className="mr-1" /> : <Banknote size={12} className="mr-1" />}
                {selectedRecord.type === 'physical' ? 'Physical Goods' : 'Cash'}
              </Badge>
              {selectedRecord.variance !== 0 ? (
                <Badge className={selectedRecord.variance > 0 ? 'bg-red-100 text-red-700 text-xs' : 'bg-amber-100 text-amber-700 text-xs'}>
                  Variance: {selectedRecord.variance > 0 ? '+' : ''}{selectedRecord.variance}
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700 text-xs">No Variance</Badge>
              )}
            </div>

            {/* Reference */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Reference</p>
              <p className="text-sm font-mono font-semibold text-gray-800">{selectedRecord.referenceId || '—'}</p>
            </div>

            {/* Expected vs Actual */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200/60 rounded-xl p-5 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Expected</p>
                <p className="text-3xl font-bold text-gray-900">{selectedRecord.expectedQty.toLocaleString()}</p>
              </div>
              <div className={`rounded-xl p-5 text-center border ${selectedRecord.variance === 0 ? 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200/60' : 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200/60'}`}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Actual</p>
                <p className="text-3xl font-bold text-gray-900">{selectedRecord.actualQty.toLocaleString()}</p>
              </div>
            </div>

            {/* Variance */}
            {selectedRecord.variance !== 0 && (
              <div className={`rounded-xl p-4 border ${selectedRecord.variance > 0 ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200/60' : 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200/60'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle size={16} className={selectedRecord.variance > 0 ? 'text-red-500' : 'text-amber-500'} />
                  <span className="text-xs font-medium text-gray-600">Variance</span>
                </div>
                <p className={`text-2xl font-bold ${selectedRecord.variance > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {selectedRecord.variance > 0 ? '+' : ''}{selectedRecord.variance}
                </p>
              </div>
            )}

            {/* Reason */}
            {selectedRecord.varianceReason && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Reason</p>
                <p className="text-sm text-gray-700">{selectedRecord.varianceReason}</p>
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Reconciled By</p>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><User size={14} />{selectedRecord.reconciledBy}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Date</p>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Calendar size={14} />{new Date(selectedRecord.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ── Create New SlideOver ── */}
      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={`New Reconciliation — ${tab === 'physical' ? 'Physical Goods' : 'Cash'}`}
        subtitle="Record a new reconciliation"
        width="lg"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Reference ID */}
          <div>
            <Label className="text-xs font-medium text-gray-600">Reference ID</Label>
            <Input value={form.referenceId} onChange={e => setForm({ ...form, referenceId: e.target.value })} placeholder="Product or payment reference" className="mt-1.5 rounded-xl" />
          </div>

          {/* Expected & Actual */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-gray-600">Expected *</Label>
              <Input type="number" value={form.expectedQty} onChange={e => setForm({ ...form, expectedQty: e.target.value })} placeholder="Expected amount" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-600">Actual *</Label>
              <Input type="number" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} placeholder="Actual amount" className="mt-1.5 rounded-xl" />
            </div>
          </div>

          {/* Variance Preview */}
          <AnimatePresence>
            {variancePreview !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className={`p-4 rounded-xl border ${variancePreview === 0
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200/60'
                  : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={18} className={variancePreview === 0 ? 'text-green-600' : 'text-red-500'} />
                  <span className="text-sm font-medium text-gray-600">Variance Preview</span>
                </div>
                <p className={`text-lg font-bold mt-1 ${variancePreview === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {variancePreview === 0
                    ? 'No variance — fully reconciled'
                    : `${variancePreview > 0 ? '+' : ''}${variancePreview}`
                  }
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Variance Reason */}
          <div>
            <Label className="text-xs font-medium text-gray-600">Variance Reason</Label>
            <Textarea value={form.varianceReason} onChange={e => setForm({ ...form, varianceReason: e.target.value })} placeholder="Explain the variance if any..." className="mt-1.5 rounded-xl min-h-[80px]" />
          </div>

          {/* Reconciled By */}
          <div>
            <Label className="text-xs font-medium text-gray-600">Reconciled By *</Label>
            <Input value={form.reconciledBy} onChange={e => setForm({ ...form, reconciledBy: e.target.value })} placeholder="Your name" className="mt-1.5 rounded-xl" />
          </div>
        </div>
      </DetailSlideOver>
    </div>
  )
}
