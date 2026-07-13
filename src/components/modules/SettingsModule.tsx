'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tag, Ruler, CreditCard, Warehouse, Plus, X, HelpCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'
import PageTransition from '@/components/shared/PageTransition'

interface SettingItem {
  key: string
  label: string
  value: string[]
  updatedBy: string | null
  updatedAt: string | null
}

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
