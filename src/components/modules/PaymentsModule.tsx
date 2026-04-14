'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoreHorizontal, Plus, Search, Pencil, Trash2, Wallet, Receipt, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

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

const statCards = [
  { label: 'Total Payments', color: 'green', icon: Wallet, getValue: (d: Payment[]) => `KES ${d.reduce((s, p) => s + p.amount, 0).toLocaleString()}` },
  { label: 'Total Records', color: 'orange', icon: Receipt, getValue: (d: Payment[]) => d.length },
  { label: 'Average Payment', color: 'navy', icon: TrendingUp, getValue: (d: Payment[]) => `KES ${d.length > 0 ? Math.round(d.reduce((s, p) => s + p.amount, 0) / d.length).toLocaleString() : 0}` },
]

const colorMap: Record<string, { bg: string; badge: string; text: string; border: string }> = {
  green: { bg: 'bg-gradient-to-br from-green-500/10 to-green-50', badge: 'bg-green-100 text-green-600', text: 'text-green-700', border: 'border-green-200/60' },
  orange: { bg: 'bg-gradient-to-br from-orange-500/10 to-orange-50', badge: 'bg-orange-100 text-orange-600', text: 'text-orange-700', border: 'border-orange-200/60' },
  navy: { bg: 'bg-gradient-to-br from-slate-500/10 to-slate-50', badge: 'bg-slate-100 text-slate-600', text: 'text-slate-700', border: 'border-slate-200/60' },
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Merchant Payments</h1>
          <p className="text-sm text-gray-400">Track and manage merchant payments</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ merchantId: '', merchantName: '', vendorId: '', amount: '', paymentMethod: '', reference: '', comment: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Record Payment
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card, i) => {
          const colors = colorMap[card.color]
          const Icon = card.icon
          const value = card.getValue(data)
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`${colors.bg} border ${colors.border} rounded-2xl p-5`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{card.label}</p>
                  <p className="text-2xl font-extrabold text-gray-900">{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${colors.badge} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Search Card */}
      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 border-gray-200" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
              <TableHead className="text-white font-semibold">ID</TableHead>
              <TableHead className="text-white font-semibold">Merchant</TableHead>
              <TableHead className="text-white font-semibold">Amount (KES)</TableHead>
              <TableHead className="text-white font-semibold">Method</TableHead>
              <TableHead className="text-white font-semibold">Reference</TableHead>
              <TableHead className="text-white font-semibold">Date</TableHead>
              <TableHead className="text-white font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => (
              <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/60 transition-colors`}>
                <TableCell className="font-mono text-sm">{item.paymentId}</TableCell>
                <TableCell className="font-medium">{item.merchantName}</TableCell>
                <TableCell className="font-semibold text-green-600">{item.amount.toLocaleString()}</TableCell>
                <TableCell><span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{item.paymentMethod}</span></TableCell>
                <TableCell className="font-mono text-sm">{item.reference}</TableCell>
                <TableCell className="text-sm text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(item)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setDeletingId(item.id); setDeleteOpen(true) }} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="text-center py-12">
                    <Wallet size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">No payments found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Payment' : 'Record New Payment'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Merchant *</Label>
              <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (KES) *</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" /></div>
            <div>
              <Label>Payment Method *</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference *</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Payment reference" /></div>
            <div><Label>Comment</Label><Textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Optional comment" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Payment</AlertDialogTitle><AlertDialogDescription>This will permanently delete this payment record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
