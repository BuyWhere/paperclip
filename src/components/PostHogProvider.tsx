'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function PostHogPageView() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname) {
      // Note: we capture only the pathname here, not the search params.
      // Including useSearchParams() here forced a Suspense boundary at the
      // layout level which bailed out server-rendering the entire page
      // content (see OS-1056). The trade-off: query string changes without
      // a pathname change are no longer tracked as separate pageviews.
      // Acceptable for the launch — most of the site uses Link navigation
      // which changes the pathname.
      const url = typeof window !== 'undefined' ? window.origin + pathname : pathname
      posthog.capture('$pageview', { $current_url: url })
    }
  }, [pathname])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!token) return

    posthog.init(token, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Keep launch landing-page JS light: explicit capture calls still work,
      // while disabling heavy autocapture/session replay bundles prevents
      // Lighthouse from downloading PostHog surveys/replay code on first paint.
      autocapture: false,
      disable_surveys: true,
      disable_session_recording: true,
      advanced_disable_decide: true,
      person_profiles: 'identified_only',
      capture_pageview: false, // manual pageviews via PostHogPageView
      capture_pageleave: false,
      // Pillar 3: Error Tracking — PostHog captures unhandled exceptions
      // automatically via its auto-capture pipeline. capture_exceptions is
      // disabled because it installs a global error boundary that interferes
      // with React's hydration commit phase, causing errors #418/#423/#425
      // on every page (OS-2615).
      capture_exceptions: false,
    })

    // Pillar 4: Web Vitals — report CLS, FCP, FID, LCP, TTFB as PostHog events
    if (typeof window !== 'undefined') {
      import('web-vitals').then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
        const report = ({ name, value, id }: { name: string; value: number; id: string }) => {
          posthog.capture('$web_vitals', { name, value, id })
        }
        onCLS(report)
        onFCP(report)
        onLCP(report)
        onTTFB(report)
        onINP(report)
      }).catch(() => {/* web-vitals optional */})
    }
  }, [])

  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!token) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}
