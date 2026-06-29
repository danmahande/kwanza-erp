'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Search, CreditCard, Wallet, Receipt, TrendingUp, Trash2, Calendar, Building2, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

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
  createdAt: string
}

export default function PaymentsModule() {
  const [data, setData] = useState<Payment[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: '', reference: '', comment: '' })

  useEffect(() => {
    fetch('/api/merchants').then(r => r.json()).then(setMerchants)
  }, [])

  const fetchData = () => {
    fetch(`/api/payments?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/payments?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const stats = [
    { label: 'Total Payments', value: `UGX ${data.reduce((s, p) => s + p.amount, 0).toLocaleString()}`, icon: Wallet, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Total Records', value: data.length, icon: Receipt, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Average Payment', value: `UGX ${data.length > 0 ? Math.round(data.reduce((s, p) => s + p.amount, 0) / data.length).toLocaleString() : 0}`, icon: TrendingUp, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', vendorId: merchantId })
  }

  const handleSubmit = async () => {
    if (!form.merchantId || !form.amount || !form.paymentMethod || !form.reference) {
      toast.error('Please fill all required fields')
      return
    }
    const payload = { ...form, amount: parseFloat(form.amount), recordedBy: 'admin' }
    if (editing) {
      await fetch('/api/payments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('Payment updated successfully')
    } else {
      await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Payment recorded successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: '', reference: '', comment: '' })
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
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: '', reference: '', comment: '' })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: '', reference: '', comment: '' })
  }

  const methodColor = (method: string) => {
    switch (method) {
      case 'M-Pesa': return 'bg-green-50 text-green-700'
      case 'Bank Transfer': return 'bg-blue-50 text-blue-700'
      case 'Cash': return 'bg-amber-50 text-amber-700'
      case 'Cheque': return 'bg-purple-50 text-purple-700'
      default: return 'bg-gray-50 text-gray-700'
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Payments Office"
        description="Track and manage all merchant payments"
        icon={CreditCard}
        stats={stats}
        actionLabel="Record Payment"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search payments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {/* Card Grid */}
      {data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Wallet size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No payments found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or record a new payment</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              onClick={() => handleEdit(item)}
              className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{item.paymentId}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${methodColor(item.paymentMethod)}`}>
                  {item.paymentMethod}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight">{item.merchantName}</h3>
              <p className="text-2xl font-extrabold text-green-600 mb-3">UGX {item.amount.toLocaleString()}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Banknote size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate font-mono text-xs">{item.reference}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar size={14} className="text-gray-400 shrink-0" />
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">By {item.recordedBy}</span>
                <CreditCard size={14} className="text-gray-300" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `Payment ${editing.paymentId}` : 'Record New Payment'}
        subtitle={editing ? `${editing.merchantName} • UGX ${editing.amount.toLocaleString()}` : 'Fill in the payment details below'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 rounded-xl"
                onClick={() => { setDeletingId(editing.id); setDeleteOpen(true) }}
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                {editing ? 'Update Payment' : 'Record Payment'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Payment ID</p>
                <p className="font-mono text-gray-700">{editing.paymentId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Merchant</p>
                <p className="text-gray-700">{editing.merchantName}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Amount</p>
                <p className="font-semibold text-green-600">UGX {editing.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Date</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Merchant <span className="text-red-400">*</span></Label>
            <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select merchant" /></SelectTrigger>
              <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Amount (UGX) <span className="text-red-400">*</span></Label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="Enter amount"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Payment Method <span className="text-red-400">*</span></Label>
            <Select value={form.paymentMethod} onValueChange={v => setForm({ ...form, paymentMethod: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Reference <span className="text-red-400">*</span></Label>
            <Input
              value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })}
              placeholder="Payment reference"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Comment</Label>
            <Textarea
              value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              placeholder="Optional comment"
              rows={3}
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this payment record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 rounded-xl">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
