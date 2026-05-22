'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'

interface PostHogIdentifyProps {
  userId: string
  userTier?: string
  accountId?: string
  archetypeName?: string
}

// Pillar 1: identify user with properties for segmentation in PostHog funnels/retention
export function PostHogIdentify({ userId, userTier = 'free', accountId, archetypeName }: PostHogIdentifyProps) {
  const posthog = usePostHog()
  useEffect(() => {
    if (posthog && userId) {
      posthog.identify(userId, {
        user_tier: userTier,
        account_id: accountId ?? userId,
        archetype_name: archetypeName,
      })
    }
  }, [posthog, userId, userTier, accountId, archetypeName])
  return null
}
