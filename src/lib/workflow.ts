/**
 * Workflow State Machine
 *
 * Defines the legal status transitions for every workflow module in Kwanza.
 * This is the single source of truth for "what action can I take next" —
 * the UI uses it to render the right buttons, the API uses it to validate
 * transitions, the audit log uses it to log state changes.
 *
 * Each module has:
 * - stages: ordered list of statuses the workflow moves through
 * - transitions: map of { fromStatus → [allowed next statuses] }
 * - actions: human-readable action labels for each transition
 * - exceptions: optional statuses that branch off the main flow
 */

export interface WorkflowStage {
  status: string
  label: string           // Short label for badge
  action?: string         // Action verb to advance TO this stage (e.g. "Pick", "Pack")
  description?: string    // What this stage means
  isException?: boolean   // True if this is an off-flow status (cancelled, returned, etc.)
}

export interface WorkflowDefinition {
  module: string
  stages: WorkflowStage[]
  transitions: Record<string, string[]>   // fromStatus → [allowedNextStatuses]
  initialStatus: string
}

// ── OUTBOUND workflow ──
// Real-world fulfillment: NEW (intake) → RELEASED (validated, on floor) →
// PICKING → PICKED → PACKING → PACKED → STAGED (at dock) → DISPATCHED → DELIVERED
// Exceptions: cancelled, returned, failed
//
// Why "released" exists: it's the moment a NEW order passes intake validation
// (address, payment, stock, fraud checks) and gets hard-allocated to inventory.
// Before release, two orders can both "see" the same stock. After release,
// those units are locked to that order — no other order can claim them.
//
// Why "staged" exists: separates "boxed and sealed" (packed) from "physically
// at the outbound dock waiting for the rider" (staged). Pack capacity and
// dispatch capacity are different bottlenecks — splitting them lets the ops
// manager see each clearly and lets the rider manifest match what's actually
// at the dock, not what's still being taped shut.
export const OUTBOUND_WORKFLOW: WorkflowDefinition = {
  module: 'outbound',
  initialStatus: 'pending',
  stages: [
    { status: 'pending',     label: 'New',         description: 'Order received, awaiting intake validation (address / payment / stock / fraud)' },
    { status: 'released',    label: 'Released',    action: 'Release to Floor', description: 'Validated and released to pick floor — inventory hard-allocated, SLA clock starts' },
    { status: 'picking',     label: 'Picking',     action: 'Start Picking', description: 'Picker has claimed the order, collecting items from shelves' },
    { status: 'picked',      label: 'Picked',      action: 'Mark Picked',   description: 'All items collected, tote moving to pack station' },
    { status: 'packing',     label: 'Packing',     action: 'Start Packing', description: 'Packer is boxing the order' },
    { status: 'packed',      label: 'Packed',      action: 'Mark Packed',   description: 'Boxed, sealed, labeled — ready to stage at dock' },
    { status: 'staged',      label: 'Staged',      action: 'Stage at Dock', description: 'Staged at outbound dock by carrier/route, awaiting rider pickup' },
    { status: 'dispatched',  label: 'Dispatched',  action: 'Dispatch',      description: 'Handed to driver, on the road' },
    { status: 'delivered',   label: 'Delivered',   action: 'Mark Delivered', description: 'Customer received the order' },
    { status: 'cancelled',   label: 'Cancelled',   isException: true, description: 'Order was cancelled before dispatch' },
    { status: 'returned',    label: 'Returned',    isException: true, description: 'Customer returned the order after delivery' },
    { status: 'failed',      label: 'Failed',      isException: true, description: 'Delivery attempted but failed' },
  ],
  transitions: {
    pending:    ['released', 'cancelled'],         // intake validation → release to floor
    released:   ['picking', 'cancelled'],          // picker claims the order
    picking:    ['picked', 'released', 'cancelled'], // can release back if wrong pick
    picked:     ['packing', 'cancelled'],
    packing:    ['packed', 'picked'],
    packed:     ['staged', 'packing'],             // stage at dock, or revert to re-pack
    staged:     ['dispatched', 'packed'],          // rider picks up, or pull back if manifest mismatch
    dispatched: ['delivered', 'failed', 'returned'],
    delivered:  ['returned'],
    failed:     ['dispatched', 'cancelled'],
    // exception states are terminal (or can be re-dispatched from failed)
    cancelled:  [],
    returned:   [],
  },
}

