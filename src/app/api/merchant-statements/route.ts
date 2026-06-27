import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateMerchantStatement,
  generateStatementsForAllMerchants,
} from '@/lib/statement-generator'
import { generateStatementExcel } from '@/lib/statement-excel'
import { generateStatementPDF } from '@/lib/statement-pdf'

type StatementLineItemShape = {
  date: string
  type: string
  reference: string
  description: string
  debit: number
  credit: number
}

/**
 * Merchant Statements API — Workflow 5
 *
 * GET  /api/merchant-statements                        → list all statements
 * GET  /api/merchant-statements?merchantId=MCH-0001    → statements for one merchant
 * GET  /api/merchant-statements?id=...&format=excel    → download Excel for one statement
 * GET  /api/merchant-statements?id=...&format=pdf      → download PDF for one statement
 * POST /api/merchant-statements                        → generate a statement
 *      body: { merchantId, period: "YYYY-MM", allMerchants?: boolean, generatedBy }
 */
export async function GET(req: NextRequest) {
  try {
    const merchantId = req.nextUrl.searchParams.get('merchantId')
    const id = req.nextUrl.searchParams.get('id')
    const format = req.nextUrl.searchParams.get('format') // 'excel' | 'pdf'

    // Single-statement file download
    if (id && (format === 'excel' || format === 'pdf')) {
      const stmt = await db.merchantStatement.findUnique({
        where: { id },
      })
      if (!stmt) {
        return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
      }

      const stmtData = {
        statementId: stmt.statementId,
        merchantId: stmt.merchantId,
        merchantName: stmt.merchantName,
        period: stmt.period,
        openingBalance: stmt.openingBalance,
        inboundFees: stmt.inboundFees,
        storageFees: stmt.storageFees,
        outboundFees: stmt.outboundFees,
        returnFees: stmt.returnFees,
        shrinkageDebits: stmt.shrinkageDebits,
        codCollected: stmt.codCollected,
        codFees: stmt.codFees,
        commissions: stmt.commissions,
        salesValue: stmt.salesValue,
        netPayable: stmt.netPayable,
        lineItems: stmt.lineItems
          ? (JSON.parse(stmt.lineItems) as StatementLineItemShape[])
          : [],
      }

      const filePath = format === 'excel'
        ? await generateStatementExcel(stmtData)
        : await generateStatementPDF(stmtData)

      // Update the statement with the file URL
      await db.merchantStatement.update({
        where: { id },
        data: format === 'excel' ? { excelUrl: filePath } : { pdfUrl: filePath },
      })

      // Return the file path so the frontend can offer a download link
      return NextResponse.json({
        success: true,
        filePath,
        fileName: `${stmt.statementId}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
      })
    }

    // List view
    const where: Record<string, unknown> = {}
    if (merchantId) where.merchantId = merchantId

    const statements = await db.merchantStatement.findMany({
      where,
      orderBy: { period: 'desc' },
      take: 200,
    })

    return NextResponse.json(statements)
  } catch (error) {
    console.error('Error fetching merchant statements:', error)
    return NextResponse.json({ error: 'Failed to fetch statements' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.allMerchants) {
      // Generate statements for all active merchants for the given period
      const results = await generateStatementsForAllMerchants({
        period: body.period,
        generatedBy: body.generatedBy || 'system',
      })
      return NextResponse.json({ success: true, results }, { status: 201 })
    }

    // Generate a single statement
    const result = await generateMerchantStatement({
      merchantId: body.merchantId,
      period: body.period,
      generatedBy: body.generatedBy || 'system',
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error) {
    console.error('Error generating merchant statement:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate statement' },
      { status: 500 },
    )
  }
}
