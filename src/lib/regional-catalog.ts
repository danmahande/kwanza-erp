export type RegionalAccountingProfile = {
  countryCode: string
  countryName: string
  currencyCode: string
  currencyName: string
  taxRegime: string
  standardTaxRate: number
  fiscalYearStartMonth: number
  accountingFramework: 'IFRS'
  inventoryCostingMethod: 'fifo' | 'avco'
  revenueRecognitionPolicy: 'delivery'
  taxRates: Array<{
    code: string
    name: string
    rate: number
    inclusive: boolean
  }>
  sources: Array<{
    authority: string
    url: string
    checkedAt: string
  }>
  requiresReview: true
}

// Defaults are onboarding aids, not legal advice. Tax rates and local policy
// must be confirmed by the tenant's accountant before activation.
export const REGIONAL_ACCOUNTING_CATALOG: RegionalAccountingProfile[] = [
  {
    countryCode: 'UG',
    countryName: 'Uganda',
    currencyCode: 'UGX',
    currencyName: 'Uganda shilling',
    taxRegime: 'Uganda VAT',
    standardTaxRate: 18,
    fiscalYearStartMonth: 7,
    accountingFramework: 'IFRS',
    inventoryCostingMethod: 'fifo',
    revenueRecognitionPolicy: 'delivery',
    taxRates: [{ code: 'VAT_STANDARD', name: 'Standard VAT', rate: 18, inclusive: false }],
    sources: [
      { authority: 'Uganda Revenue Authority', url: 'https://ura.go.ug/', checkedAt: '2026-09-11' },
      { authority: 'IFRS Foundation', url: 'https://www.ifrs.org/use-around-the-world/', checkedAt: '2026-09-11' },
    ],
    requiresReview: true,
  },
  {
    countryCode: 'KE',
    countryName: 'Kenya',
    currencyCode: 'KES',
    currencyName: 'Kenyan shilling',
    taxRegime: 'Kenya VAT',
    standardTaxRate: 16,
    fiscalYearStartMonth: 1,
    accountingFramework: 'IFRS',
    inventoryCostingMethod: 'fifo',
    revenueRecognitionPolicy: 'delivery',
    taxRates: [{ code: 'VAT_STANDARD', name: 'Standard VAT', rate: 16, inclusive: false }],
    sources: [
      { authority: 'Kenya Revenue Authority', url: 'https://www.kra.go.ke/', checkedAt: '2026-09-11' },
      { authority: 'IFRS Foundation', url: 'https://www.ifrs.org/use-around-the-world/', checkedAt: '2026-09-11' },
    ],
    requiresReview: true,
  },
  {
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currencyCode: 'TZS',
    currencyName: 'Tanzanian shilling',
    taxRegime: 'Tanzania VAT',
    standardTaxRate: 18,
    fiscalYearStartMonth: 7,
    accountingFramework: 'IFRS',
    inventoryCostingMethod: 'fifo',
    revenueRecognitionPolicy: 'delivery',
    taxRates: [{ code: 'VAT_STANDARD', name: 'Standard VAT', rate: 18, inclusive: false }],
    sources: [
      { authority: 'Tanzania Revenue Authority', url: 'https://www.tra.go.tz/', checkedAt: '2026-09-11' },
      { authority: 'IFRS Foundation', url: 'https://www.ifrs.org/use-around-the-world/', checkedAt: '2026-09-11' },
    ],
    requiresReview: true,
  },
  {
    countryCode: 'RW',
    countryName: 'Rwanda',
    currencyCode: 'RWF',
    currencyName: 'Rwandan franc',
    taxRegime: 'Rwanda VAT',
    standardTaxRate: 18,
    fiscalYearStartMonth: 1,
    accountingFramework: 'IFRS',
    inventoryCostingMethod: 'fifo',
    revenueRecognitionPolicy: 'delivery',
    taxRates: [{ code: 'VAT_STANDARD', name: 'Standard VAT', rate: 18, inclusive: false }],
    sources: [
      { authority: 'Rwanda Revenue Authority', url: 'https://www.rra.gov.rw/', checkedAt: '2026-09-11' },
      { authority: 'IFRS Foundation', url: 'https://www.ifrs.org/use-around-the-world/', checkedAt: '2026-09-11' },
    ],
    requiresReview: true,
  },
]

export function getRegionalAccountingProfile(countryCode: string) {
  return REGIONAL_ACCOUNTING_CATALOG.find((profile) => profile.countryCode === countryCode.toUpperCase())
}