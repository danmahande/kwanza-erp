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
import { Trash2, Filter, CreditCard, Banknote, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'

interface Merchant { id: string; merchantId: string; businessName: string }

interface Payment {
  id: string
  paymentId: string
  merchantId: string
  merchantName: string
  vendorId: string
  amount: number
  paymentMethod: string
  reference: string
  comment: string | null
  recordedBy: string
  status: string
  createdAt: string
}

const FILTER_CHIPS = [
  { key: 'all', label: 'All', method: '' },
  { key: 'bank_transfer', label: 'Bank Transfer', method: 'Bank Transfer' },
  { key: 'm-pesa', label: 'M-Pesa', method: 'M-Pesa' },
  { key: 'cash', label: 'Cash', method: 'Cash' },
  { key: 'cheque', label: 'Cheque', method: 'Cheque' },
  { key: 'credit_memo', label: 'Credit Memos', method: 'credit_memo' },
]

const methodCode = (m: string): string => {
  if (m === 'Bank Transfer') return 'BT'
  if (m === 'M-Pesa') return 'MP'
  if (m === 'Cash') return 'CA'
  if (m === 'Cheque') return 'CH'
  if (m === 'credit_memo') return 'CM'
  return '—'
}

const methodDot = (m: string): string => {
  if (m === 'M-Pesa') return 'bg-green-500'
  if (m === 'Bank Transfer') return 'bg-blue-500'
  if (m === 'Cash') return 'bg-amber-500'
  if (m === 'Cheque') return 'bg-purple-500'
  if (m === 'credit_memo') return 'bg-red-500'
  return 'bg-gray-400'
}

export default function PaymentsModule() {
  const [data, setData] = useState<Payment[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' })

  useEffect(() => {
    fetch('/api/merchants').then(r => r.json()).then(setMerchants)
  }, [])

  const fetchData = () => {
    fetch(`/api/payments?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [search])

  const filteredData = activeFilter === 'all'
    ? data
    : data.filter(p => p.paymentMethod === FILTER_CHIPS.find(c => c.key === activeFilter)?.method)

  const totalPaid = filteredData.reduce((s, p) => s + p.amount, 0)
  const creditMemoTotal = filteredData.filter(p => p.amount < 0).reduce((s, p) => s + Math.abs(p.amount), 0)

  const kpiCells = [
    { label: 'RECORDS', value: filteredData.length },
    { label: 'TOTAL', value: formatCurrencyCompact(totalPaid), highlight: totalPaid > 0, highlightColor: 'green' as const },
    { label: 'AVG', value: filteredData.length > 0 ? formatCurrencyCompact(Math.round(totalPaid / filteredData.length)) : '—' },
    { label: 'CREDIT MEMOS', value: formatCurrencyCompact(creditMemoTotal), highlight: creditMemoTotal > 0, highlightColor: 'orange' as const },
  ]

  const handleSubmit = async () => {
    if (!form.merchantId || !form.amount || !form.paymentMethod || !form.reference) {
      toast.error('Please fill all required fields')
      return
    }
    const payload = { ...form, amount: parseFloat(form.amount), recordedBy: 'admin' }
    if (editing) {
      await fetch('/api/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('Payment updated')
    } else {
      await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Payment recorded')
    }
    setOpen(false); setEditing(null)
    setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' })
    fetchData()
  }

  const handleEdit = (item: Payment) => {
    setEditing(item)
    setForm({ merchantId: item.merchantId, merchantName: item.merchantName, vendorId: item.vendorId, amount: String(item.amount), paymentMethod: item.paymentMethod, reference: item.reference, comment: item.comment || '' })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/payments?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Payment deleted')
      setDeleteOpen(false); setDeletingId(null); fetchData()
    }
  }

  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', vendorId: merchantId })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Payment Records"
        description="Individual merchant payments and credit memos"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by payment ID, merchant, or reference..."
        actionLabel="Record Payment"
        onAction={() => { setEditing(null); setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' }); setOpen(true) }}
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(p => p.paymentMethod === chip.method).length
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
      {filteredData.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No payments found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">Payment ID</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-16">Method</DenseTh>
              <DenseTh>Reference</DenseTh>
              <DenseTh className="w-28 text-right">Amount</DenseTh>
              <DenseTh className="w-28">Date</DenseTh>
              <DenseTh className="w-20">By</DenseTh>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((p) => (
              <DenseTr key={p.id} onClick={() => handleEdit(p)} tint={p.amount < 0 ? 'bg-red-50/40' : ''}>
                <DenseTd mono className="text-gray-500">{p.paymentId}</DenseTd>
                <DenseTd className="text-gray-900 font-medium">{p.merchantName}</DenseTd>
                <DenseTd>
                  <span className="inline-flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${methodDot(p.paymentMethod)}`} />
                    <span className="text-[10px] text-gray-600 font-mono">{methodCode(p.paymentMethod)}</span>
                  </span>
                </DenseTd>
                <DenseTd className="text-gray-600 truncate max-w-[180px]">{p.reference}</DenseTd>
                <DenseTd mono right className={p.amount < 0 ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>
                  {p.amount < 0 ? '-' : ''}{formatCurrencyCompact(Math.abs(p.amount))}
                </DenseTd>
                <DenseTd className="text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-UG')}</DenseTd>
                <DenseTd className="text-gray-500 text-[10px]">{p.recordedBy}</DenseTd>
              </DenseTr>
            ))}
          </tbody>
        </DenseTable>
      )}

      {/* Edit / Create slide-over */}
      <DetailSlideOver
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' }) }}
        title={editing ? `Payment ${editing.paymentId}` : 'Record New Payment'}
        subtitle={editing ? `${editing.merchantName}` : 'Fill in the payment details below'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl" onClick={() => { setDeletingId(editing.id); setDeleteOpen(true) }}><Trash2 size={16} className="mr-2" /> Delete</Button>}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Record'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium mb-1 block">Merchant <span className="text-red-400">*</span></Label>
            <select value={form.merchantId} onChange={e => handleMerchantSelect(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">Select merchant...</option>
              {merchants.map(m => <option key={m.merchantId} value={m.merchantId}>{m.businessName} ({m.merchantId})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1 block">Amount (UGX) <span className="text-red-400">*</span></Label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Payment Method <span className="text-red-400">*</span></Label>
              <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium mb-1 block">Reference <span className="text-red-400">*</span></Label>
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Bank slip / M-Pesa ref" className="rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1 block">Comment</Label>
            <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Optional notes..." rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
      </DetailSlideOver>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Delete Payment</AlertDialogTitle><AlertDialogDescription>This will permanently delete this payment record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 rounded-xl">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
