import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

// GET /api/merchants/[id]/performance?days=30
// Computes per-merchant delivery performance metrics from existing data.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const { id } = await params
    const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // The [id] param is the Prisma CUID — look up merchantId (e.g. MCH-001) from the row
    const merchant = await db.merchant.findUnique({ where: { id }, select: { merchantId: true, businessName: true, currency: true } })
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })
    const mid = merchant.merchantId

    // All outbound records for this merchant in the window (by createdAt)
    const outbounds = await db.outboundRecord.findMany({
      where: { vendorId: mid, createdAt: { gte: since } },
      select: {
        status: true,
        createdAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        codCollected: true,
        saleAmount: true,
        actualDeliveredQty: true,
        qty: true,
        deliveryAttempts: true,
        cancellationReason: true,
      },
    })

    const totalOrders = outbounds.length
    const delivered = outbounds.filter(o => o.status === 'delivered').length
    const cancelled = outbounds.filter(o => o.status === 'cancelled' || o.cancellationReason).length
    const failed = outbounds.filter(o => ['failed', 'returned', 'rejected'].includes(o.status)).length
    const inTransit = outbounds.filter(o => ['pending', 'dispatched', 'processing'].includes(o.status)).length
    const firstAttemptSuccess = outbounds.filter(o => o.status === 'delivered' && (o.deliveryAttempts || 1) === 1).length

    // Cycle time = deliveredAt - createdAt (in hours), only for delivered
    const cycleTimes = outbounds
      .filter(o => o.deliveredAt && o.createdAt)
      .map(o => (new Date(o.deliveredAt!).getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60))
    const avgCycleHours = cycleTimes.length > 0 ? cycleTimes.reduce((s, t) => s + t, 0) / cycleTimes.length : 0

    // COD collection rate
    const totalSale = outbounds.reduce((s, o) => s + (o.saleAmount || 0), 0)
    const totalCod = outbounds.reduce((s, o) => s + (o.codCollected || 0), 0)
    const codRate = totalSale > 0 ? (totalCod / totalSale) * 100 : 0

    // Returns (RTV) in window
    const rtvCount = await db.rTVRecord.count({
      where: { merchantId: mid, createdAt: { gte: since } },
    })

    // Shrinkage in window
    const shrinkage = await db.shrinkageRecord.findMany({
      where: { merchantId: mid, createdAt: { gte: since } },
      select: { qty: true, totalValue: true },
    })
    const shrinkageQty = shrinkage.reduce((s, r) => s + r.qty, 0)
    const shrinkageValue = shrinkage.reduce((s, r) => s + (r.totalValue || 0), 0)

    // After-sales (RMA) in window — link via OutboundRecord.vendorId
    // (was querying customerName contains merchantId — almost never matched)
    const merchantOrderNumbers = await db.outboundRecord.findMany({
      where: { vendorId: mid },
      select: { orderNumber: true, outboundId: true, originalOrderNumber: true },
    })
    const orderNumberList = merchantOrderNumbers
      .flatMap(o => [o.orderNumber, o.outboundId, o.originalOrderNumber])
      .filter((v): v is string => v !== null && v !== undefined)

    const rmaCount = orderNumberList.length > 0
      ? await db.afterSalesRecord.count({
          where: {
            createdAt: { gte: since },
            originalOrderId: { in: orderNumberList },
          },
        })
      : 0

    // Inbound volume in window
    const inbounds = await db.inboundRecord.findMany({
      where: { merchantId: mid, createdAt: { gte: since } },
      select: { qtyIn: true, inboundValue: true },
    })
    const inboundQty = inbounds.reduce((s, i) => s + i.qtyIn, 0)
    const inboundValue = inbounds.reduce((s, i) => s + (i.inboundValue || 0), 0)

    const successRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0
    const firstAttemptRate = delivered > 0 ? (firstAttemptSuccess / delivered) * 100 : 0
    const returnsRate = totalOrders > 0 ? (rtvCount / totalOrders) * 100 : 0
    const cancellationRate = totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0

    // Last 7-day sparkline data for orders volume
    const sparkDays = 7
    const sparkSince = new Date(Date.now() - sparkDays * 24 * 60 * 60 * 1000)
    const recentOutbounds = await db.outboundRecord.findMany({
      where: { vendorId: mid, createdAt: { gte: sparkSince } },
      select: { createdAt: true, status: true },
    })
    const spark = []
    for (let i = sparkDays - 1; i >= 0; i--) {
      const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dayOrders = recentOutbounds.filter(o => new Date(o.createdAt) >= dayStart && new Date(o.createdAt) < dayEnd)
      spark.push({
        date: dayStart.toISOString().slice(5, 10),
        total: dayOrders.length,
        delivered: dayOrders.filter(o => o.status === 'delivered').length,
      })
    }

    return NextResponse.json({
      merchantId: mid,
      businessName: merchant.businessName,
      currency: merchant.currency,
      window: { days, since: since.toISOString() },
      totals: {
        orders: totalOrders,
        delivered,
        cancelled,
        failed,
        inTransit,
        returns: rtvCount,
        rma: rmaCount,
        shrinkageQty,
        shrinkageValue,
        inboundQty,
        inboundValue,
      },
      rates: {
        successRate: Math.round(successRate * 10) / 10,
        firstAttemptRate: Math.round(firstAttemptRate * 10) / 10,
        returnsRate: Math.round(returnsRate * 10) / 10,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        codRate: Math.round(codRate * 10) / 10,
      },
      cycleTime: {
        avgHours: Math.round(avgCycleHours * 10) / 10,
        avgDays: Math.round((avgCycleHours / 24) * 10) / 10,
        samples: cycleTimes.length,
      },
      cod: {
        totalSale,
        totalCollected: totalCod,
        shortfall: totalSale - totalCod,
      },
      sparkline: spark,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to compute performance', detail: msg }, { status: 500 })
  }
}
