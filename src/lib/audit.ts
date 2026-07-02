import { db } from '@/lib/db'

/**
 * Audit Log helper — writes a single record to the AuditLog table for every
 * significant state change in the system.
 *
 * Usage:
 *   import { logAudit } from '@/lib/audit'
 *   await logAudit({ userId: 'admin', userName: 'Admin User', action: 'CREATE', module: 'merchants', entityId: 'MCH-0001', details: 'Created merchant Acme Ltd' })
 *
 * Always non-blocking — if the audit log write fails, the parent operation
 * should still succeed. Wrap in try/catch at the call site.
 */

export interface AuditLogInput {
  userId?: string | null
  userName?: string | null
  action: string  // e.g. CREATE, UPDATE, DELETE, STATUS_CHANGE, APPROVE, REJECT
  module: string  // e.g. 'merchants', 'payments', 'order_processing'
  entityId?: string | null
  details?: string | null
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId || null,
        userName: input.userName || null,
        action: input.action,
        module: input.module,
        entityId: input.entityId || null,
        details: input.details || null,
      },
    })
  } catch (err) {
    // Audit log failure should NEVER break the parent operation
    console.error('Audit log write failed (non-blocking):', err)
  }
}
