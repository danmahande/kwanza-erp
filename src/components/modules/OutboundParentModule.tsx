'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ShoppingCart, ClipboardList } from 'lucide-react'
import OutboundModule from './OutboundModule'
import OrderProcessingModule from './OrderProcessingModule'
import RunsheetModule from './RunsheetModule'

type Tab = 'orders' | 'outbound' | 'runsheets'

const tabs: { key: Tab; label: string; icon: typeof ArrowUpRight }[] = [
  { key: 'orders', label: 'Order Processing', icon: ShoppingCart },
  { key: 'outbound', label: 'Outbound Records', icon: ArrowUpRight },
  { key: 'runsheets', label: 'Runsheets', icon: ClipboardList },
]

/**
 * Outbound parent module — composes Order Processing, Outbound Records, and Runsheets as tabs.
 * Reflects the forward-moving workflow: Order → Outbound → Runsheet → Delivery.
 */
export default function OutboundParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('orders')

  return (
    <div className="space-y-4">
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

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'orders' && <OrderProcessingModule />}
        {activeTab === 'outbound' && <OutboundModule />}
        {activeTab === 'runsheets' && <RunsheetModule />}
      </motion.div>
    </div>
  )
}
