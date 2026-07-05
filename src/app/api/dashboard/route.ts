import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'This Month'

    const now = new Date()
    let startDate: Date
    switch (period) {
      case 'Today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'This Week':
        const dayOfWeek = now.getDay()
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
        break
      case 'This Month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'This Quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3
        startDate = new Date(now.getFullYear(), quarterMonth, 1)
        break
      default:
        startDate = new Date(2020, 0, 1)
    }

    // ── Core Counts ──
    const totalMerchants = await db.merchant.count({ where: { isActive: true } })
    const totalProducts = await db.product.count({ where: { isActive: true } })
    const totalCustomers = await db.customer.count()
    const totalDrivers = await db.driver.count({ where: { status: 'active' } })

    // ── Inventory ──
    const allProducts = await db.product.findMany({
      where: { isActive: true },
      select: { currentStock: true, unitCost: true, unitSellingPrice: true, minStock: true, commissionPercent: true, productLabel: true, createdAt: true },
    })
    const lowStockProducts = allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length
    const criticalStockProducts = allProducts.filter(p => p.currentStock === 0).length
    const healthyStockProducts = allProducts.filter(p => p.currentStock > p.minStock).length
    const totalStockUnits = allProducts.reduce((sum, p) => sum + p.currentStock, 0)
    const totalStockValue = allProducts.reduce((sum, p) => sum + (p.currentStock * p.unitCost), 0)

    // ── Inbound / Outbound (filtered by period) ──
    const inboundRecords = await db.inboundRecord.findMany({ where: { createdAt: { gte: startDate } }, orderBy: { createdAt: 'desc' }, take: 10 })
    const outboundRecords = await db.outboundRecord.findMany({ where: { createdAt: { gte: startDate } }, orderBy: { createdAt: 'desc' }, take: 10 })

    // ── Order Status (filtered by period) ──
    const statusCounts = await db.outboundRecord.groupBy({ by: ['status'], where: { createdAt: { gte: startDate } }, _count: { status: true } })
    const orderStatusDistribution = statusCounts.map(s => ({ status: s.status, count: s._count.status }))
    const pendingCount = statusCounts.find(s => s.status === 'pending')?._count.status || 0
    const dispatchedCount = statusCounts.find(s => s.status === 'dispatched')?._count.status || 0
    const deliveredCount = statusCounts.find(s => s.status === 'delivered')?._count.status || 0
    const failedCount = statusCounts.find(s => s.status === 'failed')?._count.status || 0
    const returnedCount = statusCounts.find(s => s.status === 'returned')?._count.status || 0
    const totalOrders = pendingCount + dispatchedCount + deliveredCount + failedCount + returnedCount
    const fulfillmentRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0
    const exceptionCount = failedCount + returnedCount
    const exceptionRate = totalOrders > 0 ? Math.round((exceptionCount / totalOrders) * 100) : 0

    // ── Financial (filtered by period) ──
    const payments = await db.merchantPayment.findMany({ where: { createdAt: { gte: startDate } }, orderBy: { createdAt: 'desc' } })
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
    const totalCommission = allProducts.reduce((sum, p) => sum + (p.currentStock * p.unitSellingPrice * p.commissionPercent / 100), 0)
    const avgOrderValue = deliveredCount > 0 ? Math.round((totalRevenue || 0) / deliveredCount) : 0
    const revenuePerMerchant = totalMerchants > 0 ? Math.round((totalRevenue || 0) / totalMerchants) : 0

    // ── COD Metrics (filtered by period) ──
    const codCollectedAgg = await db.outboundRecord.aggregate({
      where: { status: 'delivered', codCollected: { not: null }, deliveredAt: { gte: startDate } },
      _sum: { codCollected: true },
      _count: true,
    })
    const codCollectedTotal = codCollectedAgg._sum.codCollected ?? 0

    const pendingBankingsAgg = await db.driverBanking.aggregate({
      where: { status: 'pending' },
      _sum: { amount: true },
      _count: true,
    })
    const codPendingBankings = pendingBankingsAgg._sum.amount ?? 0

    const verifiedBankingsAgg = await db.driverBanking.aggregate({
      where: { status: 'verified' },
      _sum: { amount: true },
    })
    const codBanked = verifiedBankingsAgg._sum.amount ?? 0
    const bankingRate = codCollectedTotal > 0 ? Math.round((codBanked / codCollectedTotal) * 100) : 0

    // ── Driver Performance (filtered by period) ──
    const activeDriverRecords = await db.driver.findMany({
      where: { status: 'active' },
      select: { driverId: true, name: true, expectedBankings: true, banked: true },
    })
    const driverPerformance = await Promise.all(activeDriverRecords.map(async (d) => {
      const disp = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: { in: ['dispatched', 'delivered'] }, createdAt: { gte: startDate } } })
      const del = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: 'delivered', deliveredAt: { gte: startDate } } })
      const failed = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: 'failed', createdAt: { gte: startDate } } })
      const codAgg = await db.outboundRecord.aggregate({
        where: { assignedDriver: d.driverId, status: 'delivered', codCollected: { not: null } },
        _sum: { codCollected: true },
      })
      const pendingBank = await db.driverBanking.count({ where: { driverId: d.driverId, status: 'pending' } })
      return {
        driverId: d.driverId, name: d.name,
        dispatched: disp, delivered: del, failed,
        codCollected: codAgg._sum.codCollected ?? 0,
        pendingBankings: pendingBank,
        bankingStatus: pendingBank > 0 ? 'pending' : 'verified',
      }
    }))

    // ── On-Time Rate (same-day delivery, filtered by period) ──
    const deliveredWithDates = await db.outboundRecord.findMany({
      where: { status: 'delivered', dispatchedAt: { not: null }, deliveredAt: { gte: startDate, not: null } },
      select: { dispatchedAt: true, deliveredAt: true, createdAt: true },
    })
    const sameDay = deliveredWithDates.filter(r => r.dispatchedAt!.toDateString() === r.deliveredAt!.toDateString()).length
    const onTimeRate = deliveredWithDates.length > 0 ? Math.round((sameDay / deliveredWithDates.length) * 100) : 0

    // ── Order Cycle Time (average hours from order creation to delivery) ──
    const cycleTimeRecords = deliveredWithDates.filter(r => r.createdAt && r.deliveredAt)
    const avgCycleTimeMs = cycleTimeRecords.length > 0
      ? cycleTimeRecords.reduce((sum, r) => sum + (r.deliveredAt!.getTime() - r.createdAt.getTime()), 0) / cycleTimeRecords.length
      : 0
    const avgCycleTimeHours = Math.round(avgCycleTimeMs / (1000 * 60 * 60))

    // ── First-Attempt Delivery Success Rate (filtered by period) ──
    const allDeliveredRecords = await db.outboundRecord.findMany({
      where: { status: 'delivered', deliveredAt: { gte: startDate } },
      select: { deliveryAttempts: true },
    })
    const firstAttemptSuccess = allDeliveredRecords.filter(r => (r.deliveryAttempts ?? 0) <= 1).length
    const firstAttemptRate = allDeliveredRecords.length > 0
      ? Math.round((firstAttemptSuccess / allDeliveredRecords.length) * 100)
      : 0

    // ── What Needs Attention (stale items) ──
    // 1. Orders stuck in picking/packing for > 2 hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const stuckOrders = await db.outboundRecord.findMany({
      where: {
        status: { in: ['picking', 'packing', 'pending'] },
        createdAt: { lt: twoHoursAgo },
      },
      select: { id: true, orderNumber: true, outboundId: true, customerName: true, status: true, createdAt: true },
      take: 10,
    })
    // 2. COD pending for > 1 day
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const agedCodBankings = await db.driverBanking.findMany({
      where: { status: 'pending', bankedAt: { lt: oneDayAgo } },
      select: { id: true, bankingId: true, driverName: true, amount: true, bankedAt: true },
      take: 10,
    })
    // 3. Unresolved shrinkage older than 3 days
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const agedShrinkage = await db.shrinkageRecord.findMany({
      where: { status: { in: ['pending', 'investigating'] }, createdAt: { lt: threeDaysAgo } },
      select: { id: true, shrinkageId: true, productName: true, qty: true, createdAt: true },
      take: 10,
    })

    const attentionItems: Array<{ type: string; severity: 'critical' | 'warning'; message: string; module: string; count: number; items: Array<Record<string, unknown>> }> = []
    if (stuckOrders.length > 0) {
      attentionItems.push({
        type: 'stuck_orders', severity: 'warning',
        message: `${stuckOrders.length} order(s) stuck in picking/packing for 2+ hours`,
        module: 'outbound', count: stuckOrders.length,
        items: stuckOrders.map(o => ({ id: o.id, label: o.orderNumber || o.outboundId, customer: o.customerName, status: o.status, age: `${Math.round((now.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60))}h` })),
      })
    }
    if (agedCodBankings.length > 0) {
      attentionItems.push({
        type: 'aged_cod', severity: 'critical',
        message: `${agedCodBankings.length} COD banking(s) pending for 24+ hours (UGX ${agedCodBankings.reduce((s, b) => s + b.amount, 0).toLocaleString()})`,
        module: 'payments', count: agedCodBankings.length,
        items: agedCodBankings.map(b => ({ id: b.id, label: b.bankingId, driver: b.driverName, amount: b.amount, age: `${Math.round((now.getTime() - b.bankedAt.getTime()) / (1000 * 60 * 60))}h` })),
      })
    }
    if (agedShrinkage.length > 0) {
      attentionItems.push({
        type: 'aged_shrinkage', severity: 'warning',
        message: `${agedShrinkage.length} shrinkage record(s) unresolved for 3+ days`,
        module: 'returns', count: agedShrinkage.length,
        items: agedShrinkage.map(s => ({ id: s.id, label: s.shrinkageId, product: s.productName, qty: s.qty, age: `${Math.round((now.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24))}d` })),
      })
    }
    if (criticalStockProducts > 0) {
      attentionItems.push({
        type: 'out_of_stock', severity: 'critical',
        message: `${criticalStockProducts} product(s) out of stock`,
        module: 'inventory', count: criticalStockProducts,
        items: allProducts.filter(p => p.currentStock === 0).slice(0, 5).map(p => ({ label: p.productLabel })),
      })
    }

    // ── Revenue by Month (6 months, real data) ──
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const revenueByMonth: Array<{ month: string; revenue: number; commissions: number }> = []
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const mAgg = await db.outboundRecord.aggregate({ where: { createdAt: { gte: mStart, lte: mEnd } }, _sum: { saleAmount: true } })
      const mRev = mAgg._sum.saleAmount ?? 0
      const mProducts = await db.product.findMany({ where: { createdAt: { lte: mEnd } }, select: { commissionPercent: true } })
      const avgComm = mProducts.length > 0 ? mProducts.reduce((s, p) => s + p.commissionPercent, 0) / mProducts.length / 100 : 0
      revenueByMonth.push({ month: monthNames[mStart.getMonth()], revenue: Math.round(mRev), commissions: Math.round(mRev * avgComm) })
    }

    // ── Throughput (7 days, real) ──
    const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const throughputData: Array<{ day: string; inbound: number; outbound: number }> = []
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date(now); dStart.setDate(dStart.getDate() - i); dStart.setHours(0, 0, 0, 0)
      const dEnd = new Date(dStart); dEnd.setHours(23, 59, 59, 999)
      const inAgg = await db.inboundRecord.aggregate({ where: { createdAt: { gte: dStart, lte: dEnd } }, _sum: { qtyIn: true } })
      const outAgg = await db.outboundRecord.aggregate({ where: { createdAt: { gte: dStart, lte: dEnd } }, _sum: { qty: true } })
      throughputData.push({ day: dayShort[dStart.getDay()], inbound: inAgg._sum.qtyIn ?? 0, outbound: outAgg._sum.qty ?? 0 })
    }

    // ── Comparison (this month vs last month) ──
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const thisRevAgg = await db.outboundRecord.aggregate({ where: { createdAt: { gte: thisMonthStart } }, _sum: { saleAmount: true } })
    const lastRevAgg = await db.outboundRecord.aggregate({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { saleAmount: true } })
    const thisRev = thisRevAgg._sum.saleAmount ?? 0
    const lastRev = lastRevAgg._sum.saleAmount ?? 0
    const revenueChange = lastRev > 0 ? Math.round(((thisRev - lastRev) / lastRev) * 100) : 0

    const thisOrders = await db.outboundRecord.count({ where: { createdAt: { gte: thisMonthStart } } })
    const lastOrders = await db.outboundRecord.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } })
    const ordersChange = lastOrders > 0 ? Math.round(((thisOrders - lastOrders) / lastOrders) * 100) : 0

    const stockValueToday = totalStockValue
    const oldStockValue = allProducts.filter(p => p.createdAt < thisMonthStart).reduce((s, p) => s + p.currentStock * p.unitCost, 0)
    const stockValueChange = oldStockValue > 0 ? Math.round(((stockValueToday - oldStockValue) / oldStockValue) * 100) : 0

    const thisAvg = thisOrders > 0 ? thisRev / thisOrders : 0
    const lastAvg = lastOrders > 0 ? lastRev / lastOrders : 0
    const avgOrderChange = lastAvg > 0 ? Math.round(((thisAvg - lastAvg) / lastAvg) * 100) : 0

    const comparison = { revenueChange, ordersChange, stockValueChange, avgOrderChange }

    // ── Top Merchants (filtered by period) ──
    const topMerchants = await db.merchantPayment.groupBy({
      by: ['merchantName'], where: { createdAt: { gte: startDate } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5,
    })

    // ── Payment Methods (filtered by period) ──
    const paymentMethods = await db.merchantPayment.groupBy({
      by: ['paymentMethod'], where: { createdAt: { gte: startDate } }, _count: { paymentMethod: true }, _sum: { amount: true },
    })

    // ── Categories ──
    const categories = await db.product.groupBy({ by: ['category'], _count: { category: true } })

    // ── Shrinkage (filtered by period) ──
    const totalShrinkageQty = await db.shrinkageRecord.aggregate({ where: { createdAt: { gte: startDate } }, _sum: { qty: true } })
    const shrinkageByReason = await db.shrinkageRecord.groupBy({ by: ['reason'], where: { createdAt: { gte: startDate } }, _sum: { qty: true }, _count: { reason: true } })

    // ── Merchant Profitability (revenue - commission - shrinkage - returns) ──
    const merchantProfitability: Array<{ name: string; revenue: number; commission: number; shrinkage: number; returns: number; net: number }> = []
    const allMerchants = await db.merchant.findMany({ where: { isActive: true }, select: { merchantId: true, businessName: true } })
    for (const m of allMerchants.slice(0, 10)) {
      const mPayments = await db.merchantPayment.aggregate({ where: { merchantId: m.merchantId }, _sum: { amount: true } })
      const mRevenue = mPayments._sum.amount ?? 0
      // Commission: sum of (saleAmount * product.commissionPercent / 100) for this merchant's products
      const mProducts = await db.product.findMany({ where: { merchantId: m.merchantId }, select: { commissionPercent: true, productId: true } })
      const mOutbound = await db.outboundRecord.aggregate({
        where: { businessName: m.businessName, status: 'delivered' },
        _sum: { saleAmount: true },
      })
      const mSalesValue = mOutbound._sum.saleAmount ?? 0
      const avgComm = mProducts.length > 0 ? mProducts.reduce((s, p) => s + p.commissionPercent, 0) / mProducts.length / 100 : 0
      const mCommission = Math.round(mSalesValue * avgComm)
      // Shrinkage for this merchant
      const mShrinkageAgg = await db.shrinkageRecord.aggregate({ where: { merchantId: m.merchantId }, _sum: { totalValue: true } })
      const mShrinkage = mShrinkageAgg._sum.totalValue ?? 0
      // Returns for this merchant (approx: RTV qty * avg unitCost)
      const mRtvAgg = await db.rTVRecord.aggregate({ where: { merchantName: m.businessName }, _sum: { qty: true } })
      const avgUnitCost = mProducts.length > 0 ? (await db.product.aggregate({ where: { merchantId: m.merchantId }, _avg: { unitCost: true } }))._avg.unitCost ?? 0 : 0
      const mReturns = Math.round((mRtvAgg._sum.qty ?? 0) * avgUnitCost)
      const mNet = mRevenue - mCommission - mShrinkage - mReturns
      merchantProfitability.push({ name: m.businessName, revenue: mRevenue, commission: mCommission, shrinkage: mShrinkage, returns: mReturns, net: mNet })
    }
    merchantProfitability.sort((a, b) => b.net - a.net)

    // ── Alerts ──
    const alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; module: string; time: string }> = []
    allProducts.filter(p => p.currentStock === 0).slice(0, 2).forEach(p =>
      alerts.push({ type: 'critical', message: `OUT OF STOCK: ${p.productLabel}`, module: 'inventory', time: 'Now' })
    )
    allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).slice(0, 2).forEach(p =>
      alerts.push({ type: 'warning', message: `Low stock: ${p.productLabel} — ${p.currentStock} left`, module: 'inventory', time: 'Now' })
    )
    if (pendingCount > 0) alerts.push({ type: 'warning', message: `${pendingCount} order(s) awaiting dispatch`, module: 'outbound', time: 'Now' })
    if (codPendingBankings > 0) alerts.push({ type: 'warning', message: `UGX ${codPendingBankings.toLocaleString()} COD cash pending verification`, module: 'payments', time: 'Now' })
    if (comparison.revenueChange < 0) alerts.push({ type: 'info', message: `Revenue down ${Math.abs(comparison.revenueChange)}% vs last period`, module: 'finance', time: 'Today' })

    // ── PULSE: the real-time heartbeat of the business ──
    // This is what makes the dashboard feel ALIVE. Five sub-objects:
    //   stakes        — money and time at risk, right now
    //   momentum      — today's pace vs yesterday, last 30 min of activity
    //   predictions   — what's about to go wrong in the next 30-60 min
    //   timeAwareness — where you are in the day vs where you should be
    //   streaks       — what's going well that you'd want to maintain

    const todayStartPulse = new Date(now); todayStartPulse.setHours(0, 0, 0, 0)
    const yesterdayStart = new Date(now); yesterdayStart.setDate(yesterdayStart.getDate() - 1); yesterdayStart.setHours(0, 0, 0, 0)
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    const ninetyMinAgo = new Date(now.getTime() - 90 * 60 * 1000)

    // ── Stakes: money and time at risk right now ──
    const overdueParcels = await db.outboundRecord.findMany({
      where: { status: 'dispatched', dispatchedAt: { lt: sixHoursAgo } },
      select: { id: true, orderNumber: true, outboundId: true, customerName: true, saleAmount: true, codCollected: true, dispatchedAt: true, assignedDriver: true },
      take: 20,
    })
    const waitingParcels = await db.outboundRecord.count({
      where: { status: { in: ['picking', 'packing', 'packed', 'pending'] } },
    })
    const overdueRevenue = overdueParcels.reduce((s, p) => s + (p.saleAmount || 0), 0)
    const atRiskRevenue = overdueRevenue + codPendingBankings

    // ── Momentum: today's pace vs yesterday, last 30 min ──
    const hoursElapsedToday = Math.max(0.5, (now.getTime() - todayStartPulse.getTime()) / (1000 * 60 * 60))
    const todayOrdersCount = await db.outboundRecord.count({ where: { createdAt: { gte: todayStartPulse } } })
    const todayPace = Math.round((todayOrdersCount / hoursElapsedToday) * 10) / 10

    const yesterdaySameTimeEnd = new Date(yesterdayStart.getTime() + (now.getTime() - todayStartPulse.getTime()))
    const yesterdayOrdersCount = await db.outboundRecord.count({ where: { createdAt: { gte: yesterdayStart, lte: yesterdaySameTimeEnd } } })
    const yesterdayPace = Math.round((yesterdayOrdersCount / hoursElapsedToday) * 10) / 10
    const paceDeltaPct = yesterdayPace > 0 ? Math.round(((todayPace - yesterdayPace) / yesterdayPace) * 100) : 0

    const last30MinNew = await db.outboundRecord.count({ where: { createdAt: { gte: thirtyMinAgo } } })
    const last30MinDelivered = await db.outboundRecord.count({ where: { status: 'delivered', deliveredAt: { gte: thirtyMinAgo } } })
    const last30MinFailed = await db.outboundRecord.count({ where: { status: 'failed', createdAt: { gte: thirtyMinAgo } } })

    // ── Predictions: what's about to go wrong ──
    // "About to go stale" = orders in sort/pending that are 90-120 min old
    // (will cross the 2h stale threshold in the next 30 min).
    // BUG FIX: the old query was `createdAt < 90min ago` which caught orders
    // from 91 min old to 6 days old — those are already stale, not "about to
    // go stale." The correct window is 90-120 min old.
    const twoHoursAgoForStale = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const willGoStaleSoon = await db.outboundRecord.count({
      where: {
        status: { in: ['picking', 'packing', 'pending'] },
        createdAt: { gte: twoHoursAgoForStale, lt: ninetyMinAgo },
      },
    })
    // Also count already-stale parcels (created > 2h ago, still in sort) for
    // the emergency strip — these are past the threshold, not "about to" cross it
    const alreadyStale = await db.outboundRecord.count({
      where: {
        status: { in: ['picking', 'packing', 'pending'] },
        createdAt: { lt: twoHoursAgoForStale },
      },
    })
    const parcelsStillToDeliver = await db.outboundRecord.count({
      where: { status: { in: ['picking', 'packing', 'packed', 'pending', 'dispatched'] } },
    })
    const twoHoursAgoForRate = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const recentDeliveries = await db.outboundRecord.count({ where: { status: 'delivered', deliveredAt: { gte: twoHoursAgoForRate } } })
    const deliveryRatePerHour = recentDeliveries / 2
    let estimatedFinishTime: string | null = null
    let willFinishLate = false
    if (parcelsStillToDeliver > 0 && deliveryRatePerHour > 0) {
      const hoursToFinish = parcelsStillToDeliver / deliveryRatePerHour
      const finishAt = new Date(now.getTime() + hoursToFinish * 60 * 60 * 1000)
      estimatedFinishTime = finishAt.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
      willFinishLate = finishAt.getHours() >= 18
    }

    // ── Time awareness ──
    const deliveryWindowStart = 8
    const deliveryWindowEnd = 18
    const currentHour = now.getHours() + now.getMinutes() / 60
    const totalWindowHours = deliveryWindowEnd - deliveryWindowStart
    const isAfterHours = currentHour >= deliveryWindowEnd
    const isBeforeHours = currentHour < deliveryWindowStart
    const hoursIntoWindow = Math.max(0, Math.min(totalWindowHours, currentHour - deliveryWindowStart))
    const percentThroughWindow = Math.round((hoursIntoWindow / totalWindowHours) * 100)
    const parcelsPerHourNeeded = parcelsStillToDeliver > 0 && (totalWindowHours - hoursIntoWindow) > 0 && !isAfterHours
      ? Math.ceil(parcelsStillToDeliver / (totalWindowHours - hoursIntoWindow))
      : 0

    // ── Streaks ──
    // Days without stockout: counts back from today, checking each day for
    // shrinkage records with "stock" in the reason. The streak breaks on the
    // first day a stockout-related shrinkage was recorded.
    // NOTE: if no shrinkage records exist at all, this returns 30 (the cap).
    // We also return totalShrinkageRecordCount so the frontend can distinguish
    // "30 days genuinely clean" from "no shrinkage records to check."
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const stockoutDays = await db.shrinkageRecord.findMany({
      where: { reason: { contains: 'stock' }, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    })
    const stockoutDaySet = new Set(stockoutDays.map(s => s.createdAt.toDateString()))
    let daysWithoutStockout = 0
    for (let i = 0; i < 30; i++) {
      const checkDay = new Date(now); checkDay.setDate(checkDay.getDate() - i)
      if (!stockoutDaySet.has(checkDay.toDateString())) {
        daysWithoutStockout++
      } else {
        break
      }
    }
    // Check if there are ANY shrinkage records at all — if not, the streak
    // is "no data" not "30 days clean"
    const totalShrinkageRecordCount = await db.shrinkageRecord.count()
    const stockoutStreakHasData = totalShrinkageRecordCount > 0
    const lastFailure = await db.outboundRecord.findFirst({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const hoursSinceLastFailure = lastFailure
      ? Math.floor((now.getTime() - lastFailure.createdAt.getTime()) / (60 * 60 * 1000))
      : 0
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    const thisWeekStart = new Date(now); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay()); thisWeekStart.setHours(0, 0, 0, 0)
    const thisWeekRevAgg = await db.outboundRecord.aggregate({ where: { status: 'delivered', deliveredAt: { gte: thisWeekStart } }, _sum: { saleAmount: true } })
    const thisWeekRev = thisWeekRevAgg._sum.saleAmount ?? 0
    let isBestWeek = true
    for (let w = 1; w < 13; w++) {
      const wStart = new Date(thisWeekStart); wStart.setDate(wStart.getDate() - w * 7)
      const wEnd = new Date(thisWeekStart); wEnd.setDate(wEnd.getDate() - (w - 1) * 7)
      if (wStart < quarterStart) break
      const wAgg = await db.outboundRecord.aggregate({ where: { status: 'delivered', deliveredAt: { gte: wStart, lt: wEnd } }, _sum: { saleAmount: true } })
      if ((wAgg._sum.saleAmount ?? 0) > thisWeekRev) { isBestWeek = false; break }
    }

    const pulse = {
      stakes: {
        unbankedCOD: codPendingBankings,
        overdueParcelsCount: overdueParcels.length,
        overdueParcels: overdueParcels.slice(0, 5).map(p => ({
          id: String(p.orderNumber || p.outboundId),
          customerName: p.customerName,
          driver: p.assignedDriver || '—',
          hoursOverdue: Math.floor((now.getTime() - (p.dispatchedAt?.getTime() || now.getTime())) / (60 * 60 * 1000)),
          saleAmount: p.saleAmount || 0,
        })),
        customersWaitingCount: waitingParcels,
        atRiskRevenue,
      },
      momentum: {
        todayPace,
        yesterdayPace,
        paceDeltaPct,
        last30Min: { newOrders: last30MinNew, delivered: last30MinDelivered, failed: last30MinFailed },
      },
      predictions: {
        willGoStaleSoon,
        alreadyStale,
        estimatedFinishTime,
        willFinishLate,
        parcelsStillToDeliver,
        deliveryRatePerHour: Math.round(deliveryRatePerHour * 10) / 10,
      },
      timeAwareness: {
        currentTime: now.toISOString(),
        currentHour: Math.floor(currentHour),
        deliveryWindowEnd,
        isAfterHours,
        isBeforeHours,
        percentThroughWindow,
        parcelsRemaining: parcelsStillToDeliver,
        parcelsPerHourNeeded,
      },
      streaks: {
        daysWithoutStockout,
        stockoutStreakHasData,
        hoursSinceLastFailure,
        isBestWeekThisQuarter: isBestWeek && thisWeekRev > 0,
      },
    }

    return NextResponse.json({
      stats: {
        totalMerchants, totalProducts, totalCustomers, totalDrivers,
        activeDrivers: totalDrivers,
        totalRevenue: totalRevenue || 0,
        totalCommission: Math.round(totalCommission),
        avgOrderValue, revenuePerMerchant,
        totalStockUnits, totalStockValue: Math.round(totalStockValue),
      },
      inventory: { healthy: healthyStockProducts, low: lowStockProducts, critical: criticalStockProducts },
      orders: { total: totalOrders, pending: pendingCount, dispatched: dispatchedCount, delivered: deliveredCount, fulfillmentRate },
      shrinkage: {
        totalQty: totalShrinkageQty._sum.qty || 0,
        byReason: shrinkageByReason.map(s => ({ reason: s.reason, qty: s._sum.qty || 0, count: s._count.reason })),
      },
      recentInbound: inboundRecords,
      recentOutbound: outboundRecords,
      revenueByMonth,
      throughputData,
      productsByCategory: categories.map(c => ({ category: c.category, count: c._count.category })),
      topMerchants: topMerchants.map(m => ({ name: m.merchantName, amount: m._sum.amount || 0 })),
      topCustomers: [],
      paymentMethods: paymentMethods.map(m => ({ method: m.paymentMethod, count: m._count.paymentMethod, amount: m._sum.amount || 0 })),
      alerts,
      comparison,
      cod: {
        collectedTotal: codCollectedTotal,
        banked: codBanked,
        pendingBankings: codPendingBankings,
        bankingRate,
      },
      driverPerformance,
      onTimeRate,
      avgCycleTimeHours,
      firstAttemptRate,
      attentionItems,
      merchantProfitability,
      orderStatusDistribution,
      exceptionRate,
      exceptionCount,
      pulse,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
