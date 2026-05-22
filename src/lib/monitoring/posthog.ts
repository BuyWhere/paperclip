/**
 * PostHog error-tracking helpers — replaces Sentry.
 *
 * Client-side: posthog.captureException() (posthog-js ≥1.160)
 * Server-side: PostHog Node SDK captureException (posthog-node ≥4.4)
 *
 * Env: NEXT_PUBLIC_POSTHOG_KEY (client), POSTHOG_Project_token (server)
 */

// ── Server-side ────────────────────────────────────────────────────────────────

import { getPostHogServer } from '@/lib/analytics-server'

/**
 * Capture an exception on the server. Uses the PostHog Node client.
 * `distinctId` should be the user ID when known; falls back to 'anonymous'.
 */
export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
  distinctId = 'anonymous',
): Promise<void> {
  const client = getPostHogServer()
  if (!client) {
    console.error('[PostHog] not configured, error:', err)
    return
  }
  try {
    client.captureException(err instanceof Error ? err : new Error(String(err)), distinctId, context)
  } catch {
    // Never let monitoring crash the app
  }
}

export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  distinctId = 'anonymous',
): Promise<void> {
  const client = getPostHogServer()
  if (!client) return
  client.capture({
    distinctId,
    event: '$log',
    properties: { level, message },
  })
}
