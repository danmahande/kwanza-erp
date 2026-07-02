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
import { Trash2, Settings as SettingsIcon, FileText, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'

interface Merchant {
  id: string
  merchantId: string
  businessName: string
  contact: string
  email: string
  deliveryType: string | null
  currency: string
  isActive: boolean
  createdAt: string
  taxId: string | null
  address: string | null
  bankName: string | null
  bankAccount: string | null
  contactPerson: string | null
  altPhone: string | null
  contractStart: string | null
  contractEnd: string | null
  notes: string | null
  totalInboundValue: number
  totalSalesValue: number
  totalShrinkageValue: number
  totalReturnValue: number
  expectedPayment: number
  actualPayment: number
  pendingPayment: number
  storageLiabilityBalance: number
  productCount: number
  orderCount: number
  lastInboundAt: string | null
  lastOutboundAt: string | null
  lastPaymentAt: string | null
  profitability: { revenue: number; commission: number; shrinkage: number; returns: number; net: number }
  statements: Array<{
    id: string; statementId: string; period: string; netPayable: number
    isPaid: boolean; status: string; createdAt: string
  }>
}

interface RateCard {
  id: string
  merchantId: string
  inboundReceivingPerUnit: number
  storagePerUnitPerDay: number
  pickPerUnit: number
  packPerOrder: number
  returnProcessingPerUnit: number
  commissionPercent: number
  codRemittanceFeePerOrder: number
  codShortfallPenalty: number
  isActive: boolean
  validFrom: string
  validTo: string | null
}

const FILTER_CHIPS = [
  { key: 'all', label: 'All', deliveryType: '', status: '' },
  { key: 'active', label: 'Active', deliveryType: '', status: 'active' },
  { key: 'inactive', label: 'Inactive', deliveryType: '', status: 'inactive' },
  { key: 'self-delivery', label: 'Self-Delivery', deliveryType: 'self-delivery', status: '' },
  { key: 'drop-ship', label: 'Drop-Ship', deliveryType: 'drop-ship', status: '' },
  { key: 'consignment', label: 'Consignment', deliveryType: 'consignment', status: '' },
]

export default function MerchantsModule() {
  const [data, setData] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [rateCardOpen, setRateCardOpen] = useState(false)
  const [statementOpen, setStatementOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Merchant | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [rateCard, setRateCard] = useState<RateCard | null>(null)
  const [rateCardHistory, setRateCardHistory] = useState<RateCard[]>([])
  const [statementPeriod, setStatementPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [form, setForm] = useState({
    businessName: '', contact: '', email: '', deliveryType: 'self-delivery',
    taxId: '', address: '', bankName: '', bankAccount: '', contactPerson: '',
    altPhone: '', contractStart: '', contractEnd: '', notes: '',
  })

  const [rateForm, setRateForm] = useState({
    inboundReceivingPerUnit: 0, storagePerUnitPerDay: 0, pickPerUnit: 0,
    packPerOrder: 0, returnProcessingPerUnit: 0, commissionPercent: 0,
    codRemittanceFeePerOrder: 0, codShortfallPenalty: 0,
  })

  const fetchData = () => {
    const chip = FILTER_CHIPS.find(c => c.key === activeFilter) || FILTER_CHIPS[0]
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (chip.deliveryType) params.set('deliveryType', chip.deliveryType)
    if (chip.status) params.set('status', chip.status)
    fetch(`/api/merchants?${params.toString()}`).then(r => r.json()).then(d => setData(Array.isArray(d) ? d : []))
  }

  useEffect(() => { fetchData() }, [search, activeFilter])

  const totalMerchants = data.length
  const activeMerchants = data.filter(m => m.isActive).length
  const totalPending = data.reduce((s, m) => s + (m.pendingPayment || 0), 0)
  const totalStorage = data.reduce((s, m) => s + (m.storageLiabilityBalance || 0), 0)

  const kpiCells = [
    { label: 'MERCHANTS', value: totalMerchants },
    { label: 'ACTIVE', value: activeMerchants },
    { label: 'PENDING PAYMENTS', value: formatCurrencyCompact(totalPending), highlight: totalPending > 0, highlightColor: 'orange' as const },
    { label: 'STORAGE LIABILITY', value: formatCurrencyCompact(totalStorage) },
    { label: 'TOTAL SALES', value: formatCurrencyCompact(data.reduce((s, m) => s + (m.totalSalesValue || 0), 0)) },
  ]

  const handleSubmit = async () => {
    if (!form.businessName || !form.contact || !form.email) {
      toast.error('Business name, contact, and email are required')
      return
    }
    const payload = {
      ...form,
      contractStart: form.contractStart || null,
      contractEnd: form.contractEnd || null,
      isActive: editing ? editing.isActive : true,
    }
    if (editing) {
      await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
      toast.success('Merchant updated')
    } else {
      await fetch('/api/merchants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, createdBy: 'admin' }) })
      toast.success('Merchant created')
    }
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery', taxId: '', address: '', bankName: '', bankAccount: '', contactPerson: '', altPhone: '', contractStart: '', contractEnd: '', notes: '' })
    fetchData()
  }

  const handleToggleActive = async (m: Merchant) => {
    await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, isActive: !m.isActive }) })
    toast.success(`${m.businessName} ${m.isActive ? 'deactivated' : 'activated'}`)
    fetchData()
  }

  const handleEdit = (item: Merchant) => {
    setEditing(item)
    setForm({
      businessName: item.businessName, contact: item.contact, email: item.email,
      deliveryType: item.deliveryType || 'self-delivery',
      taxId: item.taxId || '', address: item.address || '', bankName: item.bankName || '',
      bankAccount: item.bankAccount || '', contactPerson: item.contactPerson || '',
      altPhone: item.altPhone || '',
      contractStart: item.contractStart ? item.contractStart.slice(0, 10) : '',
      contractEnd: item.contractEnd ? item.contractEnd.slice(0, 10) : '',
      notes: item.notes || '',
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/merchants?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Merchant deleted')
      setDeleteOpen(false); setDeletingId(null); fetchData()
    }
  }

  const handleOpenRateCard = async (merchant: Merchant) => {
    setSelectedMerchant(merchant)
    try {
      const res = await fetch(`/api/rate-card?merchantId=${merchant.merchantId}`)
      const cards = await res.json()
      if (Array.isArray(cards) && cards.length > 0) {
        const active = cards.find((c: RateCard) => c.isActive) || cards[0]
        setRateCard(active)
        setRateCardHistory(cards)
        setRateForm({
          inboundReceivingPerUnit: active.inboundReceivingPerUnit, storagePerUnitPerDay: active.storagePerUnitPerDay,
          pickPerUnit: active.pickPerUnit, packPerOrder: active.packPerOrder,
          returnProcessingPerUnit: active.returnProcessingPerUnit, commissionPercent: active.commissionPercent,
          codRemittanceFeePerOrder: active.codRemittanceFeePerOrder, codShortfallPenalty: active.codShortfallPenalty,
        })
      } else {
        setRateCard(null)
        setRateCardHistory([])
        setRateForm({ inboundReceivingPerUnit: 0, storagePerUnitPerDay: 0, pickPerUnit: 0, packPerOrder: 0, returnProcessingPerUnit: 0, commissionPercent: 0, codRemittanceFeePerOrder: 0, codShortfallPenalty: 0 })
      }
      setRateCardOpen(true)
    } catch { toast.error('Failed to load rate card') }
  }

  const handleSaveRateCard = async () => {
    if (!selectedMerchant) return
    const method = rateCard ? 'PUT' : 'POST'
    const body = rateCard ? { id: rateCard.id, ...rateForm } : { merchantId: selectedMerchant.merchantId, ...rateForm }
    await fetch('/api/rate-card', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    toast.success('Rate card saved'); setRateCardOpen(false)
  }

  const handleOpenStatement = (merchant: Merchant) => {
    setSelectedMerchant(merchant); setStatementPeriod(new Date().toISOString().slice(0, 7)); setStatementOpen(true)
  }

  const handleGenerateStatement = async () => {
    if (!selectedMerchant) return
    try {
      const res = await fetch('/api/merchant-statements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: selectedMerchant.merchantId, period: statementPeriod, generatedBy: 'admin' }) })
      const result = await res.json()
      if (res.ok) { toast.success(`Statement generated. Net payable: ${formatCurrency(result.netPayable)}`); setStatementOpen(false); fetchData() }
      else { toast.error(result.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const deliveryCode = (dt: string | null) => dt === 'drop-ship' ? 'DS' : dt === 'consignment' ? 'CN' : 'SD'

  const timeAgo = (date: string | null) => {
    if (!date) return '—'
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Merchants"
        description="Vendor partners and their cumulative financial position"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, ID, contact, or email..."
        actionLabel="Add Merchant"
        onAction={() => { setEditing(null); setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery', taxId: '', address: '', bankName: '', bankAccount: '', contactPerson: '', altPhone: '', contractStart: '', contractEnd: '', notes: '' }); setOpen(true) }}
      />

      {/* Filter chips (#6, #7) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(m => {
            if (chip.status === 'active') return m.isActive
            if (chip.status === 'inactive') return !m.isActive
            if (chip.deliveryType) return m.deliveryType === chip.deliveryType
            return true
          }).length
          // Note: the count here is approximate (from already-filtered data). For exact counts
          // we'd need a separate API call. This is good enough for a visual indicator.
          const isActive = activeFilter === chip.key
          return (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-[#FF6B35] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Dense table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No merchants found.</div>
      ) : (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">ID</DenseTh>
              <DenseTh>Business Name</DenseTh>
              <DenseTh className="w-16">Type</DenseTh>
              <DenseTh className="w-16 text-right">SKUs</DenseTh>
              <DenseTh className="w-16 text-right">Orders</DenseTh>
              <DenseTh className="w-28 text-right">Sales</DenseTh>
              <DenseTh className="w-28 text-right">Pending <InfoTip term="pendingPayment" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Storage <InfoTip term="storageLiability" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Shrinkage</DenseTh>
              <DenseTh className="w-16 text-center">Status</DenseTh>
              <DenseTh className="w-28 text-right">Actions</DenseTh>
              <DenseTh className="w-8"></DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => {
              const isExpanded = expandedId === m.id
              return (
                <>
                  <DenseTr key={m.id} onClick={() => setExpandedId(isExpanded ? null : m.id)} tint={m.isActive ? '' : 'bg-gray-50/50'}>
                    <DenseTd mono className="text-gray-500">{m.merchantId}</DenseTd>
                    <DenseTd className="text-gray-900 font-medium">{m.businessName}</DenseTd>
                    <DenseTd mono className="text-gray-600">{deliveryCode(m.deliveryType)}</DenseTd>
                    <DenseTd mono right className={m.productCount > 0 ? 'text-gray-700' : 'text-gray-300'}>{m.productCount}</DenseTd>
                    <DenseTd mono right className={m.orderCount > 0 ? 'text-gray-700' : 'text-gray-300'}>{m.orderCount}</DenseTd>
                    <DenseTd mono right className="text-gray-700">{formatCurrencyCompact(m.totalSalesValue, m.currency)}</DenseTd>
                    <DenseTd mono right className={m.pendingPayment > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}>{formatCurrencyCompact(m.pendingPayment, m.currency)}</DenseTd>
                    <DenseTd mono right className={m.storageLiabilityBalance > 0 ? 'text-blue-700' : 'text-gray-400'}>{formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}</DenseTd>
                    <DenseTd mono right className={m.totalShrinkageValue > 0 ? 'text-red-600' : 'text-gray-400'}>{formatCurrencyCompact(m.totalShrinkageValue, m.currency)}</DenseTd>
                    <DenseTd className="text-center">
                      <button onClick={(e) => { e.stopPropagation(); handleToggleActive(m) }} title={m.isActive ? 'Click to deactivate' : 'Click to activate'}>
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 hover:bg-gray-400'}`} />
                      </button>
                    </DenseTd>
                    <DenseTd right>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleOpenRateCard(m)} title="Rate card" className="p-1 text-gray-400 hover:text-[#FF6B35]"><SettingsIcon size={12} /></button>
                        <button onClick={() => handleOpenStatement(m)} title="Statement" className="p-1 text-gray-400 hover:text-[#FF6B35]"><FileText size={12} /></button>
                      </div>
                    </DenseTd>
                    <DenseTd className="text-gray-400">{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</DenseTd>
                  </DenseTr>
                  {isExpanded && (
                    <tr key={`${m.id}-detail`} className="bg-white border-b border-gray-200">
                      <td colSpan={12} className="px-6 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Contact</p>
                            <p className="text-gray-900">{m.contact}</p>
                            <p className="text-gray-500">{m.email}</p>
                            {m.contactPerson && <p className="text-gray-500 mt-1">Attn: {m.contactPerson}</p>}
                            {m.altPhone && <p className="text-gray-500">{m.altPhone}</p>}
                            {m.address && <p className="text-gray-500 mt-1">{m.address}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Business</p>
                            {m.taxId && <p className="text-gray-700">TIN: {m.taxId}</p>}
                            <p className="text-gray-700 capitalize">Type: {(m.deliveryType || 'self-delivery').replace('-', ' ')}</p>
                            <p className="text-gray-500">{m.currency}</p>
                            {m.bankName && <p className="text-gray-500 mt-1">{m.bankName}</p>}
                            {m.bankAccount && <p className="text-gray-500 font-mono">{m.bankAccount}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Activity</p>
                            <p className="text-gray-500">Last inbound: {timeAgo(m.lastInboundAt)}</p>
                            <p className="text-gray-500">Last outbound: {timeAgo(m.lastOutboundAt)}</p>
                            <p className="text-gray-500">Last payment: {timeAgo(m.lastPaymentAt)}</p>
                            {m.contractEnd && (
                              <p className={`mt-1 ${new Date(m.contractEnd) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                Contract ends: {new Date(m.contractEnd).toLocaleDateString('en-UG')}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Financials</p>
                            <p className="text-gray-700">Inbound: <span className="font-mono">{formatCurrency(m.totalInboundValue, m.currency)}</span></p>
                            <p className="text-gray-700">Returns: <span className="font-mono">{formatCurrency(m.totalReturnValue, m.currency)}</span></p>
                            <p className="text-gray-700">Expected: <span className="font-mono">{formatCurrency(m.expectedPayment, m.currency)}</span></p>
                            <p className="text-gray-700">Actual: <span className="font-mono text-green-700">{formatCurrency(m.actualPayment, m.currency)}</span></p>
                            {m.notes && <p className="text-gray-400 italic mt-1">"{m.notes}"</p>}
                            <div className="mt-2 flex gap-1 flex-wrap">
                              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleEdit(m)}>Edit</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleToggleActive(m)}>{m.isActive ? 'Deactivate' : 'Activate'}</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleOpenRateCard(m)}>Rate Card</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleOpenStatement(m)}>Statement</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setDeletingId(m.id); setDeleteOpen(true) }}>Delete</Button>
                            </div>
                          </div>
                        </div>

                        {/* #2: Profitability section */}
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Profitability</p>
                          <div className="grid grid-cols-5 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-green-50">
                              <p className="text-[9px] text-gray-400 uppercase">Revenue</p>
                              <p className="font-mono font-bold text-green-700">{formatCurrencyCompact(m.profitability.revenue, m.currency)}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-orange-50">
                              <p className="text-[9px] text-gray-400 uppercase">Commission</p>
                              <p className="font-mono font-bold text-orange-700">-{formatCurrencyCompact(m.profitability.commission, m.currency)}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-red-50">
                              <p className="text-[9px] text-gray-400 uppercase">Shrinkage</p>
                              <p className="font-mono font-bold text-red-700">-{formatCurrencyCompact(m.profitability.shrinkage, m.currency)}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-red-50">
                              <p className="text-[9px] text-gray-400 uppercase">Returns</p>
                              <p className="font-mono font-bold text-red-700">-{formatCurrencyCompact(m.profitability.returns, m.currency)}</p>
                            </div>
                            <div className={`p-2 rounded-lg ${m.profitability.net >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                              <p className="text-[9px] text-gray-400 uppercase">Net</p>
                              <p className={`font-mono font-bold ${m.profitability.net >= 0 ? 'text-green-800' : 'text-red-800'}`}>{formatCurrencyCompact(m.profitability.net, m.currency)}</p>
                            </div>
                          </div>
                        </div>

                        {/* #4: Recent statements */}
                        {m.statements && m.statements.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Recent Statements</p>
                            <div className="space-y-1">
                              {m.statements.map((s) => (
                                <div key={s.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-50">
                                  <span className="font-mono text-gray-500">{s.period}</span>
                                  <span className="font-mono font-bold text-gray-900">{formatCurrency(s.netPayable, m.currency)}</span>
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                    s.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                  }`}>{s.isPaid ? 'PAID' : s.status.toUpperCase()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Edit / Create slide-over with onboarding fields */}
      <DetailSlideOver
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery', taxId: '', address: '', bankName: '', bankAccount: '', contactPerson: '', altPhone: '', contractStart: '', contractEnd: '', notes: '' }) }}
        title={editing ? editing.businessName : 'New Merchant'}
        subtitle={editing ? `ID: ${editing.merchantId}` : 'Fill in the details to create a new merchant'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl" onClick={() => { setDeletingId(editing.id); setDeleteOpen(true) }}><Trash2 size={16} className="mr-2" /> Delete</Button>}
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleSubmit} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">{editing ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Basic info */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Basic Information</p>
            <div><Label className="text-xs font-medium mb-1 block">Business Name <span className="text-red-400">*</span></Label><Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-medium mb-1 block">Contact (Phone) <span className="text-red-400">*</span></Label><Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} className="rounded-xl" /></div>
              <div><Label className="text-xs font-medium mb-1 block">Alt Phone</Label><Input value={form.altPhone} onChange={e => setForm({ ...form, altPhone: e.target.value })} className="rounded-xl" /></div>
            </div>
            <div><Label className="text-xs font-medium mb-1 block">Email <span className="text-red-400">*</span></Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="rounded-xl" /></div>
            <div><Label className="text-xs font-medium mb-1 block">Contact Person</Label><Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Person responsible for this account" className="rounded-xl" /></div>
            <div><Label className="text-xs font-medium mb-1 block">Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Physical address" className="rounded-xl" /></div>
          </div>

          {/* Business details */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Business Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-medium mb-1 block">Tax ID (TIN)</Label><Input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="TIN number" className="rounded-xl" /></div>
              <div>
                <Label className="text-xs font-medium mb-1 block flex items-center">Delivery Type <InfoTip term="deliveryType" size={13} className="ml-1" /></Label>
                <select value={form.deliveryType} onChange={e => setForm({ ...form, deliveryType: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <option value="self-delivery">Self-Delivery</option>
                  <option value="drop-ship">Drop-Ship</option>
                  <option value="consignment">Consignment</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-medium mb-1 block">Contract Start</Label><Input type="date" value={form.contractStart} onChange={e => setForm({ ...form, contractStart: e.target.value })} className="rounded-xl" /></div>
              <div><Label className="text-xs font-medium mb-1 block">Contract End</Label><Input type="date" value={form.contractEnd} onChange={e => setForm({ ...form, contractEnd: e.target.value })} className="rounded-xl" /></div>
            </div>
          </div>

          {/* Banking */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Banking (for payouts)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-medium mb-1 block">Bank Name</Label><Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Stanbic" className="rounded-xl" /></div>
              <div><Label className="text-xs font-medium mb-1 block">Account Number</Label><Input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="Account number" className="rounded-xl" /></div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Notes</p>
            <div><Label className="text-xs font-medium mb-1 block">Internal Notes</Label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this merchant..." rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Rate card slide-over (unchanged) */}
      <DetailSlideOver open={rateCardOpen} onClose={() => setRateCardOpen(false)} title={`Rate Card — ${selectedMerchant?.businessName || ''}`} subtitle={rateCard ? `Valid from ${new Date(rateCard.validFrom).toLocaleDateString()}` : 'Creating new rate card'} width="lg"
        footer={<div className="flex gap-3 ml-auto"><Button variant="outline" onClick={() => setRateCardOpen(false)} className="rounded-xl">Cancel</Button><Button onClick={handleSaveRateCard} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          {[{ k: 'inboundReceivingPerUnit', l: 'Inbound Receiving (UGX/unit)' }, { k: 'storagePerUnitPerDay', l: 'Storage (UGX/unit/day)' }, { k: 'pickPerUnit', l: 'Pick (UGX/unit)' }, { k: 'packPerOrder', l: 'Pack (UGX/order)' }, { k: 'returnProcessingPerUnit', l: 'Return (UGX/unit)' }, { k: 'commissionPercent', l: 'Commission (%)' }, { k: 'codRemittanceFeePerOrder', l: 'COD Fee (UGX/order)' }, { k: 'codShortfallPenalty', l: 'COD Shortfall Penalty (UGX)' }].map(f => (
            <div key={f.k}><Label className="text-xs font-medium mb-1 block">{f.l}</Label><Input type="number" value={String(rateForm[f.k as keyof typeof rateForm])} onChange={e => setRateForm({ ...rateForm, [f.k]: parseFloat(e.target.value) || 0 })} className="rounded-xl" /></div>
          ))}
        </div>

        {/* #3: Rate card history */}
        {rateCardHistory.length > 1 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Rate Card History</p>
            <div className="space-y-1">
              {rateCardHistory.map((rc, i) => (
                <div key={rc.id || i} className={`flex items-center gap-2 text-[11px] py-1 px-2 rounded ${rc.isActive ? 'bg-orange-50 border border-orange-100' : ''}`}>
                  <span className={`w-2 h-2 rounded-full ${rc.isActive ? 'bg-orange-500' : 'bg-gray-300'}`} />
                  <span className="font-mono text-gray-500">{new Date(rc.validFrom).toLocaleDateString('en-UG')}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono text-gray-500">{rc.validTo ? new Date(rc.validTo).toLocaleDateString('en-UG') : 'Current'}</span>
                  <span className="text-gray-400 ml-auto">
                    Storage: {rc.storagePerUnitPerDay} | Pick: {rc.pickPerUnit} | Comm: {rc.commissionPercent}%
                  </span>
                  {rc.isActive && <span className="text-[9px] font-semibold text-orange-600 uppercase">Active</span>}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Saving changes creates a new rate card and supersedes the previous one. Historical cards are kept for audit.</p>
          </div>
        )}
      </DetailSlideOver>

      {/* Statement dialog (unchanged) */}
      <AlertDialog open={statementOpen} onOpenChange={setStatementOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><FileText size={18} /> Generate Statement — {selectedMerchant?.businessName}</AlertDialogTitle><AlertDialogDescription>Generates a monthly statement with all fees, sales, COD, and shrinkage.</AlertDialogDescription></AlertDialogHeader>
          <div className="py-3"><Label className="text-sm font-medium mb-1.5 block">Period (YYYY-MM)</Label><Input type="month" value={statementPeriod} onChange={e => setStatementPeriod(e.target.value)} className="rounded-xl" /></div>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleGenerateStatement} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Generate</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader><AlertDialogTitle>Delete Merchant</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 rounded-xl">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
