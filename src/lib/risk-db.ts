/**
 * Risk Engine DB helpers — loads all the context the scorer needs.
 *
 * Centralised here so /api/risk/score and the re-score script share the same
 * data-gathering logic. If we add a new signal, it only needs to be added here.
 */

import { db } from '@/lib/db'
import {
  RiskInput, RiskSettings, loadSettings, normalizePhone, normalizeAddress,
  type CustomerRiskProfileInput,
} from '@/lib/risk-engine'

// ── Load all settings from DB (seeds defaults if empty) ──

export async function loadSettingsFromDb(): Promise<RiskSettings> {
  let rows = await db.riskSetting.findMany({ select: { key: true, value: true } })
  if (rows.length === 0) {
    // First-run seed
    await seedDefaultSettings('system')
    rows = await db.riskSetting.findMany({ select: { key: true, value: true } })
  }
  return loadSettings(rows)
}

export async function seedDefaultSettings(updatedBy: string): Promise<void> {
  // Import inline to avoid circular dep at module load
  const { SETTING_DEFS } = await import('@/lib/risk-engine')
  const existing = await db.riskSetting.findMany({ select: { key: true } })
  const existingKeys = new Set(existing.map(r => r.key))
  const toCreate = SETTING_DEFS
    .filter(def => !existingKeys.has(def.key))
    .map(def => ({
      key: def.key,
      value: def.defaultValue,
      category: def.category,
      label: def.label,
      inputType: def.inputType,
      helpText: def.helpText || null,
      updatedBy,
    }))
  if (toCreate.length > 0) {
    await db.riskSetting.createMany({ data: toCreate })
  }
}

// ── Gather scoring context for an order ──

export async function buildScoringInput(
  order: {
    id: string
    customerContact: string
    customerAddress: string | null
    customerName: string
    productName: string
    productId: string
    qty: number
    saleAmount: number | null
  },
  paymentPath: 'cod' | 'prepaid',
): Promise<RiskInput> {
  const phone = normalizePhone(order.customerContact)
  const normalizedAddr = order.customerAddress ? normalizeAddress(order.customerAddress) : null

  // 1. Customer profile (null if first-time)
  const profileRow = await db.customerRiskProfile.findUnique({ where: { customerContact: phone } })
  const profile: CustomerRiskProfileInput | null = profileRow ? {
    customerType: profileRow.customerType as 'retail' | 'wholesale',
    totalOrders: profileRow.totalOrders,
    codRefusals90d: profileRow.codRefusals90d,
    codDelivered90d: profileRow.codDelivered90d,
    distinctAddressesUsed: profileRow.distinctAddressesUsed,
    avgAOV: profileRow.avgAOV,
    firstOrderDate: profileRow.firstOrderDate,
    isBlocklisted: profileRow.isBlocklisted,
  } : null

  // 2. Address reuse — distinct customer names at this address in last 90 days
  let addressReuseCount = 0
  if (normalizedAddr) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    // SQLite doesn't support mode: 'insensitive' — use raw SQL for case-insensitive distinct count.
    // We match on the normalized (lowercased) address as a substring.
    const distinctNames = await db.outboundRecord.findMany({
      where: {
        customerAddress: { contains: order.customerAddress || '' },
        createdAt: { gte: ninetyDaysAgo },
      },
      select: { customerName: true },
      distinct: 'customerName',
    })
    addressReuseCount = distinctNames.length
  }

  // 3. SKU return rate (only compute if we have enough orders to be meaningful)
  let skuReturnRate: number | null = null
  const skuOrders = await db.outboundRecord.findMany({
    where: { productId: order.productId },
    select: { status: true },
  })
  if (skuOrders.length >= 5) {
    const returns = skuOrders.filter(o => o.status === 'returned' || o.status === 'failed').length
    skuReturnRate = (returns / skuOrders.length) * 100
  }

  // 4. Open COD orders count
  const openCodOrders = await db.outboundRecord.count({
    where: {
      customerContact: order.customerContact,
      status: { in: ['pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged'] },
    },
  })

  // 5. Blocklist match
  let blocklistMatch: RiskInput['blocklistMatch'] = null
  const phoneBlock = await db.fraudBlocklist.findFirst({
    where: { phone, isActive: true },
  })
  if (phoneBlock) {
    blocklistMatch = { phone: true, reason: phoneBlock.reason }
  } else if (normalizedAddr) {
    // Address match — substring check. SQLite default is case-insensitive for ASCII
    // so this matches the lowercased address entries in the blocklist.
    const addrBlock = await db.fraudBlocklist.findFirst({
      where: { address: { contains: normalizedAddr }, isActive: true },
    })
    if (addrBlock) {
      blocklistMatch = { address: true, reason: addrBlock.reason }
    }
  }

  // 6. Phone velocity — orders from this phone in last 24h
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const phoneVelocity24h = await db.outboundRecord.count({
    where: {
      customerContact: order.customerContact,
      createdAt: { gte: twentyFourHoursAgo },
    },
  })

  return {
    outboundId: order.id,
    customerContact: order.customerContact,
    customerAddress: order.customerAddress,
    customerName: order.customerName,
    productName: order.productName,
    productId: order.productId,
    qty: order.qty,
    saleAmount: order.saleAmount,
    paymentPath,
    profile,
    addressReuseCount,
    skuReturnRate,
    openCodOrders,
    blocklistMatch,
    phoneVelocity24h,
  }
}

