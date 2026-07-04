import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const deliveryType = req.nextUrl.searchParams.get('deliveryType') || ''
    const status = req.nextUrl.searchParams.get('status') || ''

    const where: Record<string, unknown> = {
      OR: [
        { businessName: { contains: search } },
        { contact: { contains: search } },
        { merchantId: { contains: search } },
        { email: { contains: search } },
        { contactPerson: { contains: search } },
      ],
    }
    if (deliveryType) where.deliveryType = deliveryType
    if (status === 'active') where.isActive = true
    if (status === 'inactive') where.isActive = false
    if (status === 'onhold') where.isOnHold = true

    const merchants = await db.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Enrich with product count, order count, profitability, last activity per merchant
    const enriched = await Promise.all(merchants.map(async (m) => {
      const productCount = await db.product.count({ where: { merchantId: m.merchantId, isActive: true } })
      const orderCount = await db.outboundRecord.count({ where: { vendorId: m.merchantId } })
      const lastInbound = await db.inboundRecord.findFirst({
        where: { merchantId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const lastOutbound = await db.outboundRecord.findFirst({
        where: { vendorId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const lastPayment = await db.merchantPayment.findFirst({
        where: { merchantId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const lastComm = await db.merchantCommunication.findFirst({
        where: { merchantId: m.merchantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, type: true, subject: true },
      })
      const pendingFollowUps = await db.merchantCommunication.count({
        where: {
          merchantId: m.merchantId,
          isResolved: false,
          followUpAt: { lte: new Date() },
        },
      })

      // #2: Profitability calculation
      const mRevenue = m.totalSalesValue || 0
      const mProducts = await db.product.findMany({ where: { merchantId: m.merchantId }, select: { commissionPercent: true } })
      const avgComm = mProducts.length > 0 ? mProducts.reduce((s, p) => s + p.commissionPercent, 0) / mProducts.length / 100 : 0
      const mCommission = Math.round(mRevenue * avgComm)
      const mShrinkage = m.totalShrinkageValue || 0
      const mReturns = m.totalReturnValue || 0
      const mNet = mRevenue - mCommission - mShrinkage - mReturns

      // #4: Recent statements for this merchant
      const statements = await db.merchantStatement.findMany({
        where: { merchantId: m.merchantId },
        orderBy: { period: 'desc' },
        take: 5,
        select: { id: true, statementId: true, period: true, netPayable: true, isPaid: true, status: true, createdAt: true },
      })

      return {
        ...m,
        productCount,
        orderCount,
        lastInboundAt: lastInbound?.createdAt || null,
        lastOutboundAt: lastOutbound?.createdAt || null,
        lastPaymentAt: lastPayment?.createdAt || null,
        lastCommunicationAt: lastComm?.createdAt || null,
        lastCommunicationType: lastComm?.type || null,
        lastCommunicationSubject: lastComm?.subject || null,
        pendingFollowUps,
        profitability: { revenue: mRevenue, commission: mCommission, shrinkage: mShrinkage, returns: mReturns, net: mNet },
        statements,
      }
    }))

    return NextResponse.json(enriched)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch merchants' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const count = await db.merchant.count()
    const merchantId = `MCH-${String(count + 1).padStart(3, '0')}`
    const merchant = await db.merchant.create({
      data: { ...body, merchantId },
    })
    await logAudit({
      action: 'CREATE',
      module: 'merchants',
      entityId: merchantId,
      details: `Created merchant ${merchant.businessName} (${merchantId})`,
    })
    return NextResponse.json(merchant, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    // Special handling for hold toggle — record who/when
    if (typeof data.isOnHold === 'boolean') {
      if (data.isOnHold) {
        data.holdSetAt = new Date()
        data.holdSetBy = data.holdSetBy || _user.name
      } else {
        data.holdSetAt = null
        data.holdSetBy = null
        data.holdReason = null
      }
    }

    const merchant = await db.merchant.update({ where: { id }, data })
    await logAudit({
      action: 'UPDATE',
      module: 'merchants',
      entityId: merchant.merchantId,
      details: `Updated merchant ${merchant.businessName}${typeof body.isOnHold === 'boolean' ? ` — ${body.isOnHold ? 'PLACED ON HOLD' : 'released from hold'}` : ''}`,
    })
    return NextResponse.json(merchant)
  } catch {
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // F2: Check for existing records before deleting
    const merchant = await db.merchant.findUnique({ where: { id: id! }, select: { merchantId: true, businessName: true } })
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

    const checks = await Promise.all([
      db.product.count({ where: { merchantId: merchant.merchantId } }),
      db.inboundRecord.count({ where: { merchantId: merchant.merchantId } }),
      db.outboundRecord.count({ where: { vendorId: merchant.merchantId } }),
      db.merchantPayment.count({ where: { merchantId: merchant.merchantId } }),
      db.merchantStatement.count({ where: { merchantId: merchant.merchantId } }),
      db.rTVRecord.count({ where: { merchantId: merchant.merchantId } }),
      db.shrinkageRecord.count({ where: { merchantId: merchant.merchantId } }),
      db.charge.count({ where: { merchantId: merchant.merchantId } }),
    ])
    const [products, inbounds, outbounds, payments, statements, rtvs, shrinkage, charges] = checks
    const totalDeps = products + inbounds + outbounds + payments + statements + rtvs + shrinkage + charges

    if (totalDeps > 0) {
      const details: string[] = []
      if (products) details.push(`${products} products`)
      if (inbounds) details.push(`${inbounds} inbound records`)
      if (outbounds) details.push(`${outbounds} outbound records`)
      if (payments) details.push(`${payments} payments`)
      if (statements) details.push(`${statements} statements`)
      if (rtvs) details.push(`${rtvs} RTV records`)
      if (shrinkage) details.push(`${shrinkage} shrinkage records`)
      if (charges) details.push(`${charges} charges`)
      return NextResponse.json({
        error: `Cannot delete merchant "${merchant.businessName}" — ${totalDeps} dependent records exist`,
        details,
        suggestion: 'Deactivate the merchant instead (toggle status to inactive) or delete all dependent records first.',
      }, { status: 409 })
    }

    await db.merchant.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete merchant' }, { status: 500 })
  }
}
