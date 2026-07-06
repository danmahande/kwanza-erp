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
import { Trash2, Settings as SettingsIcon, FileText, Filter, ChevronDown, ChevronRight, Upload, Download, Clock, ArrowDownRight, ArrowUpRight, DollarSign, AlertTriangle, RotateCcw, PackageX, Calendar, CheckCircle2, Phone, Building2, Pause, Play, MessageSquare, Plus, BarChart3, AlertOctagon } from 'lucide-react'
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
  isOnHold: boolean
  holdReason: string | null
  holdSetAt: string | null
  holdSetBy: string | null
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
  lastCommunicationAt: string | null
  lastCommunicationType: string | null
  lastCommunicationSubject: string | null
  pendingFollowUps: number
  profitability: { revenue: number; commission: number; shrinkage: number; returns: number; net: number }
  statements: Array<{
    id: string; statementId: string; period: string; netPayable: number
    isPaid: boolean; status: string; createdAt: string
  }>
}

interface CommunicationEntry {
  id: string
  merchantId: string
  type: string
  direction: string
  subject: string
  notes: string | null
  recordedBy: string
  followUpAt: string | null
  isResolved: boolean
  createdAt: string
}

interface PerformanceData {
  merchantId: string
  businessName: string
  currency: string
  window: { days: number; since: string }
  totals: {
    orders: number; delivered: number; cancelled: number; failed: number; inTransit: number
    returns: number; rma: number; shrinkageQty: number; shrinkageValue: number
    inboundQty: number; inboundValue: number
  }
  rates: {
    successRate: number; firstAttemptRate: number; returnsRate: number
    cancellationRate: number; codRate: number
  }
  cycleTime: { avgHours: number; avgDays: number; samples: number }
  cod: { totalSale: number; totalCollected: number; shortfall: number }
  sparkline: Array<{ date: string; total: number; delivered: number }>
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
  { key: 'onhold', label: 'On Hold', deliveryType: '', status: 'onhold' },
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

  // Slide-over tab state: 'overview' | 'performance' | 'communication'
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'communication'>('overview')
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [perfWindow, setPerfWindow] = useState(30)
  const [commEntries, setCommEntries] = useState<CommunicationEntry[]>([])
  const [commLoading, setCommLoading] = useState(false)
  const [commForm, setCommForm] = useState({ type: 'call', direction: 'outbound', subject: '', notes: '', followUpAt: '', isResolved: true })
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [holdReason, setHoldReason] = useState('')

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
  const onHoldMerchants = data.filter(m => m.isOnHold).length
  const totalPending = data.reduce((s, m) => s + (m.pendingPayment || 0), 0)
  const totalStorage = data.reduce((s, m) => s + (m.storageLiabilityBalance || 0), 0)
  const followUpsDue = data.reduce((s, m) => s + (m.pendingFollowUps || 0), 0)

