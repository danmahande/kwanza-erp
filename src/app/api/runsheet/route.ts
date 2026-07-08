import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, type AuthUser } from '@/lib/auth-api'

// GET /api/runsheet — list all runsheets + unassigned orders
export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const search = req.nextUrl.searchParams.get('search') || ''
    const statusFilter = req.nextUrl.searchParams.get('status') || ''

    // Get all outbound records that belong to a runsheet
    const allWithRunsheet = await db.outboundRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    const runsheetRecords = allWithRunsheet.filter(r => r.runsheetId !== null)

    // Apply search filter if provided
    const filtered = search
      ? runsheetRecords.filter(r =>
          (r.assignedDriver?.toLowerCase().includes(search.toLowerCase())) ||
          (r.customerName?.toLowerCase().includes(search.toLowerCase())) ||
          (r.runsheetId?.toLowerCase().includes(search.toLowerCase()))
        )
      : runsheetRecords

    // Group by runsheetId
    const grouped = new Map<string, typeof filtered>()
    for (const r of filtered) {
      const key = r.runsheetId!
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }

    // Build runsheet summaries
    const allSheets = Array.from(grouped.entries()).map(([id, stops]) => {
      stops.sort((a, b) => (a.stopSequence ?? 999) - (b.stopSequence ?? 999))
      const totalExpected = stops.reduce((s, r) => s + r.qty, 0)
      const totalDelivered = stops.reduce((s, r) => s + (r.actualDeliveredQty ?? 0), 0)
      const totalCOD = stops.reduce((s, r) => s + (r.codCollected ?? 0), 0)
      const delivered = stops.filter(r => r.status === 'delivered').length
      const failed = stops.filter(r => r.status === 'failed').length
      const cancelled = stops.filter(r => r.cancellationReason !== null).length
      const rescheduled = stops.filter(r => r.nextAttemptDate !== null && r.status !== 'delivered' && r.status !== 'cancelled').length
      const pending = stops.filter(r => r.status === 'pending' || r.status === 'dispatched').length
      const dispatched = stops.filter(r => r.status === 'dispatched').length

      let rsStatus: string
      const activeStops = stops.filter(r => !r.cancellationReason)
      if (activeStops.length === 0) rsStatus = 'completed'
      else if (activeStops.every(r => r.status === 'delivered' || r.status === 'failed')) rsStatus = 'completed'
      else if (dispatched + delivered + failed > 0) rsStatus = 'in_progress'
      else rsStatus = 'draft'

      return {
        runsheetId: id,
        driver: stops[0].assignedDriver,
        vehicleNumber: stops[0].vehicleNumber,
        date: stops[0].dispatchedAt || stops[0].createdAt,
        totalStops: stops.length,
        delivered,
        failed,
        cancelled,
        rescheduled,
        pending,
        dispatched,
        status: rsStatus,
        totalExpected,
        totalDelivered,
        totalCOD,
        stops,
      }
    })

    // Filter by status if provided
    const runsheets = statusFilter
      ? allSheets.filter(r => r.status === statusFilter)
      : allSheets

    runsheets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Get unassigned orders (no runsheetId, not cancelled)
    const allUnassigned = await db.outboundRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
    const unassigned = allUnassigned.filter(r => r.runsheetId === null && r.status === 'packed' && !r.cancellationReason)

    return NextResponse.json({ runsheets, unassigned })
  } catch (error) {
    console.error('Runsheet fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch runsheets' }, { status: 500 })
  }
}

