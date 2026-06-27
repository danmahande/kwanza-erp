import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrementStorageLiability } from '@/lib/storage-liability'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const orderProcessingRecords = await db.orderProcessing.findMany({
      where: {
        OR: [
          { orderId: { contains: search } },
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { trackingNumber: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(orderProcessingRecords)
  } catch (error) {
    console.error('Error fetching order processing records:', error)
    return NextResponse.json({ error: 'Failed to fetch order processing records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.orderProcessing.count()
    const orderId = `OP-${String(count + 1).padStart(4, '0')}`

    // Generate order number with DS prefix
    const orderNumber = `DS-${String(count + 1).padStart(3, '0')}`

    // Create or update customer based on the order
    let customer = await db.customer.findFirst({
      where: {
        OR: [
          { email: body.customerEmail },
          { contact: body.customerContact },
          { name: body.customerName }
        ]
      }
    });

    if (!customer) {
      // Generate customer ID
      const customerCount = await db.customer.count();
      const customerId = `CUST-${String(customerCount + 1).padStart(4, '0')}`;

      customer = await db.customer.create({
        data: {
          customerId,
          name: body.customerName,
          contact: body.customerContact || '',
          email: body.customerEmail || '',
          address: body.customerAddress || '',
          totalOrders: 1,
          totalOrderValue: body.totalAmount || 0,
          createdBy: body.createdBy || 'system'
        }
      });
    } else {
      // Update existing customer's order statistics
      await db.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalOrderValue: { increment: body.totalAmount || 0 }
        }
      });
    }

    // ===========================================================================
    // Workflow 2: Order Processing → Outbound cascade (forward-moving workflow)
    // Creating an OrderProcessing row also spawns an OutboundRecord so the
    // warehouse can pick/pack/ship without re-entering data.
    // ===========================================================================
    const outboundCount = await db.outboundRecord.count()
    const outboundId = `OUT${String(outboundCount + 1).padStart(6, '0')}`

    // Look up the merchant (vendor) to set deliveryType and merchantName on the outbound record
    let merchant: { merchantId: string; businessName: string; deliveryType: string | null } | null = null
    if (body.merchantId) {
      merchant = await db.merchant.findUnique({
        where: { merchantId: body.merchantId },
        select: { merchantId: true, businessName: true, deliveryType: true },
      })
    }

    const deliveryType = merchant?.deliveryType || body.deliveryType || 'self-delivery'
    // Tracking number structure: {deliveryType}-{orderNumber}-{unitSeq}
    // DS-DS-001-01 means dropship, order DS-001, unit 1. If it's a return, prefix is RT.
    const trackingPrefix = deliveryType === 'drop-ship' ? 'DS' : deliveryType === 'consignment' ? 'CN' : 'WH'
    const trackingNumber = `${trackingPrefix}-${orderNumber}-01`

    // Find the product so we can set fields on the outbound record
    let product: { merchantId: string; merchantName: string; unitSellingPrice: number; productId: string; productLabel: string; brand: string | null; variant: string | null } | null = null
    if (body.productId) {
      product = await db.product.findUnique({
        where: { productId: body.productId },
        select: {
          merchantId: true,
          merchantName: true,
          unitSellingPrice: true,
          productId: true,
          productLabel: true,
          brand: true,
          variant: true,
        },
      })
    }

    const qty = parseInt(String(body.qty || 1)) || 1
    const unitSellingPrice = product?.unitSellingPrice || body.unitSellingPrice || 0
    const saleAmount = qty * unitSellingPrice

    const orderProcessing = await db.orderProcessing.create({
      data: {
        ...body,
        orderId,
        orderNumber,
        customerId: customer.customerId, // Link to the customer
        status: body.status || 'new_order',
        totalAmount: body.totalAmount || 0,
        invoiceGenerated: false,
        trackingNumber,
      },
    })

    // Spawn the linked OutboundRecord (cascade). Non-blocking try/catch — if the
    // OutboundRecord creation fails, the order still exists so the user can recover.
    try {
      await db.outboundRecord.create({
        data: {
          outboundId,
          orderNumber,
          trackingNumber,
          userId: body.createdBy || null,
          vendorId: merchant?.merchantId || body.merchantId || null,
          businessName: merchant?.businessName || product?.merchantName || body.merchantName || null,
          customerName: body.customerName || '',
          customerContact: body.customerContact || '',
          customerEmail: body.customerEmail || null,
          customerAddress: body.customerAddress || null,
          productName: body.productName || product?.productLabel || '',
          productId: body.productId || product?.productId || '',
          brand: product?.brand || null,
          variant: product?.variant || null,
          qty,
          unitSellingPrice,
          saleAmount,
          status: 'pending', // starts pending; warehouse will move it forward
        },
      })

      // Workflow 1 cascade: decrement storage liability for these units (FIFO)
      if (merchant && body.productId) {
        await decrementStorageLiability({
          merchantId: merchant.merchantId,
          productId: body.productId,
          qtyToRemove: qty,
        })
      }

      // Workflow 1 cascade: decrement product stock
      if (body.productId) {
        await db.product.update({
          where: { productId: body.productId },
          data: { currentStock: { decrement: qty } },
        })
      }
    } catch (cascadeErr) {
      console.error('Outbound cascade failed (non-blocking):', cascadeErr)
    }

    return NextResponse.json(orderProcessing, { status: 201 })
  } catch (error) {
    console.error('Error creating order processing record:', error)
    return NextResponse.json({ error: 'Failed to create order processing record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body

    const orderProcessing = await db.orderProcessing.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      }
    })

    // Workflow 2 cascade: when order status changes, mirror to the linked OutboundRecord
    if (data.status && orderProcessing.orderNumber) {
      try {
        await db.outboundRecord.updateMany({
          where: { orderNumber: orderProcessing.orderNumber },
          data: { status: data.status },
        })
      } catch (cascadeErr) {
        console.error('Outbound status cascade failed (non-blocking):', cascadeErr)
      }
    }

    return NextResponse.json(orderProcessing)
  } catch (error) {
    console.error('Error updating order processing record:', error)
    return NextResponse.json({ error: 'Failed to update order processing record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.orderProcessing.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order processing record:', error)
    return NextResponse.json({ error: 'Failed to delete order processing record' }, { status: 500 })
  }
}