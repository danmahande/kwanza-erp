import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // ── Inbound / Outbound ──
    const inboundRecords = await db.inboundRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
    const outboundRecords = await db.outboundRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })

    // ── Order Status ──
    const statusCounts = await db.outboundRecord.groupBy({ by: ['status'], _count: { status: true } })
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

    // ── Financial ──
    const payments = await db.merchantPayment.findMany({ orderBy: { createdAt: 'desc' } })
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
    const totalCommission = allProducts.reduce((sum, p) => sum + (p.currentStock * p.unitSellingPrice * p.commissionPercent / 100), 0)
    const avgOrderValue = deliveredCount > 0 ? Math.round((totalRevenue || 0) / deliveredCount) : 0
    const revenuePerMerchant = totalMerchants > 0 ? Math.round((totalRevenue || 0) / totalMerchants) : 0

    // ── COD Metrics ──
    const codCollectedAgg = await db.outboundRecord.aggregate({
      where: { status: 'delivered', codCollected: { not: null } },
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

    // ── Driver Performance ──
    const activeDriverRecords = await db.driver.findMany({
      where: { status: 'active' },
      select: { driverId: true, name: true, expectedBankings: true, banked: true },
    })
    const driverPerformance = await Promise.all(activeDriverRecords.map(async (d) => {
      const disp = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: { in: ['dispatched', 'delivered'] } } })
      const del = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: 'delivered' } })
      const failed = await db.outboundRecord.count({ where: { assignedDriver: d.driverId, status: 'failed' } })
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

    // ── On-Time Rate (same-day delivery) ──
    const deliveredWithDates = await db.outboundRecord.findMany({
      where: { status: 'delivered', dispatchedAt: { not: null }, deliveredAt: { not: null } },
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

    // ── Top Merchants ──
    const topMerchants = await db.merchantPayment.groupBy({
      by: ['merchantName'], _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5,
    })

    // ── Payment Methods ──
    const paymentMethods = await db.merchantPayment.groupBy({
      by: ['paymentMethod'], _count: { paymentMethod: true }, _sum: { amount: true },
    })

    // ── Categories ──
    const categories = await db.product.groupBy({ by: ['category'], _count: { category: true } })

    // ── Shrinkage ──
    const totalShrinkageQty = await db.shrinkageRecord.aggregate({ _sum: { qty: true } })
    const shrinkageByReason = await db.shrinkageRecord.groupBy({ by: ['reason'], _sum: { qty: true }, _count: { reason: true } })

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
      orderStatusDistribution,
      exceptionRate,
      exceptionCount,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
