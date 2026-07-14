/**
 * Risk Engine — pure scoring logic for order fraud detection.
 *
 * Design principles:
 * 1. Pure function: takes a RiskInput + RiskSettings, returns a RiskResult.
 *    No DB calls, no side effects. Unit-testable.
 * 2. Settings-driven: every threshold, zone, keyword is read from settings
 *    (loaded from DB by the caller). Nothing hardcoded.
 * 3. Branches by payment method: COD and prepaid have different risk surfaces.
 * 4. Explainable: every point contribution is logged with rule + detail so
 *    the manager can see exactly why an order scored the way it did.
 * 5. Deterministic: same input + same settings = same score. No randomness.
 *
 * Caller responsibilities:
 * - Load CustomerRiskProfile (or null for first-time customer)
 * - Load SKU return rates (or null if unknown)
 * - Load address reuse counts (or 0)
 * - Load blocklist matches (or null)
 * - Load settings via loadSettings()
 * - Persist the RiskResult via /api/risk/score
 */

// ── Types ──

export interface RiskInput {
  outboundId: string
  customerContact: string
  customerAddress: string | null
  customerName: string
  productName: string
  productId: string
  qty: number
  saleAmount: number | null
  /// 'cod' or 'prepaid' — drives which signal set applies
  paymentPath: 'cod' | 'prepaid'
  /// Customer risk profile (null if first-time customer)
  profile: CustomerRiskProfileInput | null
  /// Number of distinct customer names that have used this address in last 90d
  addressReuseCount: number
  /// SKU return rate (0-100). Null if unknown / insufficient data.
  skuReturnRate: number | null
  /// Number of open COD orders (status in pending/released/picking/picked/packing/packed/staged) for this phone
  openCodOrders: number
  /// Blocklist match (null if not blocklisted)
  blocklistMatch: { phone?: boolean; address?: boolean; reason?: string } | null
  /// Number of orders from this phone in the last 24 hours
  phoneVelocity24h: number
}

export interface CustomerRiskProfileInput {
  customerType: 'retail' | 'wholesale'
  totalOrders: number
  codRefusals90d: number
  codDelivered90d: number
  distinctAddressesUsed: number
  avgAOV: number
  firstOrderDate: Date | null
  isBlocklisted: boolean
}

export interface RiskReason {
  rule: string
  points: number
  detail: string
}

export interface RiskResult {
  score: number
  decision: 'auto_release' | 'spot_check' | 'review' | 'blocked'
  reasons: RiskReason[]
  engineVersion: string
  paymentPath: 'cod' | 'prepaid'
}

// ── Settings ──
// All engine parameters. Loaded from RiskSetting table; see loadSettings().

export interface RiskSettings {
  // Zones — list of strings (towns/neighborhoods). Case-insensitive match.
  zones: string[]
  // AOV calibration (UGX)
  aov_low: number
  aov_high: number
  aov_median: number
  // First-time customer + AOV > N × median = suspicious
  aov_first_time_multiplier: number
  // COD refusal threshold before auto-blocklist
  cod_refusal_threshold: number
  // Window for counting refusals (days)
  cod_refusal_window_days: number
  // Phone velocity: more than N orders from same phone in 24h = +points
  velocity_phone_24h: number
  // Address quality
  address_min_length: number
  // Mule-pattern keywords — address contains any of these = +points
  mule_keywords: string[]
  // Address reuse: more than N distinct names at same address in 90d = +points
  address_reuse_threshold: number
  // SKU return rate above this % = +points
  high_return_sku_threshold: number
  // Open COD orders: more than N open orders same phone = +points
  open_cod_orders_threshold: number
  // Score thresholds (composite score → decision)
  threshold_auto_release: number  // below this → auto_release
  threshold_review: number        // at or above this → review (between = spot_check)
  // Override permission — which role can approve/reject held orders
  override_role: string
  // Engine version — bumped when rules change to invalidate stale scores
  engine_version: string
}

export const ENGINE_VERSION = '1.0.0'

// ── Setting definitions (for the UI) ──
// Drives the Settings panel: which settings exist, what type they are, how to
// label them. The UI renders inputs based on this metadata.

