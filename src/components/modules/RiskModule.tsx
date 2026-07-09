'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RefreshCw, Shield, AlertTriangle, Ban, Settings as SettingsIcon,
  FileText, Users, Plus, X, CheckCircle2, ChevronDown, ChevronRight,
  Search, Trash2, UserCog, Scale,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import DetailSlideOver from '@/components/shared/DetailSlideOver'
import { formatCurrency, formatCurrencyCompact } from '@/lib/currency'

// ═══════════════════════════════════════════════════════════════════════════
// RISK MODULE — theme override
// ═══════════════════════════════════════════════════════════════════════════
// This module uses a red/black palette instead of the app's orange/blue to
// signal "serious / attention required". Same component structure (OpsHeader,
// DenseTable, slide-overs) — only the accent colors flip.
//
// Mapping:
//   app orange (#FF6B35)  → red-600 (#DC2626)
//   app blue accents      → zinc-900 / black
//   success green stays   → green-600 (universal)
//
// All buttons, badges, and headers in this module use the red/black palette.

// ── Types ──

interface RiskScoreRow {
  scoreId: string
  outboundId: string
  orderNumber: string
  customerName: string
  customerContact: string
  customerAddress: string | null
  productName: string
  qty: number
  saleAmount: number | null
  orderStatus: string
  riskScore: number
  riskDecision: string
  paymentPath: string
  engineVersion: string
  reasons: Array<{ rule: string; points: number; detail: string }>
  scoredAt: string
  createdAt: string
}

interface BlocklistEntry {
  id: string
  phone: string | null
  address: string | null
  reason: string
  addedBy: string
  addedAt: string
  isActive: boolean
}

interface RiskSettingRow {
  key: string
  label: string
  category: 'thresholds' | 'zones' | 'keywords' | 'roles' | 'meta'
  inputType: 'number' | 'list' | 'select' | 'text'
  helpText: string | null
  options: string[] | null
  value: string
  updatedBy: string | null
  updatedAt: string | null
}

interface CustomerProfile {
  customerContact: string
  customerType: string
  totalOrders: number
  codRefusals90d: number
  codDelivered90d: number
  distinctAddressesUsed: number
  firstOrderDate: string | null
  lastOrderDate: string | null
  avgAOV: number
  isBlocklisted: boolean
  updatedAt: string
}

interface AuditEvent {
  id: string
  eventType: 'score' | 'override'
  outboundId: string
  orderNumber: string
  customerName: string
  customerContact?: string
  score?: number
  decision?: string
  paymentPath?: string
  engineVersion?: string
  reasons?: Array<{ rule: string; points: number; detail: string }>
  action?: string
  managerName?: string
  reason?: string
  timestamp: string
}

type Tab = 'review' | 'blocklist' | 'settings' | 'audit' | 'profiles'

// ── Decision badge styling (red/black theme) ──

