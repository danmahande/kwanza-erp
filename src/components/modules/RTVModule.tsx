'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, RotateCcw, Package, Clock, Layers } from 'lucide-react'
import { toast } from 'sonner'

interface Merchant { id: string; merchantId: string; businessName: string }
interface Product { id: string; productId: string; productLabel: string; merchantId: string; merchantName: string }

interface RTVRecord {
  id: string
  rtvId: string
  merchantId: string
  merchantName: string
  productId: string
  productName: string
  qty: number
  reason: string
  status: string
  processedBy: string | null
  createdAt: string
}

const statCards = [
  { key: 'total', label: 'Total RTV', color: 'orange' as const },
  { key: 'pending', label: 'Pending', color: 'amber' as const },
  { key: 'qty', label: 'Total Qty', color: 'navy' as const },
] as const

const colorMap = {
  orange: {
    gradient: 'from-orange-500/10 to-orange-50',
    border: 'border-orange-200/60',
    iconBg: 'bg-orange-500/15',
    iconColor: 'text-orange-600',
  },
  amber: {
    gradient: 'from-amber-500/10 to-amber-50',
    border: 'border-amber-200/60',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-600',
  },
  navy: {
    gradient: 'from-slate-600/10 to-slate-50',
    border: 'border-slate-300/60',
    iconBg: 'bg-slate-600/15',
    iconColor: 'text-slate-700',
  },
} as const

const statIcons: Record<string, React.ReactNode> = {
  total: <RotateCcw size={20} />,
  pending: <Clock size={20} />,
  qty: <Layers size={20} />,
}

export default function RTVModule() {
  const [data, setData] = useState<RTVRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '',
  })

  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const fetchData = () => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '', productId: '', productName: '' })
    fetch(`/api/products?search=${merchantId}`).then(r => r.json()).then((d: Product[]) => setProducts(d))
  }

  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '' })
  }

  const handleSubmit = async () => {
    if (!form.merchantId || !form.productId || !form.qty || !form.reason) {
      toast.error('Please fill all required fields')
      return
    }
    await fetch('/api/rtv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, qty: parseInt(form.qty), processedBy: form.processedBy || null }),
    })
    toast.success('RTV record created')
    setOpen(false)
    setForm({ merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '' })
    fetchData()
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-700">Pending</Badge>
      case 'approved': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>
      case 'rejected': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rejected</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const statValues: Record<string, string | number> = {
    total: data.length,
    pending: data.filter(r => r.status === 'pending').length,
    qty: data.reduce((s, r) => s + r.qty, 0),
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Return to Vendor (RTV)</h1>
          <p className="text-sm text-gray-400">Manage product returns to merchants</p>
        </div>
        <Button onClick={() => { setForm({ merchantId: '', merchantName: '', productId: '', productName: '', qty: '', reason: '', processedBy: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> New RTV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat, i) => {
          const colors = colorMap[stat.color]
          return (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`bg-gradient-to-br ${colors.gradient} border ${colors.border} rounded-2xl p-5`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{statValues[stat.key]}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center ${colors.iconColor}`}>
                  {statIcons[stat.key]}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow rounded-2xl">
        <div className="p-5">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search RTV records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-gray-50/50 border-gray-200/60 focus:bg-white" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                  <TableHead className="text-white font-semibold">ID</TableHead>
                  <TableHead className="text-white font-semibold">Merchant</TableHead>
                  <TableHead className="text-white font-semibold">Product</TableHead>
                  <TableHead className="text-white font-semibold">Qty</TableHead>
                  <TableHead className="text-white font-semibold">Reason</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  <TableHead className="text-white font-semibold">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, i) => (
                  <TableRow key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <TableCell className="font-mono text-sm">{item.rtvId}</TableCell>
                    <TableCell className="font-medium">{item.merchantName}</TableCell>
                    <TableCell className="flex items-center gap-2"><Package size={14} className="text-[#FF6B35]" />{item.productName}</TableCell>
                    <TableCell className="font-bold text-red-600">-{item.qty}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{item.reason}</TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-gray-400 text-center py-12">
                      <RotateCcw size={32} className="mx-auto mb-2 opacity-40" />
                      No RTV records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New RTV Record</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Merchant *</Label>
              <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={handleProductSelect} disabled={!form.merchantId}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity *</Label><Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></div>
              <div><Label>Processed By</Label><Input value={form.processedBy} onChange={e => setForm({ ...form, processedBy: e.target.value })} /></div>
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="quality_issue">Quality Issue</SelectItem>
                  <SelectItem value="overstock">Overstock</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Submit RTV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
