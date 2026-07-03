import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateMerchantStatement,
  generateStatementsForAllMerchants,
} from '@/lib/statement-generator'
import { generateStatementExcel } from '@/lib/statement-excel'
import { generateStatementPDF } from '@/lib/statement-pdf'
import { logAudit } from '@/lib/audit'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

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
 * PATCH /api/merchant-statements                       → approval workflow
 *      body: { action: 'submit' | 'approve' | 'reject' | 'issue', id, reason?, by }
 *
 * Statement status machine:
 *   draft → pending_approval → approved → issued → paid
 *                ↑___________|  (reject returns to draft with reason)
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
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
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    if (body.allMerchants) {
      // Generate statements for all active merchants for the given period
      const results = await generateStatementsForAllMerchants({
        period: body.period,
        generatedBy: body.generatedBy || _user.name,
      })
      return NextResponse.json({ success: true, results }, { status: 201 })
    }

    // Generate a single statement
    const result = await generateMerchantStatement({
      merchantId: body.merchantId,
      period: body.period,
      generatedBy: body.generatedBy || _user.name,
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

// PATCH — approval workflow: submit / approve / reject / issue
export async function PATCH(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { action, id, reason, by } = body as {
      action: 'submit' | 'approve' | 'reject' | 'issue'
      id: string
      reason?: string
      by?: string
    }

    if (!action || !id || !['submit', 'approve', 'reject', 'issue'].includes(action)) {
      return NextResponse.json({ error: 'action (submit|approve|reject|issue) and id are required' }, { status: 400 })
    }

    const performer = by || _user.name
    const now = new Date()
    const stmt = await db.merchantStatement.findUnique({ where: { id } })
    if (!stmt) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['pending_approval'],
      pending_approval: ['approved', 'draft'],
      approved: ['issued'],
      issued: [],
      paid: [],
    }
    const allowed = validTransitions[stmt.status] || []
    const actionToStatus: Record<string, string> = {
      submit: 'pending_approval',
      approve: 'approved',
      reject: 'draft',
      issue: 'issued',
    }
    const newStatus = actionToStatus[action]
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `Cannot ${action} a statement in '${stmt.status}' state. Allowed: ${allowed.join(', ') || 'none'}`,
      }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { status: newStatus }
    if (action === 'submit') {
      updateData.submittedBy = performer
      updateData.submittedAt = now
    } else if (action === 'approve') {
      updateData.approvedBy = performer
      updateData.approvedAt = now
    } else if (action === 'reject') {
      updateData.rejectedBy = performer
      updateData.rejectedAt = now
      updateData.rejectionReason = reason || 'Rejected by approver'
    } else if (action === 'issue') {
      // Issuing locks the statement — generates PDF/Excel if not already
      if (!stmt.pdfUrl) {
        try {
          const stmtData = {
            statementId: stmt.statementId, merchantId: stmt.merchantId, merchantName: stmt.merchantName,
            period: stmt.period, openingBalance: stmt.openingBalance, inboundFees: stmt.inboundFees,
            storageFees: stmt.storageFees, outboundFees: stmt.outboundFees, returnFees: stmt.returnFees,
            shrinkageDebits: stmt.shrinkageDebits, codCollected: stmt.codCollected, codFees: stmt.codFees,
            commissions: stmt.commissions, salesValue: stmt.salesValue, netPayable: stmt.netPayable,
            lineItems: stmt.lineItems ? (JSON.parse(stmt.lineItems) as StatementLineItemShape[]) : [],
          }
          const pdfPath = await generateStatementPDF(stmtData)
          const excelPath = await generateStatementExcel(stmtData)
          updateData.pdfUrl = pdfPath
          updateData.excelUrl = excelPath
        } catch (e) {
          console.error('Statement file generation failed (non-blocking):', e)
        }
      }
    }

    const updated = await db.merchantStatement.update({ where: { id }, data: updateData })
    await logAudit({
      action: action.toUpperCase(),
      module: 'statements',
      entityId: stmt.statementId,
      details: `Statement ${stmt.statementId} ${action}ed by ${performer}${reason ? ` — ${reason}` : ''}`,
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating statement:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update statement' },
      { status: 500 },
    )
  }
}
