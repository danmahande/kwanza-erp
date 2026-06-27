'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Package, Tag, DollarSign, Warehouse, AlertTriangle, CheckCircle, XCircle, MinusCircle, ShoppingCart, CalendarDays, Eye, Edit3, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

interface Product {
  id: string
  productId: string
  productLabel: string
  brand: string
  variant: string
  category: string
  merchantName: string
  unit: string
  weight: string
  minStock: number
  unitCost: number
  unitSellingPrice: number
  commissionPercent: number
  currentStock: number
  status: string
  description: string
  imageUrl: string
  isActive: boolean
  createdAt: string
}

export default function ProductsModule() {
  const [data, setData] = useState<Product[]>([])
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
    merchantName: '', 
    unit: '', 
    weight: '', 
    minStock: 10, 
    unitCost: 0, 
    unitSellingPrice: 0, 
    commissionPercent: 0, 
    currentStock: 0, 
    status: 'active',
    description: '',
    imageUrl: ''
  })

  const fetchData = () => {
    fetch(`/api/products?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/products?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalProducts = data.length
  const activeProducts = data.filter(p => p.status === 'active').length
  const outOfStock = data.filter(p => p.currentStock === 0).length
  const lowStock = data.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length

  const stats = [
    { label: 'Total Products', value: totalProducts, icon: Package, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Active', value: activeProducts, icon: CheckCircle, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Out of Stock', value: outOfStock, icon: XCircle, color: '#EF4444', bg: 'bg-red-500/20', border: 'border-red-400/30', gradient: 'from-red-500/10 to-red-500/5' },
    { label: 'Low Stock', value: lowStock, icon: AlertTriangle, color: '#F59E0B', bg: 'bg-amber-500/20', border: 'border-amber-400/30', gradient: 'from-amber-500/10 to-amber-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.productLabel || !form.category || !form.merchantName) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Product updated successfully')
    } else {
      await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, isActive: true }) })
      toast.success('Product created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ 
      productLabel: '', 
      brand: '', 
      variant: '', 
      category: '', 
      merchantName: '', 
      unit: '', 
      weight: '', 
      minStock: 10, 
      unitCost: 0, 
      unitSellingPrice: 0, 
      commissionPercent: 0, 
      currentStock: 0, 
      status: 'active',
      description: '',
      imageUrl: ''
    })
    fetchData()
  }

  const handleEdit = (item: Product) => {
    setEditing(item)
    setForm({ 
      productLabel: item.productLabel, 
      brand: item.brand, 
      variant: item.variant, 
      category: item.category, 
      merchantName: item.merchantName, 
      unit: item.unit, 
      weight: item.weight, 
      minStock: item.minStock, 
      unitCost: item.unitCost, 
      unitSellingPrice: item.unitSellingPrice, 
      commissionPercent: item.commissionPercent, 
      currentStock: item.currentStock, 
      status: item.status,
      description: item.description || '',
      imageUrl: item.imageUrl || ''
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/products?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Product deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ 
      productLabel: '', 
      brand: '', 
      variant: '', 
      category: '', 
      merchantName: '', 
      unit: '', 
      weight: '', 
      minStock: 10, 
      unitCost: 0, 
      unitSellingPrice: 0, 
      commissionPercent: 0, 
      currentStock: 0, 
      status: 'active',
      description: '',
      imageUrl: ''
    })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ 
      productLabel: '', 
      brand: '', 
      variant: '', 
      category: '', 
      merchantName: '', 
      unit: '', 
      weight: '', 
      minStock: 10, 
      unitCost: 0, 
      unitSellingPrice: 0, 
      commissionPercent: 0, 
      currentStock: 0, 
      status: 'active',
      description: '',
      imageUrl: ''
    })
  }

  // Function to determine status badge
  const getStatusBadge = (product: Product) => {
    if (product.currentStock === 0) {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[11px]">Out of Stock</Badge>
    } else if (product.currentStock > 0 && product.currentStock <= product.minStock) {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[11px]">Low Stock</Badge>
    } else {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]">In Stock</Badge>
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Products Office"
        description="Manage your product catalog and inventory levels"
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

      {/* Card Grid */}
      {filteredData.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Package size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No products found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or add a new product</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              className="bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{item.productId}</span>
                {getStatusBadge(item)}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{item.productLabel}</h3>
              
              {item.brand && <p className="text-sm text-gray-600 mb-1"><span className="font-medium">Brand:</span> {item.brand}</p>}
              {item.variant && <p className="text-sm text-gray-600 mb-1"><span className="font-medium">Variant:</span> {item.variant}</p>}
              
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="text-sm">
                  <p className="text-gray-500">Category</p>
                  <p className="font-medium">{item.category}</p>
                </div>
                <div className="text-sm">
                  <p className="text-gray-500">Merchant</p>
                  <p className="font-medium truncate">{item.merchantName}</p>
                </div>
                <div className="text-sm">
                  <p className="text-gray-500">Unit</p>
                  <p className="font-medium">{item.unit}</p>
                </div>
                <div className="text-sm">
                  <p className="text-gray-500">Stock</p>
                  <p className="font-medium">{item.currentStock}</p>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">KES {item.unitSellingPrice.toFixed(2)}</span>
                
                <div className="flex gap-1">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => handleEdit(item)}
                  >
                    <Edit3 size={12} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 w-7 p-0 rounded-lg text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => { setDeletingId(item.id); setDeleteOpen(true) }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail / Create / Edit Slide-Over */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={editing ? editing.productLabel : 'New Product'}
        subtitle={editing ? `ID: ${editing.productId}` : 'Fill in the details to create a new product'}
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
                {editing ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Product ID</p>
                <p className="font-mono text-gray-700">{editing.productId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                {getStatusBadge(editing)}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Current Stock</p>
                <p className="text-gray-700">{editing.currentStock}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Min Stock</p>
                <p className="text-gray-700">{editing.minStock}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Product Name <span className="text-red-400">*</span></Label>
              <Input
                value={form.productLabel}
                onChange={e => setForm({ ...form, productLabel: e.target.value })}
                placeholder="Enter product name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Brand</Label>
              <Input
                value={form.brand}
                onChange={e => setForm({ ...form, brand: e.target.value })}
                placeholder="Enter brand name"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Variant</Label>
              <Input
                value={form.variant}
                onChange={e => setForm({ ...form, variant: e.target.value })}
                placeholder="Enter variant (e.g. BLUE-50PCs)"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Category <span className="text-red-400">*</span></Label>
              <Input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="Enter category"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Merchant <span className="text-red-400">*</span></Label>
              <Input
                value={form.merchantName}
                onChange={e => setForm({ ...form, merchantName: e.target.value })}
                placeholder="Enter merchant name"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Unit</Label>
              <Input
                value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. pack, unit, kg"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Weight</Label>
              <Input
                value={form.weight}
                onChange={e => setForm({ ...form, weight: e.target.value })}
                placeholder="e.g. 50g, 175g, 500ml"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Minimum Stock Level</Label>
              <Input
                type="number"
                value={form.minStock}
                onChange={e => setForm({ ...form, minStock: parseInt(e.target.value) || 0 })}
                placeholder="Enter minimum stock"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Unit Cost (KES)</Label>
              <Input
                type="number"
                value={form.unitCost}
                onChange={e => setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })}
                placeholder="Enter cost price"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Selling Price (KES)</Label>
              <Input
                type="number"
                value={form.unitSellingPrice}
                onChange={e => setForm({ ...form, unitSellingPrice: parseFloat(e.target.value) || 0 })}
                placeholder="Enter selling price"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Commission (%)</Label>
              <Input
                type="number"
                value={form.commissionPercent}
                onChange={e => setForm({ ...form, commissionPercent: parseFloat(e.target.value) || 0 })}
                placeholder="Enter commission %"
                className="rounded-xl"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Current Stock</Label>
              <Input
                type="number"
                value={form.currentStock}
                onChange={e => setForm({ ...form, currentStock: parseInt(e.target.value) || 0 })}
                placeholder="Enter current stock"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block">Status</Label>
              <select
                title="Product Status"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Description</Label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Enter product description"
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
            />
          </div>
          
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Image URL</Label>
            <Input
              value={form.imageUrl}
              onChange={e => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="Enter image URL (optional)"
              className="rounded-xl"
            />
          </div>
        </div>
      </DetailSlideOver>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the product record.</AlertDialogDescription>
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