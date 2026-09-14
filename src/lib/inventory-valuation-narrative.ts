/**
 * Adaptive narrative generators for the Inventory Valuation module.
 *
 * Each function takes a metric value + status and returns a brief, plain-English
 * sentence explaining what the metric means and where it sits against the benchmark.
 *
 * Design principle: brief when healthy, explanatory when there's a problem.
 * A non-accountant should understand each sentence without looking up acronyms.
 *
 * The narrative adapts based on status:
 *   - healthy:  one short sentence (metric + benchmark confirmation)
 *   - monitor:  two sentences (metric + benchmark + what's off + why it matters)
 *   - critical: three sentences (metric + benchmark + severity + business impact)
 */

import { fmtUGX, fmtPct, fmtNum } from './inventory-valuation'

export type Status = 'healthy' | 'monitor' | 'critical'

// ── Portfolio Valuation (the total for the selected method) ──
export function portfolioValuationNarrative(args: {
  total: number
  methodName: string
  methodFull: string
  iasRef: string
  rangeMin: number
  rangeMax: number
  withinRange: boolean
}): string {
  const { total, methodName, methodFull, iasRef, rangeMin, rangeMax, withinRange } = args

  const base = `Under ${methodFull} (${iasRef}), your inventory is valued at ${fmtUGX(total, { compact: true })}.`

  if (withinRange) {
    return `${base} This falls within the healthy range of ${fmtUGX(rangeMin, { compact: true })}–${fmtUGX(rangeMax, { compact: true })}, which is 80–120% of the average across all four costing methods. The valuation is consistent with peers.`
  }

  if (total < rangeMin) {
    return `${base} This is below the healthy range of ${fmtUGX(rangeMin, { compact: true })}–${fmtUGX(rangeMax, { compact: true })}. The chosen method is producing a conservative valuation — inventory may be understated relative to other methods, which could affect loan collateral calculations or merchant statements.`
  }

  return `${base} This is above the healthy range of ${fmtUGX(rangeMin, { compact: true })}–${fmtUGX(rangeMax, { compact: true })}. The chosen method is producing an aggressive valuation — inventory may be overstated, which inflates assets on the balance sheet. Verify the cost layers are accurate.`
}

// ── Inventory Turnover ──
export function turnoverNarrative(args: {
  turnover: number
  status: Status
}): string {
  const { turnover, status } = args
  const benchmark = '4–6 turns per year (APICS/ASCM)'

  if (turnover === 0) {
    return `Throughput Turn: no data (no units shipped in the trailing 365 days). The benchmark is ${benchmark}. Once orders start shipping, this metric will compute.`
  }

  if (status === 'healthy') {
    return `Throughput Turn is ${turnover.toFixed(2)}× per year — within the healthy benchmark of ${benchmark}. This means stock moves through the warehouse ${turnover.toFixed(2)} times per year, or roughly every ${(365 / turnover).toFixed(0)} days. Stock is moving at a sustainable pace.`
  }

  if (status === 'monitor') {
    if (turnover < 4) {
      return `Throughput Turn is ${turnover.toFixed(2)}× per year — below the ${benchmark} benchmark. Stock is sitting in the warehouse longer than ideal (roughly ${(365 / turnover).toFixed(0)} days per unit). This ties up merchant capital and increases holding costs. Consider clearing slow-moving items or reducing reorder quantities.`
    }
    return `Throughput Turn is ${turnover.toFixed(2)}× per year — above the ${benchmark} benchmark. Stock is moving fast (roughly every ${(365 / turnover).toFixed(0)} days), but this may indicate understocking — you could be missing sales. Review reorder points.`
  }

  // critical
  return `Throughput Turn is ${turnover.toFixed(2)}× per year — critically slow. The benchmark is ${benchmark}. At this rate, stock sits in the warehouse for roughly ${(365 / turnover).toFixed(0)} days before shipping. This strains merchant cash flow and increases obsolescence risk. Either demand has collapsed, or you're holding too much stock. Action required.`
}

// ── Days of Supply (replaces DIO — 3PL-appropriate, no COGS needed) ──
export function dioNarrative(args: {
  dio: number
  status: Status
}): string {
  const { dio, status } = args
  const benchmark = '60–90 days (APICS/ASCM)'

  if (dio === 0) {
    return `Days of Supply: no data. The benchmark is ${benchmark}.`
  }

  if (status === 'healthy') {
    return `Days of Supply: ${dio.toFixed(0)} days — within the ${benchmark} benchmark. On average, a unit spends ${dio.toFixed(0)} days in the warehouse before shipping. Stock converts to shipments at a healthy pace.`
  }

  if (status === 'monitor') {
    if (dio > 90) {
      return `Days of Supply: ${dio.toFixed(0)} days — above the ${benchmark} benchmark. Units are sitting on shelves longer than typical for this industry (about ${((dio - 90) / 30).toFixed(0)} extra month(s) beyond the upper benchmark). Capital is tied up and obsolescence risk increases.`
    }
    return `Days of Supply: ${dio.toFixed(0)} days — below the ${benchmark} benchmark. Stock is shipping very quickly, which is good for cash flow but may indicate understocking risk.`
  }

  // critical
  return `Days of Supply: ${dio.toFixed(0)} days — critically high. The benchmark is ${benchmark}. At this rate, units spend ${(dio / 365).toFixed(1)} year(s) in the warehouse before shipping. This is unsustainable — each day beyond 90 represents capital that could be deployed elsewhere, and increases the risk of NRV write-downs under IAS 2.`
}