  const kpiCells = [
    { label: 'MERCHANTS', value: totalMerchants },
    { label: 'ACTIVE', value: activeMerchants },
    { label: 'ON HOLD', value: onHoldMerchants, highlight: onHoldMerchants > 0, highlightColor: 'red' as const },
    { label: 'FOLLOW-UPS DUE', value: followUpsDue, highlight: followUpsDue > 0, highlightColor: 'orange' as const },
    { label: 'PENDING PAYMENTS', value: formatCurrencyCompact(totalPending), highlight: totalPending > 0, highlightColor: 'orange' as const },
    { label: 'STORAGE LIABILITY', value: formatCurrencyCompact(totalStorage) },
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
    setActiveTab('overview')
    setPerformanceData(null)
    setCommEntries([])
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

  // Load performance data when Performance tab is opened
  const loadPerformance = async (merchant: Merchant, days: number) => {
    setPerformanceLoading(true)
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/performance?days=${days}`)
      const d = await res.json()
      setPerformanceData(d)
    } catch {
      setPerformanceData(null)
      toast.error('Failed to load performance')
    } finally {
      setPerformanceLoading(false)
    }
  }

  // Load communication entries when Communication tab is opened
  const loadCommunication = async (merchant: Merchant) => {
    setCommLoading(true)
    try {
      const res = await fetch(`/api/merchant-communication?merchantId=${merchant.merchantId}&limit=50`)
      const d = await res.json()
      setCommEntries(Array.isArray(d) ? d : [])
    } catch {
      setCommEntries([])
    } finally {
      setCommLoading(false)
    }
  }

  // Switch tab + lazy-load data
  const handleTabSwitch = (tab: 'overview' | 'performance' | 'communication') => {
    setActiveTab(tab)
    if (!selectedMerchant) return
    if (tab === 'performance' && !performanceData) loadPerformance(selectedMerchant, perfWindow)
    if (tab === 'communication' && commEntries.length === 0) loadCommunication(selectedMerchant)
  }

  // Change performance window
  const handlePerfWindowChange = (days: number) => {
    setPerfWindow(days)
    if (selectedMerchant) loadPerformance(selectedMerchant, days)
  }

  // Save new communication entry
  const handleSaveComm = async () => {
    if (!selectedMerchant) return
    if (!commForm.subject.trim()) { toast.error('Subject is required'); return }
    try {
      const res = await fetch('/api/merchant-communication', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedMerchant.merchantId,
          type: commForm.type,
          direction: commForm.direction,
          subject: commForm.subject,
          notes: commForm.notes || null,
          recordedBy: 'admin',
          followUpAt: commForm.followUpAt ? new Date(commForm.followUpAt).toISOString() : null,
          isResolved: commForm.isResolved,
        }),
      })
      if (res.ok) {
        toast.success('Communication logged')
        setCommForm({ type: 'call', direction: 'outbound', subject: '', notes: '', followUpAt: '', isResolved: true })
        loadCommunication(selectedMerchant)
        fetchData()
      } else { toast.error('Failed to log') }
    } catch { toast.error('Failed to log') }
  }

  // Delete communication entry
  const handleDeleteComm = async (id: string) => {
    if (!selectedMerchant) return
    await fetch(`/api/merchant-communication?id=${id}`, { method: 'DELETE' })
    toast.success('Entry deleted')
    loadCommunication(selectedMerchant)
    fetchData()
  }

  // Toggle resolved state of a comm entry
  const handleToggleResolved = async (entry: CommunicationEntry) => {
    if (!selectedMerchant) return
    await fetch('/api/merchant-communication', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, isResolved: !entry.isResolved }),
    })
    loadCommunication(selectedMerchant)
    fetchData()
  }

  // Toggle hold status: opens dialog to capture reason when placing on hold
  const handleHoldToggle = (merchant: Merchant) => {
    if (merchant.isOnHold) {
      // Release: no reason needed
      fetch('/api/merchants', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: merchant.id, isOnHold: false }),
      }).then(() => {
        toast.success(`${merchant.businessName} released from hold`)
        fetchData()
        if (selectedMerchant?.id === merchant.id) setSelectedMerchant({ ...merchant, isOnHold: false })
      })
    } else {
      setHoldReason('')
      setHoldDialogOpen(true)
    }
  }

  const handleConfirmHold = async () => {
    if (!selectedMerchant) return
    await fetch('/api/merchants', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedMerchant.id, isOnHold: true, holdReason: holdReason || 'Overdue balance / dispute', holdSetBy: 'admin' }),
    })
    toast.success(`${selectedMerchant.businessName} placed on hold`)
    setHoldDialogOpen(false)
    setSelectedMerchant({ ...selectedMerchant, isOnHold: true, holdReason: holdReason || 'Overdue balance / dispute' })
    fetchData()
  }

  // #17: CSV import: parse and bulk create
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

  // Generate merchant financial report as CSV
  const handleExportReport = () => {
    if (data.length === 0) { toast.error('No merchants to export'); return }
    const headers = [
      'Merchant ID', 'Business Name', 'Delivery Type', 'Status', 'On Hold',
      'Contact', 'Email', 'Currency',
      'Total Inbound Value', 'Total Sales Value', 'Total Shrinkage Value', 'Total Return Value',
      'Expected Payment', 'Actual Payment', 'Pending Payment', 'Storage Liability',
      'Product Count', 'Order Count',
      'Profitability Revenue', 'Profitability Commission', 'Profitability Shrinkage', 'Profitability Returns', 'Profitability Net',
      'Last Inbound', 'Last Outbound', 'Last Payment', 'Last Communication',
      'Pending Follow-ups', 'Contract Start', 'Contract End',
    ]
    const rows = data.map(m => [
      m.merchantId, m.businessName, m.deliveryType || 'self-delivery',
      m.isActive ? 'Active' : 'Inactive', m.isOnHold ? 'Yes' : 'No',
      m.contact, m.email, m.currency,
      m.totalInboundValue, m.totalSalesValue, m.totalShrinkageValue, m.totalReturnValue,
      m.expectedPayment, m.actualPayment, m.pendingPayment, m.storageLiabilityBalance,
      m.productCount, m.orderCount,
      m.profitability.revenue, m.profitability.commission, m.profitability.shrinkage, m.profitability.returns, m.profitability.net,
      m.lastInboundAt ? new Date(m.lastInboundAt).toLocaleDateString('en-UG') : '',
      m.lastOutboundAt ? new Date(m.lastOutboundAt).toLocaleDateString('en-UG') : '',
      m.lastPaymentAt ? new Date(m.lastPaymentAt).toLocaleDateString('en-UG') : '',
      m.lastCommunicationAt ? new Date(m.lastCommunicationAt).toLocaleDateString('en-UG') : '',
      m.pendingFollowUps,
      m.contractStart ? new Date(m.contractStart).toLocaleDateString('en-UG') : '',
      m.contractEnd ? new Date(m.contractEnd).toLocaleDateString('en-UG') : '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `merchant-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${data.length} merchants to CSV`)
  }

  // #13: Contract status helper
  const contractStatus = (m: Merchant): { label: string; color: string } | null => {
    if (!m.contractStart && !m.contractEnd) return null
    const now = new Date()
    if (m.contractEnd && new Date(m.contractEnd) < now) return { label: 'EXPIRED', color: 'bg-red-100 text-red-700' }
    if (m.contractEnd) {
      const daysLeft = Math.ceil((new Date(m.contractEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 7) return { label: `${daysLeft}d LEFT`, color: 'bg-red-100 text-red-700' }
      if (daysLeft <= 30) return { label: `${daysLeft}d LEFT`, color: 'bg-orange-100 text-orange-700' }
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
        <Button variant="outline" size="sm" onClick={handleExportReport} className="h-7 text-xs rounded-md">
          <Download size={12} className="mr-1" /> Export Report
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-7 text-xs rounded-md">
          <Upload size={12} className="mr-1" /> Import CSV
        </Button>
      </OpsHeader>

      {/* Filter chips (#6, #7) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        {FILTER_CHIPS.map(chip => {
          const count = chip.key === 'all' ? data.length : data.filter(m => {
            if (chip.status === 'active') return m.isActive && !m.isOnHold
            if (chip.status === 'inactive') return !m.isActive
            if (chip.status === 'onhold') return m.isOnHold
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

      {/* Follow-ups due banner */}
      {followUpsDue > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-orange-600 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="text-orange-800 font-semibold">{followUpsDue} follow-up{followUpsDue > 1 ? 's' : ''} overdue across {data.filter(m => m.pendingFollowUps > 0).length} merchant{data.filter(m => m.pendingFollowUps > 0).length > 1 ? 's' : ''}</p>
            <p className="text-orange-600 text-[11px] mt-0.5">Open a merchant profile → Communication tab to resolve or reschedule.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.filter(m => m.pendingFollowUps > 0).slice(0, 5).map(m => (
              <button key={m.id} onClick={() => { handleExpand(m); setActiveTab('communication'); }}
                className="bg-white border border-orange-300 hover:bg-orange-100 rounded-full px-2.5 py-1 text-[11px] font-medium text-orange-700">
                {m.businessName}, {m.pendingFollowUps}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* On-hold warning banner */}
      {onHoldMerchants > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
          <Pause size={16} className="text-red-600 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="text-red-800 font-semibold">{onHoldMerchants} merchant{onHoldMerchants > 1 ? 's' : ''} on hold. New inbounds and orders blocked.</p>
            <p className="text-red-600 text-[11px] mt-0.5">Click the red square in the status column to release a hold.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {data.filter(m => m.isOnHold).slice(0, 5).map(m => (
              <button key={m.id} onClick={() => handleExpand(m)}
                className="bg-white border border-red-300 hover:bg-red-100 rounded-full px-2.5 py-1 text-[11px] font-medium text-red-700">
                {m.businessName}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  <DenseTr key={m.id} onClick={() => handleExpand(m)} tint={m.isOnHold ? 'bg-red-50/60' : m.isActive ? '' : 'bg-gray-50/50'}>
                    <DenseTd mono className="text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        <span>{m.merchantId}</span>
                        {m.pendingFollowUps > 0 && <span className="text-[8px] text-orange-600 font-semibold" title={`${m.pendingFollowUps} follow-up(s) due`}>●{m.pendingFollowUps}FU</span>}
                      </div>
                    </DenseTd>
                    <DenseTd className="text-gray-900 font-medium">
                      <div className="flex items-center gap-1.5">
                        {m.isOnHold && <span title={`On hold: ${m.holdReason || 'no reason'}`}><Pause size={11} className="text-red-500" /></span>}
                        <span>{m.businessName}</span>
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
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleToggleActive(m) }} title={m.isActive ? 'Click to deactivate' : 'Click to activate'}>
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 hover:bg-gray-400'}`} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleHoldToggle(m) }} title={m.isOnHold ? 'Click to release hold' : 'Click to place on hold'}>
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${m.isOnHold ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'}`} />
                          </button>
                        </div>
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

      {/* Profile slide-over */}
      <DetailSlideOver
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={selectedMerchant?.businessName || ''}
        subtitle={selectedMerchant ? `${selectedMerchant.merchantId}, ${(selectedMerchant.deliveryType || 'self-delivery').replace('-', ' ')}` : ''}
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
                <span className={`w-3 h-3 rounded-full ${m.isOnHold ? 'bg-red-500' : m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px] font-mono">{m.merchantId}</Badge>
                <span className="text-[10px] capitalize px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{(m.deliveryType || 'self-delivery').replace('-', ' ')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{m.currency}</span>
                {m.isOnHold && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 flex items-center gap-1"><Pause size={9} /> ON HOLD</span>}
                {(() => { const cs = contractStatus(m); return cs ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cs.color}`}>{cs.label}</span> : null })()}
                {m.pendingFollowUps > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">{m.pendingFollowUps} follow-up{m.pendingFollowUps > 1 ? 's' : ''} due</span>}
                <div className="flex items-center gap-2 ml-auto text-[10px] text-gray-400">
                  <span>In: <span className="font-medium text-gray-600">{timeAgo(m.lastInboundAt)}</span></span>
                  <span>·</span>
                  <span>Out: <span className="font-medium text-gray-600">{timeAgo(m.lastOutboundAt)}</span></span>
                  <span>·</span>
                  <span>Pay: <span className="font-medium text-gray-600">{timeAgo(m.lastPaymentAt)}</span></span>
                </div>
              </div>

              {/* Action icon buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleEdit(m) }}><SettingsIcon size={12} className="mr-1" /> Edit</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleOpenRateCard(m) }}><FileText size={12} className="mr-1" /> Rate Card</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { setProfileOpen(false); handleOpenStatement(m) }}><Calendar size={12} className="mr-1" /> Statement</Button>
                <Button variant="outline" size="sm" className={`h-7 text-xs rounded-md ${m.isOnHold ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}`} onClick={() => handleHoldToggle(m)}>
                  {m.isOnHold ? <><Play size={12} className="mr-1" /> Release Hold</> : <><Pause size={12} className="mr-1" /> Place on Hold</>}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => handleToggleActive(m)}>{m.isActive ? 'Deactivate' : 'Activate'}</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-md text-red-600 border-red-200 hover:bg-red-50 ml-auto" onClick={() => { setProfileOpen(false); setDeletingId(m.id); setDeleteOpen(true) }}><Trash2 size={12} className="mr-1" /> Delete</Button>
              </div>

              {/* On-hold banner when merchant is on hold */}
              {m.isOnHold && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertOctagon size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-red-700">Service held. New inbounds and orders blocked.</p>
                    <p className="text-red-600 mt-0.5">Reason: {m.holdReason || 'Not specified'}</p>
                    {m.holdSetAt && <p className="text-red-500 text-[10px] mt-0.5">Set {timeAgo(m.holdSetAt)} by {m.holdSetBy || 'admin'}</p>}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex items-center gap-1 border-b border-gray-200">
                {[
                  { key: 'overview' as const, label: 'Overview', icon: Building2 },
                  { key: 'performance' as const, label: 'Performance', icon: BarChart3 },
                  { key: 'communication' as const, label: 'Communication', icon: MessageSquare, badge: m.pendingFollowUps },
                ].map(t => {
                  const isActive = activeTab === t.key
                  const Icon = t.icon
                  return (
                    <button key={t.key} onClick={() => handleTabSwitch(t.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${isActive ? 'border-[#FF6B35] text-[#FF6B35]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      <Icon size={12} /> {t.label}
                      {t.badge && t.badge > 0 ? <span className="bg-orange-500 text-white text-[9px] px-1 py-0.5 rounded-full font-bold leading-none">{t.badge}</span> : null}
                    </button>
                  )
                })}
              </div>

              {/* ===== OVERVIEW TAB ===== */}
              {activeTab === 'overview' && (
                <>
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
                </>
              )}

              {/* ===== PERFORMANCE TAB ===== */}
              {activeTab === 'performance' && (
                <div className="space-y-3">
                  {/* Window selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Performance window:</span>
                    {[7, 30, 90].map(d => (
                      <button key={d} onClick={() => handlePerfWindowChange(d)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${perfWindow === d ? 'bg-[#FF6B35] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {d}d
                      </button>
                    ))}
                  </div>

                  {performanceLoading ? (
                    <div className="py-12 text-center text-xs text-gray-400">Computing performance metrics...</div>
                  ) : performanceData ? (
                    <>
                      {/* Single dense card with all rates */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Delivery Performance ({performanceData.window.days}d)</h3>
                        <div className="space-y-3">
                          {[
                            { label: 'Success Rate', value: performanceData.rates.successRate, sub: `${performanceData.totals.delivered} of ${performanceData.totals.orders} delivered`, good: 85, ok: 60, invert: false },
                            { label: 'First Attempt Success', value: performanceData.rates.firstAttemptRate, sub: 'delivered on first try', good: 70, ok: 50, invert: false },
                            { label: 'Returns Rate', value: performanceData.rates.returnsRate, sub: `${performanceData.totals.returns} RTV records`, good: 5, ok: 15, invert: true },
                            { label: 'Cancellation Rate', value: performanceData.rates.cancellationRate, sub: `${performanceData.totals.cancelled} cancelled`, good: 5, ok: 10, invert: true },
                            { label: 'COD Collection Rate', value: performanceData.rates.codRate, sub: `${formatCurrencyCompact(performanceData.cod.totalCollected, performanceData.currency)} of ${formatCurrencyCompact(performanceData.cod.totalSale, performanceData.currency)}`, good: 90, ok: 70, invert: false },
                          ].map((m, i) => {
                            const color = m.invert
                              ? (m.value <= m.good ? 'green' : m.value <= m.ok ? 'orange' : 'red')
                              : (m.value >= m.good ? 'green' : m.value >= m.ok ? 'orange' : 'red')
                            const barColor = color === 'green' ? 'bg-green-500' : color === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                            const textColor = color === 'green' ? 'text-green-700' : color === 'orange' ? 'text-orange-700' : 'text-red-700'
                            return (
                              <div key={i}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-500">{m.label}</span>
                                  <span className={`font-mono font-bold text-sm ${textColor}`}>{m.value}%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(m.value, 100)}%` }} />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-0.5">{m.sub}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Cycle time + 7-day volume */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Cycle Time</h3>
                          <p className="text-2xl font-mono font-bold text-gray-900">{performanceData.cycleTime.avgDays}<span className="text-xs text-gray-400 ml-1">days</span></p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{performanceData.cycleTime.avgHours}h avg, {performanceData.cycleTime.samples} samples</p>
                          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-[10px]">
                            <div><span className="text-gray-400">In Transit:</span> <span className="font-mono font-bold text-blue-600">{performanceData.totals.inTransit}</span></div>
                            <div><span className="text-gray-400">Failed:</span> <span className="font-mono font-bold text-red-600">{performanceData.totals.failed}</span></div>
                            <div><span className="text-gray-400">RMA:</span> <span className="font-mono font-bold text-red-500">{performanceData.totals.rma}</span></div>
                            <div><span className="text-gray-400">Shrinkage:</span> <span className="font-mono font-bold text-red-600">{performanceData.totals.shrinkageQty}u</span></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">7-Day Volume</h3>
                          <div className="flex items-end gap-1 h-12 mt-1">
                            {performanceData.sparkline.map((d, i) => {
                              const maxVol = Math.max(...performanceData.sparkline.map(s => s.total), 1)
                              const totalH = (d.total / maxVol) * 100
                              const delivH = d.total > 0 ? (d.delivered / d.total) * totalH : 0
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.delivered}/${d.total} delivered`}>
                                  <div className="w-full flex flex-col justify-end h-10 relative">
                                    <div className="w-full bg-orange-200 rounded-t" style={{ height: `${totalH}%` }} />
                                    <div className="w-full bg-orange-500 absolute bottom-0" style={{ height: `${delivH}%` }} />
                                  </div>
                                  <span className="text-[8px] text-gray-400">{d.date.slice(-2)}</span>
                                </div>
                              )
                            })}
                          </div>
                          <p className="text-[9px] text-gray-400 mt-1">Dark = delivered, light = total</p>
                        </div>
                      </div>

                      {/* COD reconciliation */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">COD Reconciliation ({performanceData.window.days}d)</h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between py-1 border-b border-gray-100">
                            <span className="text-gray-500">Total Sales Value</span>
                            <span className="font-mono font-bold text-gray-900">{formatCurrency(performanceData.cod.totalSale, performanceData.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between py-1 border-b border-gray-100">
                            <span className="text-gray-500">Cash Collected by Drivers</span>
                            <span className="font-mono font-bold text-green-700">{formatCurrency(performanceData.cod.totalCollected, performanceData.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between py-1 border-b border-gray-100">
                            <span className="text-gray-500">Collection Shortfall</span>
                            <span className={`font-mono font-bold ${performanceData.cod.shortfall > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(performanceData.cod.shortfall, performanceData.currency)}</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-gray-500">Inbound Value Received</span>
                            <span className="font-mono font-bold text-gray-900">{formatCurrency(performanceData.totals.inboundValue, performanceData.currency)} <span className="text-[10px] text-gray-400">({performanceData.totals.inboundQty}u)</span></span>
                          </div>
                        </div>
                        {performanceData.cod.shortfall > 0 && (
                          <p className="text-[10px] text-orange-600 mt-2 pt-2 border-t border-gray-100">⚠ Cash collection shortfall. Check driver banking or undelivered orders.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-xs text-gray-400">No performance data</div>
                  )}
                </div>
              )}

              {/* ===== COMMUNICATION TAB ===== */}
              {activeTab === 'communication' && (
                <div className="space-y-3">
                  {/* Add new entry form */}
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2">
                    <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1"><Plus size={10} /> Log New Communication</p>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={commForm.type} onChange={e => setCommForm({ ...commForm, type: e.target.value })}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs">
                        <option value="call">Call</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">Email</option>
                        <option value="visit">Visit</option>
                        <option value="meeting">Meeting</option>
                        <option value="other">Other</option>
                      </select>
                      <select value={commForm.direction} onChange={e => setCommForm({ ...commForm, direction: e.target.value })}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs">
                        <option value="outbound">Outbound (we reached out)</option>
                        <option value="inbound">Inbound (they reached out)</option>
                      </select>
                      <Input type="datetime-local" value={commForm.followUpAt} onChange={e => setCommForm({ ...commForm, followUpAt: e.target.value })}
                        className="rounded-md text-xs h-8" title="Schedule follow-up (optional)" />
                    </div>
                    <Input placeholder="Subject, e.g. Late COD remittance for June statement" value={commForm.subject}
                      onChange={e => setCommForm({ ...commForm, subject: e.target.value })} className="rounded-md text-xs h-8" />
                    <textarea placeholder="Notes: what was discussed, what was agreed" value={commForm.notes}
                      onChange={e => setCommForm({ ...commForm, notes: e.target.value })} rows={2}
                      className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs" />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={commForm.isResolved} onChange={e => setCommForm({ ...commForm, isResolved: e.target.checked })}
                          className="rounded" />
                        Resolved (no follow-up needed)
                      </label>
                      <Button size="sm" className="h-7 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={handleSaveComm}>
                        <Plus size={11} className="mr-1" /> Log Entry
                      </Button>
                    </div>
                  </div>

                  {/* List of entries */}
                  {commLoading ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading communication log...</div>
                  ) : commEntries.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">No communication logged yet.<br />Use the form above to log the first call, WhatsApp, or visit.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {commEntries.map(e => {
                        const isOverdue = !e.isResolved && e.followUpAt && new Date(e.followUpAt) < new Date()
                        const typeColor: Record<string, string> = { call: 'bg-blue-500', whatsapp: 'bg-green-500', email: 'bg-purple-500', visit: 'bg-orange-500', meeting: 'bg-pink-500', other: 'bg-gray-400' }
                        const typeIcon: Record<string, string> = { call: '📞', whatsapp: '💬', email: '✉', visit: '🚶', meeting: '👥', other: '•' }
                        return (
                          <div key={e.id} className={`bg-white border rounded-lg p-2.5 ${isOverdue ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200'}`}>
                            <div className="flex items-start gap-2">
                              <span className={`w-6 h-6 rounded-full ${typeColor[e.type] || 'bg-gray-400'} text-white flex items-center justify-center text-xs shrink-0`}>{typeIcon[e.type] || '•'}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] uppercase font-semibold text-gray-500">{e.type}</span>
                                  <span className={`text-[9px] px-1 rounded ${e.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{e.direction === 'inbound' ? '← in' : '→ out'}</span>
                                  {e.isResolved ? (
                                    <span className="text-[9px] px-1 rounded bg-green-100 text-green-700">RESOLVED</span>
                                  ) : (
                                    <span className={`text-[9px] px-1 rounded ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>OPEN{isOverdue ? ', OVERDUE' : ''}</span>
                                  )}
                                  <span className="text-[9px] text-gray-400 ml-auto">{new Date(e.createdAt).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="text-xs text-gray-900 font-medium mt-0.5">{e.subject}</p>
                                {e.notes && <p className="text-[11px] text-gray-600 mt-0.5">{e.notes}</p>}
                                {e.followUpAt && (
                                  <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                    Follow-up: {new Date(e.followUpAt).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                )}
                                <p className="text-[9px] text-gray-400 mt-0.5">by {e.recordedBy}</p>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <button onClick={() => handleToggleResolved(e)} title={e.isResolved ? 'Mark as open' : 'Mark as resolved'}
                                  className={`p-1 rounded ${e.isResolved ? 'text-gray-400 hover:bg-gray-100' : 'text-green-600 hover:bg-green-100'}`}>
                                  <CheckCircle2 size={12} />
                                </button>
                                <button onClick={() => handleDeleteComm(e.id)} title="Delete entry"
                                  className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-500">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
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
            <div><Label className="text-xs font-medium mb-1 block">Contact Person</Label><Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Name" className="rounded-xl" /></div>
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
            <div><Label className="text-xs font-medium mb-1 block">Internal Notes</Label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
        </div>
      </DetailSlideOver>

      {/* Rate card slide-over (unchanged) */}
      <DetailSlideOver open={rateCardOpen} onClose={() => setRateCardOpen(false)} title={`Rate Card, ${selectedMerchant?.businessName || ''}`} subtitle={rateCard ? `Valid from ${new Date(rateCard.validFrom).toLocaleDateString()}` : 'Creating new rate card'} width="lg"
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
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><FileText size={18} /> Generate Statement, {selectedMerchant?.businessName}</AlertDialogTitle><AlertDialogDescription>Generates a monthly statement with all fees, sales, COD, and shrinkage.</AlertDialogDescription></AlertDialogHeader>
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

      {/* Place on Hold dialog */}
      <AlertDialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Pause size={18} /> Place {selectedMerchant?.businessName} on Hold</AlertDialogTitle>
            <AlertDialogDescription>
              The merchant will be blocked from receiving new inbounds or orders. Existing inventory stays put. You can release the hold at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Label className="text-sm font-medium mb-1.5 block">Reason for hold</Label>
            <Input value={holdReason} onChange={e => setHoldReason(e.target.value)} placeholder="e.g. Overdue June statement" className="rounded-xl" />
            <p className="text-[10px] text-gray-400 mt-1">This reason is shown on the merchant's profile banner and logged in the audit trail.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmHold} className="bg-red-500 hover:bg-red-600 rounded-xl">Place on Hold</AlertDialogAction>
          </AlertDialogFooter>
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
