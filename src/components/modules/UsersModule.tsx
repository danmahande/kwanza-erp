'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Users as UsersIcon, UserCheck, UserX, UserMinus, Pencil, Calendar, Lock, HelpCircle, Trash2, Plus, ArrowLeft as BackIcon } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import PageTransition from '@/components/shared/PageTransition'

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

const emptyForm = { name: '', email: '', password: '', role: 'viewer' }

export default function UsersModule() {
  const [data, setData] = useState<UserRecord[]>([])
  const [view, setView] = useState<'list' | 'add'>('list')
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [form, setForm] = useState(emptyForm)
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
        setView('list'); setEditing(null)
        setForm(emptyForm)
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
    setView('add')
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
        setView('list')
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
    setForm(emptyForm)
    setView('add')
  }

  // ── Render: Add/Edit User (full-page) ──
  if (view === 'add') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="add">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => { setView('list'); setEditing(null); setForm(emptyForm) }}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900">{editing ? `Edit: ${editing.name}` : 'New User'}</h1>
                  <p className="text-[11px] text-gray-500">{editing ? `${editing.email} · ${roleLabel(editing.role)}` : 'Fill in the details to create a new user'}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                {editing && (
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Email</p>
                        <p className="text-gray-700">{editing.email}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Role</p>
                        <Badge className={`text-[11px] font-semibold border-0 ${roleColor(editing.role).bg} ${roleColor(editing.role).text}`}>{roleLabel(editing.role)}</Badge>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                        <Badge className={editing.isActive ? 'bg-green-100 text-green-700 border-0 text-[11px]' : 'bg-gray-100 text-gray-500 border-0 text-[11px]'}>{editing.isActive ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                        <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">User Details</h2>
                  <p className="text-xs text-gray-500">Enter the user's name, email, password, and role. Password must be at least 6 characters.</p>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Name <span className="text-red-400">*</span></Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Email <span className="text-red-400">*</span></Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block">Password {editing ? '(leave blank to keep)' : '*'}</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? 'Leave blank to keep current' : 'At least 6 characters'} className="pl-10 rounded-xl" />
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
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
                {editing ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className={`rounded-xl ${editing.isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`} onClick={() => toggleActive(editing)}>
                      {editing.isActive ? <><UserX size={14} className="mr-1" />Deactivate</> : <><UserCheck size={14} className="mr-1" />Activate</>}
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setDeletingUser(editing); setDeleteOpen(true) }}>
                      <Trash2 size={14} className="mr-1" />Delete
                    </Button>
                  </div>
                ) : <div />}
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setView('list'); setEditing(null); setForm(emptyForm) }}>Cancel</Button>
                  <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSubmit}>{editing ? 'Update User' : 'Create User'}</Button>
                </div>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: List ──
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Users"
            description="Manage system users, roles, and access. Admin-only."
            kpiCells={[
              { label: 'TOTAL', value: data.length },
              { label: 'ACTIVE', value: activeCount },
              { label: 'INACTIVE', value: inactiveCount, highlight: inactiveCount > 0, highlightColor: 'red' as const },
            ]}
          />

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={openCreate}>
              <Plus size={12} className="mr-1" /> Add User
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={12} className="mr-1" /> Help
            </Button>
          </div>

          {/* Card Grid */}
          {data.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <UsersIcon size={28} className="text-orange-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No users yet</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">Add your first user to manage system access and roles.</p>
              <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={openCreate}>
                <Plus size={14} className="mr-1.5" /> Add User
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map((item, i) => {
                const rc = roleColor(item.role)
                const initials = item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                const colorIdx = i % COLORS.length
                return (
                  <div
                    key={item.id}
                    onClick={() => handleEdit(item)}
                    className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ring-2 ring-white shadow-sm" style={{ backgroundColor: COLORS[colorIdx] }}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{item.name}</h3>
                          <p className="text-xs text-gray-400 truncate">{item.email}</p>
                        </div>
                      </div>
                      <Badge className={`text-[11px] font-semibold border-0 ${rc.bg} ${rc.text}`}>{roleLabel(item.role)}</Badge>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      <Badge className={item.isActive ? 'bg-green-100 text-green-700 border-0 text-[11px] font-semibold' : 'bg-gray-100 text-gray-500 border-0 text-[11px] font-semibold'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="text-[11px] text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

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
            <AlertDialogContent className="rounded-2xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Users</AlertDialogTitle>
                <AlertDialogDescription>
                  Control who can access the system and what they can do. Every user has a role that determines their permissions. Admin-only.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Add User</p>
                  <p>Click "Add User" to open a full-page form. Enter name, email, password (min 6 chars), and select a role. Every creation is audited.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Edit Users</p>
                  <p>Click any user card to edit their name, email, password, or role. You can't demote or deactivate yourself — ask another admin.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Deactivate vs Delete</p>
                  <p>Deactivate temporarily removes access (user stays in system with audit history). Delete permanently removes — blocked if the user has dependencies or is the last active admin.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Roles</p>
                  <p>Super Admin (full access), Admin (manage users + all modules), Operations Manager, Warehouse, Finance, Driver, Viewer (read-only). Roles are enforced at the API level.</p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
