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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  CreditCard, Wallet, CheckCircle2, Clock, Search, Layers, Banknote, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface Statement {
  id: string
  statementId: string
  merchantId: string
  merchantName: string
  period: string
  netPayable: number
  isPaid: boolean
  status: string
  createdAt: string
}

interface PaymentBatch {
  id: string
  batchId: string
  totalAmount: number
  merchantCount: number
  paymentMethod: string
  bankReference: string | null
  status: string
  disbursedAt: string | null
  notes: string | null
  recordedBy: string
  createdAt: string
}

export default function PaymentBatchesModule() {
  const [unpaidStatements, setUnpaidStatements] = useState<Statement[]>([])
  const [batches, setBatches] = useState<PaymentBatch[]>([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [viewBatch, setViewBatch] = useState<PaymentBatch | null>(null)
  const [form, setForm] = useState({
    paymentMethod: 'bank_transfer',
    notes: '',
  })
  const [disburseForm, setDisburseForm] = useState({ bankReference: '' })

  const fetchData = () => {
    fetch('/api/merchant-statements').then(r => r.json()).then((stmts: Statement[]) => {
      setUnpaidStatements(Array.isArray(stmts) ? stmts.filter(s => !s.isPaid) : [])
    })
    fetch('/api/payment-batches').then(r => r.json()).then(d => {
      setBatches(Array.isArray(d) ? d : [])
    })
  }

  useEffect(() => { fetchData() }, [])

  const filteredUnpaid = unpaidStatements.filter(s =>
    !search || s.merchantName.toLowerCase().includes(search.toLowerCase()) || s.statementId.toLowerCase().includes(search.toLowerCase())
  )

  const filteredBatches = batches.filter(b =>
    !search || b.batchId.toLowerCase().includes(search.toLowerCase()) || b.bankReference?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedTotal = unpaidStatements
    .filter(s => selectedIds.has(s.id))
    .reduce((sum, s) => sum + s.netPayable, 0)

  const totalDisbursed = batches
    .filter(b => b.status === 'disbursed')
    .reduce((s, b) => s + b.totalAmount, 0)

  const totalPending = batches
    .filter(b => b.status !== 'disbursed')
    .reduce((s, b) => s + b.totalAmount, 0)

  const kpiCells = [
    { label: 'UNPAID STATEMENTS', value: unpaidStatements.length, highlight: unpaidStatements.length > 0, highlightColor: 'orange' as const },
    { label: 'BATCHES', value: batches.length },
    { label: 'DISBURSED', value: formatCurrencyCompact(totalDisbursed) },
    { label: 'PENDING', value: formatCurrencyCompact(totalPending), highlight: totalPending > 0, highlightColor: 'orange' as const },
  ]

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredUnpaid.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredUnpaid.map(s => s.id)))
    }
  }

  const handleCreateBatch = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one statement to include in the batch')
      return
    }
    try {
      const res = await fetch('/api/payment-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementIds: Array.from(selectedIds),
          paymentMethod: form.paymentMethod,
          recordedBy: 'admin',
          notes: form.notes || undefined,
        }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Batch created: ${result.paymentsCreated} payments totalling ${formatCurrency(result.totalAmount)}`)
        setCreateOpen(false)
        setSelectedIds(new Set())
        setForm({ paymentMethod: 'bank_transfer', notes: '' })
        fetchData()
      } else {
        toast.error(result.error || 'Failed to create batch')
      }
    } catch {
      toast.error('Failed to create batch')
    }
  }

  const handleDisburse = async () => {
    if (!viewBatch) return
    try {
      const res = await fetch('/api/payment-batches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewBatch.id,
          status: 'disbursed',
          bankReference: disburseForm.bankReference || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Batch marked as disbursed')
        setViewBatch(null)
        setDisburseForm({ bankReference: '' })
        fetchData()
      } else {
        toast.error('Failed to mark as disbursed')
      }
    } catch {
      toast.error('Failed to mark as disbursed')
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Payment Batches"
        description="Group unpaid statements into batch payouts"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by merchant, statement, or batch..."
        actionLabel={selectedIds.size > 0 ? `Create Batch (${selectedIds.size})` : 'Create Batch'}
        onAction={() => selectedIds.size > 0 ? setCreateOpen(true) : toast.error('Select statements first')}
      />

      {/* Unpaid Statements — DenseTable */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Unpaid Statements</span>
          {filteredUnpaid.length > 0 && (
            <button onClick={toggleAll} className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-medium">
              {selectedIds.size === filteredUnpaid.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
        {filteredUnpaid.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No unpaid statements. All merchants are settled.</div>
        ) : (
          <DenseTable>
            <thead>
              <tr>
                <DenseTh className="w-8"></DenseTh>
                <DenseTh className="w-28">Statement</DenseTh>
                <DenseTh>Merchant</DenseTh>
                <DenseTh className="w-20">Period</DenseTh>
                <DenseTh className="w-28 text-right">Net Payable</DenseTh>
              </tr>
            </thead>
            <tbody>
              {filteredUnpaid.map(s => (
                <DenseTr key={s.id} onClick={() => toggleSelect(s.id)} selected={selectedIds.has(s.id)}>
                  <DenseTd><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" /></DenseTd>
                  <DenseTd mono className="text-gray-500">{s.statementId}</DenseTd>
                  <DenseTd className="text-gray-900 font-medium">{s.merchantName}</DenseTd>
                  <DenseTd mono className="text-gray-500">{s.period}</DenseTd>
                  <DenseTd mono right className="text-gray-900 font-bold">{formatCurrencyCompact(s.netPayable)}</DenseTd>
                </DenseTr>
              ))}
            </tbody>
            {selectedIds.size > 0 && (
              <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                <tr style={{ height: '32px' }}>
                  <td colSpan={4} className="px-3 text-right text-[10px] font-semibold text-orange-700 uppercase">Selected Total:</td>
                  <td className="px-3 text-right font-mono font-bold text-orange-700">{formatCurrency(selectedTotal)}</td>
                </tr>
              </tfoot>
            )}
          </DenseTable>
        )}
      </div>

      {/* Payment Batches — DenseTable */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Payment Batches</span>
        {filteredBatches.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No payment batches yet. Create one from unpaid statements above.</div>
        ) : (
          <DenseTable>
            <thead>
              <tr>
                <DenseTh className="w-32">Batch ID</DenseTh>
                <DenseTh className="w-28">Method</DenseTh>
                <DenseTh className="w-16 text-right">Merchants</DenseTh>
                <DenseTh className="w-28 text-right">Total</DenseTh>
                <DenseTh className="w-24 text-center">Status</DenseTh>
                <DenseTh className="w-28">Created</DenseTh>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map(b => (
                <DenseTr key={b.id} onClick={() => setViewBatch(b)} tint={b.status === 'disbursed' ? 'bg-green-50/30' : ''}>
                  <DenseTd mono className="text-gray-500">{b.batchId}</DenseTd>
                  <DenseTd className="text-gray-600">{b.paymentMethod}</DenseTd>
                  <DenseTd mono right className="text-gray-700">{b.merchantCount}</DenseTd>
                  <DenseTd mono right className="text-gray-900 font-bold">{formatCurrencyCompact(b.totalAmount)}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                      b.status === 'disbursed' ? 'bg-green-100 text-green-700'
                      : b.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                      : b.status === 'failed' ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                    }`}>{b.status.toUpperCase()}</span>
                  </DenseTd>
                  <DenseTd className="text-gray-500 text-[10px]">{new Date(b.createdAt).toLocaleDateString('en-UG')}</DenseTd>
                </DenseTr>
              ))}
            </tbody>
          </DenseTable>
        )}
      </div>

      <DetailSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Payment Batch"
        subtitle={`${selectedIds.size} statements selected · Total: ${formatCurrency(selectedTotal)}`}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleCreateBatch} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              <Banknote size={14} className="mr-2" /> Create Batch
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800">
            <InfoTip term="paymentBatch" size={12} className="mr-1" />
            This will create one MerchantPayment per selected statement and mark them all as paid in a single batch.
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Payment Method</Label>
            <select
              value={form.paymentMethod}
              onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money (MTN/Airtel)</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Any reference notes for this batch"
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      <DetailSlideOver
        open={!!viewBatch}
        onClose={() => { setViewBatch(null); setDisburseForm({ bankReference: '' }) }}
        title={viewBatch ? 'Payment Batch' : ''}
        subtitle={viewBatch ? viewBatch.batchId : ''}
                width="lg"
        footer={
          viewBatch && viewBatch.status !== 'disbursed' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white rounded-xl ml-auto">
                  <CheckCircle2 size={14} className="mr-2" /> Mark as Disbursed
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Disbursement</AlertDialogTitle>
                  <AlertDialogDescription>
                    Mark batch {viewBatch.batchId} ({formatCurrency(viewBatch.totalAmount)}) as disbursed?
                    This will mark all linked merchant payments as completed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                  <Label className="text-sm font-medium mb-1.5 block">Bank Reference (optional)</Label>
                  <Input
                    value={disburseForm.bankReference}
                    onChange={e => setDisburseForm({ bankReference: e.target.value })}
                    placeholder="Bank transaction / reference number"
                    className="rounded-xl"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisburse} className="bg-green-600 hover:bg-green-700 rounded-xl">
                    Confirm Disbursement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button variant="outline" onClick={() => setViewBatch(null)} className="rounded-xl ml-auto">Close</Button>
          )
        }
      >
        {viewBatch && (
          <div className="space-y-3">
            {/* Single dense card — batch details */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Batch Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Batch ID</span>
                  <span className="font-mono text-gray-700">{viewBatch.batchId}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Status</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                    viewBatch.status === 'disbursed' ? 'bg-green-100 text-green-700'
                    : viewBatch.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>{viewBatch.status.toUpperCase()}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Payment Method</span>
                  <span className="font-medium text-gray-900">{viewBatch.paymentMethod}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Merchant Count</span>
                  <span className="font-mono font-bold text-gray-900">{viewBatch.merchantCount}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="font-mono font-bold text-lg text-gray-900">{formatCurrency(viewBatch.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Recorded By</span>
                  <span className="text-gray-700">{viewBatch.recordedBy}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-700">{new Date(viewBatch.createdAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                {viewBatch.disbursedAt && (
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Disbursed At</span>
                    <span className="text-gray-700">{new Date(viewBatch.disbursedAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                )}
                {viewBatch.bankReference && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-gray-500">Bank Reference</span>
                    <span className="font-mono text-gray-700">{viewBatch.bankReference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes card (only if notes exist) */}
            {viewBatch.notes && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-xs text-gray-700">{viewBatch.notes}</p>
              </div>
            )}
          </div>
        )}
      </DetailSlideOver>
    </motion.div>
  )
}
