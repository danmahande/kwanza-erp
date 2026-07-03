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
import { Trash2, Filter, CreditCard, Banknote, Calendar, Upload } from 'lucide-react'
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
  deductions: number
  netAmount: number
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
  const [form, setForm] = useState({ merchantId: '', merchantName: '', vendorId: '', amount: '', deductions: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' })
  const [dateFilter, setDateFilter] = useState('') // '' = all, 'this-month', 'last-month', 'this-year', or 'YYYY-MM'
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

  useEffect(() => {
    fetch('/api/merchants').then(r => r.json()).then(setMerchants)
  }, [])

  const fetchData = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    // Date filter
    const now = new Date()
    if (dateFilter === 'this-month') {
      params.set('year', String(now.getFullYear()))
      params.set('month', String(now.getMonth() + 1))
    } else if (dateFilter === 'last-month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      params.set('year', String(lm.getFullYear()))
      params.set('month', String(lm.getMonth() + 1))
    } else if (dateFilter === 'this-year') {
      params.set('year', String(now.getFullYear()))
    } else if (dateFilter.match(/^\d{4}-\d{2}$/)) {
      const [y, m] = dateFilter.split('-')
      params.set('year', y)
      params.set('month', m)
    }
    fetch(`/api/payments?${params.toString()}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [search, dateFilter])

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
    const amt = parseFloat(form.amount) || 0
    const ded = parseFloat(form.deductions) || 0
    const payload = { ...form, amount: amt, deductions: ded, netAmount: amt - ded, recordedBy: 'admin' }
    if (editing) {
      await fetch('/api/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('Payment updated')
    } else {
      await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Payment recorded')
    }
    setOpen(false); setEditing(null)
    setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', deductions: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' })
    fetchData()
  }

  const handleEdit = (item: Payment) => {
    setEditing(item)
    setForm({ merchantId: item.merchantId, merchantName: item.merchantName, vendorId: item.vendorId, amount: String(item.amount), deductions: String(item.deductions || 0), paymentMethod: item.paymentMethod, reference: item.reference, comment: item.comment || '' })
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

  // CSV import — parse and bulk create payments
  const handleImport = async () => {
    if (!importText.trim()) { toast.error('Paste CSV data first'); return }
    const lines = importText.trim().split('\n')
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const requiredCols = ['merchantid', 'amount']
    for (const col of requiredCols) {
      if (!header.includes(col)) { toast.error(`CSV must have columns: ${requiredCols.join(', ')} (and optionally: paymentmethod, reference, deductions, comment)`); return }
    }
    let success = 0, failed = 0
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim())
      if (vals.length < 2) continue
      const row: Record<string, string> = {}
      header.forEach((h, j) => { row[h] = vals[j] || '' })
      const m = merchants.find(m => m.merchantId === row.merchantid)
      try {
        const amt = parseFloat(row.amount) || 0
        const ded = parseFloat(row.deductions) || 0
        await fetch('/api/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: row.merchantid,
            merchantName: m?.businessName || row.merchantid,
            vendorId: row.merchantid,
            amount: amt,
            deductions: ded,
            netAmount: amt - ded,
            paymentMethod: row.paymentmethod || 'Bank Transfer',
            reference: row.reference || `IMPORT-${Date.now()}-${i}`,
            comment: row.comment || '',
            recordedBy: 'admin',
          }),
        })
        success++
      } catch { failed++ }
    }
    toast.success(`Imported ${success} payments${failed > 0 ? `, ${failed} failed` : ''}`)
    setImportOpen(false); setImportText(''); fetchData()
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
        onAction={() => { setEditing(null); setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', deductions: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' }); setOpen(true) }}
      >
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Import CSV
        </Button>
      </OpsHeader>

      {/* Date filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} className="text-gray-400" />
        {[
          { key: '', label: 'All Time' },
          { key: 'this-month', label: 'This Month' },
          { key: 'last-month', label: 'Last Month' },
          { key: 'this-year', label: 'This Year' },
        ].map(chip => {
          const isActive = dateFilter === chip.key
          return (
            <button key={chip.key} onClick={() => setDateFilter(chip.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
            </button>
          )
        })}
        <input
          type="month"
          value={dateFilter.match(/^\d{4}-\d{2}$/) ? dateFilter : ''}
          onChange={e => setDateFilter(e.target.value || '')}
          className="px-2 py-1 rounded-full text-xs border border-gray-200 text-gray-600"
          title="Filter by specific month"
        />
      </div>

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
              <DenseTh className="w-28 text-right">Deductions</DenseTh>
              <DenseTh className="w-28 text-right">Net</DenseTh>
              <DenseTh className="w-24">Date</DenseTh>
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
                <DenseTd mono right className={p.amount < 0 ? 'text-red-600 font-bold' : 'text-gray-900 font-bold'}>
                  {p.amount < 0 ? '-' : ''}{formatCurrencyCompact(Math.abs(p.amount))}
                </DenseTd>
                <DenseTd mono right className={(p.deductions || 0) > 0 ? 'text-orange-600' : 'text-gray-300'}>
                  {(p.deductions || 0) > 0 ? formatCurrencyCompact(p.deductions) : '—'}
                </DenseTd>
                <DenseTd mono right className="text-gray-900 font-bold">
                  {formatCurrencyCompact(p.netAmount || (p.amount - (p.deductions || 0)))}
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
        onClose={() => { setOpen(false); setEditing(null); setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', deductions: '', paymentMethod: 'Bank Transfer', reference: '', comment: '' }) }}
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
              <Label className="text-xs font-medium mb-1 block">Deductions (UGX)</Label>
              <Input type="number" value={form.deductions} onChange={e => setForm({ ...form, deductions: e.target.value })} placeholder="0 (e.g. warehouse fees)" className="rounded-xl" />
              {(parseFloat(form.amount) || 0) > 0 && (parseFloat(form.deductions) || 0) > 0 && (
                <p className="text-[10px] text-gray-500 mt-1">Net: UGX {((parseFloat(form.amount) || 0) - (parseFloat(form.deductions) || 0)).toLocaleString()}</p>
              )}
            </div>
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

      {/* CSV Import dialog */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Upload size={18} /> Import Payments from CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Paste CSV data below. Required columns: merchantId, amount.
              Optional: paymentMethod, reference, deductions, comment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'merchantId,amount,paymentMethod,reference,deductions,comment\nMCH-001,500000,Bank Transfer,BANK-REF-001,25000,June payout\nMCH-002,350000,M-Pesa,MPESA-ABC123,0,'}
              rows={8}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              First line must be the header row. Net amount is auto-calculated as amount − deductions.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
