'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, Package, ArrowDownRight, CheckCircle2, XCircle,
  Clock, Truck, AlertTriangle, RotateCcw, Trash2, ClipboardList,
  ChevronRight, MapPin, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { OpsHeader, DenseTable, DenseTh, DenseTd, DenseTr } from '@/components/shared/ops-ui'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'

// ── Types ──
interface ItemEvent {
  id: string; eventId: string; itemId: string; eventType: string
  description: string | null; performedBy: string | null
  runsheetId: string | null; outboundId: string | null; inboundId: string | null
  reason: string | null; previousStatus: string | null; newStatus: string | null
  createdAt: string
}

interface InventoryItem {
  id: string; itemId: string; productId: string; productName: string
  brand: string | null; variant: string | null; unitPrice: number | null
  merchantId: string; merchantName: string; inboundId: string | null
  outboundId: string | null; status: string; condition: string
  trackingLevel: string; boxQty: number | null; parentItemId: string | null
  storageLocation: string | null; expiryDate: string | null
  assignedRider: string | null; runsheetId: string | null
  attemptCount: number; nextAttemptDate: string | null
  finalOutcome: string | null; cancellationReason: string | null
  cancelledAt: string | null; cancelledBy: string | null
  createdAt: string; updatedAt: string
  events?: ItemEvent[]
}

// ── Helpers ──
const statusColor = (status: string) => {
  switch (status) {
    case 'IN_WAREHOUSE': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' }
    case 'PICKED': return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' }
    case 'PACKED': return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }
    case 'IN_TRANSIT': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
    case 'DELIVERED': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' }
    case 'CANCELLED': return { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' }
    case 'RETURNED_TO_WAREHOUSE': return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' }
    case 'RETURNED_TO_RIDER': return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
    case 'DAMAGED': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
    case 'DISPOSED': return { bg: 'bg-gray-200', text: 'text-gray-600', border: 'border-gray-300' }
    default: return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' }
  }
}

const eventIcon = (type: string) => {
  switch (type) {
    case 'RECEIVED': return <ArrowDownRight size={14} className="text-blue-500" />
    case 'STORED': return <MapPin size={14} className="text-blue-400" />
    case 'PICKED': return <ClipboardList size={14} className="text-purple-500" />
    case 'PACKED': return <Package size={14} className="text-indigo-500" />
    case 'DISPATCHED': return <Truck size={14} className="text-blue-500" />
    case 'DELIVERY_ATTEMPTED': return <Truck size={14} className="text-amber-500" />
    case 'DELIVERY_SUCCEEDED': return <CheckCircle2 size={14} className="text-green-500" />
    case 'DELIVERY_FAILED': return <XCircle size={14} className="text-red-500" />
    case 'RESCHEDULED': return <Calendar size={14} className="text-amber-500" />
    case 'RETURNED_TO_RIDER': return <RotateCcw size={14} className="text-yellow-500" />
    case 'RETURNED_TO_WAREHOUSE': return <ArrowDownRight size={14} className="text-orange-500" />
    case 'CANCELLED': return <XCircle size={14} className="text-gray-400" />
    case 'DAMAGED': return <AlertTriangle size={14} className="text-red-500" />
    case 'DISPOSED': return <Trash2 size={14} className="text-gray-400" />
    case 'RTV': return <RotateCcw size={14} className="text-purple-500" />
    default: return <Clock size={14} className="text-gray-400" />
  }
}

const conditionBadge = (condition: string) => {
  switch (condition) {
    case 'good': return <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Good</Badge>
    case 'damaged': return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Damaged</Badge>
    case 'expired': return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Expired</Badge>
    default: return null
  }
}

