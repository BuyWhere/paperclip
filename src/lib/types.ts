// ─── Domain IDs ───────────────────────────────────────────────────────────────

export type DomainId = 'career' | 'wealth' | 'health' | 'relationships' | 'learning' | 'legacy'

export type CheckMethod = 'binary' | 'numeric' | 'time' | 'streak' | 'milestone'

// ─── Goal Definition ──────────────────────────────────────────────────────────

export interface GoalDefinition {
  domainId: DomainId
  name: string
  definition: string
  checkMethod: CheckMethod
  checkConfig: {
    unit?: string       // for numeric/time
    target?: number     // for numeric/time/streak
    milestones?: string[] // for milestone
  }
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  estimatedDuration: string
  suggestedOrder: number
  domainId: DomainId
  goalName: string
  accepted: boolean
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface OSTask {
  id: string
  projectId: string
  name: string
  duration: string
  priority: 'high' | 'medium' | 'low'
  suggestedSchedule: string
  accepted: boolean
}

// ─── Work Preferences ─────────────────────────────────────────────────────────

export type BatchingStyle = 'batch' | 'spread'
export type PlanningCadence = 'daily' | 'weekly' | 'biweekly'

export interface WorkPreferences {
  workingWindowStart: number  // hour 0-23
  workingWindowEnd: number    // hour 0-23
  blockLengthMin: number      // 25 / 50 / 90
  batching: BatchingStyle
  planningCadence: PlanningCadence
}

// ─── Onboarding State ─────────────────────────────────────────────────────────

export interface OnboardingState {
  selectedDomains: DomainId[]
  goals: Partial<Record<DomainId, GoalDefinition>>
  archetype: string
  archetypeName: string
  projects: Project[]
  tasks: OSTask[]
  workPreferences?: WorkPreferences
  completedAt?: string
}

// ─── Domain Metadata ──────────────────────────────────────────────────────────

export interface DomainMeta {
  id: DomainId
  label: string
  icon: string
  color: string
  accent: string
  description: string
  promptHint: string
  defaultCheckMethod: CheckMethod
  suggestions: string[]
}
