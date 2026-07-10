import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireRole, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * System Settings API
 *
 * GET /api/settings — returns all system settings (categories, units, payment
 *   methods, storage locations). Seeds defaults on first call if empty.
 *
 * PUT /api/settings — updates one or more settings. Admin-only.
 *   Body: { settings: [{ key, value }] }
 *   value is a JSON-serialized array of strings.
 */

const DEFAULT_SETTINGS: Array<{ key: string; label: string; value: string[] }> = [
  { key: 'categories', label: 'Product Categories', value: ['Produce', 'Dairy', 'Bakery', 'Beverages', 'Household', 'Other'] },
  { key: 'units', label: 'Units of Measurement', value: ['kg', 'unit', 'pack', 'liter', 'box', 'dozen'] },
  { key: 'paymentMethods', label: 'Payment Methods', value: ['M-Pesa', 'Bank Transfer', 'Cash', 'Cheque'] },
  { key: 'storageLocations', label: 'Storage Locations', value: ['Warehouse A', 'Warehouse B', 'Cold Room', 'Shelf 1', 'Shelf 2'] },
]

async function seedDefaults() {
  for (const s of DEFAULT_SETTINGS) {
    const existing = await db.systemSetting.findUnique({ where: { key: s.key } })
    if (!existing) {
      await db.systemSetting.create({
        data: {
          key: s.key,
          label: s.label,
          value: JSON.stringify(s.value),
        },
      })
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

    // Seed defaults on first call
    await seedDefaults()

    const rows = await db.systemSetting.findMany({
      orderBy: { key: 'asc' },
    })

    const settings = rows.map(r => ({
      key: r.key,
      label: r.label,
      value: JSON.parse(r.value) as string[],
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt,
    }))

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Settings fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireRole(req, 'admin', 'super_admin')
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { settings } = body as { settings: Array<{ key: string; value: string[] }> }

    if (!Array.isArray(settings) || settings.length === 0) {
      return NextResponse.json({ error: 'settings array is required' }, { status: 400 })
    }

    // Validate each setting
    for (const s of settings) {
      if (!s.key || !Array.isArray(s.value)) {
        return NextResponse.json({
          error: `Invalid setting: key and value array are required`,
        }, { status: 400 })
      }
      // Validate all values are strings
      if (!s.value.every(v => typeof v === 'string' && v.trim().length > 0)) {
        return NextResponse.json({
          error: `Setting "${s.key}" contains empty or non-string values`,
        }, { status: 400 })
      }
      // Validate key is one of the known settings
      const knownKey = DEFAULT_SETTINGS.find(d => d.key === s.key)
      if (!knownKey) {
        return NextResponse.json({
          error: `Unknown setting key: "${s.key}". Valid keys: ${DEFAULT_SETTINGS.map(d => d.key).join(', ')}`,
        }, { status: 400 })
      }
    }

    // Apply updates
    for (const s of settings) {
      const knownKey = DEFAULT_SETTINGS.find(d => d.key === s.key)!
      await db.systemSetting.upsert({
        where: { key: s.key },
        create: {
          key: s.key,
          label: knownKey.label,
          value: JSON.stringify(s.value),
          updatedBy: _user.name,
        },
        update: {
          value: JSON.stringify(s.value),
          updatedBy: _user.name,
        },
      })
    }

    await logAudit({
      action: 'SETTINGS_UPDATED',
      module: 'settings',
      entityId: settings.map(s => s.key).join(', '),
      details: `Updated ${settings.length} setting(s): ${settings.map(s => `${s.key} (${s.value.length} items)`).join(', ')}. By ${_user.name}.`,
    })

    return NextResponse.json({ success: true, updated: settings.length })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
