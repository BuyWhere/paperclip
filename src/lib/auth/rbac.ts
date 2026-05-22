/**
 * RBAC — role-based feature flags and subscription middleware.
 * Roles (ascending privilege): user < premium < pro < admin
 */

export type UserRole = 'user' | 'premium' | 'pro' | 'admin'

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  premium: 1,
  pro: 2,
  admin: 99,
}

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole]
}

/** Feature flag definitions — which minimum role each feature requires. */
export const FEATURE_FLAGS = {
  /** Core OS dashboard — all users */
  dashboard: 'user',
  /** Extended archetype analysis */
  archetypeDeep: 'premium',
  /** Drift engine coaching */
  driftCoaching: 'premium',
  /** Priority AI model (e.g. GPT-4o instead of 3.5) */
  priorityAi: 'pro',
  /** Custom persona exports */
  personaExport: 'pro',
  /** Admin panel access */
  adminPanel: 'admin',
} as const satisfies Record<string, UserRole>

export type FeatureFlag = keyof typeof FEATURE_FLAGS

/** Check if a user role can access a feature flag. */
export function canAccess(userRole: UserRole, flag: FeatureFlag): boolean {
  return hasRole(userRole, FEATURE_FLAGS[flag])
}

/** Returns all feature flags enabled for a given role. */
export function getEnabledFlags(userRole: UserRole): FeatureFlag[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).filter((flag) =>
    canAccess(userRole, flag),
  )
}
