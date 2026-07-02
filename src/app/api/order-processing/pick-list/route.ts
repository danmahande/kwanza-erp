import { NextRequest, NextResponse } from 'next/server'
import { generatePickList } from '@/lib/pick-pack-pdf'
import { logAudit } from '@/lib/audit'

/**
 * Pick List PDF API
 *
 * GET /api/order-processing/pick-list?ids=id1,id2,id3
 *   → generates a single pick list PDF for multiple orders (a "wave")
 *
 * The PDF is saved to /home/z/my-project/download/pick-lists/ and the file path is returned.
 */
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get('ids')
    if (!idsParam) {
      return NextResponse.json({ error: 'ids parameter required (comma-separated order IDs)' }, { status: 400 })
    }
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'At least one order ID required' }, { status: 400 })
    }

    const filePath = await generatePickList(ids)

    await logAudit({
      action: 'PICK_LIST_GENERATED',
      module: 'outbound',
      entityId: `${ids.length} orders`,
      details: `Generated pick list wave for ${ids.length} orders`,
    })

    return NextResponse.json({
      success: true,
      filePath,
      fileName: filePath.split('/').pop(),
      orderCount: ids.length,
    })
  } catch (error) {
    console.error('Error generating pick list:', error)
    return NextResponse.json({ error: 'Failed to generate pick list' }, { status: 500 })
  }
}
