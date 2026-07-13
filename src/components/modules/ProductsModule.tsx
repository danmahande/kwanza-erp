'use client'

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, Package, Plus, Trash2, Edit3, AlertTriangle,
  HelpCircle, Layers, ArrowLeft as BackIcon, ChevronRight, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ── Types ──

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

interface FormState {
  productLabel: string; description: string; brand: string; variant: string
  category: string; merchantId: string; merchantName: string
  unit: string; weight: string; minStock: string
  unitCost: string; unitSellingPrice: string; commissionPercent: string; isActive: boolean
}

// ── Constants ──

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
]

const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Beverages', 'Household', 'Electronics', 'Personal Care', 'Other']

const emptyForm: FormState = {
  productLabel: '', description: '', brand: '', variant: '', category: '', merchantId: '', merchantName: '',
  unit: 'pcs', weight: '', minStock: '10', unitCost: '', unitSellingPrice: '', commissionPercent: '0', isActive: true,
}

// ── Helpers ──

const stockLabel = (p: Product): string => {
  if (!p.isActive) return 'Inactive'
  if (p.currentStock === 0) return 'Out of stock'
  if (p.currentStock <= p.minStock) return `Low (${p.currentStock})`
  return `In stock (${p.currentStock})`
}

const stockColor = (p: Product): string => {
  if (!p.isActive) return 'text-gray-400'
  if (p.currentStock === 0) return 'text-red-600'
  if (p.currentStock <= p.minStock) return 'text-orange-600'
  return 'text-green-700'
}

const stockDot = (p: Product): string => {
  if (!p.isActive) return 'bg-gray-300'
  if (p.currentStock === 0) return 'bg-red-500'
  if (p.currentStock <= p.minStock) return 'bg-orange-500'
  return 'bg-green-500'
}

// ═══════════════════════════════════════════════════════════════
// ADD PRODUCT VIEW — FULL-PAGE FORM
// ═══════════════════════════════════════════════════════════════

