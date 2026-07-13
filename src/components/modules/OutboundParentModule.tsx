'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Plus, Search, RefreshCw, Package, Boxes, Truck, CheckCircle2,
  AlertTriangle, ChevronRight, X, Inbox, Upload, Layers, ShieldAlert,
  HelpCircle, ArrowLeft as BackIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import PageTransition from '@/components/shared/PageTransition'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

// Risk score as returned by /api/risk/intake-scores
interface IntakeRiskScore {
  outboundId: string
  score: number
  decision: 'auto_release' | 'spot_check' | 'review' | 'blocked'
  reasons: Array<{ rule: string; points: number; detail: string }>
  scoredAt: string
}

interface Merchant {
  id: string; merchantId: string; businessName: string; deliveryType: string | null
}

interface Product {
  id: string; productId: string; productLabel: string; unitSellingPrice: number; merchantId: string; merchantName: string
}

// ── Lane config ──
// 4 lanes covering the post-intake floor flow.
// 'pending' (NEW) orders live in the Intake Inbox tab, not in these lanes.
const LANES = [
  {
    key: 'pick',
    title: 'TO PICK',
    icon: Package,
    color: 'text-orange-600',
    border: 'border-orange-200',
    statuses: ['released', 'picking'] as string[],
    actions: [
      { status: 'released', label: 'Start Picking', toStatus: 'picking', color: 'bg-orange-500 hover:bg-orange-600' },
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
    key: 'stage',
    title: 'TO STAGE',
    icon: Layers,
    color: 'text-cyan-600',
    border: 'border-cyan-200',
    statuses: ['packed'] as string[],
    actions: [
      { status: 'packed', label: 'Stage at Dock', toStatus: 'staged', color: 'bg-cyan-500 hover:bg-cyan-600' },
    ],
  },
  {
    key: 'dispatch',
    title: 'TO DISPATCH',
    icon: Truck,
    color: 'text-yellow-700',
    border: 'border-yellow-200',
    statuses: ['staged'] as string[],
    actions: [
      { status: 'staged', label: 'Assign Rider', toStatus: null as string | null, color: 'bg-yellow-600 hover:bg-yellow-700' },
    ],
  },
] as const

// ── Risk decision badge (for Intake Inbox display) ──
function riskBadgeClass(decision: string): string {
  switch (decision) {
    case 'auto_release': return 'bg-green-100 text-green-700 border-green-200'
    case 'spot_check':   return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'review':       return 'bg-red-100 text-red-700 border-red-200'
    case 'blocked':      return 'bg-black text-white border-black'
    default:             return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}

function riskLabel(decision: string): string {
  switch (decision) {
    case 'auto_release': return 'PASS'
    case 'spot_check':   return 'SPOT'
    case 'review':       return 'REVIEW'
    case 'blocked':      return 'BLOCKED'
    default:             return 'PENDING'
  }
}

function riskScoreColor(score: number): string {
  if (score >= 70) return 'text-red-600'
  if (score >= 30) return 'text-amber-600'
  return 'text-green-600'
}

interface OutboundParentModuleProps {
  onNavigate?: (module: string) => void
}

export default function OutboundParentModule({ onNavigate }: OutboundParentModuleProps = {}) {
  const [data, setData] = useState<OutboundRecord[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'add'>('list')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<OutboundRecord | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [activeTab, setActiveTab] = useState<'intake' | 'floor'>('intake')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [helpOpen, setHelpOpen] = useState(false)
  // Risk scores for pending orders — fetched from /api/risk/intake-scores
  const [riskScores, setRiskScores] = useState<Map<string, IntakeRiskScore>>(new Map())
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
    // Also fetch risk scores for pending orders (used by Intake Inbox)
    fetch('/api/risk/intake-scores')
      .then(r => r.json())
      .then(d => {
        const map = new Map<string, IntakeRiskScore>()
        for (const s of (d.scores || [])) map.set(s.outboundId, s)
        setRiskScores(map)
      })
      .catch(() => { /* non-blocking — risk is optional */ })
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

  // ── Intake inbox: orders still in 'pending' status, awaiting validation/release ──
  const intakeItems = filteredData.filter(r => r.status === 'pending')

  // ── Lane data ──
  const laneData = LANES.map(lane => ({
    ...lane,
    items: filteredData.filter(r => lane.statuses.includes(r.status)),
  }))

  const floorCount = laneData.reduce((sum, l) => sum + l.items.length, 0)

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

  // ── Bulk release from intake inbox to pick floor ──
  // Blocks orders with 'review' or 'blocked' risk decisions — those need manager override
  // via the Risk module.
  const handleBulkRelease = async () => {
    const toRelease = intakeItems.filter(r => selectedIds.has(r.id))
    if (toRelease.length === 0) {
      toast.error('No orders selected')
      return
    }
    // Check risk decisions for held orders
    const blocked = toRelease.filter(r => {
      const score = riskScores.get(r.id)
      return score && (score.decision === 'review' || score.decision === 'blocked')
    })
    if (blocked.length > 0) {
      toast.error(`${blocked.length} order(s) are held for risk review. Approve them in the Risk module first.`)
      return
    }
    let ok = 0
    for (const r of toRelease) {
      try {
        const res = await fetch('/api/workflow-transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: 'outbound', id: r.id, toStatus: 'released', performedBy: 'admin' }),
        })
        if (res.ok) ok++
      } catch {}
    }
    toast.success(`${ok} order(s) released to the pick floor`)
    setSelectedIds(new Set())
    fetchData()
  }

  // ── Excel upload (UI placeholder — real parser would split rows into OutboundRecord POSTs) ──
  const handleExcelUpload = () => {
    toast.info('Excel bulk upload coming soon. Use "New Order" for manual entry.')
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
        toast.success('Order created. It appears in the Intake Inbox for validation.')
        setView('list')
        setForm({ merchantId: '', productId: '', customerName: '', customerContact: '', customerEmail: '', customerAddress: '', qty: '1', paymentMethod: 'Cash', createdBy: 'admin' })
        setActiveTab('intake')
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

  // ── Generate document (pick list / pack slip / invoice) ──
  // Opens the PDF in a new tab. The API generates the PDF and returns a download URL.
  const handleGenerateDoc = async (docType: 'pick-list' | 'pack-slip' | 'invoice', orderId: string) => {
    try {
      const url = `/api/order-processing/${docType}?ids=${orderId}`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        if (d.filePath || d.downloadUrl) {
          // Open the PDF in a new tab
          const pdfUrl = d.downloadUrl || d.filePath
          window.open(pdfUrl, '_blank')
          toast.success(`${docType === 'pick-list' ? 'Pick list' : docType === 'pack-slip' ? 'Pack slip' : 'Invoice'} generated`)
        } else {
          toast.success(`${docType} generated (check downloads folder)`)
        }
      } else {
        const err = await res.json()
        toast.error(err.error || `Failed to generate ${docType}`)
      }
    } catch {
      toast.error(`Failed to generate ${docType}`)
    }
  }

  const filteredProducts = form.merchantId
    ? products.filter(p => p.merchantId === form.merchantId)
    : products

  // All-select toggle for intake
  const allIntakeSelected = intakeItems.length > 0 && selectedIds.size === intakeItems.length
  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(intakeItems.map(r => r.id)))
    else setSelectedIds(new Set())
  }

  // ── Render: New Order (full-page) ──
  if (view === 'add') {
    return (
      <AnimatePresence mode="wait">
        <PageTransition key="add">
          <div className="min-h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-gray-600" onClick={() => setView('list')}>
                  <BackIcon size={14} className="mr-1" /> Back
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-base font-bold text-gray-900">New Order</h1>
                  <p className="text-[11px] text-gray-500">Creates an order in the Intake Inbox for validation before release</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-1">Order Details</h2>
                  <p className="text-xs text-gray-500">Select merchant and product, then enter customer and payment information. The order enters the Intake Inbox for risk validation before release.</p>
                </div>
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
            </div>
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
              <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setView('list')}>Cancel</Button>
                <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSubmit}>Create Order</Button>
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
          {/* Header */}
          <OpsHeader
            title="Outbound"
            description="Intake → Pick → Pack → Stage → Dispatch"
            kpiCells={[
              { label: 'INTAKE', value: intakeItems.length, highlight: intakeItems.length > 0, highlightColor: 'orange' as const },
              { label: 'TO PICK', value: laneData[0].items.length, highlight: laneData[0].items.length > 0, highlightColor: 'orange' as const },
              { label: 'TO PACK', value: laneData[1].items.length, highlight: laneData[1].items.length > 0, highlightColor: 'orange' as const },
              { label: 'TO STAGE', value: laneData[2].items.length, highlight: laneData[2].items.length > 0, highlightColor: 'orange' as const },
              { label: 'TO DISPATCH', value: laneData[3].items.length, highlight: laneData[3].items.length > 0, highlightColor: 'orange' as const },
              { label: 'DELIVERED', value: completedItems.filter(r => r.status === 'delivered').length },
            ]}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by order, customer, or product..."
          />

          {/* Action bar (below KPI, left-aligned) */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={() => setView('add')}>
              <Plus size={12} className="mr-1" /> New Order
            </Button>
          </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('intake')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'intake' ? 'border-[#FF6B35] text-[#FF6B35]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Inbox size={12} />
          Intake Inbox
          {intakeItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-mono font-bold">
              {intakeItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('floor')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'floor' ? 'border-[#FF6B35] text-[#FF6B35]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package size={12} />
          Fulfillment Floor
          {floorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-mono font-bold">
              {floorCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setHelpOpen(true)}
          className="ml-auto px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <HelpCircle size={12} />
          How does this work?
        </button>
      </div>

      {/* ── INTAKE INBOX TAB ── */}
      {activeTab === 'intake' && !loading && (
        <div className="space-y-2">
          {/* Intake toolbar */}
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allIntakeSelected}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs text-gray-600 font-medium">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${intakeItems.length} order(s) awaiting release`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs h-7"
                onClick={handleExcelUpload}
              >
                <Upload size={12} className="mr-1.5" />
                Upload Excel
              </Button>
              <Button
                size="sm"
                className="rounded-xl text-xs h-7 bg-[#FF6B35] hover:bg-[#E55A25] text-white"
                disabled={selectedIds.size === 0}
                onClick={handleBulkRelease}
              >
                <CheckCircle2 size={12} className="mr-1.5" />
                Release Selected ({selectedIds.size})
              </Button>
            </div>
          </div>

          {/* Intake table */}
          {intakeItems.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <Inbox size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">Inbox is clear</p>
              <p className="text-xs text-gray-400 mt-0.5">New orders from your store, app, or Excel upload will appear here for validation.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-2 py-2 font-semibold w-8"></th>
                      <th className="text-left px-3 py-2 font-semibold">Order</th>
                      <th className="text-left px-3 py-2 font-semibold">Customer</th>
                      <th className="text-left px-3 py-2 font-semibold">Product</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-center px-3 py-2 font-semibold">Risk Score</th>
                      <th className="text-center px-3 py-2 font-semibold">Decision</th>
                      <th className="text-right px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intakeItems.map(item => {
                      const score = riskScores.get(item.id)
                      const isHeld = score && (score.decision === 'review' || score.decision === 'blocked')
                      const selected = selectedIds.has(item.id)
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${selected ? 'bg-orange-50' : ''} ${isHeld ? 'bg-red-50/40' : ''}`}
                          onClick={() => openDetail(item)}
                        >
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const next = new Set(selectedIds)
                                if (e.target.checked) next.add(item.id)
                                else next.delete(item.id)
                                setSelectedIds(next)
                              }}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-mono font-bold text-gray-900 text-xs">{item.orderNumber || item.outboundId}</div>
                            <div className="text-[9px] text-gray-400">
                              {new Date(item.createdAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-gray-900 font-medium truncate max-w-[120px]">{item.customerName}</div>
                            <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{item.customerContact}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-gray-700 truncate max-w-[150px]">{item.productName}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{item.qty}</td>
                          <td className="px-3 py-2 text-right">
                            {item.saleAmount != null && item.saleAmount > 0 && (
                              <span className="font-mono text-[11px] font-semibold text-gray-700">{formatCurrencyCompact(item.saleAmount)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {score ? (
                              <span className={`font-mono text-sm font-bold ${riskScoreColor(score.score)}`}>
                                {score.score}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">scoring…</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {score ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${riskBadgeClass(score.decision)}`}>
                                {riskLabel(score.decision)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            {isHeld ? (
                              <span className="text-[10px] text-red-600 font-semibold inline-flex items-center gap-1">
                                <ShieldAlert size={10} /> Held
                              </span>
                            ) : (
                              <button
                                onClick={() => handleTransition(item, 'released')}
                                className="text-[10px] text-[#FF6B35] hover:text-[#E55A25] font-semibold"
                              >
                                Release →
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Validation legend */}
          <div className="flex items-center gap-4 text-[10px] text-gray-500 px-2 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded bg-green-500" /> Pass (0–29)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded bg-amber-500" /> Spot-check (30–69)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded bg-red-500" /> Review (70–99)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded bg-black" /> Blocked (100)
            </span>
            <span className="ml-auto">Held orders require manager approval in the Risk module</span>
          </div>
        </div>
      )}

      {/* ── FULFILLMENT FLOOR TAB ── */}
      {activeTab === 'floor' && !loading && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {laneData.map(lane => {
              const Icon = lane.icon
              return (
                <div key={lane.key} className={`rounded-lg border ${lane.border} overflow-hidden flex flex-col`}>
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
                    <div className="bg-white max-h-[55vh] overflow-y-auto flex-1">
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
                                    onNavigate?.('runsheets')
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
                                    onClick={(e) => { e.stopPropagation(); handleTransition(item, 'failed') }}
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
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
        </div>
      )}

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
              <div className="flex gap-2 flex-wrap">
                {selectedRecord.status === 'pending' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'released'); setDetailOpen(false) }}>
                    Release to Floor
                  </Button>
                )}
                {selectedRecord.status === 'released' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'picking'); setDetailOpen(false) }}>
                    Start Picking
                  </Button>
                )}
                {selectedRecord.status === 'picking' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'picked'); setDetailOpen(false) }}>
                    Mark Picked
                  </Button>
                )}
                {selectedRecord.status === 'picked' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'packing'); setDetailOpen(false) }}>
                    Start Packing
                  </Button>
                )}
                {selectedRecord.status === 'packing' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'packed'); setDetailOpen(false) }}>
                    Mark Packed
                  </Button>
                )}
                {selectedRecord.status === 'packed' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { handleTransition(selectedRecord, 'staged'); setDetailOpen(false) }}>
                    Stage at Dock
                  </Button>
                )}
                {selectedRecord.status === 'staged' && (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setDetailOpen(false); onNavigate?.('runsheets') }}>
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
              <div className="flex gap-2 flex-wrap">
                {/* Document generation buttons — visible once order is past intake */}
                {['released', 'picking', 'picked', 'packing', 'packed', 'staged', 'dispatched', 'delivered'].includes(selectedRecord.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-[10px] h-7"
                    onClick={() => handleGenerateDoc('pick-list', selectedRecord.id)}
                  >
                    Pick List
                  </Button>
                )}
                {['picked', 'packing', 'packed', 'staged', 'dispatched', 'delivered'].includes(selectedRecord.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-[10px] h-7"
                    onClick={() => handleGenerateDoc('pack-slip', selectedRecord.id)}
                  >
                    Pack Slip
                  </Button>
                )}
                {['packed', 'staged', 'dispatched', 'delivered'].includes(selectedRecord.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-[10px] h-7"
                    onClick={() => handleGenerateDoc('invoice', selectedRecord.id)}
                  >
                    Invoice
                  </Button>
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
                selectedRecord.status === 'staged' ? 'bg-cyan-100 text-cyan-700' :
                selectedRecord.status === 'packed' ? 'bg-indigo-100 text-indigo-700' :
                selectedRecord.status === 'packing' ? 'bg-purple-100 text-purple-700' :
                selectedRecord.status === 'picked' ? 'bg-blue-100 text-blue-700' :
                selectedRecord.status === 'picking' ? 'bg-orange-100 text-orange-700' :
                selectedRecord.status === 'released' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {selectedRecord.status.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-400 ml-auto">
                {new Date(selectedRecord.createdAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {/* Risk score (only for pending/intake orders) */}
            {selectedRecord.status === 'pending' && (() => {
              const score = riskScores.get(selectedRecord.id)
              if (!score) return null
              return (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Risk Assessment</p>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${riskBadgeClass(score.decision)}`}>
                      {riskLabel(score.decision)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-2xl font-mono font-bold ${riskScoreColor(score.score)}`}>
                      {score.score}
                    </span>
                    <span className="text-[10px] text-gray-500">/ 100</span>
                  </div>
                  {score.reasons.length > 0 && (
                    <div className="space-y-1.5">
                      {score.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <span className="font-mono font-bold text-red-600 shrink-0 w-8">+{r.points}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900">{r.rule}</div>
                            <div className="text-gray-600">{r.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

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

      {/* ── Help Dialog ── */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Outbound Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Outbound module is where every order lives from the moment it enters your system to the moment it is ready for dispatch. It has two tabs: validating incoming orders and doing the warehouse work. When orders are staged and ready for a rider, you switch to the Runsheets module (its own entry in the sidebar, right below Outbound) to assign drivers and track deliveries. Here is how to use each part.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            {/* What this is */}
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> Every order your business receives — from your online store, your mobile app, an Excel upload, or manual entry — lands here. The Outbound module validates each order for fraud risk, guides it through picking and packing, stages it at the dock, and hands it off to a rider with a runsheet. You do the actual work here; the Operations Desk is for watching the whole warehouse, but this is where orders get fulfilled.
              </p>
            </div>

            {/* The 2 tabs + Runsheets module */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">The Two Tabs + Runsheets Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs text-orange-900 leading-relaxed">
                    <strong>1. Intake Inbox.</strong> This is where new orders land first. Every order appears here with a fraud risk score (0–100) and a decision badge: PASS (green, auto-release), SPOT (amber, release but spot-check later), REVIEW (red, held for manager approval), or BLOCKED (black, hard block from blocklist). Select multiple orders and click "Release Selected" to move them to the Fulfillment Floor. Orders with REVIEW or BLOCKED decisions cannot be released here — a manager must approve or reject them in the Risk &amp; Fraud module first.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>2. Fulfillment Floor.</strong> This shows four lanes that orders move through: TO PICK (released, waiting for a picker → picking → picked), TO PACK (picked → packing → packed), TO STAGE (packed → staged at the dock), and TO DISPATCH (staged, waiting for a rider). Click any order to see its details. Each lane has an action button that advances the order to the next stage. When an order reaches TO DISPATCH, the button says "Assign Rider" and takes you to the Runsheets module.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-100">
                  <p className="text-xs text-yellow-900 leading-relaxed">
                    <strong>3. Runsheets module (separate sidebar entry, right below Outbound).</strong> This is where you assign riders to staged orders and track deliveries. Create a runsheet by selecting staged orders, choosing a rider, and assigning a vehicle number. You can scan order barcodes to add them quickly. Once a runsheet is created, the rider takes their list and leaves. When they return, you mark each stop as delivered (with COD amount collected) or failed (with a reason and reschedule date). Failed stops track attempt counts automatically — after 5 attempts, the order is permanently failed.
                  </p>
                </div>
              </div>
            </div>

            {/* How to use */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 1 — Create orders.</strong> Click "New Order" at the top right. Select a merchant, then a product, fill in the customer's name, phone number, and address, set the quantity and payment method. The order is created in "pending" status and appears in the Intake Inbox with a risk score within seconds.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 2 — Validate and release.</strong> Open the Intake Inbox tab. Review the risk scores. Select the orders that passed (PASS or SPOT) and click "Release Selected". They move to the Fulfillment Floor as "released" and are ready for picking. Orders held for review must be approved in the Risk &amp; Fraud module first.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 3 — Pick, pack, stage.</strong> Open the Fulfillment Floor tab. Work through the four lanes left to right. A picker clicks "Start Picking" on a released order, collects the items, then clicks "Mark Picked". A packer clicks "Start Packing", boxes the order, then clicks "Mark Packed". Dock crew clicks "Stage at Dock" to move it to the dispatch lane.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 4 — Assign riders.</strong> When orders are staged, click "Assign Rider" to switch to the Runsheets tab. Create a runsheet, select the staged orders, choose a rider, and save. The rider now has their delivery list.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 5 — Track deliveries.</strong> In the Runsheets tab, open the active runsheet. As the rider delivers, mark each stop as "Delivered" (enter the COD amount collected) or "Failed" (enter a reason and reschedule date). The runsheet summary at the top shows progress: how many delivered, failed, pending, and the total COD collected.
                  </p>
                </div>
              </div>
            </div>

            {/* The differentiator */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most ERP systems treat order intake, warehouse fulfillment, and dispatch as three separate modules with no shared visibility. An order created in one screen disappears until someone manually checks another screen. This module puts the entire order lifecycle in one place — you see the fraud score at intake, the pick/pack progress on the floor, and the rider assignment in runsheets, all without leaving the tab. The risk score travels with the order, so a manager never has to wonder "should we have shipped this?"
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </div>
      </PageTransition>
    </AnimatePresence>
  )
}
