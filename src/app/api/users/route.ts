import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'bcryptjs'
import { requireAuth, requireRole, type AuthUser } from '@/lib/auth-api'
import { logAudit } from '@/lib/audit'

/**
 * Users API — Production-hardened
 *
 * Security:
 * - GET requires authentication (was completely open)
 * - POST/PUT require admin or super_admin role (any user could create admins)
 * - DELETE requires admin or super_admin (was missing entirely)
 * - Can't delete yourself or the last active admin
 * - Email uniqueness checked before creating (friendly 409, not 500)
 * - Password must be at least 6 characters (was defaulting to 'password123')
 *
 * Every mutation is audited.
 */

const VALID_ROLES = ['super_admin', 'admin', 'operations_manager', 'procurement', 'warehouse', 'finance', 'driver', 'viewer']

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof NextResponse) return authResult

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
    const authResult = requireRole(req, 'admin', 'super_admin')
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.email || !body.email.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    // Password validation — must be at least 6 characters, no default
    const password = body.password
    if (!password || password.length < 6) {
      return NextResponse.json({
        error: 'Password must be at least 6 characters',
        code: 'WEAK_PASSWORD',
      }, { status: 400 })
    }

    // Validate role
    const role = body.role || 'viewer'
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({
        error: `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`,
      }, { status: 400 })
    }

    // Check email uniqueness BEFORE creating (friendly 409, not a 500)
    const existing = await db.user.findUnique({
      where: { email: body.email },
      select: { id: true, name: true },
    })
    if (existing) {
      return NextResponse.json({
        error: 'Email already registered',
        details: `Email "${body.email}" is already in use by ${existing.name}.`,
        code: 'EMAIL_DUPLICATE',
      }, { status: 409 })
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE
    // ═══════════════════════════════════════════════════════════════

    const hashedPassword = await hash(password, 10)
    const user = await db.user.create({
      data: {
        name: body.name.trim(),
        email: body.email.trim(),
        password: hashedPassword,
        role,
        isActive: true,
      },
    })

    await logAudit({
      action: 'USER_CREATED',
      module: 'users',
      entityId: user.id,
      details: `Created user ${user.name} (${user.email}) with role "${role}". Created by ${_user.name}.`,
    })

    return NextResponse.json({
      id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive,
    }, { status: 201 })
  } catch (error) {
    console.error('User create error:', error)
    return NextResponse.json({
      error: 'Failed to create user',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = requireRole(req, 'admin', 'super_admin')
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const body = await req.json()
    const { id, password, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Validate role if being changed
    if (data.role && !VALID_ROLES.includes(data.role)) {
      return NextResponse.json({
        error: `Invalid role "${data.role}". Valid roles: ${VALID_ROLES.join(', ')}`,
      }, { status: 400 })
    }

    // Check email uniqueness if email is being changed
    if (data.email && data.email !== existing.email) {
      const emailOwner = await db.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      })
      if (emailOwner && emailOwner.id !== id) {
        return NextResponse.json({
          error: 'Email already registered',
          code: 'EMAIL_DUPLICATE',
        }, { status: 409 })
      }
    }

    // Password validation (only if password is being changed)
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({
          error: 'Password must be at least 6 characters',
          code: 'WEAK_PASSWORD',
        }, { status: 400 })
      }
      data.password = await hash(password, 10)
    }

    // Prevent demoting yourself (can't remove your own admin access)
    if (data.role && data.role !== 'admin' && data.role !== 'super_admin' && id === _user.id) {
      return NextResponse.json({
        error: 'Cannot demote yourself',
        detail: 'You cannot remove your own admin role. Ask another admin to do this.',
        code: 'SELF_DEMOTE',
      }, { status: 409 })
    }

    // Prevent deactivating yourself
    if (data.isActive === false && id === _user.id) {
      return NextResponse.json({
        error: 'Cannot deactivate yourself',
        detail: 'You cannot deactivate your own account. Ask another admin to do this.',
        code: 'SELF_DEACTIVATE',
      }, { status: 409 })
    }

    // Prevent deactivating the last active admin
    if (data.isActive === false && (existing.role === 'admin' || existing.role === 'super_admin')) {
      const activeAdmins = await db.user.count({
        where: {
          isActive: true,
          role: { in: ['admin', 'super_admin'] },
        },
      })
      if (activeAdmins <= 1) {
        return NextResponse.json({
          error: 'Cannot deactivate the last active admin',
          detail: 'At least one active admin must remain in the system.',
          code: 'LAST_ADMIN',
        }, { status: 409 })
      }
    }

    const user = await db.user.update({ where: { id }, data })

    // Audit — track what changed
    const changes: string[] = []
    if (data.name && data.name !== existing.name) changes.push(`name: ${existing.name} → ${data.name}`)
    if (data.email && data.email !== existing.email) changes.push(`email changed`)
    if (data.role && data.role !== existing.role) changes.push(`role: ${existing.role} → ${data.role}`)
    if (data.isActive !== undefined && data.isActive !== existing.isActive) changes.push(`status: ${existing.isActive ? 'active' : 'inactive'} → ${data.isActive ? 'active' : 'inactive'}`)
    if (password) changes.push('password changed')
    if (changes.length === 0) changes.push(Object.keys(data).join(', '))

    await logAudit({
      action: 'USER_UPDATED',
      module: 'users',
      entityId: user.id,
      details: `User ${existing.name} (${existing.email}): ${changes.join(', ')}. Updated by ${_user.name}.`,
    })

    return NextResponse.json({
      id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive,
    })
  } catch (error) {
    console.error('User update error:', error)
    return NextResponse.json({
      error: 'Failed to update user',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE — admin-only. Can't delete yourself or the last active admin.
export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireRole(req, 'admin', 'super_admin')
    if (authResult instanceof NextResponse) return authResult
    const _user = authResult as AuthUser
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Can't delete yourself
    if (id === _user.id) {
      return NextResponse.json({
        error: 'Cannot delete your own account',
        code: 'SELF_DELETE',
      }, { status: 409 })
    }

    // Can't delete the last active admin
    if ((existing.role === 'admin' || existing.role === 'super_admin') && existing.isActive) {
      const activeAdmins = await db.user.count({
        where: {
          isActive: true,
          role: { in: ['admin', 'super_admin'] },
        },
      })
      if (activeAdmins <= 1) {
        return NextResponse.json({
          error: 'Cannot delete the last active admin',
          detail: 'At least one active admin must remain in the system.',
          code: 'LAST_ADMIN',
        }, { status: 409 })
      }
    }

    await db.user.delete({ where: { id } })

    await logAudit({
      action: 'USER_DELETED',
      module: 'users',
      entityId: existing.id,
      details: `Deleted user ${existing.name} (${existing.email}, role: ${existing.role}). Deleted by ${_user.name}.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('User delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
