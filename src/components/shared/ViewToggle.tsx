'use client'

import { motion } from 'framer-motion'
import { LayoutGrid, List } from 'lucide-react'

type ViewMode = 'card' | 'table'

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-0.5 gap-0.5">
      <button
        onClick={() => onChange('card')}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          value === 'card' ? 'text-[#FF6B35]' : 'text-gray-400 hover:text-gray-600'
        }`}
        aria-label="Card view"
        title="Card view"
      >
        {value === 'card' && (
          <motion.div
            layoutId="view-toggle-active"
            className="absolute inset-0 bg-[#FF6B35]/10 rounded-lg border border-[#FF6B35]/20"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <LayoutGrid size={14} className="relative z-10" />
        <span className="relative z-10 hidden sm:inline">Cards</span>
      </button>
      <button
        onClick={() => onChange('table')}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          value === 'table' ? 'text-[#FF6B35]' : 'text-gray-400 hover:text-gray-600'
        }`}
        aria-label="Table view"
        title="Table view"
      >
        {value === 'table' && (
          <motion.div
            layoutId="view-toggle-active"
            className="absolute inset-0 bg-[#FF6B35]/10 rounded-lg border border-[#FF6B35]/20"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <List size={14} className="relative z-10" />
        <span className="relative z-10 hidden sm:inline">Table</span>
      </button>
    </div>
  )
}
