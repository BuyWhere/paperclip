/**
 * /dashboard/goals — redirect to /goals
 * Some older nav builds linked here; the canonical URL is /goals.
 */
import { redirect } from 'next/navigation'

export default function DashboardGoalsRedirect() {
  redirect('/goals')
}