// ── ORDER PROCESSING workflow ──
// Mirrors outbound but uses order_processing-specific statuses
export const ORDER_PROCESSING_WORKFLOW: WorkflowDefinition = {
  module: 'order_processing',
  initialStatus: 'new_order',
  stages: [
    { status: 'new_order',   label: 'New',         description: 'Order just created, awaiting warehouse action' },
    { status: 'processing',  label: 'Processing',  action: 'Start Processing', description: 'Warehouse is picking and packing' },
    { status: 'shipped',     label: 'Dispatched',  action: 'Mark Dispatched', description: 'Out for delivery to customer' },
    { status: 'delivered',   label: 'Delivered',   action: 'Mark Delivered', description: 'Customer received the order' },
    { status: 'returned',    label: 'Returned',    action: 'Mark Returned', isException: true, description: 'Customer returned the order' },
    { status: 'cancelled',   label: 'Cancelled',   isException: true, description: 'Order cancelled' },
  ],
  transitions: {
    new_order:  ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped:    ['delivered', 'returned', 'failed'],
    delivered:  ['returned'],
    returned:   [],
    cancelled:  [],
    failed:     ['shipped', 'cancelled'],
  },
}

// ── AFTER-SALES (RMA) workflow ──
// Customer return: initiated → received → inspected → approved/rejected → disposition applied
export const AFTER_SALES_WORKFLOW: WorkflowDefinition = {
  module: 'after_sales',
  initialStatus: 'initiated',
  stages: [
    { status: 'initiated',   label: 'Initiated',   description: 'Customer requested a return' },
    { status: 'received',    label: 'Received',    action: 'Mark Received', description: 'Returned item arrived at warehouse' },
    { status: 'in_review',   label: 'In Review',   action: 'Start Review', description: 'Agent is inspecting the item' },
    { status: 'approved',    label: 'Approved',    action: 'Approve', description: 'Return approved, disposition being applied' },
    { status: 'rejected',    label: 'Rejected',    action: 'Reject', isException: true, description: 'Return rejected (e.g. outside return window)' },
    { status: 'processed',   label: 'Processed',   action: 'Mark Processed', description: 'Disposition applied (restocked / RTV / disposed)' },
  ],
  transitions: {
    initiated:  ['received', 'rejected'],
    received:   ['in_review', 'rejected'],
    in_review:  ['approved', 'rejected'],
    approved:   ['processed'],
    rejected:   [],
    processed:  [],
  },
}

// ── RTV workflow ──
// Submit to vendor → vendor approves → ship back → confirmed
export const RTV_WORKFLOW: WorkflowDefinition = {
  module: 'rtv',
  initialStatus: 'pending',
  stages: [
    { status: 'pending',            label: 'Pending',            description: 'RTV created, awaiting submission to vendor' },
    { status: 'pending_approval',   label: 'Pending Approval',   action: 'Submit to Vendor', description: 'Sent to vendor, waiting for their approval' },
    { status: 'approved',           label: 'Approved',           action: 'Vendor Approved', description: 'Vendor approved the return' },
    { status: 'rejected',           label: 'Rejected',           action: 'Vendor Rejected', isException: true, description: 'Vendor rejected the return' },
    { status: 'shipped',            label: 'Dispatched',         action: 'Dispatch to Vendor', description: 'Goods dispatched back to vendor' },
    { status: 'processed',          label: 'Processed',          action: 'Confirm Received', description: 'Vendor confirmed receipt' },
  ],
  transitions: {
    pending:          ['pending_approval', 'cancelled'],
    pending_approval: ['approved', 'rejected', 'pending'],
    approved:         ['shipped'],
    rejected:         [],
    shipped:          ['processed'],
    processed:        [],
    cancelled:        [],
  },
}

// ── SHRINKAGE workflow ──
// Reported → investigating → resolved (with optional merchant debit)
export const SHRINKAGE_WORKFLOW: WorkflowDefinition = {
  module: 'shrinkage',
  initialStatus: 'pending',
  stages: [
    { status: 'pending',      label: 'Reported',     description: 'Shrinkage identified, awaiting investigation' },
    { status: 'investigating', label: 'Investigating', action: 'Start Investigation', description: 'Supervisor is reviewing' },
    { status: 'resolved',     label: 'Resolved',     action: 'Resolve', description: 'Resolved — if debitMerchant=true, merchant will be charged' },
  ],
  transitions: {
    pending:      ['investigating'],
    investigating: ['resolved', 'pending'],
    resolved:     [],
  },
}

