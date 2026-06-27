import { compare } from 'bcryptjs'
import { db } from '@/lib/db'

// Define User type
interface User {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  password: string
}

// Simple authentication helper functions
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  if (!email || !password) {
    return null
  }

  const user = await db.user.findUnique({
    where: { email },
  })

  if (!user || !user.isActive) {
    return null
  }

  const isPasswordValid = await compare(password, user.password)

  if (!isPasswordValid) {
    return null
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user
  return userWithoutPassword
}
