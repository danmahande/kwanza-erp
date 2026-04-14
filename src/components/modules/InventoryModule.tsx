'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoreHorizontal, Plus, Search, Pencil, Trash2, Package, AlertTriangle, DollarSign, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'

interface Merchant { id: string; merchantId: string; businessName: string }

interface Product {
  id: string
  productId: string
  productLabel: string
  category: string
  merchantId: string
  merchantName: string
  unit: string
  minStock: number
  unitCost: number
  unitSellingPrice: number
  commissionPercent: number
  currentStock: number
  isActive: boolean
}

export default function InventoryModule() {
  const [data, setData] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    productLabel: '', category: '', merchantId: '', merchantName: '', unit: '',
    minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '10', currentStock: '0',
  })

  useEffect(() => { fetch('/api/merchants').then(r => r.json()).then(setMerchants) }, [])

  const fetchData = () => {
    fetch(`/api/products?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/products?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const handleMerchantSelect = (merchantId: string) => {
    const m = merchants.find(m => m.merchantId === merchantId)
    setForm({ ...form, merchantId, merchantName: m?.businessName || '' })
  }

  const handleSubmit = async () => {
    if (!form.productLabel || !form.category || !form.merchantId || !form.unitCost || !form.unitSellingPrice) {
      toast.error('Please fill all required fields')
      return
    }
    const payload = { ...form, unitCost: parseFloat(form.unitCost), unitSellingPrice: parseFloat(form.unitSellingPrice), commissionPercent: parseFloat(form.commissionPercent), minStock: parseInt(form.minStock), currentStock: parseInt(form.currentStock), isActive: true }
    if (editing) {
      await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('Product updated')
    } else {
      await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('Product created')
    }
    setOpen(false); setEditing(null)
    setForm({ productLabel: '', category: '', merchantId: '', merchantName: '', unit: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '10', currentStock: '0' })
    fetchData()
  }

  const handleEdit = (item: Product) => {
    setEditing(item)
    setForm({
      productLabel: item.productLabel, category: item.category, merchantId: item.merchantId,
      merchantName: item.merchantName, unit: item.unit, minStock: String(item.minStock),
      unitCost: String(item.unitCost), unitSellingPrice: String(item.unitSellingPrice),
      commissionPercent: String(item.commissionPercent), currentStock: String(item.currentStock),
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/products?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Product deleted')
      setDeleteOpen(false); setDeletingId(null); fetchData()
    }
  }

  const lowStockCount = data.filter(p => p.currentStock <= p.minStock).length
  const totalValue = data.reduce((s, p) => s + p.currentStock * p.unitCost, 0)

  const statCards = [
    { label: 'Total Products', value: data.length, icon: Package, gradientFrom: 'from-orange-500/10', gradientTo: 'to-orange-50', borderColor: 'border-orange-200/60', iconBg: 'bg-orange-500/10', iconColor: 'text-orange-500' },
    { label: 'Low Stock', value: lowStockCount, icon: AlertTriangle, gradientFrom: 'from-red-500/10', gradientTo: 'to-red-50', borderColor: 'border-red-200/60', iconBg: 'bg-red-500/10', iconColor: 'text-red-500' },
    { label: 'Stock Value', value: `KES ${totalValue.toLocaleString()}`, icon: DollarSign, gradientFrom: 'from-green-500/10', gradientTo: 'to-green-50', borderColor: 'border-green-200/60', iconBg: 'bg-green-500/10', iconColor: 'text-green-500' },
    { label: 'Categories', value: new Set(data.map(p => p.category)).size, icon: LayoutGrid, gradientFrom: 'from-blue-500/10', gradientTo: 'to-blue-50', borderColor: 'border-blue-200/60', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-400">Manage your product catalog and stock levels</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ productLabel: '', category: '', merchantId: '', merchantName: '', unit: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '10', currentStock: '0' }); setOpen(true) }} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
          <Plus size={18} className="mr-2" /> Add Product
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
              <motion.div
                whileHover={{ scale: 1.1 }}
                className={`${card.iconBg} rounded-xl p-3`}
              >
                <card.icon size={22} className={card.iconColor} />
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="p-5">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1B2A4A] hover:bg-[#1B2A4A]">
                  <TableHead className="text-white font-semibold">ID</TableHead>
                  <TableHead className="text-white font-semibold">Product</TableHead>
                  <TableHead className="text-white font-semibold">Category</TableHead>
                  <TableHead className="text-white font-semibold">Merchant</TableHead>
                  <TableHead className="text-white font-semibold">Cost</TableHead>
                  <TableHead className="text-white font-semibold">Price</TableHead>
                  <TableHead className="text-white font-semibold">Stock</TableHead>
                  <TableHead className="text-white font-semibold">Status</TableHead>
                  <TableHead className="text-white font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, i) => (
                  <TableRow key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${item.currentStock <= item.minStock ? '!bg-red-50/50' : ''}`}>
                    <TableCell className="font-mono text-sm">{item.productId}</TableCell>
                    <TableCell className="font-medium flex items-center gap-2"><Package size={14} className="text-[#FF6B35]" />{item.productLabel}</TableCell>
                    <TableCell><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{item.category}</span></TableCell>
                    <TableCell className="text-sm text-gray-400">{item.merchantName}</TableCell>
                    <TableCell>KES {item.unitCost}</TableCell>
                    <TableCell className="font-semibold">KES {item.unitSellingPrice}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-green-600'}`}>
                        {item.currentStock} {item.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.currentStock <= item.minStock ? (
                        <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">Low Stock</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">In Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(item)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setDeletingId(item.id); setDeleteOpen(true) }} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="flex flex-col items-center py-12">
                        <Package size={40} className="text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400 text-center">No products found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Product' : 'Add New Product'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Product Label *</Label><Input value={form.productLabel} onChange={e => setForm({ ...form, productLabel: e.target.value })} placeholder="e.g., Fresh Avocados" /></div>
            <div><Label>Category *</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produce">Produce</SelectItem><SelectItem value="Dairy">Dairy</SelectItem>
                  <SelectItem value="Bakery">Bakery</SelectItem><SelectItem value="Beverages">Beverages</SelectItem>
                  <SelectItem value="Household">Household</SelectItem><SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Merchant *</Label>
              <Select value={form.merchantId} onValueChange={handleMerchantSelect}>
                <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                <SelectContent>{merchants.map(m => <SelectItem key={m.merchantId} value={m.merchantId}>{m.businessName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Unit *</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="e.g., kg, unit" /></div>
              <div><Label>Min Stock</Label><Input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Unit Cost (KES) *</Label><Input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} /></div>
              <div><Label>Selling Price (KES) *</Label><Input type="number" value={form.unitSellingPrice} onChange={e => setForm({ ...form, unitSellingPrice: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Commission %</Label><Input type="number" value={form.commissionPercent} onChange={e => setForm({ ...form, commissionPercent: e.target.value })} /></div>
              <div><Label>Current Stock</Label><Input type="number" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Product</AlertDialogTitle><AlertDialogDescription>This will permanently delete this product.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 rounded-xl">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
