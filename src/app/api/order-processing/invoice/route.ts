import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { logAudit } from '@/lib/audit'
import { requireAuth } from '@/lib/auth-api'

/**
 * Invoice PDF generation — Workflow 4 #4
 *
 * GET /api/order-processing/invoice?id=<orderId>&format=pdf
 *   → generates a PDF invoice for the order, marks invoiceGenerated=true,
 *     populates invoiceNumber + invoiceDate, returns the file path.
 *
 * The PDF is saved to /home/z/my-project/download/invoices/{invoiceNumber}.pdf
 */

function formatUGX(n: number): string {
  return 'UGX ' + Math.round(n).toLocaleString('en-US')
}

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const order = await db.orderProcessing.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Generate invoice number if not already set
    let invoiceNumber = order.invoiceNumber
    if (!invoiceNumber) {
      const invoiceCount = await db.orderProcessing.count({ where: { invoiceGenerated: true } })
      invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(invoiceCount + 1).padStart(4, '0')}`
    }

    // Generate PDF
    const outDir = '/home/z/my-project/download/invoices'
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, `${invoiceNumber}.pdf`)

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', margin: 40 })
      const stream = fs.createWriteStream(outPath)
      doc.pipe(stream)

      // Header
      doc
        .fillColor('#1B2A4A')
        .font('Helvetica-Bold')
        .fontSize(18)
        .text('KWANZA LOGISTICS', 40, 40)
        .fontSize(9)
        .fillColor('#6B7280')
        .font('Helvetica')
        .text('3PL Fulfillment Partner', 40, 62)
        .text('Kampala, Uganda', 40, 74)
        .text('accounts@kwanza.com', 40, 86)

      // Invoice title (right-aligned)
      doc
        .fillColor('#FF6B35')
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('INVOICE', 350, 40, { width: 150, align: 'right' })
        .fillColor('#1B2A4A')
        .fontSize(9)
        .font('Helvetica')
        .text(invoiceNumber!, 350, 66, { width: 150, align: 'right' })
        .text(`Date: ${new Date().toLocaleDateString('en-UG')}`, 350, 78, { width: 150, align: 'right' })

      // Divider
      doc
        .moveTo(40, 105)
        .lineTo(555, 105)
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .stroke()

      // Bill to
      doc
        .fillColor('#6B7280')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('BILL TO', 40, 120)
        .fillColor('#1B2A4A')
        .font('Helvetica')
        .fontSize(10)
        .text(order.customerName, 40, 134)
        .fontSize(8)
        .fillColor('#6B7280')
        .text(order.customerInfo.slice(0, 100), 40, 148, { width: 250 })

      // Order info (right)
      doc
        .fillColor('#6B7280')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('ORDER DETAILS', 320, 120, { width: 235, align: 'right' })
        .fillColor('#1B2A4A')
        .font('Helvetica')
        .fontSize(9)
        .text(`Order #: ${order.orderNumber}`, 320, 134, { width: 235, align: 'right' })
        .text(`Order Date: ${new Date(order.orderDate).toLocaleDateString('en-UG')}`, 320, 146, { width: 235, align: 'right' })
        .text(`Payment: ${order.paymentMethod}`, 320, 158, { width: 235, align: 'right' })
        if (order.trackingNumber) {
          doc.text(`Tracking: ${order.trackingNumber}`, 320, 170, { width: 235, align: 'right' })
        }

      // Items table header
      const tableTop = 200
      doc
        .fillColor('#FFFFFF')
        .rect(40, tableTop, 515, 18)
        .fillAndStroke('#1B2A4A', '#1B2A4A')
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('DESCRIPTION', 48, tableTop + 5)
        .text('QTY', 320, tableTop + 5)
        .text('UNIT PRICE', 380, tableTop + 5)
        .text('AMOUNT', 480, tableTop + 5, { width: 70, align: 'right' })

      // Items row (single line for now — could be expanded to multi-item)
      const rowY = tableTop + 28
      doc
        .fillColor('#374151')
        .font('Helvetica')
        .fontSize(9)
        .text(order.customerInfo.split('|')[0] || `Order ${order.orderNumber}`, 48, rowY)
        .text('1', 320, rowY)
        .text(formatUGX(order.totalAmount), 380, rowY)
        .font('Helvetica-Bold')
        .text(formatUGX(order.totalAmount), 480, rowY, { width: 70, align: 'right' })

      // Totals
      const totalsY = rowY + 30
      doc
        .moveTo(40, totalsY)
        .lineTo(555, totalsY)
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .stroke()

      doc
        .fillColor('#6B7280')
        .font('Helvetica')
        .fontSize(9)
        .text('Subtotal', 380, totalsY + 8)
        .text(formatUGX(order.totalAmount), 480, totalsY + 8, { width: 70, align: 'right' })

      doc
        .text('Tax (0%)', 380, totalsY + 22)
        .text(formatUGX(0), 480, totalsY + 22, { width: 70, align: 'right' })

      // Total due
      doc
        .fillColor('#FF6B35')
        .rect(380, totalsY + 40, 175, 22)
        .fill()
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('TOTAL DUE', 388, totalsY + 46)
        .text(formatUGX(order.totalAmount), 480, totalsY + 46, { width: 70, align: 'right' })

      // Footer
      doc
        .fillColor('#6B7280')
        .font('Helvetica')
        .fontSize(7)
        .text(
          `Invoice ${invoiceNumber} · Generated ${new Date().toLocaleString('en-UG')} · Payment due within 14 days · Thank you for your business`,
          40,
          530,
          { width: 515, align: 'center' },
        )

      doc.end()
      stream.on('finish', () => resolve())
      stream.on('error', reject)
    })

    // Mark the order as invoiced
    await db.orderProcessing.update({
      where: { id },
      data: {
        invoiceGenerated: true,
        invoiceNumber,
        invoiceDate: new Date(),
      },
    })

    await logAudit({
      action: 'INVOICE_GENERATED',
      module: 'order_processing',
      entityId: order.orderNumber,
      details: `Generated invoice ${invoiceNumber} for order ${order.orderNumber} (${formatUGX(order.totalAmount)})`,
    })

    return NextResponse.json({
      success: true,
      filePath: outPath,
      fileName: `${invoiceNumber}.pdf`,
      invoiceNumber,
    })
  } catch (error) {
    console.error('Error generating invoice:', error)
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 })
  }
}
