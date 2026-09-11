import { db } from '@/lib/db'

/**
 * Workflow 5: Merchant Statement Generator
 *
 * Generates a monthly statement for a single merchant. The statement pulls from:
 *  - InboundRecord        (receiving fees + inbound value)
 *  - StorageLiability     (storage fees accrued in the period)
 *  - OutboundRecord       (sales value, pick/pack fees)
 *  - AfterSalesRecord     (return processing fees)
 *  - ShrinkageRecord      (shrinkage debits where debitMerchant = true)
 *  - DriverBanking + OutboundRecord.codCollected (COD collected on merchant's behalf)
 *  - MerchantRateCard     (rate card to compute fees)
 *  - Previous MerchantStatement (opening balance)
 *
 * Output: a MerchantStatement row with lineItems JSON, plus Excel + PDF files
 * saved to /home/z/my-project/download/statements/.
 *
 * All amounts in UGX (the merchant's currency, default UGX).
 */

export interface StatementLineItem {
  date: string
  type: 'inbound' | 'storage' | 'outbound' | 'return' | 'shrinkage' | 'cod' | 'commission' | 'charge' | 'opening'
  reference: string
  description: string
  debit: number  // amount we charge the merchant
  credit: number // amount we owe the merchant
}

export async function generateMerchantStatement(params: {
  merchantId: string
  /** Period in "YYYY-MM" format */
  period: string
  generatedBy: string
}): Promise<{
  statementId: string
  netPayable: number
  lineItemCount: number
}> {
  const { merchantId, period, generatedBy } = params

  // Parse period to start/end dates
  const [year, month] = period.split('-').map(n => parseInt(n))
  if (!year || !month) throw new Error(`Invalid period: ${period}. Expected format "YYYY-MM".`)

  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)

  // Fetch merchant + active rate card
  const merchant = await db.merchant.findUnique({ where: { merchantId } })
  if (!merchant) throw new Error(`Merchant not found: ${merchantId}`)

  const rateCard = await db.merchantRateCard.findFirst({
    where: { merchantId, isActive: true },
    orderBy: { validFrom: 'desc' },
  })

  // Check if a statement already exists for this merchant + period
  const existingStatement = await db.merchantStatement.findFirst({
    where: { merchantId, period },
  })
  if (existingStatement) {
    throw new Error(`Statement ${existingStatement.statementId} already exists for merchant ${merchantId} period ${period}. Delete it first or choose a different period.`)
  }

  // Opening balance must come from the immediately preceding period, not a
  // future statement or an arbitrary older statement.
  const previousStatement = await db.merchantStatement.findFirst({
    where: { merchantId, period: { lt: period } },
    orderBy: { period: 'desc' },
  })
  const openingBalance = previousStatement?.netPayable ?? 0

  const lineItems: StatementLineItem[] = []

  // 1. Opening balance line
  lineItems.push({
    date: startDate.toISOString().slice(0, 10),
    type: 'opening',
    reference: previousStatement?.statementId ?? '—',
    description: `Opening balance carried from ${previousStatement?.period ?? 'previous period'}`,
    debit: 0,
    credit: openingBalance,
  })

  // 2. Inbounds in period — receiving fees + inbound value (as a credit because we hold goods for them)
  const inbounds = await db.inboundRecord.findMany({
    where: {
      merchantId,
      createdAt: { gte: startDate, lte: endDate },
    },
  })
  let inboundFees = 0
  for (const ib of inbounds) {
    const receivingFee = (rateCard?.inboundReceivingPerUnit ?? 0) * ib.qtyIn
    inboundFees += receivingFee
    lineItems.push({
      date: ib.createdAt.toISOString().slice(0, 10),
      type: 'inbound',
      reference: ib.inboundId,
      description: `Received ${ib.qtyIn} × ${ib.productName}`,
      debit: receivingFee,
      credit: 0,
    })
  }

  // 3. Storage fees are posted by the daily accrual job as approved charges.
  // Do not settle liability rows while generating a statement: generation must
  // be repeatable and must not mutate operational inventory balances.
  let storageFees = 0

  // 4. Delivered outbounds in period — undelivered/cancelled orders are not
  // merchant sales until delivery is confirmed.
  const outbounds = await db.outboundRecord.findMany({
    where: {
      vendorId: merchantId,
      status: 'delivered',
      createdAt: { gte: startDate, lte: endDate },
    },
  })
  let outboundFees = 0
  let salesValue = 0
  for (const ob of outbounds) {
    const pickFee = (rateCard?.pickPerUnit ?? 0) * ob.qty
    const packFee = rateCard?.packPerOrder ?? 0
    const fee = pickFee + packFee
    outboundFees += fee
    salesValue += ob.saleAmount ?? 0
    lineItems.push({
      date: ob.createdAt.toISOString().slice(0, 10),
      type: 'outbound',
      reference: ob.outboundId,
      description: `Order ${ob.orderNumber}: ${ob.qty} × ${ob.productName}`,
      debit: fee,
      credit: ob.saleAmount ?? 0,
    })
  }

  // 5. Returns in period — link each RMA to its original outbound order so a
  // return is attributed to the correct merchant.
  const returns = await db.afterSalesRecord.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
  })
  const returnOrderRefs = returns.map((item) => item.originalOrderId).filter((id): id is string => Boolean(id))
  const returnOrders = returnOrderRefs.length === 0
    ? []
    : await db.outboundRecord.findMany({
        where: {
          vendorId: merchantId,
          OR: returnOrderRefs.flatMap((reference) => [
            { outboundId: reference },
            { orderNumber: reference },
            { originalOrderNumber: reference },
          ]),
        },
        select: { outboundId: true, orderNumber: true, originalOrderNumber: true },
      })
  const merchantReturnRefs = new Set(returnOrders.flatMap((order) => [order.outboundId, order.orderNumber, order.originalOrderNumber].filter(Boolean)))
  let returnFees = 0
  for (const item of returns) {
    if (!item.originalOrderId || !merchantReturnRefs.has(item.originalOrderId)) continue
    const processingFee = rateCard?.returnProcessingPerUnit ?? 0
    const fee = processingFee + (rateCard?.returnsPerOrder ?? 0)
    const refund = item.refundAmount ?? 0
    returnFees += fee + refund
    lineItems.push({
      date: item.createdAt.toISOString().slice(0, 10),
      type: 'return',
      reference: item.afterSalesId,
      description: `Return ${item.returnOrderNumber ?? item.afterSalesId}: refund and processing`,
      debit: fee + refund,
      credit: 0,
    })
  }

  // 6. Shrinkage debits in period
  const shrinkages = await db.shrinkageRecord.findMany({
    where: {
      merchantId,
      status: 'resolved',
      debitMerchant: true,
      settledOnStatementId: null,
      resolvedAt: { gte: startDate, lte: endDate },
    },
  })
  let shrinkageDebits = 0
  for (const sh of shrinkages) {
    const value = sh.totalValue ?? 0
    shrinkageDebits += value
    lineItems.push({
      date: (sh.resolvedAt ?? sh.createdAt).toISOString().slice(0, 10),
      type: 'shrinkage',
      reference: sh.shrinkageId,
      description: `Shrinkage: ${sh.qty} × ${sh.productName} (${sh.reason})`,
      debit: value,
      credit: 0,
    })
  }

  // 7. COD collected is disclosed as a memo. It is already included in the
  // delivered order's sale value and must not be credited a second time.
  const codAgg = await db.outboundRecord.aggregate({
    where: {
      vendorId: merchantId,
      status: 'delivered',
      deliveredAt: { gte: startDate, lte: endDate },
    },
    _sum: { codCollected: true },
  })
  const codCollected = codAgg._sum.codCollected ?? 0
  const deliveredCodOrders = outbounds.filter(o => (o.codCollected ?? 0) > 0)
  const codFees = (rateCard?.codRemittanceFeePerOrder ?? 0) * deliveredCodOrders.length
  if (codCollected > 0) {
    lineItems.push({
      date: endDate.toISOString().slice(0, 10),
      type: 'cod',
      reference: period,
      description: `COD collected on ${outbounds.filter(o => o.status === 'delivered').length} delivered orders`,
      debit: 0,
      credit: 0,
    })
    if (codFees > 0) {
      lineItems.push({
        date: endDate.toISOString().slice(0, 10),
        type: 'cod',
        reference: period,
        description: `COD remittance fees`,
        debit: codFees,
        credit: 0,
      })
    }
  }

  // 8. Commission earned by 3PL on sales
  const commissionPercent = rateCard?.commissionPercent ?? 0
  const commissions = (salesValue * commissionPercent) / 100
  if (commissions > 0) {
    lineItems.push({
      date: endDate.toISOString().slice(0, 10),
      type: 'commission',
      reference: period,
      description: `Commission @ ${commissionPercent}% on sales of ${salesValue} UGX`,
      debit: commissions,
      credit: 0,
    })
  }

  // 9. Include approved manual/storage charges for this period. Charges are
  // not recomputed here, so finance approval remains the control point.
  const approvedCharges = await db.charge.findMany({
    where: { merchantId, period, status: 'approved', sourceType: { in: ['manual', 'storage_liability'] } },
  })
  for (const charge of approvedCharges) {
    if (charge.chargeType === 'storage') storageFees += charge.amount
    lineItems.push({
      date: charge.createdAt.toISOString().slice(0, 10),
      type: charge.chargeType === 'storage' ? 'storage' : 'charge',
      reference: charge.chargeId,
      description: charge.description,
      debit: charge.amount,
      credit: 0,
    })
  }

  // 10. Net payable. COD is informational because delivered sales already
  // carry the customer amount.
  const totalCredit = salesValue + openingBalance
  const totalDebit = inboundFees + storageFees + outboundFees + returnFees + shrinkageDebits + commissions + codFees
  const netPayable = totalCredit - totalDebit

  // Create the statement record
  const statementId = `STMT-${period.replace('-', '')}-${merchantId}-${Date.now().toString(36).toUpperCase()}`

  const statement = await db.merchantStatement.create({
    data: {
      statementId,
      merchantId,
      merchantName: merchant.businessName,
      period,
      openingBalance,
      inboundFees,
      storageFees,
      outboundFees,
      returnFees,
      shrinkageDebits,
      codCollected,
      codFees,
      commissions,
      salesValue,
      netPayable,
      isPaid: false,
      status: 'draft',
      lineItems: JSON.stringify(lineItems),
      generatedBy,
    },
  })

  await db.shrinkageRecord.updateMany({
    where: { id: { in: shrinkages.map((shrinkage) => shrinkage.id) }, settledOnStatementId: null },
    data: { settledOnStatementId: statement.statementId },
  })

  // Link only the charges actually included in this statement.
  await db.charge.updateMany({
    where: { id: { in: approvedCharges.map((charge) => charge.id) }, status: 'approved' },
    data: { status: 'invoiced', statementId: statement.statementId },
  })

  return {
    statementId: statement.statementId,
    netPayable,
    lineItemCount: lineItems.length,
  }
}

/**
 * Generate statements for ALL active merchants for a given period.
 * Used by the monthly batch run on the 1st of each month.
 */
export async function generateStatementsForAllMerchants(params: {
  period: string
  generatedBy: string
}) {
  const merchants = await db.merchant.findMany({ where: { isActive: true } })
  const results = []
  for (const m of merchants) {
    try {
      const result = await generateMerchantStatement({
        merchantId: m.merchantId,
        period: params.period,
        generatedBy: params.generatedBy,
      })
      results.push({ merchantId: m.merchantId, merchantName: m.businessName, ...result, success: true })
    } catch (err) {
      results.push({
        merchantId: m.merchantId,
        merchantName: m.businessName,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }
  return results
}
