'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Store, UserCheck, CalendarDays, Trash2, Mail, Phone, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

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

  const stats = [
    { label: 'Total Merchants', value: totalMerchants, icon: Store, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Active', value: activeMerchants, icon: UserCheck, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'New This Month', value: newThisMonth, icon: CalendarDays, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
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

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '' })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Merchants Office"
        description="Manage your merchant partners and vendor relationships"
        icon={Store}
        stats={stats}
        actionLabel="Add Merchant"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search merchants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {/* Card Grid */}
      {filteredData.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Store size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No merchants found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or add a new merchant</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              onClick={() => handleEdit(item)}
              className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{item.merchantId}</span>
                <Badge
                  variant={item.isActive ? 'default' : 'secondary'}
                  className={item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-[11px]'}
                >
                  {item.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 leading-tight">{item.businessName}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{item.contact}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{item.email}</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Joined {new Date(item.createdAt).toLocaleDateString()}</span>
                <Building2 size={14} className="text-gray-300" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? editing.businessName : 'New Merchant'}
        subtitle={editing ? `ID: ${editing.merchantId}` : 'Fill in the details to create a new merchant'}
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
                {editing ? 'Update Merchant' : 'Create Merchant'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Merchant ID</p>
                <p className="font-mono text-gray-700">{editing.merchantId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                <Badge className={editing.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0'}>
                  {editing.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Business Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.businessName}
              onChange={e => setForm({ ...form, businessName: e.target.value })}
              placeholder="Enter business name"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Contact Number <span className="text-red-400">*</span></Label>
            <Input
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              placeholder="Enter contact number"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email Address <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Enter email address"
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Merchant</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the merchant record.</AlertDialogDescription>
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
