import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'

/**
 * GET /api/customers/[id]/orders?limit=10
 *
 * Returns the order history for a customer (outbound records matching
 * their phone number). Used by the Customer 360 view.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    const { id } = await params
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10', 10)

    const customer = await db.customer.findUnique({
      where: { id },
      select: { contact: true, name: true },
    })
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Find outbound records by phone (customerContact matches)
    const orders = await db.outboundRecord.findMany({
      where: { customerContact: customer.contact },
      select: {
        id: true,
        outboundId: true,
        orderNumber: true,
        productName: true,
        qty: true,
        saleAmount: true,
        status: true,
        codCollected: true,
        createdAt: true,
        dispatchedAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ orders, count: orders.length })
  } catch (error) {
    console.error('Error fetching customer orders:', error)
    return NextResponse.json({ error: 'Failed to fetch customer orders' }, { status: 500 })
  }
}
