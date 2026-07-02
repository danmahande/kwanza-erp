import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { compare, hash } from 'bcryptjs'
import { randomBytes } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const isPasswordValid = await compare(password, user.password)

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Create a simple session token (random string stored as cookie)
    const sessionToken = randomBytes(32).toString('hex')
    // Token expires in 24 hours - just store the user email in the cookie for lookup
    const sessionData = Buffer.from(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    })).toString('base64')

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })

    response.cookies.set('kwanza-session', sessionData, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 86400,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
