'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoreHorizontal, Plus, Pencil, UserCheck, UserX, Shield, Users as UsersIcon, UserMinus } from 'lucide-react'
import { toast } from 'sonner'

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
    case 'super_admin': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200/60', gradient: 'from-red-500/10 to-rose-50' }
    case 'admin': return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/60', gradient: 'from-orange-500/10 to-amber-50' }
    case 'operations_manager': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', gradient: 'from-blue-500/10 to-sky-50' }
    case 'warehouse': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200/60', gradient: 'from-green-500/10 to-emerald-50' }
    case 'finance': return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60', gradient: 'from-purple-500/10 to-violet-50' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200/60', gradient: 'from-gray-500/10 to-slate-50' }
  }
}

const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label || role

const COLORS = ['#FF6B35', '#1B2A4A', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6']

export default function UsersModule() {
  const [data, setData] = useState<UserRecord[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })

  const fetchData = () => {
    fetch('/api/users').then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setData)
  }, [])

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

  const activeCount = data.filter(u => u.isActive).length
  const inactiveCount = data.filter(u => !u.isActive).length

  const statCards = [
    { title: 'Total Users', value: data.length, icon: UsersIcon, color: '#1B2A4A', bg: 'bg-slate-50', bgGradient: 'from-slate-500/10 to-gray-50', borderColor: 'border-slate-200/60' },
    { title: 'Active Users', value: activeCount, icon: UserCheck, color: '#22C55E', bg: 'bg-green-50', bgGradient: 'from-green-500/10 to-emerald-50', borderColor: 'border-green-200/60' },
    { title: 'Inactive Users', value: inactiveCount, icon: UserMinus, color: '#EF4444', bg: 'bg-red-50', bgGradient: 'from-red-500/10 to-rose-50', borderColor: 'border-red-200/60' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage system users and access roles</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ name: '', email: '', password: '', role: 'viewer' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Add User
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
                  <div className={`p-2.5 rounded-xl ${stat.bg} group-hover:scale-110 transition-transform duration-200`}>
                    <stat.icon size={20} style={{ color: stat.color }} />
                  </div>
                  <Shield size={18} className="text-gray-300" />
                </div>
                <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-medium">{stat.title}</p>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF6B35]/30 to-transparent" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                <TableHead className="text-white font-semibold">User</TableHead>
                <TableHead className="text-white font-semibold">Email</TableHead>
                <TableHead className="text-white font-semibold">Role</TableHead>
                <TableHead className="text-white font-semibold">Status</TableHead>
                <TableHead className="text-white font-semibold">Created</TableHead>
                <TableHead className="text-white font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, i) => {
                const rc = roleColor(item.role)
                const initials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                const colorIdx = i % COLORS.length
                return (
                  <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/50 transition-colors`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: COLORS[colorIdx] }}>
                          {initials}
                        </div>
                        <span className="font-medium text-gray-900">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500">{item.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${rc.bg} ${rc.text}`}>
                        {roleLabel(item.role)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.isActive ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-xs font-semibold">Active</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-xs font-semibold">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-lg hover:bg-gray-100"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleEdit(item)} className="rounded-lg"><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(item)} className="rounded-lg">
                            {item.isActive ? <><UserX size={14} className="mr-2 text-red-500" /><span className="text-red-600">Deactivate</span></> : <><UserCheck size={14} className="mr-2 text-green-500" /><span className="text-green-600">Activate</span></>}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
              {data.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><UsersIcon size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-gray-400">No users found</p></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle className="text-gray-900">{editing ? 'Edit User' : 'Add New User'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-gray-700">Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-xl" /></div>
            <div><Label className="text-gray-700">Email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="rounded-xl" /></div>
            <div><Label className="text-gray-700">Password {editing ? '(leave blank to keep)' : '*'}</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? 'Leave blank to keep current' : 'Password'} className="rounded-xl" /></div>
            <div>
              <Label className="text-gray-700">Role *</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