export interface SettingDef {
  key: keyof RiskSettings
  label: string
  category: 'thresholds' | 'zones' | 'keywords' | 'roles' | 'meta'
  inputType: 'number' | 'list' | 'select' | 'text'
  helpText?: string
  options?: string[]  // for select type
  defaultValue: string  // JSON-serialized
}

export const SETTING_DEFS: SettingDef[] = [
  // ── thresholds ──
  {
    key: 'aov_low',
    label: 'AOV Low (UGX)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Lower bound of typical order value. Used to calibrate "unusually high AOV" detection.',
    defaultValue: '70000',
  },
  {
    key: 'aov_high',
    label: 'AOV High (UGX)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Upper bound of typical order value.',
    defaultValue: '130000',
  },
  {
    key: 'aov_median',
    label: 'AOV Median (UGX)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Median AOV used to compute "first-time customer + AOV > N × median".',
    defaultValue: '100000',
  },
  {
    key: 'aov_first_time_multiplier',
    label: 'First-Time Customer AOV Multiplier',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'First-time customer with AOV > multiplier × median = flagged as suspicious.',
    defaultValue: '3',
  },
  {
    key: 'cod_refusal_threshold',
    label: 'COD Refusal Blocklist Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Number of COD refusals in window before phone is auto-added to blocklist.',
    defaultValue: '3',
  },
  {
    key: 'cod_refusal_window_days',
    label: 'COD Refusal Window (days)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Rolling window for counting COD refusals.',
    defaultValue: '90',
  },
  {
    key: 'velocity_phone_24h',
    label: 'Phone Velocity Threshold (24h)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'More than N orders from same phone in 24h = +points.',
    defaultValue: '3',
  },
  {
    key: 'address_min_length',
    label: 'Min Address Length (chars)',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Addresses shorter than this get penalized (e.g. "Kampala" alone).',
    defaultValue: '15',
  },
  {
    key: 'address_reuse_threshold',
    label: 'Address Reuse Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'More than N distinct customer names at same address in 90d = +points (mule pattern).',
    defaultValue: '2',
  },
  {
    key: 'high_return_sku_threshold',
    label: 'High-Return SKU % Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'SKUs with return rate above this % get +points (wardrobing / abuse magnet).',
    defaultValue: '15',
  },
  {
    key: 'open_cod_orders_threshold',
    label: 'Open COD Orders Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'More than N open COD orders from same phone = +points (possible reseller hoarding).',
    defaultValue: '3',
  },
  {
    key: 'threshold_auto_release',
    label: 'Auto-Release Score Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Scores below this auto-release. Between this and review threshold = spot-check.',
    defaultValue: '30',
  },
  {
    key: 'threshold_review',
    label: 'Review Score Threshold',
    category: 'thresholds',
    inputType: 'number',
    helpText: 'Scores at or above this go to manager review. 100 = hard block.',
    defaultValue: '70',
  },

  // ── zones ──
  {
    key: 'zones',
    label: 'Serviced Zones',
    category: 'zones',
    inputType: 'list',
    helpText: 'Towns and neighborhoods you deliver to. Addresses not matching any zone get penalized. Case-insensitive substring match.',
    defaultValue: JSON.stringify([
      // Kampala divisions
      'kampala', 'nakasero', 'kololo', 'naguru', 'nakawa', 'ntinda', 'bugolobi',
      'mbuya', 'kireka', 'banda', 'mpererwe', 'kalerwe', 'bwaise', 'kawempe',
      'kazo', 'makerere', 'wandegeya', 'rubaga', 'kasubi', 'lubya', 'mutundwe',
      'lungujja', 'makindye', 'kansanga', 'ggaba', 'salaama', 'lukuli', 'katwe',
      'ndeeba', 'mengo', 'nateete', 'zana', 'kamwokya', 'bukoto',
      // Wakiso
      'wakiso', 'nansana', 'kira', 'najjera', 'bulenga', 'namugongo',
      'kyaliwajjala', 'sonde', 'seeta', 'kakiri', 'buloba', 'kasangati',
      'gayaza', 'magere',
      // Mbarara
      'mbarara', 'kakoba', 'nyamitanga', 'kamukuzi', 'biharwe', 'rugarama',
      // Jinja
      'jinja', 'mpumudde', 'masese', 'walukuba', 'bugembe', 'kakira', 'njeru',
      'mafubira',
      // Fort Portal
      'fort portal', 'fortportal', 'kabarole', 'kicwamba', 'mugusu', 'ruteete',
    ]),
  },

  // ── keywords ──
  {
    key: 'mule_keywords',
    label: 'Mule-Pattern Keywords',
    category: 'keywords',
    inputType: 'list',
    helpText: 'Address containing any of these words = +points (mule / reshipping pattern).',
    defaultValue: JSON.stringify([
      'hotel', 'lodge', 'guest house', 'guesthouse', 'stage', 'bus park',
      'bus park stage', 'inn', 'motel', 'airbnb',
    ]),
  },

  // ── roles ──
  {
    key: 'override_role',
    label: 'Override Permission Role',
    category: 'roles',
    inputType: 'select',
    helpText: 'Only users with this role can approve or reject held orders.',
    options: ['admin', 'super_admin', 'manager'],
    defaultValue: 'admin',
  },

  // ── meta ──
  {
    key: 'engine_version',
    label: 'Engine Version',
    category: 'meta',
    inputType: 'text',
    helpText: 'Bumped when scoring rules change so stale scores can be detected and re-scored.',
    defaultValue: ENGINE_VERSION,
  },
]

