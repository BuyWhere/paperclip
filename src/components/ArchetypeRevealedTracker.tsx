'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'

export function ArchetypeRevealedTracker({ archetype }: { archetype: string }) {
  useEffect(() => {
    posthog.capture('archetype_revealed', { archetype })
  }, [archetype])
  return null
}
