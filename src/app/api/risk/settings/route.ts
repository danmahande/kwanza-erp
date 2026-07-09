import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-api'
import { SETTING_DEFS, type SettingDef } from '@/lib/risk-engine'
import { loadSettingsFromDb } from '@/lib/risk-db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/risk/settings
 * Returns all risk settings with their metadata + current values.
 * Also returns the SETTING_DEFS so the UI knows how to render each field.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, 'admin', 'super_admin', 'manager')
  if (auth instanceof NextResponse) return auth

  // Ensure settings are seeded
  await loadSettingsFromDb()

  const rows = await db.riskSetting.findMany()
  const byKey = new Map(rows.map(r => [r.key, r]))

  // Build response: every defined setting with its current value
  const settings = SETTING_DEFS.map((def: SettingDef) => {
    const row = byKey.get(def.key)
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      inputType: def.inputType,
      helpText: def.helpText || null,
      options: def.options || null,
      value: row?.value ?? def.defaultValue,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    }
  })

  return NextResponse.json({ settings })
}

/**
 * PUT /api/risk/settings
 * Body: { settings: [{ key, value }] }
 * Updates one or more settings. Admin-only.
 * Each value is a JSON-serialized string (preserved as-is in DB).
 */
export async function PUT(req: NextRequest) {
  const auth = requireRole(req, 'admin', 'super_admin')
  if (auth instanceof NextResponse) return auth
  const user = auth

  const body = await req.json()
  const { settings } = body as { settings: Array<{ key: string; value: string }> }

  if (!Array.isArray(settings) || settings.length === 0) {
    return NextResponse.json({ error: 'settings array is required' }, { status: 400 })
  }

  // Validate each setting against its definition
  const defByKey = new Map<string, SettingDef>(SETTING_DEFS.map(d => [d.key as string, d]))
  const validKeys = new Set<string>(SETTING_DEFS.map(d => d.key as string))
  const updates: Array<{ key: string; value: string; def: SettingDef }> = []

  for (const s of settings) {
    if (!validKeys.has(s.key)) {
      return NextResponse.json({ error: `Unknown setting key: ${s.key}` }, { status: 400 })
    }
    const def = defByKey.get(s.key)!

    // Type-check the value
    if (def.inputType === 'number') {
      const n = Number(s.value)
      if (isNaN(n)) {
        return NextResponse.json({ error: `${def.label} must be a number` }, { status: 400 })
      }
      if (n < 0 && def.key !== 'aov_low' && def.key !== 'aov_high' && def.key !== 'aov_median') {
        return NextResponse.json({ error: `${def.label} must be ≥ 0` }, { status: 400 })
      }
    } else if (def.inputType === 'list') {
      try {
        const arr = JSON.parse(s.value)
        if (!Array.isArray(arr) || !arr.every(x => typeof x === 'string')) {
          return NextResponse.json({ error: `${def.label} must be a JSON array of strings` }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: `${def.label} must be valid JSON` }, { status: 400 })
      }
    } else if (def.inputType === 'select') {
      if (!def.options?.includes(s.value)) {
        return NextResponse.json({ error: `${def.label} must be one of: ${def.options?.join(', ')}` }, { status: 400 })
      }
    } else if (def.inputType === 'text') {
      if (typeof s.value !== 'string' || s.value.length === 0) {
        return NextResponse.json({ error: `${def.label} must be a non-empty string` }, { status: 400 })
      }
    }

    updates.push({ key: s.key, value: s.value, def })
  }

  // Apply updates
  for (const u of updates) {
    await db.riskSetting.upsert({
      where: { key: u.key },
      create: {
        key: u.key,
        value: u.value,
        category: u.def.category,
        label: u.def.label,
        inputType: u.def.inputType,
        helpText: u.def.helpText || null,
        updatedBy: user.name,
      },
      update: {
        value: u.value,
        updatedBy: user.name,
      },
    })
  }

  // Audit
  await logAudit({
    action: 'RISK_SETTINGS_UPDATED',
    module: 'risk',
    entityId: `${updates.length} settings`,
    details: updates.map(u => `${u.key}=${u.value}`).join(', '),
  })

  return NextResponse.json({ success: true, updated: updates.length })
}
