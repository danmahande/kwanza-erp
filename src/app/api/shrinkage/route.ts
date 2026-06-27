import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const shrinkageRecords = await db.shrinkageRecord.findMany({
      where: {
        OR: [
          { shrinkageId: { contains: search } },
          { rtvId: { contains: search } },
          { productName: { contains: search } },
          { reason: { contains: search } },
          { reportedBy: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(shrinkageRecords)
  } catch (error) {
    console.error('Error fetching shrinkage records:', error)
    return NextResponse.json({ error: 'Failed to fetch shrinkage records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const count = await db.shrinkageRecord.count()
    const shrinkageId = `SH-${String(count + 1).padStart(4, '0')}`
    
    // If no RTV ID is provided, this is a standalone shrinkage report
    // If RTV ID is provided, this is linked to an RTV record
    const shrinkageRecord = await db.shrinkageRecord.create({
      data: { 
        ...body, 
        shrinkageId,
        status: body.status || 'pending',
      },
    })
    
    // If this shrinkage is linked to an RTV, update the RTV record accordingly
    if (body.rtvId) {
      const rtvRecord = await db.rTVRecord.findUnique({
        where: { id: body.rtvId }
      });
      
      if (rtvRecord) {
        // Update RTV record to reflect shrinkage details
        await db.rTVRecord.update({
          where: { id: body.rtvId },
          data: {
            status: 'processed',
            processedBy: body.reportedBy || 'system'
          }
        });
      }
    }
    
    return NextResponse.json(shrinkageRecord, { status: 201 })
  } catch (error) {
    console.error('Error creating shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to create shrinkage record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    // Handle resolution workflow
    if (data.status === 'resolved' && !data.resolvedBy) {
      // Set the resolver and resolution time
      data.resolvedBy = 'current_user'; // In real app, this would come from session
      data.resolvedAt = new Date();
    }
    
    const shrinkageRecord = await db.shrinkageRecord.update({ 
      where: { id }, 
      data: {
        ...data,
        updatedAt: new Date(),
      }
    })
    
    return NextResponse.json(shrinkageRecord)
  } catch (error) {
    console.error('Error updating shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to update shrinkage record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.shrinkageRecord.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting shrinkage record:', error)
    return NextResponse.json({ error: 'Failed to delete shrinkage record' }, { status: 500 })
  }
}