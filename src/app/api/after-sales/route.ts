import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const afterSalesRecords = await db.afterSalesRecord.findMany({
      where: {
        OR: [
          { afterSalesId: { contains: search } },
          { returnOrderNumber: { contains: search } },
          { customerName: { contains: search } },
          { reason: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(afterSalesRecords)
  } catch (error) {
    console.error('Error fetching after-sales records:', error)
    return NextResponse.json({ error: 'Failed to fetch after-sales records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.afterSalesRecord.count()
    const afterSalesId = `AS-${String(count + 1).padStart(4, '0')}`
    
    // Generate return order number with RT prefix
    const returnOrderNumber = `RT-${String(count + 1).padStart(3, '0')}`
    
    // Update the original order number in the OutboundRecord to reflect the change from DS to RT
    if (body.originalOrderId) {
      // Find the corresponding outbound record and update its order number
      const outboundRecord = await db.outboundRecord.findFirst({
        where: { 
          OR: [
            { orderNumber: body.originalOrderId },
            { outboundId: body.originalOrderId }
          ]
        }
      });
      
      if (outboundRecord) {
        // Update the original order to indicate it was changed to a return
        await db.outboundRecord.update({
          where: { id: outboundRecord.id },
          data: {
            originalOrderNumber: outboundRecord.orderNumber, // Store original order number
            orderNumber: returnOrderNumber, // Change to return order number
            status: 'returned'
          }
        });
      }
    }
    
    const afterSalesRecord = await db.afterSalesRecord.create({
      data: { 
        ...body, 
        afterSalesId,
        returnOrderNumber, // Use the generated return order number
        returnStatus: body.returnStatus || 'initiated',
        refundAmount: body.refundAmount || 0,
      },
    })
    return NextResponse.json(afterSalesRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating after-sales record:', error)
    return NextResponse.json({ error: 'Failed to create after-sales record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    // Handle approval workflow
    if (data.returnStatus === 'approved' && !data.approvedBy) {
      // Set the approver and approval time
      data.approvedBy = 'current_user'; // In real app, this would come from session
      data.approvedAt = new Date();
    }
    
    // If changing order number, update the corresponding outbound record
    if (data.originalOrderId && data.returnOrderNumber) {
      const outboundRecord = await db.outboundRecord.findFirst({
        where: { 
          OR: [
            { orderNumber: data.originalOrderId },
            { outboundId: data.originalOrderId }
          ]
        }
      });
      
      if (outboundRecord) {
        await db.outboundRecord.update({
          where: { id: outboundRecord.id },
          data: {
            originalOrderNumber: outboundRecord.orderNumber,
            orderNumber: data.returnOrderNumber,
            status: 'returned'
          }
        });
      }
    }
    
    const afterSalesRecord = await db.afterSalesRecord.update({ 
      where: { id }, 
      data: {
        ...data,
        updatedAt: new Date(),
      }
    })
    return NextResponse.json(afterSalesRecord)
  } catch (error) {
    console.error('Error updating after-sales record:', error)
    return NextResponse.json({ error: 'Failed to update after-sales record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.afterSalesRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting after-sales record:', error)
    return NextResponse.json({ error: 'Failed to delete after-sales record' }, { status: 500 })
  }
}