// ── Holding Cost (source: APICS/ASCM, not ACCA/CIMA) ──
export function holdingCostNarrative(args: {
  pct: number
  total: number
  status: Status
}): string {
  const { pct, total, status } = args
  const benchmark = '15–30% of inventory value (APICS/ASCM)'

  if (status === 'healthy') {
    return `Holding cost is ${fmtPct(pct)} of inventory value (${fmtUGX(total, { compact: true })} annually) — within the healthy benchmark of ${benchmark}. This means for every UGX 100 of stock held for a year, it costs UGX ${(pct * 100).toFixed(0)} to store, insure, and finance it. The cost is proportionate to the inventory value.`
  }

  if (status === 'monitor') {
    if (pct > 0.30) {
      return `Holding cost is ${fmtPct(pct)} of inventory value — above the ${benchmark} benchmark. You're spending ${fmtUGX(total, { compact: true })} per year to hold stock (UGX ${(pct * 100).toFixed(0)} per UGX 100 of inventory). The excess is likely from overstocking or high capital costs — review storage rates and order quantities.`
    }
    return `Holding cost is ${fmtPct(pct)} of inventory value — below the ${benchmark} benchmark. This may indicate under-investment in storage security, insurance, or climate control. Verify all 4 components (capital, storage, service, risk) are captured in Settings.`
  }

  // critical
  return `Holding cost is ${fmtPct(pct)} of inventory value — excessive. The benchmark is ${benchmark}. You're spending ${fmtUGX(total, { compact: true })} per year to hold inventory (UGX ${(pct * 100).toFixed(0)} per UGX 100 of stock), which is disproportionate to its value. This typically signals severe overstocking — reduce order quantities and clear slow-moving stock immediately.`
}

// ── Material Price Variance (MPV) ──
export function mpvNarrative(args: {
  variance: number
  status: Status
  materialityPct: number
}): string {
  const { variance, status, materialityPct } = args

  if (variance === 0) {
    return `Material price variance: no recent inbound receipts in the 90-day window. Cannot compute variance.`
  }

  const kind = variance >= 0 ? 'favourable' : 'adverse'
  const direction = variance >= 0 ? 'below' : 'above'
  const absVariance = Math.abs(variance)

  if (status === 'healthy') {
    if (variance > 0) {
      return `Material price variance: ${fmtUGX(absVariance, { compact: true })} favourable — recent purchase costs were below standard. Within the ${(materialityPct * 100).toFixed(1)}% materiality threshold, so no investigation required.`
    }
    return `Material price variance: ${fmtUGX(absVariance, { compact: true })} adverse — recent purchase costs were slightly above standard. Within the ${(materialityPct * 100).toFixed(1)}% materiality threshold, so no investigation required.`
  }

  if (status === 'monitor') {
    return `Material price variance: ${fmtUGX(absVariance, { compact: true })} ${kind} — recent purchase costs were ${direction} standard by more than ${(materialityPct * 100).toFixed(1)}%. This exceeds the materiality threshold and should be investigated. ${variance >= 0 ? 'Favourable variances may indicate substandard quality or supplier discounts worth locking in.' : 'Adverse variances may indicate supplier price increases, quality issues, or urgent purchases at premium rates.'}`
  }

  // critical
  return `Material price variance: ${fmtUGX(absVariance, { compact: true })} ${kind} — significantly ${direction} standard. This is a material deviation that requires immediate investigation. ${variance >= 0 ? 'While favourable, large positive variances can indicate quality problems or errors in standard cost setting.' : 'Large adverse variances directly impact profitability — review supplier contracts, purchase order approvals, and standard cost assumptions.'}`
}

// ── NRV Write-Down ──
export function nrvNarrative(args: {
  count: number
  total: number
  inventoryValue: number
  status: Status
}): string {
  const { count, total, inventoryValue, status } = args

  if (count === 0) {
    return `All inventory carried at cost — no NRV write-downs required. Net realisable value exceeds cost for every product.`
  }

  const pctOfInv = inventoryValue > 0 ? (total / inventoryValue) * 100 : 0

  if (status === 'healthy') {
    return `${count} product${count > 1 ? 's' : ''} require NRV write-down totalling ${fmtUGX(total, { compact: true })} (${pctOfInv.toFixed(1)}% of inventory value). Within the acceptable threshold of 5%. Per IAS 2 §9, inventory is carried at the lower of cost or NRV.`
  }

  if (status === 'monitor') {
    return `${count} product${count > 1 ? 's' : ''} require NRV write-down totalling ${fmtUGX(total, { compact: true })} (${pctOfInv.toFixed(1)}% of inventory value) — above the 5% threshold. This indicates some products have selling prices below cost, typically from market price declines, damage, or obsolescence. Review affected products and record write-downs.`
  }

  // critical
  return `${count} product${count > 1 ? 's' : ''} require NRV write-down totalling ${fmtUGX(total, { compact: true })} (${pctOfInv.toFixed(1)}% of inventory value) — critical. This level of write-down signals significant inventory impairment: damaged goods, expired stock, or severe market price drops. Immediate action: identify the affected products, record write-downs per IAS 2 §9, and investigate root causes.`
}

