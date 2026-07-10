'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Users as UsersIcon, UserCheck, UserX, UserMinus, Pencil, Calendar, Lock, HelpCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
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
    case 'super_admin': return { bg: 'bg-red-50', text: 'text-red-700' }
    case 'admin': return { bg: 'bg-orange-50', text: 'text-orange-700' }
    case 'operations_manager': return { bg: 'bg-sky-50', text: 'text-sky-700' }
    case 'procurement': return { bg: 'bg-amber-50', text: 'text-amber-700' }
    case 'warehouse': return { bg: 'bg-green-50', text: 'text-green-700' }
    case 'finance': return { bg: 'bg-violet-50', text: 'text-violet-700' }
    case 'driver': return { bg: 'bg-cyan-50', text: 'text-cyan-700' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-700' }
  }
}

const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label || role

const COLORS = ['#FF6B35', '#1B2A4A', '#22C55E', '#8B5CF6', '#EC4899', '#F59E0B', '#14B8A6', '#EF4444']

export default function UsersModule() {
  const [data, setData] = useState<UserRecord[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [helpOpen, setHelpOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<UserRecord | null>(null)

  const fetchData = () => {
    fetch('/api/users').then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [])

  const activeCount = data.filter(u => u.isActive).length
  const inactiveCount = data.filter(u => !u.isActive).length

  const handleSubmit = async () => {
    if (!form.name || !form.email) {
      toast.error('Please fill name and email')
      return
    }
    if (!editing && (!form.password || form.password.length < 6)) {
      toast.error('Password must be at least 6 characters')
      return
    }
    try {
      const res = await fetch('/api/users', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      })
      if (res.ok) {
        toast.success(editing ? 'User updated' : 'User created')
        setOpen(false); setEditing(null)
        setForm({ name: '', email: '', password: '', role: 'viewer' })
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to save user')
      }
    } catch {
      toast.error('Failed to save user')
    }
  }

  const handleEdit = (item: UserRecord) => {
    setEditing(item)
    setForm({ name: item.name, email: item.email, password: '', role: item.role })
    setOpen(true)
  }

  const toggleActive = async (item: UserRecord) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      })
      if (res.ok) {
        toast.success(`User ${item.isActive ? 'deactivated' : 'activated'}`)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    try {
      const res = await fetch(`/api/users?id=${deletingUser.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('User deleted')
        setDeleteOpen(false)
        setDeletingUser(null)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
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
      <OpsHeader
        title="Users"
        description="Manage system users, roles, and access. Admin-only."
        kpiCells={[
          { label: 'TOTAL', value: data.length },
          { label: 'ACTIVE', value: activeCount },
          { label: 'INACTIVE', value: inactiveCount, highlight: inactiveCount > 0, highlightColor: 'red' as const },
        ]}
        actionLabel="Add User"
        onAction={openCreate}
      >
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md">
          <HelpCircle size={12} className="mr-1" /> How does this work?
        </Button>
      </OpsHeader>

      {/* Card Grid */}
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <UsersIcon size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No users found</p>
          <p className="text-sm text-gray-400 mt-1">Add a new user to get started</p>
        </div>
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
                  <Badge className={`text-[11px] font-semibold border-0 ${rc.bg} ${rc.text}`}>
                    {roleLabel(item.role)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <Badge className={item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px] font-semibold' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-[11px] font-semibold'}>
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => toggleActive(editing)}
                  className={`${editing.isActive ? 'text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700' : 'text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700'} rounded-xl`}
                >
                  {editing.isActive ? <><UserX size={16} className="mr-2" />Deactivate</> : <><UserCheck size={16} className="mr-2" />Activate</>}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setDeletingUser(editing); setDeleteOpen(true) }}
                  className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"
                >
                  <Trash2 size={16} className="mr-2" />Delete
                </Button>
              </div>
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
          <div className="mb-6 bg-gray-50 rounded-lg border border-gray-100 p-3">
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
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-xl" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-red-400">*</span></Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="rounded-xl" />
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
                placeholder={editing ? 'Leave blank to keep current' : 'At least 6 characters'}
                className="pl-10 rounded-xl"
              />
            </div>
            {!editing && form.password.length > 0 && form.password.length < 6 && (
              <p className="text-[10px] text-red-500 mt-1">Password must be at least 6 characters</p>
            )}
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

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 size={18} className="text-red-600" /> Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deletingUser?.name} ({deletingUser?.email}). All their audit trail entries remain. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Users Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Users module controls who can access the system and what they can do. Every user has a role that determines their permissions. Only admins can create, edit, or delete users. Every user action is audited — you always know who created, modified, or deleted a user account.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> In a production warehouse system, not everyone should have the same access. A warehouse worker shouldn't see financial statements. A finance clerk shouldn't assign drivers to runsheets. This module controls who can do what — and tracks every change so you can audit who granted access to whom.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Roles & Permissions</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs text-red-900 leading-relaxed"><strong>Super Admin</strong> — Full system access. Can do everything an admin can do, plus manage other admins. There must always be at least one active super admin or admin in the system.</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs text-orange-900 leading-relaxed"><strong>Admin</strong> — Can create, edit, and delete users. Can access all modules. Can change roles. Cannot delete themselves or the last active admin.</p>
                </div>
                <div className="p-3 rounded-lg bg-sky-50 border border-sky-100">
                  <p className="text-xs text-sky-900 leading-relaxed"><strong>Operations Manager</strong> — Can manage operations (hub today, outbound, runsheets, returns). Cannot manage users or access financial data.</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs text-green-900 leading-relaxed"><strong>Warehouse</strong> — Can receive inbound, pick and pack orders, manage inventory. Cannot dispatch, manage payments, or access financial data.</p>
                </div>
                <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                  <p className="text-xs text-violet-900 leading-relaxed"><strong>Finance</strong> — Can access payments, statements, charges, disputes, and COD reconciliation. Cannot manage users or warehouse operations.</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed"><strong>Viewer</strong> — Read-only access to the dashboard and operations desk. Cannot create, edit, or delete anything.</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed"><strong>1. Create users.</strong> Click "Add User". Enter name, email, password (at least 6 characters), and select a role. The system checks for duplicate emails and rejects weak passwords. Every creation is audited.</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed"><strong>2. Edit users.</strong> Click any user card to edit their name, email, password, or role. If you change the password, the user will need to log in with the new password. You can't demote yourself or deactivate yourself — ask another admin.</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed"><strong>3. Deactivate vs Delete.</strong> To temporarily remove access, deactivate the user — they stay in the system with all their audit history but can't log in. To permanently remove, delete — but you can't delete yourself or the last active admin. All audit trail entries created by the user remain even after deletion.</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most ERP systems have a flat user list with no role enforcement — anyone can do anything. This module enforces roles at the API level (not just in the UI). Even if someone crafts a direct API request, the server checks their role before allowing the operation. And every user management action — creation, role change, deactivation, deletion — is written to the audit log with who did it and when. In a system that handles money and inventory, accountability for access control is non-negotiable.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
