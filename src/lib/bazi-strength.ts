/**
 * BaZi Day Master Strength Calculator
 *
 * Determines whether the Day Master (日主) is strong, weak, or balanced.
 * Uses the traditional simplified method:
 *   1. Month Commander (月令 yuèlìng) — primary weight
 *   2. Element distribution across all pillars — secondary weight
 *   3. Hidden stems in branches (藏干)
 *
 * Output: "strong" | "weak" | "balanced"
 */

import type { BaziResult, Stem, Branch } from './bazi'
import { BRANCHES, STEM_ELEMENT, BRANCH_ELEMENT } from './bazi'

// ─── Element generation/control cycles ───────────────────────────────────────

// Generating cycle: wood→fire→earth→metal→water→wood
const GENERATES: Record<string, string> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
}

// Control cycle: wood controls earth, earth controls water, water controls fire,
//               fire controls metal, metal controls wood
const CONTROLS: Record<string, string> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
}

// ─── Hidden stems (藏干) in each Earthly Branch ───────────────────────────────
// Format: { main: element, mid?: element, residual?: element }
const BRANCH_HIDDEN_STEMS: Record<Branch, { main: string; mid?: string; residual?: string }> = {
  子: { main: 'water' },
  丑: { main: 'earth', mid: 'water', residual: 'metal' },
  寅: { main: 'wood',  mid: 'fire',  residual: 'earth' },
  卯: { main: 'wood' },
  辰: { main: 'earth', mid: 'wood',  residual: 'water' },
  巳: { main: 'fire',  mid: 'earth', residual: 'metal' },
  午: { main: 'fire',  mid: 'earth' },
  未: { main: 'earth', mid: 'fire',  residual: 'wood' },
  申: { main: 'metal', mid: 'water', residual: 'earth' },
  酉: { main: 'metal' },
  戌: { main: 'earth', mid: 'metal', residual: 'fire' },
  亥: { main: 'water', mid: 'wood' },
}

// ─── Month Commander seasons ──────────────────────────────────────────────────
// Maps month branch to which element is "in season" (rooted / strongest)
const MONTH_SEASON_ELEMENT: Record<Branch, string> = {
  寅: 'wood',  卯: 'wood',  辰: 'earth',
  巳: 'fire',  午: 'fire',  未: 'earth',
  申: 'metal', 酉: 'metal', 戌: 'earth',
  子: 'water', 亥: 'water', 丑: 'earth',
}

// ─── Strength scoring ─────────────────────────────────────────────────────────

export type DayMasterStrength = 'strong' | 'weak' | 'balanced'

export interface StrengthResult {
  strength: DayMasterStrength
  score: number          // raw numeric score
  monthSupport: boolean  // Day Master in season
  supportCount: number   // number of stem/branch elements that support
  attackCount: number    // number of stem/branch elements that weaken/control
}

function elementSupports(candidate: string, dayElement: string): number {
  if (candidate === dayElement) return 2          // same element → strong support
  if (GENERATES[candidate] === dayElement) return 1 // generates Day Master → mild support
  if (CONTROLS[candidate] === dayElement) return -2 // controls Day Master → weakens
  if (GENERATES[dayElement] === candidate) return -1 // Day Master drains into → weakens
  return 0
}

export function calculateDayMasterStrength(bazi: BaziResult): StrengthResult {
  const dayElement = bazi.dayElement

  // 1. Month Commander — most important signal (weight ×3)
  const monthBranch = bazi.monthPillar.branch as Branch
  const seasonElement = MONTH_SEASON_ELEMENT[monthBranch] ?? 'earth'
  const monthSupport = seasonElement === dayElement || GENERATES[seasonElement] === dayElement
  const monthScore = monthSupport
    ? (seasonElement === dayElement ? 6 : 3)
    : elementSupports(seasonElement, dayElement) * 1.5

  // 2. Score all stems across all available pillars (except Day Stem itself)
  const pillars = [bazi.yearPillar, bazi.monthPillar, bazi.hourPillar].filter(Boolean)
  let stemScore = 0
  let supportCount = 0
  let attackCount = 0

  for (const pillar of pillars) {
    if (!pillar) continue
    const s = elementSupports(pillar.element, dayElement)
    stemScore += s
    if (s > 0) supportCount++
    if (s < 0) attackCount++
  }

  // 3. Branch hidden stems across all pillars (including Day branch)
  const allBranches: Branch[] = [
    bazi.yearPillar.branch,
    bazi.monthPillar.branch,
    bazi.dayPillar.branch,
    ...(bazi.hourPillar ? [bazi.hourPillar.branch] : []),
  ] as Branch[]

  let branchScore = 0
  for (const branch of allBranches) {
    const hidden = BRANCH_HIDDEN_STEMS[branch]
    if (!hidden) continue
    // Main hidden stem gets full weight, mid/residual get half
    branchScore += elementSupports(hidden.main, dayElement)
    if (hidden.mid) branchScore += elementSupports(hidden.mid, dayElement) * 0.5
    if (hidden.residual) branchScore += elementSupports(hidden.residual, dayElement) * 0.25
  }

  const totalScore = monthScore + stemScore + branchScore

  // 4. Classify
  let strength: DayMasterStrength
  if (totalScore >= 4) {
    strength = 'strong'
  } else if (totalScore <= 0) {
    strength = 'weak'
  } else {
    strength = 'balanced'
  }

  return {
    strength,
    score: totalScore,
    monthSupport,
    supportCount,
    attackCount,
  }
}
