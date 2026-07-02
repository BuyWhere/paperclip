import type { OnboardingState, DomainId, GoalDefinition, Project, OSTask, WorkPreferences } from './types'

const KEY = '8os_onboarding'

export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    return defaultState()
  }
}

export function saveOnboardingState(partial: Partial<OnboardingState>): OnboardingState {
  const current = getOnboardingState()
  const next = { ...current, ...partial }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function clearOnboardingState() {
  localStorage.removeItem(KEY)
}

function defaultState(): OnboardingState {
  return {
    selectedDomains: [],
    goals: {},
    archetype: 'builder',
    archetypeName: 'The Builder',
    projects: [],
    tasks: [],
    workPreferences: defaultWorkPreferences(),
  }
}

function defaultWorkPreferences(): WorkPreferences {
  return {
    workingWindowStart: 9,
    workingWindowEnd: 17,
    blockLengthMin: 50,
    batching: 'batch',
    planningCadence: 'weekly',
  }
}