// ── INBOUND workflow ──
// Expected → received → put_away → stored
export const INBOUND_WORKFLOW: WorkflowDefinition = {
  module: 'inbound',
  initialStatus: 'received',
  stages: [
    { status: 'received',  label: 'Received',   description: 'Goods arrived at warehouse bay' },
    { status: 'put_away',  label: 'Put Away',   action: 'Start Put Away', description: 'Being moved to storage location' },
    { status: 'stored',    label: 'Stored',     action: 'Mark Stored', description: 'In its storage location, available for orders' },
  ],
  transitions: {
    received: ['put_away'],
    put_away: ['stored', 'received'],
    stored:   [],
  },
}

// ── DRIVER BANKING workflow ──
export const DRIVER_BANKING_WORKFLOW: WorkflowDefinition = {
  module: 'driver_banking',
  initialStatus: 'pending',
  stages: [
    { status: 'pending',   label: 'Pending',   description: 'Banking recorded, awaiting verification' },
    { status: 'verified',  label: 'Verified',  action: 'Verify', description: 'Cashier confirmed the deposit matches' },
    { status: 'shortfall', label: 'Shortfall', action: 'Mark Shortfall', isException: true, description: 'Deposit is less than expected' },
    { status: 'disputed',  label: 'Disputed',  action: 'Mark Disputed', isException: true, description: 'Driver disputes the reconciliation' },
  ],
  transitions: {
    pending:   ['verified', 'shortfall', 'disputed'],
    verified:  [],
    shortfall: ['verified', 'disputed'],
    disputed:  ['verified', 'shortfall'],
  },
}

// ── Registry ──
export const WORKFLOWS: Record<string, WorkflowDefinition> = {
  outbound: OUTBOUND_WORKFLOW,
  order_processing: ORDER_PROCESSING_WORKFLOW,
  after_sales: AFTER_SALES_WORKFLOW,
  rtv: RTV_WORKFLOW,
  shrinkage: SHRINKAGE_WORKFLOW,
  inbound: INBOUND_WORKFLOW,
  driver_banking: DRIVER_BANKING_WORKFLOW,
}

/**
 * Get the workflow definition for a module.
 */
export function getWorkflow(module: string): WorkflowDefinition | undefined {
  return WORKFLOWS[module]
}

/**
 * Get the list of allowed next statuses from the current status.
 * Returns empty array if the current status is terminal or unknown.
 */
export function getAllowedTransitions(module: string, currentStatus: string): string[] {
  const wf = WORKFLOWS[module]
  if (!wf) return []
  return wf.transitions[currentStatus] ?? []
}

/**
 * Get the next "main flow" status — the natural next step (not exceptions).
 * Used for the "Next: X" banner.
 */
export function getNextMainStep(module: string, currentStatus: string): WorkflowStage | null {
  const wf = WORKFLOWS[module]
  if (!wf) return null
  const allowed = wf.transitions[currentStatus] ?? []
  // Find the first non-exception status in allowed transitions
  const next = allowed.find(s => !wf.stages.find(st => st.status === s)?.isException)
  if (!next) return null
  return wf.stages.find(st => st.status === next) ?? null
}

/**
 * Get the stage definition for a status.
 */
export function getStage(module: string, status: string): WorkflowStage | undefined {
  const wf = WORKFLOWS[module]
  if (!wf) return undefined
  return wf.stages.find(st => st.status === status)
}

/**
 * Get all main-flow stages (excluding exceptions) in order.
 * Used for the status stepper.
 */
export function getMainStages(module: string): WorkflowStage[] {
  const wf = WORKFLOWS[module]
  if (!wf) return []
  return wf.stages.filter(st => !st.isException)
}

/**
 * Check if a transition is legal.
 */
export function isLegalTransition(module: string, fromStatus: string, toStatus: string): boolean {
  const allowed = getAllowedTransitions(module, fromStatus)
  return allowed.includes(toStatus)
}

/**
 * Get the index of the current status in the main flow.
 * Returns -1 if the status is an exception or unknown.
 */
export function getStageIndex(module: string, currentStatus: string): number {
  const mainStages = getMainStages(module)
  return mainStages.findIndex(st => st.status === currentStatus)
}
