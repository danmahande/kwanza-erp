import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    
    const orderProcessing = await db.orderProcessing.create({
      data: { 
        ...body, 
        orderId,
        orderNumber,
        customerId: customer.customerId, // Link to the customer
        status: body.status || 'new_order',
        totalAmount: body.totalAmount || 0,
        invoiceGenerated: false,
      },
    })
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