// ── Main Component ──
export default function ItemTrackerModule() {
  const [searchInput, setSearchInput] = useState('')
  const [, setSearchQuery] = useState('')
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [listMode, setListMode] = useState(false)

  const fetchItem = useCallback(async (query: string) => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/items?itemId=${query.trim()}&events=true`)
      const data = await res.json()
      if (res.ok && data.item) {
        setItem(data.item)
        setItems([])
        setListMode(false)
      } else if (res.ok) {
        toast.error('Item not found')
        setItem(null)
      } else {
        toast.error(data.error || 'Search failed')
      }
    } catch {
      toast.error('Failed to search')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async (query: string) => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/items?search=${query.trim()}`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items || [])
        setItem(null)
        setListMode(true)
      }
    } catch {
      toast.error('Failed to search')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = () => {
    setSearchQuery(searchInput)
    fetchItem(searchInput)
  }

  const handleShowAll = () => {
    setSearchQuery(searchInput)
    fetchAll(searchInput)
  }

  // ── Update item status (DAMAGED, DISPOSED, RETURNED_TO_WAREHOUSE) ──
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateAction, setUpdateAction] = useState<'DAMAGED' | 'DISPOSED' | 'RETURNED_TO_WAREHOUSE' | 'RELOCATE'>('DAMAGED')
  const [updateReason, setUpdateReason] = useState('')
  const [newLocation, setNewLocation] = useState('')

  const handleUpdateItem = async () => {
    if (!item) return
    const updates: Record<string, unknown> = { performedBy: 'warehouse' }
    if (updateAction === 'RELOCATE') {
      if (!newLocation.trim()) {
        toast.error('New storage location is required')
        return
      }
      updates.storageLocation = newLocation.trim()
    } else {
      updates.status = updateAction
      updates.condition = updateAction === 'DAMAGED' ? 'damaged' : item.condition
      if (updateAction === 'DISPOSED') {
        updates.finalOutcome = 'disposed'
      }
      if (updateReason) {
        updates.cancellationReason = updateReason
      }
    }
    try {
      const res = await fetch('/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.itemId, ...updates }),
      })
      if (res.ok) {
        const d = await res.json()
        setItem(d.item)
        toast.success(`Item marked as ${updateAction === 'RELOCATE' ? 'relocated' : updateAction.replace(/_/g, ' ').toLowerCase()}`)
        setUpdateOpen(false)
        setUpdateReason('')
        setNewLocation('')
      } else {
        toast.error('Failed to update item')
      }
    } catch {
      toast.error('Failed to update item')
    }
  }

  // ── Derived Stats ──
  const events = item?.events || []

  // ── Item Detail View ──
  if (item) {
    const sc = statusColor(item.status)

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => { setItem(null); setSearchInput(''); setSearchQuery('') }} className="rounded-xl hover:bg-gray-100">
            <ChevronRight size={18} className="rotate-180 mr-1" /> Back
          </Button>
        </div>

        {/* Item Identity Card */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#1B2A4A] to-[#243656] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-200/60 uppercase tracking-wider font-medium mb-1">Item ID</p>
                <h1 className="text-xl font-bold text-white font-mono">{item.itemId}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs font-semibold border ${sc.bg} ${sc.text} ${sc.border}`}>
                  {item.status.replace(/_/g, ' ')}
                </Badge>
                {conditionBadge(item.condition)}
                {item.trackingLevel === 'box' && (
                  <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Box ({item.boxQty} units)</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Product info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Product</p>
                <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
                {item.brand && <p className="text-[10px] text-gray-400">Brand: {item.brand}</p>}
                {item.variant && <p className="text-[10px] text-gray-400">Variant: {item.variant}</p>}
                <p className="text-xs text-gray-400 font-mono">{item.productId}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Merchant</p>
                <p className="text-sm font-semibold text-gray-900">{item.merchantName}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Unit Price</p>
                <p className="text-sm font-semibold text-gray-700">{item.unitPrice ? item.unitPrice.toLocaleString() : '-'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Inbound Batch</p>
                <p className="text-sm font-mono text-gray-700">{item.inboundId || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Storage Location</p>
                <p className="text-sm font-mono text-gray-700">{item.storageLocation || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Expiry Date</p>
                {item.expiryDate ? (() => {
                  const exp = new Date(item.expiryDate)
                  const now = new Date()
                  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  const isOverdue = diffDays < 0
                  const isWarning = diffDays >= 0 && diffDays <= 30
                  return (
                    <div>
                      <p className="text-sm text-gray-700">{exp.toLocaleDateString()}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isOverdue ? 'text-red-600 bg-red-50' : isWarning ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}>
                        {isOverdue ? `${Math.abs(diffDays)}d overdue` : `${diffDays}d remaining`}
                      </span>
                    </div>
                  )
                })() : (
                  <p className="text-sm text-gray-400">N/A</p>
                )}
              </div>
            </div>

            {/* Order + Transit */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Outbound Order</p>
                <p className="text-sm font-mono text-gray-700">{item.outboundId || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Runsheet</p>
                <p className="text-sm font-mono text-gray-700">{item.runsheetId || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Assigned Rider</p>
                <p className="text-sm text-gray-700">{item.assignedRider || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Delivery Attempts</p>
                <p className={`text-sm font-bold ${item.attemptCount >= 5 ? 'text-red-600' : item.attemptCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {item.attemptCount}{item.nextAttemptDate ? `, Next: ${new Date(item.nextAttemptDate).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>

            {/* Cancellation */}
            {item.cancellationReason && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cancelled</p>
                <p className="text-sm text-gray-700 mt-0.5">{item.cancellationReason}</p>
                <p className="text-xs text-gray-400">By {item.cancelledBy || '-'} on {item.cancelledAt ? new Date(item.cancelledAt).toLocaleString() : '-'}</p>
              </div>
            )}

            {/* Final Outcome */}
            {item.finalOutcome && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Final Outcome</p>
                <p className="text-sm font-medium text-red-700 mt-0.5">{item.finalOutcome.replace(/_/g, ' ')}</p>
              </div>
            )}

            {/* Actions — only show for items that are in the warehouse (not delivered/disposed) */}
            {!['DELIVERED', 'DISPOSED', 'CANCELLED'].includes(item.status) && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Warehouse Actions</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => { setUpdateAction('DAMAGED'); setUpdateOpen(true) }}
                  >
                    <AlertTriangle size={12} className="mr-1" /> Mark Damaged
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs h-8 text-gray-600 border-gray-200 hover:bg-gray-100"
                    onClick={() => { setUpdateAction('DISPOSED'); setUpdateOpen(true) }}
                  >
                    <Trash2 size={12} className="mr-1" /> Dispose
                  </Button>
                  {item.status !== 'IN_WAREHOUSE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs h-8 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => { setUpdateAction('RETURNED_TO_WAREHOUSE'); setUpdateOpen(true) }}
                    >
                      <RotateCcw size={12} className="mr-1" /> Return to Warehouse
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => { setUpdateAction('RELOCATE'); setUpdateOpen(true) }}
                  >
                    <MapPin size={12} className="mr-1" /> Relocate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Event Timeline */}
        <div className="bg-white/80 backdrop-blur-sm border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Item Journey Timeline</h2>
            <p className="text-xs text-gray-400">{events.length} event{events.length !== 1 ? 's' : ''} recorded</p>
          </div>

          <div className="p-5">
            {events.length === 0 ? (
              <div className="text-center py-8">
                <Clock size={32} className="mx-auto text-gray-200 mb-2" />
                <p className="text-gray-400 text-sm">No events recorded</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-100" />

                <div className="space-y-4">
                  {events.map((event, i) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className="relative flex gap-4"
                    >
                      {/* Timeline dot */}
                      <div className="relative z-10 mt-0.5">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                          {eventIcon(event.eventType)}
                        </div>
                      </div>

                      {/* Event content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-[10px] font-semibold border-gray-200 text-gray-500">
                            {event.eventType.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[10px] text-gray-400">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-sm text-gray-700">{event.description}</p>
                        )}
                        {event.reason && (
                          <p className="text-xs text-gray-500 mt-0.5">Reason: {event.reason}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {event.performedBy && (
                            <span className="text-[10px] text-gray-400">by {event.performedBy}</span>
                          )}
                          {event.previousStatus && event.newStatus && (
                            <span className="text-[10px] text-gray-400">
                              {event.previousStatus} → {event.newStatus}
                            </span>
                          )}
                        </div>
                        {event.runsheetId && (
                          <p className="text-[10px] text-blue-400 font-mono mt-0.5">Runsheet: {event.runsheetId}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Update Item Dialog ── */}
        <AlertDialog open={updateOpen} onOpenChange={setUpdateOpen}>
          <AlertDialogContent className="rounded-2xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {updateAction === 'DAMAGED' && <><AlertTriangle size={18} className="text-red-500" /> Mark Item as Damaged</>}
                {updateAction === 'DISPOSED' && <><Trash2 size={18} className="text-gray-500" /> Dispose Item</>}
                {updateAction === 'RETURNED_TO_WAREHOUSE' && <><RotateCcw size={18} className="text-orange-500" /> Return to Warehouse</>}
                {updateAction === 'RELOCATE' && <><MapPin size={18} className="text-blue-500" /> Relocate Item</>}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {updateAction === 'DAMAGED' && 'This will mark the item as damaged. The condition will be set to "damaged" and an event will be logged.'}
                {updateAction === 'DISPOSED' && 'This will mark the item as disposed. This is a final outcome — the item cannot be used again. An event will be logged.'}
                {updateAction === 'RETURNED_TO_WAREHOUSE' && 'This will mark the item as back in the warehouse. Use this when a delivery failed and the item was returned to storage.'}
                {updateAction === 'RELOCATE' && 'Move this item to a different storage location. An event will be logged with the previous and new location.'}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2">
              {updateAction === 'RELOCATE' ? (
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">New Storage Location <span className="text-red-400">*</span></Label>
                  <Input
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. A-12-B-03"
                    className="rounded-xl"
                  />
                  {item.storageLocation && (
                    <p className="text-[10px] text-gray-400 mt-1">Current location: {item.storageLocation}</p>
                  )}
                </div>
              ) : (
                <div>
                  <Label className="text-gray-700 font-medium mb-1.5 block text-xs">
                    Reason / Notes {updateAction === 'DISPOSED' ? <span className="text-red-400">*</span> : <span className="text-gray-400">(optional)</span>}
                  </Label>
                  <Input
                    value={updateReason}
                    onChange={(e) => setUpdateReason(e.target.value)}
                    placeholder={updateAction === 'DAMAGED' ? 'e.g. Dropped during handling' : updateAction === 'DISPOSED' ? 'e.g. Expired — disposed per policy' : 'e.g. Customer refused delivery'}
                    className="rounded-xl"
                  />
                </div>
              )}
              <div className="p-2 rounded-lg bg-gray-50 text-[10px] text-gray-500">
                Item: <span className="font-mono font-semibold">{item.itemId}</span> — {item.productName}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleUpdateItem}
                className={`rounded-xl ${
                  updateAction === 'DAMAGED' ? 'bg-red-600 hover:bg-red-700' :
                  updateAction === 'DISPOSED' ? 'bg-gray-600 hover:bg-gray-700' :
                  updateAction === 'RETURNED_TO_WAREHOUSE' ? 'bg-orange-600 hover:bg-orange-700' :
                  'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    )
  }

  // ── List View (search results) ──
  // ── Main View ──
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-3">
      <OpsHeader
        title="Item Tracker"
        description="Track any item through its complete lifecycle journey"
        kpiCells={[
          { label: 'TRACKED ITEMS', value: items.length },
          { label: 'IN WAREHOUSE', value: items.filter(i => i.status === 'IN_WAREHOUSE').length },
          { label: 'IN TRANSIT', value: items.filter(i => i.status === 'IN_TRANSIT').length },
          { label: 'DELIVERED', value: items.filter(i => i.status === 'DELIVERED').length },
        ]}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearch}
        searchPlaceholder="Enter Item ID (e.g., ITM-123456) or product name, then press Enter..."
      />

      {/* Search hint */}
      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        <button onClick={handleShowAll} disabled={!searchInput.trim()} className="text-[#FF6B35] hover:text-[#E55A25] font-medium disabled:text-gray-300">
          Search all items matching "{searchInput || '...'}"
        </button>
      </div>

      {/* Dense table for list results */}
      {listMode && items.length > 0 ? (
        <DenseTable>
          <thead>
            <tr>
              <DenseTh className="w-24">Item ID</DenseTh>
              <DenseTh>Product</DenseTh>
              <DenseTh>Merchant</DenseTh>
              <DenseTh className="w-20 text-center">Status</DenseTh>
              <DenseTh className="w-20 text-center">Condition</DenseTh>
              <DenseTh className="w-20">Outbound</DenseTh>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 100).map(item => {
              const sc = statusColor(item.status)
              return (
                <DenseTr key={item.id} onClick={() => fetchItem(item.itemId)}>
                  <DenseTd mono className="text-gray-900 font-semibold text-[10px]">{item.itemId}</DenseTd>
                  <DenseTd>
                    <p className="text-gray-900 text-xs font-medium truncate max-w-[150px]">{item.productName}</p>
                  </DenseTd>
                  <DenseTd className="text-gray-600 text-[11px]">{item.merchantName}</DenseTd>
                  <DenseTd className="text-center">
                    <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-semibold ${sc.bg} ${sc.text}`}>{item.status.replace(/_/g, ' ')}</span>
                  </DenseTd>
                  <DenseTd className="text-center">
                    <span className={`text-[9px] font-medium ${item.condition === 'good' ? 'text-green-600' : item.condition === 'damaged' ? 'text-red-600' : 'text-gray-400'}`}>{item.condition}</span>
                  </DenseTd>
                  <DenseTd mono className="text-gray-400 text-[10px]">{item.outboundId || '—'}</DenseTd>
                </DenseTr>
              )
            })}
          </tbody>
        </DenseTable>
      ) : !item && !listMode && (
        <div className="py-12 text-center text-gray-400 text-sm">
          <Search size={32} className="mx-auto mb-3 text-gray-300" />
          Enter an Item ID above to see its complete journey, from receipt through storage, picking, dispatch, delivery, and any returns or failures.
        </div>
      )}
    </motion.div>
  )
}
