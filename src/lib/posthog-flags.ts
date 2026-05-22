/**
 * Pillar 5: Feature Flags
 *
 * All new modules must be wrapped in a PostHog feature flag so they can be
 * remotely killed from the PostHog UI without redeployment.
 *
 * Client-side: useFeatureFlag() hook (posthog-js/react)
 * Server-side: isFeatureFlagEnabled() — hits PostHog decide API
 *
 * Flag naming convention: kebab-case, e.g. 'daily-insights', 'bazi-engine'
 */

import { getPostHogServer } from '@/lib/analytics-server'

/**
 * Server-side feature flag evaluation.
 * Returns false (safe default) if PostHog is not configured or flag is unknown.
 */
export async function isFeatureFlagEnabled(
  flag: string,
  distinctId: string,
  fallback = false,
): Promise<boolean> {
  const client = getPostHogServer()
  if (!client) return fallback
  try {
    const enabled = await client.isFeatureEnabled(flag, distinctId)
    return enabled ?? fallback
  } catch {
    return fallback
  }
}

// ── Feature flag registry ──────────────────────────────────────────────────────
// Add new flags here so they're discoverable. Each flag must exist in PostHog UI.
export const FLAGS = {
  DAILY_INSIGHTS: 'daily-insights',
  BAZI_ENGINE: 'bazi-engine',
  DRIFT_DETECTION: 'drift-detection',
  SESSION_REPLAY: 'session-replay',
  AI_SCHEDULING: 'ai-scheduling',
} as const

export type FeatureFlag = (typeof FLAGS)[keyof typeof FLAGS]
