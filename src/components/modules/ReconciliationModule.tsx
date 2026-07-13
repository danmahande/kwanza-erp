'use client'

import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Scale, Banknote, Plus, Trash2, HelpCircle, Layers, ArrowLeft as BackIcon, ChevronRight, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'

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

const emptyForm = { type: 'physical', referenceId: '', expectedQty: '', actualQty: '', varianceReason: '', reconciledBy: '' }

export default function ReconciliationModule() {
  const [data, setData] = useState<ReconRecord[]>([])
  const [view, setView] = useState<'list' | 'add' | 'table'>('list')
  const [tab, setTab] = useState<'physical' | 'cash'>('physical')
  const [selectedRecord, setSelectedRecord] = useState<ReconRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const fetchData = () => { fetch('/api/reconciliation').then(r => r.json()).then(d => setData(Array.isArray(d) ? d : [])) }
  useEffect(() => { fetchData() }, [])

  const physicalRecords = useMemo(() => data.filter(r => r.type === 'physical'), [data])
  const cashRecords = useMemo(() => data.filter(r => r.type === 'cash'), [data])
  const varianceCount = data.filter(r => r.variance !== 0).length

  const handleSubmit = async () => {
    if (!form.expectedQty || !form.actualQty || !form.reconciledBy) { toast.error('Please fill all required fields'); return }
    await fetch('/api/reconciliation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, type: tab }),
    })
    toast.success('Reconciliation recorded')
    setView('list')
    setForm(emptyForm)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/reconciliation?id=${id}`, { method: 'DELETE' })
    toast.success('Record deleted')
    setDetailOpen(false); setSelectedRecord(null); fetchData()
  }

  // ── Render: New Reconciliation (full-page) ──
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
                  <h1 className="text-base font-bold text-gray-900">New Reconciliation</h1>
                  <p className="text-[11px] text-gray-500">{tab === 'physical' ? 'Physical Goods' : 'Cash'} · Match system to reality</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">Reconciliation Details</h2>
                  <p className="text-xs text-gray-500">Enter the expected (system) quantity and the actual (counted) quantity. The system computes the variance automatically.</p>
                </div>
                {/* Type toggle */}
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Type</Label>
                  <div className="flex gap-2">
                    {[
                      { key: 'physical' as const, label: 'Physical Goods', icon: Scale },
                      { key: 'cash' as const, label: 'Cash', icon: Banknote },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => setTab(opt.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === opt.key ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        <opt.icon size={14} /> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Reference ID (optional)</Label>
                  <Input value={form.referenceId} onChange={e => setForm({ ...form, referenceId: e.target.value })} placeholder="e.g. Cycle count batch #12" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Expected Qty <span className="text-red-400">*</span></Label>
                    <Input type="number" value={form.expectedQty} onChange={e => setForm({ ...form, expectedQty: e.target.value })} placeholder="0" className="rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Actual Qty <span className="text-red-400">*</span></Label>
                    <Input type="number" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} placeholder="0" className="rounded-xl" />
                  </div>
                </div>
                {form.expectedQty && form.actualQty && (
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Variance</p>
                    <p className={`text-lg font-mono font-bold ${parseFloat(form.expectedQty) - parseFloat(form.actualQty) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {parseFloat(form.expectedQty) - parseFloat(form.actualQty)}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Variance Reason (if any)</Label>
                  <Input value={form.varianceReason} onChange={e => setForm({ ...form, varianceReason: e.target.value })} placeholder="e.g. 2 units damaged" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Reconciled By <span className="text-red-400">*</span></Label>
                  <Input value={form.reconciledBy} onChange={e => setForm({ ...form, reconciledBy: e.target.value })} placeholder="Your name" className="rounded-xl" />
                </div>
              </div>
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSubmit}>Record</Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: All Reconciliation (full-page table) ──
  if (view === 'table') {
    const currentRecords = tab === 'physical' ? physicalRecords : cashRecords
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="table">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><Layers size={16} className="text-[#FF6B35]" /> All Reconciliation</h1>
                  <p className="text-[11px] text-gray-500">{data.length} records · Click any row for details</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto space-y-3">
                {/* Filter chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter size={12} className="text-gray-400" />
                  {[
                    { key: 'physical' as const, label: 'Physical Goods', icon: Scale },
                    { key: 'cash' as const, label: 'Cash', icon: Banknote },
                  ].map(chip => {
                    const isActive = tab === chip.key
                    const count = chip.key === 'physical' ? physicalRecords.length : cashRecords.length
                    return (
                      <button key={chip.key} onClick={() => setTab(chip.key)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        <chip.icon size={10} /> {chip.label}
                        <span className={`px-1 rounded-full text-[9px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
                      </button>
                    )
                  })}
                </div>
                {/* Table */}
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
                      {currentRecords.map((r, i) => {
                        const hasVariance = r.variance !== 0
                        return (
                          <AnimatedDenseTr key={r.id} index={i} onClick={() => { setSelectedRecord(r); setDetailOpen(true) }}
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
                          </AnimatedDenseTr>
                        )
                      })}
                    </tbody>
                  </DenseTable>
                )}
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: Overview ──
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Reconciliation"
            description="Reconcile physical goods and cash balances"
            kpiCells={[
              { label: 'PHYSICAL', value: physicalRecords.length },
              { label: 'CASH', value: cashRecords.length },
              { label: 'WITH VARIANCE', value: varianceCount, highlight: varianceCount > 0, highlightColor: 'red' as const },
            ]}
          />

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={() => { setForm(emptyForm); setView('add') }}>
              <Plus size={12} className="mr-1" /> New Reconciliation
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setView('table')} disabled={data.length === 0}>
              <Layers size={12} className="mr-1" /> View All
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={12} className="mr-1" /> Help
            </Button>
          </div>

          {/* Variance alert */}
          {varianceCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
              <Scale size={16} className="text-red-600 shrink-0" />
              <span className="text-xs text-red-800 font-medium flex-1">{varianceCount} record(s) with variance — investigate discrepancies.</span>
              <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-md bg-white" onClick={() => setView('table')}>View All <ChevronRight size={11} className="ml-1" /></Button>
            </div>
          )}

          {/* Empty state */}
          {data.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <Scale size={28} className="text-orange-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No reconciliation records</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                Create your first reconciliation to match system numbers with reality. Do this at least monthly for high-value products.
              </p>
              <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={() => { setForm(emptyForm); setView('add') }}>
                <Plus size={14} className="mr-1.5" /> New Reconciliation
              </Button>
            </div>
          )}

          {/* Recent records (inline) */}
          {data.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {data.slice(0, 10).map(r => {
                  const hasVariance = r.variance !== 0
                  return (
                    <div key={r.id} onClick={() => { setSelectedRecord(r); setDetailOpen(true) }} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${hasVariance ? 'bg-red-500' : 'bg-green-500'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-900">{r.referenceId || `#${r.id.slice(-6)}`}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{r.type === 'physical' ? 'Physical' : 'Cash'}</span>
                      </div>
                      <span className={`text-[11px] font-mono font-bold shrink-0 ${hasVariance ? 'text-red-600' : 'text-green-600'}`}>
                        {hasVariance ? `${r.variance > 0 ? '+' : ''}${fmt(r.variance)}` : '✓'}
                      </span>
                      <ChevronRight size={14} className="text-gray-300 shrink-0" />
                    </div>
                  )
                })}
                {data.length > 10 && (
                  <button onClick={() => setView('table')} className="w-full px-4 py-2 text-center text-[11px] text-[#FF6B35] font-semibold hover:bg-orange-50">
                    View all {data.length} records →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Detail slide-over */}
          <DetailSlideOver
            open={detailOpen}
            onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
            title={selectedRecord?.type === 'physical' ? 'Physical Goods' : 'Cash'}
            subtitle={selectedRecord?.referenceId || selectedRecord?.id.slice(-6)}
            width="lg"
            footer={
              <div className="flex items-center justify-between w-full">
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

          {/* Help dialog */}
          <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
            <AlertDialogContent className="rounded-2xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Reconciliation</AlertDialogTitle>
                <AlertDialogDescription>
                  Match system numbers to reality. Do physical counts of stock or cash, enter the counted quantity, and the system computes the variance.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">New Reconciliation</p>
                  <p>Opens a full-page form. Choose type (Physical Goods or Cash), enter expected (system) qty and actual (counted) qty. Variance is computed automatically.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">View All</p>
                  <p>Opens a full-page table with all records, filterable by type (Physical Goods, Cash). Click any row for details.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Variance</p>
                  <p>Green ✓ = match. Red = surplus (more than expected). Amber = shortage (less than expected). Investigate all variances.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Profile</p>
                  <p>Click any row to see full details: type, reference, expected, actual, variance, reason, who reconciled, and when.</p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
