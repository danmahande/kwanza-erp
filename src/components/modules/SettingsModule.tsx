'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tag, Ruler, CreditCard, Warehouse, Plus, X, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader } from '@/components/shared/ops-ui'

// ── Badge color palette ──
const BADGE_COLORS = [
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/60', hover: 'hover:bg-orange-100/60' },
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/60', hover: 'hover:bg-blue-100/60' },
  { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200/60', hover: 'hover:bg-green-100/60' },
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/60', hover: 'hover:bg-purple-100/60' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/60', hover: 'hover:bg-amber-100/60' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200/60', hover: 'hover:bg-pink-100/60' },
]

// ── Card entrance animation ──
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
}

// ── Settings Section Component ──
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
      custom={delay}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
      transition={{ duration: 0.2 }}
    >
      <Card className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Card header with icon and count */}
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm flex items-center gap-3 text-gray-800 font-bold">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}12` }}>
              <Icon size={18} style={{ color }} aria-hidden="true" />
            </div>
            <span className="flex-1">{title}</span>
            <Badge variant="secondary" className="ml-auto text-[10px] bg-gray-100/80 text-gray-500 border-0 px-2.5 py-0.5 font-semibold rounded-full">
              {items.length}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 px-5 pb-5">
          {/* Add item input */}
          <div className="flex gap-2">
            <Input
              placeholder={`Add new ${title.toLowerCase()}...`}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="rounded-xl border-gray-200/80 text-sm h-10 bg-gray-50/50 focus:bg-white transition-colors"
            />
            <Button
              onClick={addItem}
              size="icon"
              className="bg-[#FF6B35] hover:bg-[#E55A25] text-white shrink-0 rounded-xl h-10 w-10 shadow-sm shadow-[#FF6B35]/20"
            >
              <Plus size={16} />
            </Button>
          </div>

          {/* Items badges */}
          <div className="flex flex-wrap gap-2 min-h-[44px]">
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
                  <Badge
                    variant="secondary"
                    className={`px-3 py-1.5 text-xs flex items-center gap-1.5 rounded-lg border ${c.border} ${c.bg} ${c.text} ${c.hover} transition-colors cursor-default font-medium`}
                  >
                    {item}
                    <button
                      onClick={() => removeItem(item)}
                      aria-label={`Remove ${item}`}
                      className="ml-0.5 hover:text-red-500 transition-colors opacity-50 hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                </motion.div>
              )
            })}
            {items.length === 0 && (
              <div className="flex items-center justify-center w-full py-3">
                <p className="text-xs text-gray-400">No items yet. Add one above.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// ── MAIN COMPONENT ──
// ════════════════════════════════════════════
export default function SettingsModule() {
  const [cats, setCats] = useState<string[]>(['Produce', 'Dairy', 'Bakery', 'Beverages', 'Household', 'Other'])
  const [unts, setUnts] = useState<string[]>(['kg', 'unit', 'pack', 'liter', 'box', 'dozen'])
  const [pays, setPays] = useState<string[]>(['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque'])
  const [locs, setLocs] = useState<string[]>(['Warehouse A', 'Warehouse B', 'Cold Room', 'Shelf 1', 'Shelf 2'])

  const totalItems = cats.length + unts.length + pays.length + locs.length

  const stats = [
    { label: 'Total Items',     value: totalItems,      icon: Tag,       color: '#FF6B35', bg: 'bg-[#FF6B35]/15',   border: 'border-[#FF6B35]/20',   gradient: 'from-[#FF6B35]/10 to-[#FF6B35]/5' },
    { label: 'Categories',      value: cats.length,     icon: Tag,       color: '#F59E0B', bg: 'bg-amber-500/15',   border: 'border-amber-500/20',   gradient: 'from-amber-500/10 to-amber-500/5' },
    { label: 'Units',           value: unts.length,     icon: Ruler,     color: '#1B2A4A', bg: 'bg-slate-600/15',   border: 'border-slate-500/20',   gradient: 'from-slate-500/10 to-slate-500/5' },
    { label: 'Payment Methods', value: pays.length,     icon: CreditCard, color: '#22C55E', bg: 'bg-green-500/15',   border: 'border-green-500/20',   gradient: 'from-green-500/10 to-green-500/5' },
    { label: 'Locations',       value: locs.length,     icon: Warehouse,  color: '#3B82F6', bg: 'bg-blue-500/15',    border: 'border-blue-500/20',    gradient: 'from-blue-500/10 to-blue-500/5' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* ── Office Header ── */}
      <OpsHeader
        title="Settings"
        description="Configure system dimensions and preferences"
        kpiCells={[
          { label: 'CATEGORIES', value: cats.length },
          { label: 'UNITS', value: unts.length },
          { label: 'PAYMENT METHODS', value: pays.length },
          { label: 'LOCATIONS', value: locs.length },
        ]}
      />

      {/* ── Settings Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SettingsSection title="Product Categories" icon={Tag} items={cats} setItems={setCats} color="#FF6B35" delay={0} />
        <SettingsSection title="Units of Measurement" icon={Ruler} items={unts} setItems={setUnts} color="#1B2A4A" delay={1} />
        <SettingsSection title="Payment Methods" icon={CreditCard} items={pays} setItems={setPays} color="#22C55E" delay={2} />
        <SettingsSection title="Storage Locations" icon={Warehouse} items={locs} setItems={setLocs} color="#3B82F6" delay={3} />
      </div>
    </motion.div>
  )
}
