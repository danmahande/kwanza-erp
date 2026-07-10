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
import { Trash2, Settings as SettingsIcon, FileText, Filter, ChevronDown, ChevronRight, Upload, Download, Clock, ArrowDownRight, ArrowUpRight, DollarSign, AlertTriangle, RotateCcw, PackageX, Calendar, CheckCircle2, Phone, Building2, Pause, Play, MessageSquare, Plus, BarChart3, AlertOctagon, HelpCircle } from 'lucide-react'
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
  const [helpOpen, setHelpOpen] = useState(false)
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
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)} className="h-7 text-xs rounded-md">
          <HelpCircle size={12} className="mr-1" /> How does this work?
        </Button>
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
                        </div>
                        {(() => { const cs = contractStatus(m); return cs ? <span className={`text-[8px] px-1 py-0.5 rounded font-semibold ${cs.color}`}>{cs.label}</span> : null })()}
                      </div>
                    </DenseTd>
                    <DenseTd right>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleHoldToggle(m)} title={m.isOnHold ? 'Release hold' : 'Place on hold'} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${m.isOnHold ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {m.isOnHold ? 'Hold' : 'Hold'}
                        </button>
                        <button onClick={() => handleOpenRateCard(m)} title="Rate card" className="p-1 text-gray-400 hover:text-[#FF6B35]"><SettingsIcon size={12} /></button>
                        <button onClick={() => handleOpenStatement(m)} title="Statement" className="p-1 text-gray-400 hover:text-[#FF6B35]"><FileText size={12} /></button>
                        <button onClick={() => { handleExpand(m); setActiveTab('communication'); }} title="Log communication" className="p-1 text-gray-400 hover:text-[#FF6B35]"><MessageSquare size={12} /></button>
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
        footer={selectedMerchant ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={() => { setProfileOpen(false); handleEdit(selectedMerchant) }}><SettingsIcon size={13} className="mr-1" /> Edit</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={() => { setProfileOpen(false); handleOpenRateCard(selectedMerchant) }}><FileText size={13} className="mr-1" /> Rate Card</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={() => { setProfileOpen(false); handleOpenStatement(selectedMerchant) }}><Calendar size={13} className="mr-1" /> Statement</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className={`h-8 text-xs rounded-xl ${selectedMerchant.isOnHold ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}`} onClick={() => handleHoldToggle(selectedMerchant)}>
                {selectedMerchant.isOnHold ? <><Play size={13} className="mr-1" /> Release</> : <><Pause size={13} className="mr-1" /> Hold</>}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={() => setProfileOpen(false)}>Close</Button>
            </div>
          </div>
        ) : undefined}
      >
        {selectedMerchant && (() => {
          const m = selectedMerchant
          return (
            <div className="space-y-3">
              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-2.5 h-2.5 rounded-full ${m.isOnHold ? 'bg-red-500' : m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-[11px] text-gray-600 font-medium">
                  {m.isOnHold ? 'On hold' : m.isActive ? 'Active' : 'Inactive'}
                </span>
                {m.isOnHold && (
                  <span className="text-[10px] text-red-600">{m.holdReason || 'No reason given'}</span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">
                  Last inbound: {timeAgo(m.lastInboundAt)}, Last payment: {timeAgo(m.lastPaymentAt)}
                </span>
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
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Sales</p>
                  <p className="text-lg font-bold text-gray-900 font-mono">{formatCurrencyCompact(m.totalSalesValue, m.currency)}</p>
                </div>
              </div>

              {/* Contact */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><Phone size={10} /> Contact</p>
                <div className="space-y-1 text-xs">
                  <p className="text-gray-900 font-medium">{m.contact}</p>
                  <p className="text-gray-500">{m.email}</p>
                  {m.contactPerson && <p className="text-gray-500">Attn: {m.contactPerson}</p>}
                  {m.altPhone && <p className="text-gray-500">{m.altPhone}</p>}
                  {m.address && <p className="text-gray-500">{m.address}</p>}
                </div>
              </div>

              {/* Business */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5 flex items-center gap-1"><Building2 size={10} /> Business</p>
                <div className="space-y-1 text-xs">
                  {m.taxId && <p className="text-gray-700">TIN: <span className="font-mono">{m.taxId}</span></p>}
                  <p className="text-gray-700">Delivery: <span className="capitalize">{(m.deliveryType || 'self-delivery').replace('-', ' ')}</span></p>
                  {m.bankName && <p className="text-gray-500">{m.bankName}</p>}
                  {m.bankAccount && <p className="text-gray-500 font-mono">{m.bankAccount}</p>}
                  {(m.contractStart || m.contractEnd) && <p className="text-gray-500 mt-1">Contract: {m.contractStart ? new Date(m.contractStart).toLocaleDateString('en-UG') : '—'} to {m.contractEnd ? new Date(m.contractEnd).toLocaleDateString('en-UG') : 'Open'}</p>}
                </div>
              </div>

              {/* Financials */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Financials</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Revenue</span><span className="font-mono font-medium text-gray-900">{formatCurrencyCompact(m.profitability.revenue, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Commission</span><span className="font-mono font-medium text-orange-700">{formatCurrencyCompact(m.profitability.commission, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Shrinkage</span><span className="font-mono font-medium text-red-600">{formatCurrencyCompact(m.profitability.shrinkage, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Returns</span><span className="font-mono font-medium text-red-500">{formatCurrencyCompact(m.profitability.returns, m.currency)}</span></div>
                  <div className="flex justify-between col-span-2 pt-1.5 border-t border-gray-200"><span className="text-gray-700 font-semibold">Net</span><span className={`font-mono font-bold ${m.profitability.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrencyCompact(m.profitability.net, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="font-mono font-medium text-orange-600">{formatCurrencyCompact(m.pendingPayment, m.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Storage</span><span className="font-mono font-medium text-blue-600">{formatCurrencyCompact(m.storageLiabilityBalance, m.currency)}</span></div>
                </div>
              </div>

              {/* Recent statements */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Recent Statements</p>
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
                ) : <p className="text-xs text-gray-400 text-center py-2">No statements</p>}
              </div>

              {/* Notes */}
              {m.notes && (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Notes</p>
                  <p className="text-xs text-gray-600">{m.notes}</p>
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

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Merchants Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Merchants module is the financial hub of your warehouse operation. Every merchant (vendor) who stores products in your warehouse has a record here — with their cumulative financial position, rate card, communication log, and operational history. This module ties together inbound (stock received), outbound (orders shipped), payments (what they've been paid), returns (RTV + shrinkage), and statements (monthly settlements). It's where you answer "how much do we owe this merchant?" and "are they profitable?"
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> Merchants are your business partners — they supply the products you store and fulfill. This module tracks everything about each merchant: their contact details, delivery type (self-delivery or warehouse-fulfilled), bank details for payments, contracted rates (rate card), operational hold status, and cumulative financials (total inbound value, total sales, total returns, total shrinkage, total paid, pending balance). Without this module, you can't generate statements, create payment batches, or know whether a merchant is profitable.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>1. Create merchants.</strong> Click "Add Merchant". Fill in business name, contact, email, delivery type (self-delivery means the merchant fulfills their own orders; warehouse-fulfilled means you do it), bank details, and contract dates. Every creation is audited.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs text-green-900 leading-relaxed">
                    <strong>2. Rate cards.</strong> Each merchant has a rate card — the fees you charge them per unit for receiving, storage, picking, packing, returns, COD remittance, and your commission percentage. When you create a new rate card, the old one is automatically superseded (in a transaction — no race conditions). Rate cards drive the monthly statement calculations.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-900 leading-relaxed">
                    <strong>3. Operational hold.</strong> If a merchant has an overdue balance or dispute, you can place them on hold. This blocks all inbound (stock receiving) and outbound (order creation) for that merchant — the system enforces it at the API level, not just in the UI. The hold records who set it, when, and why.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="text-xs text-purple-900 leading-relaxed">
                    <strong>4. Communication log.</strong> Every call, email, WhatsApp, or visit with a merchant is logged with follow-up reminders. Overdue follow-ups appear on the Operations Desk. This is your relationship management tool — you always know what was discussed, when, and what the next step is.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>5. Financial position.</strong> Each merchant card shows their cumulative financials: total inbound value (stock received), total sales value (orders delivered), total returns, total shrinkage, total paid, and pending balance. The profitability calculation shows revenue, commission, shrinkage, returns, and net. This is the data that drives the monthly statement.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>6. Statements.</strong> At month-end, you generate a statement for each merchant. The statement rolls up all fees (from the rate card), sales, returns, and shrinkage into a net payable figure. Statements go through an approval workflow (draft → pending approval → approved → issued → paid). Payment batches are created from issued statements.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>7. Deactivate vs Delete.</strong> To stop working with a merchant, deactivate them — they stay in the system with all their financial history. Deleting is blocked if they have ANY dependent records (products, inbound, outbound, payments, statements, RTV, shrinkage, charges, communication, storage liabilities). In most cases, deactivate is the right choice.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most warehouse systems treat merchants as just a name and a contact number. This module treats each merchant as a financial entity with a full lifecycle: contracted rates, operational hold enforcement, cumulative financial tracking, communication logging, monthly statements, and payment batches. You can answer any question: "How much do we owe this merchant?" (pending balance), "Are they profitable?" (profitability calculation), "What did we discuss last?" (communication log), "Why are they on hold?" (hold reason + who set it), and "What's their rate card?" (rate card history with superseded versions preserved). Every financial action — statement generation, payment batch, charge, dispute — flows back to this module and updates the merchant's cumulative position.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
