import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs/promises'

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

/**
 * Generate an Excel workbook (.xlsx) for a merchant statement.
 * Saves to /home/z/my-project/download/statements/{statementId}.xlsx
 * Returns the absolute file path.
 */
export async function generateStatementExcel(stmt: StatementData): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Kwanza ERP'
  workbook.created = new Date()

  // ----- Sheet 1: Summary -----
  const summary = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: 'FF6B35' } },
  })

  summary.columns = [
    { width: 32 },
    { width: 22 },
  ]

  // Title block
  summary.mergeCells('A1:B1')
  const titleCell = summary.getCell('A1')
  titleCell.value = 'KWANZA LOGISTICS — MERCHANT STATEMENT'
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  summary.getRow(1).height = 32

  // Merchant + period info
  const infoRows: [string, string][] = [
    ['Merchant', stmt.merchantName],
    ['Merchant ID', stmt.merchantId],
    ['Statement ID', stmt.statementId],
    ['Period', stmt.period],
    ['Currency', 'UGX'],
    ['Generated', new Date().toLocaleString('en-UG')],
  ]
  infoRows.forEach(([label, value], i) => {
    const row = summary.getRow(i + 3)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true, color: { argb: 'FF6B7280' } }
    row.getCell(2).value = value
    row.getCell(2).font = { bold: true }
  })

  // Summary figures block
  const summaryStartRow = infoRows.length + 5
  const summaryBlock: [string, number, boolean][] = [
    ['Opening balance', stmt.openingBalance, true],
    ['Sales value', stmt.salesValue, true],
    ['COD collected on your behalf', stmt.codCollected, true],
    ['Inbound receiving fees', stmt.inboundFees, false],
    ['Storage fees', stmt.storageFees, false],
    ['Outbound pick/pack fees', stmt.outboundFees, false],
    ['Return processing fees', stmt.returnFees, false],
    ['Shrinkage debits', stmt.shrinkageDebits, false],
    ['COD remittance fees', stmt.codFees, false],
    [`Commission (${(stmt.salesValue > 0 ? (stmt.commissions / stmt.salesValue * 100) : 0).toFixed(1)}%)`, stmt.commissions, false],
  ]
  summaryBlock.forEach(([label, amount, isCredit], i) => {
    const row = summary.getRow(summaryStartRow + i)
    row.getCell(1).value = label
    row.getCell(2).value = amount
    row.getCell(2).numFmt = '#,##0;[Red]-#,##0'
    if (isCredit) {
      row.getCell(2).font = { color: { argb: 'FF16A34A' } }
    } else {
      row.getCell(2).font = { color: { argb: 'FFDC2626' } }
    }
  })

  // Net payable row
  const netRow = summary.getRow(summaryStartRow + summaryBlock.length + 1)
  netRow.getCell(1).value = 'NET PAYABLE TO MERCHANT'
  netRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  netRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B35' } }
  netRow.getCell(2).value = stmt.netPayable
  netRow.getCell(2).numFmt = '#,##0;[Red]-#,##0'
  netRow.getCell(2).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  netRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B35' } }
  netRow.height = 28

  // ----- Sheet 2: Line items -----
  const lines = workbook.addWorksheet('Line Items')
  lines.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Debit (UGX)', key: 'debit', width: 16 },
    { header: 'Credit (UGX)', key: 'credit', width: 16 },
  ]

  // Style the header row
  lines.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  lines.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }
  lines.getRow(1).alignment = { horizontal: 'left' }

  // Add line items
  stmt.lineItems.forEach(li => {
    const row = lines.addRow({
      date: li.date,
      type: li.type,
      reference: li.reference,
      description: li.description,
      debit: li.debit || null, // null instead of 0 to keep cells clean
      credit: li.credit || null,
    })
    row.getCell(5).numFmt = '#,##0;[Red]-#,##0'
    row.getCell(6).numFmt = '#,##0;[Red]-#,##0'
    row.getCell(5).font = { color: { argb: 'FFDC2626' } }
    row.getCell(6).font = { color: { argb: 'FF16A34A' } }
  })

  // Totals row
  const totalRow = lines.addRow({
    date: '',
    type: '',
    reference: '',
    description: 'TOTALS',
    debit: stmt.lineItems.reduce((s, l) => s + (l.debit || 0), 0),
    credit: stmt.lineItems.reduce((s, l) => s + (l.credit || 0), 0),
  })
  totalRow.font = { bold: true }
  totalRow.getCell(5).numFmt = '#,##0;[Red]-#,##0'
  totalRow.getCell(6).numFmt = '#,##0;[Red]-#,##0'

  // Save
  const outDir = '/home/z/my-project/download/statements'
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${stmt.statementId}.xlsx`)
  await workbook.xlsx.writeFile(outPath)

  return outPath
}
