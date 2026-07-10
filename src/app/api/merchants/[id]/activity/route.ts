import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * Merchant Activity Timeline API (#20)
 *
 * GET /api/merchants/[id]/activity?limit=20
 *
 * Pulls recent activity from ALL modules for a specific merchant:
 * - Inbound records (stock received)
 * - Outbound records (orders shipped)
 * - Merchant payments (payouts)
 * - Merchant statements (generated)
 * - Shrinkage records (losses)
 * - RTV records (returns to vendor)
 * - After-sales records (customer returns)
 *
 * Returns a unified chronological timeline.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const { id } = await params
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

    // Find the merchant to get merchantId and businessName
    const merchant = await db.merchant.findUnique({ where: { id }, select: { merchantId: true, businessName: true } })
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

    const events: Array<{
      timestamp: Date
      type: string
      icon: string
      label: string
      description: string
      amount?: number
      reference?: string
      module: string
    }> = []

    // 1. Inbound records
    const inbounds = await db.inboundRecord.findMany({
      where: { merchantId: merchant.merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { inboundId: true, productName: true, qtyIn: true, inboundValue: true, createdAt: true, status: true },
    })
    inbounds.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'inbound', icon: 'arrow-down',
        label: `Received ${r.qtyIn} × ${r.productName}`,
        description: `Inbound ${r.inboundId} — status: ${r.status}`,
        amount: r.inboundValue || undefined,
        reference: r.inboundId,
        module: 'inventory',
      })
    })

    // 2. Outbound records
    const outbounds = await db.outboundRecord.findMany({
      where: { vendorId: merchant.merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { outboundId: true, orderNumber: true, customerName: true, productName: true, qty: true, saleAmount: true, status: true, createdAt: true },
    })
    outbounds.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'outbound', icon: 'arrow-up',
        label: `Order ${r.orderNumber || r.outboundId}: ${r.qty} × ${r.productName} → ${r.customerName}`,
        description: `Status: ${r.status}`,
        amount: r.saleAmount || undefined,
        reference: r.orderNumber || r.outboundId,
        module: 'outbound',
      })
    })

    // 3. Payments
    const payments = await db.merchantPayment.findMany({
      where: { merchantId: merchant.merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { paymentId: true, amount: true, paymentMethod: true, reference: true, status: true, createdAt: true },
    })
    payments.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'payment', icon: 'dollar',
        label: `Payment ${r.paymentId}: ${r.paymentMethod}`,
        description: `Reference: ${r.reference} — Status: ${r.status}`,
        amount: r.amount,
        reference: r.paymentId,
        module: 'payments',
      })
    })

    // 4. Statements
    const statements = await db.merchantStatement.findMany({
      where: { merchantId: merchant.merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { statementId: true, period: true, netPayable: true, isPaid: true, status: true, createdAt: true },
    })
    statements.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'statement', icon: 'file',
        label: `Statement ${r.statementId} for ${r.period}`,
        description: `Net payable: UGX ${r.netPayable.toLocaleString()} — ${r.isPaid ? 'Paid' : r.status}`,
        amount: r.netPayable,
        reference: r.statementId,
        module: 'payments',
      })
    })

    // 5. Shrinkage
    const shrinkages = await db.shrinkageRecord.findMany({
      where: { merchantId: merchant.merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { shrinkageId: true, productName: true, qty: true, totalValue: true, reason: true, status: true, createdAt: true },
    })
    shrinkages.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'shrinkage', icon: 'alert',
        label: `Shrinkage ${r.shrinkageId}: ${r.qty} × ${r.productName}`,
        description: `Reason: ${r.reason} — Status: ${r.status}`,
        amount: r.totalValue || undefined,
        reference: r.shrinkageId,
        module: 'returns',
      })
    })

    // 6. RTV records
    const rtvs = await db.rTVRecord.findMany({
      where: { merchantName: merchant.businessName },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { rtvId: true, productName: true, qty: true, reason: true, status: true, createdAt: true },
    })
    rtvs.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'rtv', icon: 'rotate',
        label: `RTV ${r.rtvId}: ${r.qty} × ${r.productName}`,
        description: `Reason: ${r.reason} — Status: ${r.status}`,
        reference: r.rtvId,
        module: 'returns',
      })
    })

    // 7. After-sales (customer returns) — link via OutboundRecord.vendorId
    // (was querying customerId contains merchantId — almost never matched)
    const merchantOrderIds = await db.outboundRecord.findMany({
      where: { vendorId: merchant.merchantId },
      select: { orderNumber: true, outboundId: true, originalOrderNumber: true },
    })
    const orderIdList = merchantOrderIds
      .flatMap(o => [o.orderNumber, o.outboundId, o.originalOrderNumber])
      .filter((v): v is string => v !== null && v !== undefined)

    const afterSales = orderIdList.length > 0
      ? await db.afterSalesRecord.findMany({
          where: { originalOrderId: { in: orderIdList } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: { afterSalesId: true, customerName: true, reason: true, returnStatus: true, refundAmount: true, createdAt: true },
        })
      : []
    afterSales.forEach(r => {
      events.push({
        timestamp: r.createdAt, type: 'rma', icon: 'package-x',
        label: `RMA ${r.afterSalesId}: ${r.customerName}`,
        description: `Reason: ${r.reason} — Status: ${r.returnStatus}`,
        amount: r.refundAmount || undefined,
        reference: r.afterSalesId,
        module: 'returns',
      })
    })

    // Sort all events by timestamp descending and take the top N
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    const timeline = events.slice(0, limit)

    return NextResponse.json({ merchantId: merchant.merchantId, businessName: merchant.businessName, timeline })
  } catch (error) {
    console.error('Error fetching merchant activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}
