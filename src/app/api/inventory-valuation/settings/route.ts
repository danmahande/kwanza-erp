import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * /api/inventory-valuation/settings
 *
 * GET — return the single InventoryValuationSetting row (auto-creates default if missing).
 * PUT — update the rates / costing method / materiality threshold.
 *
 * Body for PUT:
 *   {
 *     defaultCostingMethod?: 'fifo' | 'avco' | 'standard' | 'specific_id',
 *     capitalCostRate?:      number (0–1),
 *     storageCostRate?:      number (0–1),
 *     riskCostRate?:         number (0–1),
 *     serviceCostRate?:      number (0–1),
 *     varianceMaterialityPct?: number (0–1),
 *     defaultCostToSellPct?: number (0–1),
 *     daysInYear?:           number (e.g. 365)
 *   }
 */

const VALID_METHODS = ['fifo', 'avco', 'standard', 'specific_id']

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    let row = await db.inventoryValuationSetting.findUnique({ where: { key: 'default' } })
    if (!row) {
      row = await db.inventoryValuationSetting.create({ data: { key: 'default' } })
    }
    return NextResponse.json(row)
  } catch (error) {
    console.error('GET /api/inventory-valuation/settings error:', error)
    return NextResponse.json({ error: 'Failed to load valuation settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const user = authResult as import('@/lib/auth-api').AuthUser
    const body = await req.json()

    // Validate costing method (block LIFO at API layer — IAS 2 §25)
    if (body.defaultCostingMethod && !VALID_METHODS.includes(body.defaultCostingMethod)) {
      return NextResponse.json(
        { error: `Invalid costing method. Permitted: ${VALID_METHODS.join(', ')}. LIFO is prohibited under IAS 2.` },
        { status: 400 },
      )
    }

    // Validate numeric rates are within [0, 1]
    const rateFields = ['capitalCostRate', 'storageCostRate', 'riskCostRate', 'serviceCostRate', 'varianceMaterialityPct', 'defaultCostToSellPct']
    for (const f of rateFields) {
      if (body[f] != null) {
        const v = parseFloat(body[f])
        if (isNaN(v) || v < 0 || v > 1) {
          return NextResponse.json({ error: `${f} must be between 0 and 1` }, { status: 400 })
        }
      }
    }

    // Build update data — only allow known fields
    const update: Record<string, number | string> = {}
    if (body.defaultCostingMethod) update.defaultCostingMethod = body.defaultCostingMethod
    for (const f of rateFields) {
      if (body[f] != null) update[f] = parseFloat(body[f])
    }
    if (body.daysInYear != null) {
      const d = parseInt(body.daysInYear)
      if (!isNaN(d) && d > 0) update.daysInYear = d
    }
    update.updatedBy = user.email

    // Upsert (single-row table)
    const row = await db.inventoryValuationSetting.upsert({
      where: { key: 'default' },
      update,
      create: { key: 'default', ...update },
    })

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'VALUATION_SETTINGS_UPDATED',
      module: 'inventory',
      entityId: row.id,
      details: `Updated inventory valuation settings: ${Object.keys(update).join(', ')}`,
    })

    return NextResponse.json(row)
  } catch (error) {
    console.error('PUT /api/inventory-valuation/settings error:', error)
    return NextResponse.json({ error: 'Failed to update valuation settings' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
