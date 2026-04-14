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
import { Plus, Search, Truck, Package, Clock, ArrowRight, CheckCircle2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

interface Product { id: string; productId: string; productLabel: string; currentStock: number; unit: string }
interface Driver { id: string; driverId: string; name: string; phone: string }

interface OutboundRecord {
  id: string
  outboundId: string
  customerName: string
  customerContact: string
  productName: string
  productId: string
  qty: number
  assignedDriver: string | null
  status: string
  dispatchedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

const statCards = [
  { label: 'Pending', color: 'amber', icon: Clock, key: 'pending' as const },
  { label: 'Dispatched', color: 'blue', icon: ArrowRight, key: 'dispatched' as const },
  { label: 'Delivered', color: 'green', icon: CheckCircle2, key: 'delivered' as const },
  { label: 'Total Orders', color: 'navy', icon: BarChart3, key: 'total' as const },
]

const colorMap: Record<string, { bg: string; badge: string; text: string; border: string }> = {
  amber: { bg: 'bg-gradient-to-br from-amber-500/10 to-amber-50', badge: 'bg-amber-100 text-amber-600', text: 'text-amber-700', border: 'border-amber-200/60' },
  blue: { bg: 'bg-gradient-to-br from-blue-500/10 to-blue-50', badge: 'bg-blue-100 text-blue-600', text: 'text-blue-700', border: 'border-blue-200/60' },
  green: { bg: 'bg-gradient-to-br from-green-500/10 to-green-50', badge: 'bg-green-100 text-green-600', text: 'text-green-700', border: 'border-green-200/60' },
  navy: { bg: 'bg-gradient-to-br from-slate-500/10 to-slate-50', badge: 'bg-slate-100 text-slate-600', text: 'text-slate-700', border: 'border-slate-200/60' },
}

export default function OutboundModule() {
  const [data, setData] = useState<OutboundRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    customerName: '', customerContact: '', productId: '', productName: '',
    qty: '', assignedDriver: '',
  })

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
    fetch('/api/drivers?status=active').then(r => r.json()).then(setDrivers)
  }, [])

  const fetchData = () => {
    fetch(`/api/outbound?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/outbound?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '' })
  }

  const handleSubmit = async () => {
    if (!form.customerName || !form.customerContact || !form.productId || !form.qty) {
      toast.error('Please fill all required fields')
      return
    }
    const payload = { ...form, qty: parseInt(form.qty), assignedDriver: form.assignedDriver || null }
    await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    toast.success('Order created successfully')
    setOpen(false)
    setForm({ customerName: '', customerContact: '', productId: '', productName: '', qty: '', assignedDriver: '' })
    fetchData()
  }

  const pendingCount = data.filter(r => r.status === 'pending').length
  const dispatchedCount = data.filter(r => r.status === 'dispatched').length
  const deliveredCount = data.filter(r => r.status === 'delivered').length
  const countMap = { pending: pendingCount, dispatched: dispatchedCount, delivered: deliveredCount, total: data.length }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="border-amber-500 text-amber-700">Pending</Badge>
      case 'dispatched': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Dispatched</Badge>
      case 'delivered': return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Delivered</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Outbound / Dispatch</h1>
          <p className="text-sm text-gray-400">Manage deliveries and dispatches</p>
        </div>
        <Button onClick={() => { setForm({ customerName: '', customerContact: '', productId: '', productName: '', qty: '', assignedDriver: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> New Order
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const colors = colorMap[card.color]
          const Icon = card.icon
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`${colors.bg} border ${colors.border} rounded-2xl p-5`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{card.label}</p>
                  <p className="text-2xl font-extrabold text-gray-900">{countMap[card.key]}</p>
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
          <Input placeholder="Search outbound records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 border-gray-200" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
              <TableHead className="text-white font-semibold">ID</TableHead>
              <TableHead className="text-white font-semibold">Customer</TableHead>
              <TableHead className="text-white font-semibold">Contact</TableHead>
              <TableHead className="text-white font-semibold">Product</TableHead>
              <TableHead className="text-white font-semibold">Qty</TableHead>
              <TableHead className="text-white font-semibold">Driver</TableHead>
              <TableHead className="text-white font-semibold">Status</TableHead>
              <TableHead className="text-white font-semibold">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => (
              <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/60 transition-colors`}>
                <TableCell className="font-mono text-sm">{item.outboundId}</TableCell>
                <TableCell className="font-medium">{item.customerName}</TableCell>
                <TableCell className="text-sm text-gray-500">{item.customerContact}</TableCell>
                <TableCell className="flex items-center gap-2"><Package size={14} className="text-[#FF6B35]" />{item.productName}</TableCell>
                <TableCell className="font-semibold">{item.qty}</TableCell>
                <TableCell>{item.assignedDriver ? <span className="flex items-center gap-1"><Truck size={14} className="text-[#1B2A4A]" />{item.assignedDriver}</span> : <span className="text-sm text-gray-400">Unassigned</span>}</TableCell>
                <TableCell>{statusBadge(item.status)}</TableCell>
                <TableCell className="text-sm text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="text-center py-12">
                    <Package size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">No outbound records found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Order Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Customer Name *</Label><Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Customer name" /></div>
              <div><Label>Customer Contact *</Label><Input value={form.customerContact} onChange={e => setForm({ ...form, customerContact: e.target.value })} placeholder="Phone number" /></div>
            </div>
            <div><Label>Product *</Label>
              <Select value={form.productId} onValueChange={handleProductSelect}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel} (Stock: {p.currentStock} {p.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity *</Label><Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" /></div>
              <div>
                <Label>Assign Driver</Label>
                <Select value={form.assignedDriver} onValueChange={v => setForm({ ...form, assignedDriver: v })}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>{drivers.map(d => <SelectItem key={d.driverId} value={d.name}>{d.name} - {d.phone}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
