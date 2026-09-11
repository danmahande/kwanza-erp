import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-api'
import { getRegionalAccountingProfile, REGIONAL_ACCOUNTING_CATALOG } from '@/lib/regional-catalog'

const DEMO_TENANT_SLUG = 'kwanza-demo'

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if (authResult instanceof NextResponse) return authResult

  const tenant = await db.tenant.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
    include: { taxRates: { orderBy: { effectiveFrom: 'desc' } } },
  })
  return NextResponse.json({ catalog: REGIONAL_ACCOUNTING_CATALOG, tenant })
}

export async function POST(req: NextRequest) {
  const authResult = requireAuth(req)
  if (authResult instanceof NextResponse) return authResult
  const body = await req.json() as {
    name?: string
    countryCode?: string
    currencyCode?: string
    standardTaxRate?: number
    taxRates?: Array<{ code: string; name: string; rate: number; inclusive?: boolean }>
  }
  if (!body.name || !body.countryCode) {
    return NextResponse.json({ error: 'name and countryCode are required' }, { status: 400 })
  }

  const profile = getRegionalAccountingProfile(body.countryCode)
  if (!profile) return NextResponse.json({ error: 'Unsupported country. Add it to the regional catalog first.' }, { status: 400 })
  if (body.standardTaxRate != null && (body.standardTaxRate < 0 || body.standardTaxRate > 100)) {
    return NextResponse.json({ error: 'standardTaxRate must be between 0 and 100' }, { status: 400 })
  }

  const tenant = await db.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {
      name: body.name,
      countryCode: profile.countryCode,
      currencyCode: body.currencyCode || profile.currencyCode,
      currencyName: profile.currencyName,
      taxRegime: profile.taxRegime,
      standardTaxRate: body.standardTaxRate ?? profile.standardTaxRate,
      fiscalYearStartMonth: profile.fiscalYearStartMonth,
      accountingFramework: profile.accountingFramework,
      inventoryCostingMethod: profile.inventoryCostingMethod,
      revenueRecognitionPolicy: profile.revenueRecognitionPolicy,
      policyStatus: 'review_required',
      policyVersion: { increment: 1 },
    },
    create: {
      slug: DEMO_TENANT_SLUG,
      name: body.name,
      countryCode: profile.countryCode,
      currencyCode: body.currencyCode || profile.currencyCode,
      currencyName: profile.currencyName,
      taxRegime: profile.taxRegime,
      standardTaxRate: body.standardTaxRate ?? profile.standardTaxRate,
      fiscalYearStartMonth: profile.fiscalYearStartMonth,
      accountingFramework: profile.accountingFramework,
      inventoryCostingMethod: profile.inventoryCostingMethod,
      revenueRecognitionPolicy: profile.revenueRecognitionPolicy,
    },
  })

  const taxRates = body.taxRates?.length ? body.taxRates : profile.taxRates
  await db.tenantTaxRate.deleteMany({ where: { tenantId: tenant.id } })
  await db.tenantTaxRate.createMany({
    data: taxRates.map((taxRate) => ({
      tenantId: tenant.id,
      code: taxRate.code,
      name: taxRate.name,
      rate: taxRate.rate,
      inclusive: taxRate.inclusive ?? false,
      effectiveFrom: new Date(),
      sourceUrl: profile.sources[0]?.url,
      sourceCheckedAt: new Date(profile.sources[0]?.checkedAt ?? new Date()),
      status: 'review_required',
    })),
  })

  return NextResponse.json({ tenant, profile, requiresReview: true }, { status: 201 })
}