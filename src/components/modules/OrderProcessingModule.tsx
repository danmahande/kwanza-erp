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
import {
  ShoppingCart, Search, Plus, Printer, Download, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface Order {
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
  trackingNumber: string | null
  invoiceGenerated: boolean
  invoiceNumber: string | null
  createdBy: string
  createdAt: string
}

interface Merchant {
  id: string
  merchantId: string
  businessName: string
  deliveryType: string | null
}

interface Product {
  id: string
  productId: string
  productLabel: string
  unitSellingPrice: number
  merchantId: string
  merchantName: string
}

export default function OrderProcessingModule() {
  const [data, setData] = useState<Order[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [viewing, setViewing] = useState<Order | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    merchantId: '',
    productId: '',
    customerName: '',
    customerContact: '',
    customerEmail: '',
    customerAddress: '',
    qty: '1',
    paymentMethod: 'Cash',
    createdBy: 'admin',
  })

  const fetchData = () => {
    fetch(`/api/order-processing?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    fetchData()
    fetch('/api/merchants').then(r => r.json()).then(d => setMerchants(Array.isArray(d) ? d : []))
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { fetchData() }, [search])

  const filteredProducts = form.merchantId
    ? products.filter(p => p.merchantId === form.merchantId)
    : products

  const stats = [
    { label: 'Total Orders', value: data.length, icon: ShoppingCart, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Total Value', value: formatCurrencyCompact(data.reduce((s, o) => s + o.totalAmount, 0)), icon: Download, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'New Orders', value: data.filter(o => o.status === 'new_order').length, icon: Plus, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.customerName || !form.customerContact) {
      toast.error('Customer name and contact are required')
      return
    }
    const selectedProduct = products.find(p => p.productId === form.productId)
    const qty = parseInt(form.qty) || 1
    const totalAmount = (selectedProduct?.unitSellingPrice || 0) * qty
    const merchant = merchants.find(m => m.merchantId === form.merchantId)
    const payload = {
      merchantId: form.merchantId,
      productId: form.productId,
      productName: selectedProduct?.productLabel || '',
      customerName: form.customerName,
      customerContact: form.customerContact,
      customerEmail: form.customerEmail,
      customerAddress: form.customerAddress,
      qty,
      totalAmount,
      paymentMethod: form.paymentMethod,
      createdBy: form.createdBy,
      merchantName: merchant?.businessName,
    }
    try {
      const res = await fetch('/api/order-processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Order created — outbound record spawned automatically')
        setOpen(false)
        setForm({
          merchantId: '', productId: '', customerName: '', customerContact: '',
          customerEmail: '', customerAddress: '', qty: '1', paymentMethod: 'Cash', createdBy: 'admin',
        })
        fetchData()
      } else {
        toast.error('Failed to create order')
      }
    } catch {
      toast.error('Failed to create order')
    }
  }

  const handlePrintInvoice = (order: Order) => {
    toast.info(`Printing invoice for ${order.orderNumber}...`)
  }

  const handleDownloadInvoice = (order: Order) => {
    toast.info(`Downloading invoice for ${order.orderNumber}...`)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await fetch(`/api/order-processing?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Order deleted')
      setDeleteOpen(false)
      setDeletingId(null)
      setViewOpen(false)
      fetchData()
    } catch {
      toast.error('Failed to delete order')
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      merchantId: '', productId: '', customerName: '', customerContact: '',
      customerEmail: '', customerAddress: '', qty: '1', paymentMethod: 'Cash', createdBy: 'admin',
    })
    setOpen(true)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'new_order': return 'bg-blue-100 text-blue-700 border-0'
      case 'processing': return 'bg-yellow-100 text-yellow-700 border-0'
      case 'shipped': return 'bg-purple-100 text-purple-700 border-0'
      case 'delivered': return 'bg-green-100 text-green-700 border-0'
      case 'returned': return 'bg-red-100 text-red-700 border-0'
      default: return 'bg-gray-100 text-gray-700 border-0'
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Order Processing"
        description="New orders enter here. Each order spawns an outbound record automatically (forward-moving flow)."
        icon={ShoppingCart}
        stats={stats}
        actionLabel="New Order"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by order number, customer, or tracking..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {data.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <ShoppingCart size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No orders yet</p>
          <p className="text-sm text-gray-400 mt-1">Create the first order — an outbound record will be spawned automatically</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Order #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Tracking <InfoTip term="trackingNumber" size={11} /></th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Total</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Payment</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o, i) => (
                  <motion.tr
                    key={o.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setViewing(o); setViewOpen(true) }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-gray-900">{o.orderNumber}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{o.orderId}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(o.orderDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{o.customerName}</p>
                      <p className="text-xs text-gray-400">{o.customerId}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.trackingNumber || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(o.totalAmount)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{o.paymentMethod}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-[10px] ${statusColor(o.status)}`}>{o.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePrintInvoice(o)} title="Print invoice">
                          <Printer size={14} className="text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadInvoice(o)} title="Download invoice">
                          <Download size={14} className="text-gray-600" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailSlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="New Order"
        subtitle="An outbound record + stock decrement will happen automatically"
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create Order</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Merchant</Label>
            <select
              value={form.merchantId}
              onChange={e => setForm({ ...form, merchantId: e.target.value, productId: '' })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select merchant...</option>
              {merchants.map(m => (
                <option key={m.merchantId} value={m.merchantId}>{m.businessName}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Product</Label>
            <select
              value={form.productId}
              onChange={e => setForm({ ...form, productId: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              disabled={!form.merchantId}
            >
              <option value="">Select product...</option>
              {filteredProducts.map(p => (
                <option key={p.productId} value={p.productId}>{p.productLabel} — {formatCurrency(p.unitSellingPrice)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Customer Name <span className="text-red-400">*</span></Label>
              <Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Contact <span className="text-red-400">*</span></Label>
              <Input value={form.customerContact} onChange={e => setForm({ ...form, customerContact: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Email</Label>
              <Input value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Address</Label>
              <Input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Qty</Label>
              <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Payment Method</Label>
              <select
                value={form.paymentMethod}
                onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="Cash">Cash (COD)</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800">
            <InfoTip term="runsheets" size={12} className="mr-1" />
            Order # will be auto-generated as DS-XXX. Tracking number uses prefix based on merchant delivery type (SD / DS / CN). The outbound record will be created automatically.
          </div>
        </div>
      </DetailSlideOver>

      <DetailSlideOver
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={viewing ? `Order ${viewing.orderNumber}` : ''}
        subtitle={viewing ? `${viewing.customerName} · ${formatCurrency(viewing.totalAmount)}` : ''}
        width="md"
        footer={
          <div className="flex gap-3 ml-auto">
            {viewing && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"
                  onClick={() => { setDeletingId(viewing.id); setDeleteOpen(true) }}
                >
                  <Trash2 size={14} className="mr-2" /> Delete
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => handlePrintInvoice(viewing)}>
                  <Printer size={14} className="mr-2" /> Print
                </Button>
                <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={() => handleDownloadInvoice(viewing)}>
                  <Download size={14} className="mr-2" /> Download Invoice
                </Button>
              </>
            )}
          </div>
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-400/30">
              <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold mb-1">Order Total</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(viewing.totalAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">{viewing.paymentMethod}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Order ID</p>
                <p className="font-mono text-gray-700">{viewing.orderId}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Order Date</p>
                <p className="text-gray-700">{new Date(viewing.orderDate).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Customer ID</p>
                <p className="font-mono text-gray-700">{viewing.customerId}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Tracking</p>
                <p className="font-mono text-gray-700">{viewing.trackingNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Status</p>
                <Badge className={`text-[10px] ${statusColor(viewing.status)}`}>{viewing.status.replace('_', ' ')}</Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Invoice</p>
                <p className="text-gray-700">{viewing.invoiceGenerated ? `Generated ${viewing.invoiceNumber || ''}` : 'Not generated'}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Customer Info</p>
              <p className="text-sm text-gray-700">{viewing.customerInfo}</p>
            </div>
          </div>
        )}
      </DetailSlideOver>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>This will delete the order. The linked outbound record will remain (delete it separately if needed).</AlertDialogDescription>
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
