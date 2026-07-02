'use client'

// Legacy single-page wizard has been removed. The hardcoded archetype
// ("The Commander") was a credibility risk — see OS-2091.
//
// This route now bounces the visitor straight into the real multi-step
// onboarding flow, which computes the archetype via /api/onboarding/birth
// → /api/onboarding/archetype (verified: returns hybrid_explorer, etc.).
//
// Real flow: /onboarding/birth → /onboarding/quiz → /onboarding/archetype
//            → /onboarding/goals → /onboarding/define → /onboarding/projects

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingIndex() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/onboarding/birth')
  }, [router])

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)',
        color: '#888',
      }}
    >
      <p>Loading onboarding…</p>
    </main>
  )
}