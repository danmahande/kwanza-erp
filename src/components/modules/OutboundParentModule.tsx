'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, RefreshCw, Package, Boxes, Truck, CheckCircle2,
  AlertTriangle, ChevronRight, Printer, Download, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ── Types ──
interface OutboundRecord {
  id: string
  outboundId: string
  orderNumber: string | null
  trackingNumber: string | null
  customerName: string
  customerContact: string
  customerAddress: string | null
  productName: string
  productId: string
  brand: string | null
  variant: string | null
  qty: number
  saleAmount: number | null
  codCollected: number | null
  status: string
  assignedDriver: string | null
  runsheetId: string | null
  deliveryNotes: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

interface Merchant {
  id: string; merchantId: string; businessName: string; deliveryType: string | null
}

interface Product {
  id: string; productId: string; productLabel: string; unitSellingPrice: number; merchantId: string; merchantName: string
}

// ── Lane config ──
const LANES = [
  {
    key: 'pick',
    title: 'TO PICK',
    icon: Package,
    color: 'text-orange-600',
    border: 'border-orange-200',
    statuses: ['pending', 'picking'] as string[],
    actions: [
      { status: 'pending', label: 'Start Picking', toStatus: 'picking', color: 'bg-orange-500 hover:bg-orange-600' },
      { status: 'picking', label: 'Mark Picked', toStatus: 'picked', color: 'bg-blue-500 hover:bg-blue-600' },
    ],
  },
  {
    key: 'pack',
    title: 'TO PACK',
    icon: Boxes,
    color: 'text-purple-600',
    border: 'border-purple-200',
    statuses: ['picked', 'packing'] as string[],
    actions: [
      { status: 'picked', label: 'Start Packing', toStatus: 'packing', color: 'bg-purple-500 hover:bg-purple-600' },
      { status: 'packing', label: 'Mark Packed', toStatus: 'packed', color: 'bg-indigo-500 hover:bg-indigo-600' },
    ],
  },
  {
    key: 'dispatch',
    title: 'TO DISPATCH',
    icon: Truck,
    color: 'text-yellow-700',
    border: 'border-yellow-200',
    statuses: ['packed'] as string[],
    actions: [
      { status: 'packed', label: 'Assign Rider', toStatus: null as string | null, color: 'bg-yellow-600 hover:bg-yellow-700' },
    ],
  },
] as const

export default function OutboundParentModule() {
  const [data, setData] = useState<OutboundRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<OutboundRecord | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [form, setForm] = useState({
    merchantId: '', productId: '', customerName: '', customerContact: '',
    customerEmail: '', customerAddress: '', qty: '1', paymentMethod: 'Cash', createdBy: 'admin',
  })

  // ── Fetch ──
  const fetchData = useCallback(() => {
    fetch('/api/outbound')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load orders') })
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/merchants').then(r => r.json()).then(d => setMerchants(Array.isArray(d) ? d : []))
    fetch('/api/products').then(r => r.json()).then((d: Product[] | { products?: Product[] }) => setProducts(Array.isArray(d) ? d : (d?.products ?? [])))
  }, [fetchData])

  // ── Filter by search ──
  const filteredData = search
    ? data.filter(r =>
        String(r.orderNumber || r.outboundId).toLowerCase().includes(search.toLowerCase()) ||
        r.customerName.toLowerCase().includes(search.toLowerCase()) ||
        r.productName.toLowerCase().includes(search.toLowerCase())
      )
    : data

  // ── Lane data ──
  const laneData = LANES.map(lane => ({
    ...lane,
    items: filteredData.filter(r => lane.statuses.includes(r.status)),
  }))

  const completedItems = filteredData.filter(r =>
    ['dispatched', 'delivered', 'failed', 'returned', 'cancelled'].includes(r.status)
  )

  // ── Workflow transition ──
  const handleTransition = async (record: OutboundRecord, toStatus: string) => {
    try {
      const res = await fetch('/api/workflow-transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'outbound', id: record.id, toStatus, performedBy: 'admin' }),
      })
      if (res.ok) {
        toast.success(`${record.orderNumber || record.outboundId}: moved to next stage`)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  // ── Create order ──
  const handleSubmit = async () => {
    if (!form.customerName || !form.customerContact) {
      toast.error('Customer name and contact are required')
      return
    }
    const selectedProduct = products.find(p => p.productId === form.productId)
    const qty = parseInt(form.qty) || 1
    const totalAmount = (selectedProduct?.unitSellingPrice || 0) * qty
    const merchant = merchants.find(m => m.merchantId === form.merchantId)
    try {
      const res = await fetch('/api/order-processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: form.merchantId,
          productId: form.productId,
          productName: selectedProduct?.productLabel || '',
          customerName: form.customerName,
          customerContact: form.customerContact,
          customerEmail: form.customerEmail,
          customerAddress: form.customerAddress,
          qty, totalAmount,
          paymentMethod: form.paymentMethod,
          createdBy: form.createdBy,
          merchantName: merchant?.businessName,
        }),
      })
      if (res.ok) {
        toast.success('Order created. It appears in the Pick lane.')
        setCreateOpen(false)
        setForm({ merchantId: '', productId: '', customerName: '', customerContact: '', customerEmail: '', customerAddress: '', qty: '1', paymentMethod: 'Cash', createdBy: 'admin' })
        fetchData()
      } else {
        toast.error('Failed to create order')
      }
    } catch {
      toast.error('Failed to create order')
    }
  }

