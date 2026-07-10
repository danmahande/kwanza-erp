import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrementStorageLiability } from '@/lib/storage-liability'
import { logAudit } from '@/lib/audit'
import { formatCurrency } from '@/lib/currency'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

/**
 * Order Processing API — Workflow 2: Order → Outbound Cascade
 *
 * Creating an OrderProcessing row also spawns an OutboundRecord so the warehouse
 * can pick/pack/ship without re-entering data. This is the "forward-moving"
 * workflow: every order automatically becomes an outbound + stock decrement +
 * storage-liability decrement in one cascade.
 *
 * Tracking number format: {prefix}-{orderNumber}-01
 *   prefix derived from merchant.deliveryType:
 *     "self-delivery" → SD (merchant fulfils themselves; we just coordinate)
 *     "drop-ship"     → DS (supplier delivered to warehouse on demand)
 *     "consignment"   → CN (held in our warehouse on consignment)
 *
 * Customer auto-creation: if the customer doesn't exist, we create them.
 * If they do, we increment their totalOrders / totalOrderValue.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const orderProcessingRecords = await db.orderProcessing.findMany({
      where: {
        OR: [
          { orderId: { contains: search } },
          { orderNumber: { contains: search } },
          { customerName: { contains: search } },
          { trackingNumber: { contains: search } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(orderProcessingRecords)
  } catch (error) {
    console.error('Error fetching order processing records:', error)
    return NextResponse.json({ error: 'Failed to fetch order processing records' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const count = await db.orderProcessing.count()
    const orderId = `OP-${String(count + 1).padStart(4, '0')}`

    // Generate order number with DS prefix (this is the ORDER number prefix — separate from the tracking number)
    const orderNumber = `DS-${String(count + 1).padStart(3, '0')}`

    // Create or update customer based on the order
    // P7: Match by phone first (most unique), then email, then name
    // This prevents two different "John"s from being merged into one record
    let customer = null
    if (body.customerContact) {
      customer = await db.customer.findUnique({
        where: { contact: body.customerContact },
      })
    }
    if (!customer && body.customerEmail) {
      customer = await db.customer.findFirst({
        where: { email: body.customerEmail },
      })
    }
    // Only match by name if no phone or email provided
    if (!customer && !body.customerContact && !body.customerEmail && body.customerName) {
      customer = await db.customer.findFirst({
        where: { name: body.customerName },
      })
    }

    if (!customer) {
      // Generate customer ID — timestamp + random to avoid race condition
      // (the old count+1 approach caused duplicate IDs on concurrent POSTs)
      const custTs = Date.now().toString(36).toUpperCase()
      const custRand = Math.random().toString(36).slice(2, 5).toUpperCase()
      const customerId = `CUS-${custTs}-${custRand}`

      customer = await db.customer.create({
        data: {
          customerId,
          name: body.customerName,
          contact: body.customerContact || '',
          email: body.customerEmail || '',
          address: body.customerAddress || '',
          totalOrders: 1,
          totalOrderValue: body.totalAmount || 0,
          createdBy: body.createdBy || _user.name,
        },
      })

      // Create a fresh CustomerRiskProfile (score 0, fresh start)
      // The system grades them over time based on delivery outcomes.
      // But only if one doesn't already exist — preserves fraud history
      // if someone was deleted and re-registered with the same phone.
      const { normalizePhone } = await import('@/lib/risk-engine')
      const normalizedPhone = normalizePhone(body.customerContact || '')
      if (normalizedPhone) {
        const existingProfile = await db.customerRiskProfile.findUnique({
          where: { customerContact: normalizedPhone },
        })
        if (!existingProfile) {
          await db.customerRiskProfile.create({
            data: {
              customerContact: normalizedPhone,
              customerType: 'retail',
              totalOrders: 1,
              codRefusals90d: 0,
              codDelivered90d: 0,
              distinctAddressesUsed: 0,
              firstOrderDate: new Date(),
              lastOrderDate: new Date(),
              avgAOV: body.totalAmount || 0,
              isBlocklisted: false,
            },
          })
        }
      }

      await logAudit({
        action: 'CUSTOMER_CREATED',
        module: 'customers',
        entityId: customerId,
        details: `Auto-created customer ${customerId}: ${body.customerName} (${body.customerContact}). Risk profile initialized.`,
      })
    } else {
      // Update existing customer's order statistics
      await db.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          totalOrderValue: { increment: body.totalAmount || 0 },
        },
      })
    }

    // ===========================================================================
    // Workflow 2: Order Processing → Outbound cascade (forward-moving workflow)
    // ===========================================================================
    const outboundCount = await db.outboundRecord.count()
    const outboundId = `OUT${String(outboundCount + 1).padStart(6, '0')}`

    // Look up the merchant (vendor) to set deliveryType + merchantName on the outbound record
    let merchant: { merchantId: string; businessName: string; deliveryType: string | null; isOnHold: boolean; holdReason: string | null } | null = null
    if (body.merchantId) {
      merchant = await db.merchant.findUnique({
        where: { merchantId: body.merchantId },
        select: { merchantId: true, businessName: true, deliveryType: true, isOnHold: true, holdReason: true },
      })

      // ── Operational Hold enforcement (Workflow 2 gate) ──
      if (merchant?.isOnHold) {
        await logAudit({
          action: 'BLOCK',
          module: 'order-processing',
          entityId: body.merchantId,
          details: `Blocked new order for ${merchant.businessName} — merchant on hold: ${merchant.holdReason || 'no reason'}`,
        })
        return NextResponse.json({
          error: 'Merchant on hold',
          reason: merchant.holdReason || 'Overdue balance / dispute',
          merchantName: merchant.businessName,
          code: 'MERCHANT_ON_HOLD',
        }, { status: 409 })
      }
    }

    const deliveryType = merchant?.deliveryType || body.deliveryType || 'self-delivery'
    // Tracking number prefix is derived from deliveryType:
    //   self-delivery → SD (merchant fulfils themselves)
    //   drop-ship     → DS (supplier delivered to warehouse on demand)
    //   consignment   → CN (held on consignment)
    const trackingPrefix = deliveryType === 'self-delivery' ? 'SD'
      : deliveryType === 'drop-ship' ? 'DS'
      : deliveryType === 'consignment' ? 'CN'
      : 'WH' // fallback
    const trackingNumber = `${trackingPrefix}-${orderNumber}-01`

    // Find the product so we can set fields on the outbound record
    let product: {
      merchantId: string
      merchantName: string
      unitSellingPrice: number
      productId: string
      productLabel: string
      brand: string | null
      variant: string | null
    } | null = null
    if (body.productId) {
      product = await db.product.findUnique({
        where: { productId: body.productId },
        select: {
          merchantId: true,
          merchantName: true,
          unitSellingPrice: true,
          productId: true,
          productLabel: true,
          brand: true,
          variant: true,
        },
      })
    }

    const qty = parseInt(String(body.qty || 1)) || 1
    const unitSellingPrice = product?.unitSellingPrice || body.unitSellingPrice || 0
    const saleAmount = qty * unitSellingPrice

    // F4: Validate product belongs to the selected merchant
    if (product && body.merchantId && product.merchantId !== body.merchantId) {
      return NextResponse.json({
        error: 'Product-merchant mismatch',
        details: `Product "${product.productLabel}" belongs to merchant ${product.merchantId}, but the order is for merchant ${body.merchantId}`,
      }, { status: 400 })
    }

    const orderProcessing = await db.orderProcessing.create({
      data: {
        orderId,
        orderNumber,
        customerId: customer.customerId,
        customerName: body.customerName || '',
        customerInfo: body.customerInfo || `${body.customerName} | ${body.customerContact || ''} | ${body.customerEmail || ''} | ${body.customerAddress || ''}`,
        totalAmount: body.totalAmount || saleAmount,
        paymentMethod: body.paymentMethod || 'Cash',
        status: body.status || 'new_order',
        trackingNumber,
        invoiceGenerated: false,
        createdBy: body.createdBy || _user.name,
      },
    })

    // Spawn the linked OutboundRecord (cascade).
    // Non-blocking try/catch — if the OutboundRecord creation fails, the order still exists so the user can recover.
    try {
      const newOutbound = await db.outboundRecord.create({
        data: {
          outboundId,
          orderNumber,
          trackingNumber,
          userId: body.createdBy || null,
          vendorId: merchant?.merchantId || body.merchantId || null,
          businessName: merchant?.businessName || product?.merchantName || body.merchantName || null,
          customerName: body.customerName || '',
          customerContact: body.customerContact || '',
          customerEmail: body.customerEmail || null,
          customerAddress: body.customerAddress || null,
          productName: body.productName || product?.productLabel || '',
          productId: body.productId || product?.productId || '',
          brand: product?.brand || null,
          variant: product?.variant || null,
          qty,
          unitSellingPrice,
          saleAmount,
          // P8: Self-delivery orders get 'self_delivery' status — they don't need
          // warehouse picking/packing, so they shouldn't appear in the warehouse queue.
          // The merchant fulfils them directly. Warehouse can still track them.
          status: deliveryType === 'self-delivery' ? 'self_delivery' : 'pending',
        },
      })

      // Risk Module hook: score the order on creation.
      // Non-blocking — if scoring fails, the order is still saved (it just
      // won't have a RiskScore until manually re-scored). Scoring involves
      // DB queries for customer history, address reuse, blocklist match, etc.
      // Cash = COD path; everything else (M-Pesa, Airtel Money, Bank) = prepaid.
      if (deliveryType !== 'self-delivery') {
        const paymentPath = (body.paymentMethod === 'Cash' || !body.paymentMethod) ? 'cod' : 'prepaid'
        try {
          // Update customer risk profile (creates if first-time)
          const { updateCustomerProfile } = await import('@/lib/risk-db')
          await updateCustomerProfile(body.customerContact || '', 'order_created', saleAmount)
          // Trigger scoring via internal API call (preserves auth context)
          const origin = new URL(req.url).origin
          fetch(`${origin}/api/risk/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
            body: JSON.stringify({ outboundId: newOutbound.id, paymentPath }),
          }).catch(err => console.error('Risk score trigger failed (non-blocking):', err))
        } catch (riskErr) {
          console.error('Risk profile update failed (non-blocking):', riskErr)
        }
      }

      // Workflow 1 cascade: decrement storage liability for these units (FIFO)
      // Only relevant if the merchant stores stock with us (drop-ship on-demand
      // OR consignment). Self-delivery means we never touch the stock, so no
      // storage liability to decrement.
      if (merchant && body.productId && deliveryType !== 'self-delivery') {
        await decrementStorageLiability({
          merchantId: merchant.merchantId,
          productId: body.productId,
          qtyToRemove: qty,
        })
      }

      // Workflow 1 cascade: decrement product stock
      // (skip for self-delivery since we don't hold the stock)
      if (body.productId && deliveryType !== 'self-delivery') {
        try {
          // P3: Check sufficient stock before decrementing
          const product = await db.product.findUnique({
            where: { productId: body.productId },
            select: { currentStock: true, productLabel: true },
          })
          if (product && product.currentStock < qty) {
            return NextResponse.json({
              error: 'Insufficient stock',
              details: `${product.productLabel}: only ${product.currentStock} units available, but order requires ${qty}`,
              productId: body.productId,
              available: product.currentStock,
              requested: qty,
            }, { status: 409 })
          }
          await db.product.update({
            where: { productId: body.productId },
            data: { currentStock: { decrement: qty } },
          })
        } catch (stockErr) {
          console.error('Stock decrement failed (non-blocking):', stockErr)
        }
      }
    } catch (cascadeErr) {
      console.error('Outbound cascade failed (non-blocking):', cascadeErr)
    }

    await logAudit({
      action: 'CREATE',
      module: 'order_processing',
      entityId: orderNumber,
      details: `Created order ${orderNumber} for customer ${body.customerName} (${formatCurrency(body.totalAmount || 0)})`,
    })

    // F: If body.items is provided, create line items + spawn outbound for each product
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        if (!item.productId || !item.qty) continue

        // Look up product
        const lineProduct = await db.product.findUnique({
          where: { productId: item.productId },
          select: { productLabel: true, brand: true, variant: true, unitSellingPrice: true, merchantId: true, currentStock: true },
        })
        if (!lineProduct) continue

        const lineQty = parseInt(String(item.qty)) || 1
        const linePrice = item.unitSellingPrice || lineProduct.unitSellingPrice
        const lineTotal = lineQty * linePrice

        // Create line item record
        await db.orderLineItem.create({
          data: {
            orderId: orderId,
            orderNumber,
            productId: item.productId,
            productName: lineProduct.productLabel,
            brand: lineProduct.brand || null,
            variant: lineProduct.variant || null,
            qty: lineQty,
            unitSellingPrice: linePrice,
            lineTotal,
          },
        })

        // Create outbound record for this line item (only for non-self-delivery)
        if (deliveryType !== 'self-delivery') {
          const outboundCount = await db.outboundRecord.count()
          const lineOutboundId = `OUT-${String(outboundCount + 1).padStart(3, '0')}`
          const lineTracking = `${trackingPrefix}-${orderNumber}-${String(body.items.indexOf(item) + 1).padStart(2, '0')}`

          // Check stock
          if (lineProduct.currentStock < lineQty) {
            return NextResponse.json({
              error: 'Insufficient stock',
              details: `${lineProduct.productLabel}: only ${lineProduct.currentStock} units available, but order requires ${lineQty}`,
            }, { status: 409 })
          }

          await db.outboundRecord.create({
            data: {
              outboundId: lineOutboundId,
              orderNumber,
              trackingNumber: lineTracking,
              userId: body.createdBy || null,
              vendorId: merchant?.merchantId || body.merchantId || null,
              businessName: merchant?.businessName || lineProduct.merchantId || null,
              customerName: body.customerName || '',
              customerContact: body.customerContact || '',
              customerEmail: body.customerEmail || null,
              customerAddress: body.customerAddress || null,
              productName: lineProduct.productLabel,
              productId: item.productId,
              brand: lineProduct.brand || null,
              variant: lineProduct.variant || null,
              qty: lineQty,
              unitSellingPrice: linePrice,
              saleAmount: lineTotal,
              status: deliveryType === 'self-delivery' ? 'self_delivery' : 'pending',
            },
          })

          // Decrement stock
          await db.product.update({
            where: { productId: item.productId },
            data: { currentStock: { decrement: lineQty } },
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json(orderProcessing, { status: 201 })
  } catch (error) {
    console.error('Error creating order processing record:', error)
    return NextResponse.json({ error: 'Failed to create order processing record' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    const orderProcessing = await db.orderProcessing.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })

    // Workflow 2 cascade: when order status changes, mirror to the linked OutboundRecord
    if (data.status && orderProcessing.orderNumber) {
      try {
        await db.outboundRecord.updateMany({
          where: { orderNumber: orderProcessing.orderNumber },
          data: { status: data.status },
        })
      } catch (cascadeErr) {
        console.error('Outbound status cascade failed (non-blocking):', cascadeErr)
      }
    }

    return NextResponse.json(orderProcessing)
  } catch (error) {
    console.error('Error updating order processing record:', error)
    return NextResponse.json({ error: 'Failed to update order processing record' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // Find the order first so we can cascade
    const order = await db.orderProcessing.findUnique({ where: { id: id! } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Restore product stock + delete linked outbound record
    if (order.orderNumber) {
      const outbound = await db.outboundRecord.findFirst({
        where: { orderNumber: order.orderNumber },
        select: { id: true, productId: true, qty: true },
      })
      if (outbound) {
        // Restore stock
        if (outbound.productId && outbound.qty) {
          try {
            await db.product.update({
              where: { productId: outbound.productId },
              data: { currentStock: { increment: outbound.qty } },
            })
          } catch (e) { console.error('Stock restore failed (non-blocking):', e) }
        }
        // Delete the outbound record
        await db.outboundRecord.delete({ where: { id: outbound.id } }).catch(() => {})
      }
    }

    // Decrement customer order count
    if (order.customerId) {
      try {
        await db.customer.update({
          where: { customerId: order.customerId },
          data: {
            totalOrders: { decrement: 1 },
            totalOrderValue: { decrement: order.totalAmount || 0 },
          },
        })
      } catch (e) { console.error('Customer update failed (non-blocking):', e) }
    }

    await db.orderProcessing.delete({ where: { id: id! } })

    await logAudit({
      action: 'DELETE',
      module: 'order_processing',
      entityId: order.orderNumber,
      details: `Deleted order ${order.orderNumber} — stock restored, outbound deleted, customer counts decremented`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order processing record:', error)
    return NextResponse.json({ error: 'Failed to delete order processing record' }, { status: 500 })
  }
}
