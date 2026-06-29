import { NextRequest, NextResponse } from 'next/server'
import { generatePackingSlip } from '@/lib/pick-pack-pdf'
import { logAudit } from '@/lib/audit'

/**
 * Packing Slip PDF API
 *
 * GET /api/order-processing/pack-slip?id=<outboundId>
 *   → generates a packing slip PDF for a single order
 *
 * The PDF goes inside the box and shows the customer what they should have received.
 */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id parameter required' }, { status: 400 })
    }

    const filePath = await generatePackingSlip(id)

    await logAudit({
      action: 'PACKING_SLIP_GENERATED',
      module: 'outbound',
      entityId: id,
      details: `Generated packing slip for outbound record ${id}`,
    })

    return NextResponse.json({
      success: true,
      filePath,
      fileName: filePath.split('/').pop(),
    })
  } catch (error) {
    console.error('Error generating packing slip:', error)
    return NextResponse.json({ error: 'Failed to generate packing slip' }, { status: 500 })
  }
}
