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
import { Trash2, Settings as SettingsIcon, FileText } from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr, StatusPill } from '@/components/shared/ops-ui'

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
  const [statementPeriod, setStatementPeriod] = useState(new Date().toISOString().slice(0, 7))

  const [form, setForm] = useState({
    businessName: '', contact: '', email: '', deliveryType: 'self-delivery',
  })

  const [rateForm, setRateForm] = useState({
    inboundReceivingPerUnit: 0, storagePerUnitPerDay: 0, pickPerUnit: 0,
    packPerOrder: 0, returnProcessingPerUnit: 0, commissionPercent: 0,
    codRemittanceFeePerOrder: 0, codShortfallPenalty: 0,
  })

  const fetchData = () => {
    fetch(`/api/merchants?search=${search}`).then(r => r.json()).then(setData)
  }

  useEffect(() => { fetchData() }, [search])

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
      toast.error('Please fill all required fields')
      return
    }
    if (editing) {
      await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...form }) })
      toast.success('Merchant updated')
    } else {
      await fetch('/api/merchants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, isActive: true, createdBy: 'admin' }) })
      toast.success('Merchant created')
    }
    setOpen(false)
    setEditing(null)
    setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' })
    fetchData()
  }

  const handleEdit = (item: Merchant) => {
    setEditing(item)
    setForm({
      businessName: item.businessName, contact: item.contact, email: item.email,
      deliveryType: item.deliveryType || 'self-delivery',
    })
    setOpen(true)
  }

  const handleDelete = async () => {
    if (deletingId) {
      await fetch(`/api/merchants?id=${deletingId}`, { method: 'DELETE' })
      toast.success('Merchant deleted')
      setDeleteOpen(false)
      setDeletingId(null)
      fetchData()
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
        setRateForm({
          inboundReceivingPerUnit: active.inboundReceivingPerUnit,
          storagePerUnitPerDay: active.storagePerUnitPerDay,
          pickPerUnit: active.pickPerUnit, packPerOrder: active.packPerOrder,
          returnProcessingPerUnit: active.returnProcessingPerUnit,
          commissionPercent: active.commissionPercent,
          codRemittanceFeePerOrder: active.codRemittanceFeePerOrder,
          codShortfallPenalty: active.codShortfallPenalty,
        })
      } else {
        setRateCard(null)
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
    toast.success('Rate card saved')
    setRateCardOpen(false)
  }

  const handleOpenStatement = (merchant: Merchant) => {
    setSelectedMerchant(merchant)
    setStatementPeriod(new Date().toISOString().slice(0, 7))
    setStatementOpen(true)
  }

  const handleGenerateStatement = async () => {
    if (!selectedMerchant) return
    try {
      const res = await fetch('/api/merchant-statements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: selectedMerchant.merchantId, period: statementPeriod, generatedBy: 'admin' }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`Statement generated. Net payable: ${formatCurrency(result.netPayable)}`)
        setStatementOpen(false)
        fetchData()
      } else { toast.error(result.error || 'Failed') }
    } catch { toast.error('Failed') }
  }

  const deliveryCode = (dt: string | null) => {
    if (!dt) return 'SD'
    if (dt === 'drop-ship') return 'DS'
    if (dt === 'consignment') return 'CN'
    return 'SD'
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Merchants"
        description="Vendor partners and their cumulative financial position"
        kpiCells={kpiCells}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, ID, or contact..."
        actionLabel="Add Merchant"
        onAction={() => { setEditing(null); setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' }); setOpen(true) }}
      />

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
              <DenseTh className="w-24">Contact</DenseTh>
              <DenseTh className="w-28 text-right">Sales</DenseTh>
              <DenseTh className="w-28 text-right">Pending <InfoTip term="pendingPayment" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Storage <InfoTip term="storageLiability" size={11} /></DenseTh>
              <DenseTh className="w-28 text-right">Shrinkage</DenseTh>
              <DenseTh className="w-16 text-center">Status</DenseTh>
              <DenseTh className="w-24 text-right">Actions</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map((m, i) => (
              <DenseTr
                key={m.id}
                onClick={() => handleEdit(m)}
                tint={m.isActive ? '' : 'bg-gray-50/50'}
              >
                <DenseTd mono className="text-gray-500">{m.merchantId}</DenseTd>
                <DenseTd className="text-gray-900 font-medium">{m.businessName}</DenseTd>
                <DenseTd mono className="text-gray-600">{deliveryCode(m.deliveryType)}</DenseTd>
                <DenseTd className="text-gray-600 truncate max-w-[120px]">{m.contact}</DenseTd>
                <DenseTd mono right className="text-gray-700">{formatCurrencyCompact(m.totalSalesValue, m.currency)}</DenseTd>
                <DenseTd mono right className={m.pendingPayment > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}>
                  {formatCurrencyCompact(m.pendingPayment, m.currency)}
                </DenseTd>
                <DenseTd mono right className={m.storageLiabilityBalance > 0 ? 'text-blue-700' : 'text-gray-400'}>
                  {formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}
                </DenseTd>
                <DenseTd mono right className={m.totalShrinkageValue > 0 ? 'text-red-600' : 'text-gray-400'}>
                  {formatCurrencyCompact(m.totalShrinkageValue, m.currency)}
                </DenseTd>
                <DenseTd className="text-center">
                  <span className={`inline-block w-2 h-2 rounded-full ${m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                </DenseTd>
                <DenseTd right>
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleOpenRateCard(m)} title="Rate card" className="p-1 text-gray-400 hover:text-[#FF6B35]">
                      <SettingsIcon size={12} />
                    </button>
                    <button onClick={() => handleOpenStatement(m)} title="Statement" className="p-1 text-gray-400 hover:text-[#FF6B35]">
                      <FileText size={12} />
                    </button>
                  </div>
                </DenseTd>
              </DenseTr>
            ))}
          </tbody>
        </DenseTable>
      )}

      {/* Edit / Create slide-over (unchanged) */}
      <DetailSlideOver
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm({ businessName: '', contact: '', email: '', deliveryType: 'self-delivery' }) }}
        title={editing ? editing.businessName : 'New Merchant'}
        subtitle={editing ? `ID: ${editing.merchantId}` : 'Fill in the details to create a new merchant'}
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            {editing && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 rounded-xl" onClick={() => { setDeletingId(editing.id); setDeleteOpen(true) }}>
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
        {editing && (
          <div className="mb-6 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-[10px] uppercase text-gray-400">Sales</p><p className="font-mono font-bold text-green-700">{formatCurrency(editing.totalSalesValue, editing.currency)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-400">Pending</p><p className="font-mono font-bold text-orange-700">{formatCurrency(editing.pendingPayment, editing.currency)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-400">Storage</p><p className="font-mono font-bold text-blue-700">{formatCurrency(editing.storageLiabilityBalance, editing.currency)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-400">Shrinkage</p><p className="font-mono font-bold text-red-600">{formatCurrency(editing.totalShrinkageValue, editing.currency)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-400">Returns</p><p className="font-mono text-gray-700">{formatCurrency(editing.totalReturnValue, editing.currency)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-400">Inbound</p><p className="font-mono text-gray-700">{formatCurrency(editing.totalInboundValue, editing.currency)}</p></div>
            </div>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Business Name <span className="text-red-400">*</span></Label>
            <Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Contact <span className="text-red-400">*</span></Label>
            <Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Email <span className="text-red-400">*</span></Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block flex items-center text-xs">
              Delivery Type <InfoTip term="deliveryType" size={13} className="ml-1" />
            </Label>
            <select value={form.deliveryType} onChange={e => setForm({ ...form, deliveryType: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="self-delivery">Self-Delivery (merchant fulfils themselves)</option>
              <option value="drop-ship">Drop-Ship (supplier delivers to warehouse on demand)</option>
              <option value="consignment">Consignment (supplier owns stock, we store it)</option>
            </select>
          </div>
        </div>
      </DetailSlideOver>

      {/* Rate card slide-over (unchanged) */}
      <DetailSlideOver
        open={rateCardOpen}
        onClose={() => setRateCardOpen(false)}
        title={`Rate Card — ${selectedMerchant?.businessName || ''}`}
        subtitle={rateCard ? `Valid from ${new Date(rateCard.validFrom).toLocaleDateString()}` : 'Creating new rate card'}
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setRateCardOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSaveRateCard} className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl">Save</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { k: 'inboundReceivingPerUnit', l: 'Inbound Receiving (UGX/unit)' },
            { k: 'storagePerUnitPerDay', l: 'Storage (UGX/unit/day)' },
            { k: 'pickPerUnit', l: 'Pick (UGX/unit)' },
            { k: 'packPerOrder', l: 'Pack (UGX/order)' },
            { k: 'returnProcessingPerUnit', l: 'Return (UGX/unit)' },
            { k: 'commissionPercent', l: 'Commission (%)' },
            { k: 'codRemittanceFeePerOrder', l: 'COD Fee (UGX/order)' },
            { k: 'codShortfallPenalty', l: 'COD Shortfall Penalty (UGX)' },
          ].map(f => (
            <div key={f.k}>
              <Label className="text-xs font-medium mb-1 block">{f.l}</Label>
              <Input type="number" value={String(rateForm[f.k as keyof typeof rateForm])} onChange={e => setRateForm({ ...rateForm, [f.k]: parseFloat(e.target.value) || 0 })} className="rounded-xl" />
            </div>
          ))}
        </div>
      </DetailSlideOver>

      {/* Statement dialog (unchanged) */}
      <AlertDialog open={statementOpen} onOpenChange={setStatementOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><FileText size={18} /> Generate Statement — {selectedMerchant?.businessName}</AlertDialogTitle>
            <AlertDialogDescription>Generates a monthly statement with all fees, sales, COD, and shrinkage.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Label className="text-sm font-medium mb-1.5 block">Period (YYYY-MM)</Label>
            <Input type="month" value={statementPeriod} onChange={e => setStatementPeriod(e.target.value)} className="rounded-xl" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateStatement} className="bg-[#FF6B35] hover:bg-[#E55A25] rounded-xl">Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Merchant</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
