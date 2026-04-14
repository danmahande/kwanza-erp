'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Settings, Tag, Ruler, CreditCard, Warehouse, Plus, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const BADGE_COLORS = [
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/60', hover: 'hover:bg-orange-100/60' },
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', hover: 'hover:bg-blue-100/60' },
  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200/60', hover: 'hover:bg-green-100/60' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60', hover: 'hover:bg-purple-100/60' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', hover: 'hover:bg-amber-100/60' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200/60', hover: 'hover:bg-pink-100/60' },
]

function SettingsSection({
  title, icon: Icon, items, setItems, color, delay = 0,
}: {
  title: string; icon: React.ElementType; items: string[]; setItems: (v: string[]) => void; color: string; delay?: number
}) {
  const [inputVal, setInputVal] = useState('')

  const addItem = () => {
    if (!inputVal || items.includes(inputVal)) return
    setItems([...items, inputVal])
    setInputVal('')
    toast.success('Item added')
  }

  const removeItem = (item: string) => {
    setItems(items.filter(l => l !== item))
    toast.success('Item removed')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2.5 text-gray-800 font-bold">
            <div className={`p-2 rounded-xl`} style={{ backgroundColor: `${color}15` }}>
              <Icon size={16} className="icon-color" style={{ color }} aria-hidden="true" />
            </div>
            {title}
            <Badge variant="secondary" className="ml-auto text-[10px] bg-gray-100 text-gray-500 border-0 px-2">
              {items.length} items
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder={`Add new ${title.toLowerCase()}...`}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="rounded-xl border-gray-200 text-sm"
            />
            <Button onClick={addItem} size="icon" className="bg-[#FF6B35] hover:bg-[#E55A25] text-white shrink-0 rounded-xl h-10 w-10">
              <Plus size={16} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {items.map((item, idx) => {
              const c = BADGE_COLORS[idx % BADGE_COLORS.length]
              return (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Badge variant="secondary" className={`px-3 py-1.5 text-sm flex items-center gap-1.5 rounded-lg border ${c.border} ${c.bg} ${c.text} ${c.hover} transition-colors cursor-default`}>
                    {item}
                    <button onClick={() => removeItem(item)} aria-label={`Remove ${item}`} className="ml-1 hover:text-red-500 transition-colors opacity-60 hover:opacity-100">
                      <X size={12} />
                    </button>
                  </Badge>
                </motion.div>
              )
            })}
            {items.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No items yet. Add one above.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function SettingsModule() {
  const [cats, setCats] = useState<string[]>(['Produce', 'Dairy', 'Bakery', 'Beverages', 'Household', 'Other'])
  const [unts, setUnts] = useState<string[]>(['kg', 'unit', 'pack', 'liter', 'box', 'dozen'])
  const [pays, setPays] = useState<string[]>(['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque'])
  const [locs, setLocs] = useState<string[]>(['Warehouse A', 'Warehouse B', 'Cold Room', 'Shelf 1', 'Shelf 2'])

  const totalItems = cats.length + unts.length + pays.length + locs.length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage system configuration and dimensions</p>
      </div>

      {/* Config Banner */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B2A4A]/5 to-[#1B2A4A]/10 border border-[#1B2A4A]/10 p-6"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#0F1A2E] flex items-center justify-center shadow-lg">
            <Settings size={28} className="text-[#FF6B35]" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">System Configuration</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage categories, units, payment methods, and storage locations</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/80 border border-gray-200">
            <Sparkles size={14} className="text-[#FF6B35]" />
            <span className="text-sm font-semibold text-gray-700">{totalItems}</span>
            <span className="text-xs text-gray-400">total items</span>
          </div>
        </div>
      </motion.div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingsSection title="Product Categories" icon={Tag} items={cats} setItems={setCats} color="#FF6B35" delay={0.1} />
        <SettingsSection title="Units of Measurement" icon={Ruler} items={unts} setItems={setUnts} color="#1B2A4A" delay={0.15} />
        <SettingsSection title="Payment Methods" icon={CreditCard} items={pays} setItems={setPays} color="#22C55E" delay={0.2} />
        <SettingsSection title="Storage Locations" icon={Warehouse} items={locs} setItems={setLocs} color="#3B82F6" delay={0.25} />
      </div>
    </motion.div>
  )
}
