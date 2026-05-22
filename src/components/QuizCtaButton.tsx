'use client'

import posthog from 'posthog-js'
import Link from 'next/link'
import type { CSSProperties } from 'react'

interface QuizCtaButtonProps {
  label: string
  style?: CSSProperties
}

export function QuizCtaButton({ label, style }: QuizCtaButtonProps) {
  return (
    <Link
      href="/onboarding"
      onClick={() => posthog.capture('quiz_start', { source: 'landing' })}
      style={style}
    >
      {label}
    </Link>
  )
}
