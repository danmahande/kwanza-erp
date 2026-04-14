import { db } from '../src/lib/db'
import { hash } from 'bcryptjs'

async function main() {
  console.log('Seeding database...')

  // Hash passwords
  const adminPassword = await hash('admin123', 10)
  const warehousePassword = await hash('warehouse123', 10)

  // Create Users
  await db.user.upsert({
    where: { email: 'admin@kwanza.com' },
    update: {},
    create: { name: 'Admin User', email: 'admin@kwanza.com', password: adminPassword, role: 'admin', isActive: true },
  })
  await db.user.upsert({
    where: { email: 'warehouse@kwanza.com' },
    update: {},
    create: { name: 'Warehouse Manager', email: 'warehouse@kwanza.com', password: warehousePassword, role: 'warehouse', isActive: true },
  })
  console.log('Users created')

  // Create Merchants (Vendors) — matching real vendor IDs V001-V010
  const merchants = [
    { merchantId: 'V001', businessName: 'Supreme Office Supplies Ltd', contact: '+254712345001', email: 'info@supreme.co.ke' },
    { merchantId: 'V002', businessName: 'Dettol Hygiene Products', contact: '+254712345002', email: 'orders@dettol-ke.co.ke' },
    { merchantId: 'V003', businessName: 'Colgate-Palmolive EA', contact: '+254712345003', email: 'supply@colgate-ea.co.ke' },
    { merchantId: 'V004', businessName: 'Beverage Central Ltd', contact: '+254712345004', email: 'supply@beveragecentral.co.ke' },
    { merchantId: 'V005', businessName: 'Fresh Dairy Farmers Coop', contact: '+254712345005', email: 'info@freshdairy.co.ke' },
    { merchantId: 'V006', businessName: 'Kwanza Household Goods', contact: '+254712345006', email: 'orders@kwanzahousehold.co.ke' },
    { merchantId: 'V007', businessName: 'Eveready East Africa', contact: '+254712345007', email: 'supply@eveready-ea.co.ke' },
    { merchantId: 'V008', businessName: 'Haco Tiger Brands', contact: '+254712345008', email: 'orders@haco.co.ke' },
    { merchantId: 'V009', businessName: 'Bidco Africa', contact: '+254712345009', email: 'supply@bidco.co.ke' },
    { merchantId: 'V010', businessName: 'Kenya Bakeries Ltd', contact: '+254712345010', email: 'orders@kenyabakeries.co.ke' },
  ]

  for (const m of merchants) {
    await db.merchant.upsert({
      where: { merchantId: m.merchantId },
      update: {},
      create: { ...m, isActive: true, createdBy: 'admin@kwanza.com' },
    })
  }
  console.log('Merchants created')

  // Create Products — matching real naming convention: Brand + Product + Variant
  const products = [
    { productId: 'P0001', productLabel: 'Supreme office pens', brand: 'Supreme', variant: 'BLUE-50PCs', category: 'Stationery', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', unit: 'pack', minStock: 50, unitCost: 350, unitSellingPrice: 500, commissionPercent: 10, currentStock: 200 },
    { productId: 'P0002', productLabel: 'Supreme A4 Copy Paper', brand: 'Supreme', variant: '80GSM-500SHTS', category: 'Stationery', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', unit: 'ream', minStock: 30, unitCost: 280, unitSellingPrice: 420, commissionPercent: 10, currentStock: 150 },
    { productId: 'P0003', productLabel: 'Supreme Stapler', brand: 'Supreme', variant: 'NO24-1PC', category: 'Stationery', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', unit: 'unit', minStock: 20, unitCost: 180, unitSellingPrice: 280, commissionPercent: 12, currentStock: 45 },
    { productId: 'P0004', productLabel: 'Dettol Antiseptic Soap', brand: 'Dettol', variant: '135G-3PK', category: 'Hygiene', merchantId: 'V002', merchantName: 'Dettol Hygiene Products', unit: 'pack', minStock: 40, unitCost: 220, unitSellingPrice: 350, commissionPercent: 8, currentStock: 120 },
    { productId: 'P0005', productLabel: 'Dettol Handwash', brand: 'Dettol', variant: '200ML-ORIGINAL', category: 'Hygiene', merchantId: 'V002', merchantName: 'Dettol Hygiene Products', unit: 'unit', minStock: 30, unitCost: 160, unitSellingPrice: 260, commissionPercent: 8, currentStock: 80 },
    { productId: 'P0006', productLabel: 'Colgate Maximum Cavity Protection', brand: 'Colgate', variant: '150ML', category: 'Oral Care', merchantId: 'V003', merchantName: 'Colgate-Palmolive EA', unit: 'unit', minStock: 60, unitCost: 110, unitSellingPrice: 180, commissionPercent: 10, currentStock: 200 },
    { productId: 'P0007', productLabel: 'Colgate Palmolive Dishwash', brand: 'Colgate', variant: '500ML-LEMON', category: 'Household', merchantId: 'V003', merchantName: 'Colgate-Palmolive EA', unit: 'unit', minStock: 25, unitCost: 190, unitSellingPrice: 300, commissionPercent: 10, currentStock: 60 },
    { productId: 'P0008', productLabel: 'Coca-Cola 500ml', brand: 'Coca-Cola', variant: 'PET-500ML', category: 'Beverages', merchantId: 'V004', merchantName: 'Beverage Central Ltd', unit: 'unit', minStock: 100, unitCost: 45, unitSellingPrice: 65, commissionPercent: 8, currentStock: 500 },
    { productId: 'P0009', productLabel: 'Sprite 300ml Can', brand: 'Sprite', variant: 'CAN-300ML', category: 'Beverages', merchantId: 'V004', merchantName: 'Beverage Central Ltd', unit: 'unit', minStock: 80, unitCost: 40, unitSellingPrice: 60, commissionPercent: 8, currentStock: 300 },
    { productId: 'P0010', productLabel: 'Fresh Milk 500ml', brand: 'Fresh Dairy', variant: '500ML-1PK', category: 'Dairy', merchantId: 'V005', merchantName: 'Fresh Dairy Farmers Coop', unit: 'unit', minStock: 100, unitCost: 55, unitSellingPrice: 80, commissionPercent: 8, currentStock: 150 },
    { productId: 'P0011', productLabel: 'Yoghurt Strawberry', brand: 'Fresh Dairy', variant: '250ML', category: 'Dairy', merchantId: 'V005', merchantName: 'Fresh Dairy Farmers Coop', unit: 'unit', minStock: 60, unitCost: 45, unitSellingPrice: 70, commissionPercent: 8, currentStock: 90 },
    { productId: 'P0012', productLabel: 'Detergent Powder', brand: 'Kwanza', variant: '1KG-LEMON', category: 'Household', merchantId: 'V006', merchantName: 'Kwanza Household Goods', unit: 'unit', minStock: 30, unitCost: 180, unitSellingPrice: 280, commissionPercent: 12, currentStock: 75 },
    { productId: 'P0013', productLabel: 'Eveready Batteries', brand: 'Eveready', variant: 'AA-4PK', category: 'Electronics', merchantId: 'V007', merchantName: 'Eveready East Africa', unit: 'pack', minStock: 40, unitCost: 120, unitSellingPrice: 200, commissionPercent: 10, currentStock: 100 },
    { productId: 'P0014', productLabel: 'Haco Bic Pens', brand: 'Haco', variant: 'BLACK-10PCS', category: 'Stationery', merchantId: 'V008', merchantName: 'Haco Tiger Brands', unit: 'pack', minStock: 50, unitCost: 85, unitSellingPrice: 150, commissionPercent: 10, currentStock: 200 },
    { productId: 'P0015', productLabel: 'Bidco Cooking Oil', brand: 'Bidco', variant: '1L', category: 'Cooking', merchantId: 'V009', merchantName: 'Bidco Africa', unit: 'unit', minStock: 40, unitCost: 260, unitSellingPrice: 380, commissionPercent: 8, currentStock: 110 },
    { productId: 'P0016', productLabel: 'White Bread', brand: 'Kenya Bakeries', variant: '400G-1PK', category: 'Bakery', merchantId: 'V010', merchantName: 'Kenya Bakeries Ltd', unit: 'unit', minStock: 80, unitCost: 30, unitSellingPrice: 50, commissionPercent: 15, currentStock: 200 },
  ]

  for (const p of products) {
    await db.product.upsert({
      where: { productId: p.productId },
      update: {},
      create: { ...p, isActive: true },
    })
  }
  console.log('Products created')

  // Create Inbound Records — matching real format with vendorId, unitPrice, storedBy, Zone-Level-Pallet
  const inboundRecords = [
    { inboundId: 'IN000001', vendorId: 'V001', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', productName: 'Supreme office pens BLUE-50PCs', productId: 'P0001', brand: 'Supreme', variant: 'BLUE-50PCs', qtyIn: 200, unitPrice: 350, inboundValue: 70000, receivedBy: 'U003', storedBy: 'U004', storageLocation: 'A-L1-P1', status: 'received', userComment: null },
    { inboundId: 'IN000002', vendorId: 'V001', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', productName: 'Supreme A4 Copy Paper 80GSM-500SHTS', productId: 'P0002', brand: 'Supreme', variant: '80GSM-500SHTS', qtyIn: 150, unitPrice: 280, inboundValue: 42000, receivedBy: 'U003', storedBy: 'U004', storageLocation: 'A-L2-P2', status: 'received', userComment: null },
    { inboundId: 'IN000003', vendorId: 'V002', merchantId: 'V002', merchantName: 'Dettol Hygiene Products', productName: 'Dettol Antiseptic Soap 135G-3PK', productId: 'P0004', brand: 'Dettol', variant: '135G-3PK', qtyIn: 120, unitPrice: 220, inboundValue: 26400, receivedBy: 'U003', storedBy: 'U003', storageLocation: 'B-L1-P3', status: 'received', userComment: null, expiryDate: new Date('2026-12-31') },
    { inboundId: 'IN000004', vendorId: 'V002', merchantId: 'V002', merchantName: 'Dettol Hygiene Products', productName: 'Dettol Handwash 200ML-ORIGINAL', productId: 'P0005', brand: 'Dettol', variant: '200ML-ORIGINAL', qtyIn: 80, unitPrice: 160, inboundValue: 12800, receivedBy: 'U004', storedBy: 'U004', storageLocation: 'B-L2-P1', status: 'received', userComment: null, expiryDate: new Date('2027-03-15') },
    { inboundId: 'IN000005', vendorId: 'V003', merchantId: 'V003', merchantName: 'Colgate-Palmolive EA', productName: 'Colgate Maximum Cavity Protection 150ML', productId: 'P0006', brand: 'Colgate', variant: '150ML', qtyIn: 200, unitPrice: 110, inboundValue: 22000, receivedBy: 'U003', storedBy: 'U003', storageLocation: 'C-L1-P2', status: 'received', userComment: 'these products do not have the expiry date', expiryDate: null },
    { inboundId: 'IN000006', vendorId: 'V004', merchantId: 'V004', merchantName: 'Beverage Central Ltd', productName: 'Coca-Cola 500ml PET-500ML', productId: 'P0008', brand: 'Coca-Cola', variant: 'PET-500ML', qtyIn: 500, unitPrice: 45, inboundValue: 22500, receivedBy: 'U004', storedBy: 'U004', storageLocation: 'D-L1-P1', status: 'received', userComment: null, expiryDate: new Date('2026-09-30') },
    { inboundId: 'IN000007', vendorId: 'V005', merchantId: 'V005', merchantName: 'Fresh Dairy Farmers Coop', productName: 'Fresh Milk 500ml 500ML-1PK', productId: 'P0010', brand: 'Fresh Dairy', variant: '500ML-1PK', qtyIn: 150, unitPrice: 55, inboundValue: 8250, receivedBy: 'U003', storedBy: 'U004', storageLocation: 'E-L1-P2', status: 'received', userComment: 'Keep refrigerated - short shelf life', expiryDate: new Date('2026-04-20') },
    { inboundId: 'IN000008', vendorId: 'V006', merchantId: 'V006', merchantName: 'Kwanza Household Goods', productName: 'Detergent Powder 1KG-LEMON', productId: 'P0012', brand: 'Kwanza', variant: '1KG-LEMON', qtyIn: 75, unitPrice: 180, inboundValue: 13500, receivedBy: 'U004', storedBy: 'U003', storageLocation: 'F-L1-P1', status: 'received', userComment: 'Plus 13 pouches open', expiryDate: new Date('2027-06-30') },
    { inboundId: 'IN000009', vendorId: 'V009', merchantId: 'V009', merchantName: 'Bidco Africa', productName: 'Bidco Cooking Oil 1L', productId: 'P0015', brand: 'Bidco', variant: '1L', qtyIn: 110, unitPrice: 260, inboundValue: 28600, receivedBy: 'U003', storedBy: 'U004', storageLocation: 'A-L3-P3', status: 'received', userComment: null, expiryDate: new Date('2027-01-15') },
    { inboundId: 'IN000010', vendorId: 'V010', merchantId: 'V010', merchantName: 'Kenya Bakeries Ltd', productName: 'White Bread 400G-1PK', productId: 'P0016', brand: 'Kenya Bakeries', variant: '400G-1PK', qtyIn: 200, unitPrice: 30, inboundValue: 6000, receivedBy: 'U004', storedBy: 'U004', storageLocation: 'B-L3-P2', status: 'received', userComment: 'Daily delivery - consume within 3 days', expiryDate: new Date('2026-04-17') },
  ]

  for (const i of inboundRecords) {
    await db.inboundRecord.upsert({
      where: { inboundId: i.inboundId },
      update: {},
      create: i,
    })
  }
  console.log('Inbound records created')

  // Create Customers
  const customers = [
    { customerId: 'CUS-001', name: 'Jane Wanjiku', contact: '+254722001001', email: 'jane@email.com', address: 'Nairobi, Kilimani', totalOrders: 15, totalOrderValue: 12500 },
    { customerId: 'CUS-002', name: 'John Otieno', contact: '+254722001002', email: 'john@email.com', address: 'Nairobi, Westlands', totalOrders: 8, totalOrderValue: 7800 },
    { customerId: 'CUS-003', name: 'Mary Akinyi', contact: '+254722001003', email: 'mary@email.com', address: 'Mombasa, Nyali', totalOrders: 22, totalOrderValue: 18500 },
    { customerId: 'CUS-004', name: 'Peter Kamau', contact: '+254722001004', address: 'Nakuru, CBD', totalOrders: 5, totalOrderValue: 3200 },
    { customerId: 'CUS-005', name: 'Grace Chebet', contact: '+254722001005', email: 'grace@email.com', address: 'Kisumu, Milimani', totalOrders: 12, totalOrderValue: 9800 },
  ]

  for (const c of customers) {
    await db.customer.upsert({
      where: { customerId: c.customerId },
      update: {},
      create: { ...c, createdBy: 'admin@kwanza.com' },
    })
  }
  console.log('Customers created')

  // Create Outbound Records
  const outboundRecords = [
    { outboundId: 'OUT-001', customerName: 'Jane Wanjiku', customerContact: '+254722001001', customerAddress: 'Nairobi, Kilimani, Galana Rd', productName: 'Supreme office pens BLUE-50PCs', productId: 'P0001', qty: 10, assignedDriver: 'James Mwangi', vehicleNumber: 'KBA 234J', runsheetId: 'RS-20260413-001', stopSequence: 1, actualDeliveredQty: 10, codCollected: 5000, status: 'delivered', dispatchedAt: new Date('2026-04-13T08:00:00'), deliveredAt: new Date('2026-04-13T09:15:00') },
    { outboundId: 'OUT-002', customerName: 'John Otieno', customerContact: '+254722001002', customerAddress: 'Nairobi, Westlands, Waiyaki Way', productName: 'Coca-Cola 500ml PET-500ML', productId: 'P0008', qty: 24, assignedDriver: 'James Mwangi', vehicleNumber: 'KBA 234J', runsheetId: 'RS-20260413-001', stopSequence: 2, actualDeliveredQty: 24, codCollected: 1560, status: 'delivered', dispatchedAt: new Date('2026-04-13T08:00:00'), deliveredAt: new Date('2026-04-13T09:45:00') },
    { outboundId: 'OUT-003', customerName: 'Peter Kamau', customerContact: '+254722001004', customerAddress: 'Nakuru, CBD, Kenyatta Ave', productName: 'Detergent Powder 1KG-LEMON', productId: 'P0012', qty: 5, assignedDriver: 'James Mwangi', vehicleNumber: 'KBA 234J', runsheetId: 'RS-20260413-001', stopSequence: 3, actualDeliveredQty: 4, codCollected: 1120, deliveryNotes: 'Customer rejected 1 unit - damaged packaging', status: 'delivered', dispatchedAt: new Date('2026-04-13T08:00:00'), deliveredAt: new Date('2026-04-13T11:30:00') },
    { outboundId: 'OUT-004', customerName: 'Mary Akinyi', customerContact: '+254722001003', customerAddress: 'Mombasa, Nyali, Links Rd', productName: 'White Bread 400G-1PK', productId: 'P0016', qty: 20, assignedDriver: 'Samuel Kiprop', vehicleNumber: 'KCC 567K', runsheetId: 'RS-20260413-002', stopSequence: 1, actualDeliveredQty: 20, codCollected: 1000, status: 'delivered', dispatchedAt: new Date('2026-04-14T07:30:00'), deliveredAt: new Date('2026-04-14T10:00:00') },
    { outboundId: 'OUT-005', customerName: 'Grace Chebet', customerContact: '+254722001005', customerAddress: 'Kisumu, Milimani, Oginga Odinga Rd', productName: 'Fresh Milk 500ml 500ML-1PK', productId: 'P0010', qty: 15, assignedDriver: 'Samuel Kiprop', vehicleNumber: 'KCC 567K', runsheetId: 'RS-20260413-002', stopSequence: 2, status: 'dispatched', dispatchedAt: new Date('2026-04-14T07:30:00') },
    { outboundId: 'OUT-006', customerName: 'Jane Wanjiku', customerContact: '+254722001001', customerAddress: 'Nairobi, Kilimani, Galana Rd', productName: 'Dettol Handwash 200ML-ORIGINAL', productId: 'P0005', qty: 8, assignedDriver: 'Samuel Kiprop', vehicleNumber: 'KCC 567K', runsheetId: 'RS-20260413-002', stopSequence: 3, status: 'pending' },
    { outboundId: 'OUT-007', customerName: 'John Otieno', customerContact: '+254722001002', customerAddress: 'Nairobi, Westlands', productName: 'Bidco Cooking Oil 1L', productId: 'P0015', qty: 12, status: 'pending' },
    { outboundId: 'OUT-008', customerName: 'Mary Akinyi', customerContact: '+254722001003', customerAddress: 'Mombasa, Nyali', productName: 'Eveready Batteries AA-4PK', productId: 'P0013', qty: 10, status: 'pending' },
  ]

  for (const o of outboundRecords) {
    await db.outboundRecord.upsert({
      where: { outboundId: o.outboundId },
      update: {},
      create: o,
    })
  }
  console.log('Outbound records created')

  // Create Payments
  const payments = [
    { paymentId: 'PAY-001', merchantId: 'V001', merchantName: 'Supreme Office Supplies Ltd', vendorId: 'V001', amount: 70000, paymentMethod: 'M-Pesa', reference: 'QKR3L5M7N2', comment: 'Batch IN000001 payment', recordedBy: 'admin@kwanza.com' },
    { paymentId: 'PAY-002', merchantId: 'V004', merchantName: 'Beverage Central Ltd', vendorId: 'V004', amount: 22500, paymentMethod: 'Bank Transfer', reference: 'BT-20260413-001', recordedBy: 'admin@kwanza.com' },
    { paymentId: 'PAY-003', merchantId: 'V006', merchantName: 'Kwanza Household Goods', vendorId: 'V006', amount: 13500, paymentMethod: 'Cash', reference: 'CSH-20260414-001', recordedBy: 'warehouse@kwanza.com' },
  ]

  for (const p of payments) {
    await db.merchantPayment.upsert({
      where: { paymentId: p.paymentId },
      update: {},
      create: p,
    })
  }
  console.log('Payments created')

  // Create Drivers
  const drivers = [
    { driverId: 'DRV-001', name: 'James Mwangi', phone: '+254733001001', vehicleNumber: 'KBA 234J', licenseNumber: 'DL-45231', status: 'active' },
    { driverId: 'DRV-002', name: 'Samuel Kiprop', phone: '+254733001002', vehicleNumber: 'KCC 567K', licenseNumber: 'DL-67892', status: 'active' },
  ]

  for (const d of drivers) {
    await db.driver.upsert({
      where: { driverId: d.driverId },
      update: {},
      create: d,
    })
  }
  console.log('Drivers created')

  // Create Reconciliation Records
  const reconRecords = [
    { type: 'physical', referenceId: 'P0001', expectedQty: 200, actualQty: 195, variance: -5, varianceReason: 'Minor damage during handling', reconciledBy: 'Warehouse Manager' },
    { type: 'physical', referenceId: 'P0008', expectedQty: 500, actualQty: 500, variance: 0, reconciledBy: 'Admin User' },
    { type: 'cash', referenceId: 'PAY-001', expectedQty: 70000, actualQty: 70000, variance: 0, reconciledBy: 'Admin User' },
  ]

  for (const r of reconRecords) {
    await db.reconciliationRecord.create({ data: r })
  }
  console.log('Reconciliation records created')
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
