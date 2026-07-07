'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, FileText, Layers, Wallet, ClipboardList, AlertTriangle } from 'lucide-react'
import PaymentsModule from './PaymentsModule'
import StatementsModule from './StatementsModule'
import PaymentBatchesModule from './PaymentBatchesModule'
import CODReconciliationModule from './CODReconciliationModule'
import ChargesModule from './ChargesModule'
import DisputesModule from './DisputesModule'

type Tab = 'charges' | 'statements' | 'batches' | 'records' | 'cod' | 'disputes'

const tabs: { key: Tab; label: string; icon: typeof CreditCard }[] = [
  { key: 'cod', label: 'COD Reconciliation', icon: Wallet },
  { key: 'charges', label: 'Charge Ledger', icon: ClipboardList },
  { key: 'statements', label: 'Statements', icon: FileText },
  { key: 'batches', label: 'Payment Batches', icon: Layers },
  { key: 'records', label: 'Payment Records', icon: CreditCard },
  { key: 'disputes', label: 'Disputes', icon: AlertTriangle },
]

/**
 * Payments parent module. composes the 6 finance submodules as tabs.
 *
 * Reflects the financial workflow:
 *   COD (daily: cash comes IN from drivers)
 *     → Charges (fees accrue per event)
 *     → Statements (monthly rollup, approval-gated)
 *     → Batches (grouped payout to merchants)
 *     → Records (individual payment records)
 *     → Disputes (merchant challenges → credit memos)
 */
export default function PaymentsParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('cod')

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
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
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
        {activeTab === 'charges' && <ChargesModule />}
        {activeTab === 'statements' && <StatementsModule />}
        {activeTab === 'batches' && <PaymentBatchesModule />}
        {activeTab === 'records' && <PaymentsModule />}
        {activeTab === 'cod' && <CODReconciliationModule />}
        {activeTab === 'disputes' && <DisputesModule />}
      </motion.div>
    </div>
  )
}