// POST /api/runsheet — create runsheet from packed orders
export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { driver, vehicleNumber, outboundIds, notes } = body

    if (!driver || !outboundIds || outboundIds.length === 0) {
      return NextResponse.json({ error: 'Rider and at least one order are required' }, { status: 400 })
    }

    // P5: Validate driver exists and is active
    const driverRecord = await db.driver.findUnique({
      where: { driverId: driver },
      select: { driverId: true, name: true, status: true },
    })
    if (!driverRecord) {
      return NextResponse.json({ error: `Driver ${driver} not found` }, { status: 400 })
    }
    if (driverRecord.status !== 'active') {
      return NextResponse.json({ error: `Driver ${driverRecord.name} is ${driverRecord.status}, cannot assign runsheet` }, { status: 400 })
    }

    // P4+P6: Fetch all selected orders and validate they're ready for dispatch
    const orders = await db.outboundRecord.findMany({
      where: { id: { in: outboundIds } },
      select: { id: true, outboundId: true, orderNumber: true, status: true, runsheetId: true },
    })

    // Check for orders not found
    if (orders.length !== outboundIds.length) {
      const found = new Set(orders.map(o => o.id))
      const missing = outboundIds.filter((id: string) => !found.has(id))
      return NextResponse.json({ error: `Orders not found: ${missing.join(', ')}` }, { status: 400 })
    }

    // P4: Check for orders already assigned to a runsheet
    const alreadyAssigned = orders.filter(o => o.runsheetId !== null)
    if (alreadyAssigned.length > 0) {
      return NextResponse.json({
        error: `${alreadyAssigned.length} order(s) already assigned to a runsheet`,
        details: alreadyAssigned.map(o => `${o.outboundId} → ${o.runsheetId}`),
      }, { status: 400 })
    }

    // P6: Check that all orders are in 'packed' status (ready for dispatch)
    const notPacked = orders.filter(o => o.status !== 'packed')
    if (notPacked.length > 0) {
      return NextResponse.json({
        error: `${notPacked.length} order(s) are not packed yet — must be 'packed' before assigning to a runsheet`,
        details: notPacked.map(o => `${o.outboundId} (status: ${o.status})`),
      }, { status: 400 })
    }

    // Generate runsheet ID
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const count = await db.outboundRecord.count({ where: { runsheetId: { startsWith: `RS-${today}` } } })
    const runsheetId = `RS-${today}-${String(count + 1).padStart(3, '0')}`

    // P2: Assign orders to runsheet — status stays 'packed' (don't skip to dispatched)
    // The rider dispatches by scanning, which moves packed → dispatched properly
    for (let i = 0; i < outboundIds.length; i++) {
      await db.outboundRecord.update({
        where: { id: outboundIds[i] },
        data: {
          runsheetId,
          stopSequence: i + 1,
          assignedDriver: driver,
          vehicleNumber: vehicleNumber || null,
          // Keep status as 'packed' — rider scans to dispatch, not runsheet creation
          deliveryNotes: notes ? `Trip notes: ${notes}` : null,
        },
      })
    }

    return NextResponse.json({ runsheetId, message: `Runsheet ${runsheetId} created with ${outboundIds.length} stops for ${driverRecord.name}` }, { status: 201 })
  } catch (error) {
    console.error('Runsheet create error:', error)
    return NextResponse.json({ error: 'Failed to create runsheet' }, { status: 500 })
  }
}

// PUT /api/runsheet — update stop status, handle reschedule + cancel
export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, actualDeliveredQty, codCollected, deliveryNotes, stopSequence } = body

    // ── CANCEL ORDER ──
    if (body.action === 'cancel') {
      const { reason, cancelledBy } = body
      if (!reason || !cancelledBy) {
        return NextResponse.json({ error: 'Cancellation reason and user are required' }, { status: 400 })
      }

      const record = await db.outboundRecord.findUnique({ where: { id } })
      if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
      if (record.cancellationReason) {
        return NextResponse.json({ error: 'Order already cancelled' }, { status: 400 })
      }

      const updated = await db.outboundRecord.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledBy,
        },
      })

      return NextResponse.json({ success: true, record: updated, message: 'Order cancelled successfully' })
    }

    // ── RESCHEDULE (delivery failed + retry) ──
    if (body.action === 'reschedule') {
      const { failReason, nextAttemptDate, performedBy } = body
      if (!failReason || !nextAttemptDate) {
        return NextResponse.json({ error: 'Failure reason and next attempt date are required' }, { status: 400 })
      }

      const record = await db.outboundRecord.findUnique({ where: { id } })
      if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
      if (record.cancellationReason) {
        return NextResponse.json({ error: 'Cannot reschedule a cancelled order' }, { status: 400 })
      }

      const newAttemptCount = (record.deliveryAttempts ?? 0) + 1
      const isMaxReached = newAttemptCount >= (record.maxAttempts ?? 5)

      const updated = await db.outboundRecord.update({
        where: { id },
        data: {
          deliveryAttempts: newAttemptCount,
          lastAttemptReason: failReason,
          lastAttemptDate: new Date(),
          nextAttemptDate: isMaxReached ? null : new Date(nextAttemptDate),
          status: isMaxReached ? 'failed' : 'dispatched',
          deliveryNotes: `${failReason}${record.deliveryNotes ? ' | ' + record.deliveryNotes : ''}`,
        },
      })

      // Log item event if we have inventory items
      try {
        const items = await db.inventoryItem.findMany({ where: { outboundId: record.outboundId } })
        for (const item of items) {
          await db.itemEvent.create({
            data: {
              eventId: `EVT-${Date.now()}-${item.itemId.slice(-4)}`,
              itemId: item.itemId,
              eventType: 'DELIVERY_FAILED',
              description: `Attempt ${newAttemptCount}: ${failReason}`,
              performedBy: performedBy || record.assignedDriver || _user.name,
              runsheetId: record.runsheetId,
              outboundId: record.outboundId,
              reason: failReason,
              previousStatus: item.status,
              newStatus: isMaxReached ? 'RETURNED_TO_WAREHOUSE' : 'IN_TRANSIT',
            },
          })
          if (isMaxReached) {
            await db.inventoryItem.update({
              where: { id: item.id },
              data: { status: 'RETURNED_TO_WAREHOUSE', finalOutcome: 'failed_permanent', attemptCount: newAttemptCount },
            })
          } else {
            await db.inventoryItem.update({
              where: { id: item.id },
              data: { status: 'IN_TRANSIT', attemptCount: newAttemptCount, nextAttemptDate: new Date(nextAttemptDate) },
            })
          }
        }
      } catch {
        // InventoryItem table may not exist yet — non-blocking
      }

      return NextResponse.json({
        success: true,
        record: updated,
        message: isMaxReached
          ? `Maximum attempts (${newAttemptCount}/${record.maxAttempts ?? 5}) reached. Order marked as permanently failed.`
          : `Delivery failed (attempt ${newAttemptCount}/${record.maxAttempts ?? 5}). Rescheduled for ${new Date(nextAttemptDate).toLocaleDateString()}.`,
        isMaxReached,
        attemptCount: newAttemptCount,
        maxAttempts: record.maxAttempts ?? 5,
      })
    }

    // ── STANDARD UPDATE (backward compatible) ──
    const updateData: { [key: string]: unknown } = {}
    if (actualDeliveredQty !== undefined) {
      updateData.actualDeliveredQty = actualDeliveredQty
      updateData.deliveredAt = new Date()
      const record = await db.outboundRecord.findUnique({ where: { id } })
      if (record) {
        updateData.status = 'delivered'
      }
    }
    if (codCollected !== undefined) updateData.codCollected = codCollected
    if (deliveryNotes !== undefined) updateData.deliveryNotes = deliveryNotes
    if (stopSequence !== undefined) updateData.stopSequence = stopSequence

    if (body.status) updateData.status = body.status
    if (body.status === 'failed') updateData.deliveredAt = null

    const record = await db.outboundRecord.update({ where: { id }, data: updateData })
    return NextResponse.json(record)
  } catch (error) {
    console.error('Runsheet update error:', error)
    return NextResponse.json({ error: 'Failed to update stop' }, { status: 500 })
  }
}