// ── Default settings ──
// Used to seed the RiskSetting table on first run.

export function buildDefaultSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of SETTING_DEFS) {
    out[def.key] = def.defaultValue
  }
  return out
}

// ── Settings loader ──
// Reads from the RiskSetting table (caller passes rows); falls back to defaults.

export function loadSettings(rows: { key: string; value: string }[]): RiskSettings {
  const map = new Map(rows.map(r => [r.key, r.value]))
  const get = <T,>(key: keyof RiskSettings, fallback: T): T => {
    const v = map.get(key as string)
    if (v === undefined) return fallback
    try {
      return JSON.parse(v) as T
    } catch {
      return v as unknown as T
    }
  }
  // For number settings, JSON.parse keeps numbers as numbers; for list settings,
  // it returns arrays. For text, returns string.
  return {
    zones: get<string[]>('zones', []),
    aov_low: get<number>('aov_low', 70000),
    aov_high: get<number>('aov_high', 130000),
    aov_median: get<number>('aov_median', 100000),
    aov_first_time_multiplier: get<number>('aov_first_time_multiplier', 3),
    cod_refusal_threshold: get<number>('cod_refusal_threshold', 3),
    cod_refusal_window_days: get<number>('cod_refusal_window_days', 90),
    velocity_phone_24h: get<number>('velocity_phone_24h', 3),
    address_min_length: get<number>('address_min_length', 15),
    mule_keywords: get<string[]>('mule_keywords', []),
    address_reuse_threshold: get<number>('address_reuse_threshold', 2),
    high_return_sku_threshold: get<number>('high_return_sku_threshold', 15),
    open_cod_orders_threshold: get<number>('open_cod_orders_threshold', 3),
    threshold_auto_release: get<number>('threshold_auto_release', 30),
    threshold_review: get<number>('threshold_review', 70),
    override_role: get<string>('override_role', 'admin'),
    engine_version: get<string>('engine_version', ENGINE_VERSION),
  }
}

// ── Phone normalization ──
// Strip everything except digits. Used for blocklist matching and profile lookup.

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

// ── Address normalization ──
// Lowercase + trim + collapse whitespace. Used for blocklist matching and zone lookup.

export function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim().replace(/\s+/g, ' ')
}

// ── Phone validation ──
// Uganda-specific: MTN prefixes 070/076/077/078, Airtel 070/074/075.
// Accepts 07XXXXXXXX (10 digits) or +2567XXXXXXXX (13 chars).

const UG_PHONE_PREFIXES = ['070', '074', '075', '076', '077', '078']

