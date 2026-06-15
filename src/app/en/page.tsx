import { redirect } from 'next/navigation'

// 8os.ai is English-only. The /en URL was previously advertised as an
// hreflang alternate, which caused 404s. We redirect to the canonical /
// so any external link continues to land on the homepage without 404.
export default function EnPage() {
  redirect('/')
}
