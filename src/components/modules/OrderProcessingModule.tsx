'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Package, User, Truck, CreditCard, AlertTriangle, CheckCircle, XCircle, MinusCircle, ShoppingCart, CalendarDays, Eye, Edit3, Trash2, PackageCheck, PackageX, PackageSearch, UserCheck, Clock, Printer, Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import DataTable from '@/components/shared/DataTable'

interface OrderProcessing {
  id: string
  orderId: string
  orderNumber: string
  orderDate: string
  customerId: string
  customerName: string
  customerInfo: string
  totalAmount: number
  paymentMethod: string
  status: string
  trackingNumber: string
  invoiceGenerated: boolean
  invoiceNumber: string
  invoiceDate: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export default function OrderProcessingModule() {
  const [data, setData] = useState<OrderProcessing[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<OrderProcessing | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({ 
    orderNumber: '', 
    orderDate: new Date().toISOString().split('T')[0],
    customerId: '', 
    customerName: '', 
    customerInfo: '', 
    totalAmount: 0, 
    paymentMethod: 'Cash',
    status: 'new_order',
    trackingNumber: '',
    createdBy: 'current_user'
  })

  const fetchData = () => {
    fetch(`/api/order-processing?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/order-processing?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalOrders = data.length
  const newOrders = data.filter(o => o.status === 'new_order').length
  const processingOrders = data.filter(o => o.status === 'processing').length
  const shippedOrders = data.filter(o => o.status === 'shipped').length
  const deliveredOrders = data.filter(o => o.status === 'delivered').length

  const stats = [
    { label: 'Total Orders', value: totalOrders, icon: ShoppingCart, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'New', value: newOrders, icon: Package, color: '#6366F1', bg: 'bg-indigo-500/20', border: 'border-indigo-400/30', gradient: 'from-indigo-500/10 to-indigo-500/5' },
    { label: 'Processing', value: processingOrders, icon: Clock, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Shipped', value: shippedOrders, icon: Truck, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Delivered', value: deliveredOrders, icon: PackageCheck, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.customerName || !form.totalAmount) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/order-processing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Order updated successfully')
    } else {
      await fetch('/api/order-processing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast.success('Order created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ 
      orderNumber: '', 
      orderDate: new Date().toISOString().split('T')[0],
      customerId: '', 
      customerName: '', 
      customerInfo: '', 
      totalAmount: 0, 
      paymentMethod: 'Cash',
      status: 'new_order',
      trackingNumber: '',
      createdBy: 'current_user'
    })
    fetchData()
  }

  const handleEdit = (item: OrderProcessing) => {
    setEditing(item)
    setForm({ 
      orderNumber: item.orderNumber, 
      orderDate: item.orderDate.split('T')[0], 
      customerId: item.customerId, 
      customerName: item.customerName, 
      customerInfo: item.customerInfo, 
      totalAmount: item.totalAmount, 
      paymentMethod: item.paymentMethod,
      status: item.status,
      trackingNumber: item.trackingNumber || '',
      createdBy: item.createdBy
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/order-processing?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Order deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ 
      orderNumber: '', 
      orderDate: new Date().toISOString().split('T')[0],
      customerId: '', 
      customerName: '', 
      customerInfo: '', 
      totalAmount: 0, 
      paymentMethod: 'Cash',
      status: 'new_order',
      trackingNumber: '',
      createdBy: 'current_user'
    })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ 
      orderNumber: '', 
      orderDate: new Date().toISOString().split('T')[0],
      customerId: '', 
      customerName: '', 
      customerInfo: '', 
      totalAmount: 0, 
      paymentMethod: 'Cash',
      status: 'new_order',
      trackingNumber: '',
      createdBy: 'current_user'
    })
  }

  // Function to determine status badge
  const getStatusBadge = (order: OrderProcessing) => {
    switch(order.status) {
      case 'new_order':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[11px]">New</Badge>
      case 'processing':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Processing</Badge>
      case 'shipped':
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-0 text-[11px]">Shipped</Badge>
      case 'delivered':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">Delivered</Badge>
      case 'returned':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[11px]">Returned</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 text-[11px]">Unknown</Badge>
    }
  }

  // Function to print invoice
  const handlePrintInvoice = (order: OrderProcessing) => {
    toast.info(`Printing invoice for order ${order.orderNumber}`);
    // In a real app, this would open a print dialog for the invoice
  };

  // Function to download invoice
  const handleDownloadInvoice = (order: OrderProcessing) => {
    toast.info(`Downloading invoice for order ${order.orderNumber}`);
    // In a real app, this would download the invoice PDF
  };

  // Define columns for the data table
  const columns = [
    { key: 'orderNumber', label: 'Order Number', className: 'font-medium' },
    { key: 'orderDate', label: 'Date', render: (value: string) => new Date(value).toLocaleDateString() },
    { key: 'customerName', label: 'Customer' },
    { key: 'totalAmount', label: 'Amount', render: (value: number) => `KES ${value.toFixed(2)}` },
    { key: 'paymentMethod', label: 'Payment' },
    { key: 'trackingNumber', label: 'Tracking' },
    { 
      key: 'status', 
      label: 'Status', 
      render: (value: string, row: OrderProcessing) => getStatusBadge(row) 
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      className: 'text-right',
      render: (_: any, row: OrderProcessing) => (
        <div className="flex justify-end gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-lg"
            onClick={() => handlePrintInvoice(row)}
            title="Print Invoice"
          >
            <Printer size={12} />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-lg"
            onClick={() => handleDownloadInvoice(row)}
            title="Download Invoice"
          >
            <Download size={12} />
          </Button>
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Order Processing Office"
        description="Manage new orders and track their processing status"
        icon={ShoppingCart}
        stats={stats}
        actionLabel="New Order"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search orders..."
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
        keyExtractor={(row) => row.id}
        pageSize={10}
        emptyMessage="No orders found"
        emptyIcon={<PackageSearch size={48} className="mx-auto text-gray-300" />}
      />

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? `Order ${editing.orderNumber}` : 'New Order'}
        subtitle={editing ? `Created: ${new Date(editing.createdAt).toLocaleDateString()}` : 'Fill in the details to create a new order'}
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
                {editing ? 'Update Order' : 'Create Order'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Order ID</p>
                <p className="font-mono text-gray-700">{editing.orderId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                {getStatusBadge(editing)}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Order Number</p>
                <p className="font-mono text-gray-700">{editing.orderNumber}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Tracking Number</p>
                <p className="text-gray-700">{editing.trackingNumber || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Amount</p>
                <p className="text-gray-700">KES {editing.totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Order Number</Label>
              <Input
                value={form.orderNumber}
                onChange={e => setForm({ ...form, orderNumber: e.target.value })}
                placeholder="Auto-generated if left empty"
                className="rounded-xl"
                disabled={!!editing} // Disable editing for existing orders
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Order Date <span className="text-red-400">*</span></Label>
              <Input
                type="date"
                value={form.orderDate}
                onChange={e => setForm({ ...form, orderDate: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
          
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
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Customer Info</Label>
            <Input
              value={form.customerInfo}
              onChange={e => setForm({ ...form, customerInfo: e.target.value })}
              placeholder="Enter customer contact details"
              className="rounded-xl"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Total Amount (KES) <span className="text-red-400">*</span></Label>
              <Input
                type="number"
                value={form.totalAmount}
                onChange={e => setForm({ ...form, totalAmount: parseFloat(e.target.value) || 0 })}
                placeholder="Enter total amount"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Payment Method</Label>
              <select
                title="Payment Method"
                value={form.paymentMethod}
                onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="Cash">Cash</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Order Status</Label>
            <select
              title="Order Status"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
            >
              <option value="new_order">New Order</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="returned">Returned</option>
            </select>
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Tracking Number</Label>
            <Input
              value={form.trackingNumber}
              onChange={e => setForm({ ...form, trackingNumber: e.target.value })}
              placeholder="Enter tracking number (warehouse or dropship)"
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the order record.</AlertDialogDescription>
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