import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'This Month'

    // Calculate date range based on period
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
      default: // All Time
        startDate = new Date(2020, 0, 1)
    }

    // ── Core Counts ──
    const totalMerchants = await db.merchant.count({ where: { isActive: true } })
    const totalProducts = await db.product.count({ where: { isActive: true } })
    const totalCustomers = await db.customer.count()
    const totalDrivers = await db.driver.count({ where: { status: 'active' } })
    const activeDrivers = totalDrivers

    // ── Inventory Metrics ──
    const allProducts = await db.product.findMany({ where: { isActive: true }, select: { currentStock: true, unitCost: true, unitSellingPrice: true, minStock: true, commissionPercent: true, productLabel: true, createdAt: true } })
    const lowStockProducts = allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length
    const criticalStockProducts = allProducts.filter(p => p.currentStock === 0).length
    const healthyStockProducts = allProducts.filter(p => p.currentStock > p.minStock).length
    const totalStockUnits = allProducts.reduce((sum, p) => sum + p.currentStock, 0)
    const totalStockValue = allProducts.reduce((sum, p) => sum + (p.currentStock * p.unitCost), 0)

    // ── Inbound / Outbound ──
    const inboundRecords = await db.inboundRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
    const outboundRecords = await db.outboundRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
    const totalInboundQty = await db.inboundRecord.aggregate({ _sum: { qtyIn: true } })
    const totalOutboundQty = await db.outboundRecord.aggregate({ _sum: { qty: true } })

    // ── Order / Delivery Metrics ──
    const statusCounts = await db.outboundRecord.groupBy({ by: ['status'], _count: { status: true } })
    const pendingCount = statusCounts.find(s => s.status === 'pending')?._count.status || 0
    const dispatchedCount = statusCounts.find(s => s.status === 'dispatched')?._count.status || 0
    const deliveredCount = statusCounts.find(s => s.status === 'delivered')?._count.status || 0
    const totalOrders = pendingCount + dispatchedCount + deliveredCount
    const fulfillmentRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0

    // ── Financial Metrics ──
    const payments = await db.merchantPayment.findMany({ orderBy: { createdAt: 'desc' } })
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
    const totalCommission = allProducts.reduce((sum, p) => sum + (p.currentStock * p.unitSellingPrice * p.commissionPercent / 100), 0)
    const avgOrderValue = totalOrders > 0 ? Math.round((totalRevenue || 0) / Math.max(deliveredCount, 1)) : 0
    const revenuePerMerchant = totalMerchants > 0 ? Math.round((totalRevenue || 0) / totalMerchants) : 0

    // ── Payment Method Distribution ──
    const paymentMethods = await db.merchantPayment.groupBy({ by: ['paymentMethod'], _count: { paymentMethod: true }, _sum: { amount: true } })

    // ── Top Merchants by Payment ──
    const topMerchants = await db.merchantPayment.groupBy({
      by: ['merchantName'],
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    })

    // ── Top Customers ──
    const topCustomers = await db.customer.findMany({
      orderBy: [{ totalOrderValue: 'desc' }],
      take: 5,
    })

    // ── Shrinkage Metrics ──
    const shrinkageRecords = await db.shrinkageRecord.findMany({ take: 10, orderBy: { createdAt: 'desc' } })
    const totalShrinkageQty = await db.shrinkageRecord.aggregate({ _sum: { qty: true } })
    const shrinkageByReason = await db.shrinkageRecord.groupBy({ by: ['reason'], _sum: { qty: true }, _count: { reason: true } })

    // ── Product Categories ──
    const categories = await db.product.groupBy({ by: ['category'], _count: { category: true } })

    // ── Revenue by Month (last 6 months - REAL data from outbound records) ──
    const revenueByMonth: Array<{ month: string; revenue: number; commissions: number }> = []
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const monthAgg = await db.outboundRecord.aggregate({
        where: { createdAt: { gte: monthStart, lte: monthEnd } },
        _sum: { saleAmount: true },
      })
      const monthRevenue = monthAgg._sum.saleAmount ?? 0
      // Commissions: sum of (saleAmount * product.commissionPercent / 100) — simplified here as a global % from products
      const monthProducts = await db.product.findMany({
        where: { createdAt: { lte: monthEnd } },
        select: { commissionPercent: true },
      })
      const avgCommission = monthProducts.length > 0
        ? monthProducts.reduce((s, p) => s + p.commissionPercent, 0) / monthProducts.length / 100
        : 0
      revenueByMonth.push({
        month: monthNames[monthStart.getMonth()],
        revenue: Math.round(monthRevenue),
        commissions: Math.round(monthRevenue * avgCommission),
      })
    }

    // ── Warehouse Throughput (last 7 days - REAL data) ──
    const throughputData: Array<{ day: string; inbound: number; outbound: number }> = []
    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now)
      dayStart.setDate(dayStart.getDate() - i)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)
      const inboundAgg = await db.inboundRecord.aggregate({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { qtyIn: true },
      })
      const outboundAgg = await db.outboundRecord.aggregate({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { qty: true },
      })
      throughputData.push({
        day: dayNamesShort[dayStart.getDay()],
        inbound: inboundAgg._sum.qtyIn ?? 0,
        outbound: outboundAgg._sum.qty ?? 0,
      })
    }

    // ── Comparison data (REAL % change: this month vs last month) ──
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const thisMonthRevAgg = await db.outboundRecord.aggregate({
      where: { createdAt: { gte: thisMonthStart } },
      _sum: { saleAmount: true },
    })
    const lastMonthRevAgg = await db.outboundRecord.aggregate({
      where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { saleAmount: true },
    })
    const thisMonthRev = thisMonthRevAgg._sum.saleAmount ?? 0
    const lastMonthRev = lastMonthRevAgg._sum.saleAmount ?? 0
    const revenueChange = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0

    const thisMonthOrders = await db.outboundRecord.count({ where: { createdAt: { gte: thisMonthStart } } })
    const lastMonthOrders = await db.outboundRecord.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } })
    const ordersChange = lastMonthOrders > 0 ? Math.round(((thisMonthOrders - lastMonthOrders) / lastMonthOrders) * 100) : 0

    // Stock value change: compare current stock value to stock value a month ago (approximation: same as today since we don't track historical)
    // For now, compute stock value today vs stock value of products created before this month
    const stockValueToday = allProducts.reduce((s, p) => s + (p.currentStock * p.unitCost), 0)
    const oldProductsStockValue = allProducts
      .filter(p => p.createdAt < thisMonthStart)
      .reduce((s, p) => s + (p.currentStock * p.unitCost), 0)
    const stockValueChange = oldProductsStockValue > 0
      ? Math.round(((stockValueToday - oldProductsStockValue) / oldProductsStockValue) * 100)
      : 0

    // Avg order value change
    const thisMonthAvg = thisMonthOrders > 0 ? thisMonthRev / thisMonthOrders : 0
    const lastMonthAvg = lastMonthOrders > 0 ? lastMonthRev / lastMonthOrders : 0
    const avgOrderChange = lastMonthAvg > 0 ? Math.round(((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100) : 0

    const comparison = {
      revenueChange,
      ordersChange,
      stockValueChange,
      avgOrderChange,
    }

    // ── Build Alerts ──
    const alerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; module: string; time: string }> = []
    const criticalProducts = allProducts.filter(p => p.currentStock === 0)
    const lowProducts = allProducts.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock)

    criticalProducts.slice(0, 2).forEach(p => {
      alerts.push({ type: 'critical', message: `OUT OF STOCK: ${p.productLabel} - zero units remaining`, module: 'inventory', time: 'Now' })
    })
    lowProducts.slice(0, 2).forEach(p => {
      alerts.push({ type: 'warning', message: `Low stock: ${p.productLabel} - only ${p.currentStock} units left (min: ${p.minStock})`, module: 'inventory', time: 'Now' })
    })
    if (pendingCount > 0) {
      alerts.push({ type: 'warning', message: `${pendingCount} order(s) awaiting dispatch`, module: 'outbound', time: 'Now' })
    }
    if (comparison.revenueChange < 0) {
      alerts.push({ type: 'info', message: `Revenue down ${Math.abs(comparison.revenueChange)}% compared to previous period`, module: 'finance', time: 'Today' })
    }

    return NextResponse.json({
      stats: {
        totalMerchants,
        totalProducts,
        totalCustomers,
        totalDrivers,
        activeDrivers,
        totalRevenue: totalRevenue || 0,
        totalCommission: Math.round(totalCommission),
        avgOrderValue,
        revenuePerMerchant,
        totalStockUnits,
        totalStockValue: Math.round(totalStockValue),
        totalInboundQty: totalInboundQty._sum.qtyIn || 0,
        totalOutboundQty: totalOutboundQty._sum.qty || 0,
      },
      inventory: { healthy: healthyStockProducts, low: lowStockProducts, critical: criticalStockProducts },
      orders: { total: totalOrders, pending: pendingCount, dispatched: dispatchedCount, delivered: deliveredCount, fulfillmentRate },
      shrinkage: {
        totalQty: totalShrinkageQty._sum.qty || 0,
        totalValueLoss: Math.round((totalShrinkageQty._sum.qty || 0) * 85),
        byReason: shrinkageByReason.map(s => ({ reason: s.reason, qty: s._sum.qty || 0, count: s._count.reason })),
      },
      recentInbound: inboundRecords,
      recentOutbound: outboundRecords,
      revenueByMonth,
      throughputData,
      productsByCategory: categories.map(c => ({ category: c.category, count: c._count.category })),
      topMerchants: topMerchants.map(m => ({ name: m.merchantName, amount: m._sum.amount || 0 })),
      topCustomers: topCustomers.map(c => ({ name: c.name, orders: c.totalOrders, value: c.totalOrderValue })),
      paymentMethods: paymentMethods.map(m => ({ method: m.paymentMethod, count: m._count.paymentMethod, amount: m._sum.amount || 0 })),
      alerts,
      comparison,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
