'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Package, AlertTriangle, CheckCircle, XCircle, RotateCcw, PackageSearch, Clock, Edit3 } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import DataTable from '@/components/shared/DataTable'

interface RTVRecord {
  id: string
  rtvId: string
  originalOrderId: string
  returnOrderNumber: string
  merchantId: string
  merchantName: string
  productId: string
  productName: string
  qty: number
  reason: string
  approvalStatus: string
  approvedBy: string
  approvedAt: string
  status: string
  processedBy: string
  createdAt: string
  updatedAt: string
}

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

export default function RTVModule() {
  const [rtvData, setRtvData] = useState<RTVRecord[]>([])
  const [shrinkageData, setShrinkageData] = useState<ShrinkageRecord[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<RTVRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'rtv' | 'shrinkage'>('rtv')
  const [form, setForm] = useState({ 
    originalOrderId: '', 
    returnOrderNumber: '', 
    merchantId: '', 
    merchantName: '', 
    productId: '', 
    productName: '', 
    qty: 0, 
    reason: '', 
    approvalStatus: 'pending_approval',
    approvedBy: '',
    status: 'pending',
    processedBy: ''
  })

  const fetchData = () => {
    fetch(`/api/rtv?search=${search}`).then(r => r.json()).then(setRtvData)
    fetch(`/api/shrinkage?search=${search}`).then(r => r.json()).then(setShrinkageData)
  }

  useEffect(() => {
    fetchData()
  }, [search, fetchData])

  const rtvFilteredData = rtvData
  const shrinkageFilteredData = shrinkageData

  const totalRtv = rtvData.length
  const pendingApprovalRtv = rtvData.filter(r => r.approvalStatus === 'pending_approval').length
  const approvedRtv = rtvData.filter(r => r.approvalStatus === 'approved').length
  const rejectedRtv = rtvData.filter(r => r.approvalStatus === 'rejected').length
  
  const totalShrinkage = shrinkageData.length
  const pendingShrinkage = shrinkageData.filter(s => s.status === 'pending').length
  const resolvedShrinkage = shrinkageData.filter(s => s.status === 'resolved').length

  const rtvStats = [
    { label: 'Total RTV', value: totalRtv, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Pending Approval', value: pendingApprovalRtv, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Approved', value: approvedRtv, icon: CheckCircle, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Rejected', value: rejectedRtv, icon: XCircle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
  ]
  
  const shrinkageStats = [
    { label: 'Total Shrinkage', value: totalShrinkage, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Pending', value: pendingShrinkage, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Resolved', value: resolvedShrinkage, icon: CheckCircle, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.merchantName || !form.productName || !form.reason) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      // Don't duplicate id in the payload - it's passed separately
      const payload = { 
        originalOrderId: form.originalOrderId, 
        returnOrderNumber: form.returnOrderNumber, 
        merchantId: form.merchantId, 
        merchantName: form.merchantName, 
        productId: form.productId, 
        productName: form.productName, 
        qty: form.qty, 
        reason: form.reason, 
        approvalStatus: form.approvalStatus,
        approvedBy: form.approvedBy,
        status: form.status,
        processedBy: form.processedBy
      };
      await fetch('/api/rtv', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('RTV record updated successfully')
    } else {
      await fetch('/api/rtv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('RTV record created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ 
      originalOrderId: '', 
      returnOrderNumber: '', 
      merchantId: '', 
      merchantName: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      approvalStatus: 'pending_approval',
      approvedBy: '',
      status: 'pending',
      processedBy: ''
    })
    fetchData()
  }

  const handleEdit = (item: RTVRecord) => {
    setEditing(item)
    setForm({ 
      originalOrderId: item.originalOrderId, 
      returnOrderNumber: item.returnOrderNumber, 
      merchantId: item.merchantId, 
      merchantName: item.merchantName, 
      productId: item.productId, 
      productName: item.productName, 
      qty: item.qty, 
      reason: item.reason, 
      approvalStatus: item.approvalStatus,
      approvedBy: item.approvedBy || '',
      status: item.status,
      processedBy: item.processedBy || ''
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/rtv?id=${deletingId}`, { method: 'DELETE' })
      toast.success('RTV record deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ 
      originalOrderId: '', 
      returnOrderNumber: '', 
      merchantId: '', 
      merchantName: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      approvalStatus: 'pending_approval',
      approvedBy: '',
      status: 'pending',
      processedBy: ''
    })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ 
      originalOrderId: '', 
      returnOrderNumber: '', 
      merchantId: '', 
      merchantName: '', 
      productId: '', 
      productName: '', 
      qty: 0, 
      reason: '', 
      approvalStatus: 'pending_approval',
      approvedBy: '',
      status: 'pending',
      processedBy: ''
    })
  }

  // Function to determine status badge
  const getStatusBadge = (record: RTVRecord | ShrinkageRecord, type: 'rtv' | 'shrinkage') => {
    if (type === 'rtv') {
      const rtvRecord = record as RTVRecord;
      switch(rtvRecord.approvalStatus) {
        case 'pending_approval':
          return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Pending Approval</Badge>
        case 'approved':
          return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">Approved</Badge>
        case 'rejected':
          return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[11px]">Rejected</Badge>
        default:
          return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[11px]">Unknown</Badge>
      }
    } else {
      const shrinkageRecord = record as ShrinkageRecord;
      switch(shrinkageRecord.status) {
        case 'pending':
          return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Pending</Badge>
        case 'resolved':
          return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">Resolved</Badge>
        default:
          return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[11px]">Unknown</Badge>
      }
    }
  }

  // Function to handle approval
  const handleApprove = async (record: RTVRecord) => {
    try {
      const updatedRecord = {
        ...record,
        approvalStatus: 'approved',
        approvedBy: 'current_user', // In real app, this would come from session
        approvedAt: new Date().toISOString()
      };
      
      await fetch('/api/rtv', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: record.id, ...updatedRecord }) 
      });
      
      toast.success('RTV request approved successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to approve RTV request');
    }
  };

  // Function to handle rejection
  const handleReject = async (record: RTVRecord) => {
    try {
      const updatedRecord = {
        ...record,
        approvalStatus: 'rejected',
        approvedBy: 'current_user', // In real app, this would come from session
        approvedAt: new Date().toISOString()
      };
      
      await fetch('/api/rtv', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: record.id, ...updatedRecord }) 
      });
      
      toast.success('RTV request rejected successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to reject RTV request');
    }
  };

  // Define columns for RTV data table
  const rtvColumns = [
    { key: 'rtvId', label: 'RTV ID', className: 'font-medium' },
    { key: 'originalOrderId', label: 'Original Order' },
    { key: 'returnOrderNumber', label: 'Return Order' },
    { key: 'merchantName', label: 'Merchant' },
    { key: 'productName', label: 'Product' },
    { key: 'qty', label: 'Quantity' },
    { key: 'reason', label: 'Reason' },
    { 
      key: 'approvalStatus', 
      label: 'Approval Status', 
      render: (value: string, row: RTVRecord) => getStatusBadge(row, 'rtv') 
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      className: 'text-right',
      render: (_unused: unknown, row: RTVRecord) => (
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
        </div>
      )
    },
  ]

  // Define columns for Shrinkage data table
  const shrinkageColumns = [
    { key: 'shrinkageId', label: 'Shrinkage ID', className: 'font-medium' },
    { key: 'rtvId', label: 'RTV ID' },
    { key: 'productName', label: 'Product' },
    { key: 'qty', label: 'Quantity' },
    { key: 'reason', label: 'Reason' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (value: string, row: ShrinkageRecord) => getStatusBadge(row, 'shrinkage') 
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      className: 'text-right',
      render: (_unused: unknown, row: ShrinkageRecord) => (
        <div className="flex justify-end gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-lg"
            title="Edit"
          >
            <Edit3 size={12} />
          </Button>
        </div>
      )
    },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="RTV & Shrinkage Office"
        description="Manage returns to vendor and shrinkage records"
        icon={RotateCcw}
        stats={activeTab === 'rtv' ? rtvStats : shrinkageStats}
        actionLabel={activeTab === 'rtv' ? "New RTV" : "New Shrinkage"}
        onAction={activeTab === 'rtv' ? openCreate : () => toast.info('Shrinkage creation not implemented yet')}
      >
        <div className="flex space-x-2">
          <Button
            variant={activeTab === 'rtv' ? 'default' : 'outline'}
            className={`rounded-xl ${activeTab === 'rtv' ? 'bg-[#FF6B35] hover:bg-[#E55A25]' : ''}`}
            onClick={() => setActiveTab('rtv')}
          >
            RTV
          </Button>
          <Button
            variant={activeTab === 'shrinkage' ? 'default' : 'outline'}
            className={`rounded-xl ${activeTab === 'shrinkage' ? 'bg-[#FF6B35] hover:bg-[#E55A25]' : ''}`}
            onClick={() => setActiveTab('shrinkage')}
          >
            Shrinkage
          </Button>
        </div>
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={`Search ${activeTab}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {/* Tab Content */}
      {activeTab === 'rtv' ? (
        <DataTable
          data={rtvFilteredData}
          columns={rtvColumns}
          keyExtractor={(row: RTVRecord) => row.id}
          pageSize={10}
          emptyMessage="No RTV records found"
          emptyIcon={<PackageSearch size={48} className="mx-auto text-gray-300" />}
        />
      ) : (
        <DataTable
          data={shrinkageFilteredData}
          columns={shrinkageColumns}
          keyExtractor={(row: ShrinkageRecord) => row.id}
          pageSize={10}
          emptyMessage="No shrinkage records found"
          emptyIcon={<AlertTriangle size={48} className="mx-auto text-gray-300" />}
        />
      )}

      {/* RTV Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `RTV for ${editing.merchantName}` : 'New RTV Request'}
        subtitle={editing ? `ID: ${editing.rtvId}` : 'Fill in the details to create a new RTV request'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 rounded-xl"
                  onClick={() => handleApprove(editing)}
                >
                  <CheckCircle size={16} className="mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 rounded-xl"
                  onClick={() => handleReject(editing)}
                >
                  <XCircle size={16} className="mr-2" />
                  Reject
                </Button>
              </div>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                {editing ? 'Update RTV' : 'Create RTV'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">RTV ID</p>
                <p className="font-mono text-gray-700">{editing.rtvId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Approval Status</p>
                {getStatusBadge(editing, 'rtv')}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Original Order</p>
                <p className="font-mono text-gray-700">{editing.originalOrderId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Return Order</p>
                <p className="text-gray-700">{editing.returnOrderNumber}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                <p className="text-gray-700">{editing.status}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Original Order ID</Label>
              <Input
                value={form.originalOrderId}
                onChange={e => setForm({ ...form, originalOrderId: e.target.value })}
                placeholder="Enter original order ID"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Return Order Number</Label>
              <Input
                value={form.returnOrderNumber}
                onChange={e => setForm({ ...form, returnOrderNumber: e.target.value })}
                placeholder="Enter return order number (e.g. RT001)"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Merchant Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.merchantName}
                onChange={e => setForm({ ...form, merchantName: e.target.value })}
                placeholder="Enter merchant name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Merchant ID</Label>
              <Input
                value={form.merchantId}
                onChange={e => setForm({ ...form, merchantId: e.target.value })}
                placeholder="Enter merchant ID"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Product Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.productName}
                onChange={e => setForm({ ...form, productName: e.target.value })}
                placeholder="Enter product name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Product ID</Label>
              <Input
                value={form.productId}
                onChange={e => setForm({ ...form, productId: e.target.value })}
                placeholder="Enter product ID"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Reason <span className="text-red-400">*</span></Label>
              <Input
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="Enter return reason"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Approval Status</Label>
              <select
                title="Approval Status"
                value={form.approvalStatus}
                onChange={e => setForm({ ...form, approvalStatus: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Status</Label>
              <select
                title="RTV Status"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="pending">Pending</option>
                <option value="processed">Processed</option>
              </select>
            </div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RTV Request</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the RTV request record.</AlertDialogDescription>
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