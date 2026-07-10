'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PackageX, RotateCcw, AlertTriangle, HelpCircle } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import AfterSalesModule from './AfterSalesModule'
import RTVModule from './RTVModule'
import ShrinkageModule from './ShrinkageModule'

type Tab = 'rma' | 'rtv' | 'shrinkage'

const tabs: { key: Tab; label: string; icon: typeof PackageX }[] = [
  { key: 'rma', label: 'After-Sales (RMA)', icon: PackageX },
  { key: 'rtv', label: 'RTV', icon: RotateCcw },
  { key: 'shrinkage', label: 'Shrinkage', icon: AlertTriangle },
]

export default function ReturnsParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('rma')
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
        {activeTab === 'rma' && <AfterSalesModule />}
        {activeTab === 'rtv' && <RTVModule />}
        {activeTab === 'shrinkage' && <ShrinkageModule />}
      </motion.div>

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Returns Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Returns module handles three types of stock movement that all involve goods going backwards: customer returns (RMA), returns to vendors (RTV), and shrinkage (lost, stolen, damaged, or expired stock). Each has its own workflow and its own tab. Here is how to use each one.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            {/* What this is */}
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> Every unit that enters your warehouse is tracked until it leaves. Most units leave via Outbound (delivered to a customer). But some come back — customers return faulty goods, vendors recall products, stock gets damaged or stolen. This module tracks all of those backward flows. Without it, you lose visibility of where stock went, who is responsible, and whether the merchant should be debited for the loss.
              </p>
            </div>

            {/* The 3 tabs */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">The Three Tabs</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs text-orange-900 leading-relaxed">
                    <strong>1. After-Sales (RMA).</strong> When a customer returns an item, you create an RMA here. Select the original order (by DS-XXX number), enter the reason, and specify which item IDs came back. The system flips the order number from DS-XXX to RT-XXX so the returned item is tracked separately from the original sale. The original DS number is preserved in the order's history so you can always find it. The item is marked as "pending disposition" — it's in the warehouse but NOT back in stock yet. After inspection, you approve the RMA and decide what to do with each item: RESTOCK (put it back on the shelf — stock goes up), RTV (send it back to the vendor — auto-creates an RTV record), or DISPOSE (it's unsellable — item is marked disposed).
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>2. RTV (Return to Vendor).</strong> When you need to send stock back to the vendor (faulty batch, expired goods, product recall), you create an RTV here. Select the product, quantity, and reason. The system decrements stock (goods are leaving) and tracks the RTV through a workflow: pending → submit to vendor → vendor approves → ship back → vendor confirms receipt. If the vendor rejects the RTV or you cancel it, stock is automatically restored. RTV records can also be auto-created from an RMA when the disposition is "RTV."
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs text-red-900 leading-relaxed">
                    <strong>3. Shrinkage.</strong> When stock is found missing — damaged, stolen, expired, or simply unaccounted for — you record it here. Select the product, quantity, and reason. The system decrements stock (the units are gone) and computes the total value (qty × unit cost). After investigation, you resolve the shrinkage record. If "debit merchant" is checked, the total value is added to the merchant's cumulative shrinkage figure, which shows up on their next statement. This is how you hold merchants accountable for damage that happens while their stock is in your warehouse.
                  </p>
                </div>
              </div>
            </div>

            {/* How to use */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">How to Use This Module</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 1 — Customer returns.</strong> A customer calls to say their item is faulty. Open the After-Sales tab, click "New RMA", select the original order number (DS-XXX), enter the reason, and scan or type the item IDs that came back. The order number flips to RT-XXX. The item is now in the warehouse, pending inspection.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 2 — Inspect and approve.</strong> After inspecting the returned item, open the RMA, set the status to "approved", and choose a disposition for each item: RESTOCK (item is sellable — stock goes up), RTV (send back to vendor — auto-creates an RTV record), or DISPOSE (item is unsellable — marked disposed). The merchant's return value is updated automatically.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 3 — Send back to vendor.</strong> For items dispositioned as RTV, open the RTV tab, submit to the vendor, and track through approval → shipment → confirmation. If the vendor rejects or you cancel, stock is restored automatically.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 4 — Record shrinkage.</strong> During a cycle count, if you find 5 units of a product missing, open the Shrinkage tab, create a record with the product, quantity (5), and reason (theft, damage, expiry). Stock is decremented immediately. After investigation, resolve the record — if the merchant is responsible, check "debit merchant" and the value is added to their next statement.
                  </p>
                </div>
              </div>
            </div>

            {/* The differentiator */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most warehouse systems treat returns as an afterthought — a simple form that marks stock as "returned" with no tracking of what happened next. This module tracks every returned unit through its entire second lifecycle: from customer return, through inspection, to final disposition (restocked, returned to vendor, or disposed). The DS→RT order number flip means a returned item is tracked separately from the original sale — you always know which items came back and what happened to them. And the shrinkage module holds merchants accountable for losses that happen on your watch, with automatic debits on their statements.
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
