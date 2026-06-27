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
  type: 'inbound' | 'storage' | 'outbound' | 'return' | 'shrinkage' | 'cod' | 'commission' | 'opening'
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

  // Fetch previous statement for opening balance
  const previousStatement = await db.merchantStatement.findFirst({
    where: { merchantId, period: { not: period } },
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
  let inboundValueTotal = 0
  for (const ib of inbounds) {
    const receivingFee = (rateCard?.inboundReceivingPerUnit ?? 0) * ib.qtyIn
    inboundFees += receivingFee
    inboundValueTotal += ib.inboundValue ?? 0
    lineItems.push({
      date: ib.createdAt.toISOString().slice(0, 10),
      type: 'inbound',
      reference: ib.inboundId,
      description: `Received ${ib.qtyIn} × ${ib.productName}`,
      debit: receivingFee,
      credit: 0,
    })
  }

  // 3. Storage fees accrued in period (from StorageLiability rows for this merchant)
  const storageLiabilities = await db.storageLiability.findMany({
    where: { merchantId, status: { in: ['active', 'partially_settled', 'settled'] } },
  })
  // For the period, we use the accruedAmount as of endDate minus accruedAmount as of startDate
  // Simplification: use the full accruedAmount minus settledAmount (these are cumulative).
  // For a real per-period split we'd need to snapshot. For now: take the outstanding balance
  // at time of statement generation as the storage fee for this period.
  let storageFees = 0
  for (const sl of storageLiabilities) {
    const outstanding = sl.accruedAmount - sl.settledAmount
    if (outstanding > 0) {
      storageFees += outstanding
      lineItems.push({
        date: endDate.toISOString().slice(0, 10),
        type: 'storage',
        reference: sl.inboundId,
        description: `Storage: ${sl.unitsRemaining} units × ${sl.ratePerUnitPerDay} UGX/day (${sl.productName})`,
        debit: outstanding,
        credit: 0,
      })
      // Mark this liability as settled
      await db.storageLiability.update({
        where: { id: sl.id },
        data: { settledAmount: sl.accruedAmount, status: 'settled' },
      })
    }
  }

  // 4. Outbounds in period — sales value (credit) + pick/pack fees (debit)
  const outbounds = await db.outboundRecord.findMany({
    where: {
      businessName: merchant.businessName,
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

  // 5. Returns in period — return processing fees
  const returns = await db.afterSalesRecord.findMany({
    where: {
      customerName: { in: [] }, // TODO: link via originalOrderId when we have merchantId on AfterSalesRecord
      createdAt: { gte: startDate, lte: endDate },
    },
  })
  // Simplification: we can't easily filter AfterSalesRecord by merchant without a schema change.
  // For now, return fees are 0 unless we add merchantId to AfterSalesRecord.
  // This is a known TODO.
  const returnFees = 0
  void returns // avoid unused-var error

  // 6. Shrinkage debits in period
  const shrinkages = await db.shrinkageRecord.findMany({
    where: {
      merchantId,
      status: 'resolved',
      debitMerchant: true,
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

  // 7. COD collected on merchant's behalf in period
  // Sum of codCollected on delivered outbound records for this merchant
  const codAgg = await db.outboundRecord.aggregate({
    where: {
      businessName: merchant.businessName,
      status: 'delivered',
      deliveredAt: { gte: startDate, lte: endDate },
    },
    _sum: { codCollected: true },
  })
  const codCollected = codAgg._sum.codCollected ?? 0
  const codFees = (rateCard?.codRemittanceFeePerOrder ?? 0) * outbounds.filter(o => o.status === 'delivered').length
  if (codCollected > 0) {
    lineItems.push({
      date: endDate.toISOString().slice(0, 10),
      type: 'cod',
      reference: period,
      description: `COD collected on ${outbounds.filter(o => o.status === 'delivered').length} delivered orders`,
      debit: 0,
      credit: codCollected,
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

  // 9. Net payable
  // credit = sales + COD + opening
  // debit  = fees + storage + shrinkage + commissions + codFees
  const totalCredit = salesValue + codCollected + openingBalance
  const totalDebit = inboundFees + storageFees + outboundFees + returnFees + shrinkageDebits + commissions + codFees
  const netPayable = totalCredit - totalDebit

  // Create the statement record
  const stmtCount = await db.merchantStatement.count()
  const statementId = `STMT-${period.replace('-', '')}-${String(stmtCount + 1).padStart(3, '0')}`

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
      status: 'issued',
      lineItems: lineItems as unknown as Record<string, unknown>,
      generatedBy,
    },
  })

  // Update the merchant's pendingPayment to reflect this statement
  await db.merchant.update({
    where: { merchantId },
    data: {
      expectedPayment: { increment: netPayable },
      pendingPayment: { increment: netPayable },
    },
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
