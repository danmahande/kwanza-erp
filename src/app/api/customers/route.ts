import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'
import { normalizePhone } from '@/lib/risk-engine'

/**
 * Customers API — Production-hardened
 *
 * Customers are auto-created when orders are placed (via /api/order-processing).
 * This API provides read, edit, and delete capabilities, plus a 360-degree
 * view that links the Customer table to the CustomerRiskProfile table.
 *
 * The Customer table and CustomerRiskProfile table are separate by design:
 * - Customer: identity (name, phone, email, address, order stats)
 * - CustomerRiskProfile: fraud scoring (COD refusals, risk score, blocklist)
 *
 * They're linked by normalized phone number. Every customer gets a fresh
 * risk profile (score 0) when created, and the system grades them over time
 * based on delivery outcomes.
 *
 * DELETE preserves the CustomerRiskProfile — if someone re-registers with
 * the same phone, their fraud history is still there.
 */

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const search = req.nextUrl.searchParams.get('search') || ''

    const customers = await db.customer.findMany({
      where: search ? {
        OR: [
          { name: { contains: search } },
          { contact: { contains: search } },
          { customerId: { contains: search } },
          { email: { contains: search } },
        ],
      } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // Enrich with risk profile data (linked by normalized phone)
    const phoneNumbers = customers.map(c => normalizePhone(c.contact)).filter(Boolean)
    const riskProfiles = phoneNumbers.length > 0
      ? await db.customerRiskProfile.findMany({
          where: { customerContact: { in: phoneNumbers } },
          select: {
            customerContact: true,
            customerType: true,
            codRefusals90d: true,
            codDelivered90d: true,
            avgAOV: true,
            isBlocklisted: true,
            totalOrders: true,
          },
        })
      : []

    // Also check blocklist for each phone
    const blocklistedPhones = phoneNumbers.length > 0
      ? await db.fraudBlocklist.findMany({
          where: { phone: { in: phoneNumbers }, isActive: true },
          select: { phone: true, reason: true },
        })
      : []

    const riskMap = new Map(riskProfiles.map(r => [r.customerContact, r]))
    const blocklistMap = new Map(blocklistedPhones.map(b => [b.phone, b]))

    const enriched = customers.map(c => {
      const phone = normalizePhone(c.contact)
      const risk = riskMap.get(phone)
      const blocklisted = blocklistMap.get(phone)
      return {
        ...c,
        riskProfile: risk || null,
        isBlocklisted: !!blocklisted,
        blocklistReason: blocklisted?.reason || null,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.contact) {
      return NextResponse.json({ error: 'contact (phone) is required' }, { status: 400 })
    }

    // Check phone uniqueness BEFORE creating (friendly 409, not a 500)
    const existing = await db.customer.findUnique({
      where: { contact: body.contact },
      select: { customerId: true, name: true },
    })
    if (existing) {
      return NextResponse.json({
        error: 'Phone number already registered',
        details: `Phone "${body.contact}" is already registered to customer ${existing.name} (${existing.customerId}).`,
        code: 'PHONE_DUPLICATE',
        existingCustomerId: existing.customerId,
      }, { status: 409 })
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — create customer + create risk profile
    // ═══════════════════════════════════════════════════════════════

    const custTs = Date.now().toString(36).toUpperCase()
    const custRand = Math.random().toString(36).slice(2, 5).toUpperCase()
    const customerId = `CUS-${custTs}-${custRand}`
    const normalizedPhone = normalizePhone(body.contact)

    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          ...body,
          customerId,
          totalOrders: body.totalOrders || 0,
          totalOrderValue: body.totalOrderValue || 0,
        },
      })

      // Create a fresh CustomerRiskProfile (score 0, fresh start)
      // — but only if one doesn't already exist (preserves fraud history
      // if someone was deleted and re-registered)
      if (normalizedPhone) {
        const existingProfile = await tx.customerRiskProfile.findUnique({
          where: { customerContact: normalizedPhone },
        })
        if (!existingProfile) {
          await tx.customerRiskProfile.create({
            data: {
              customerContact: normalizedPhone,
              customerType: 'retail',
              totalOrders: 0,
              codRefusals90d: 0,
              codDelivered90d: 0,
              distinctAddressesUsed: 0,
              firstOrderDate: new Date(),
              lastOrderDate: new Date(),
              avgAOV: 0,
              isBlocklisted: false,
            },
          })
        }
      }

      return created
    })

    // Check if phone is blocklisted (warn, don't block)
    let blocklistWarning: string | null = null
    if (normalizedPhone) {
      const blocklisted = await db.fraudBlocklist.findUnique({
        where: { phone: normalizedPhone },
        select: { reason: true, isActive: true },
      })
      if (blocklisted?.isActive) {
        blocklistWarning = `WARNING: This customer's phone (${body.contact}) is on the fraud blocklist: "${blocklisted.reason}". Orders from this customer will be hard-blocked at intake.`
      }
    }

    await logAudit({
      action: 'CUSTOMER_CREATED',
      module: 'customers',
      entityId: customerId,
      details: `Created customer ${customerId}: ${body.name} (${body.contact}). Risk profile initialized.${blocklistWarning ? ' BLOCKLIST WARNING: ' + blocklistWarning : ''}`,
    })

    return NextResponse.json({
      ...customer,
      blocklistWarning,
    }, { status: 201 })
  } catch (error) {
    console.error('Customer create error:', error)
    return NextResponse.json({
      error: 'Failed to create customer',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// PUT — edit customer details. If phone changes, the CustomerRiskProfile
// link changes (the old profile stays for the old phone; a new profile is
// created for the new phone if one doesn't exist).
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // If phone is being changed, check uniqueness
    if (data.contact && data.contact !== existing.contact) {
      const phoneOwner = await db.customer.findUnique({
        where: { contact: data.contact },
        select: { id: true, name: true, customerId: true },
      })
      if (phoneOwner && phoneOwner.id !== id) {
        return NextResponse.json({
          error: 'Phone number already registered',
          details: `Phone "${data.contact}" is already registered to customer ${phoneOwner.name} (${phoneOwner.customerId}).`,
          code: 'PHONE_DUPLICATE',
        }, { status: 409 })
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION — update customer + create risk profile for new phone
    // ═══════════════════════════════════════════════════════════════

    const phoneChanged = data.contact && data.contact !== existing.contact

    const customer = await db.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      })

      // If phone changed, create a fresh risk profile for the new phone
      // (the old profile stays for the old phone — preserves fraud history)
      if (phoneChanged) {
        const newPhone = normalizePhone(data.contact)
        if (newPhone) {
          const existingProfile = await tx.customerRiskProfile.findUnique({
            where: { customerContact: newPhone },
          })
          if (!existingProfile) {
            await tx.customerRiskProfile.create({
              data: {
                customerContact: newPhone,
                customerType: 'retail',
                totalOrders: 0,
                codRefusals90d: 0,
                codDelivered90d: 0,
                distinctAddressesUsed: 0,
                firstOrderDate: new Date(),
                lastOrderDate: new Date(),
                avgAOV: 0,
                isBlocklisted: false,
              },
            })
          }
        }
      }

      return updated
    })

    // Determine what changed for audit
    const changes: string[] = []
    if (data.name && data.name !== existing.name) changes.push(`name: ${existing.name} → ${data.name}`)
    if (data.contact && data.contact !== existing.contact) changes.push(`phone: ${existing.contact} → ${data.contact}`)
    if (data.email !== undefined && data.email !== existing.email) changes.push(`email changed`)
    if (data.address !== undefined && data.address !== existing.address) changes.push(`address changed`)
    if (changes.length === 0) changes.push(Object.keys(data).join(', '))

    await logAudit({
      action: 'CUSTOMER_UPDATED',
      module: 'customers',
      entityId: existing.customerId,
      details: `Customer ${existing.name} (${existing.customerId}): ${changes.join(', ')}`,
    })

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Customer update error:', error)
    return NextResponse.json({
      error: 'Failed to update customer',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE — blocks if customer has orders (can't delete history).
// Does NOT delete the CustomerRiskProfile — preserves fraud history.
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Block deletion if customer has orders — can't delete history
    if (existing.totalOrders > 0) {
      return NextResponse.json({
        error: `Cannot delete customer "${existing.name}" — has ${existing.totalOrders} order(s)`,
        hint: 'This customer has order history. Deleting would lose all records. Edit the customer instead if you need to correct their details.',
        code: 'HAS_ORDERS',
        totalOrders: existing.totalOrders,
      }, { status: 409 })
    }

    // Delete the customer (but NOT the CustomerRiskProfile — it preserves
    // fraud history in case someone re-registers with the same phone)
    await db.customer.delete({ where: { id } })

    await logAudit({
      action: 'CUSTOMER_DELETED',
      module: 'customers',
      entityId: existing.customerId,
      details: `Deleted customer ${existing.name} (${existing.customerId}). No orders. CustomerRiskProfile preserved for fraud history.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Customer delete error:', error)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
