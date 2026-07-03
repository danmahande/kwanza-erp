'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Scale, Banknote, Plus, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

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

const fmt = (n: number) => { if (n == null || isNaN(n)) return '0'; return n.toLocaleString() }

export default function ReconciliationModule() {
  const [data, setData] = useState<ReconRecord[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'physical' | 'cash'>('physical')
  const [selectedRecord, setSelectedRecord] = useState<ReconRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [form, setForm] = useState({
    type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '',
  })

  const fetchData = () => { fetch('/api/reconciliation').then(r => r.json()).then(d => setData(Array.isArray(d) ? d : [])) }
  useEffect(() => { fetchData() }, [])

  const physicalRecords = useMemo(() => data.filter(r => r.type === 'physical'), [data])
  const cashRecords = useMemo(() => data.filter(r => r.type === 'cash'), [data])
  const currentRecords = tab === 'physical' ? physicalRecords : cashRecords
  const varianceCount = data.filter(r => r.variance !== 0).length

  const kpiCells = [
    { label: 'PHYSICAL', value: physicalRecords.length },
    { label: 'CASH', value: cashRecords.length },
    { label: 'WITH VARIANCE', value: varianceCount, highlight: varianceCount > 0, highlightColor: 'red' as const },
  ]

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
    await fetch(`/api/reconciliation?id=${id}`, { method: 'DELETE' })
    toast.success('Record deleted')
    setDetailOpen(false); setSelectedRecord(null); fetchData()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Reconciliation"
        description="Reconcile physical goods and cash balances"
        kpiCells={kpiCells}
        actionLabel="New Reconciliation"
        onAction={() => {
          setForm({ type: tab, referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' })
          setOpen(true)
        }}
      />

      {/* Tab filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'physical' as const, label: 'Physical Goods', icon: Scale },
          { key: 'cash' as const, label: 'Cash', icon: Banknote },
        ].map(chip => {
          const isActive = tab === chip.key
          const Icon = chip.icon
          const count = chip.key === 'physical' ? physicalRecords.length : cashRecords.length
          return (
            <button key={chip.key} onClick={() => setTab(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Icon size={12} /> {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Dense table */}
      {currentRecords.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No {tab} reconciliation records found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-28">Reference</DenseTh>
              <DenseTh className="w-20 text-right">Expected</DenseTh>
              <DenseTh className="w-20 text-right">Actual</DenseTh>
              <DenseTh className="w-20 text-right">Variance</DenseTh>
              <DenseTh>Reason</DenseTh>
              <DenseTh className="w-24">By</DenseTh>
              <DenseTh className="w-24">Date</DenseTh>
            </tr>
          </thead>
          <tbody>
            {currentRecords.map(r => {
              const hasVariance = r.variance !== 0
              return (
                <DenseTr key={r.id} onClick={() => { setSelectedRecord(r); setDetailOpen(true) }}
                  tint={hasVariance ? (r.variance > 0 ? 'bg-red-50/30' : 'bg-amber-50/30') : 'bg-green-50/20'}>
                  <DenseTd mono className="text-gray-500 text-[10px]">{r.referenceId || `#${r.id.slice(-6)}`}</DenseTd>
                  <DenseTd mono right className="text-gray-700">{fmt(r.expectedQty)}</DenseTd>
                  <DenseTd mono right className="text-gray-700">{fmt(r.actualQty)}</DenseTd>
                  <DenseTd mono right className={hasVariance ? (r.variance > 0 ? 'text-red-600 font-bold' : 'text-amber-600 font-bold') : 'text-green-600 font-bold'}>
                    {hasVariance ? `${r.variance > 0 ? '+' : ''}${fmt(r.variance)}` : '✓'}
                  </DenseTd>
                  <DenseTd className="text-gray-500 text-[11px] truncate max-w-[150px]">{r.varianceReason || '—'}</DenseTd>
                  <DenseTd className="text-gray-500 text-[10px]">{r.reconciledBy}</DenseTd>
                  <DenseTd className="text-gray-500 text-[10px]">{new Date(r.date).toLocaleDateString('en-UG')}</DenseTd>
                </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Detail slide-over — single dense card */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title={selectedRecord?.referenceId || 'Reconciliation'}
        subtitle={selectedRecord ? `${selectedRecord.type === 'physical' ? 'Physical Goods' : 'Cash'} Reconciliation` : ''}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {selectedRecord && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl" onClick={() => handleDelete(selectedRecord.id)}>
                <Trash2 size={14} className="mr-1.5" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => { setDetailOpen(false); setSelectedRecord(null) }} className="rounded-xl ml-auto">Close</Button>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Reconciliation Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium text-gray-900">{selectedRecord.type === 'physical' ? 'Physical Goods' : 'Cash'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Reference</span>
                  <span className="font-mono text-gray-700">{selectedRecord.referenceId || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Expected</span>
                  <span className="font-mono font-bold text-gray-900 text-lg">{fmt(selectedRecord.expectedQty)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Actual</span>
                  <span className={`font-mono font-bold text-lg ${selectedRecord.variance === 0 ? 'text-green-700' : 'text-gray-900'}`}>{fmt(selectedRecord.actualQty)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Variance</span>
                  <span className={`font-mono font-bold text-lg ${selectedRecord.variance === 0 ? 'text-green-700' : selectedRecord.variance > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {selectedRecord.variance === 0 ? '✓ Match' : `${selectedRecord.variance > 0 ? '+' : ''}${fmt(selectedRecord.variance)}`}
                  </span>
                </div>
                {selectedRecord.varianceReason && (
                  <div className="py-1 border-b border-gray-100">
                    <span className="text-gray-500">Reason</span>
                    <p className="text-gray-700 mt-0.5">{selectedRecord.varianceReason}</p>
                  </div>
                )}
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Reconciled By</span>
                  <span className="text-gray-700">{selectedRecord.reconciledBy}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Date</span>
                  <span className="text-gray-700">{new Date(selectedRecord.date).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* Create slide-over */}
      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="New Reconciliation"
        subtitle={tab === 'physical' ? 'Physical Goods' : 'Cash'}
        width="md"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Record</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium mb-1 block">Reference ID (optional)</Label>
            <Input value={form.referenceId} onChange={e => setForm({ ...form, referenceId: e.target.value })} placeholder="e.g. Cycle count batch #12" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1 block">Expected Qty <span className="text-red-400">*</span></Label>
              <Input type="number" value={form.expectedQty} onChange={e => setForm({ ...form, expectedQty: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Actual Qty <span className="text-red-400">*</span></Label>
              <Input type="number" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
          </div>
          {form.expectedQty && form.actualQty && (
            <p className="text-xs text-gray-500">
              Variance: <span className={`font-mono font-bold ${parseFloat(form.expectedQty) - parseFloat(form.actualQty) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                {parseFloat(form.expectedQty) - parseFloat(form.actualQty)}
              </span>
            </p>
          )}
          <div>
            <Label className="text-xs font-medium mb-1 block">Variance Reason (if any)</Label>
            <Input value={form.varianceReason} onChange={e => setForm({ ...form, varianceReason: e.target.value })} placeholder="e.g. 2 units damaged" className="rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1 block">Reconciled By <span className="text-red-400">*</span></Label>
            <Input value={form.reconciledBy} onChange={e => setForm({ ...form, reconciledBy: e.target.value })} placeholder="Your name" className="rounded-xl" />
          </div>
        </div>
      </DetailSlideOver>
    </motion.div>
  )
}
