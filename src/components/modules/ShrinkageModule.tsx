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
import { Plus, Search, AlertTriangle, Package, Clock, CheckCircle2, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

interface Product { id: string; productId: string; productLabel: string; currentStock: number; unit: string }

interface ShrinkageRecord {
  id: string
  shrinkageId: string
  productId: string
  productName: string
  qty: number
  reason: string
  reportedBy: string
  status: string
  createdAt: string
}

const statCards = [
  { key: 'incidents', label: 'Total Incidents', color: 'red' as const },
  { key: 'loss', label: 'Total Loss', color: 'red' as const },
  { key: 'pending', label: 'Pending', color: 'amber' as const },
  { key: 'resolved', label: 'Resolved', color: 'green' as const },
] as const

const colorMap = {
  red: {
    gradient: 'from-red-500/10 to-red-50',
    border: 'border-red-200/60',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-600',
  },
  amber: {
    gradient: 'from-amber-500/10 to-amber-50',
    border: 'border-amber-200/60',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-600',
  },
  green: {
    gradient: 'from-green-500/10 to-green-50',
    border: 'border-green-200/60',
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-600',
  },
} as const

const statIcons: Record<string, React.ReactNode> = {
  incidents: <AlertTriangle size={20} />,
  loss: <TrendingDown size={20} />,
  pending: <Clock size={20} />,
  resolved: <CheckCircle2 size={20} />,
}

export default function ShrinkageModule() {
  const [data, setData] = useState<ShrinkageRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    productId: '', productName: '', qty: '', reason: '', reportedBy: '',
  })

  useEffect(() => { fetch('/api/products').then(r => r.json()).then(setProducts) }, [])

  const fetchData = () => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({ ...form, productId, productName: p?.productLabel || '' })
  }

  const handleSubmit = async () => {
    if (!form.productId || !form.qty || !form.reason || !form.reportedBy) {
      toast.error('Please fill all required fields')
      return
    }
    await fetch('/api/shrinkage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, qty: parseInt(form.qty) }),
    })
    toast.success('Shrinkage reported')
    setOpen(false)
    setForm({ productId: '', productName: '', qty: '', reason: '', reportedBy: '' })
    fetchData()
  }

  const totalLoss = data.reduce((s, r) => s + r.qty, 0)

  const statValues: Record<string, string | number> = {
    incidents: data.length,
    loss: `${totalLoss} units`,
    pending: data.filter(r => r.status === 'pending').length,
    resolved: data.filter(r => r.status === 'resolved').length,
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shrinkage</h1>
          <p className="text-sm text-gray-400">Track and report inventory losses</p>
        </div>
        <Button onClick={() => { setForm({ productId: '', productName: '', qty: '', reason: '', reportedBy: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Report Shrinkage
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <Input placeholder="Search shrinkage records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-gray-50/50 border-gray-200/60 focus:bg-white" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                  <TableHead className="text-white font-semibold">ID</TableHead>
                  <TableHead className="text-white font-semibold">Product</TableHead>
                  <TableHead className="text-white font-semibold">Qty Lost</TableHead>
                  <TableHead className="text-white font-semibold">Reason</TableHead>
                  <TableHead className="text-white font-semibold">Reported By</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  <TableHead className="text-white font-semibold">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, i) => (
                  <TableRow key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <TableCell className="font-mono text-sm">{item.shrinkageId}</TableCell>
                    <TableCell className="font-medium flex items-center gap-2"><Package size={14} className="text-red-500" />{item.productName}</TableCell>
                    <TableCell className="font-bold text-red-600">-{item.qty}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.reason === 'damage' ? 'bg-red-50 text-red-700' :
                        item.reason === 'theft' ? 'bg-purple-50 text-purple-700' :
                        item.reason === 'expiry' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.reason.charAt(0).toUpperCase() + item.reason.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{item.reportedBy}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'resolved' ? 'default' : 'outline'} className={item.status === 'resolved' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'border-amber-500 text-amber-700'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-gray-400 text-center py-12">
                      <AlertTriangle size={32} className="mx-auto mb-2 opacity-40" />
                      No shrinkage records found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Shrinkage</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={handleProductSelect}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.productId} value={p.productId}>{p.productLabel} (Stock: {p.currentStock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity Lost *</Label><Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" /></div>
            <div>
              <Label>Reason *</Label>
              <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="theft">Theft</SelectItem>
                  <SelectItem value="expiry">Expiry</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reported By *</Label><Input value={form.reportedBy} onChange={e => setForm({ ...form, reportedBy: e.target.value })} placeholder="Your name" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
