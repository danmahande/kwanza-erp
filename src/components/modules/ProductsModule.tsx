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
import { Search, Package, Plus, Trash2, Edit3, Boxes, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency } from '@/lib/currency'

interface Product {
  id: string
  productId: string
  productLabel: string
  description: string | null
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    productLabel: '',
    description: '',
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
    isActive: true,
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
      description: form.description || null,
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
      currentStock: editing ? editing.currentStock : 0,
      isActive: editing ? form.isActive : true,
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
        productLabel: '', description: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
        unit: 'pcs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '0', isActive: true,
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
      description: item.description || '',
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
      isActive: item.isActive,
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
      productLabel: '', description: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
      unit: 'pcs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '0', isActive: true,
    })
    setOpen(true)
  }

  const stockBadge = (p: Product) => {
    if (!p.isActive) return <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">Inactive</Badge>
    if (p.currentStock === 0) return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Out of stock</Badge>
    if (p.currentStock <= p.minStock) return <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">Low ({p.currentStock})</Badge>
    return <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">In stock ({p.currentStock})</Badge>
  }

  const handleToggleActive = async (p: Product) => {
    await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, isActive: !p.isActive }) })
    toast.success(`${p.productLabel} ${p.isActive ? 'deactivated' : 'activated'}`)
    fetchData()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-3">
      <OpsHeader
        title="Products"
        description="Product catalog. Each product belongs to a merchant."
        kpiCells={[
          { label: 'TOTAL', value: totalProducts },
          { label: 'ACTIVE', value: activeProducts },
          { label: 'LOW STOCK', value: lowStockProducts, highlight: lowStockProducts > 0, highlightColor: 'red' },
          { label: 'STOCK VALUE', value: formatCurrency(totalStockValue) },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products..."
        actionLabel="Add Product"
        onAction={openCreate}
      />

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
                {data.map((p, i) => {
                  const isExpanded = expandedId === p.id
                  return (
                    <>
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(i * 0.01, 0.5) }}
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${p.currentStock <= p.minStock ? 'bg-orange-50/40' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900 text-sm">{p.productLabel}</p>
                          <p className="text-[10px] text-gray-400 font-mono">
                            {p.productId}
                            {p.brand && ` · ${p.brand}`}
                            {p.variant && ` · ${p.variant}`}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-gray-700 text-xs">{p.merchantName || '—'}</td>
                        <td className="px-4 py-2 text-gray-600 text-xs">{p.category}</td>
                        <td className="px-4 py-2 text-right text-gray-700 font-mono text-xs tabular-nums">{formatCurrency(p.unitCost)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900 font-mono text-xs tabular-nums">{formatCurrency(p.unitSellingPrice)}</td>
                        <td className="px-4 py-2 text-center">{stockBadge(p)}</td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleToggleActive(p)} title={p.isActive ? 'Deactivate' : 'Activate'} className="p-1.5 rounded hover:bg-gray-100">
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${p.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                            </button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(p)}>
                              <Edit3 size={12} className="text-gray-600" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingId(p.id); setDeleteOpen(true) }}>
                              <Trash2 size={12} className="text-red-600" />
                            </Button>
                            {isExpanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
                          </div>
                        </td>
                      </motion.tr>
                      {isExpanded && (
                        <tr key={`${p.id}-detail`} className="bg-white border-b border-gray-200">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Product</p>
                                <p className="text-gray-900">{p.productLabel}</p>
                                <p className="text-gray-500 font-mono">{p.productId}</p>
                                {p.brand && <p className="text-gray-500">Brand: {p.brand}</p>}
                                {p.variant && <p className="text-gray-500">Variant: {p.variant}</p>}
                                {p.description && <p className="text-gray-500 italic mt-1 text-[11px]">"{p.description}"</p>}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Stock</p>
                                <p className="text-gray-900">Current: <span className="font-mono font-bold">{p.currentStock}</span></p>
                                <p className="text-gray-500">Min: <span className="font-mono">{p.minStock}</span></p>
                                <p className="text-gray-500">Unit: {p.unit}</p>
                                {p.weight && <p className="text-gray-500">Weight: {p.weight}</p>}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Pricing</p>
                                <p className="text-gray-700">Cost: <span className="font-mono">{formatCurrency(p.unitCost)}</span></p>
                                <p className="text-gray-700">Sell: <span className="font-mono">{formatCurrency(p.unitSellingPrice)}</span></p>
                                <p className="text-gray-700">Commission: <span className="font-mono">{p.commissionPercent}%</span></p>
                                <p className="text-gray-500 mt-1">Stock value: <span className="font-mono">{formatCurrency(p.currentStock * p.unitCost)}</span></p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Merchant</p>
                                <p className="text-gray-900">{p.merchantName || '—'}</p>
                                <p className="text-gray-500 font-mono">{p.merchantId}</p>
                                <div className="mt-2 flex gap-1">
                                  <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleEdit(p)}>Edit</Button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
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
            <div className="col-span-2">
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Description</Label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Product description for catalogs and invoices..." rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
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
            {editing && (
              <div className="flex items-center gap-2">
                <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Status</Label>
                <button
                  onClick={() => setForm({ ...form, isActive: !form.isActive })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${form.isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {form.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            )}
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
