'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tag, Ruler, CreditCard, Warehouse, Plus, X, HelpCircle, RefreshCw, CheckCircle2, Settings as SettingsIcon, Copy, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import PageTransition from '@/components/shared/PageTransition'
import DetailSlideOver from '@/components/shared/DetailSlideOver'

interface SettingItem {
  key: string
  label: string
  value: string[]
  updatedBy: string | null
  updatedAt: string | null
}

const FEE_SECTIONS = [
  { title: 'Receiving', fields: [
    { key: 'receivingFlatFee', label: 'Flat fee (first hours)', type: 'number' },
    { key: 'receivingFlatHours', label: 'Hours included', type: 'number' },
    { key: 'receivingHourlyAfter', label: 'Hourly rate after', type: 'number' },
    { key: 'inboundReceivingPerUnit', label: 'Per-unit receiving', type: 'number' },
  ]},
  { title: 'Storage (Monthly)', fields: [
    { key: 'storagePerBinMonth', label: 'Per bin / month', type: 'number' },
    { key: 'storagePerShelfMonth', label: 'Per shelf / month', type: 'number' },
    { key: 'storagePerPalletMonth', label: 'Per pallet / month', type: 'number' },
    { key: 'storagePerUnitPerDay', label: 'Per unit / day (legacy)', type: 'number' },
  ]},
  { title: 'Pick & Pack', fields: [
    { key: 'pickFirstItemsIncluded', label: 'First items included', type: 'int' },
    { key: 'pickPerAdditionalItem', label: 'Per additional item', type: 'number' },
    { key: 'packPerOrder', label: 'Pack per order', type: 'number' },
    { key: 'pickPerUnit', label: 'Per-unit pick (legacy)', type: 'number' },
  ]},
  { title: 'Fulfillment', fields: [
    { key: 'fulfillmentFeePerOrder', label: 'Fee per order', type: 'number' },
    { key: 'fulfillmentMinimumFee', label: 'Minimum fee per order', type: 'number' },
  ]},
  { title: 'Returns', fields: [
    { key: 'returnProcessingPerUnit', label: 'Processing per unit', type: 'number' },
    { key: 'returnsPerOrder', label: 'Flat fee per order', type: 'number' },
  ]},
  { title: 'Commission', fields: [
    { key: 'commissionPercent', label: 'Commission %', type: 'number' },
  ]},
  { title: 'COD', fields: [
    { key: 'codRemittanceFeePerOrder', label: 'Remittance fee per order', type: 'number' },
    { key: 'codShortfallPenalty', label: 'Shortfall penalty', type: 'number' },
  ]},
]

const ALL_FEE_KEYS = FEE_SECTIONS.flatMap(s => s.fields.map(f => f.key))

const emptyFeeForm: Record<string, number> = Object.fromEntries(ALL_FEE_KEYS.map(k => [k, k === 'pickFirstItemsIncluded' ? 4 : 0]))

const ICON_MAP: Record<string, { icon: typeof Tag; color: string }> = {
  categories: { icon: Tag, color: '#FF6B35' },
  units: { icon: Ruler, color: '#1B2A4A' },
  paymentMethods: { icon: CreditCard, color: '#22C55E' },
  storageLocations: { icon: Warehouse, color: '#3B82F6' },
}

const BADGE_COLORS = [
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/60' },
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60' },
  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200/60' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200/60' },
]

