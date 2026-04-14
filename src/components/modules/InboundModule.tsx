'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Package, ArrowDownRight, Inbox, BarChart3, Truck, AlertTriangle, MapPin, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface Merchant { id: string; merchantId: string; businessName: string }
interface Product { id: string; productId: string; productLabel: string; brand: string | null; variant: string | null; merchantId: string; currentStock: number; unit: string; unitCost: number }

interface InboundRecord {
  id: string
  inboundId: string
  vendorId: string | null
  merchantId: string
  merchantName: string
  productName: string
  productId: string
  brand: string | null
  variant: string | null
  qtyIn: number
  unitPrice: number | null
  inboundValue: number | null
  expiryDate: string | null
  receivedBy: string
  storedBy: string | null
  storageLocation: string | null
  status: string
  userComment: string | null
  createdAt: string
}

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5']
const PALLETS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']

export default function InboundModule() {
  const [data, setData] = useState<InboundRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<InboundRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [form, setForm] = useState({
    merchantId: '', merchantName: '', vendorId: '', productId: '', productName: '',
    brand: '', variant: '', qtyIn: '', unitPrice: '', expiryDate: '',
    receivedBy: '', storedBy: '', storageLocation: '', userComment: '',
  })

  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const fetchData = () => {
    fetch(`/api/inbound?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/inbound?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({
      ...form, merchantId, merchantName: m?.businessName || '',
      productId: '', productName: '', brand: '', variant: '',
    })
    fetch(`/api/products?search=${merchantId}`).then(r => r.json()).then((d: Product[]) => setProducts(d))
  }

  const handleProductSelect = (productId: string) => {
    const p = products.find(p => p.productId === productId)
    setForm({
      ...form, productId,
      productName: p?.productLabel || '',
      brand: p?.brand || '',
      variant: p?.variant || '',
      unitPrice: p?.unitCost ? String(p.unitCost) : form.unitPrice,
    })
  }

  const handleSubmit = async () => {
    if (!form.merchantId || !form.productId || !form.qtyIn || !form.receivedBy) {
      toast.error('Please fill all required fields')
      return
    }
    const qtyIn = parseInt(form.qtyIn)
    const unitPrice = form.unitPrice ? parseFloat(form.unitPrice) : null
    const inboundValue = unitPrice ? qtyIn * unitPrice : null

    // Build full product name: Brand + Name + Variant
    const fullName = [form.brand, form.productName, form.variant].filter(Boolean).join(' ')

    const payload = {
      ...form, qtyIn, unitPrice, inboundValue,
      productName: fullName,
      status: 'received',
    }
    await fetch('/api/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    toast.success(`Inventory received successfully — ${qtyIn} units (IN record created)`)
    setOpen(false)
    resetForm()
    fetchData()
  }

  const resetForm = () => {
    setForm({
      merchantId: '', merchantName: '', vendorId: '', productId: '', productName: '',
      brand: '', variant: '', qtyIn: '', unitPrice: '', expiryDate: '',
      receivedBy: '', storedBy: '', storageLocation: '', userComment: '',
    })
  }

  const totalQty = data.reduce((s, r) => s + r.qtyIn, 0)
  const totalValue = data.reduce((s, r) => s + (r.inboundValue || 0), 0)

  // Expiry helpers
  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null
    const now = new Date()
    const expiry = new Date(expiryDate)
    const diffMs = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-600 bg-red-50', days: diffDays }
    if (diffDays <= 30) return { label: `${diffDays}d left`, color: 'text-amber-600 bg-amber-50', days: diffDays }
    if (diffDays <= 90) return { label: `${diffDays}d left`, color: 'text-yellow-600 bg-yellow-50', days: diffDays }
    return { label: `${diffDays}d left`, color: 'text-green-600 bg-green-50', days: diffDays }
  }

  const statCards = [
    { label: 'Total Receipts', value: data.length, icon: Inbox, gradientFrom: 'from-green-500/10', gradientTo: 'to-green-50', borderColor: 'border-green-200/60', iconBg: 'bg-green-500/10', iconColor: 'text-green-500' },
    { label: 'Total Qty Received', value: totalQty.toLocaleString(), icon: BarChart3, gradientFrom: 'from-blue-500/10', gradientTo: 'to-blue-50', borderColor: 'border-blue-200/60', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600' },
    { label: 'Total Inbound Value', value: totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), icon: DollarSign, gradientFrom: 'from-purple-500/10', gradientTo: 'to-purple-50', borderColor: 'border-purple-200/60', iconBg: 'bg-purple-500/10', iconColor: 'text-purple-500' },
    { label: 'Vendors Served', value: new Set(data.map(r => r.merchantId)).size, icon: Truck, gradientFrom: 'from-orange-500/10', gradientTo: 'to-orange-50', borderColor: 'border-orange-200/60', iconBg: 'bg-orange-500/10', iconColor: 'text-orange-500' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inbound Stock Register</h1>
          <p className="text-sm text-gray-400">Receive inventory from vendors and merchants</p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Receive Inventory
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className={`bg-gradient-to-br ${card.gradientFrom} ${card.gradientTo} border ${card.borderColor} rounded-2xl p-5`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`${card.iconBg} rounded-xl p-3`}>
                <card.icon size={22} className={card.iconColor} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="p-5">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search by inbound ID, vendor, product, brand, comment..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                  <TableHead className="text-white font-semibold text-xs">Inbound ID</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Vendor</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Product ID</TableHead>
                  <TableHead className="text-white font-semibold text-xs min-w-[200px]">Product Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Qty</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Unit Price</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Inbound Value</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Expiry</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Location</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Received By</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Comment</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, i) => {
                  const expiry = getExpiryStatus(item.expiryDate)
                  return (
                    <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 cursor-pointer transition-colors`} onClick={() => { setSelectedRecord(item); setDetailOpen(true) }}>
                      <TableCell className="font-mono text-xs font-semibold">{item.inboundId}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{item.merchantName}</p>
                          {item.vendorId && <p className="text-[10px] text-gray-400 font-mono">{item.vendorId}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{item.productId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package size={12} className="text-[#FF6B35] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate max-w-[200px]">{item.productName}</p>
                            {item.variant && <p className="text-[10px] text-gray-400">{item.variant}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600 text-sm">+{item.qtyIn}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{item.unitPrice ? item.unitPrice.toLocaleString() : '-'}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold">{item.inboundValue ? item.inboundValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}</TableCell>
                      <TableCell>
                        {item.expiryDate ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] text-gray-500">{new Date(item.expiryDate).toLocaleDateString()}</span>
                            {expiry && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block w-fit ${expiry.color}`}>
                                {expiry.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.storageLocation ? (
                          <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.storageLocation}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs">{item.receivedBy}</TableCell>
                      <TableCell className="max-w-[150px]">
                        {item.userComment ? (
                          <p className="text-[10px] text-gray-500 truncate max-w-[150px]" title={item.userComment}>{item.userComment}</p>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-[10px] text-gray-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12}>
                      <div className="flex flex-col items-center py-12">
                        <Inbox size={40} className="text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400 text-center">No inbound records found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Receive Inventory Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-lg font-bold">Receive Inventory</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Merchant & Vendor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Vendor / Merchant *</Label>
                <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName} ({m.merchantId})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Vendor ID</Label>
                <Input value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })} placeholder="e.g., V001" />
              </div>
            </div>

            {/* Product Selection */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Product *</Label>
              <Select value={form.productId} onValueChange={handleProductSelect} disabled={!form.merchantId}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => (
                  <SelectItem key={p.productId} value={p.productId}>
                    {p.brand ? `${p.brand} ` : ''}{p.productLabel}{p.variant ? ` - ${p.variant}` : ''} ({p.productId}) Stock: {p.currentStock}
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>

            {/* Brand & Variant (auto-filled, editable) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Brand</Label>
                <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g., Supreme, Dettol" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Variant (Color / Size / Weight)</Label>
                <Input value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })} placeholder="e.g., BLUE-50PCs, 500ml" />
              </div>
            </div>

            {/* Qty, Unit Price, Expiry */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Quantity *</Label>
                <Input type="number" value={form.qtyIn} onChange={e => setForm({ ...form, qtyIn: e.target.value })} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Unit Price</Label>
                <Input type="number" step="0.01" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Expiry Date</Label>
                <Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>

            {/* Inbound Value Preview */}
            {(form.qtyIn && form.unitPrice) && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                <DollarSign size={16} className="text-blue-500" />
                <span className="text-sm text-blue-700 font-medium">
                  Inbound Value: {(parseInt(form.qtyIn) * parseFloat(form.unitPrice || '0')).toLocaleString()}
                </span>
              </div>
            )}

            {/* Received By & Stored By */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-gray-600">Received By *</Label>
                <Input value={form.receivedBy} onChange={e => setForm({ ...form, receivedBy: e.target.value })} placeholder="Name of receiver" />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Stored By</Label>
                <Input value={form.storedBy} onChange={e => setForm({ ...form, storedBy: e.target.value })} placeholder="Who placed items in storage" />
              </div>
            </div>

            {/* Storage Location — Zone-Level-Pallet format */}
            <div>
              <Label className="text-xs font-medium text-gray-600">
                Storage Location <span className="text-gray-400 font-normal">(Zone-Level-Pallet, e.g., B-L3-P3)</span>
              </Label>
              <div className="flex gap-2 items-center mt-1">
                <Select value={form.storageLocation?.split('-')[0] || ''} onValueChange={zone => {
                  const parts = form.storageLocation?.split('-') || ['', '', '']
                  setForm({ ...form, storageLocation: `${zone}-${parts[1] || 'L1'}-${parts[2] || 'P1'}` })
                }}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Zone" /></SelectTrigger>
                  <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.storageLocation?.split('-')[1] || ''} onValueChange={level => {
                  const parts = form.storageLocation?.split('-') || ['A', '', '']
                  setForm({ ...form, storageLocation: `${parts[0] || 'A'}-${level}-${parts[2] || 'P1'}` })
                }}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Level" /></SelectTrigger>
                  <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.storageLocation?.split('-')[2] || ''} onValueChange={pallet => {
                  const parts = form.storageLocation?.split('-') || ['A', 'L1', '']
                  setForm({ ...form, storageLocation: `${parts[0] || 'A'}-${parts[1] || 'L1'}-${pallet}` })
                }}>
                  <SelectTrigger className="w-24"><SelectValue placeholder="Pallet" /></SelectTrigger>
                  <SelectContent>{PALLETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  value={form.storageLocation || ''}
                  onChange={e => setForm({ ...form, storageLocation: e.target.value })}
                  placeholder="or type directly: B-L3-P3"
                  className="flex-1"
                />
              </div>
            </div>

            {/* Comment */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Comment</Label>
              <Textarea value={form.userComment} onChange={e => setForm({ ...form, userComment: e.target.value })} placeholder="Optional notes, e.g., 'Plus 13 pouches open'" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              <ArrowDownRight size={16} className="mr-1" /> Receive Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          {selectedRecord && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-lg">{selectedRecord.inboundId}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Vendor</p>
                    <p className="text-sm font-semibold">{selectedRecord.merchantName}</p>
                    {selectedRecord.vendorId && <p className="text-xs text-gray-400 font-mono">{selectedRecord.vendorId}</p>}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Product</p>
                    <p className="text-sm font-semibold">{selectedRecord.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{selectedRecord.productId}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Quantity</p>
                    <p className="text-lg font-bold text-green-600">+{selectedRecord.qtyIn}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Unit Price</p>
                    <p className="text-sm font-bold text-blue-600">{selectedRecord.unitPrice?.toLocaleString() || '-'}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Inbound Value</p>
                    <p className="text-sm font-bold text-purple-600">{selectedRecord.inboundValue?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Storage Location</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin size={12} className="text-[#FF6B35]" />
                      <p className="text-sm font-mono">{selectedRecord.storageLocation || 'Not assigned'}</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Expiry Date</p>
                    {selectedRecord.expiryDate ? (
                      <div>
                        <p className="text-sm">{new Date(selectedRecord.expiryDate).toLocaleDateString()}</p>
                        {(() => {
                          const exp = getExpiryStatus(selectedRecord.expiryDate)
                          if (exp) {
                            const isOverdue = (exp.days || 0) < 0
                            return (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-1 ${exp.color}`}>
                                {isOverdue && <AlertTriangle size={10} />}
                                {exp.label}
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No expiry date</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Received By</p>
                    <p className="text-sm">{selectedRecord.receivedBy}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Stored By</p>
                    <p className="text-sm">{selectedRecord.storedBy || '-'}</p>
                  </div>
                </div>
                {selectedRecord.userComment && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-[10px] text-amber-600 uppercase tracking-wider font-medium">Comment</p>
                    <p className="text-sm text-amber-800">{selectedRecord.userComment}</p>
                  </div>
                )}
                <div className="text-[10px] text-gray-400 text-right">
                  Recorded: {new Date(selectedRecord.createdAt).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
