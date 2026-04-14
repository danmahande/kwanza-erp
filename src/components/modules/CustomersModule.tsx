'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, User, Users, ShoppingCart, Banknote } from 'lucide-react'
import { toast } from 'sonner'

interface Customer {
  id: string
  customerId: string
  name: string
  contact: string
  email: string | null
  address: string | null
  totalOrders: number
  totalOrderValue: number
  createdAt: string
}

const statCards = [
  { label: 'Total Customers', color: 'orange', icon: Users, getValue: (d: Customer[]) => d.length },
  { label: 'Total Orders', color: 'navy', icon: ShoppingCart, getValue: (d: Customer[]) => d.reduce((s, c) => s + c.totalOrders, 0) },
  { label: 'Revenue', color: 'green', icon: Banknote, getValue: (d: Customer[]) => `KES ${d.reduce((s, c) => s + c.totalOrderValue, 0).toLocaleString()}` },
]

const colorMap: Record<string, { bg: string; badge: string; text: string; border: string }> = {
  orange: { bg: 'bg-gradient-to-br from-orange-500/10 to-orange-50', badge: 'bg-orange-100 text-orange-600', text: 'text-orange-700', border: 'border-orange-200/60' },
  navy: { bg: 'bg-gradient-to-br from-slate-500/10 to-slate-50', badge: 'bg-slate-100 text-slate-600', text: 'text-slate-700', border: 'border-slate-200/60' },
  green: { bg: 'bg-gradient-to-br from-green-500/10 to-green-50', badge: 'bg-green-100 text-green-600', text: 'text-green-700', border: 'border-green-200/60' },
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const avatarColors = [
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
]

export default function CustomersModule() {
  const [data, setData] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', contact: '', email: '', address: '' })

  const fetchData = () => {
    fetch(`/api/customers?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/customers?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleSubmit = async () => {
    if (!form.name || !form.contact) {
      toast.error('Please fill name and contact')
      return
    }
    await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, createdBy: 'admin' }) })
    toast.success('Customer created successfully')
    setOpen(false)
    setForm({ name: '', contact: '', email: '', address: '' })
    fetchData()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Customers</h1>
          <p className="text-sm text-gray-400">Manage your customer database</p>
        </div>
        <Button onClick={() => { setForm({ name: '', contact: '', email: '', address: '' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Add Customer
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
          <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 border-gray-200" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
              <TableHead className="text-white font-semibold">ID</TableHead>
              <TableHead className="text-white font-semibold">Name</TableHead>
              <TableHead className="text-white font-semibold">Contact</TableHead>
              <TableHead className="text-white font-semibold">Email</TableHead>
              <TableHead className="text-white font-semibold">Address</TableHead>
              <TableHead className="text-white font-semibold">Orders</TableHead>
              <TableHead className="text-white font-semibold">Total Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => {
              const avatarColor = avatarColors[i % avatarColors.length]
              return (
                <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/60 transition-colors`}>
                  <TableCell className="font-mono text-sm">{item.customerId}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                        {getInitials(item.name)}
                      </div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.contact}</TableCell>
                  <TableCell className="text-gray-400">{item.email || '-'}</TableCell>
                  <TableCell className="text-gray-400">{item.address || '-'}</TableCell>
                  <TableCell><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{item.totalOrders}</span></TableCell>
                  <TableCell className="font-semibold text-green-600">KES {item.totalOrderValue.toLocaleString()}</TableCell>
                </TableRow>
              )
            })}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="text-center py-12">
                    <User size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400">No customers found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" /></div>
            <div><Label>Phone *</Label><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Phone number" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Address (optional)" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
