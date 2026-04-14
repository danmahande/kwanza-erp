'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoreHorizontal, Plus, Search, Pencil, Truck, Users as UsersIcon, UserCheck, Phone, Car } from 'lucide-react'
import { toast } from 'sonner'

interface Driver {
  id: string
  driverId: string
  name: string
  phone: string
  vehicleNumber: string | null
  licenseNumber: string | null
  status: string
  createdAt: string
}

export default function DriversModule() {
  const [data, setData] = useState<Driver[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', vehicleNumber: '', licenseNumber: '', status: 'active' })

  const fetchData = () => {
    fetch(`/api/drivers?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/drivers?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleSubmit = async () => {
    if (!form.name || !form.phone) {
      toast.error('Please fill name and phone')
      return
    }
    if (editing) {
      await fetch('/api/drivers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Driver updated')
    } else {
      await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('Driver added')
    }
    setOpen(false); setEditing(null)
    setForm({ name: '', phone: '', vehicleNumber: '', licenseNumber: '', status: 'active' })
    fetchData()
  }

  const handleEdit = (item: Driver) => {
    setEditing(item)
    setForm({ name: item.name, phone: item.phone, vehicleNumber: item.vehicleNumber || '', licenseNumber: item.licenseNumber || '', status: item.status })
    setOpen(true)
  }

  const activeCount = data.filter(d => d.status === 'active').length
  const onLeaveCount = data.filter(d => d.status === 'on_leave').length

  const statCards = [
    { title: 'Total Drivers', value: data.length, icon: UsersIcon, color: '#FF6B35', bg: 'bg-orange-50', bgGradient: 'from-orange-500/10 to-amber-50', borderColor: 'border-orange-200/60' },
    { title: 'Active', value: activeCount, icon: UserCheck, color: '#22C55E', bg: 'bg-green-50', bgGradient: 'from-green-500/10 to-emerald-50', borderColor: 'border-green-200/60' },
    { title: 'On Leave', value: onLeaveCount, icon: Car, color: '#F59E0B', bg: 'bg-amber-50', bgGradient: 'from-amber-500/10 to-yellow-50', borderColor: 'border-amber-200/60' },
  ]

  const statusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-0'
      case 'inactive': return 'bg-gray-100 text-gray-500 border-0'
      case 'on_leave': return 'bg-amber-100 text-amber-700 border-0'
      default: return ''
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active'
      case 'inactive': return 'Inactive'
      case 'on_leave': return 'On Leave'
      default: return status
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Drivers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage delivery drivers and vehicles</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ name: '', phone: '', vehicleNumber: '', licenseNumber: '', status: 'active' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Add Driver
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
          >
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.bgGradient} border ${stat.borderColor} hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default`}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon size={20} style={{ color: stat.color }} />
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-medium">{stat.title}</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF6B35]/30 to-transparent" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search drivers by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 rounded-xl border-gray-200" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                <TableHead className="text-white font-semibold">Driver</TableHead>
                <TableHead className="text-white font-semibold">Phone</TableHead>
                <TableHead className="text-white font-semibold">Vehicle</TableHead>
                <TableHead className="text-white font-semibold">License</TableHead>
                <TableHead className="text-white font-semibold">Status</TableHead>
                <TableHead className="text-white font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, i) => (
                <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/50 transition-colors`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#FF6B35]/10 flex items-center justify-center shrink-0">
                        <Truck size={14} className="text-[#FF6B35]" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{item.driverId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Phone size={13} className="text-gray-400" />
                      {item.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.vehicleNumber ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-sm font-medium text-gray-700">
                        <Car size={13} className="text-gray-400" />
                        {item.vehicleNumber}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-500">{item.licenseNumber || <span className="text-gray-300">-</span>}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs font-semibold ${statusStyle(item.status)}`}>{statusLabel(item.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-lg hover:bg-gray-100"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => handleEdit(item)} className="rounded-lg"><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><Truck size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-gray-400">No drivers found</p></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle className="text-gray-900">{editing ? 'Edit Driver' : 'Add New Driver'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-700">Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-xl" /></div>
              <div><Label className="text-gray-700">Phone *</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" className="rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-700">Vehicle Number</Label><Input value={form.vehicleNumber} onChange={e => setForm({ ...form, vehicleNumber: e.target.value })} placeholder="e.g., KBA 234J" className="rounded-xl" /></div>
              <div><Label className="text-gray-700">License Number</Label><Input value={form.licenseNumber} onChange={e => setForm({ ...form, licenseNumber: e.target.value })} placeholder="e.g., DL-45231" className="rounded-xl" /></div>
            </div>
            <div>
              <Label className="text-gray-700">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
