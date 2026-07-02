import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('kwanza-session')?.value

    if (!sessionCookie) {
      return NextResponse.json({ user: null })
    }

    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString())

    // Check if session has expired
    if (!sessionData.exp || sessionData.exp < Date.now()) {
      return NextResponse.json({ user: null })
    }

    return NextResponse.json({
      user: {
        id: sessionData.id,
        email: sessionData.email,
        name: sessionData.name,
        role: sessionData.role,
      },
    })
  } catch {
    return NextResponse.json({ user: null })
  }
}
