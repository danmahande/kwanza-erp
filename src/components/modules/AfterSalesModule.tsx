'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Package, User, Truck, CreditCard, AlertTriangle, CheckCircle, XCircle, MinusCircle, ShoppingCart, CalendarDays, Eye, Edit3, Trash2, PackageCheck, PackageX, PackageSearch, UserCheck, Clock } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

interface AfterSalesRecord {
  id: string
  afterSalesId: string
  originalOrderId: string
  returnOrderNumber: string
  customerId: string
  customerName: string
  reason: string
  returnStatus: string
  agentId: string
  agentName: string
  approvedBy: string
  approvedAt: string
  refundAmount: number
  replacementProductId: string
  replacementProductName: string
  returnTrackingNumber: string
  resolutionNotes: string
  createdAt: string
  updatedAt: string
}

export default function AfterSalesModule() {
  const [data, setData] = useState<AfterSalesRecord[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<AfterSalesRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ 
    originalOrderId: '', 
    returnOrderNumber: '', 
    customerId: '', 
    customerName: '', 
    reason: '', 
    returnStatus: 'initiated',
    agentId: '',
    agentName: '',
    approvedBy: '',
    refundAmount: 0,
    replacementProductId: '',
    replacementProductName: '',
    returnTrackingNumber: '',
    resolutionNotes: ''
  })

  const fetchData = () => {
    fetch(`/api/after-sales?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/after-sales?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalReturns = data.length
  const initiatedReturns = data.filter(r => r.returnStatus === 'initiated').length
  const approvedReturns = data.filter(r => r.returnStatus === 'approved').length
  const processedReturns = data.filter(r => r.returnStatus === 'processed').length

  const stats = [
    { label: 'Total Returns', value: totalReturns, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Initiated', value: initiatedReturns, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Approved', value: approvedReturns, icon: CheckCircle, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Processed', value: processedReturns, icon: PackageCheck, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.customerName || !form.reason) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/after-sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('After-sales record updated successfully')
    } else {
      await fetch('/api/after-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('After-sales record created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ 
      originalOrderId: '', 
      returnOrderNumber: '', 
      customerId: '', 
      customerName: '', 
      reason: '', 
      returnStatus: 'initiated',
      agentId: '',
      agentName: '',
      approvedBy: '',
      refundAmount: 0,
      replacementProductId: '',
      replacementProductName: '',
      returnTrackingNumber: '',
      resolutionNotes: ''
    })
    fetchData()
  }

  const handleEdit = (item: AfterSalesRecord) => {
    setEditing(item)
    setForm({ 
      originalOrderId: item.originalOrderId, 
      returnOrderNumber: item.returnOrderNumber, 
      customerId: item.customerId, 
      customerName: item.customerName, 
      reason: item.reason, 
      returnStatus: item.returnStatus,
      agentId: item.agentId || '',
      agentName: item.agentName || '',
      approvedBy: item.approvedBy || '',
      refundAmount: item.refundAmount || 0,
      replacementProductId: item.replacementProductId || '',
      replacementProductName: item.replacementProductName || '',
      returnTrackingNumber: item.returnTrackingNumber || '',
      resolutionNotes: item.resolutionNotes || ''
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/after-sales?id=${deletingId}`, { method: 'DELETE' })
      toast.success('After-sales record deleted successfully')
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
      customerId: '', 
      customerName: '', 
      reason: '', 
      returnStatus: 'initiated',
      agentId: '',
      agentName: '',
      approvedBy: '',
      refundAmount: 0,
      replacementProductId: '',
      replacementProductName: '',
      returnTrackingNumber: '',
      resolutionNotes: ''
    })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ 
      originalOrderId: '', 
      returnOrderNumber: '', 
      customerId: '', 
      customerName: '', 
      reason: '', 
      returnStatus: 'initiated',
      agentId: '',
      agentName: '',
      approvedBy: '',
      refundAmount: 0,
      replacementProductId: '',
      replacementProductName: '',
      returnTrackingNumber: '',
      resolutionNotes: ''
    })
  }

  // Function to handle approval
  const handleApprove = async (record: AfterSalesRecord) => {
    try {
      const updatedRecord = {
        ...record,
        returnStatus: 'approved',
        approvedBy: 'current_user', // In real app, this would come from session
        approvedAt: new Date().toISOString()
      };
      
      await fetch('/api/after-sales', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: record.id, ...updatedRecord }) 
      });
      
      toast.success('Return approved successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to approve return');
    }
  };

  // Function to handle processing
  const handleProcess = async (record: AfterSalesRecord) => {
    try {
      const updatedRecord = {
        ...record,
        returnStatus: 'processed',
        returnTrackingNumber: record.returnTrackingNumber || `RTK-${Date.now()}` // Generate tracking number if not set
      };
      
      await fetch('/api/after-sales', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: record.id, ...updatedRecord }) 
      });
      
      toast.success('Return processed successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to process return');
    }
  };

  // Function to determine status badge
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'initiated':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Initiated</Badge>
      case 'in_review':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[11px]">In Review</Badge>
      case 'approved':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[11px]">Rejected</Badge>
      case 'processed':
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-0 text-[11px]">Processed</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[11px]">Unknown</Badge>
    }
  }

  // Function to handle rejection
  const handleReject = async (record: AfterSalesRecord) => {
    try {
      const updatedRecord = {
        ...record,
        returnStatus: 'rejected',
        approvedBy: 'current_user', // In real app, this would come from session
        approvedAt: new Date().toISOString()
      };
      
      await fetch('/api/after-sales', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ id: record.id, ...updatedRecord }) 
      });
      
      toast.success('Return request rejected successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to reject return request');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="After-Sales Office"
        description="Handle customer returns and manage the return process"
        icon={PackageX}
        stats={stats}
        actionLabel="New Return"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search returns..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Return ID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Original Order</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Return Order</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Refund Amount</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.length > 0 ? (
                    filteredData.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono text-sm text-gray-700">{item.afterSalesId}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-700">{item.originalOrderId}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-700">{item.returnOrderNumber}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-700">{item.customerName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-700">{item.reason}</div>
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(item.returnStatus)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-gray-700">KES {(item.refundAmount || 0).toLocaleString()}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-lg"
                              onClick={() => handleEdit(item)}
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-lg text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                              onClick={() => handleApprove(item)}
                              title="Approve"
                            >
                              <CheckCircle size={14} />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                              onClick={() => handleProcess(item)}
                              title="Process"
                            >
                              <PackageCheck size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 px-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <PackageSearch size={48} className="text-gray-300 mb-4" />
                          <p className="text-sm font-medium text-gray-400">No returns found</p>
                          <p className="text-xs text-gray-300 mt-1">Create a new return to get started</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `Return for ${editing.customerName}` : 'New Return Request'}
        subtitle={editing ? `ID: ${editing.afterSalesId}` : 'Fill in the details to create a new return request'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && (
              <div className="flex gap-2">
                {editing.returnStatus !== 'approved' && (
                  <Button
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 rounded-xl"
                    onClick={() => handleApprove(editing)}
                  >
                    <CheckCircle size={16} className="mr-2" />
                    Approve
                  </Button>
                )}
                {editing.returnStatus === 'approved' && (
                  <Button
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 rounded-xl"
                    onClick={() => handleProcess(editing)}
                  >
                    <PackageCheck size={16} className="mr-2" />
                    Process
                  </Button>
                )}
              </div>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                {editing ? 'Update Return' : 'Create Return'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Return ID</p>
                <p className="font-mono text-gray-700">{editing.afterSalesId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                {getStatusBadge(editing.returnStatus)}
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
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Refund</p>
                <p className="text-gray-700">KES {(editing.refundAmount || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Customer Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.customerName}
                onChange={e => setForm({ ...form, customerName: e.target.value })}
                placeholder="Enter customer name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Customer ID</Label>
              <Input
                value={form.customerId}
                onChange={e => setForm({ ...form, customerId: e.target.value })}
                placeholder="Enter customer ID"
                className="rounded-xl"
              />
            </div>
          </div>
          
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
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Return Reason <span className="text-red-400">*</span></Label>
            <Input
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Enter return reason"
              className="rounded-xl"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Return Status</Label>
              <select
                title="Return Status"
                value={form.returnStatus}
                onChange={e => setForm({ ...form, returnStatus: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="initiated">Initiated</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="processed">Processed</option>
              </select>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Agent Name</Label>
              <Input
                value={form.agentName}
                onChange={e => setForm({ ...form, agentName: e.target.value })}
                placeholder="Enter agent name"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Refund Amount (KES)</Label>
              <Input
                type="number"
                value={form.refundAmount}
                onChange={e => setForm({ ...form, refundAmount: parseFloat(e.target.value) || 0 })}
                placeholder="Enter refund amount"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Return Tracking Number</Label>
              <Input
                value={form.returnTrackingNumber}
                onChange={e => setForm({ ...form, returnTrackingNumber: e.target.value })}
                placeholder="Enter tracking number"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Replacement Product</Label>
            <Input
              value={form.replacementProductName}
              onChange={e => setForm({ ...form, replacementProductName: e.target.value })}
              placeholder="Enter replacement product name"
              className="rounded-xl"
            />
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Resolution Notes</Label>
            <textarea
              value={form.resolutionNotes}
              onChange={e => setForm({ ...form, resolutionNotes: e.target.value })}
              placeholder="Enter resolution notes"
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
            />
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Return Request</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the return request record.</AlertDialogDescription>
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