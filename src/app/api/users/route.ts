import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'bcryptjs'
import { requireAuth } from '@/lib/auth-api'

export async function GET() {
  try {
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const hashedPassword = await hash(body.password || 'password123', 10)
    const user = await db.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
        role: body.role || 'viewer',
        isActive: true,
      },
    })
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult
    const body = await req.json()
    const { id, password, ...data } = body
    if (password) {
      data.password = await hash(password, 10)
    }
    const user = await db.user.update({ where: { id }, data })
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive })
  } catch {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
