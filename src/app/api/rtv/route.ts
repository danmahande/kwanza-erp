import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const rtvRecords = await db.rTVRecord.findMany({
      where: {
        OR: [
          { rtvId: { contains: search } },
          { originalOrderId: { contains: search } },
          { returnOrderNumber: { contains: search } },
          { merchantName: { contains: search } },
          { productName: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(rtvRecords)
  } catch (error) {
    console.error('Error fetching RTV records:', error)
    return NextResponse.json({ error: 'Failed to fetch RTV records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.rTVRecord.count()
    const rtvId = `RTV-${String(count + 1).padStart(4, '0')}`
    
    // Generate return order number with RT prefix
    const returnOrderNumber = `RT-${String(count + 1).padStart(3, '0')}`
    
    // Update the original order in the OutboundRecord to reflect the change from DS to RT
    if (body.originalOrderId) {
      const outboundRecord = await db.outboundRecord.findFirst({
        where: { 
          OR: [
            { orderNumber: body.originalOrderId },
            { outboundId: body.originalOrderId }
          ]
        }
      });
      
      if (outboundRecord) {
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
    
    const rtvRecord = await db.rTVRecord.create({
      data: { 
        ...body, 
        rtvId,
        returnOrderNumber, // Use the generated return order number
        approvalStatus: body.approvalStatus || 'pending_approval',
        status: body.status || 'pending',
      },
    })
    
    // If this RTV is related to shrinkage, create a corresponding shrinkage record
    if (body.reason && (body.reason.toLowerCase().includes('damage') || 
                        body.reason.toLowerCase().includes('shrinkage') || 
                        body.reason.toLowerCase().includes('theft'))) {
      const shrinkageCount = await db.shrinkageRecord.count();
      const shrinkageId = `SH-${String(shrinkageCount + 1).padStart(4, '0')}`;
      
      await db.shrinkageRecord.create({
        data: {
          shrinkageId,
          rtvId: rtvRecord.id, // Link to the RTV record
          productId: body.productId,
          productName: body.productName,
          qty: body.qty,
          reason: body.reason,
          reportedBy: body.processedBy || 'system',
          status: 'pending',
        }
      });
    }
    
    return NextResponse.json(rtvRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating RTV record:', error)
    return NextResponse.json({ error: 'Failed to create RTV record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    // Handle approval workflow
    if (data.approvalStatus === 'approved' && !data.approvedBy) {
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
    
    const rtvRecord = await db.rTVRecord.update({ 
      where: { id }, 
      data: {
        ...data,
        updatedAt: new Date(),
      }
    })
    
    // If this RTV is related to shrinkage and status changes to approved, update shrinkage accordingly
    if (rtvRecord.rtvId && data.approvalStatus === 'approved') {
      const shrinkageRecords = await db.shrinkageRecord.findMany({
        where: { rtvId: rtvRecord.id }
      });
      
      for (const shrinkageRecord of shrinkageRecords) {
        await db.shrinkageRecord.update({
          where: { id: shrinkageRecord.id },
          data: { status: 'resolved' }
        });
      }
    }
    
    return NextResponse.json(rtvRecord)
  } catch (error) {
    console.error('Error updating RTV record:', error)
    return NextResponse.json({ error: 'Failed to update RTV record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.rTVRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting RTV record:', error)
    return NextResponse.json({ error: 'Failed to delete RTV record' }, { status: 500 })
  }
}