export function isValidUgPhone(phone: string): boolean {
  const normalized = normalizePhone(phone)
  // Local format: 07XXXXXXXX (10 digits starting with 0)
  if (normalized.length === 10 && normalized.startsWith('0')) {
    const prefix = normalized.slice(0, 3)
    return UG_PHONE_PREFIXES.includes(prefix)
  }
  // International format: 2567XXXXXXXX (12 digits starting with 256)
  if (normalized.length === 12 && normalized.startsWith('256')) {
    const prefix = '0' + normalized.slice(3, 5)
    return UG_PHONE_PREFIXES.includes(prefix)
  }
  return false
}

// ── The Scorer ──

export function scoreOrder(input: RiskInput, settings: RiskSettings): RiskResult {
  const reasons: RiskReason[] = []
  let score = 0
  const isFirstTime = input.profile === null || input.profile.totalOrders === 0
  const isWholesale = input.profile?.customerType === 'wholesale'

  // ═══════════════════════════════════════════════════════════════
  // HARD BLOCKS — score = 100, decision = 'blocked'
  // ═══════════════════════════════════════════════════════════════

  if (input.blocklistMatch?.phone) {
    reasons.push({
      rule: 'blocklist_phone',
      points: 100,
      detail: `Phone ${input.customerContact} is on the blocklist: ${input.blocklistMatch.reason || 'manual entry'}`,
    })
    return {
      score: 100,
      decision: 'blocked',
      reasons,
      engineVersion: settings.engine_version,
      paymentPath: input.paymentPath,
    }
  }

  if (input.blocklistMatch?.address && input.customerAddress) {
    reasons.push({
      rule: 'blocklist_address',
      points: 100,
      detail: `Address "${input.customerAddress}" is on the blocklist: ${input.blocklistMatch.reason || 'manual entry'}`,
    })
    return {
      score: 100,
      decision: 'blocked',
      reasons,
      engineVersion: settings.engine_version,
      paymentPath: input.paymentPath,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMON SIGNALS (both COD and prepaid)
  // ═══════════════════════════════════════════════════════════════

  // 1. Phone format validation
  if (!isValidUgPhone(input.customerContact)) {
    score += 20
    reasons.push({
      rule: 'phone_invalid',
      points: 20,
      detail: `Phone ${input.customerContact} doesn't match a valid Uganda MTN/Airtel prefix`,
    })
  }

  // 2. Address quality — length
  if (!input.customerAddress || input.customerAddress.trim().length < settings.address_min_length) {
    score += 15
    reasons.push({
      rule: 'address_too_short',
      points: 15,
      detail: `Address "${input.customerAddress || '(empty)'}" is shorter than ${settings.address_min_length} chars — likely not a real delivery address`,
    })
  }

  // 3. Address quality — zone match (only if address exists)
  if (input.customerAddress && input.customerAddress.trim().length >= settings.address_min_length) {
    const normalizedAddr = normalizeAddress(input.customerAddress)
    const zoneMatch = settings.zones.some(zone => normalizedAddr.includes(zone.toLowerCase()))
    if (!zoneMatch) {
      score += 15
      reasons.push({
        rule: 'address_outside_zones',
        points: 15,
        detail: `Address doesn't match any serviced zone — may be undeliverable`,
      })
    }
  }

  // 4. Mule-pattern keywords in address
  if (input.customerAddress) {
    const normalizedAddr = normalizeAddress(input.customerAddress)
    const matchedKeyword = settings.mule_keywords.find(kw => normalizedAddr.includes(kw.toLowerCase()))
    if (matchedKeyword) {
      score += 20
      reasons.push({
        rule: 'mule_keyword',
        points: 20,
        detail: `Address contains "${matchedKeyword}" — common mule / reshipping pattern`,
      })
    }
  }

  // 5. Address reuse — multiple distinct names at same address
  // (Skip for wholesale — they often ship to shared depots legitimately)
  if (!isWholesale && input.addressReuseCount > settings.address_reuse_threshold) {
    score += 40
    reasons.push({
      rule: 'address_reuse',
      points: 40,
      detail: `${input.addressReuseCount} distinct customer names have used this address in the last 90 days — possible mule address`,
    })
  }

  // 6. First-time customer + unusually high AOV
  // (Skip for wholesale — bulk orders are expected)
  if (!isWholesale && isFirstTime && input.saleAmount && input.saleAmount > settings.aov_median * settings.aov_first_time_multiplier) {
    score += 20
    reasons.push({
      rule: 'first_time_high_aov',
      points: 20,
      detail: `First-time customer with AOV UGX ${input.saleAmount.toLocaleString()} > ${settings.aov_first_time_multiplier}× median (UGX ${settings.aov_median.toLocaleString()})`,
    })
  }

  // 7. High-return SKU
  if (input.skuReturnRate !== null && input.skuReturnRate > settings.high_return_sku_threshold) {
    score += 10
    reasons.push({
      rule: 'high_return_sku',
      points: 10,
      detail: `Product "${input.productName}" has a ${input.skuReturnRate.toFixed(1)}% historical return rate (threshold: ${settings.high_return_sku_threshold}%)`,
    })
  }

  // 8. Phone velocity — too many orders from same phone in 24h
  if (!isWholesale && input.phoneVelocity24h > settings.velocity_phone_24h) {
    score += 15
    reasons.push({
      rule: 'phone_velocity',
      points: 15,
      detail: `${input.phoneVelocity24h} orders placed from this phone in the last 24 hours (threshold: ${settings.velocity_phone_24h})`,
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // COD-SPECIFIC SIGNALS (skipped for prepaid)
  // ═══════════════════════════════════════════════════════════════

  if (input.paymentPath === 'cod' && input.profile) {
    // 9. Prior COD refusals (90d)
    if (input.profile.codRefusals90d > 0) {
      // +20 per refusal, capped at +60
      const pts = Math.min(input.profile.codRefusals90d * 20, 60)
      score += pts
      reasons.push({
        rule: 'cod_refusal_history',
        points: pts,
        detail: `${input.profile.codRefusals90d} COD refusal(s) in last ${settings.cod_refusal_window_days} days`,
      })
    }

    // 10. Low COD acceptance rate (need at least 3 orders to evaluate)
    const totalCodOrders = input.profile.codDelivered90d + input.profile.codRefusals90d
    if (totalCodOrders >= 3) {
      const acceptanceRate = input.profile.codDelivered90d / totalCodOrders
      if (acceptanceRate < 0.5) {
        score += 25
        reasons.push({
          rule: 'low_cod_acceptance',
          points: 25,
          detail: `COD acceptance rate ${(acceptanceRate * 100).toFixed(0)}% (${input.profile.codDelivered90d} delivered / ${totalCodOrders} total) — below 50% threshold`,
        })
      }
    }

    // 11. Too many open COD orders (reseller hoarding)
    if (input.openCodOrders > settings.open_cod_orders_threshold) {
      score += 15
      reasons.push({
        rule: 'open_cod_hoarding',
        points: 15,
        detail: `${input.openCodOrders} open COD orders from this phone (threshold: ${settings.open_cod_orders_threshold}) — possible reseller hoarding`,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PREPAID-SPECIFIC SIGNALS (reserved for Phase 2 — PSP integration)
  // ═══════════════════════════════════════════════════════════════
  // When you integrate Flutterwave / Stripe webhooks, add checks here:
  // - PSP payment status verified?
  // - Card BIN country matches delivery country?
  // - Chargeback history on this card?

  // ═══════════════════════════════════════════════════════════════
  // Clamp + decision
  // ═══════════════════════════════════════════════════════════════

  score = Math.min(score, 100)

  let decision: RiskResult['decision']
  if (score >= settings.threshold_review) {
    decision = 'review'
  } else if (score >= settings.threshold_auto_release) {
    decision = 'spot_check'
  } else {
    decision = 'auto_release'
  }

  return {
    score,
    decision,
    reasons,
    engineVersion: settings.engine_version,
    paymentPath: input.paymentPath,
  }
}

// ── Helper: detect if a COD refusal should trigger auto-blocklist ──
// Called from workflow-transition when a COD order fails/returns.

export function shouldAutoBlocklist(
  codRefusals90d: number,
  settings: RiskSettings,
): boolean {
  return codRefusals90d >= settings.cod_refusal_threshold
}
