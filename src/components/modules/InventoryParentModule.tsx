'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Package, ArrowDownRight, ScanBarcode, Scale, HelpCircle } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import InventoryModule from './InventoryModule'
import InboundModule from './InboundModule'
import ItemTrackerModule from './ItemTrackerModule'
import ReconciliationModule from './ReconciliationModule'

type Tab = 'stock' | 'inbound' | 'tracker' | 'reconciliation'

const tabs: { key: Tab; label: string; sub: string; icon: typeof Package }[] = [
  { key: 'inbound',       label: 'Inbound',       sub: 'Receive stock',     icon: ArrowDownRight },
  { key: 'stock',         label: 'Stock',         sub: "What's on shelves", icon: Package },
  { key: 'tracker',       label: 'Item Tracker',  sub: 'Track by barcode',  icon: ScanBarcode },
  { key: 'reconciliation', label: 'Reconciliation', sub: 'Match system to reality', icon: Scale },
]

export default function InventoryParentModule() {
  const [activeTab, setActiveTab] = useState<Tab>('inbound')
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* Tab bar + help */}
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
                <span className={`text-[10px] font-normal ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>
                  {tab.sub}
                </span>
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

      {/* Help Dialog */}
      <AlertDialog open={helpOpen} onOpenChange={setHelpOpen}>
        <AlertDialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle size={18} />
              How the Inventory Module Works
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Inventory module is where stock enters your warehouse, lives on shelves, and is tracked down to the individual unit. It has four tabs that cover the full lifecycle of physical goods: receiving stock, viewing what is on shelves, tracking individual items by barcode, and reconciling system numbers with reality. Here is how to use each one.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            {/* What this is */}
            <div className="p-3 rounded-lg bg-[#1B2A4A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">What this module is for:</strong> Every unit of stock in your warehouse — from the moment a merchant delivers it, through storage, picking, dispatch, delivery, and any returns or disposals — is tracked here. The Inventory module is the source of truth for what you physically have. When an order is placed in Outbound, the system checks stock levels here before allowing it. When stock is reconciled, the numbers here are what get corrected. You cannot sell what you do not have, and this module is what tells the system what you have.
              </p>
            </div>

            {/* The 4 tabs */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">The Four Tabs</p>
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>1. Inbound.</strong> This is where stock arrives. When a merchant delivers goods, you create an inbound record here: select the merchant, select the product, enter the quantity received, the unit price (for valuation), and the storage location. The system automatically increments the product's current stock, adds to the merchant's cumulative inbound value, creates a storage liability (so storage fees start accruing), and creates individual InventoryItem records for each unit received — each with its own barcode for per-unit tracking.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <p className="text-xs text-orange-900 leading-relaxed">
                    <strong>2. Stock.</strong> This is a list of all products and their current stock levels. You can see which products are low, which are out, and which have plenty. This is the view a warehouse supervisor checks before placing a reorder with a merchant. Stock levels update automatically when inbound records are created (stock goes up) and when outbound orders are placed (stock goes down).
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="text-xs text-purple-900 leading-relaxed">
                    <strong>3. Item Tracker.</strong> This tracks individual units by barcode. Every unit received via inbound gets a unique Item ID (ITM-xxx). Search for an item by its ID and you see its complete journey: when it was received, where it is stored, when it was picked, packed, dispatched, delivered, and any returns or failures. You can also take warehouse actions here: mark an item as damaged, dispose of it, return it to the warehouse after a failed delivery, or relocate it to a different shelf.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs text-green-900 leading-relaxed">
                    <strong>4. Reconciliation.</strong> This is where you match the system's numbers to reality. Do a physical count of a product, enter the counted quantity, and the system computes the variance (difference between system stock and counted stock). If there is a variance, you can optionally adjust the product's system stock to match the counted amount. This is how you catch theft, damage, miscounts, and data entry errors before they cascade into bigger problems.
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
                    <strong>Step 1 — Receive stock.</strong> When a merchant delivers goods, open the Inbound tab. Click "New Inbound", select the merchant and product, enter the quantity and unit price, and specify where on the shelves it will be stored. The system creates the inbound record, updates stock, and generates a barcode for each unit.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 2 — Check stock levels.</strong> Open the Stock tab to see what you have. Products with low stock should be reordered. Products with zero stock cannot be ordered by customers (the Outbound module will block the order).
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 3 — Track items.</strong> If you need to find a specific unit (e.g. a customer says their item was damaged), open the Item Tracker tab, enter the Item ID from the outbound record, and see its full history. You can mark it as damaged, dispose of it, or relocate it from here.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <strong>Step 4 — Reconcile regularly.</strong> At least once a month, do a physical count of high-value products. Open the Reconciliation tab, create a record with the product, enter the counted quantity, and review the variance. If the variance is significant, adjust the system stock to match reality.
                  </p>
                </div>
              </div>
            </div>

            {/* The differentiator */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2A3A5A] text-white">
              <p className="text-xs leading-relaxed">
                <strong className="text-sm">Why this is different:</strong> Most warehouse systems track stock at the product level only — they know you have 50 units of a product, but they cannot tell you which specific unit went to which customer. This module tracks every single unit by barcode, so when a customer reports a problem, you can trace that exact item's journey from receipt to delivery. Combined with automatic storage liability tracking and reconciliation, this gives you full accountability for every unit that passes through your warehouse.
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