  const openDetail = (record: OutboundRecord) => {
    setSelectedRecord(record)
    setDetailOpen(true)
  }

  const filteredProducts = form.merchantId
    ? products.filter(p => p.merchantId === form.merchantId)
    : products

  return (
    <div className="space-y-3">
      {/* Header */}
      <OpsHeader
        title="Outbound"
        description="Create orders, pick, pack, and dispatch to riders"
        kpiCells={[
          { label: 'TO PICK', value: laneData[0].items.length, highlight: laneData[0].items.length > 0, highlightColor: 'orange' as const },
          { label: 'TO PACK', value: laneData[1].items.length, highlight: laneData[1].items.length > 0, highlightColor: 'orange' as const },
          { label: 'TO DISPATCH', value: laneData[2].items.length, highlight: laneData[2].items.length > 0, highlightColor: 'orange' as const },
          { label: 'COMPLETED', value: completedItems.filter(r => r.status === 'delivered').length },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by order, customer, or product..."
        actionLabel="New Order"
        onAction={() => setCreateOpen(true)}
      />

      {/* Three lanes */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {laneData.map(lane => {
            const Icon = lane.icon
            return (
              <div key={lane.key} className={`rounded-lg border ${lane.border} overflow-hidden`}>
                {/* Lane header */}
                <div className={`px-3 py-2 border-b ${lane.border} bg-gray-50 flex items-center gap-2`}>
                  <Icon size={12} className={lane.color} />
                  <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{lane.title}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${lane.color} bg-white border ${lane.border}`}>
                    {lane.items.length}
                  </span>
                </div>
                {/* Lane items as dense rows */}
                {lane.items.length === 0 ? (
                  <div className="py-10 text-center">
                    <Icon size={20} className="mx-auto mb-1 opacity-20" />
                    <p className="text-[11px] text-gray-400">Nothing to {lane.key}</p>
                  </div>
                ) : (
                  <div className="bg-white max-h-[55vh] overflow-y-auto">
                    {lane.items.map((item, idx) => {
                      const action = lane.actions.find(a => a.status === item.status)
                      return (
                        <div
                          key={item.id}
                          onClick={() => openDetail(item)}
                          className={`px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 ${idx === lane.items.length - 1 ? 'border-b-0' : ''}`}
                          style={{ minHeight: '44px' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-gray-900 shrink-0">
                              {item.orderNumber || item.outboundId}
                            </span>
                            <span className="text-[9px] text-gray-400 shrink-0">
                              {new Date(item.createdAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-gray-700 font-medium truncate">{item.customerName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{item.productName} ×{item.qty}</p>
                            </div>
                            {item.saleAmount != null && item.saleAmount > 0 && (
                              <span className="text-[10px] text-gray-600 font-mono font-semibold shrink-0">{formatCurrencyCompact(item.saleAmount)}</span>
                            )}
                          </div>
                          {action && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (action.toStatus === null) {
                                  toast.info('Use the Runsheets module to assign a rider.')
                                } else {
                                  handleTransition(item, action.toStatus)
                                }
                              }}
                              className={`mt-1.5 w-full text-white text-[10px] font-semibold py-1 rounded-md transition-colors ${action.color}`}
                            >
                              {action.label}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Completed section */}
      {completedItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            <ChevronRight size={12} className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
            Completed & Exceptions ({completedItems.length})
          </button>
          {showCompleted && (
            <div className="mt-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-3 py-2 font-semibold">Order</th>
                      <th className="text-left px-3 py-2 font-semibold">Customer</th>
                      <th className="text-left px-3 py-2 font-semibold">Product</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-center px-3 py-2 font-semibold">Status</th>
                      <th className="text-right px-3 py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedItems.map(item => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => openDetail(item)}
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-gray-900">{item.orderNumber || item.outboundId}</td>
                        <td className="px-3 py-2 text-gray-700">{item.customerName}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[150px]">{item.productName}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{item.qty}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            item.status === 'delivered' ? 'bg-green-100 text-green-700' :
                            item.status === 'dispatched' ? 'bg-cyan-100 text-cyan-700' :
                            item.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {item.status === 'delivered' ? 'DELIVERED' :
                             item.status === 'dispatched' ? 'IN TRANSIT' :
                             item.status === 'failed' ? 'FAILED' :
                             item.status === 'returned' ? 'RETURNED' :
                             item.status.toUpperCase()}
                          </span>
                          {item.status === 'dispatched' && (
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTransition(item, 'delivered') }}
                                className="text-[9px] text-green-600 hover:text-green-700 font-semibold"
                              >Delivered</button>
                              <span className="text-gray-300">·</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); openDetail(item) }}
                                className="text-[9px] text-red-600 hover:text-red-700 font-semibold"
                              >Failed</button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.status === 'dispatched' && (
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleTransition(item, 'delivered')} className="text-[10px] text-green-600 hover:text-green-700 font-semibold">Mark Delivered</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Create order slide-over */}
      <DetailSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Order"
        subtitle="Creates an order and outbound record automatically"
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Create Order</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Merchant <span className="text-red-400">*</span></Label>
            <select
              value={form.merchantId}
              onChange={e => setForm({ ...form, merchantId: e.target.value, productId: '' })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select merchant...</option>
              {merchants.map(m => <option key={m.merchantId} value={m.merchantId}>{m.businessName}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Product <span className="text-red-400">*</span></Label>
            <select
              value={form.productId}
              onChange={e => setForm({ ...form, productId: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              disabled={!form.merchantId}
            >
              <option value="">{form.merchantId ? 'Select product...' : 'Select merchant first'}</option>
              {filteredProducts.map(p => <option key={p.productId} value={p.productId}>{p.productLabel} ({formatCurrency(p.unitSellingPrice)})</option>)}
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
              </select>
            </div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Order detail slide-over */}
      <DetailSlideOver
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedRecord(null) }}
        title={selectedRecord?.orderNumber || selectedRecord?.outboundId || 'Order'}
        subtitle={selectedRecord ? selectedRecord.customerName : ''}
        width="lg"
        footer={
          selectedRecord ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-2">
                {selectedRecord.status === 'pending' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'picked'); setDetailOpen(false) }}>
                    Mark Picked
                  </Button>
                )}
                {selectedRecord.status === 'picked' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'packed'); setDetailOpen(false) }}>
                    Mark Packed
                  </Button>
                )}
                {selectedRecord.status === 'packed' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { toast.info('Use the Runsheets module to assign a rider'); setDetailOpen(false) }}>
                    Assign Rider
                  </Button>
                )}
                {selectedRecord.status === 'dispatched' && (
                  <>
                    <Button variant="outline" size="sm" className="rounded-xl text-green-700 border-green-200 hover:bg-green-50" onClick={() => { handleTransition(selectedRecord, 'delivered'); setDetailOpen(false) }}>
                      Delivered
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => { handleTransition(selectedRecord, 'failed'); setDetailOpen(false) }}>
                      Failed
                    </Button>
                  </>
                )}
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDetailOpen(false)}>Close</Button>
            </div>
          ) : undefined
        }
      >
        {selectedRecord && (
          <div className="space-y-3">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-1 rounded text-[10px] font-semibold ${
                selectedRecord.status === 'delivered' ? 'bg-green-100 text-green-700' :
                selectedRecord.status === 'dispatched' ? 'bg-cyan-100 text-cyan-700' :
                selectedRecord.status === 'failed' ? 'bg-red-100 text-red-700' :
                selectedRecord.status === 'packed' ? 'bg-purple-100 text-purple-700' :
                selectedRecord.status === 'picked' ? 'bg-blue-100 text-blue-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {selectedRecord.status.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-400 ml-auto">
                {new Date(selectedRecord.createdAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {/* Customer */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Customer</p>
              <p className="text-sm font-medium text-gray-900">{selectedRecord.customerName}</p>
              <p className="text-xs text-gray-500">{selectedRecord.customerContact}</p>
              {selectedRecord.customerAddress && <p className="text-xs text-gray-500">{selectedRecord.customerAddress}</p>}
            </div>

            {/* Product */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Product</p>
              <p className="text-sm font-medium text-gray-900">{selectedRecord.productName}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><span className="text-gray-400">Qty:</span> <span className="font-mono font-bold text-gray-900">{selectedRecord.qty}</span></div>
                {selectedRecord.saleAmount != null && (
                  <div><span className="text-gray-400">Total:</span> <span className="font-mono font-bold text-gray-900">{formatCurrency(selectedRecord.saleAmount)}</span></div>
                )}
                {selectedRecord.codCollected != null && (
                  <div><span className="text-gray-400">COD:</span> <span className="font-mono text-green-700">{formatCurrency(selectedRecord.codCollected)}</span></div>
                )}
                {selectedRecord.trackingNumber && (
                  <div><span className="text-gray-400">Tracking:</span> <span className="font-mono text-gray-600">{selectedRecord.trackingNumber}</span></div>
                )}
              </div>
            </div>

            {/* Delivery info */}
            {(selectedRecord.assignedDriver || selectedRecord.runsheetId || selectedRecord.dispatchedAt || selectedRecord.deliveredAt) && (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Delivery</p>
                <div className="space-y-1 text-xs">
                  {selectedRecord.assignedDriver && <p className="text-gray-700">Driver: <span className="font-medium">{selectedRecord.assignedDriver}</span></p>}
                  {selectedRecord.runsheetId && <p className="text-gray-500">Runsheet: <span className="font-mono">{selectedRecord.runsheetId}</span></p>}
                  {selectedRecord.dispatchedAt && <p className="text-gray-500">Dispatched: {new Date(selectedRecord.dispatchedAt).toLocaleString('en-UG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</p>}
                  {selectedRecord.deliveredAt && <p className="text-green-700 font-medium">Delivered: {new Date(selectedRecord.deliveredAt).toLocaleString('en-UG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</p>}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedRecord.deliveryNotes && (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Notes</p>
                <p className="text-xs text-gray-700">{selectedRecord.deliveryNotes}</p>
              </div>
            )}
          </div>
        )}
      </DetailSlideOver>
    </div>
  )
}
