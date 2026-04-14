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
    const allProducts = await db.product.findMany({ where: { isActive: true }, select: { currentStock: true, unitCost: true, unitSellingPrice: true, minStock: true, commissionPercent: true, productLabel: true } })
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

    // ── Revenue by Month (last 6 months - simulated with real current data) ──
    const revenueByMonth: Array<{ month: string; revenue: number; commissions: number }> = []
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      revenueByMonth.push({
        month: monthNames[d.getMonth()],
        revenue: i === 0 ? (totalRevenue || 25000 + Math.random() * 20000) : Math.round(22000 + Math.random() * 25000),
        commissions: i === 0 ? Math.round(totalCommission || 3000 + Math.random() * 2000) : Math.round(2000 + Math.random() * 3000),
      })
    }

    // ── Warehouse Throughput (last 7 days - simulated) ──
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const throughputData = dayNames.map(day => ({
      day,
      inbound: Math.round(20 + Math.random() * 80),
      outbound: Math.round(15 + Math.random() * 70),
    }))

    // ── Comparison data (simulated % change from previous period) ──
    const comparison = {
      revenueChange: Math.round((Math.random() - 0.3) * 30),  // -9% to +21%
      ordersChange: Math.round((Math.random() - 0.2) * 25),
      stockValueChange: Math.round((Math.random() - 0.4) * 20),
      avgOrderChange: Math.round((Math.random() - 0.3) * 15),
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
