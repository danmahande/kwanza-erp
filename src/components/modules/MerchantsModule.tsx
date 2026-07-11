'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, Filter, ChevronDown, ChevronRight, Upload, Download,
  AlertTriangle, CheckCircle2, Phone, Building2, Pause, Play,
  MessageSquare, Plus, HelpCircle, Settings as SettingsIcon,
  FileText, Calendar, X, ArrowRight, ArrowLeft, Truck, MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'

// ── Types ──

interface Merchant {
  id: string; merchantId: string; businessName: string; contact: string; email: string
  deliveryType: string | null; currency: string; isActive: boolean; isOnHold: boolean
  holdReason: string | null; holdSetAt: string | null; holdSetBy: string | null
  createdAt: string; taxId: string | null; address: string | null
  bankName: string | null; bankAccount: string | null; contactPerson: string | null
  altPhone: string | null; paymentTerms: string | null
  communicationChannels: string | null; deliveryAddresses: string | null
  productCategories: string | null
  contractStart: string | null; contractEnd: string | null; notes: string | null
  totalInboundValue: number; totalSalesValue: number; totalShrinkageValue: number
  totalReturnValue: number; expectedPayment: number; actualPayment: number
  pendingPayment: number; storageLiabilityBalance: number
  productCount: number; orderCount: number
  lastInboundAt: string | null; lastOutboundAt: string | null; lastPaymentAt: string | null
  pendingFollowUps: number
  profitability: { revenue: number; commission: number; shrinkage: number; returns: number; net: number }
  statements: Array<{ id: string; statementId: string; period: string; netPayable: number; isPaid: boolean; status: string; createdAt: string }>
}

const FILTER_CHIPS = [
  { key: 'all', label: 'All', deliveryType: '', status: '' },
  { key: 'active', label: 'Active', deliveryType: '', status: 'active' },
  { key: 'inactive', label: 'Inactive', deliveryType: '', status: 'inactive' },
  { key: 'onhold', label: 'On Hold', deliveryType: '', status: 'onhold' },
  { key: 'self-delivery', label: 'Self-Delivery', deliveryType: 'self-delivery', status: '' },
  { key: 'drop-ship', label: 'Drop-Ship', deliveryType: 'drop-ship', status: '' },
  { key: 'consignment', label: 'Consignment', deliveryType: 'consignment', status: '' },
]

const PAYMENT_TERMS = [
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'net_7', label: 'Net 7 days' },
  { value: 'net_14', label: 'Net 14 days' },
  { value: 'net_30', label: 'Net 30 days' },
  { value: 'net_60', label: 'Net 60 days' },
]

const CURRENCIES = [
  { value: 'UGX', label: 'UGX (Ugandan Shilling)' },
  { value: 'KES', label: 'KES (Kenyan Shilling)' },
  { value: 'USD', label: 'USD (US Dollar)' },
]

const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Beverages', 'Household', 'Electronics', 'Personal Care', 'Other']

const deliveryCode = (dt: string | null) => dt === 'drop-ship' ? 'DS' : dt === 'consignment' ? 'CN' : 'SD'
const deliveryLabel = (dt: string | null) => dt === 'drop-ship' ? 'Drop-Ship' : dt === 'consignment' ? 'Consignment' : 'Self-Delivery'

