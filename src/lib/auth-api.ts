import { NextRequest, NextResponse } from 'next/server'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

/**
 * Extracts the authenticated user from the session cookie.
 * Returns null if not authenticated or session expired.
 */
export function getAuthUser(req: NextRequest): AuthUser | null {
  try {
    const sessionCookie = req.cookies.get('kwanza-session')?.value
    if (!sessionCookie) return null

    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString())
    if (!sessionData.exp || sessionData.exp < Date.now()) return null

    return {
      id: sessionData.id,
      email: sessionData.email,
      name: sessionData.name,
      role: sessionData.role,
    }
  } catch {
    return null
  }
}

/**
 * Require authentication. Returns the user if authenticated,
 * or a 401 NextResponse if not.
 */
export function requireAuth(req: NextRequest): AuthUser | NextResponse {
  const user = getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return user
}

/**
 * Require a specific role. Returns the user if authorized,
 * or a 403 NextResponse if the role doesn't match.
 */
export function requireRole(req: NextRequest, ...roles: string[]): AuthUser | NextResponse {
  const result = requireAuth(req)
  if (result instanceof NextResponse) return result
  if (roles.length > 0 && !roles.includes(result.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return result
}
