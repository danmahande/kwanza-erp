import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const records = await db.reconciliationRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reconciliation records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const record = await db.reconciliationRecord.create({
      data: {
        type: body.type,
        referenceId: body.referenceId || null,
        expectedQty: parseFloat(body.expectedQty),
        actualQty: parseFloat(body.actualQty),
        variance: parseFloat(body.expectedQty) - parseFloat(body.actualQty),
        varianceReason: body.varianceReason || null,
        reconciledBy: body.reconciledBy,
      },
    })
    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create reconciliation record' }, { status: 500 })
  }
}
