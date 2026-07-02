import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'

/**
 * Pick List PDF generator
 *
 * Generates a pick list for one or more outbound orders. The pick list tells
 * the warehouse clerk: "Go to location X, pick N units of product Y."
 *
 * Groups by storage location for pick-path efficiency.
 */

function formatUGX(n: number): string {
  return 'UGX ' + Math.round(n).toLocaleString('en-US')
}

interface PickItem {
  storageLocation: string
  productId: string
  productName: string
  brand: string | null
  variant: string | null
  qty: number
  orderNumber: string
  customerName: string
}

export async function generatePickList(orderIds: string[]): Promise<string> {
  // Fetch all the outbound records
  const orders = await db.outboundRecord.findMany({
    where: { id: { in: orderIds } },
    orderBy: { orderNumber: 'asc' },
  })

  if (orders.length === 0) throw new Error('No orders found for given IDs')

  // Build pick items — one per order (since each OutboundRecord is a single line item in this schema)
  // In a multi-line-item system this would expand to multiple lines per order
  const items: PickItem[] = orders.map(o => ({
    storageLocation: o.productId, // TODO: look up actual storageLocation from InventoryItem
    productId: o.productId,
    productName: o.productName,
    brand: o.brand,
    variant: o.variant,
    qty: o.qty,
    orderNumber: o.orderNumber || '',
    customerName: o.customerName,
  }))

  // Sort by storageLocation for pick-path efficiency
  items.sort((a, b) => a.storageLocation.localeCompare(b.storageLocation))

  // Generate PDF
  const outDir = '/home/z/my-project/download/pick-lists'
  fs.mkdirSync(outDir, { recursive: true })
  const waveId = `WAVE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`
  const outPath = path.join(outDir, `${waveId}.pdf`)

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const stream = fs.createWriteStream(outPath)
    doc.pipe(stream)

    // Header
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('PICK LIST', 40, 40)
      .fontSize(10)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text(`Wave: ${waveId}`, 40, 66)
      .text(`Generated: ${new Date().toLocaleString('en-UG')}`, 40, 80)
      .text(`Orders: ${orders.length}`, 40, 94)
      .text(`Total items: ${items.reduce((s, i) => s + i.qty, 0)}`, 40, 108)

    // Divider
    doc.moveTo(40, 125).lineTo(555, 125).strokeColor('#E5E7EB').lineWidth(1).stroke()

    // Table header
    const tableTop = 145
    doc
      .fillColor('#FFFFFF')
      .rect(40, tableTop, 515, 18)
      .fillAndStroke('#1B2A4A', '#1B2A4A')
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('LOCATION', 48, tableTop + 5)
      .text('PRODUCT', 130, tableTop + 5)
      .text('QTY', 330, tableTop + 5)
      .text('ORDER', 380, tableTop + 5)
      .text('CUSTOMER', 460, tableTop + 5)

    // Items
    let y = tableTop + 28
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
    items.forEach((item, idx) => {
      if (y > 770) {
        doc.addPage()
        y = 40
      }
      // Alternate row background
      if (idx % 2 === 0) {
        doc.rect(40, y - 4, 515, 18).fill('#F9FAFB')
        doc.fillColor('#374151')
      }
      doc
        .font('Helvetica-Bold')
        .text(item.storageLocation || '—', 48, y)
        .font('Helvetica')
        .text(`${item.productName}${item.brand ? ` (${item.brand})` : ''}${item.variant ? ` ${item.variant}` : ''}`, 130, y, { width: 195 })
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(String(item.qty), 330, y)
        .fontSize(9)
        .font('Helvetica')
        .text(item.orderNumber, 380, y)
        .text(item.customerName.slice(0, 20), 460, y)
      y += 20
    })

    // Footer
    doc
      .moveTo(40, y + 10).lineTo(555, y + 10).strokeColor('#1B2A4A').lineWidth(2).stroke()
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('PICKER SIGNATURE:', 40, y + 25)
      .text('PACKER SIGNATURE:', 300, y + 25)
      .moveTo(170, y + 50).lineTo(280, y + 50).strokeColor('#9CA3AF').lineWidth(1).stroke()
      .moveTo(420, y + 50).lineTo(555, y + 50).strokeColor('#9CA3AF').lineWidth(1).stroke()

    doc
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Kwanza Logistics · Pick List ${waveId} · Pick items in location order (A→Z) for shortest path · Confirm each item with a tick`,
        40,
        800,
        { width: 515, align: 'center' },
      )

    doc.end()
    stream.on('finish', () => resolve())
    stream.on('error', reject)
  })

  return outPath
}

/**
 * Packing Slip PDF generator
 *
 * Generates a packing slip for a single order. The packing slip goes IN the box
 * and shows the customer what they should have received.
 */
export async function generatePackingSlip(orderId: string): Promise<string> {
  const order = await db.outboundRecord.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  const outDir = '/home/z/my-project/download/packing-slips'
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${order.outboundId}-packingslip.pdf`)

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 })
    const stream = fs.createWriteStream(outPath)
    doc.pipe(stream)

    // Header
    doc
      .fillColor('#1B2A4A')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('KWANZA LOGISTICS', 40, 40)
      .fontSize(8)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('3PL Fulfillment Partner · Kampala, Uganda', 40, 60)

    doc
      .fillColor('#FF6B35')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('PACKING SLIP', 350, 40, { width: 165, align: 'right' })
      .fillColor('#1B2A4A')
      .fontSize(8)
      .font('Helvetica')
      .text(`Order: ${order.orderNumber}`, 350, 60, { width: 165, align: 'right' })
      .text(`Outbound: ${order.outboundId}`, 350, 72, { width: 165, align: 'right' })
      .text(`Date: ${new Date().toLocaleDateString('en-UG')}`, 350, 84, { width: 165, align: 'right' })

    doc.moveTo(40, 105).lineTo(515, 105).strokeColor('#E5E7EB').lineWidth(1).stroke()

    // Ship to
    doc
      .fillColor('#6B7280')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('SHIP TO', 40, 120)
      .fillColor('#1B2A4A')
      .font('Helvetica')
      .fontSize(10)
      .text(order.customerName, 40, 134)
      .fontSize(8)
      .fillColor('#6B7280')
      .text(order.customerContact || '', 40, 148)
      .text(order.customerEmail || '', 40, 160)
      .text(order.customerAddress || '', 40, 172, { width: 250 })

    // Items header
    const tableTop = 200
    doc
      .fillColor('#FFFFFF')
      .rect(40, tableTop, 475, 18)
      .fillAndStroke('#1B2A4A', '#1B2A4A')
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('QTY', 48, tableTop + 5)
      .text('ITEM', 90, tableTop + 5)
      .text('TOTAL', 410, tableTop + 5, { width: 95, align: 'right' })

    // Items row
    const rowY = tableTop + 28
    doc
      .fillColor('#374151')
      .font('Helvetica')
      .fontSize(10)
      .text(String(order.qty), 48, rowY)
      .text(`${order.productName}${order.brand ? ` · ${order.brand}` : ''}${order.variant ? ` · ${order.variant}` : ''}`, 90, rowY, { width: 315 })
      .font('Helvetica-Bold')
      .text(formatUGX(order.saleAmount || 0), 410, rowY, { width: 95, align: 'right' })

    // Totals
    const totalsY = rowY + 30
    doc
      .moveTo(40, totalsY).lineTo(515, totalsY).strokeColor('#E5E7EB').lineWidth(1).stroke()
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(9)
      .text('Subtotal', 280, totalsY + 8)
      .text(formatUGX(order.saleAmount || 0), 410, totalsY + 8, { width: 95, align: 'right' })
      .text('Shipping', 280, totalsY + 22)
      .text(formatUGX(0), 410, totalsY + 22, { width: 95, align: 'right' })

    // Grand total
    doc
      .fillColor('#FF6B35')
      .rect(280, totalsY + 40, 235, 22)
      .fill()
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('TOTAL', 288, totalsY + 46)
      .text(formatUGX(order.saleAmount || 0), 410, totalsY + 46, { width: 95, align: 'right' })

    // COD note if applicable
    if (order.codCollected && order.codCollected > 0) {
      doc
        .fillColor('#DC2626')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`CASH ON DELIVERY: ${formatUGX(order.codCollected)}`, 40, totalsY + 80)
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6B7280')
        .text('Driver will collect this amount on delivery.', 40, totalsY + 95)
    }

    // Footer
    doc
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Packing slip for order ${order.orderNumber} · Please check all items on arrival · Contact 0800-KWANZA for missing items`,
        40,
        530,
        { width: 475, align: 'center' },
      )

    doc.end()
    stream.on('finish', () => resolve())
    stream.on('error', reject)
  })

  return outPath
}
