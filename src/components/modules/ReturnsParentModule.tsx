'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PackageX, RotateCcw, AlertTriangle } from 'lucide-react'
import AfterSalesModule from './AfterSalesModule'
import RTVModule from './RTVModule'
import ShrinkageModule from './ShrinkageModule'

type Tab = 'rma' | 'rtv' | 'shrinkage'

const tabs: { key: Tab; label: string; icon: typeof PackageX }[] = [
  { key: 'rma', label: 'After-Sales (RMA)', icon: PackageX },
  { key: 'rtv', label: 'RTV', icon: RotateCcw },
  { key: 'shrinkage', label: 'Shrinkage', icon: AlertTriangle },
]

/**
 * Returns parent module. composes After-Sales (RMA), RTV, and Shrinkage as tabs.
 *
 * RMA = customer return (Return Merchandise Authorization)
 * RTV = return to vendor (warehouse sends stock back)
 * Shrinkage = lost/stolen/damaged stock (sub-component of RTV per customer requirement)
 *
 * Grouping these clarifies the mental model: all "returns" live in one place.
 */
export default function ReturnsParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('rma')

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
        {activeTab === 'rma' && <AfterSalesModule />}
        {activeTab === 'rtv' && <RTVModule />}
        {activeTab === 'shrinkage' && <ShrinkageModule />}
      </motion.div>
    </div>
  )
}
