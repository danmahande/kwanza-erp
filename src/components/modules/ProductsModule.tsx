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
import { Search, Package, Plus, Trash2, Edit3, Boxes, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency } from '@/lib/currency'

interface Product {
  id: string
  productId: string
  productLabel: string
  brand: string | null
  variant: string | null
  category: string
  merchantId: string
  merchantName: string
  unit: string
  weight: string | null
  minStock: number
  unitCost: number
  unitSellingPrice: number
  commissionPercent: number
  currentStock: number
  isActive: boolean
  createdAt: string
}

interface Merchant {
  id: string
  merchantId: string
  businessName: string
}

export default function ProductsModule() {
  const [data, setData] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    productLabel: '',
    brand: '',
    variant: '',
    category: '',
    merchantId: '',
    merchantName: '',
    unit: 'pcs',
    weight: '',
    minStock: '10',
    unitCost: '',
    unitSellingPrice: '',
    commissionPercent: '0',
  })

  const fetchData = () => {
    fetch(`/api/products?search=${search}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => {
    fetchData()
    fetch('/api/merchants').then(r => r.json()).then(d => setMerchants(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { fetchData() }, [search])

  const totalProducts = data.length
  const activeProducts = data.filter(p => p.isActive).length
  const lowStockProducts = data.filter(p => p.currentStock <= p.minStock).length
  const totalStockValue = data.reduce((s, p) => s + (p.currentStock * p.unitCost), 0)

  const stats = [
    { label: 'Total Products', value: totalProducts, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Active', value: activeProducts, icon: Boxes, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Low Stock', value: lowStockProducts, icon: AlertTriangle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
    { label: 'Stock Value', value: formatCurrency(totalStockValue), icon: Package, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.productLabel || !form.category || !form.merchantId) {
      toast.error('Product label, category, and merchant are required')
      return
    }
    const merchant = merchants.find(m => m.merchantId === form.merchantId)
    const payload = {
      productLabel: form.productLabel,
      brand: form.brand || null,
      variant: form.variant || null,
      category: form.category,
      merchantId: form.merchantId,
      merchantName: merchant?.businessName || '',
      unit: form.unit,
      weight: form.weight || null,
      minStock: parseInt(form.minStock) || 0,
      unitCost: parseFloat(form.unitCost) || 0,
      unitSellingPrice: parseFloat(form.unitSellingPrice) || 0,
      commissionPercent: parseFloat(form.commissionPercent) || 0,
      currentStock: 0,
      isActive: true,
    }
    try {
      if (editing) {
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        toast.success('Product updated')
      } else {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Product created')
      }
      setOpen(false)
      setEditing(null)
      setForm({
        productLabel: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
        unit: 'pcs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '0',
      })
      fetchData()
    } catch {
      toast.error('Failed to save product')
    }
  }

  const handleEdit = (item: Product) => {
    setEditing(item)
    setForm({
      productLabel: item.productLabel,
      brand: item.brand || '',
      variant: item.variant || '',
      category: item.category,
      merchantId: item.merchantId,
      merchantName: item.merchantName,
      unit: item.unit,
      weight: item.weight || '',
      minStock: String(item.minStock),
      unitCost: String(item.unitCost),
      unitSellingPrice: String(item.unitSellingPrice),
      commissionPercent: String(item.commissionPercent),
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await fetch(`/api/products?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Product deleted')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    } catch {
      toast.error('Failed to delete product')
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      productLabel: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
      unit: 'pcs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '0',
    })
    setOpen(true)
  }

  const stockBadge = (p: Product) => {
    if (p.currentStock === 0) return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Out of stock</Badge>
    if (p.currentStock <= p.minStock) return <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">Low ({p.currentStock})</Badge>
    return <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">In stock ({p.currentStock})</Badge>
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Products"
        description="Manage the product catalog. Each product belongs to a merchant."
        icon={Package}
        stats={stats}
        actionLabel="Add Product"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-xl border-gray-200 bg-white"
          />
        </div>
      </OfficeHeader>

      {data.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Package size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No products yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first product to the catalog</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Product</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Merchant</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Unit Cost</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Sell Price</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Stock</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleEdit(p)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.productLabel}</p>
                      <p className="text-xs text-gray-400">
                        {p.productId}
                        {p.brand && ` · ${p.brand}`}
                        {p.variant && ` · ${p.variant}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{p.merchantName || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.category}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(p.unitCost)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(p.unitSellingPrice)}</td>
                    <td className="px-4 py-3 text-center">{stockBadge(p)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(p)}>
                          <Edit3 size={12} className="text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingId(p.id); setDeleteOpen(true) }}>
                          <Trash2 size={12} className="text-red-600" />
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
        title={editing ? `Edit ${editing.productLabel}` : 'New Product'}
        subtitle={editing ? editing.productId : 'Fill in the details to create a new product'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl"
                onClick={() => { setDeletingId(editing.id); setDeleteOpen(true) }}
              >
                <Trash2 size={16} className="mr-2" /> Delete
              </Button>
            )}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Product Label <span className="text-red-400">*</span></Label>
              <Input value={form.productLabel} onChange={e => setForm({ ...form, productLabel: e.target.value })} placeholder="e.g. Dettol Soap 500g" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Brand</Label>
              <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Dettol" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Variant</Label>
              <Input value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })} placeholder="e.g. 500g, Blue" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Category <span className="text-red-400">*</span></Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Toiletries" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Merchant <span className="text-red-400">*</span></Label>
              <select
                value={form.merchantId}
                onChange={e => setForm({ ...form, merchantId: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select merchant...</option>
                {merchants.map(m => (
                  <option key={m.merchantId} value={m.merchantId}>{m.businessName}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Unit</Label>
              <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, box" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Weight</Label>
              <Input value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="e.g. 500g" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Min Stock</Label>
              <Input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Unit Cost (UGX)</Label>
              <Input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Sell Price (UGX)</Label>
              <Input type="number" value={form.unitSellingPrice} onChange={e => setForm({ ...form, unitSellingPrice: e.target.value })} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Commission (%)</Label>
              <Input type="number" step="0.1" value={form.commissionPercent} onChange={e => setForm({ ...form, commissionPercent: e.target.value })} className="rounded-xl" />
            </div>
          </div>
        </div>
      </DetailSlideOver>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the product. Existing orders referencing it will not be affected.</AlertDialogDescription>
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
