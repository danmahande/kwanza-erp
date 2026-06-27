import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

interface StatementLineItem {
  date: string
  type: string
  reference: string
  description: string
  debit: number
  credit: number
}

interface StatementData {
  statementId: string
  merchantId: string
  merchantName: string
  period: string
  openingBalance: number
  inboundFees: number
  storageFees: number
  outboundFees: number
  returnFees: number
  shrinkageDebits: number
  codCollected: number
  codFees: number
  commissions: number
  salesValue: number
  netPayable: number
  lineItems: StatementLineItem[]
}

function formatUGX(n: number): string {
  return 'UGX ' + Math.round(n).toLocaleString('en-US')
}

/**
 * Generate a PDF for a merchant statement using pdfkit.
 * Saves to /home/z/my-project/download/statements/{statementId}.pdf
 *
 * NOTE: pdfkit uses built-in fonts (Helvetica) which don't support CJK or
 * complex scripts — but for an English/UGX statement in Uganda, that's fine.
 */
export async function generateStatementPDF(stmt: StatementData): Promise<string> {
  return new Promise((resolve, reject) => {
    const outDir = '/home/z/my-project/download/statements'
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, `${stmt.statementId}.pdf`)

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const stream = fs.createWriteStream(outPath)
    doc.pipe(stream)

    // ----- Header -----
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('KWANZA LOGISTICS', 50, 50)
      .fontSize(10)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('Merchant Statement', 50, 72)
      .text(`Statement ID: ${stmt.statementId}`, 50, 86)
      .text(`Period: ${stmt.period}`, 50, 100)
      .text(`Generated: ${new Date().toLocaleString('en-UG')}`, 50, 114)

    // Right-aligned merchant block
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(stmt.merchantName, 350, 50, { width: 200, align: 'right' })
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(10)
      .text(`Merchant ID: ${stmt.merchantId}`, 350, 72, { width: 200, align: 'right' })
      .text('Currency: UGX', 350, 86, { width: 200, align: 'right' })

    // Horizontal divider
    doc
      .moveTo(50, 135)
      .lineTo(545, 135)
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .stroke()

    // ----- Summary block -----
    let y = 155
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Summary', 50, y)
    y += 22

    const summaryLines: [string, number, boolean][] = [
      ['Opening balance', stmt.openingBalance, true],
      ['Sales value (orders fulfilled)', stmt.salesValue, true],
      ['COD collected on your behalf', stmt.codCollected, true],
      ['Inbound receiving fees', stmt.inboundFees, false],
      ['Storage fees (per unit per day)', stmt.storageFees, false],
      ['Outbound pick/pack fees', stmt.outboundFees, false],
      ['Return processing fees', stmt.returnFees, false],
      ['Shrinkage debits', stmt.shrinkageDebits, false],
      ['COD remittance fees', stmt.codFees, false],
      [`Commission`, stmt.commissions, false],
    ]

    summaryLines.forEach(([label, amount, isCredit]) => {
      doc
        .fillColor('#374151')
        .font('Helvetica')
        .fontSize(10)
        .text(label, 50, y)
        .fillColor(isCredit ? '#16A34A' : '#DC2626')
        .font('Helvetica-Bold')
        .text(formatUGX(amount), 350, y, { width: 195, align: 'right' })
      y += 16
    })

    y += 8
    doc
      .moveTo(50, y)
      .lineTo(545, y)
      .strokeColor('#1B2A4A')
      .lineWidth(2)
      .stroke()

    y += 10
    doc
      .fillColor('#FF6B35')
      .rect(50, y, 495, 28)
      .fill()
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('NET PAYABLE TO MERCHANT', 50, y + 7, { width: 300 })
      .text(formatUGX(stmt.netPayable), 350, y + 7, { width: 195, align: 'right' })

    // ----- Line items table -----
    y += 50
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Line Items', 50, y)
    y += 22

    // Table header
    const colX = { date: 50, type: 100, ref: 165, desc: 240, debit: 430, credit: 495 }
    doc
      .fillColor('#FFFFFF')
      .rect(50, y - 2, 495, 16)
      .fillAndStroke('#1B2A4A', '#1B2A4A')
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Date', colX.date, y + 2)
      .text('Type', colX.type, y + 2)
      .text('Ref', colX.ref, y + 2)
      .text('Description', colX.desc, y + 2)
      .text('Debit', colX.debit, y + 2, { width: 60, align: 'right' })
      .text('Credit', colX.credit, y + 2, { width: 50, align: 'right' })
    y += 18

    // Table rows
    doc.font('Helvetica').fontSize(8).fillColor('#374151')
    stmt.lineItems.forEach(li => {
      if (y > 770) {
        doc.addPage()
        y = 50
      }
      doc
        .text(li.date, colX.date, y)
        .text(li.type, colX.type, y)
        .text(li.reference, colX.ref, y)
        .text(li.description.slice(0, 50), colX.desc, y)
        .fillColor('#DC2626')
        .text(li.debit ? Math.round(li.debit).toLocaleString('en-US') : '', colX.debit, y, { width: 60, align: 'right' })
        .fillColor('#16A34A')
        .text(li.credit ? Math.round(li.credit).toLocaleString('en-US') : '', colX.credit, y, { width: 50, align: 'right' })
        .fillColor('#374151')
      y += 14
    })

    // Totals row
    y += 6
    doc
      .moveTo(50, y)
      .lineTo(545, y)
      .strokeColor('#1B2A4A')
      .lineWidth(1)
      .stroke()
    y += 6
    const totalDebit = stmt.lineItems.reduce((s, l) => s + (l.debit || 0), 0)
    const totalCredit = stmt.lineItems.reduce((s, l) => s + (l.credit || 0), 0)
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('TOTALS', colX.date, y)
      .fillColor('#DC2626')
      .text(formatUGX(totalDebit), colX.debit, y, { width: 60, align: 'right' })
      .fillColor('#16A34A')
      .text(formatUGX(totalCredit), colX.credit, y, { width: 50, align: 'right' })

    // Footer
    doc
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(8)
      .text(
        'This statement was generated automatically by Kwanza ERP. Please contact accounts@kwanza.com with any disputes within 7 days.',
        50,
        800,
        { width: 495, align: 'center' },
      )

    doc.end()

    stream.on('finish', () => resolve(outPath))
    stream.on('error', reject)
  })
}