// DELETE — delete a runsheet and unassign all orders (only if not in progress)
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const runsheetId = req.nextUrl.searchParams.get('id')
    if (!runsheetId) return NextResponse.json({ error: 'id (runsheetId) required' }, { status: 400 })

    // Check if any stops are in transit or delivered (can't delete an active runsheet)
    const stops = await db.outboundRecord.findMany({
      where: { runsheetId },
      select: { id: true, status: true },
    })
    if (stops.length === 0) {
      return NextResponse.json({ error: 'Runsheet not found or already deleted' }, { status: 404 })
    }

    const activeStops = stops.filter(s => ['dispatched', 'in_transit'].includes(s.status))
    if (activeStops.length > 0) {
      return NextResponse.json({
        error: `Cannot delete runsheet — ${activeStops.length} stop(s) are in transit`,
        suggestion: 'Wait for deliveries to complete or fail them first.',
      }, { status: 400 })
    }

    // Unassign all orders: clear runsheetId, driver, sequence, restore to 'staged'.
    // 'staged' (not 'packed') because the order is already physically at the dock —
    // it just needs a new rider. Forcing a re-stage would waste dock crew's time.
    // For backward-compat with pre-staged-workflow records, 'packed' orders that
    // were on this runsheet stay in 'packed' (they were never staged to begin with).
    const ordersOnRunsheet = await db.outboundRecord.findMany({
      where: { runsheetId },
      select: { id: true, status: true },
    })
    await Promise.all(ordersOnRunsheet.map(o =>
      db.outboundRecord.update({
        where: { id: o.id },
        data: {
          runsheetId: null,
          stopSequence: null,
          assignedDriver: null,
          vehicleNumber: null,
          // Only promote 'staged' or 'dispatched' (failed mid-route) back to 'staged'.
          // 'packed' orders stay 'packed' so the dock crew re-stages them.
          status: ['staged', 'dispatched', 'failed'].includes(o.status) ? 'staged' : o.status,
          deliveryNotes: null,
        },
      })
    ))

    return NextResponse.json({ success: true, unassigned: stops.length })
  } catch (error) {
    console.error('Runsheet delete error:', error)
    return NextResponse.json({ error: 'Failed to delete runsheet' }, { status: 500 })
  }
}
