'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MoreHorizontal, Plus, Search, Pencil, Trash2, Download, Upload, Store, UserCheck, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

interface Merchant {
  id: string
  merchantId: string
  businessName: string
  contact: string
  email: string
  isActive: boolean
  createdAt: string
}

export default function MerchantsModule() {
  const [data, setData] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Merchant | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ businessName: '', contact: '', email: '' })

  const fetchData = () => {
    fetch(`/api/merchants?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/merchants?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalMerchants = data.length
  const activeMerchants = data.filter(m => m.isActive).length
  const newThisMonth = data.filter(m => {
    const d = new Date(m.createdAt)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const statCards = [
    { label: 'Total Merchants', value: totalMerchants, icon: Store, color: 'orange', gradientFrom: 'from-orange-500/10', gradientTo: 'to-orange-50', borderColor: 'border-orange-200/60', iconBg: 'bg-orange-500/10', iconColor: 'text-orange-500' },
    { label: 'Active Merchants', value: activeMerchants, icon: UserCheck, color: 'green', gradientFrom: 'from-green-500/10', gradientTo: 'to-green-50', borderColor: 'border-green-200/60', iconBg: 'bg-green-500/10', iconColor: 'text-green-500' },
    { label: 'New This Month', value: newThisMonth, icon: CalendarDays, color: 'navy', gradientFrom: 'from-blue-500/10', gradientTo: 'to-blue-50', borderColor: 'border-blue-200/60', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600' },
  ]

  const handleSubmit = async () => {
    if (!form.businessName || !form.contact || !form.email) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Merchant updated successfully')
    } else {
      await fetch('/api/merchants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, isActive: true, createdBy: 'admin' }) })
      toast.success('Merchant created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '' })
    fetchData()
  }

  const handleEdit = (item: Merchant) => {
    setEditing(item)
    setForm({ businessName: item.businessName, contact: item.contact, email: item.email })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/merchants?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Merchant deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '' })
    setOpen(true)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Merchants</h1>
          <p className="text-sm text-gray-400">Manage your merchant partners</p>
        </div>
        <Button onClick={openCreate} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Add Merchant
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className={`bg-gradient-to-br ${card.gradientFrom} ${card.gradientTo} border ${card.borderColor} rounded-2xl p-5`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`${card.iconBg} rounded-xl p-3`}>
                <card.icon size={22} className={card.iconColor} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="p-5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search merchants..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl"><Download size={16} className="mr-1" />Export</Button>
              <Button variant="outline" size="sm" className="rounded-xl"><Upload size={16} className="mr-1" />Import</Button>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                <TableHead className="text-white font-semibold">ID</TableHead>
                <TableHead className="text-white font-semibold">Business Name</TableHead>
                <TableHead className="text-white font-semibold">Contact</TableHead>
                <TableHead className="text-white font-semibold">Email</TableHead>
                <TableHead className="text-white font-semibold">Status</TableHead>
                <TableHead className="text-white font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item, i) => (
                <TableRow key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <TableCell className="font-mono text-sm">{item.merchantId}</TableCell>
                  <TableCell className="font-medium">{item.businessName}</TableCell>
                  <TableCell>{item.contact}</TableCell>
                  <TableCell className="text-gray-400">{item.email}</TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'secondary'} className={item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
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
              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex flex-col items-center py-12">
                      <Store size={40} className="text-gray-200 mb-3" />
                      <p className="text-sm text-gray-400 text-center">No merchants found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Merchant' : 'Add New Merchant'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Business Name *</Label><Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Enter business name" /></div>
            <div><Label>Contact *</Label><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Enter contact number" /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Enter email address" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Merchant</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the merchant record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 rounded-xl">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