function decisionBadgeClass(decision: string): string {
  switch (decision) {
    case 'auto_release': return 'bg-green-100 text-green-700 border-green-200'
    case 'spot_check':   return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'review':       return 'bg-red-100 text-red-700 border-red-200'
    case 'blocked':      return 'bg-black text-white border-black'
    default:             return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function decisionLabel(decision: string): string {
  switch (decision) {
    case 'auto_release': return 'PASS'
    case 'spot_check':   return 'SPOT'
    case 'review':       return 'REVIEW'
    case 'blocked':      return 'BLOCKED'
    default:             return decision.toUpperCase()
  }
}

function scoreColorClass(score: number): string {
  if (score >= 70) return 'text-red-600'
  if (score >= 30) return 'text-amber-600'
  return 'text-green-600'
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function RiskModule() {
  const [activeTab, setActiveTab] = useState<Tab>('review')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Review queue ──
  const [reviewItems, setReviewItems] = useState<RiskScoreRow[]>([])
  const [selectedReview, setSelectedReview] = useState<RiskScoreRow | null>(null)
  const [reviewDetailOpen, setReviewDetailOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideInProgress, setOverrideInProgress] = useState(false)

  // ── Blocklist ──
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([])
  const [blocklistFormOpen, setBlocklistFormOpen] = useState(false)
  const [blocklistForm, setBlocklistForm] = useState({ phone: '', address: '', reason: '' })

  // ── Settings ──
  const [settings, setSettings] = useState<RiskSettingRow[]>([])
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({})
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // ── Audit ──
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])

  // ── Profiles ──
  const [profiles, setProfiles] = useState<CustomerProfile[]>([])

  // ── KPI counts ──
  const [kpiCounts, setKpiCounts] = useState({ review: 0, blocked: 0, blocklist: 0, profiles: 0 })

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchReviewQueue = useCallback(async () => {
    try {
      const r = await fetch('/api/risk/review-queue')
      const d = await r.json()
      setReviewItems(d.items || [])
    } catch { toast.error('Failed to load review queue') }
  }, [])

  const fetchBlocklist = useCallback(async () => {
    try {
      const r = await fetch('/api/risk/blocklist')
      const d = await r.json()
      setBlocklist(d.items || [])
    } catch { toast.error('Failed to load blocklist') }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/risk/settings')
      const d = await r.json()
      setSettings(d.settings || [])
      const draft: Record<string, string> = {}
      for (const s of (d.settings || [])) draft[s.key] = s.value
      setSettingsDraft(draft)
      setSettingsDirty(false)
    } catch { toast.error('Failed to load settings') }
  }, [])

  const fetchAudit = useCallback(async () => {
    try {
      const r = await fetch('/api/risk/audit?limit=100')
      const d = await r.json()
      setAuditEvents(d.items || [])
    } catch { toast.error('Failed to load audit log') }
  }, [])

  const fetchProfiles = useCallback(async () => {
    try {
      const r = await fetch('/api/risk/profiles')
      const d = await r.json()
      setProfiles(d.items || [])
    } catch { toast.error('Failed to load profiles') }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchReviewQueue(), fetchBlocklist(), fetchSettings(), fetchAudit(), fetchProfiles()])
    setLoading(false)
  }, [fetchReviewQueue, fetchBlocklist, fetchSettings, fetchAudit, fetchProfiles])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Update KPI counts when data changes
  useEffect(() => {
    setKpiCounts({
      review: reviewItems.filter(r => r.riskDecision === 'review').length,
      blocked: reviewItems.filter(r => r.riskDecision === 'blocked').length,
      blocklist: blocklist.filter(b => b.isActive).length,
      profiles: profiles.length,
    })
  }, [reviewItems, blocklist, profiles])

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Override (approve/reject) a held order ──
  const handleOverride = async (action: 'approve' | 'reject') => {
    if (!selectedReview) return
    setOverrideInProgress(true)
    try {
      const r = await fetch('/api/risk/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outboundId: selectedReview.outboundId,
          action,
          reason: overrideReason || undefined,
        }),
      })
      const d = await r.json()
      if (r.ok) {
        toast.success(`Order ${action}d successfully`)
        setReviewDetailOpen(false)
        setSelectedReview(null)
        setOverrideReason('')
        fetchReviewQueue()
        fetchAudit()
      } else {
        toast.error(d.error || `Failed to ${action} order`)
      }
    } catch {
      toast.error(`Failed to ${action} order`)
    } finally {
      setOverrideInProgress(false)
    }
  }

  // ── Add to blocklist ──
  const handleAddBlocklist = async () => {
    if (!blocklistForm.reason) {
      toast.error('Reason is required')
      return
    }
    if (!blocklistForm.phone && !blocklistForm.address) {
      toast.error('Phone or address is required')
      return
    }
    try {
      const r = await fetch('/api/risk/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blocklistForm),
      })
      const d = await r.json()
      if (r.ok) {
        toast.success('Added to blocklist')
        setBlocklistFormOpen(false)
        setBlocklistForm({ phone: '', address: '', reason: '' })
        fetchBlocklist()
      } else {
        toast.error(d.error || 'Failed to add')
      }
    } catch {
      toast.error('Failed to add')
    }
  }

  // ── Remove from blocklist ──
  const handleRemoveBlocklist = async (id: string, label: string) => {
    if (!confirm(`Remove ${label} from blocklist?`)) return
    try {
      const r = await fetch('/api/risk/blocklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (r.ok) {
        toast.success('Removed from blocklist')
        fetchBlocklist()
      } else {
        toast.error('Failed to remove')
      }
    } catch {
      toast.error('Failed to remove')
    }
  }

  // ── Save settings ──
  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      // Find changed settings
      const changed = settings.filter(s => settingsDraft[s.key] !== s.value)
      if (changed.length === 0) {
        toast.info('No changes to save')
        setSettingsSaving(false)
        return
      }
      const updates = changed.map(s => ({ key: s.key, value: settingsDraft[s.key] }))
      const r = await fetch('/api/risk/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updates }),
      })
      const d = await r.json()
      if (r.ok) {
        toast.success(`${updates.length} setting(s) saved`)
        setSettingsDirty(false)

        // Ask if user wants to re-score pending orders
        if (confirm('Re-score all pending orders with the new settings?')) {
          toast.info('Re-scoring pending orders...')
          const rr = await fetch('/api/risk/re-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentPath: 'cod' }),
          })
          const dd = await rr.json()
          if (rr.ok) {
            toast.success(`Re-scored ${dd.scored} orders. Review: ${dd.byDecision.review || 0}, Blocked: ${dd.byDecision.blocked || 0}`)
            fetchReviewQueue()
          }
        }

        fetchSettings()
      } else {
        toast.error(d.error || 'Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Update setting draft ──
  const updateSettingDraft = (key: string, value: string) => {
    setSettingsDraft(prev => ({ ...prev, [key]: value }))
    setSettingsDirty(true)
  }

  // ── Update setting list (add/remove items) ──
  const updateListSetting = (key: string, items: string[]) => {
    updateSettingDraft(key, JSON.stringify(items))
  }

  // ── Toggle customer type ──
  const handleToggleCustomerType = async (contact: string, currentType: string) => {
    const newType = currentType === 'wholesale' ? 'retail' : 'wholesale'
    try {
      const r = await fetch('/api/risk/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerContact: contact, customerType: newType }),
      })
      if (r.ok) {
        toast.success(`Marked as ${newType}`)
        fetchProfiles()
      } else {
        toast.error('Failed to update')
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  // ── Open review detail ──
  const openReviewDetail = (item: RiskScoreRow) => {
    setSelectedReview(item)
    setReviewDetailOpen(true)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════════════════════════════════════════

  const tabs: Array<{ key: Tab; label: string; icon: typeof Shield; badge?: number }> = [
    { key: 'review', label: 'Review Queue', icon: AlertTriangle, badge: kpiCounts.review + kpiCounts.blocked },
    { key: 'blocklist', label: 'Blocklist', icon: Ban, badge: kpiCounts.blocklist },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
    { key: 'audit', label: 'Audit Log', icon: FileText },
    { key: 'profiles', label: 'Customer Profiles', icon: Users, badge: kpiCounts.profiles },
  ]

  // ── Filtered review items by search ──
  const filteredReview = search
    ? reviewItems.filter(r =>
        r.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.customerName.toLowerCase().includes(search.toLowerCase()) ||
        r.customerContact.includes(search)
      )
    : reviewItems

  const filteredProfiles = search
    ? profiles.filter(p => p.customerContact.includes(search))
    : profiles

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-3">
      {/* Header — uses red accent instead of orange */}
      <OpsHeader
        title="Risk & Fraud"
        description="Order intake scoring • Blocklist • Manager review"
        kpiCells={[
          { label: 'REVIEW', value: kpiCounts.review, highlight: kpiCounts.review > 0, highlightColor: 'red' as const },
          { label: 'BLOCKED', value: kpiCounts.blocked, highlight: kpiCounts.blocked > 0, highlightColor: 'red' as const },
          { label: 'BLOCKLIST', value: kpiCounts.blocklist },
          { label: 'PROFILES', value: kpiCounts.profiles },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by order, customer, or phone..."
      >
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs rounded-md border-red-200 text-red-700 hover:bg-red-50"
          onClick={refreshAll}
        >
          <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </OpsHeader>

      {/* Tab switcher — red active border instead of orange */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={12} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-mono font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          REVIEW QUEUE TAB
          ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'review' && (
        <div className="space-y-2">
          {filteredReview.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm text-gray-700 font-medium">Queue is clear</p>
              <p className="text-xs text-gray-400 mt-0.5">No orders awaiting risk review.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-3 py-2 font-semibold">Order</th>
                      <th className="text-left px-3 py-2 font-semibold">Customer</th>
                      <th className="text-left px-3 py-2 font-semibold">Product</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-center px-3 py-2 font-semibold">Score</th>
                      <th className="text-center px-3 py-2 font-semibold">Decision</th>
                      <th className="text-right px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReview.map(item => (
                      <tr
                        key={item.scoreId}
                        className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-red-50/30 transition-colors ${
                          item.riskDecision === 'blocked' ? 'bg-red-50/50' : ''
                        }`}
                        onClick={() => openReviewDetail(item)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono font-bold text-gray-900 text-xs">{item.orderNumber}</div>
                          <div className="text-[9px] text-gray-400">
                            {new Date(item.createdAt).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-gray-900 font-medium truncate max-w-[120px]">{item.customerName}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{item.customerContact}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]">{item.productName}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{item.qty}</td>
                        <td className="px-3 py-2 text-right">
                          {item.saleAmount != null && item.saleAmount > 0 && (
                            <span className="font-mono text-[11px] font-semibold text-gray-700">{formatCurrencyCompact(item.saleAmount)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-mono text-sm font-bold ${scoreColorClass(item.riskScore)}`}>
                            {item.riskScore}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${decisionBadgeClass(item.riskDecision)}`}>
                            {decisionLabel(item.riskDecision)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setSelectedReview(item); setOverrideReason(''); handleOverride('approve') }}
                              className="text-[10px] text-green-700 hover:text-green-800 font-semibold"
                            >
                              Approve
                            </button>
                            <span className="text-gray-300">·</span>
                            <button
                              onClick={() => { setSelectedReview(item); setOverrideReason(''); handleOverride('reject') }}
                              className="text-[10px] text-red-600 hover:text-red-700 font-semibold"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-500 px-2">
            Scores 70+ are held for manager review. 100 = hard block from blocklist. Approve moves to pick floor; Reject cancels the order.
          </p>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          BLOCKLIST TAB
          ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'blocklist' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-xs text-gray-600 font-medium">
              {blocklist.filter(b => b.isActive).length} active entr{blocklist.filter(b => b.isActive).length === 1 ? 'y' : 'ies'}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setBlocklistFormOpen(true)}
            >
              <Plus size={12} className="mr-1" />
              Add to Blocklist
            </Button>
          </div>

          {blocklist.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 py-16 text-center">
              <Ban size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-700 font-medium">Blocklist is empty</p>
              <p className="text-xs text-gray-400 mt-0.5">Phones and addresses you block will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-3 py-2 font-semibold">Phone</th>
                      <th className="text-left px-3 py-2 font-semibold">Address</th>
                      <th className="text-left px-3 py-2 font-semibold">Reason</th>
                      <th className="text-left px-3 py-2 font-semibold">Added By</th>
                      <th className="text-left px-3 py-2 font-semibold">Added</th>
                      <th className="text-center px-3 py-2 font-semibold">Status</th>
                      <th className="text-right px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocklist.map(entry => (
                      <tr key={entry.id} className={`border-b border-gray-50 last:border-0 ${!entry.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 font-mono text-gray-900">{entry.phone || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 truncate max-w-[200px]">{entry.address || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{entry.reason}</td>
                        <td className="px-3 py-2 text-gray-500">{entry.addedBy}</td>
                        <td className="px-3 py-2 text-[10px] text-gray-400">
                          {new Date(entry.addedAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            entry.isActive ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {entry.isActive ? 'ACTIVE' : 'REMOVED'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {entry.isActive && (
                            <button
                              onClick={() => handleRemoveBlocklist(entry.id, entry.phone || entry.address || 'entry')}
                              className="text-[10px] text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1"
                            >
                              <Trash2 size={10} /> Remove
                            </button>
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

      {/* ═════════════════════════════════════════════════════════════════════
          SETTINGS TAB
          ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-3">
          {/* Save bar — sticky at top */}
          <div className={`sticky top-0 z-10 flex items-center justify-between bg-white rounded-lg border px-3 py-2 transition-colors ${
            settingsDirty ? 'border-red-400 shadow-sm' : 'border-gray-200'
          }`}>
            <div className="flex items-center gap-2 text-xs">
              <Scale size={14} className={settingsDirty ? 'text-red-600' : 'text-gray-400'} />
              <span className="text-gray-700 font-medium">
                {settingsDirty ? 'Unsaved changes' : 'All settings saved'}
              </span>
              {settingsDirty && (
                <span className="text-[10px] text-gray-500">— saving will trigger a re-score prompt</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-md"
                onClick={() => {
                  const draft: Record<string, string> = {}
                  for (const s of settings) draft[s.key] = s.value
                  setSettingsDraft(draft)
                  setSettingsDirty(false)
                }}
                disabled={!settingsDirty}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white"
                onClick={handleSaveSettings}
                disabled={!settingsDirty || settingsSaving}
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>

          {/* Group settings by category */}
          {(['thresholds', 'zones', 'keywords', 'roles', 'meta'] as const).map(category => {
            const catSettings = settings.filter(s => s.category === category)
            if (catSettings.length === 0) return null
            return (
              <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    {category === 'thresholds' && 'Scoring Thresholds'}
                    {category === 'zones' && 'Serviced Delivery Zones'}
                    {category === 'keywords' && 'Detection Keywords'}
                    {category === 'roles' && 'Permissions'}
                    {category === 'meta' && 'Engine Metadata'}
                  </h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {catSettings.map(s => (
                    <SettingEditor
                      key={s.key}
                      setting={s}
                      value={settingsDraft[s.key] ?? s.value}
                      onChange={(v) => updateSettingDraft(s.key, v)}
                      onListChange={(items: string[]) => updateListSetting(s.key, items)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          AUDIT LOG TAB
          ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {auditEvents.length === 0 ? (
            <div className="py-16 text-center">
              <FileText size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">No risk events yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left px-3 py-2 font-semibold">Time</th>
                    <th className="text-left px-3 py-2 font-semibold">Type</th>
                    <th className="text-left px-3 py-2 font-semibold">Order</th>
                    <th className="text-left px-3 py-2 font-semibold">Customer</th>
                    <th className="text-center px-3 py-2 font-semibold">Score</th>
                    <th className="text-left px-3 py-2 font-semibold">Action / Decision</th>
                    <th className="text-left px-3 py-2 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map(ev => (
                    <tr key={`${ev.eventType}-${ev.id}`} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 text-[10px] text-gray-500 whitespace-nowrap">
                        {new Date(ev.timestamp).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          ev.eventType === 'override' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {ev.eventType === 'override' ? 'OVERRIDE' : 'SCORE'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-gray-900">{ev.orderNumber}</td>
                      <td className="px-3 py-2 text-gray-700">{ev.customerName || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {ev.score !== undefined && (
                          <span className={`font-mono font-bold ${scoreColorClass(ev.score)}`}>{ev.score}</span>
                        )}
                        {ev.action && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            ev.action === 'approve' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {ev.action.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {ev.decision && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${decisionBadgeClass(ev.decision)}`}>
                            {decisionLabel(ev.decision)}
                          </span>
                        )}
                        {ev.reason && <span className="text-gray-500 ml-2">"{ev.reason}"</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{ev.managerName || 'engine'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          CUSTOMER PROFILES TAB
          ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'profiles' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filteredProfiles.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">No customer profiles yet.</p>
              <p className="text-xs text-gray-400 mt-0.5">Profiles are created automatically when orders are placed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                    <th className="text-left px-3 py-2 font-semibold">Phone</th>
                    <th className="text-center px-3 py-2 font-semibold">Type</th>
                    <th className="text-right px-3 py-2 font-semibold">Orders</th>
                    <th className="text-right px-3 py-2 font-semibold">COD Refusals (90d)</th>
                    <th className="text-right px-3 py-2 font-semibold">COD Delivered (90d)</th>
                    <th className="text-right px-3 py-2 font-semibold">Avg AOV</th>
                    <th className="text-center px-3 py-2 font-semibold">Blocklisted</th>
                    <th className="text-right px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map(p => (
                    <tr key={p.customerContact} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${p.isBlocklisted ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2 font-mono font-semibold text-gray-900">{p.customerContact}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          p.customerType === 'wholesale' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.customerType.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">{p.totalOrders}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono font-semibold ${p.codRefusals90d > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {p.codRefusals90d}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{p.codDelivered90d}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">
                        {p.avgAOV > 0 ? formatCurrencyCompact(p.avgAOV) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.isBlocklisted ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">YES</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleToggleCustomerType(p.customerContact, p.customerType)}
                          className="text-[10px] text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1"
                        >
                          <UserCog size={10} />
                          {p.customerType === 'wholesale' ? 'Set Retail' : 'Set Wholesale'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          REVIEW DETAIL SLIDE-OVER
          ═════════════════════════════════════════════════════════════════════ */}
      <DetailSlideOver
        open={reviewDetailOpen}
        onClose={() => { setReviewDetailOpen(false); setSelectedReview(null); setOverrideReason('') }}
        title={selectedReview ? selectedReview.orderNumber : 'Order'}
        subtitle={selectedReview ? selectedReview.customerName : ''}
        width="lg"
        footer={
          selectedReview ? (
            <div className="flex items-center justify-between w-full gap-2">
              <Input
                placeholder="Reason (optional)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="flex-1 h-8 text-xs rounded-md"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => handleOverride('approve')}
                  disabled={overrideInProgress}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleOverride('reject')}
                  disabled={overrideInProgress}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selectedReview && (
          <div className="space-y-3">
            {/* Score + decision */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-100 p-3">
              <div className="text-center">
                <div className={`text-3xl font-mono font-bold ${scoreColorClass(selectedReview.riskScore)}`}>
                  {selectedReview.riskScore}
                </div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Score</div>
              </div>
              <div className="border-l border-gray-200 pl-3">
                <span className={`inline-block px-2 py-1 rounded text-[10px] font-semibold border ${decisionBadgeClass(selectedReview.riskDecision)}`}>
                  {decisionLabel(selectedReview.riskDecision)}
                </span>
                <div className="text-[10px] text-gray-500 mt-1">
                  {selectedReview.paymentPath === 'cod' ? 'COD path' : 'Prepaid path'} · v{selectedReview.engineVersion || '1.0.0'}
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Customer</p>
              <p className="text-sm font-medium text-gray-900">{selectedReview.customerName}</p>
              <p className="text-xs text-gray-500 font-mono">{selectedReview.customerContact}</p>
              {selectedReview.customerAddress && <p className="text-xs text-gray-500">{selectedReview.customerAddress}</p>}
            </div>

            {/* Product */}
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Product</p>
              <p className="text-sm font-medium text-gray-900">{selectedReview.productName}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><span className="text-gray-400">Qty:</span> <span className="font-mono font-bold text-gray-900">{selectedReview.qty}</span></div>
                {selectedReview.saleAmount != null && (
                  <div><span className="text-gray-400">Total:</span> <span className="font-mono font-bold text-gray-900">{formatCurrency(selectedReview.saleAmount)}</span></div>
                )}
              </div>
            </div>

            {/* Reasons breakdown */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Why this score ({selectedReview.reasons.length} signal(s))</p>
              {selectedReview.reasons.length === 0 ? (
                <p className="text-xs text-gray-500">No risk signals fired — order passed all checks.</p>
              ) : (
                <div className="space-y-2">
                  {selectedReview.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="font-mono font-bold text-red-600 shrink-0 w-8">+{r.points}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900">{r.rule}</div>
                        <div className="text-gray-600 text-[11px]">{r.detail}</div>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 pt-2 mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total</span>
                    <span className={`font-mono font-bold ${scoreColorClass(selectedReview.riskScore)}`}>
                      {selectedReview.riskScore} / 100
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailSlideOver>

      {/* ═════════════════════════════════════════════════════════════════════
          BLOCKLIST ADD SLIDE-OVER
          ═════════════════════════════════════════════════════════════════════ */}
      <DetailSlideOver
        open={blocklistFormOpen}
        onClose={() => setBlocklistFormOpen(false)}
        title="Add to Blocklist"
        subtitle="Phone and/or address will be blocked from passing intake"
        width="md"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={() => setBlocklistFormOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleAddBlocklist} className="bg-red-600 hover:bg-red-700 text-white rounded-xl">Add to Blocklist</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Phone <span className="text-gray-400">(digits only — auto-normalized)</span></Label>
            <Input
              value={blocklistForm.phone}
              onChange={(e) => setBlocklistForm({ ...blocklistForm, phone: e.target.value })}
              placeholder="e.g. 0700123456"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Address <span className="text-gray-400">(case-insensitive match)</span></Label>
            <Input
              value={blocklistForm.address}
              onChange={(e) => setBlocklistForm({ ...blocklistForm, address: e.target.value })}
              placeholder="e.g. Plot 12, Kampala Road"
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="text-gray-700 font-medium mb-1.5 block text-xs">Reason <span className="text-red-400">*</span></Label>
            <Input
              value={blocklistForm.reason}
              onChange={(e) => setBlocklistForm({ ...blocklistForm, reason: e.target.value })}
              placeholder="e.g. 3 COD refusals in 90 days"
              className="rounded-xl"
            />
            <p className="text-[10px] text-gray-500 mt-1">This reason will be shown to managers when a future order is blocked.</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-[11px] text-red-700">
              <strong>Effect:</strong> Any new order from this phone or address will score 100 (hard block) and require manager override to proceed.
              Existing pending orders will be re-scored automatically on the next refresh.
            </p>
          </div>
        </div>
      </DetailSlideOver>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTING EDITOR SUB-COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SettingEditor({
  setting,
  value,
  onChange,
  onListChange,
}: {
  setting: RiskSettingRow
  value: string
  onChange: (v: string) => void
  onListChange: (items: string[]) => void
}) {
  const [listInput, setListInput] = useState('')
  const [listOpen, setListOpen] = useState(false)

  // Parse list value
  let listItems: string[] = []
  if (setting.inputType === 'list') {
    try { listItems = JSON.parse(value) } catch { listItems = [] }
  }

  const addListItem = () => {
    const v = listInput.trim().toLowerCase()
    if (!v) return
    if (listItems.includes(v)) {
      toast.error(`${v} is already in the list`)
      return
    }
    const next = [...listItems, v]
    onListChange(next)
    setListInput('')
  }

  const removeListItem = (item: string) => {
    onListChange(listItems.filter(i => i !== item))
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <Label className="text-gray-900 font-semibold text-xs">{setting.label}</Label>
          {setting.helpText && <p className="text-[10px] text-gray-500 mt-0.5">{setting.helpText}</p>}
        </div>
        {setting.updatedAt && (
          <span className="text-[9px] text-gray-400 shrink-0 whitespace-nowrap">
            {setting.updatedBy} · {new Date(setting.updatedAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {setting.inputType === 'number' && (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md h-8 text-xs max-w-xs"
        />
      )}

      {setting.inputType === 'text' && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md h-8 text-xs max-w-xs"
          disabled={setting.key === 'engine_version'}
        />
      )}

      {setting.inputType === 'select' && setting.options && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs h-8 max-w-xs"
        >
          {setting.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )}

      {setting.inputType === 'list' && (
        <div>
          {/* Current items */}
          <div className="flex flex-wrap gap-1 mb-2">
            {listItems.length === 0 ? (
              <span className="text-[10px] text-gray-400 italic">Empty list</span>
            ) : (
              listItems.map(item => (
                <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-700">
                  {item}
                  <button onClick={() => removeListItem(item)} className="text-gray-400 hover:text-red-500">
                    <X size={10} />
                  </button>
                </span>
              ))
            )}
          </div>
          {/* Add new item */}
          <div className="flex gap-1">
            <Input
              value={listInput}
              onChange={(e) => setListInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addListItem() } }}
              placeholder="Type and press Enter to add..."
              className="rounded-md h-7 text-xs flex-1 max-w-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-md"
              onClick={addListItem}
            >
              <Plus size={10} />
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{listItems.length} item(s) · matching is case-insensitive substring</p>
        </div>
      )}
    </div>
  )
}
