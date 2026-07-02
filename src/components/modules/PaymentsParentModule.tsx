'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, FileText, Layers, Wallet } from 'lucide-react'
import PaymentsModule from './PaymentsModule'
import StatementsModule from './StatementsModule'
import PaymentBatchesModule from './PaymentBatchesModule'
import CODReconciliationModule from './CODReconciliationModule'

type Tab = 'records' | 'statements' | 'batches' | 'cod'

const tabs: { key: Tab; label: string; icon: typeof CreditCard }[] = [
  { key: 'records', label: 'Payment Records', icon: CreditCard },
  { key: 'statements', label: 'Statements', icon: FileText },
  { key: 'batches', label: 'Payment Batches', icon: Layers },
  { key: 'cod', label: 'COD Reconciliation', icon: Wallet },
]

/**
 * Payments parent module — composes the 4 finance submodules as tabs.
 *
 * Reflects the financial workflow:
 *   Statement (monthly) → Batch (grouped payout) → Records (individual payments)
 *   COD Reconciliation runs in parallel (cash coming IN from drivers vs going OUT to merchants)
 */
export default function PaymentsParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('records')

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
        {activeTab === 'records' && <PaymentsModule />}
        {activeTab === 'statements' && <StatementsModule />}
        {activeTab === 'batches' && <PaymentBatchesModule />}
        {activeTab === 'cod' && <CODReconciliationModule />}
      </motion.div>
    </div>
  )
}
