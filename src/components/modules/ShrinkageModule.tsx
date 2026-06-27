'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Package, AlertTriangle, CheckCircle, Trash2, Edit3, PackageSearch, Clock } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import DataTable from '@/components/shared/DataTable'

interface ShrinkageRecord {
  id: string
  shrinkageId: string
  rtvId: string
  productId: string
  productName: string
  qty: number
  reason: string
  reportedBy: string
  status: string
  createdAt: string
  resolvedBy: string
  resolvedAt: string
}

export default function ShrinkageModule() {
  const [data, setData] = useState<ShrinkageRecord[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<ShrinkageRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ 
    rtvId: '', 
    productId: '', 
    productName: '', 
    qty: 0, 
    reason: '', 
    reportedBy: '', 
    status: 'pending',
    resolvedBy: '',
    resolvedAt: ''
  })

  const fetchData = () => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalShrinkage = data.length
  const pendingShrinkage = data.filter(s => s.status === 'pending').length
  const resolvedShrinkage = data.filter(s => s.status === 'resolved').length

  const stats = [
    { label: 'Total Shrinkage', value: totalShrinkage, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Pending', value: pendingShrinkage, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Resolved', value: resolvedShrinkage, icon: CheckCircle, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.productName || !form.reason) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/shrinkage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Shrinkage record updated successfully')
    } else {
      await fetch('/api/shrinkage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('Shrinkage record created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ 
      rtvId: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      reportedBy: '', 
      status: 'pending',
      resolvedBy: '',
      resolvedAt: ''
    })
    fetchData()
  }

  const handleEdit = (item: ShrinkageRecord) => {
    setEditing(item)
    setForm({ 
      rtvId: item.rtvId, 
      productId: item.productId, 
      productName: item.productName, 
      qty: item.qty, 
      reason: item.reason, 
      reportedBy: item.reportedBy, 
      status: item.status,
      resolvedBy: item.resolvedBy || '',
      resolvedAt: item.resolvedAt || ''
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/shrinkage?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Shrinkage record deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ 
      rtvId: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      reportedBy: '', 
      status: 'pending',
      resolvedBy: '',
      resolvedAt: ''
    })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ 
      rtvId: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      reportedBy: '', 
      status: 'pending',
      resolvedBy: '',
      resolvedAt: ''
    })
  }

  // Function to determine status badge
  const getStatusBadge = (record: ShrinkageRecord) => {
    switch(record.status) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Pending</Badge>
      case 'resolved':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">Resolved</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[11px]">Unknown</Badge>
    }
  }

  // Define columns for the data table
  const columns = [
    { key: 'shrinkageId', label: 'Shrinkage ID', className: 'font-medium' },
    { key: 'rtvId', label: 'RTV ID' },
    { key: 'productName', label: 'Product' },
    { key: 'qty', label: 'Quantity' },
    { key: 'reason', label: 'Reason' },
    { key: 'reportedBy', label: 'Reported By' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (value: string, row: ShrinkageRecord) => getStatusBadge(row) 
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      className: 'text-right',
      render: (_: any, row: ShrinkageRecord) => (
        <div className="flex justify-end gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-lg"
            onClick={() => handleEdit(row)}
            title="Edit"
          >
            <Edit3 size={12} />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-lg text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => { setDeletingId(row.id); setDeleteOpen(true) }}
            title="Delete"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )
    },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Shrinkage Office"
        description="Track and manage inventory shrinkage records"
        icon={AlertTriangle}
        stats={stats}
        actionLabel="New Shrinkage"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search shrinkage records..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {/* Data Table */}
      <DataTable
        data={filteredData}
        columns={columns}
        keyExtractor={(row: ShrinkageRecord) => row.id}
        pageSize={10}
        emptyMessage="No shrinkage records found"
        emptyIcon={<AlertTriangle size={48} className="mx-auto text-gray-300" />}
      />

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `Shrinkage for ${editing.productName}` : 'New Shrinkage Record'}
        subtitle={editing ? `ID: ${editing.shrinkageId}` : 'Fill in the details to create a new shrinkage record'}
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
                {editing ? 'Update Shrinkage' : 'Create Shrinkage'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Shrinkage ID</p>
                <p className="font-mono text-gray-700">{editing.shrinkageId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                {getStatusBadge(editing)}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">RTV ID</p>
                <p className="font-mono text-gray-700">{editing.rtvId || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Reported By</p>
                <p className="text-gray-700">{editing.reportedBy}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Quantity</p>
                <p className="text-gray-700">{editing.qty}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">RTV ID</Label>
              <Input
                value={form.rtvId}
                onChange={e => setForm({ ...form, rtvId: e.target.value })}
                placeholder="Enter RTV ID (if applicable)"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Product Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.productName}
                onChange={e => setForm({ ...form, productName: e.target.value })}
                placeholder="Enter product name"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Product ID</Label>
              <Input
                value={form.productId}
                onChange={e => setForm({ ...form, productId: e.target.value })}
                placeholder="Enter product ID"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Quantity</Label>
              <Input
                type="number"
                value={form.qty}
                onChange={e => setForm({ ...form, qty: parseInt(e.target.value) || 0 })}
                placeholder="Enter quantity"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Reason <span className="text-red-400">*</span></Label>
            <Input
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Enter reason for shrinkage"
              className="rounded-xl"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Reported By</Label>
              <Input
                value={form.reportedBy}
                onChange={e => setForm({ ...form, reportedBy: e.target.value })}
                placeholder="Enter name of reporter"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Status</Label>
              <select
                title="Shrinkage Status"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shrinkage Record</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the shrinkage record.</AlertDialogDescription>
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