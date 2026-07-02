'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, User, Users, ShoppingCart, Banknote, Mail, Phone, MapPin, Package } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

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

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const avatarColors = [
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
]

const avatarBorderColors = [
  'ring-orange-200',
  'ring-emerald-200',
  'ring-violet-200',
  'ring-pink-200',
  'ring-amber-200',
  'ring-cyan-200',
  'ring-rose-200',
  'ring-teal-200',
]

export default function CustomersModule() {
  const [data, setData] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', contact: '', email: '', address: '' })

  const fetchData = () => {
    fetch(`/api/customers?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/customers?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const stats = [
    { label: 'Total Customers', value: data.length, icon: Users, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Total Orders', value: data.reduce((s, c) => s + c.totalOrders, 0), icon: ShoppingCart, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Revenue', value: `KES ${data.reduce((s, c) => s + c.totalOrderValue, 0).toLocaleString()}`, icon: Banknote, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
  ]

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

  const openCreate = () => {
    setViewing(null)
    setForm({ name: '', contact: '', email: '', address: '' })
    setOpen(true)
  }

  const handleView = (item: Customer) => {
    setViewing(item)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setViewing(null)
    setForm({ name: '', contact: '', email: '', address: '' })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="Customers"
        description="Auto-created from Order Processing. Manual creation disabled per business rule."
        kpiCells={[
          { label: 'TOTAL', value: data.length },
          { label: 'WITH ORDERS', value: data.filter(c => c.totalOrders > 0).length },
          { label: 'TOTAL ORDERS', value: data.reduce((s, c) => s + (c.totalOrders || 0), 0) },
          { label: 'LIFETIME VALUE', value: `UGX ${data.reduce((s, c) => s + (c.totalOrderValue || 0), 0).toLocaleString()}` },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or phone..."
      />

      {/* Card Grid */}
      {data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <User size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No customers found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or add a new customer</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item, i) => {
            const colorIdx = i % avatarColors.length
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                onClick={() => handleView(item)}
                className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-xl ${avatarColors[colorIdx]} flex items-center justify-center text-sm font-bold shrink-0 ring-2 ${avatarBorderColors[colorIdx]}`}>
                    {getInitials(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{item.name}</h3>
                    <span className="text-xs font-mono text-gray-400">{item.customerId}</span>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Phone size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{item.contact}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{item.email || 'No email'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                      <ShoppingCart size={13} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Orders</p>
                      <p className="text-sm font-bold text-gray-900">{item.totalOrders}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                      <Banknote size={13} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Value</p>
                      <p className="text-sm font-bold text-green-600">{item.totalOrderValue.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Detail / Create Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={viewing ? viewing.name : 'New Customer'}
        subtitle={viewing ? `ID: ${viewing.customerId}` : 'Fill in the details to create a new customer'}
        width="lg"
        footer={
          viewing ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Close</Button>
            </div>
          ) : (
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                Create Customer
              </Button>
            </div>
          )
        }
      >
        {viewing ? (
          <div className="space-y-3">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl ${avatarColors[data.indexOf(viewing) % avatarColors.length]} flex items-center justify-center text-xl font-bold ring-2 ${avatarBorderColors[data.indexOf(viewing) % avatarBorderColors.length]}`}>
                {getInitials(viewing.name)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{viewing.name}</h3>
                <p className="text-sm text-gray-400 font-mono">{viewing.customerId}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={14} className="text-blue-600" />
                  <span className="text-[11px] uppercase tracking-wider text-blue-500 font-medium">Total Orders</span>
                </div>
                <p className="text-2xl font-extrabold text-blue-700">{viewing.totalOrders}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-50/50 border border-green-100">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={14} className="text-green-600" />
                  <span className="text-[11px] uppercase tracking-wider text-green-500 font-medium">Total Value</span>
                </div>
                <p className="text-2xl font-extrabold text-green-700">KES {viewing.totalOrderValue.toLocaleString()}</p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Contact Information</h4>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <Phone size={16} className="text-gray-400" />
                  <div>
                    <p className="text-[11px] text-gray-400">Phone</p>
                    <p className="text-sm font-medium text-gray-700">{viewing.contact}</p>
                  </div>
                </div>
                {viewing.email && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <Mail size={16} className="text-gray-400" />
                    <div>
                      <p className="text-[11px] text-gray-400">Email</p>
                      <p className="text-sm font-medium text-gray-700">{viewing.email}</p>
                    </div>
                  </div>
                )}
                {viewing.address && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <MapPin size={16} className="text-gray-400" />
                    <div>
                      <p className="text-[11px] text-gray-400">Address</p>
                      <p className="text-sm font-medium text-gray-700">{viewing.address}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <Users size={16} className="text-gray-400" />
                  <div>
                    <p className="text-[11px] text-gray-400">Customer Since</p>
                    <p className="text-sm font-medium text-gray-700">{new Date(viewing.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Customer name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Phone <span className="text-red-400">*</span></Label>
              <Input
                value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })}
                placeholder="Phone number"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email (optional)"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Address</Label>
              <Input
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Address (optional)"
                className="rounded-xl"
              />
            </div>
          </div>
        )}
      </DetailSlideOver>
    </motion.div>
  )
}
