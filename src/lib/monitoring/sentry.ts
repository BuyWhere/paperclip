/**
 * Error monitoring — now backed by PostHog (Pillar 3).
 * Re-exports from posthog.ts so existing callers don't need to change imports.
 */
export { captureException, captureMessage } from './posthog'
