import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || ''
    const period = req.nextUrl.searchParams.get('period') || 'This Month'
    
    // Parse the period to filter by year/month/day
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    switch(period) {
      case 'Today':
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
        endDate = new Date(new Date().setHours(23, 59, 59, 999));
        break;
      case 'This Week':
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        startDate = new Date(startOfWeek.setHours(0, 0, 0, 0));
        endDate = new Date(new Date().setHours(23, 59, 59, 999));
        break;
      case 'This Month':
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'This Year':
        startDate = new Date(new Date().getFullYear(), 0, 1);
        endDate = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
    }
    
    const payments = await db.merchantPayment.findMany({
      where: {
        OR: [
          { merchantName: { contains: search } },
          { paymentId: { contains: search } },
          { reference: { contains: search } },
        ],
        ...(startDate && endDate && { 
          createdAt: { gte: startDate, lte: endDate }
        })
      },
      orderBy: { createdAt: 'desc' },
    })
    
    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Check if this is a bulk import
    if (Array.isArray(body)) {
      // Process bulk import
      const results = [];
      for (const payment of body) {
        const count = await db.merchantPayment.count()
        const paymentId = `PAY-${String(count + 1).padStart(3, '0')}`
        
        // Calculate net amount considering deductions
        const totalDeductions = Array.isArray(payment.deductions) 
          ? payment.deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0)
          : 0;
        
        const netAmount = (payment.amount || 0) - totalDeductions;
        
        // Get year, month, day for filtering
        const paymentDate = new Date(payment.paymentDate || new Date());
        const year = paymentDate.getFullYear();
        const month = paymentDate.getMonth() + 1; // Month is 0-indexed
        const day = paymentDate.getDate();
        
        const createdPayment = await db.merchantPayment.create({
          data: { 
            ...payment,
            paymentId,
            deductions: payment.deductions || [],
            netAmount,
            year,
            month,
            day,
            status: payment.status || 'pending',
          },
        })
        results.push(createdPayment);
      }
      return NextResponse.json(results, { status: 201 })
    } else {
      // Process single payment
      const count = await db.merchantPayment.count()
      const paymentId = `PAY-${String(count + 1).padStart(3, '0')}`
      
      // Calculate net amount considering deductions
      const totalDeductions = Array.isArray(body.deductions) 
        ? body.deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0)
        : 0;
      
      const netAmount = (body.amount || 0) - totalDeductions;
      
      // Get year, month, day for filtering
      const paymentDate = new Date(body.paymentDate || new Date());
      const year = paymentDate.getFullYear();
      const month = paymentDate.getMonth() + 1; // Month is 0-indexed
      const day = paymentDate.getDate();
      
      const payment = await db.merchantPayment.create({
        data: { 
          ...body, 
          paymentId,
          deductions: body.deductions || [],
          netAmount,
          year,
          month,
          day,
          status: body.status || 'pending',
        },
      })
      return NextResponse.json(payment, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating payment:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...data } = body
    
    // Calculate net amount considering deductions
    const totalDeductions = Array.isArray(data.deductions) 
      ? data.deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0)
      : 0;
    
    const netAmount = (data.amount || 0) - totalDeductions;
    
    // Get year, month, day for filtering
    const paymentDate = new Date(data.paymentDate || new Date());
    const year = paymentDate.getFullYear();
    const month = paymentDate.getMonth() + 1; // Month is 0-indexed
    const day = paymentDate.getDate();
    
    const payment = await db.merchantPayment.update({ 
      where: { id }, 
      data: {
        ...data,
        deductions: data.deductions || [],
        netAmount,
        year,
        month,
        day,
        updatedAt: new Date(),
      }
    })
    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error updating payment:', error)
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await db.merchantPayment.delete({ where: { id: id! } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payment:', error)
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
  }
}