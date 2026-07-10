'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, FileText, Layers, Wallet, ClipboardList, AlertTriangle, HelpCircle } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

export default function PaymentsParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('cod')
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        <button
          onClick={() => setHelpOpen(true)}
          className="px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <HelpCircle size={12} />
          How does this work?
        </button>
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

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Payments Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Payments module handles the entire financial flow: from collecting cash at the doorstep to paying merchants their earnings. It has six tabs that mirror the money lifecycle. Cash comes in from drivers (COD), fees accrue on charges, statements roll everything up monthly, batches group payouts to merchants, records track individual payments, and disputes handle merchant challenges. Here is how to use each one.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            {/* What this is */}
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> Every shilling that passes through your warehouse is tracked here. Drivers collect cash from customers (COD), bank it with the cashier, and the cashier verifies it. Fees are charged to merchants for storage, handling, and commissions. At the end of the month, a statement rolls up everything the merchant owes or is owed. You create a payment batch to pay them. If they dispute a charge, you issue a credit memo. Every transaction is audited — nothing happens without a record.
              </p>
            </div>

            {/* The 6 tabs */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">The Six Tabs (in order of the money flow)</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs text-green-900 leading-relaxed">
                    <strong>1. COD Reconciliation.</strong> This is where cash from customers meets the bank. When a driver delivers a COD order, they collect cash. At the end of the day, they bank that cash with the cashier. The cashier records the banking here and verifies it matches what the driver collected. If the driver banked less than they collected (shortfall), the difference is added to the driver's damages. If the shortfall can't be recovered, the cashier can write it off — the amount moves from "damages" (recoverable) to "loss" (company absorbs it). Banking records are never deleted once verified — they stay for audit.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>2. Charge Ledger.</strong> This is where fees are recorded. Storage fees, handling fees, COD fees, commissions — every fee the merchant owes is a "charge" here. Charges start as "pending," get approved by a manager, and are then "invoiced" onto the merchant's next statement. If a charge is wrong, it can be rejected before approval. Once invoiced, it can't be deleted — you'd need to create a credit note via Disputes.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="text-xs text-purple-900 leading-relaxed">
                    <strong>3. Statements.</strong> At the end of each month, you generate a statement for each merchant. The statement rolls up: inbound receiving fees, storage fees, outbound fees, return fees, shrinkage debits, COD collected, COD fees, commissions, and sales value. The net payable is what the merchant is owed (or owes, if fees exceed sales). Statements go through an approval workflow: draft → pending approval → approved → issued → paid. Once issued, a PDF and Excel are generated automatically.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs text-orange-900 leading-relaxed">
                    <strong>4. Payment Batches.</strong> When you're ready to pay merchants, you select unpaid statements and create a batch. The system creates one MerchantPayment per statement, marks the statements as paid, and updates each merchant's cumulative payment figures — all in a single transaction. After submitting the batch to the bank, you mark it as "disbursed." If you need to cancel a batch (before disbursement), deleting it reverses all merchant figures and re-opens the statements. Disbursed batches cannot be deleted.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>5. Payment Records.</strong> This is a list of every individual payment — both standalone payments and batch-linked payments. You can record a manual payment here (e.g., a cash payment outside the batch system). Editing a payment's amount automatically adjusts the merchant's cumulative figures and logs the change. Deleting a standalone payment reverses the merchant figures. Batch-linked payments can't be deleted individually — delete the batch instead.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs text-red-900 leading-relaxed">
                    <strong>6. Disputes.</strong> When a merchant challenges a charge on their statement, you create a dispute here. The dispute goes through: open → under review → credited or rejected. If credited, the system issues a credit memo (a negative payment) that reduces what the merchant is owed. The credit memo is linked to the dispute for audit trail. Credited disputes cannot be deleted — the credit memo exists in the payment records and must be reversed there if needed.
                  </p>
                </div>
              </div>
            </div>

            {/* How to use */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module (monthly cycle)</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Daily:</strong> Drivers collect COD cash → bank it with the cashier → cashier records + verifies bankings in COD Reconciliation. Shortfalls are tracked; write-offs are audited.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Throughout the month:</strong> Charges accrue in the Charge Ledger. Approve pending charges so they're ready for the next statement.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>End of month:</strong> Generate statements for all merchants. Review, approve, and issue them. The net payable is what each merchant is owed.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Payment day:</strong> Select unpaid statements, create a payment batch, submit to the bank, mark as disbursed. Merchants are paid; statements are closed.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>As needed:</strong> Merchants dispute charges → review → issue credit memos. Every credit memo is a negative payment that adjusts the merchant's balance.
                  </p>
                </div>
              </div>
            </div>

            {/* The differentiator */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most payment systems treat each transaction in isolation — a payment is recorded, and that's it. This module tracks the entire money lifecycle with full audit trails and reversible transactions. Every payment updates merchant cumulative figures. Every batch is transactional — if one payment fails, the entire batch rolls back. Every deletion reverses its side effects. Every status change is logged with who, when, and why. And verified banking records are never deleted — they stay for audit, because in finance, "I deleted it" is never an acceptable answer to "where did the money go?"
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-[#FF6B35] hover:bg-[#E55A25]">
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
