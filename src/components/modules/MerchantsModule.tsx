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
import {
  Search, Store, UserCheck, CalendarDays, Trash2, Mail, Phone, Building2,
  Wallet, TrendingUp, TrendingDown, FileText, Download, Settings as SettingsIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import OfficeHeader from '@/components/shared/OfficeHeader'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

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
  // Cumulative figures
  totalInboundValue: number
  totalSalesValue: number
  totalShrinkageValue: number
  totalReturnValue: number
  expectedPayment: number
  actualPayment: number
  pendingPayment: number
  storageLiabilityBalance: number
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
}

export default function MerchantsModule() {
  const [data, setData] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [rateCardOpen, setRateCardOpen] = useState(false)
  const [statementOpen, setStatementOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Merchant | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [rateCard, setRateCard] = useState<RateCard | null>(null)
  const [statementPeriod, setStatementPeriod] = useState(
    new Date().toISOString().slice(0, 7),
  )

  const [form, setForm] = useState({
    businessName: '',
    contact: '',
    email: '',
    deliveryType: 'self-delivery',
  })

  const [rateForm, setRateForm] = useState({
    inboundReceivingPerUnit: 0,
    storagePerUnitPerDay: 0,
    pickPerUnit: 0,
    packPerOrder: 0,
    returnProcessingPerUnit: 0,
    commissionPercent: 0,
    codRemittanceFeePerOrder: 0,
    codShortfallPenalty: 0,
  })

  const fetchData = () => {
    fetch(`/api/merchants?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => {
    fetch(`/api/merchants?search=${search}`).then(r => r.json()).then(setData)
  }, [search])

  const filteredData = data

  const totalMerchants = data.length
  const activeMerchants = data.filter(m => m.isActive).length
  const newThisMonth = data.filter(m => {
    const d = new Date(m.createdAt)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const stats = [
    { label: 'Total Merchants', value: totalMerchants, icon: Store, color: '#FF6B35', bg: 'bg-orange-500/20', border: 'border-orange-400/30', gradient: 'from-orange-500/10 to-orange-500/5' },
    { label: 'Active', value: activeMerchants, icon: UserCheck, color: '#22C55E', bg: 'bg-green-500/20', border: 'border-green-400/30', gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'New This Month', value: newThisMonth, icon: CalendarDays, color: '#3B82F6', bg: 'bg-blue-500/20', border: 'border-blue-400/30', gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  const handleSubmit = async () => {
    if (!form.businessName || !form.contact || !form.email) {
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/merchants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...form }),
      })
      toast.success('Merchant updated successfully')
    } else {
      await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, isActive: true, createdBy: 'admin' }),
      })
      toast.success('Merchant created successfully')
    }
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' })
    fetchData()
  }

  const handleEdit = (item: Merchant) => {
    setEditing(item)
    setForm({
      businessName: item.businessName,
      contact: item.contact,
      email: item.email,
      deliveryType: item.deliveryType || 'self-delivery',
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/merchants?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Merchant deleted successfully')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' })
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' })
  }

  // Rate card handlers
  const handleOpenRateCard = async (merchant: Merchant) => {
    setSelectedMerchant(merchant)
    try {
      const res = await fetch(`/api/rate-card?merchantId=${merchant.merchantId}`)
      const cards = await res.json()
      if (Array.isArray(cards) && cards.length > 0) {
        const active = cards.find((c: RateCard) => c.isActive) || cards[0]
        setRateCard(active)
        setRateForm({
          inboundReceivingPerUnit: active.inboundReceivingPerUnit,
          storagePerUnitPerDay: active.storagePerUnitPerDay,
          pickPerUnit: active.pickPerUnit,
          packPerOrder: active.packPerOrder,
          returnProcessingPerUnit: active.returnProcessingPerUnit,
          commissionPercent: active.commissionPercent,
          codRemittanceFeePerOrder: active.codRemittanceFeePerOrder,
          codShortfallPenalty: active.codShortfallPenalty,
        })
      } else {
        setRateCard(null)
        setRateForm({
          inboundReceivingPerUnit: 0,
          storagePerUnitPerDay: 0,
          pickPerUnit: 0,
          packPerOrder: 0,
          returnProcessingPerUnit: 0,
          commissionPercent: 0,
          codRemittanceFeePerOrder: 0,
          codShortfallPenalty: 0,
        })
      }
      setRateCardOpen(true)
    } catch {
      toast.error('Failed to load rate card')
    }
  }

  const handleSaveRateCard = async () => {
    if (!selectedMerchant) return
    try {
      const method = rateCard ? 'PUT' : 'POST'
      const body = rateCard
        ? { id: rateCard.id, ...rateForm }
        : { merchantId: selectedMerchant.merchantId, ...rateForm }
      await fetch('/api/rate-card', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      toast.success('Rate card saved')
      setRateCardOpen(false)
    } catch {
      toast.error('Failed to save rate card')
    }
  }

  // Statement generation
  const handleOpenStatement = (merchant: Merchant) => {
    setSelectedMerchant(merchant)
    setStatementPeriod(new Date().toISOString().slice(0, 7))
    setStatementOpen(true)
  }

  const handleGenerateStatement = async () => {
    if (!selectedMerchant) return
    try {
      const res = await fetch('/api/merchant-statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedMerchant.merchantId,
          period: statementPeriod,
          generatedBy: 'admin',
        }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Statement generated. Net payable: ${formatCurrency(result.netPayable)}`)
        setStatementOpen(false)
        fetchData()
      } else {
        toast.error(result.error || 'Failed to generate statement')
      }
    } catch {
      toast.error('Failed to generate statement')
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      <OfficeHeader
        title="Merchants Office"
        description="Manage your merchant partners and vendor relationships"
        icon={Store}
        stats={stats}
        actionLabel="Add Merchant"
        onAction={openCreate}
      >
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search merchants..."
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
            <Store size={32} className="text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No merchants found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or add a new merchant</p>
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
              onClick={() => handleEdit(item)}
              className="cursor-pointer bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{item.merchantId}</span>
                <Badge
                  variant={item.isActive ? 'default' : 'secondary'}
                  className={item.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0 text-[11px]' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0 text-[11px]'}
                >
                  {item.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight">{item.businessName}</h3>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px] capitalize border-gray-200 text-gray-500">
                  {(item.deliveryType || 'self-delivery').replace('-', ' ')}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-gray-200 text-gray-500">
                  {item.currency || 'UGX'}
                </Badge>
              </div>

              {/* Cumulative figures — the dashboard the merchant would see in their report */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs">
                  <TrendingUp size={12} className="text-green-500" />
                  <span className="text-gray-500">Sales:</span>
                  <span className="font-semibold text-gray-700">{formatCurrencyCompact(item.totalSalesValue, item.currency)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Wallet size={12} className="text-orange-500" />
                  <span className="text-gray-500">Pending:</span>
                  <span className="font-semibold text-gray-700">{formatCurrencyCompact(item.pendingPayment, item.currency)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <TrendingDown size={12} className="text-red-500" />
                  <span className="text-gray-500">Shrinkage:</span>
                  <span className="font-semibold text-gray-700">{formatCurrencyCompact(item.totalShrinkageValue, item.currency)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Building2 size={12} className="text-blue-500" />
                  <span className="text-gray-500">
                    Storage <InfoTip term="storageLiability" size={12} />:
                  </span>
                  <span className="font-semibold text-gray-700">{formatCurrencyCompact(item.storageLiabilityBalance, item.currency)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Joined {new Date(item.createdAt).toLocaleDateString()}</span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleOpenRateCard(item)}
                    title="Configure rate card"
                  >
                    <SettingsIcon size={12} className="mr-1" />
                    Rate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handleOpenStatement(item)}
                    title="Generate statement"
                  >
                    <FileText size={12} className="mr-1" />
                    Statement
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
        title={editing ? editing.businessName : 'New Merchant'}
        subtitle={editing ? `ID: ${editing.merchantId}` : 'Fill in the details to create a new merchant'}
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
                {editing ? 'Update Merchant' : 'Create Merchant'}
              </Button>
            </div>
          </div>
        }
      >
        {editing && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Merchant ID</p>
                <p className="font-mono text-gray-700">{editing.merchantId}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Status</p>
                <Badge className={editing.isActive ? 'bg-green-100 text-green-700 hover:bg-green-100 border-0' : 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-0'}>
                  {editing.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Created</p>
                <p className="text-gray-700">{new Date(editing.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Currency</p>
                <p className="text-gray-700">{editing.currency || 'UGX'}</p>
              </div>
            </div>

            {/* Full cumulative figures breakdown */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-2">
                Cumulative Figures <InfoTip term="statement" size={12} />
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">Inbound Value</span>
                  <span className="font-semibold">{formatCurrency(editing.totalInboundValue, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">Sales Value</span>
                  <span className="font-semibold">{formatCurrency(editing.totalSalesValue, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">Return Value</span>
                  <span className="font-semibold">{formatCurrency(editing.totalReturnValue, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">Shrinkage Value</span>
                  <span className="font-semibold">{formatCurrency(editing.totalShrinkageValue, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">
                    Storage Liability <InfoTip term="storageLiability" size={11} />
                  </span>
                  <span className="font-semibold">{formatCurrency(editing.storageLiabilityBalance, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">
                    Expected <InfoTip term="expectedPayment" size={11} />
                  </span>
                  <span className="font-semibold">{formatCurrency(editing.expectedPayment, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white">
                  <span className="text-gray-500">
                    Actual <InfoTip term="actualPayment" size={11} />
                  </span>
                  <span className="font-semibold">{formatCurrency(editing.actualPayment, editing.currency)}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-orange-50 border border-orange-100">
                  <span className="text-gray-500">
                    Pending <InfoTip term="pendingPayment" size={11} />
                  </span>
                  <span className="font-bold text-orange-700">{formatCurrency(editing.pendingPayment, editing.currency)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-5">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Business Name <span className="text-red-400">*</span></Label>
            <Input
              value={form.businessName}
              onChange={e => setForm({ ...form, businessName: e.target.value })}
              placeholder="Enter business name"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Contact Number <span className="text-red-400">*</span></Label>
            <Input
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              placeholder="Enter contact number"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block">Email Address <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Enter email address"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block flex items-center">
              Delivery Type <InfoTip term="deliveryType" size={13} className="ml-1" />
            </Label>
            <select
              value={form.deliveryType}
              onChange={e => setForm({ ...form, deliveryType: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="self-delivery">Self-Delivery (merchant delivers stock to us)</option>
              <option value="drop-ship">Drop-Ship (we coordinate, never touch stock)</option>
              <option value="consignment">Consignment (merchant owns stock, we store it)</option>
            </select>
          </div>
        </div>
      </DetailSlideOver>

      {/* Rate Card Slide-Over */}
      <DetailSlideOver
        open={rateCardOpen}
        onClose={() => setRateCardOpen(false)}
        title={`Rate Card — ${selectedMerchant?.businessName || ''}`}
        subtitle={rateCard ? `Existing card (valid from ${new Date(rateCard.validFrom).toLocaleDateString()})` : 'No rate card yet — creating a new one'}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setRateCardOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSaveRateCard} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">
              Save Rate Card
            </Button>
          </div>
        }
      >
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <p className="text-xs text-blue-800">
            <InfoTip term="rateCard" size={13} className="mr-1" />
            These rates are frozen when stock is inbound — so historical storage fees stay stable even if you change rates later.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
                Inbound Receiving (UGX/unit) <InfoTip term="rateCard" size={11} className="ml-1" />
              </Label>
              <Input
                type="number"
                value={rateForm.inboundReceivingPerUnit}
                onChange={e => setRateForm({ ...rateForm, inboundReceivingPerUnit: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
                Storage (UGX/unit/day) <InfoTip term="storagePerUnitPerDay" size={11} className="ml-1" />
              </Label>
              <Input
                type="number"
                value={rateForm.storagePerUnitPerDay}
                onChange={e => setRateForm({ ...rateForm, storagePerUnitPerDay: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Pick Fee (UGX/unit)</Label>
              <Input
                type="number"
                value={rateForm.pickPerUnit}
                onChange={e => setRateForm({ ...rateForm, pickPerUnit: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Pack Fee (UGX/order)</Label>
              <Input
                type="number"
                value={rateForm.packPerOrder}
                onChange={e => setRateForm({ ...rateForm, packPerOrder: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Return Processing (UGX/unit)</Label>
              <Input
                type="number"
                value={rateForm.returnProcessingPerUnit}
                onChange={e => setRateForm({ ...rateForm, returnProcessingPerUnit: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
                Commission (%) <InfoTip term="commission" size={11} className="ml-1" />
              </Label>
              <Input
                type="number"
                step="0.1"
                value={rateForm.commissionPercent}
                onChange={e => setRateForm({ ...rateForm, commissionPercent: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
                COD Remittance Fee (UGX/order) <InfoTip term="codCollected" size={11} className="ml-1" />
              </Label>
              <Input
                type="number"
                value={rateForm.codRemittanceFeePerOrder}
                onChange={e => setRateForm({ ...rateForm, codRemittanceFeePerOrder: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
                COD Shortfall Penalty (UGX) <InfoTip term="shortfall" size={11} className="ml-1" />
              </Label>
              <Input
                type="number"
                value={rateForm.codShortfallPenalty}
                onChange={e => setRateForm({ ...rateForm, codShortfallPenalty: parseFloat(e.target.value) || 0 })}
                className="rounded-xl"
              />
            </div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Statement Generation Dialog */}
      <AlertDialog open={statementOpen} onOpenChange={setStatementOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText size={18} />
              Generate Statement — {selectedMerchant?.businessName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Generate a merchant statement for a specific month. This will calculate all fees, sales, COD, and shrinkage for the period and produce a statement that can be downloaded as Excel or PDF and sent to the merchant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label className="text-gray-700 font-medium mb-1.5 block">Period (YYYY-MM)</Label>
            <Input
              type="month"
              value={statementPeriod}
              onChange={e => setStatementPeriod(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-xs text-gray-500 mt-2">
              <InfoTip term="statement" size={12} className="mr-1" />
              The statement will be generated and listed in the Statements section where you can download it as Excel or PDF.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGenerateStatement}
              className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl"
            >
              Generate Statement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Merchant</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the merchant record.</AlertDialogDescription>
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
