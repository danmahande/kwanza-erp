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
  CreditCard, Wallet, CheckCircle2, Clock, Search, Layers, Banknote,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
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

  const stats = [
    { label: 'Unpaid Statements', value: unpaidStatements.length, icon: Clock, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Total Batches', value: batches.length, icon: Layers, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Disbursed', value: formatCurrencyCompact(totalDisbursed), icon: CheckCircle2, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Pending Disbursement', value: formatCurrencyCompact(totalPending), icon: Wallet, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Payment Batches"
        description="Group merchant statements into batch payouts to the bank"
        icon={CreditCard}
        stats={stats}
        actionLabel={selectedIds.size > 0 ? `Create Batch (${selectedIds.size})` : 'Create Batch'}
        onAction={() => selectedIds.size > 0 ? setCreateOpen(true) : toast.error('Select statements first')}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by merchant, statement, or batch..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Unpaid Statements</h3>
            <p className="text-xs text-gray-500">Select statements to include in a new payment batch</p>
          </div>
          {filteredUnpaid.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={toggleAll}>
              {selectedIds.size === filteredUnpaid.length ? 'Deselect All' : 'Select All'}
            </Button>
          )}
        </div>
        {filteredUnpaid.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No unpaid statements. All merchants are settled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 w-10"></th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Statement</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Merchant</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Period</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnpaid.map(s => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${selectedIds.has(s.id) ? 'bg-orange-50' : ''}`}
                    onClick={() => toggleSelect(s.id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-[#FF6B35] focus:ring-[#FF6B35]"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.statementId}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.merchantName}</td>
                    <td className="px-4 py-3 text-gray-600">{s.period}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(s.netPayable)}</td>
                  </tr>
                ))}
              </tbody>
              {selectedIds.size > 0 && (
                <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-orange-700">Selected Total:</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-700 text-base">{formatCurrency(selectedTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Payment Batches</h3>
          <p className="text-xs text-gray-500">Click a batch to view details or mark as disbursed</p>
        </div>
        {filteredBatches.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No payment batches yet. Create one from unpaid statements above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Batch ID</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Method</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Merchants</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Total</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => (
                  <tr
                    key={b.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setViewBatch(b)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.batchId}</td>
                    <td className="px-4 py-3 text-gray-600">{b.paymentMethod}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{b.merchantCount}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={
                        b.status === 'disbursed' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[10px]'
                        : b.status === 'submitted' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]'
                        : b.status === 'failed' ? 'bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px]'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[10px]'
                      }>
                        {b.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetailSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Payment Batch"
        subtitle={`${selectedIds.size} statements selected · Total: ${formatCurrency(selectedTotal)}`}
        width="md"
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
        title={viewBatch ? `Batch ${viewBatch.batchId}` : ''}
        subtitle={viewBatch ? `${viewBatch.merchantCount} merchants · ${formatCurrency(viewBatch.totalAmount)} · ${viewBatch.paymentMethod}` : ''}
        width="md"
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
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-400/30">
              <p className="text-xs uppercase tracking-wider text-blue-700 font-semibold mb-1">Batch Total</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(viewBatch.totalAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">{viewBatch.merchantCount} merchants · {viewBatch.paymentMethod}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Status</p>
                <Badge className={
                  viewBatch.status === 'disbursed' ? 'bg-green-100 text-green-700 border-0'
                  : viewBatch.status === 'submitted' ? 'bg-blue-100 text-blue-700 border-0'
                  : 'bg-gray-100 text-gray-700 border-0'
                }>
                  {viewBatch.status.toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Created</p>
                <p className="text-gray-700">{new Date(viewBatch.createdAt).toLocaleString()}</p>
              </div>
              {viewBatch.disbursedAt && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Disbursed</p>
                  <p className="text-gray-700">{new Date(viewBatch.disbursedAt).toLocaleString()}</p>
                </div>
              )}
              {viewBatch.bankReference && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Bank Reference</p>
                  <p className="font-mono text-gray-700">{viewBatch.bankReference}</p>
                </div>
              )}
            </div>
            {viewBatch.notes && (
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Notes</p>
                <p className="text-sm text-gray-700">{viewBatch.notes}</p>
              </div>
            )}
          </div>
        )}
      </DetailSlideOver>
    </motion.div>
  )
}