// ── Update CustomerRiskProfile after an order status change ──
// Called from workflow-transition on failed/returned/delivered transitions.

export async function updateCustomerProfile(
  customerContact: string,
  event: 'order_created' | 'order_delivered' | 'order_failed' | 'order_returned',
  saleAmount: number | null,
): Promise<void> {
  const phone = normalizePhone(customerContact)
  if (!phone) return

  const existing = await db.customerRiskProfile.findUnique({ where: { customerContact: phone } })
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  if (!existing) {
    // Create new profile
    await db.customerRiskProfile.create({
      data: {
        customerContact: phone,
        totalOrders: 1,
        codRefusals90d: event === 'order_failed' || event === 'order_returned' ? 1 : 0,
        codDelivered90d: event === 'order_delivered' ? 1 : 0,
        distinctAddressesUsed: 1,
        firstOrderDate: now,
        lastOrderDate: now,
        avgAOV: saleAmount || 0,
        isBlocklisted: false,
      },
    })
    return
  }

  // Update existing profile
  const refusalsDelta = event === 'order_failed' || event === 'order_returned' ? 1 : 0
  const deliveredDelta = event === 'order_delivered' ? 1 : 0
  const orderDelta = event === 'order_created' ? 1 : 0

  // Recompute rolling 90d refusals/delivered by counting actual records.
  // This is more accurate than incrementing counters (which drift over time as
  // old events age out of the window).
  const refusals90d = await db.outboundRecord.count({
    where: {
      customerContact,
      status: { in: ['failed', 'returned'] },
      createdAt: { gte: ninetyDaysAgo },
    },
  })
  const delivered90d = await db.outboundRecord.count({
    where: {
      customerContact,
      status: 'delivered',
      createdAt: { gte: ninetyDaysAgo },
    },
  })

  // New avg AOV = (old avg × old count + new amount) / new count
  const newTotalOrders = existing.totalOrders + orderDelta
  const newAvgAOV = orderDelta > 0 && saleAmount
    ? (existing.avgAOV * existing.totalOrders + saleAmount) / newTotalOrders
    : existing.avgAOV

  await db.customerRiskProfile.update({
    where: { customerContact: phone },
    data: {
      totalOrders: newTotalOrders,
      codRefusals90d: refusals90d,
      codDelivered90d: delivered90d,
      lastOrderDate: now,
      avgAOV: newAvgAOV,
    },
  })
}

// ── Persist a RiskScore ──

export async function persistScore(
  outboundId: string,
  customerContact: string,
  customerAddress: string | null,
  result: import('@/lib/risk-engine').RiskResult,
): Promise<void> {
  await db.riskScore.create({
    data: {
      outboundId,
      customerContact,
      customerAddress,
      score: result.score,
      decision: result.decision,
      reasons: JSON.stringify(result.reasons),
      engineVersion: result.engineVersion,
      paymentPath: result.paymentPath,
    },
  })
}
