import { redirect } from 'next/navigation'

// 8os.ai is English-only. The /zh URL was previously advertised as an
// hreflang alternate, which caused 404s. We redirect to the canonical /
// so any external link continues to land on the homepage without 404.
// When real Chinese translations ship, replace this redirect with a
// translated page and re-add the languages map in src/app/layout.tsx.
export default function ZhPage() {
  redirect('/')
}
