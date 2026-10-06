'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import type posthogJs from 'posthog-js'

let initialized = false
let clientPromise: Promise<typeof posthogJs | null> | null = null

function marketingEventForPath(pathname: string) {
  if (pathname === '/products') return 'product_view'
  if (pathname === '/pricing') return 'pricing_view'
  if (pathname === '/signup' || pathname === '/sign-up') return 'signup_started'
  return null
}

function planFromUrl(value: string | null) {
  if (!value) return null
  return value === 'agent-connect' || value === 'pro' || value === 'free' ? value : null
}

async function getPostHog() {
  if (clientPromise) return clientPromise

  clientPromise = import('posthog-js').then((mod) => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!token) return null

    const posthog = mod.default
    if (!initialized) {
      initialized = true
      posthog.init(token, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        autocapture: true,
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: true,
        capture_exceptions: false,
      })
    }

    return posthog
  }).catch(() => null)

  return clientPromise
}

export function MarketingPostHog() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isLoaded } = useUser()

  useEffect(() => {
    if (!isLoaded || !user) return

    getPostHog().then((posthog) => {
      if (!posthog) return
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      })
    })
  }, [isLoaded, user])

  useEffect(() => {
    if (!pathname) return

    const plan = planFromUrl(searchParams.get('plan'))
    const props = {
      route: pathname,
      plan: plan ?? undefined,
      $current_url: typeof window !== 'undefined' ? window.location.href : pathname,
    }

    getPostHog().then((posthog) => {
      if (!posthog) return
      posthog.capture('page_view', props)
      posthog.capture('$pageview', props)

      const eventName = marketingEventForPath(pathname)
      if (eventName) posthog.capture(eventName, props)
    })
  }, [pathname, searchParams])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null
      const actionable = target?.closest('a[href],button')
      if (!actionable) return

      const href = actionable instanceof HTMLAnchorElement ? actionable.href : null
      const url = href ? new URL(href, window.location.origin) : null
      const plan = planFromUrl(url?.searchParams.get('plan') ?? null)
      const text = actionable.textContent?.trim().toLowerCase() ?? ''
      const tier = actionable.getAttribute('data-tier')
      const checkoutPlan = plan ?? planFromUrl(tier)

      if (!checkoutPlan && !text.includes('start pro') && !text.includes('agent connect')) return

      getPostHog().then((posthog) => {
        if (!posthog) return
        posthog.capture('plan_selected', {
          plan: checkoutPlan ?? (text.includes('agent connect') ? 'agent-connect' : 'pro'),
          route: window.location.pathname,
          $current_url: window.location.href,
        })
      })
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
