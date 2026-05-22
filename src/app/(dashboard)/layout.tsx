/**
 * Layout for authenticated dashboard routes.
 * JWT protection is handled by middleware; this just sets the HTML structure.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