function AddProductView({
  editing, form, setForm, merchants, onSubmit, onCancel, onDelete,
}: {
  editing: Product | null
  form: FormState
  setForm: (f: FormState) => void
  merchants: Merchant[]
  onSubmit: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={onCancel}>
              <BackIcon size={14} className="mr-1" /> Back
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h1 className="text-base font-bold text-gray-900">{editing ? `Edit ${editing.productLabel}` : 'Add New Product'}</h1>
              <p className="text-[11px] text-gray-500">{editing ? editing.productId : 'Fill in the details to create a new product'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-1">Product Information</h2>
              <p className="text-xs text-gray-500">Catalog entry linked to a merchant. Required fields are marked with *.</p>
            </div>
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
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Merchant <span className="text-red-400">*</span></Label>
                <select value={form.merchantId} onChange={e => setForm({ ...form, merchantId: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <option value="">Select merchant...</option>
                  {merchants.map(m => <option key={m.merchantId} value={m.merchantId}>{m.businessName}</option>)}
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
                <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Unit Cost</Label>
                <Input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="0" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Sell Price</Label>
                <Input type="number" value={form.unitSellingPrice} onChange={e => setForm({ ...form, unitSellingPrice: e.target.value })} placeholder="0" className="rounded-xl" />
              </div>
              <div>
                <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Commission (%)</Label>
                <Input type="number" step="0.1" value={form.commissionPercent} onChange={e => setForm({ ...form, commissionPercent: e.target.value })} className="rounded-xl" />
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Status</Label>
                  <button onClick={() => setForm({ ...form, isActive: !form.isActive })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium ${form.isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {form.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          {editing ? (
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl" onClick={onDelete}>
              <Trash2 size={14} className="mr-1.5" /> Delete
            </Button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={onCancel}>Cancel</Button>
            <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={onSubmit}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ALL PRODUCTS VIEW — FULL-PAGE TABLE
// ═══════════════════════════════════════════════════════════════

function AllProductsView({
  data, activeFilter, onFilterChange, onBack, onSelect, onToggleActive, onEdit, onDelete,
}: {
  data: Product[]
  activeFilter: string
  onFilterChange: (f: string) => void
  onBack: () => void
  onSelect: (p: Product) => void
  onToggleActive: (p: Product) => void
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
}) {
  const filteredData = data.filter(p => {
    if (activeFilter === 'active') return p.isActive
    if (activeFilter === 'inactive') return !p.isActive
    if (activeFilter === 'low_stock') return p.isActive && p.currentStock > 0 && p.currentStock <= p.minStock
    if (activeFilter === 'out_of_stock') return p.isActive && p.currentStock === 0
    return true
  })

  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={onBack}>
              <BackIcon size={14} className="mr-1" /> Back
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><Layers size={16} className="text-[#FF6B35]" /> All Products</h1>
              <p className="text-[11px] text-gray-500">{data.length} total · Click any row to open the product profile</p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} className="text-gray-400" />
            {FILTER_CHIPS.map(chip => {
              const count = chip.key === 'all' ? data.length : data.filter(p => {
                if (chip.key === 'active') return p.isActive
                if (chip.key === 'inactive') return !p.isActive
                if (chip.key === 'low_stock') return p.isActive && p.currentStock > 0 && p.currentStock <= p.minStock
                if (chip.key === 'out_of_stock') return p.isActive && p.currentStock === 0
                return true
              }).length
              return (
                <button key={chip.key} onClick={() => onFilterChange(chip.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeFilter === chip.key ? 'bg-[#FF6B35] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {chip.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${activeFilter === chip.key ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Table */}
          <DenseTable>
            <thead>
              <tr>
                <DenseTh className="w-24">ID</DenseTh>
                <DenseTh>Product</DenseTh>
                <DenseTh>Merchant</DenseTh>
                <DenseTh className="w-24">Category</DenseTh>
                <DenseTh className="w-24 text-right">Cost</DenseTh>
                <DenseTh className="w-24 text-right">Sell</DenseTh>
                <DenseTh className="w-16 text-right">Comm %</DenseTh>
                <DenseTh className="w-20 text-center">Stock</DenseTh>
                <DenseTh className="w-16 text-center">Status</DenseTh>
                <DenseTh className="w-24 text-right">Actions</DenseTh>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((p, i) => (
                <AnimatedDenseTr key={p.id} index={i} onClick={() => onSelect(p)} tint={!p.isActive ? 'bg-gray-50/50' : p.currentStock <= p.minStock ? 'bg-orange-50/40' : ''}>
                  <DenseTd mono className="text-gray-500 text-[10px]">{p.productId}</DenseTd>
                  <DenseTd className="text-gray-900 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${stockDot(p)}`} />
                      <div className="min-w-0">
                        <p className="truncate">{p.productLabel}</p>
                        {(p.brand || p.variant) && (
                          <p className="text-[10px] text-gray-400 font-mono truncate">
                            {[p.brand, p.variant].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </DenseTd>
                  <DenseTd className="text-gray-600 text-xs">{p.merchantName || '—'}</DenseTd>
                  <DenseTd className="text-gray-600 text-xs">{p.category}</DenseTd>
                  <DenseTd mono right className="text-gray-600">{formatCurrencyCompact(p.unitCost)}</DenseTd>
                  <DenseTd mono right className="text-gray-900 font-medium">{formatCurrencyCompact(p.unitSellingPrice)}</DenseTd>
                  <DenseTd mono right className="text-orange-700">{p.commissionPercent}%</DenseTd>
                  <DenseTd mono className="text-center">
                    <span className={stockColor(p)}>{p.currentStock}</span>
                    <span className="text-gray-400 text-[10px]">/{p.minStock}</span>
                  </DenseTd>
                  <DenseTd className="text-center">
                    <button onClick={(e) => { e.stopPropagation(); onToggleActive(p) }} title={p.isActive ? 'Deactivate' : 'Activate'}>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${p.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 hover:bg-gray-400'}`} />
                    </button>
                  </DenseTd>
                  <DenseTd right>
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onEdit(p)} title="Edit" className="p-1 text-gray-400 hover:text-[#FF6B35]"><Edit3 size={12} /></button>
                      <button onClick={() => onDelete(p)} title="Delete" className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </DenseTd>
                </AnimatedDenseTr>
              ))}
              {filteredData.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-sm">No products match this filter.</td></tr>
              )}
            </tbody>
          </DenseTable>

          <p className="text-[10px] text-gray-400 px-1">
            {filteredData.length} product(s). Click a row to open the profile. Use the status dot to activate/deactivate.
          </p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ProductsModule() {
  const [data, setData] = useState<Product[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'add' | 'table'>('list')
  const [editing, setEditing] = useState<Product | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)

  // ── Data fetching ──
  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`/api/products?search=${search}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setLoading(false) })
  }, [search])

  useEffect(() => {
    fetchData()
    fetch('/api/merchants').then(r => r.json()).then(d => setMerchants(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived stats ──
  const totalProducts = data.length
  const activeProducts = data.filter(p => p.isActive).length
  const lowStockProducts = data.filter(p => p.isActive && p.currentStock > 0 && p.currentStock <= p.minStock).length
  const outOfStockProducts = data.filter(p => p.isActive && p.currentStock === 0).length
  const totalStockValue = data.reduce((s, p) => s + (p.currentStock * p.unitCost), 0)

  // ── Actions ──
  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setView('add')
  }

  const handleEdit = (p: Product) => {
    setEditing(p)
    setForm({
      productLabel: p.productLabel,
      description: p.description || '',
      brand: p.brand || '',
      variant: p.variant || '',
      category: p.category,
      merchantId: p.merchantId,
      merchantName: p.merchantName,
      unit: p.unit,
      weight: p.weight || '',
      minStock: String(p.minStock),
      unitCost: String(p.unitCost),
      unitSellingPrice: String(p.unitSellingPrice),
      commissionPercent: String(p.commissionPercent),
      isActive: p.isActive,
    })
    setProfileOpen(false)
    setView('add')
  }

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
        await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Product updated')
      } else {
        await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        toast.success('Product created')
      }
      setView('list')
      setEditing(null)
      setForm(emptyForm)
      fetchData()
    } catch {
      toast.error('Failed to save product')
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await fetch(`/api/products?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Product deleted')
      setDeleteOpen(false)
      setDeletingId(null)
      setProfileOpen(false)
      setView('list')
      fetchData()
    } catch {
      toast.error('Failed to delete product')
    }
  }

  const handleToggleActive = async (p: Product) => {
    await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, isActive: !p.isActive }) })
    toast.success(`${p.productLabel} ${p.isActive ? 'deactivated' : 'activated'}`)
    fetchData()
  }

  const handleExpand = (p: Product) => {
    setSelectedProduct(p)
    setProfileOpen(true)
  }

  const handleDeleteFromForm = () => {
    if (editing) {
      setDeletingId(editing.id)
      setDeleteOpen(true)
    }
  }

  const handleDeleteFromTable = (p: Product) => {
    setDeletingId(p.id)
    setDeleteOpen(true)
  }

  // ── Render: Add Product (full-page) ──
  if (view === 'add') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="add">
          <AddProductView
            editing={editing}
            form={form}
            setForm={setForm}
            merchants={merchants}
            onSubmit={handleSubmit}
            onCancel={() => { setView('list'); setEditing(null); setForm(emptyForm) }}
            onDelete={handleDeleteFromForm}
          />
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: All Products table (full-page) ──
  if (view === 'table') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="table">
          <AllProductsView
            data={data}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onBack={() => setView('list')}
            onSelect={(p) => { setView('list'); handleExpand(p) }}
            onToggleActive={handleToggleActive}
            onEdit={(p) => { setView('list'); handleEdit(p) }}
            onDelete={handleDeleteFromTable}
          />
        </PageTransition>
      </AnimatePresence>
    )
  }

  // ── Render: Main list view (overview) ──
  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          {/* ── Header ── */}
          <OpsHeader
            title="Products"
            description="Catalog and stock"
            kpiCells={[
              { label: 'TOTAL', value: totalProducts },
              { label: 'ACTIVE', value: activeProducts },
              { label: 'LOW STOCK', value: lowStockProducts, highlight: lowStockProducts > 0, highlightColor: 'orange' as const },
              { label: 'OUT OF STOCK', value: outOfStockProducts, highlight: outOfStockProducts > 0, highlightColor: 'red' as const },
              { label: 'STOCK VALUE', value: formatCurrencyCompact(totalStockValue) },
            ]}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search products..."
          />

          {/* ── Action bar (below KPI, left-aligned) ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={openCreate}>
              <Plus size={12} className="mr-1" /> Add Product
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setView('table')} disabled={data.length === 0}>
              <Layers size={12} className="mr-1" /> View All
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={12} className="mr-1" /> Help
            </Button>
          </div>

          {/* ── Low stock alert banner ── */}
          {(lowStockProducts > 0 || outOfStockProducts > 0) && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-orange-600 shrink-0" />
              <div className="flex-1 text-xs">
                <p className="text-orange-800 font-semibold">
                  {outOfStockProducts > 0 && `${outOfStockProducts} out of stock`}
                  {outOfStockProducts > 0 && lowStockProducts > 0 && ', '}
                  {lowStockProducts > 0 && `${lowStockProducts} low stock`}
                  {' '}— reorder needed.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-md bg-white" onClick={() => setView('table')}>
                View All <ChevronRight size={11} className="ml-1" />
              </Button>
            </div>
          )}

          {/* ── Empty state ── */}
          {data.length === 0 && !loading && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto bg-orange-50 rounded-full flex items-center justify-center mb-4">
                <Package size={28} className="text-orange-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No products yet</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                Add your first product to start tracking stock, pricing, and commission. Each product is linked to a merchant.
              </p>
              <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={openCreate}>
                <Plus size={14} className="mr-1.5" /> Add your first product
              </Button>
            </div>
          )}

          {/* ── Search results (inline) ── */}
          {search && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {data.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No products match &quot;{search}&quot;</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.slice(0, 10).map(p => (
                    <div key={p.id} onClick={() => handleExpand(p)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${stockDot(p)}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-900">{p.productLabel}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{p.productId}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0">{p.merchantName || '—'}</span>
                      <span className={`text-[11px] font-mono font-bold shrink-0 ${stockColor(p)}`}>{p.currentStock}</span>
                      <ChevronRight size={14} className="text-gray-300 shrink-0" />
                    </div>
                  ))}
                  {data.length > 10 && (
                    <button onClick={() => setView('table')} className="w-full px-4 py-2 text-center text-[11px] text-[#FF6B35] font-semibold hover:bg-orange-50">
                      View all {data.length} products →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Loading ── */}
          {loading && <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-300" /></div>}

          {/* ══ PROFILE SLIDE-OVER ══ */}
          <DetailSlideOver
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            title={selectedProduct?.productLabel || ''}
            subtitle={selectedProduct ? `${selectedProduct.productId} · ${selectedProduct.merchantName || 'No merchant'}` : ''}
            width="lg"
            footer={selectedProduct ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => handleEdit(selectedProduct)}><Edit3 size={12} className="mr-1" /> Edit</Button>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setDeletingId(selectedProduct.id); setDeleteOpen(true) }}><Trash2 size={12} className="mr-1" /> Delete</Button>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setProfileOpen(false)}>Close</Button>
              </div>
            ) : undefined}
          >
            {selectedProduct && (() => {
              const p = selectedProduct
              const margin = p.unitSellingPrice > 0 ? ((p.unitSellingPrice - p.unitCost) / p.unitSellingPrice) * 100 : 0
              const stockValue = p.currentStock * p.unitCost
              return (
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${stockDot(p)}`} />
                    <span className="text-[11px] font-medium text-gray-700">{stockLabel(p)}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">Added {new Date(p.createdAt).toLocaleDateString('en-UG')}</span>
                  </div>

                  {/* Key stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Current</p>
                      <p className={`text-lg font-bold font-mono ${stockColor(p)}`}>{p.currentStock}</p>
                      <p className="text-[9px] text-gray-400">min {p.minStock}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Stock Value</p>
                      <p className="text-lg font-bold font-mono text-gray-900">{formatCurrencyCompact(stockValue)}</p>
                      <p className="text-[9px] text-gray-400">{p.unit}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Margin</p>
                      <p className={`text-lg font-bold font-mono ${margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{margin.toFixed(0)}%</p>
                      <p className="text-[9px] text-gray-400">sell vs cost</p>
                    </div>
                  </div>

                  {/* Pricing breakdown */}
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Pricing</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-500">Unit Cost</span><span className="font-mono font-medium text-gray-900">{formatCurrency(p.unitCost)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Selling Price</span><span className="font-mono font-medium text-gray-900">{formatCurrency(p.unitSellingPrice)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Margin per unit</span><span className="font-mono font-medium text-gray-900">{formatCurrency(p.unitSellingPrice - p.unitCost)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Commission</span><span className="font-mono font-medium text-orange-700">{p.commissionPercent}%</span></div>
                      <div className="flex justify-between pt-1.5 border-t border-gray-200"><span className="text-gray-700 font-semibold">Stock Value</span><span className="font-mono font-bold text-gray-900">{formatCurrency(stockValue)}</span></div>
                    </div>
                  </div>

                  {/* Product details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Product Details</p>
                      <div className="space-y-0.5 text-xs">
                        <p className="text-gray-900 font-medium">{p.productLabel}</p>
                        <p className="text-gray-500 font-mono">{p.productId}</p>
                        {p.brand && <p className="text-gray-700">Brand: {p.brand}</p>}
                        {p.variant && <p className="text-gray-700">Variant: {p.variant}</p>}
                        {p.weight && <p className="text-gray-700">Weight: {p.weight}</p>}
                        <p className="text-gray-700">Unit: {p.unit}</p>
                        <p className="text-gray-700">Category: {p.category}</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Merchant</p>
                      <div className="space-y-0.5 text-xs">
                        <p className="text-gray-900 font-medium">{p.merchantName || '—'}</p>
                        <p className="text-gray-500 font-mono">{p.merchantId}</p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {p.description && (
                    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Description</p>
                      <p className="text-xs text-gray-700 italic">{p.description}</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </DetailSlideOver>

          {/* ══ DELETE DIALOG ══ */}
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent className="rounded-2xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><Trash2 size={18} className="text-red-600" /> Delete Product</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the product. Existing orders referencing it will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ══ HELP DIALOG ══ */}
          <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
            <AlertDialogContent className="rounded-2xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Products</AlertDialogTitle>
                <AlertDialogDescription>
                  Manage your product catalog. Each product is linked to a merchant and tracks stock, pricing, and commission.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 py-2 text-xs text-gray-700">
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Add Product</p>
                  <p>Opens a full-page form. Required: product label, category, and merchant. Pricing and commission are set per product.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">View All</p>
                  <p>Opens a full-page table with all products, filter chips (All, Active, Inactive, Low Stock, Out of Stock), and inline actions. Click any row to open the product profile.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Stock Indicators</p>
                  <p>The colored dot next to each product shows stock health: green = in stock, orange = low (at or below min), red = out of stock, gray = inactive.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Profile</p>
                  <p>Click any row to open the product profile. Shows stock value, margin, pricing breakdown, and product details. Edit and delete from the footer.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Status Toggle</p>
                  <p>Click the status dot in the table to activate or deactivate a product. Inactive products are excluded from new orders.</p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
