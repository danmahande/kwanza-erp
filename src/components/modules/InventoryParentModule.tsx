'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Package, ArrowDownRight, ScanBarcode, Scale } from 'lucide-react'
import InventoryModule from './InventoryModule'
import InboundModule from './InboundModule'
import ItemTrackerModule from './ItemTrackerModule'
import ReconciliationModule from './ReconciliationModule'

type Tab = 'stock' | 'inbound' | 'tracker' | 'reconciliation'

const tabs: { key: Tab; label: string; icon: typeof Package }[] = [
  { key: 'stock', label: 'Stock', icon: Package },
  { key: 'inbound', label: 'Inbound', icon: ArrowDownRight },
  { key: 'tracker', label: 'Item Tracker', icon: ScanBarcode },
  { key: 'reconciliation', label: 'Reconciliation', icon: Scale },
]

/**
 * Inventory parent module — composes the 4 inventory submodules as tabs.
 * Reduces sidebar clutter: one "Inventory" entry instead of four.
 */
export default function InventoryParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('stock')

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-white text-[#FF6B35] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Active submodule */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'stock' && <InventoryModule />}
        {activeTab === 'inbound' && <InboundModule />}
        {activeTab === 'tracker' && <ItemTrackerModule />}
        {activeTab === 'reconciliation' && <ReconciliationModule />}
      </motion.div>
    </div>
  )
}