const timeAgo = (date: string | null) => {
  if (!date) return '—'
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ═══════════════════════════════════════════════════════════════

const WIZARD_STEPS = [
  { num: 1, title: 'Business', desc: 'Company details' },
  { num: 2, title: 'Financial', desc: 'Currency & payment terms' },
  { num: 3, title: 'Delivery', desc: 'Addresses & type' },
  { num: 4, title: 'Products', desc: 'Categories supplied' },
  { num: 5, title: 'Communication', desc: 'Channels & contacts' },
]

interface WizardForm {
  businessName: string; contact: string; email: string; taxId: string; address: string
  currency: string; paymentTerms: string; bankName: string; bankAccount: string
  deliveryType: string; deliveryAddresses: Array<{ label: string; address: string }>
  productCategories: string[]
  contactPerson: string; altPhone: string
  communicationChannels: string[]; contractStart: string; contractEnd: string; notes: string
}

const emptyForm: WizardForm = {
  businessName: '', contact: '', email: '', taxId: '', address: '',
  currency: 'UGX', paymentTerms: 'net_30', bankName: '', bankAccount: '',
  deliveryType: 'self-delivery', deliveryAddresses: [{ label: 'Main Warehouse', address: '' }],
  productCategories: [],
  contactPerson: '', altPhone: '',
  communicationChannels: ['phone'], contractStart: '', contractEnd: '', notes: '',
}

function OnboardingWizard({ open, onClose, onComplete, editing }: {
  open: boolean; onClose: () => void; onComplete: (form: WizardForm) => void; editing: Merchant | null
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WizardForm>(emptyForm)

  useEffect(() => {
    if (editing) {
      setForm({
        businessName: editing.businessName, contact: editing.contact, email: editing.email,
        taxId: editing.taxId || '', address: editing.address || '',
        currency: editing.currency || 'UGX', paymentTerms: editing.paymentTerms || 'net_30',
        bankName: editing.bankName || '', bankAccount: editing.bankAccount || '',
        deliveryType: editing.deliveryType || 'self-delivery',
        deliveryAddresses: editing.deliveryAddresses ? JSON.parse(editing.deliveryAddresses) : [{ label: 'Main Warehouse', address: editing.address || '' }],
        productCategories: editing.productCategories ? JSON.parse(editing.productCategories) : [],
        contactPerson: editing.contactPerson || '', altPhone: editing.altPhone || '',
        communicationChannels: editing.communicationChannels ? JSON.parse(editing.communicationChannels) : ['phone'],
        contractStart: editing.contractStart ? editing.contractStart.slice(0, 10) : '',
        contractEnd: editing.contractEnd ? editing.contractEnd.slice(0, 10) : '',
        notes: editing.notes || '',
      })
    } else {
      setForm(emptyForm)
    }
    setStep(1)
  }, [editing, open])

  const canProceed = () => {
    if (step === 1) return form.businessName.trim() && form.contact.trim() && form.email.trim()
    if (step === 2) return form.currency && form.paymentTerms
    if (step === 3) {
      if (form.deliveryType === 'self-delivery' || form.deliveryType === 'drop-ship') {
        return form.deliveryAddresses.every(a => a.address.trim())
      }
      return true
    }
    return true
  }

  const handleNext = () => { if (step < 5) setStep(step + 1) }
  const handleBack = () => { if (step > 1) setStep(step - 1) }

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      productCategories: f.productCategories.includes(cat)
        ? f.productCategories.filter(c => c !== cat)
        : [...f.productCategories, cat]
    }))
  }

  const toggleChannel = (ch: string) => {
    setForm(f => ({
      ...f,
      communicationChannels: f.communicationChannels.includes(ch)
        ? f.communicationChannels.filter(c => c !== ch)
        : [...f.communicationChannels, ch]
    }))
  }

  const addAddress = () => setForm(f => ({ ...f, deliveryAddresses: [...f.deliveryAddresses, { label: '', address: '' }] }))
  const removeAddress = (i: number) => setForm(f => ({ ...f, deliveryAddresses: f.deliveryAddresses.filter((_, idx) => idx !== i) }))
  const updateAddress = (i: number, field: 'label' | 'address', val: string) => setForm(f => ({ ...f, deliveryAddresses: f.deliveryAddresses.map((a, idx) => idx === i ? { ...a, [field]: val } : a) }))

  return (
    <DetailSlideOver
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.businessName}` : 'Onboard New Merchant'}
      subtitle={`Step ${step} of 5 · ${WIZARD_STEPS[step - 1].desc}`}
      width="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <div className="flex items-center gap-2">
            {step > 1 && <Button variant="outline" size="sm" className="rounded-xl" onClick={handleBack}><ArrowLeft size={12} className="mr-1" /> Back</Button>}
            {step < 5 ? (
              <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleNext} disabled={!canProceed()}>
                Next <ArrowRight size={12} className="ml-1" />
              </Button>
            ) : (
              <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={() => onComplete(form)} disabled={!canProceed()}>
                {editing ? 'Save Changes' : 'Create Merchant'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 ${s.num === step ? 'opacity-100' : s.num < step ? 'opacity-60' : 'opacity-30'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${s.num < step ? 'bg-green-500 text-white' : s.num === step ? 'bg-[#FF6B35] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s.num < step ? '✓' : s.num}
              </div>
              <span className={`text-[10px] font-medium ${s.num === step ? 'text-gray-900' : 'text-gray-400'}`}>{s.title}</span>
            </div>
            {i < 4 && <div className={`flex-1 h-px mx-2 ${s.num < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Business */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Business Name <span className="text-red-400">*</span></Label>
            <Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="e.g., Supreme Office Supplies Ltd" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Primary Phone <span className="text-red-400">*</span></Label>
              <Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="+256 700 123 456" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Email <span className="text-red-400">*</span></Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="info@business.com" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Tax ID (TIN)</Label>
              <Input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="TIN number" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Registered Address</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Plot number, street, city" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Contract Start</Label>
              <Input type="date" value={form.contractStart} onChange={e => setForm({ ...form, contractStart: e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Contract End</Label>
              <Input type="date" value={form.contractEnd} onChange={e => setForm({ ...form, contractEnd: e.target.value })} className="rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Financial */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Currency</Label>
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Payment Terms</Label>
            <select value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              {PAYMENT_TERMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Bank Name</Label>
              <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="Stanbic, Centenary, etc." className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Bank Account Number</Label>
              <Input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="Account number" className="rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Delivery */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Delivery Type</Label>
            <div className="space-y-2">
              {[
                { value: 'self-delivery', label: 'Self-Delivery', desc: 'Merchant fulfills orders using their own drivers. We do not touch stock.' },
                { value: 'drop-ship', label: 'Drop-Ship', desc: 'Supplier delivers to our warehouse on demand when an order is placed.' },
                { value: 'consignment', label: 'Consignment', desc: 'Stock is stored in our warehouse. Merchant retains ownership until sale.' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setForm({ ...form, deliveryType: opt.value })}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${form.deliveryType === opt.value ? 'border-[#FF6B35] bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 ${form.deliveryType === opt.value ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 ml-6">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {(form.deliveryType === 'self-delivery' || form.deliveryType === 'drop-ship') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-700 font-medium text-xs">Delivery Addresses</Label>
                <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-lg" onClick={addAddress}><Plus size={10} className="mr-1" /> Add</Button>
              </div>
              <div className="space-y-2">
                {form.deliveryAddresses.map((addr, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input value={addr.label} onChange={e => updateAddress(i, 'label', e.target.value)} placeholder="Label (e.g., Main Warehouse)" className="rounded-lg text-xs h-8 w-32 shrink-0" />
                    <Input value={addr.address} onChange={e => updateAddress(i, 'address', e.target.value)} placeholder="Full address" className="rounded-lg text-xs h-8 flex-1" />
                    {form.deliveryAddresses.length > 1 && <button onClick={() => removeAddress(i)} className="text-gray-400 hover:text-red-500 mt-1"><X size={14} /></button>}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {form.deliveryType === 'self-delivery' ? 'Where the merchant\'s warehouse is located (for self-delivery fulfillment).' : 'Where the supplier delivers stock when an order is placed (for drop-ship).'}
              </p>
            </div>
          )}
          {form.deliveryType === 'consignment' && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-700">
              Stock will be stored at your warehouse. No delivery addresses needed — the merchant brings stock to you.
            </div>
          )}
        </div>
      )}

      {/* Step 4: Products */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Product Categories Supplied</Label>
            <p className="text-[11px] text-gray-500 mb-3">Select all categories this merchant supplies. Used for filtering and reporting.</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => {
                const selected = form.productCategories.includes(cat)
                return (
                  <button key={cat} onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selected ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {cat}
                  </button>
                )
              })}
            </div>
            {form.productCategories.length === 0 && <p className="text-[10px] text-gray-400 mt-2">No categories selected. You can add products individually later.</p>}
          </div>
        </div>
      )}

      {/* Step 5: Communication */}
      {step === 5 && (
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Preferred Communication Channels</Label>
            <p className="text-[11px] text-gray-500 mb-3">How does this merchant prefer to be contacted?</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'phone', label: 'Phone Call' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'email', label: 'Email' },
              ].map(ch => {
                const selected = form.communicationChannels.includes(ch.value)
                return (
                  <button key={ch.value} onClick={() => toggleChannel(ch.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selected ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {ch.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Contact Person</Label>
              <Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Name of account manager" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Alternative Phone</Label>
              <Input value={form.altPhone} onChange={e => setForm({ ...form, altPhone: e.target.value })} placeholder="Secondary contact" className="rounded-xl" />
            </div>
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Notes</Label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional information about this merchant..." rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
      )}
    </DetailSlideOver>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function MerchantsModule() {
  const [data, setData] = useState<Merchant[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<Merchant | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [holdReason, setHoldReason] = useState('')
  const [holdMerchant, setHoldMerchant] = useState<Merchant | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rateCardOpen, setRateCardOpen] = useState(false)
  const [rateCard, setRateCard] = useState<Record<string, unknown> | null>(null)
  const [rateForm, setRateForm] = useState({ inboundReceivingPerUnit: 0, storagePerUnitPerDay: 0, pickPerUnit: 0, packPerOrder: 0, returnProcessingPerUnit: 0, commissionPercent: 0, codRemittanceFeePerOrder: 0, codShortfallPenalty: 0 })
  const [statementOpen, setStatementOpen] = useState(false)
  const [statementPeriod, setStatementPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [topProducts, setTopProducts] = useState<Array<{ productName: string; qty: number; revenue: number }>>([])
  const [topProductsLoading, setTopProductsLoading] = useState(false)

  const fetchData = useCallback(() => {
    const chip = FILTER_CHIPS.find(c => c.key === activeFilter) || FILTER_CHIPS[0]
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (chip.deliveryType) params.set('deliveryType', chip.deliveryType)
    if (chip.status) params.set('status', chip.status)
    fetch(`/api/merchants?${params.toString()}`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setLoading(false) })
  }, [search, activeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered data for display
  const filteredData = data
  const totalMerchants = data.length
  const activeMerchants = data.filter(m => m.isActive).length
  const onHoldMerchants = data.filter(m => m.isOnHold).length
  const totalPending = data.reduce((s, m) => s + (m.pendingPayment || 0), 0)
  const followUpsDue = data.reduce((s, m) => s + (m.pendingFollowUps || 0), 0)

  // ── Actions ──
  const handleWizardComplete = async (form: WizardForm) => {
    const payload = {
      ...form,
      deliveryAddresses: JSON.stringify(form.deliveryAddresses),
      productCategories: JSON.stringify(form.productCategories),
      communicationChannels: JSON.stringify(form.communicationChannels),
      contractStart: form.contractStart || null,
      contractEnd: form.contractEnd || null,
    }
    try {
      if (editing) {
        await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Merchant updated')
      } else {
        await fetch('/api/merchants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, createdBy: 'admin' }) })
        toast.success('Merchant onboarded')
      }
      setWizardOpen(false); setEditing(null); fetchData()
    } catch { toast.error('Failed to save') }
  }

  const handleToggleActive = async (m: Merchant) => {
    await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, isActive: !m.isActive }) })
    toast.success(`${m.businessName} ${m.isActive ? 'deactivated' : 'activated'}`)
    fetchData()
  }

  const handleHoldToggle = (m: Merchant) => {
    if (m.isOnHold) {
      // Release hold
      fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, isOnHold: false }) })
        .then(() => { toast.success(`${m.businessName} released from hold`); fetchData() })
    } else {
      setHoldMerchant(m); setHoldReason(''); setHoldDialogOpen(true)
    }
  }

  const handleHoldConfirm = async () => {
    if (!holdMerchant) return
    await fetch('/api/merchants', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: holdMerchant.id, isOnHold: true, holdReason, holdSetBy: 'admin' }) })
    toast.success(`${holdMerchant.businessName} placed on hold`)
    setHoldDialogOpen(false); setHoldMerchant(null); fetchData()
  }

  const handleExpand = (m: Merchant) => {
    setSelectedMerchant(m); setProfileOpen(true)
    // Fetch top products
    setTopProductsLoading(true)
    fetch(`/api/products?search=${m.merchantId}`).then(r => r.json()).then(d => {
      // This is a placeholder — ideally we'd have a dedicated endpoint
      // for top products by merchant. For now, use product count from merchant data.
      setTopProducts([])
      setTopProductsLoading(false)
    }).catch(() => setTopProductsLoading(false))
  }

  const handleEdit = (m: Merchant) => {
    setEditing(m); setProfileOpen(false); setWizardOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const res = await fetch(`/api/merchants?id=${deletingId}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Merchant deleted'); setDeleteOpen(false); setDeletingId(null); fetchData() }
      else { const err = await res.json(); toast.error(err.error || 'Cannot delete') }
    } catch { toast.error('Failed to delete') }
  }

  const handleOpenRateCard = async (m: Merchant) => {
    setSelectedMerchant(m); setProfileOpen(false)
    try {
      const res = await fetch(`/api/rate-card?merchantId=${m.merchantId}`)
      const cards = await res.json()
      if (Array.isArray(cards) && cards.length > 0) {
        const active = cards.find((c: Record<string, unknown>) => c.isActive) || cards[0]
        setRateCard(active)
        setRateForm({
          inboundReceivingPerUnit: Number(active.inboundReceivingPerUnit) || 0,
          storagePerUnitPerDay: Number(active.storagePerUnitPerDay) || 0,
          pickPerUnit: Number(active.pickPerUnit) || 0,
          packPerOrder: Number(active.packPerOrder) || 0,
          returnProcessingPerUnit: Number(active.returnProcessingPerUnit) || 0,
          commissionPercent: Number(active.commissionPercent) || 0,
          codRemittanceFeePerOrder: Number(active.codRemittanceFeePerOrder) || 0,
          codShortfallPenalty: Number(active.codShortfallPenalty) || 0,
        })
      } else { setRateCard(null) }
      setRateCardOpen(true)
    } catch { toast.error('Failed to load rate card') }
  }

  const handleSaveRateCard = async () => {
    if (!selectedMerchant) return
    const method = rateCard ? 'PUT' : 'POST'
    const body = rateCard ? { id: (rateCard as Record<string, string>).id, ...rateForm } : { merchantId: selectedMerchant.merchantId, ...rateForm }
    await fetch('/api/rate-card', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    toast.success('Rate card saved'); setRateCardOpen(false)
  }

  const handleOpenStatement = (m: Merchant) => {
    setSelectedMerchant(m); setProfileOpen(false); setStatementPeriod(new Date().toISOString().slice(0, 7)); setStatementOpen(true)
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

  const contractStatus = (m: Merchant) => {
    if (!m.contractEnd) return null
    const end = new Date(m.contractEnd)
    const now = new Date()
    if (end < now) return { label: 'EXPIRED', color: 'bg-red-100 text-red-700' }
    const daysLeft = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 30) return { label: `${daysLeft}D LEFT`, color: 'bg-orange-100 text-orange-700' }
    return null
  }

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <OpsHeader
        title="Merchants"
        description="Onboard and manage vendor partners"
        kpiCells={[
          { label: 'MERCHANTS', value: totalMerchants },
          { label: 'ACTIVE', value: activeMerchants },
          { label: 'ON HOLD', value: onHoldMerchants, highlight: onHoldMerchants > 0, highlightColor: 'red' as const },
          { label: 'FOLLOW-UPS', value: followUpsDue, highlight: followUpsDue > 0, highlightColor: 'orange' as const },
          { label: 'PENDING PAYMENTS', value: formatCurrencyCompact(totalPending), highlight: totalPending > 0, highlightColor: 'orange' as const },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search merchants..."
        actionLabel="Onboard Merchant"
        onAction={() => { setEditing(null); setWizardOpen(true) }}
      >
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md"><HelpCircle size={12} className="mr-1" /> Help</Button>
        <Button variant="outline" size="sm" onClick={() => setTableOpen(true)} className="h-7 text-xs rounded-md"><Filter size={12} className="mr-1" /> View All</Button>
      </OpsHeader>

      {/* ── Alert banners ── */}
      {onHoldMerchants > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <Pause size={16} className="text-red-600 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="text-red-800 font-semibold">{onHoldMerchants} merchant(s) on hold — inbounds and orders blocked.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.filter(m => m.isOnHold).slice(0, 5).map(m => (
              <button key={m.id} onClick={() => handleExpand(m)} className="bg-white border border-red-300 hover:bg-red-100 rounded-full px-2.5 py-1 text-[11px] font-medium text-red-700">{m.businessName}</button>
            ))}
          </div>
        </div>
      )}
      {followUpsDue > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-orange-600 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="text-orange-800 font-semibold">{followUpsDue} follow-up(s) overdue across {data.filter(m => m.pendingFollowUps > 0).length} merchant(s).</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.filter(m => m.pendingFollowUps > 0).slice(0, 5).map(m => (
              <button key={m.id} onClick={() => handleExpand(m)} className="bg-white border border-orange-300 hover:bg-orange-100 rounded-full px-2.5 py-1 text-[11px] font-medium text-orange-700">{m.businessName}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Search results (inline, not table) ── */}
      {search && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filteredData.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No merchants match "{search}"</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredData.slice(0, 10).map(m => (
                <div key={m.id} onClick={() => handleExpand(m)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.isOnHold ? 'bg-red-500' : m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{m.businessName}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{m.merchantId}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">{deliveryCode(m.deliveryType)}</span>
                  <span className={`text-[11px] font-mono font-bold shrink-0 ${m.profitability.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrencyCompact(m.profitability.net, m.currency)}</span>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </div>
              ))}
              {filteredData.length > 10 && (
                <button onClick={() => setTableOpen(true)} className="w-full px-4 py-2 text-center text-[11px] text-[#FF6B35] font-semibold hover:bg-orange-50">
                  View all {filteredData.length} merchants →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Onboarding CTA (when no search) ── */}
      {!search && !loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Merchant Management</h3>
              <p className="text-[11px] text-gray-500 max-w-md">Onboard new vendors, manage existing accounts, review profitability, configure rate cards, and generate statements. Search above to find a merchant, or click "View All" to see the full list.</p>
            </div>
            <Button className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl shrink-0" onClick={() => { setEditing(null); setWizardOpen(true) }}>
              <Plus size={14} className="mr-1.5" /> Onboard Merchant
            </Button>
          </div>
          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div><p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Active</p><p className="text-lg font-mono font-bold text-green-700">{activeMerchants}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">On Hold</p><p className={`text-lg font-mono font-bold ${onHoldMerchants > 0 ? 'text-red-600' : 'text-gray-400'}`}>{onHoldMerchants}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Pending Payments</p><p className="text-lg font-mono font-bold text-orange-600">{formatCurrencyCompact(totalPending)}</p></div>
            <div><p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Follow-ups</p><p className={`text-lg font-mono font-bold ${followUpsDue > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{followUpsDue}</p></div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-300" /></div>}

      {/* ══ ONBOARDING WIZARD ══ */}
      <OnboardingWizard open={wizardOpen} onClose={() => { setWizardOpen(false); setEditing(null) }} onComplete={handleWizardComplete} editing={editing} />

      {/* ══ TABLE SLIDE-OVER (View All) ══ */}
      <DetailSlideOver
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        title="All Merchants"
        subtitle={`${data.length} total`}
        width="xl"
      >
        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <Filter size={12} className="text-gray-400" />
          {FILTER_CHIPS.map(chip => (
            <button key={chip.key} onClick={() => setActiveFilter(chip.key)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${activeFilter === chip.key ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {chip.label}
            </button>
          ))}
        </div>
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">ID</DenseTh>
              <DenseTh>Business Name</DenseTh>
              <DenseTh className="w-16">Type</DenseTh>
              <DenseTh className="w-16 text-right">SKUs</DenseTh>
              <DenseTh className="w-16 text-right">Orders</DenseTh>
              <DenseTh className="w-28 text-right">Sales</DenseTh>
              <DenseTh className="w-28 text-right">Pending</DenseTh>
              <DenseTh className="w-28 text-right">Storage</DenseTh>
              <DenseTh className="w-28 text-right">Shrinkage</DenseTh>
              <DenseTh className="w-16 text-center">Status</DenseTh>
              <DenseTh className="w-28 text-right">Actions</DenseTh>
            </tr>
          </thead>
          <tbody>
            {data.map(m => (
              <DenseTr key={m.id} onClick={() => { setTableOpen(false); handleExpand(m) }} tint={m.isOnHold ? 'bg-red-50/60' : m.isActive ? '' : 'bg-gray-50/50'}>
                <DenseTd mono className="text-gray-500">{m.merchantId}</DenseTd>
                <DenseTd className="text-gray-900 font-medium">
                  <div className="flex items-center gap-1.5">
                    {m.isOnHold && <Pause size={11} className="text-red-500" />}
                    {m.businessName}
                  </div>
                </DenseTd>
                <DenseTd mono className="text-gray-600">{deliveryCode(m.deliveryType)}</DenseTd>
                <DenseTd mono right className={m.productCount > 0 ? 'text-gray-700' : 'text-gray-300'}>{m.productCount}</DenseTd>
                <DenseTd mono right className={m.orderCount > 0 ? 'text-gray-700' : 'text-gray-300'}>{m.orderCount}</DenseTd>
                <DenseTd mono right className="text-gray-700">{formatCurrencyCompact(m.totalSalesValue, m.currency)}</DenseTd>
                <DenseTd mono right className={m.pendingPayment > 0 ? 'text-orange-700 font-bold' : 'text-gray-400'}>{formatCurrencyCompact(m.pendingPayment, m.currency)}</DenseTd>
                <DenseTd mono right className={m.storageLiabilityBalance > 0 ? 'text-blue-700' : 'text-gray-400'}>{formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}</DenseTd>
                <DenseTd mono right className={m.totalShrinkageValue > 0 ? 'text-red-600' : 'text-gray-400'}>{formatCurrencyCompact(m.totalShrinkageValue, m.currency)}</DenseTd>
                <DenseTd className="text-center">
                  <button onClick={(e) => { e.stopPropagation(); handleToggleActive(m) }} title={m.isActive ? 'Deactivate' : 'Activate'}>
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </button>
                </DenseTd>
                <DenseTd right>
                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleHoldToggle(m)} title={m.isOnHold ? 'Release' : 'Hold'} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${m.isOnHold ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{m.isOnHold ? 'Hold' : 'Hold'}</button>
                    <button onClick={() => handleOpenRateCard(m)} title="Rate card" className="p-1 text-gray-400 hover:text-[#FF6B35]"><SettingsIcon size={12} /></button>
                    <button onClick={() => handleOpenStatement(m)} title="Statement" className="p-1 text-gray-400 hover:text-[#FF6B35]"><FileText size={12} /></button>
                  </div>
                </DenseTd>
              </DenseTr>
            ))}
          </tbody>
        </DenseTable>
      </DetailSlideOver>

      {/* ══ PROFILE SLIDE-OVER ══ */}
      <DetailSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={selectedMerchant?.businessName || ''}
        subtitle={selectedMerchant ? `${selectedMerchant.merchantId} · ${deliveryLabel(selectedMerchant.deliveryType)}` : ''}
        width="lg"
        footer={selectedMerchant ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => handleEdit(selectedMerchant)}><SettingsIcon size={12} className="mr-1" /> Edit</Button>
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => handleOpenRateCard(selectedMerchant)}><FileText size={12} className="mr-1" /> Rate Card</Button>
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => handleOpenStatement(selectedMerchant)}><Calendar size={12} className="mr-1" /> Statement</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className={`rounded-xl text-xs ${selectedMerchant.isOnHold ? 'text-red-600 border-red-200' : ''}`} onClick={() => handleHoldToggle(selectedMerchant)}>
                {selectedMerchant.isOnHold ? <><Play size={12} className="mr-1" /> Release</> : <><Pause size={12} className="mr-1" /> Hold</>}
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setProfileOpen(false)}>Close</Button>
            </div>
          </div>
        ) : undefined}
      >
        {selectedMerchant && (() => {
          const m = selectedMerchant
          const cats = m.productCategories ? JSON.parse(m.productCategories) as string[] : []
          const channels = m.communicationChannels ? JSON.parse(m.communicationChannels) as string[] : []
          const addresses = m.deliveryAddresses ? JSON.parse(m.deliveryAddresses) as Array<{ label: string; address: string }> : []
          return (
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${m.isOnHold ? 'bg-red-500' : m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-[11px] font-medium text-gray-700">{m.isOnHold ? 'On hold' : m.isActive ? 'Active' : 'Inactive'}</span>
                {m.isOnHold && <span className="text-[10px] text-red-600">{m.holdReason || 'No reason'}</span>}
                <span className="text-[10px] text-gray-400 ml-auto">Last inbound: {timeAgo(m.lastInboundAt)}</span>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">SKUs</p>
                  <p className="text-lg font-bold text-gray-900 font-mono">{m.productCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Orders</p>
                  <p className="text-lg font-bold text-gray-900 font-mono">{m.orderCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Net</p>
                  <p className={`text-lg font-bold font-mono ${m.profitability.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrencyCompact(m.profitability.net, m.currency)}</p>
                </div>
              </div>

              {/* Profitability breakdown */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Profitability</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Revenue</span><span className="font-mono font-medium text-gray-900">{formatCurrencyCompact(m.profitability.revenue, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Commission</span><span className="font-mono font-medium text-orange-700">−{formatCurrencyCompact(m.profitability.commission, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Shrinkage</span><span className="font-mono font-medium text-red-600">−{formatCurrencyCompact(m.profitability.shrinkage, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Returns</span><span className="font-mono font-medium text-red-500">−{formatCurrencyCompact(m.profitability.returns, m.currency)}</span></div>
                  <div className="flex justify-between pt-1.5 border-t border-gray-200"><span className="text-gray-700 font-semibold">Net</span><span className={`font-mono font-bold ${m.profitability.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrencyCompact(m.profitability.net, m.currency)}</span></div>
                </div>
              </div>

              {/* Top products */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Top Products by Revenue</p>
                {topProductsLoading ? <p className="text-xs text-gray-400">Loading...</p> :
                 topProducts.length > 0 ? (
                  <div className="space-y-1">
                    {topProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-gray-400 w-4">{i + 1}</span>
                        <span className="text-gray-700 flex-1 truncate">{p.productName}</span>
                        <span className="font-mono text-gray-500">{p.qty}u</span>
                        <span className="font-mono font-semibold text-gray-900">{formatCurrencyCompact(p.revenue, m.currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {m.statements.slice(0, 3).map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-gray-400">{s.period}</span>
                        <span className="text-gray-700 flex-1">{s.statementId}</span>
                        <span className={`font-mono font-semibold ${s.isPaid ? 'text-green-700' : 'text-orange-700'}`}>{formatCurrencyCompact(s.netPayable, m.currency)}</span>
                        <span className={`px-1 rounded text-[8px] font-semibold ${s.isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{s.status}</span>
                      </div>
                    ))}
                    {m.statements.length === 0 && <p className="text-xs text-gray-400">No statements generated yet.</p>}
                  </div>
                )}
              </div>

              {/* Contact + Business */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><Phone size={10} /> Contact</p>
                  <div className="space-y-0.5 text-xs">
                    <p className="text-gray-900 font-medium">{m.contact}</p>
                    <p className="text-gray-500">{m.email}</p>
                    {m.contactPerson && <p className="text-gray-500">Attn: {m.contactPerson}</p>}
                    {m.altPhone && <p className="text-gray-500">{m.altPhone}</p>}
                    {channels.length > 0 && <p className="text-gray-400 text-[10px] mt-1">Prefers: {channels.join(', ')}</p>}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><Building2 size={10} /> Business</p>
                  <div className="space-y-0.5 text-xs">
                    {m.taxId && <p className="text-gray-700">TIN: <span className="font-mono">{m.taxId}</span></p>}
                    <p className="text-gray-700">Delivery: {deliveryLabel(m.deliveryType)}</p>
                    <p className="text-gray-700">Currency: {m.currency}</p>
                    {m.paymentTerms && <p className="text-gray-500">Terms: {PAYMENT_TERMS.find(p => p.value === m.paymentTerms)?.label || m.paymentTerms}</p>}
                    {m.bankName && <p className="text-gray-500">{m.bankName}</p>}
                  </div>
                </div>
              </div>

              {/* Delivery addresses (self-delivery / drop-ship only) */}
              {addresses.length > 0 && (m.deliveryType === 'self-delivery' || m.deliveryType === 'drop-ship') && (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><MapPin size={10} /> Delivery Addresses</p>
                  <div className="space-y-1 text-xs">
                    {addresses.map((a, i) => (
                      <div key={i}>
                        <span className="text-gray-700 font-medium">{a.label}</span>
                        <p className="text-gray-500 text-[11px]">{a.address}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product categories */}
              {cats.length > 0 && (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Categories Supplied</p>
                  <div className="flex flex-wrap gap-1">
                    {cats.map(c => <span key={c} className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[10px] text-gray-700 font-medium">{c}</span>)}
                  </div>
                </div>
              )}

              {/* Financials */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Financials</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="font-mono text-orange-600">{formatCurrencyCompact(m.pendingPayment, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Storage</span><span className="font-mono text-blue-600">{formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-mono text-green-700">{formatCurrencyCompact(m.actualPayment, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Inbound Value</span><span className="font-mono text-gray-700">{formatCurrencyCompact(m.totalInboundValue, m.currency)}</span></div>
                </div>
              </div>
            </div>
          )
        })()}
      </DetailSlideOver>

      {/* ══ HOLD DIALOG ══ */}
      <AlertDialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Pause size={18} className="text-red-600" /> Place on Hold</AlertDialogTitle>
            <AlertDialogDescription>
              {holdMerchant?.businessName} will be blocked from receiving inbounds and creating orders until released.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Reason</Label>
            <Input value={holdReason} onChange={e => setHoldReason(e.target.value)} placeholder="e.g., Overdue statement balance" className="rounded-xl" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleHoldConfirm} className="rounded-xl bg-red-600 hover:bg-red-700">Place Hold</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ RATE CARD SLIDE-OVER ══ */}
      <DetailSlideOver
        open={rateCardOpen}
        onClose={() => setRateCardOpen(false)}
        title="Rate Card"
        subtitle={selectedMerchant?.businessName || ''}
        width="md"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setRateCardOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSaveRateCard}>Save</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">Fees charged to this merchant per unit or per order. Changing these rates creates a new active rate card (the old one is superseded).</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'inboundReceivingPerUnit', label: 'Receiving per unit' },
              { key: 'storagePerUnitPerDay', label: 'Storage per unit/day' },
              { key: 'pickPerUnit', label: 'Pick per unit' },
              { key: 'packPerOrder', label: 'Pack per order' },
              { key: 'returnProcessingPerUnit', label: 'Return processing' },
              { key: 'commissionPercent', label: 'Commission %' },
              { key: 'codRemittanceFeePerOrder', label: 'COD fee per order' },
              { key: 'codShortfallPenalty', label: 'COD shortfall penalty' },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-gray-700 font-medium mb-1 block text-[10px]">{f.label}</Label>
                <Input type="number" value={String((rateForm as Record<string, number>)[f.key] || 0)} onChange={e => setRateForm({ ...rateForm, [f.key]: parseFloat(e.target.value) || 0 })} className="rounded-lg text-xs h-8" />
              </div>
            ))}
          </div>
        </div>
      </DetailSlideOver>

      {/* ══ STATEMENT DIALOG ══ */}
      <AlertDialog open={statementOpen} onOpenChange={setStatementOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><FileText size={18} /> Generate Statement</AlertDialogTitle>
            <AlertDialogDescription>
              Generate a monthly statement for {selectedMerchant?.businessName}. This rolls up all fees, sales, returns, and shrinkage into a net payable figure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Period (YYYY-MM)</Label>
            <Input type="month" value={statementPeriod} onChange={e => setStatementPeriod(e.target.value)} className="rounded-xl" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateStatement} className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ HELP DIALOG ══ */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Merchants</AlertDialogTitle>
            <AlertDialogDescription>
              Onboard and manage vendor partners. Search for a merchant above, or click "View All" to see the full list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Onboarding</p>
              <p>Click "Onboard Merchant" to start a 5-step wizard: business details, financial terms, delivery setup, product categories, and communication preferences.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Search</p>
              <p>Type a merchant name, ID, or contact to find them. Click a result to open their profile.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">View All</p>
              <p>Click "View All" to open the full merchant table with all columns, filters, and inline actions.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Profile</p>
              <p>Each merchant profile shows profitability breakdown, top products, contact details, delivery addresses, rate card access, and statement generation.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Hold</p>
              <p>Placing a merchant on hold blocks all inbounds and orders. Requires a reason. Release from the profile or the table.</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
