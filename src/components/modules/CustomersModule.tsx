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
  Search, User, Upload, HelpCircle, ShieldAlert, ShoppingBag,
  Phone, Mail, MapPin, Calendar, TrendingUp, AlertTriangle, CheckCircle2,
  Edit, Trash2, X, ArrowLeft as BackIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, AnimatedDenseTr } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

interface RiskProfile {
  customerType: string
  codRefusals90d: number
  codDelivered90d: number
  avgAOV: number
  isBlocklisted: boolean
  totalOrders: number
}

interface Customer {
  id: string
  customerId: string
  name: string
  contact: string
  email: string | null
  address: string | null
  totalOrders: number
  totalOrderValue: number
  createdAt: string
  riskProfile?: RiskProfile | null
  isBlocklisted?: boolean
  blocklistReason?: string | null
}

interface CustomerOrder {
  id: string
  outboundId: string
  orderNumber: string | null
  productName: string
  qty: number
  saleAmount: number | null
  status: string
  codCollected: number | null
  createdAt: string
  deliveredAt: string | null
}

export default function CustomersModule() {
  const [data, setData] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<Customer | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editForm, setEditForm] = useState({ name: '', contact: '', email: '', address: '' })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const fetchData = useCallback(() => {
    fetch(`/api/customers?search=${encodeURIComponent(search)}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch order history when viewing a customer
  const fetchOrders = useCallback(async (customerId: string) => {
    setOrdersLoading(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/orders?limit=10`)
      const d = await res.json()
      setCustomerOrders(d.orders || [])
    } catch { setCustomerOrders([]) }
    finally { setOrdersLoading(false) }
  }, [])

  const kpiCells = [
    { label: 'TOTAL', value: data.length },
    { label: 'WITH ORDERS', value: data.filter(c => c.totalOrders > 0).length },
    { label: 'TOTAL ORDERS', value: data.reduce((s, c) => s + (c.totalOrders || 0), 0) },
    { label: 'LIFETIME VALUE', value: formatCurrencyCompact(data.reduce((s, c) => s + (c.totalOrderValue || 0), 0)) },
    { label: 'BLOCKLISTED', value: data.filter(c => c.isBlocklisted).length, highlight: data.filter(c => c.isBlocklisted).length > 0, highlightColor: 'red' as const },
  ]

  const handleView = (item: Customer) => {
    setViewing(item)
    setOpen(true)
    fetchOrders(item.id)
  }

  const handleClose = () => {
    setOpen(false)
    setViewing(null)
    setCustomerOrders([])
  }

  const handleEdit = (customer: Customer) => {
    setEditForm({
      name: customer.name,
      contact: customer.contact,
      email: customer.email || '',
      address: customer.address || '',
    })
    setOpen(false)
    setView('edit')
  }

  const handleSaveEdit = async () => {
    if (!viewing) return
    try {
      const res = await fetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: viewing.id, ...editForm }),
      })
      if (res.ok) {
        toast.success('Customer updated')
        setView('list')
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  const handleDelete = async () => {
    if (!viewing) return
    try {
      const res = await fetch(`/api/customers?id=${viewing.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Customer deleted')
        setDeleteOpen(false)
        handleClose()
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  // CSV import
  const handleImport = async () => {
    if (!importText.trim()) { toast.error('Paste CSV data first'); return }
    const lines = importText.trim().split('\n')
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    if (!header.includes('name') || !header.includes('contact')) {
      toast.error('CSV must have columns: name, contact (and optionally: email, address)')
      return
    }
    let success = 0, failed = 0
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim())
      if (vals.length < 2) continue
      const row: Record<string, string> = {}
      header.forEach((h, j) => { row[h] = vals[j] || '' })
      try {
        const res = await fetch('/api/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: row.name, contact: row.contact, email: row.email || '', address: row.address || '', createdBy: 'admin' }),
        })
        if (res.ok) success++
        else failed++
      } catch { failed++ }
    }
    toast.success(`Imported ${success} customers${failed > 0 ? `, ${failed} failed` : ''}`)
    setImportOpen(false); setImportText(''); fetchData()
  }

  // Order status badge
  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      delivered: 'bg-green-100 text-green-700',
      dispatched: 'bg-cyan-100 text-cyan-700',
      failed: 'bg-red-100 text-red-700',
      returned: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500',
      pending: 'bg-gray-100 text-gray-600',
      released: 'bg-amber-100 text-amber-700',
    }
    return colors[status] || 'bg-gray-100 text-gray-600'
  }

  // ── Render: Edit Customer (full-page) ──
  if (view === 'edit') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="edit">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                    <Edit size={16} className="text-[#FF6B35]" /> Edit Customer
                  </h1>
                  <p className="text-[11px] text-gray-500">{viewing?.name || 'Customer'} · {viewing?.customerId}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">Customer Details</h2>
                  <p className="text-xs text-gray-500">Update customer information. If you change the phone number, a new risk profile is created for the new number.</p>
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Name *</Label>
                  <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Phone *</Label>
                  <Input value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Email</Label>
                  <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Address</Label>
                  <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="rounded-xl" />
                </div>
              </div>
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSaveEdit}>Save Changes</Button>
              </div>
            </div>
          </div>
        </PageTransition>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
          <OpsHeader
            title="Customers"
            description="Auto-created from orders. Risk profile tracks COD behavior over time."
            kpiCells={kpiCells}
            searchValue={search}
            onSearchChange={setSearch}
            onSearchSubmit={fetchData}
            searchPlaceholder="Search by name, phone, or email..."
          />

          {/* Action bar (below KPI, left-aligned) */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setImportOpen(true)}>
              <Upload size={12} className="mr-1" /> Import CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={12} className="mr-1" /> Help
            </Button>
          </div>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          <User size={32} className="mx-auto mb-3 text-gray-300" />
          No customers yet. Customers are created automatically when orders are placed.
        </div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-32">Customer ID</DenseTh>
              <DenseTh>Name</DenseTh>
              <DenseTh className="w-28">Phone</DenseTh>
              <DenseTh className="w-16 text-right">Orders</DenseTh>
              <DenseTh className="w-28 text-right">Lifetime Value</DenseTh>
              <DenseTh className="w-20 text-center">Risk</DenseTh>
              <DenseTh className="w-24">Joined</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => (
              <AnimatedDenseTr key={c.id} index={i} onClick={() => handleView(c)} tint={c.isBlocklisted ? 'bg-red-50/50' : c.totalOrders === 0 ? 'bg-gray-50/50' : ''}>
                <DenseTd mono className="text-gray-500 text-[10px]">{c.customerId}</DenseTd>
                <DenseTd className="text-gray-900 font-medium">
                  {c.name}
                  {c.isBlocklisted && <ShieldAlert size={10} className="inline ml-1 text-red-500" />}
                </DenseTd>
                <DenseTd className="text-gray-600 text-[11px]">{c.contact}</DenseTd>
                <DenseTd mono right className={c.totalOrders > 0 ? 'text-gray-900 font-bold' : 'text-gray-300'}>{c.totalOrders}</DenseTd>
                <DenseTd mono right className={c.totalOrderValue > 0 ? 'text-green-700 font-bold' : 'text-gray-300'}>
                  {c.totalOrderValue > 0 ? formatCurrencyCompact(c.totalOrderValue) : '—'}
                </DenseTd>
                <DenseTd className="text-center">
                  {c.riskProfile ? (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      c.riskProfile.codRefusals90d > 0 ? 'bg-red-100 text-red-700' :
                      c.riskProfile.codDelivered90d > 0 ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {c.riskProfile.codRefusals90d > 0 ? `${c.riskProfile.codRefusals90d}R` : c.riskProfile.codDelivered90d > 0 ? 'OK' : 'NEW'}
                    </span>
                  ) : (
                    <span className="text-[9px] text-gray-300">—</span>
                  )}
                </DenseTd>
                <DenseTd className="text-gray-500 text-[10px]">{new Date(c.createdAt).toLocaleDateString('en-UG')}</DenseTd>
              </AnimatedDenseTr>
            ))}
          </tbody>
        </DenseTable>
      )}

      {/* ══ Customer 360 Detail Slide-Over ══ */}
      <DetailSlideOver
        open={open}
        onClose={handleClose}
        title={viewing?.name || ''}
        subtitle={viewing ? `ID: ${viewing.customerId}` : ''}
        width="lg"
        footer={
          viewing && (
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-2">
                {viewing.totalOrders === 0 && (
                  <Button variant="outline" size="sm" className="rounded-xl text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={12} className="mr-1" /> Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleEdit(viewing)}>
                  <Edit size={12} className="mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={handleClose}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-3">
            {/* Blocklist warning */}
            {viewing.isBlocklisted && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-900">BLOCKLISTED</p>
                  <p className="text-[11px] text-red-700 mt-0.5">{viewing.blocklistReason || 'This customer\'s phone is on the fraud blocklist.'}</p>
                  <p className="text-[10px] text-red-500 mt-1">Orders from this customer will be hard-blocked at intake.</p>
                </div>
              </div>
            )}

            {/* Customer details */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Customer Details</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <User size={12} className="text-gray-400" />
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium text-gray-900">{viewing.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-gray-400" />
                  <span className="text-gray-500">Phone:</span>
                  <span className="font-medium text-gray-900">{viewing.contact}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={12} className="text-gray-400" />
                  <span className="text-gray-500">Email:</span>
                  <span className="text-gray-700">{viewing.email || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-gray-400" />
                  <span className="text-gray-500">Joined:</span>
                  <span className="text-gray-700">{new Date(viewing.createdAt).toLocaleDateString('en-UG')}</span>
                </div>
                {viewing.address && (
                  <div className="flex items-center gap-2 col-span-2">
                    <MapPin size={12} className="text-gray-400" />
                    <span className="text-gray-500">Address:</span>
                    <span className="text-gray-700">{viewing.address}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={12} className="text-gray-400" />
                  <span className="text-gray-500">Total Orders:</span>
                  <span className="font-mono font-bold text-gray-900">{viewing.totalOrders}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp size={12} className="text-gray-400" />
                  <span className="text-gray-500">Lifetime Value:</span>
                  <span className="font-mono font-bold text-green-700">{formatCurrency(viewing.totalOrderValue)}</span>
                </div>
              </div>
            </div>

            {/* Risk Profile */}
            {viewing.riskProfile && (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Risk Profile (graded over time)</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[10px] text-gray-500">Customer Type</p>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${viewing.riskProfile.customerType === 'wholesale' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {viewing.riskProfile.customerType.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">COD Delivered (90d)</p>
                    <p className="font-mono font-bold text-green-700">{viewing.riskProfile.codDelivered90d}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">COD Refusals (90d)</p>
                    <p className={`font-mono font-bold ${viewing.riskProfile.codRefusals90d > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {viewing.riskProfile.codRefusals90d}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Avg AOV</p>
                    <p className="font-mono text-gray-700">{viewing.riskProfile.avgAOV > 0 ? formatCurrencyCompact(viewing.riskProfile.avgAOV) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Blocklisted</p>
                    {viewing.riskProfile.isBlocklisted ? (
                      <span className="text-[10px] font-bold text-red-600">YES</span>
                    ) : (
                      <span className="text-[10px] text-green-600">No</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">COD Acceptance</p>
                    {(() => {
                      const total = viewing.riskProfile.codDelivered90d + viewing.riskProfile.codRefusals90d
                      if (total === 0) return <span className="text-gray-400 text-[10px]">No data</span>
                      const rate = Math.round((viewing.riskProfile.codDelivered90d / total) * 100)
                      return <span className={`font-mono font-bold ${rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Order History */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
                Recent Orders ({ordersLoading ? 'loading...' : `${customerOrders.length} shown`})
              </p>
              {ordersLoading ? (
                <p className="text-xs text-gray-400 text-center py-3">Loading orders...</p>
              ) : customerOrders.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No orders found.</p>
              ) : (
                <div className="space-y-1.5">
                  {customerOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-2 text-[11px] bg-white rounded border border-gray-100 px-2 py-1.5">
                      <span className="font-mono font-bold text-gray-900 w-20 shrink-0">{o.orderNumber || o.outboundId}</span>
                      <span className="text-gray-600 truncate flex-1">{o.productName} ×{o.qty}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${statusBadge(o.status)}`}>
                        {o.status.toUpperCase()}
                      </span>
                      {o.saleAmount != null && o.saleAmount > 0 && (
                        <span className="font-mono text-gray-600 shrink-0">{formatCurrencyCompact(o.saleAmount)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              Every customer gets a fresh risk profile when created. The system grades them over time based on delivery outcomes — COD refusals lower their score, successful deliveries raise it.
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 size={18} className="text-red-600" /> Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {viewing?.name} ({viewing?.customerId}). The risk profile is preserved in case someone re-registers with the same phone. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Upload size={18} /> Import Customers from CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Paste CSV data below. Required: name, contact. Optional: email, address. Each customer gets a fresh risk profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'name,contact,email,address\nJohn Doe,0700123456,john@gmail.com,Kampala\nJane Smith,0700789012,,Entebbe'}
              rows={8}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Customers</AlertDialogTitle>
            <AlertDialogDescription>
              Customers are created automatically when orders are placed. Each gets a risk profile that grades over time based on delivery outcomes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Auto-Creation</p>
              <p>When an order is placed, the system checks if a customer with that phone exists. If not, it creates one with a fresh risk profile (score 0, no history).</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Risk Grading</p>
              <p>Successful COD deliveries increase the customer's score. Refusals and returns lower it. The COD acceptance rate (delivered / total) is visible in each profile.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Customer 360</p>
              <p>Click any customer to see contact details, order history (last 10), risk profile, and lifetime value. Edit from the profile footer.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Blocklist Integration</p>
              <p>If a customer's phone is on the fraud blocklist, a red warning appears here. Orders from blocklisted customers are hard-blocked at intake.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Edit and Delete</p>
              <p>Edit name, phone, email, or address at any time. Changing the phone creates a new risk profile. Only customers with zero orders can be deleted — history is preserved for audit.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">CSV Import</p>
              <p>Import a customer list from another system. Each imported customer gets a fresh risk profile.</p>
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
