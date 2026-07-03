'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Users as UsersIcon, UserCheck, UserX, UserMinus, Pencil, Calendar, Lock } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

interface UserRecord {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'operations_manager', label: 'Operations Manager' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'finance', label: 'Finance' },
  { value: 'driver', label: 'Driver' },
  { value: 'viewer', label: 'Viewer' },
]

const roleColor = (role: string) => {
  switch (role) {
    case 'super_admin': return { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' }
    case 'admin': return { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200' }
    case 'operations_manager': return { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200' }
    case 'procurement': return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' }
    case 'warehouse': return { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' }
    case 'finance': return { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' }
    case 'driver': return { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-200' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-200' }
  }
}

const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label || role

const COLORS = ['#FF6B35', '#1B2A4A', '#22C55E', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#EF4444']

export default function UsersModule() {
  const [data, setData] = useState<UserRecord[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })

  const fetchData = () => {
    fetch('/api/users').then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [])

  const activeCount = data.filter(u => u.isActive).length
  const inactiveCount = data.filter(u => !u.isActive).length

  const stats = [
    { label: 'Total Users', value: data.length, icon: UsersIcon, color: '#1B2A4A', bg: 'bg-slate-500/20', border: 'border-slate-400/30', gradient: 'from-slate-500/10 to-slate-500/5' },
    { label: 'Active', value: activeCount, icon: UserCheck, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Inactive', value: inactiveCount, icon: UserMinus, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.name || !form.email) {
      toast.error('Please fill name and email')
      return
    }
    if (editing) {
      await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('User updated')
    } else {
      await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('User created')
    }
    setOpen(false); setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'viewer' })
    fetchData()
  }

  const handleEdit = (item: UserRecord) => {
    setEditing(item)
    setForm({ name: item.name, email: item.email, password: '', role: item.role })
    setOpen(true)
  }

  const toggleActive = async (item: UserRecord) => {
    await fetch('/api/users', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    })
    toast.success(`User ${item.isActive ? 'deactivated' : 'activated'}`)
    fetchData()
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'viewer' })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'viewer' })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Users & Access Office"
        description="Manage system users, roles, and access permissions"
        icon={Shield}
        stats={stats}
        actionLabel="Add User"
        onAction={openCreate}
      />

      {/* Card Grid */}
      {data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <UsersIcon size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No users found</p>
          <p className="text-sm text-gray-400 mt-1">Add a new user to get started</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item, i) => {
            const rc = roleColor(item.role)
            const initials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            const colorIdx = i % COLORS.length
            return (
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
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: COLORS[colorIdx] }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{item.name}</h3>
                      <p className="text-xs text-gray-400 truncate">{item.email}</p>
                    </div>
                  </div>
                  <Badge
                    className={`text-[11px] font-semibold border-0 ${rc.bg} ${rc.text}`}
                  >
                    {roleLabel(item.role)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px] font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-[11px] font-semibold'}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? editing.name : 'New User'}
        subtitle={editing ? `${editing.email} • ${roleLabel(editing.role)}` : 'Fill in the details to create a new user'}
        width="lg"
        footer={
          editing ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => toggleActive(editing)}
                className={`${editing.isActive ? 'text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700' : 'text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700'} rounded-xl`}
              >
                {editing.isActive ? <><UserX size={16} className="mr-2" />Deactivate</> : <><UserCheck size={16} className="mr-2" />Activate</>}
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
                <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Update User</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create User</Button>
            </div>
          )
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Email</p>
                <p className="text-gray-700">{editing.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Role</p>
                <Badge className={`text-[11px] font-semibold border-0 ${roleColor(editing.role).bg} ${roleColor(editing.role).text}`}>
                  {roleLabel(editing.role)}
                </Badge>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                <Badge className={editing.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px] font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-[11px] font-semibold'}>
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
            <Label className="text-gray-700 font-medium mb-1.5 block">Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Email address"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">
              Password {editing ? '(leave blank to keep)' : '*'}
            </Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? 'Leave blank to keep current' : 'Password'}
                className="pl-10 rounded-xl"
              />
            </div>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Role <span className="text-red-400">*</span></Label>
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </DetailSlideOver>
    </motion.div>
  )
}
