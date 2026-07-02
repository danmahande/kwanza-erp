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
import { Trash2, Settings as SettingsIcon, FileText, Filter, ChevronDown, ChevronRight, Upload, Clock, ArrowDownRight, ArrowUpRight, DollarSign, AlertTriangle, RotateCcw, PackageX, Calendar, CheckCircle2, Phone, Building2 } from 'lucide-react'
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
  const [profileOpen, setProfileOpen] = useState(false)
  const [activityData, setActivityData] = useState<Array<Record<string, unknown>>>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

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

  // Open profile slide-over when a merchant row is clicked
  const handleExpand = async (merchant: Merchant) => {
    setSelectedMerchant(merchant)
    setProfileOpen(true)
    setActivityLoading(true)
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/activity?limit=15`)
      const d = await res.json()
      setActivityData(d.timeline || [])
    } catch {
      setActivityData([])
    } finally {
      setActivityLoading(false)
    }
  }

  // #17: CSV import — parse and bulk create
  const handleImport = async () => {
    if (!importText.trim()) { toast.error('Paste CSV data first'); return }
    const lines = importText.trim().split('\n')
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const requiredCols = ['businessname', 'contact', 'email']
    for (const col of requiredCols) {
      if (!header.includes(col)) { toast.error(`CSV must have columns: ${requiredCols.join(', ')} (and optionally: deliverytype, taxid, bankname, bankaccount)`); return }
    }
    let success = 0, failed = 0
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim())
      if (vals.length < 3) continue
      const row: Record<string, string> = {}
      header.forEach((h, j) => { row[h] = vals[j] || '' })
      try {
        await fetch('/api/merchants', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: row.businessname, contact: row.contact, email: row.email,
            deliveryType: row.deliverytype || 'self-delivery',
            taxId: row.taxid || '', bankName: row.bankname || '', bankAccount: row.bankaccount || '',
            isActive: true, createdBy: 'admin',
          }),
        })
        success++
      } catch { failed++ }
    }
    toast.success(`Imported ${success} merchants${failed > 0 ? `, ${failed} failed` : ''}`)
    setImportOpen(false); setImportText(''); fetchData()
  }

  // #13: Contract status helper
  const contractStatus = (m: Merchant): { label: string; color: string } | null => {
    if (!m.contractStart && !m.contractEnd) return null
    const now = new Date()
    if (m.contractEnd && new Date(m.contractEnd) < now) return { label: 'EXPIRED', color: 'bg-red-100 text-red-700' }
    if (m.contractEnd) {
      const daysLeft = Math.ceil((new Date(m.contractEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 30) return { label: `EXPIRES IN ${daysLeft}d`, color: 'bg-orange-100 text-orange-700' }
    }
    if (m.contractStart && new Date(m.contractStart) > now) return { label: 'UPCOMING', color: 'bg-blue-100 text-blue-700' }
    return { label: 'ACTIVE', color: 'bg-green-100 text-green-700' }
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
      >
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Import CSV
        </Button>
      </OpsHeader>

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
            </tr>
          </thead>
          <tbody>
            {data.map((m) => {
              return (
                  <DenseTr key={m.id} onClick={() => handleExpand(m)} tint={m.isActive ? '' : 'bg-gray-50/50'}>
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
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); handleToggleActive(m) }} title={m.isActive ? 'Click to deactivate' : 'Click to activate'}>
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 hover:bg-gray-400'}`} />
                        </button>
                        {(() => { const cs = contractStatus(m); return cs ? <span className={`text-[8px] px-1 py-0.5 rounded font-semibold ${cs.color}`}>{cs.label}</span> : null })()}
                      </div>
                    </DenseTd>
                    <DenseTd right>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleOpenRateCard(m)} title="Rate card" className="p-1 text-gray-400 hover:text-[#FF6B35]"><SettingsIcon size={12} /></button>
                        <button onClick={() => handleOpenStatement(m)} title="Statement" className="p-1 text-gray-400 hover:text-[#FF6B35]"><FileText size={12} /></button>
                      </div>
                    </DenseTd>
                  </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      )}

      {/* Profile slide-over — replaces inline expansion */}
      <DetailSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={selectedMerchant?.businessName || ''}
        subtitle={selectedMerchant ? `${selectedMerchant.merchantId} · ${(selectedMerchant.deliveryType || 'self-delivery').replace('-', ' ')}` : ''}
        width="lg"
      >
        {selectedMerchant && (() => {
          const m = selectedMerchant
          const maxVal = Math.max(m.profitability.revenue, Math.abs(m.profitability.net), 1)
          const barW = (v: number) => `${Math.max(2, (Math.abs(v) / maxVal) * 100)}%`
          return (
            <div className="space-y-3">
              {/* Header: status + badges + activity pills + action icons */}
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-100">
                <span className={`w-3 h-3 rounded-full ${m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px] font-mono">{m.merchantId}</Badge>
                <span className="text-[10px] capitalize px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{(m.deliveryType || 'self-delivery').replace('-', ' ')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{m.currency}</span>
                {(() => { const cs = contractStatus(m); return cs ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cs.color}`}>{cs.label}</span> : null })()}
                <div className="flex items-center gap-2 ml-auto text-[10px] text-gray-400">
                  <span>In: <span className="font-medium text-gray-600">{timeAgo(m.lastInboundAt)}</span></span>
                  <span>·</span>
                  <span>Out: <span className="font-medium text-gray-600">{timeAgo(m.lastOutboundAt)}</span></span>
                  <span>·</span>
                  <span>Pay: <span className="font-medium text-gray-600">{timeAgo(m.lastPaymentAt)}</span></span>
                </div>
              </div>

              {/* Action icon buttons */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleEdit(m) }}><SettingsIcon size={12} className="mr-1" /> Edit</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleOpenRateCard(m) }}><FileText size={12} className="mr-1" /> Rate Card</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleOpenStatement(m) }}><Calendar size={12} className="mr-1" /> Statement</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleToggleActive(m)}>{m.isActive ? 'Deactivate' : 'Activate'}</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50 ml-auto" onClick={() => { setProfileOpen(false); setDeletingId(m.id); setDeleteOpen(true) }}><Trash2 size={12} className="mr-1" /> Delete</Button>
              </div>

              {/* KPI mini-ribbon */}
              <div className="bg-[#1B2A4A] text-white rounded-lg overflow-hidden flex items-stretch text-xs">
                <div className="flex-1 px-3 py-1.5 border-r border-white/10"><span className="text-[8px] text-blue-200/60 uppercase tracking-wider">SKUs</span><span className="font-mono font-bold text-sm block">{m.productCount}</span></div>
                <div className="flex-1 px-3 py-1.5 border-r border-white/10"><span className="text-[8px] text-blue-200/60 uppercase tracking-wider">Orders</span><span className="font-mono font-bold text-sm block">{m.orderCount}</span></div>
                <div className="flex-1 px-3 py-1.5 border-r border-white/10"><span className="text-[8px] text-blue-200/60 uppercase tracking-wider">Sales</span><span className="font-mono font-bold text-sm block">{formatCurrencyCompact(m.totalSalesValue, m.currency)}</span></div>
                <div className="flex-1 px-3 py-1.5 border-r border-white/10"><span className="text-[8px] text-blue-200/60 uppercase tracking-wider">Pending</span><span className="font-mono font-bold text-sm block text-orange-300">{formatCurrencyCompact(m.pendingPayment, m.currency)}</span></div>
                <div className="flex-1 px-3 py-1.5"><span className="text-[8px] text-blue-200/60 uppercase tracking-wider">Storage</span><span className="font-mono font-bold text-sm block text-blue-300">{formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}</span></div>
              </div>

              {/* Two-column: Contact + Business */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2 flex items-center gap-1"><Phone size={10} /> Contact</p>
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-900 font-medium">{m.contact}</p>
                    <p className="text-gray-500">{m.email}</p>
                    {m.contactPerson && <p className="text-gray-500">Attn: {m.contactPerson}</p>}
                    {m.altPhone && <p className="text-gray-500">{m.altPhone}</p>}
                    {m.address && <p className="text-gray-500">{m.address}</p>}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2 flex items-center gap-1"><Building2 size={10} /> Business</p>
                  <div className="space-y-1 text-xs">
                    {m.taxId && <p className="text-gray-700">TIN: <span className="font-mono">{m.taxId}</span></p>}
                    <p className="text-gray-700">Delivery: <span className="capitalize">{(m.deliveryType || 'self-delivery').replace('-', ' ')}</span></p>
                    {m.bankName && <p className="text-gray-500">{m.bankName}</p>}
                    {m.bankAccount && <p className="text-gray-500 font-mono">{m.bankAccount}</p>}
                    {(m.contractStart || m.contractEnd) && <p className="text-gray-500 mt-1">Contract: {m.contractStart ? new Date(m.contractStart).toLocaleDateString('en-UG') : '—'} → {m.contractEnd ? new Date(m.contractEnd).toLocaleDateString('en-UG') : 'Open'}</p>}
                    {m.notes && <p className="text-gray-400 italic mt-1 text-[11px]">"{m.notes}"</p>}
                  </div>
                </div>
              </div>

              {/* Profitability waterfall */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Profitability</p>
                <div className="space-y-1.5">
                  {[{l:'Revenue',v:m.profitability.revenue,c:'bg-green-500'},{l:'Commission',v:m.profitability.commission,c:'bg-orange-500'},{l:'Shrinkage',v:m.profitability.shrinkage,c:'bg-red-500'},{l:'Returns',v:m.profitability.returns,c:'bg-red-400'}].map((r,i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-20">{r.l}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                        <div className={`${r.c} h-full rounded-full flex items-center justify-end pr-2`} style={{ width: barW(r.v) }}>
                          <span className="text-[9px] text-white font-mono font-bold">{r.v < 0 ? '-' : ''}{formatCurrencyCompact(Math.abs(r.v), m.currency)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                    <span className={`text-[10px] font-semibold w-20 ${m.profitability.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>Net</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-5 overflow-hidden">
                      <div className={`${m.profitability.net >= 0 ? 'bg-green-600' : 'bg-red-600'} h-full rounded-full flex items-center justify-end pr-2`} style={{ width: barW(m.profitability.net) }}>
                        <span className="text-[10px] text-white font-mono font-bold">{formatCurrencyCompact(m.profitability.net, m.currency)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-column: Statements + Activity timeline */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Recent Statements</p>
                  {m.statements && m.statements.length > 0 ? (
                    <div className="space-y-1">
                      {m.statements.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-200 last:border-0">
                          <span className="font-mono text-gray-500">{s.period}</span>
                          <span className="font-mono font-bold text-gray-900">{formatCurrency(s.netPayable, m.currency)}</span>
                          <span className={`ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${s.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{s.isPaid ? 'PAID' : s.status.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-400 text-center py-3">No statements yet</p>}
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Activity Timeline</p>
                  {activityLoading ? <p className="text-xs text-gray-400 text-center py-3">Loading...</p> :
                   activityData.length === 0 ? <p className="text-xs text-gray-400 text-center py-3">No recent activity</p> : (
                    <div className="max-h-48 overflow-y-auto relative">
                      <div className="absolute left-[6px] top-2 bottom-2 w-px bg-gray-300"></div>
                      {activityData.map((event, i) => {
                        const dC: Record<string,string> = { inbound:'bg-blue-500',outbound:'bg-orange-500',payment:'bg-green-500',statement:'bg-purple-500',shrinkage:'bg-red-500',rtv:'bg-red-400',rma:'bg-red-300' }
                        const iC: Record<string,string> = { inbound:'text-blue-600',outbound:'text-orange-600',payment:'text-green-600',statement:'text-purple-600',shrinkage:'text-red-600',rtv:'text-red-500',rma:'text-red-400' }
                        const iM: Record<string,typeof Clock> = { inbound:ArrowDownRight,outbound:ArrowUpRight,payment:DollarSign,statement:FileText,shrinkage:AlertTriangle,rtv:RotateCcw,rma:PackageX }
                        const dc = dC[String(event.type)]||'bg-gray-400'
                        const ic = iC[String(event.type)]||'text-gray-500'
                        const Icon = iM[String(event.type)]||Clock
                        const ts = new Date(String(event.timestamp))
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-[11px] py-1.5 relative">
                            <div className={`w-3.5 h-3.5 rounded-full ${dc} ring-2 ring-gray-50 shrink-0 z-10 flex items-center justify-center`}><Icon size={7} className="text-white" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-700 truncate leading-tight">{String(event.label)}</p>
                              <div className="flex items-center gap-2 mt-0.5"><span className={`text-[9px] ${ic}`}>{String(event.description).slice(0, 40)}</span>{event.amount ? <span className="font-mono text-gray-500 text-[10px]">{formatCurrencyCompact(Number(event.amount))}</span> : null}</div>
                            </div>
                            <span className="text-gray-400 text-[9px] shrink-0 whitespace-nowrap">{ts.toLocaleString('en-UG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </DetailSlideOver>

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
      {/* #17: CSV Import dialog */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Upload size={18} /> Import Merchants from CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Paste CSV data below. Required columns: businessName, contact, email.
              Optional: deliveryType, taxId, bankName, bankAccount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'businessName,contact,email,deliveryType,taxId,bankName,bankAccount\nAcme Ltd,0700123456,acme@gmail.com,consignment,TIN123456,Stanbic,9012345678\nBidco Africa,0700789012,bidco@gmail.com,self-delivery,TIN789012,MTN,2001234567'}
              rows={8}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              First line must be the header row. Each subsequent line is one merchant.
              deliveryType options: self-delivery, drop-ship, consignment.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