function SettingsSection({
  setting, onAdd, onRemove, delay,
}: {
  setting: SettingItem
  onAdd: (key: string, item: string) => void
  onRemove: (key: string, item: string) => void
  delay: number
}) {
  const [inputVal, setInputVal] = useState('')
  const config = ICON_MAP[setting.key] || { icon: Tag, color: '#6B7280' }
  const Icon = config.icon

  const addItem = () => {
    const trimmed = inputVal.trim()
    if (!trimmed) return
    if (setting.value.includes(trimmed)) {
      toast.error(`"${trimmed}" already exists`)
      return
    }
    onAdd(setting.key, trimmed)
    setInputVal('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${config.color}12` }}>
          <Icon size={16} style={{ color: config.color }} />
        </div>
        <span className="text-sm font-bold text-gray-800 flex-1">{setting.label}</span>
        <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px] font-mono font-bold px-2 py-0.5">
          {setting.value.length}
        </Badge>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Add input */}
        <div className="flex gap-2">
          <Input
            placeholder={`Add new ${setting.label.toLowerCase()}...`}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            className="rounded-lg border-gray-200 text-sm h-9"
          />
          <Button onClick={addItem} size="icon" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white shrink-0 rounded-lg h-9 w-9">
            <Plus size={14} />
          </Button>
        </div>

        {/* Items */}
        <div className="flex flex-wrap gap-2 min-h-[36px]">
          {setting.value.map((item, idx) => {
            const c = BADGE_COLORS[idx % BADGE_COLORS.length]
            return (
              <Badge
                key={item}
                className={`px-2.5 py-1 text-xs flex items-center gap-1.5 rounded-lg border ${c.border} ${c.bg} ${c.text} transition-colors font-medium`}
              >
                {item}
                <button
                  onClick={() => onRemove(setting.key, item)}
                  className="ml-0.5 hover:text-red-500 transition-colors opacity-50 hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </Badge>
            )
          })}
          {setting.value.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No items. Add one above.</p>
          )}
        </div>

        {/* Last updated */}
        {setting.updatedAt && (
          <p className="text-[9px] text-gray-300">
            Updated {new Date(setting.updatedAt).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}
            {setting.updatedBy ? ` by ${setting.updatedBy}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

export default function SettingsModule() {
  const [settings, setSettings] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Default rate card
  const [defaultRates, setDefaultRates] = useState<Record<string, number>>(emptyFeeForm)
  const [defaultRatesLoading, setDefaultRatesLoading] = useState(true)
  const [defaultRatesSaving, setDefaultRatesSaving] = useState(false)
  const [defaultRatesDirty, setDefaultRatesDirty] = useState(false)
  // Templates
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([])
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Record<string, unknown> | null>(null)
  const [templateForm, setTemplateForm] = useState<{ name: string; description: string; fees: Record<string, number> }>({ name: '', description: '', fees: emptyFeeForm })

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      const d = await res.json()
      setSettings(d.settings || [])
      setDirty(false)
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch default rate card
  useEffect(() => {
    fetch('/api/rate-card-default').then(r => r.json()).then(d => {
      const form: Record<string, number> = { ...emptyFeeForm }
      for (const key of ALL_FEE_KEYS) { form[key] = Number(d[key]) || (key === 'pickFirstItemsIncluded' ? 4 : 0) }
      setDefaultRates(form)
      setDefaultRatesLoading(false)
    }).catch(() => setDefaultRatesLoading(false))
    // Fetch templates
    fetch('/api/rate-card-templates').then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const handleSaveDefaultRates = async () => {
    setDefaultRatesSaving(true)
    try {
      await fetch('/api/rate-card-default', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaultRates) })
      toast.success('Rate card saved')
      setDefaultRatesDirty(false)
    } catch { toast.error('Failed to save') } finally { setDefaultRatesSaving(false) }
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return }
    const payload = { name: templateForm.name, description: templateForm.description, ...templateForm.fees, ...(editingTemplate ? { id: (editingTemplate as Record<string, string>).id } : {}) }
    try {
      const method = editingTemplate ? 'PUT' : 'POST'
      await fetch('/api/rate-card-templates', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success(editingTemplate ? 'Template updated' : 'Template created')
      setTemplateModalOpen(false)
      setEditingTemplate(null)
      setTemplateForm({ name: '', description: '', fees: { ...defaultRates } })
      fetch('/api/rate-card-templates').then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : []))
    } catch { toast.error('Failed to save template') }
  }

  const handleDeleteTemplate = async (id: string) => {
    await fetch(`/api/rate-card-templates?id=${id}`, { method: 'DELETE' })
    toast.success('Template deleted')
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const handleEditTemplate = (t: Record<string, unknown>) => {
    const fees: Record<string, number> = { ...emptyFeeForm }
    for (const key of ALL_FEE_KEYS) { fees[key] = Number(t[key]) || 0 }
    setTemplateForm({ name: String(t.name), description: String(t.description || ''), fees })
    setEditingTemplate(t)
    setTemplateModalOpen(true)
  }

  const handleNewTemplate = () => {
    setTemplateForm({ name: '', description: '', fees: { ...defaultRates } })
    setEditingTemplate(null)
    setTemplateModalOpen(true)
  }

  // Update a setting in local state (marks dirty)
  const updateSetting = (key: string, newValue: string[]) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s))
    setDirty(true)
  }

  const handleAdd = (key: string, item: string) => {
    const setting = settings.find(s => s.key === key)
    if (!setting) return
    updateSetting(key, [...setting.value, item])
    toast.success(`Added "${item}"`)
  }

  const handleRemove = (key: string, item: string) => {
    const setting = settings.find(s => s.key === key)
    if (!setting) return
    updateSetting(key, setting.value.filter(v => v !== item))
    toast.success(`Removed "${item}"`)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settings.map(s => ({ key: s.key, value: s.value })),
        }),
      })
      if (res.ok) {
        toast.success('Settings saved')
        setDirty(false)
        fetchData()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    fetchData()
    toast.info('Changes discarded')
  }

  const totalItems = settings.reduce((s, st) => s + st.value.length, 0)

  return (
    <AnimatePresence mode="wait">
      <PageTransition key="list">
        <div className="space-y-3">
      <OpsHeader
        title="Settings"
        description="System-wide configuration. Changes persist to the database."
        kpiCells={[
          { label: 'CATEGORIES', value: settings.find(s => s.key === 'categories')?.value.length ?? 0 },
          { label: 'UNITS', value: settings.find(s => s.key === 'units')?.value.length ?? 0 },
          { label: 'PAYMENT METHODS', value: settings.find(s => s.key === 'paymentMethods')?.value.length ?? 0 },
          { label: 'LOCATIONS', value: settings.find(s => s.key === 'storageLocations')?.value.length ?? 0 },
          { label: 'TOTAL ITEMS', value: totalItems },
        ]}
      />

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={fetchData}>
          <RefreshCw size={12} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs rounded-md" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={12} className="mr-1" /> Help
        </Button>
      </div>

      {/* Save bar — sticky when dirty */}
      {dirty && (
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white rounded-lg border border-[#FF6B35] px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
            <span className="text-gray-700 font-medium">Unsaved changes</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-md text-xs h-7" onClick={handleDiscard} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" className="rounded-md text-xs h-7 bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={handleSave} disabled={saving}>
              {saving ? <><RefreshCw size={12} className="mr-1 animate-spin" /> Saving...</> : <><CheckCircle2 size={12} className="mr-1" /> Save Changes</>}
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Settings grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings.map((s, i) => (
            <SettingsSection
              key={s.key}
              setting={s}
              onAdd={handleAdd}
              onRemove={handleRemove}
              delay={i}
            />
          ))}
        </div>
      )}

      {/* ── Default Rate Card ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Rate Card (Universal)</span>
          {defaultRatesDirty && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={() => { fetch('/api/rate-card-default').then(r => r.json()).then(d => { const f: Record<string, number> = { ...emptyFeeForm }; for (const k of ALL_FEE_KEYS) f[k] = Number(d[k]) || 0; setDefaultRates(f); setDefaultRatesDirty(false) }) }}>Discard</Button>
              <Button size="sm" className="h-7 text-xs rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white" onClick={handleSaveDefaultRates} disabled={defaultRatesSaving}>{defaultRatesSaving ? 'Saving...' : 'Save Rate Card'}</Button>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 mb-3">Universal pricing for all merchants. Changes here apply to every merchant immediately. Use templates for tiered pricing.</p>
          {!defaultRatesLoading && (
            <div className="space-y-4">
              {FEE_SECTIONS.map(section => (
                <div key={section.title}>
                  <p className="text-[10px] uppercase tracking-wider text-[#FF6B35] font-semibold mb-2">{section.title}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {section.fields.map(f => (
                      <div key={f.key}>
                        <Label className="text-gray-600 mb-1 block text-[10px]">{f.label}</Label>
                        <Input type="number" value={String(defaultRates[f.key])} onChange={e => { setDefaultRates(prev => ({ ...prev, [f.key]: f.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 })); setDefaultRatesDirty(true) }} className="rounded-lg text-xs h-8" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {defaultRatesLoading && <div className="py-4 text-center text-xs text-gray-400">Loading...</div>}
        </div>
      </div>

      {/* ── Rate Card Templates ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Rate Card Templates</span>
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-md" onClick={handleNewTemplate}><Plus size={12} className="mr-1" /> New Template</Button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {templates.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No templates yet. Create named pricing tiers (e.g., Standard, Premium, Consignment) to apply to merchants in one click.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                  <th className="text-left px-4 py-2 font-semibold">Template Name</th>
                  <th className="text-left px-4 py-2 font-semibold">Description</th>
                  <th className="text-right px-4 py-2 font-semibold">Commission</th>
                  <th className="text-right px-4 py-2 font-semibold">Fulfillment</th>
                  <th className="text-right px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={String(t.id)} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-900">{String(t.name)}</td>
                    <td className="px-4 py-2 text-gray-500 text-[11px] truncate max-w-xs">{String(t.description || '—')}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{Number(t.commissionPercent) || 0}%</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{Number(t.fulfillmentFeePerOrder) || 0}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleEditTemplate(t)} className="p-1 text-gray-400 hover:text-[#FF6B33] mr-1" title="Edit"><SettingsIcon size={12} /></button>
                      <button onClick={() => handleDeleteTemplate(String(t.id))} className="p-1 text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Template Modal */}
      <DetailSlideOver
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={editingTemplate ? `Edit: ${String((editingTemplate as Record<string, string>).name)}` : 'New Rate Card Template'}
        subtitle="Named pricing tier — apply to merchants in one click"
        width="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white rounded-xl" onClick={handleSaveTemplate}>{editingTemplate ? 'Update' : 'Create'} Template</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-700 font-medium mb-1 block text-xs">Template Name <span className="text-red-400">*</span></Label>
              <Input value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g., Standard, Premium, Consignment" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-gray-700 font-medium mb-1 block text-xs">Description</Label>
              <Input value={templateForm.description} onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="What is this tier for?" className="rounded-xl" />
            </div>
          </div>
          {FEE_SECTIONS.map(section => (
            <div key={section.title}>
              <p className="text-[10px] uppercase tracking-wider text-[#FF6B35] font-semibold mb-2">{section.title}</p>
              <div className="grid grid-cols-2 gap-3">
                {section.fields.map(f => (
                  <div key={f.key}>
                    <Label className="text-gray-600 mb-1 block text-[10px]">{f.label}</Label>
                    <Input type="number" value={String(templateForm.fees[f.key])} onChange={e => setTemplateForm({ ...templateForm, fees: { ...templateForm.fees, [f.key]: f.type === 'int' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 } })} className="rounded-lg text-xs h-8" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DetailSlideOver>

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Settings</AlertDialogTitle>
            <AlertDialogDescription>
              Configure system-wide lists that other modules use: product categories, units, payment methods, and storage locations. Changes take effect immediately across all dropdowns.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900 mb-1">Product Categories</p>
              <p>Used when creating products. Appears in the Products module dropdown and drives dashboard breakdowns.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Units of Measurement</p>
              <p>Used when receiving stock (kg, unit, pack, liter, box). Appears in Inbound and Inventory modules.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Payment Methods</p>
              <p>Used when recording payments. Appears in the Payments module and Outbound order form.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Storage Locations</p>
              <p>Used when putting away stock. Appears in Inbound and Item Tracker.</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Saving</p>
              <p>Type a name and press Enter to add. Click X on a badge to remove. The "Unsaved changes" bar appears — click Save to persist. Discard reverts to the saved version.</p>
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
