import { db } from '@/lib/db'

/**
 * Notification Service — sends SMS/email notifications to customers and merchants.
 *
 * Currently logs notifications to the database. To enable real SMS, integrate
 * with an SMS gateway (Africa's Talking, Twilio, or MTN MoMo SMS API).
 *
 * The notification queue can be polled by a worker that sends actual SMS.
 */

export interface NotificationPayload {
  type: 'order_dispatched' | 'order_delivered' | 'order_failed' | 'statement_ready' | 'payment_sent' | 'low_stock' | 'late_banking'
  recipient: string  // phone number or email
  recipientName?: string
  subject: string
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Queue a notification. Workers poll this table to send actual SMS/email.
 */
export async function queueNotification(payload: NotificationPayload): Promise<void> {
  try {
    await db.notification.create({
      data: {
        type: payload.type,
        recipient: payload.recipient,
        recipientName: payload.recipientName || null,
        subject: payload.subject,
        message: payload.message,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
        status: 'pending',
      },
    })
  } catch (err) {
    // Non-blocking — notification failure shouldn't crash the main operation
    console.error('Notification queue failed (non-blocking):', err)
  }
}

/**
 * Send order dispatched notification to customer.
 * Called when an outbound record transitions to 'dispatched'.
 */
export async function notifyOrderDispatched(customerName: string, customerContact: string, orderNumber: string, driverName?: string): Promise<void> {
  if (!customerContact) return
  await queueNotification({
    type: 'order_dispatched',
    recipient: customerContact,
    recipientName: customerName,
    subject: 'Order Out for Delivery',
    message: `Hello ${customerName}, your order ${orderNumber} is out for delivery${driverName ? ` with ${driverName}` : ''}. Please have your payment ready. — Kwanza Logistics`,
    metadata: { orderNumber, driverName },
  })
}

/**
 * Send order delivered notification to customer.
 */
export async function notifyOrderDelivered(customerName: string, customerContact: string, orderNumber: string): Promise<void> {
  if (!customerContact) return
  await queueNotification({
    type: 'order_delivered',
    recipient: customerContact,
    recipientName: customerName,
    subject: 'Order Delivered',
    message: `Hello ${customerName}, your order ${orderNumber} has been delivered. Thank you for choosing Kwanza Logistics. Reply if you have any issues.`,
    metadata: { orderNumber },
  })
}

/**
 * Send order failed notification to customer.
 */
export async function notifyOrderFailed(customerName: string, customerContact: string, orderNumber: string, reason?: string): Promise<void> {
  if (!customerContact) return
  await queueNotification({
    type: 'order_failed',
    recipient: customerContact,
    recipientName: customerName,
    subject: 'Delivery Attempted',
    message: `Hello ${customerName}, we attempted to deliver your order ${orderNumber} but were unable to.${reason ? ` Reason: ${reason}.` : ''} We will reschedule. — Kwanza Logistics`,
    metadata: { orderNumber, reason },
  })
}

/**
 * Send statement ready notification to merchant.
 */
export async function notifyStatementReady(merchantName: string, merchantContact: string, period: string, netPayable: number, statementId: string): Promise<void> {
  if (!merchantContact) return
  await queueNotification({
    type: 'statement_ready',
    recipient: merchantContact,
    recipientName: merchantName,
    subject: 'Monthly Statement Ready',
    message: `Hello ${merchantName}, your statement for ${period} is ready. Net payable: UGX ${netPayable.toLocaleString()}. Statement ID: ${statementId}. — Kwanza Logistics`,
    metadata: { period, netPayable, statementId },
  })
}

/**
 * Send payment sent notification to merchant.
 */
export async function notifyPaymentSent(merchantName: string, merchantContact: string, amount: number, batchId: string): Promise<void> {
  if (!merchantContact) return
  await queueNotification({
    type: 'payment_sent',
    recipient: merchantContact,
    recipientName: merchantName,
    subject: 'Payment Sent',
    message: `Hello ${merchantName}, a payment of UGX ${amount.toLocaleString()} has been sent to you. Batch: ${batchId}. — Kwanza Logistics`,
    metadata: { amount, batchId },
  })
}

/**
 * Send late banking alert to supervisor.
 */
export async function notifyLateBanking(driverName: string, driverId: string, amount: number, daysLate: number, supervisorContact?: string): Promise<void> {
  if (!supervisorContact) return
  await queueNotification({
    type: 'late_banking',
    recipient: supervisorContact,
    recipientName: 'Supervisor',
    subject: 'Late Banking Alert',
    message: `ALERT: Driver ${driverName} (${driverId}) has UGX ${amount.toLocaleString()} in unbanked COD cash, ${daysLate} day(s) overdue. Please follow up immediately.`,
    metadata: { driverId, amount, daysLate },
  })
}