// ── Variance Flagged (count of products with material variance) ──
export function varianceFlaggedNarrative(args: {
  count: number
  status: Status
  materialityPct: number
}): string {
  const { count, status, materialityPct } = args

  if (count === 0) {
    return `No variances flagged for investigation. All recent inbound receipts are within ${(materialityPct * 100).toFixed(1)}% of standard cost.`
  }

  if (status === 'healthy') {
    return `${count} variance${count > 1 ? 's' : ''} flagged for investigation (above ${(materialityPct * 100).toFixed(1)}% materiality threshold). Within acceptable range — review individual products in the expanded rows.`
  }

  if (status === 'monitor') {
    return `${count} variance${count > 1 ? 's' : ''} flagged for investigation — multiple products have purchase costs deviating more than ${(materialityPct * 100).toFixed(1)}% from standard. This pattern suggests supplier pricing instability or standard cost drift. Review the Variance Analysis section per product.`
  }

  return `${count} variances flagged for investigation — critical. A large number of products are deviating significantly from standard cost. This undermines the reliability of standard costing and may indicate systemic supplier issues or outdated standard cost assumptions. Recalculate standard costs and review supplier contracts.`
}

// ── Stockout Risk ──
export function stockoutNarrative(args: {
  count: number
}): string {
  const { count } = args

  if (count === 0) {
    return `No products at critical stockout risk. All active products have sufficient cover for the next 7+ days.`
  }

  return `${count} product${count > 1 ? 's' : ''} at critical stockout risk (≤ 7 days of cover at current demand). These products will run out within a week if not reordered immediately. Check the Reorder Point column in the product table and place purchase orders for affected SKUs.`
}

// ── Section heading helper ──
export function sectionHeading(number: string, title: string): string {
  return `${number} — ${title}`
}

// ════════════════════════════════════════════════════════════════════════════
// COMPACT SUMMARIES — one-liner per metric, clickable to expand
// ════════════════════════════════════════════════════════════════════════════

export function turnoverCompact(turnover: number, status: Status): string {
  if (turnover === 0) return 'Throughput Turn — no data'
  const daysPerTurn = 365 / turnover
  const label = status === 'healthy' ? 'healthy' : status === 'monitor' ? (turnover < 4 ? 'slow' : 'fast') : 'critically slow'
  return `Throughput Turn ${turnover.toFixed(2)}×/yr · ${label} · stock moves every ${daysPerTurn.toFixed(0)}d · benchmark 4–6×`
}

export function dioCompact(dio: number, status: Status): string {
  if (dio === 0) return 'Days of Supply — no data'
  const label = status === 'healthy' ? 'healthy' : status === 'monitor' ? (dio > 90 ? 'above benchmark' : 'below benchmark') : 'critically high'
  return `Days of Supply ${dio.toFixed(0)}d · ${label} · benchmark 60–90d`
}

export function holdingCompact(pct: number, status: Status): string {
  const label = status === 'healthy' ? 'healthy' : status === 'monitor' ? (pct > 0.30 ? 'high' : 'low') : 'excessive'
  return `Holding ${fmtPct(pct)} · ${label} · UGX ${(pct * 100).toFixed(0)}/100 stock · benchmark 15–30%`
}

export function mpvCompact(variance: number, status: Status): string {
  if (variance === 0) return 'MPV — no data (90d)'
  const kind = variance >= 0 ? 'F' : 'A'
  const label = status === 'healthy' ? 'within threshold' : status === 'monitor' ? 'flagged' : 'critical'
  return `MPV ${kind} ${fmtUGX(Math.abs(variance), { compact: true })} · ${label} · threshold 5% (ISA 320)`
}

export function nrvCompact(count: number, total: number, status: Status): string {
  if (count === 0) return 'NRV — all at cost, no write-downs required'
  const label = status === 'healthy' ? 'within convention' : status === 'monitor' ? 'above convention' : 'critical'
  return `NRV ${count} product${count > 1 ? 's' : ''} · ${fmtUGX(total, { compact: true })} · ${label}`
}

export function varianceFlaggedCompact(count: number, status: Status): string {
  if (count === 0) return 'Variances — none flagged'
  const label = status === 'healthy' ? 'within range' : status === 'monitor' ? 'multiple flagged' : 'critical'
  return `Variance ${count} flagged · ${label}`
}

export function stockoutCompact(count: number): string {
  if (count === 0) return 'Stockout — none at risk'
  return `Stockout ${count} critical · ≤7d cover`
}
