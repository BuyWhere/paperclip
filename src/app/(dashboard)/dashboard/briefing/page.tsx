/**
 * /dashboard/briefing — Daily briefing page
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify, importSPKI } from 'jose'
import { prisma } from '@/lib/db/prisma'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { BriefingContent } from '@/components/dashboard/BriefingContent'
import { pageMainStyle, pageShellStyle } from '@/components/dashboard/page-style'

async function getUserId(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value
  if (!token) redirect('/login?next=/dashboard/briefing')
  const pem = (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n')
  if (!pem) redirect('/login')
  try {
    const key = await importSPKI(pem, 'RS256')
    const { payload } = await jwtVerify(token, key, { issuer: '8os' })
    return payload.sub as string
  } catch {
    redirect('/login?next=/dashboard/briefing')
  }
}

export default async function BriefingPage() {
  const userId = await getUserId()

  const [goals, settings] = await Promise.all([
    prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { createdAt: 'asc' }, take: 5 }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ])

  const sidebarGoals = goals.map((g) => ({ id: g.id, domainId: g.domainId, name: g.name, progress: g.progress }))

  return (
    <div style={pageShellStyle}>
      <Sidebar goals={sidebarGoals} initialCollapsed={settings?.sidebarCollapsed ?? false} />
      <main style={pageMainStyle}>
        <BriefingContent />
      </main>
    </div>
  )
}
