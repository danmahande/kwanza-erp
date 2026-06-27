/**
 * Currency helpers for Kwanza ERP.
 * All amounts are stored in UGX (Ugandan Shillings) by default.
 * UGX has no subdivision (no cents / piasters in practice), so we round to whole numbers.
 */

export const DEFAULT_CURRENCY = 'UGX'

/**
 * Format a number as UGX (or other currency) using Intl.NumberFormat.
 * Falls back gracefully if Intl data is missing.
 */
export function formatCurrency(amount: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (amount === null || amount === undefined || isNaN(amount)) return `${currency} 0`
  try {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    // Fallback: manual formatting with thousand separators
    const formatted = Math.round(amount).toLocaleString('en-US')
    return `${currency} ${formatted}`
  }
}

/**
 * Compact format for tight spaces (e.g., dashboards): "UGX 1.2M" instead of "UGX 1,200,000".
 */
export function formatCurrencyCompact(amount: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (amount === null || amount === undefined || isNaN(amount)) return `${currency} 0`
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${currency} ${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}${currency} ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${currency} ${(abs / 1_000).toFixed(1)}K`
  return `${sign}${currency} ${Math.round(abs)}`
}

/**
 * Parse a user-entered money string into a number.
 * Strips currency symbols, thousand separators, and whitespace.
 */
export function parseMoney(input: string): number {
  if (!input) return 0
  const cleaned = input.replace(/[^\d.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}
