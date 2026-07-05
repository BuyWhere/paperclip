import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

type UserRole = 'user' | 'premium' | 'pro' | 'admin'

function loginRedirect(nextPath: string): never {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`)
}

export async function requireClerkUserId(nextPath: string): Promise<string> {
  const { userId } = await auth()
  if (!userId) loginRedirect(nextPath)
  return userId
}

export async function requireClerkUser(nextPath: string): Promise<{ userId: string; role: UserRole }> {
  const session = await auth()
  if (!session.userId) loginRedirect(nextPath)

  const claims = session.sessionClaims as { metadata?: { role?: string }; publicMetadata?: { role?: string } } | null
  const role = claims?.metadata?.role ?? claims?.publicMetadata?.role ?? 'user'

  return {
    userId: session.userId,
    role: role as UserRole,
  }
}
