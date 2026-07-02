/**
 * Goal tagline engine — Ten-Gods BaZi projection tests.
 *
 * Verifies that the tagline varies per chart (day element + dominant element)
 * and per goal domain (career vs wealth vs health etc.), matching the
 * acceptance criteria: chart-specific tagline per goal.
 */

import {
  goalTagline,
  goalTaglineForDomain,
  tallyFromProfile,
  tenGod,
  type ChartTally,
} from '../goal-taglines'

const DOMAINS = ['career', 'wealth', 'health', 'relationships', 'learning', 'legacy'] as const

// ─── Ten-Gods classification sanity ────────────────────────────────────

describe('tenGod() classification', () => {
  test('same-element yang-yang → friend (比肩)', () => {
    expect(tenGod('wood', 'yang', 'wood', 'yang')).toBe('friend')
  })

  test('same-element yang-yin → robber (劫财)', () => {
    expect(tenGod('wood', 'yang', 'wood', 'yin')).toBe('robber')
  })

  test('DM produces stem, diff polarity → food god (食神)', () => {
    // wood DM produces fire; wood-yang, fire-yin
    expect(tenGod('wood', 'yang', 'fire', 'yin')).toBe('food')
  })

  test('DM produces stem, same polarity → hurt officer (伤官)', () => {
    // wood DM produces fire; wood-yang, fire-yang
    expect(tenGod('wood', 'yang', 'fire', 'yang')).toBe('hurt')
  })

  test('stem produces DM, same polarity → resource (正印)', () => {
    // water produces wood; water-yin, wood-yin
    expect(tenGod('wood', 'yin', 'water', 'yin')).toBe('resource')
  })

  test('stem produces DM, diff polarity → indirect resource (偏印)', () => {
    // water produces wood; water-yang, wood-yin
    expect(tenGod('wood', 'yin', 'water', 'yang')).toBe('indirect_resource')
  })

  test('DM controls stem, diff polarity → direct wealth (正财)', () => {
    // wood controls earth; wood-yang, earth-yin
    expect(tenGod('wood', 'yang', 'earth', 'yin')).toBe('wealth')
  })

  test('stem controls DM, same polarity → indirect officer (偏官)', () => {
    // metal controls wood; metal-yin, wood-yin
    expect(tenGod('wood', 'yin', 'metal', 'yin')).toBe('indirect_officer')
  })

  test('stem controls DM, diff polarity → direct officer (正官)', () => {
    // metal controls wood; metal-yang, wood-yin
    expect(tenGod('wood', 'yin', 'metal', 'yang')).toBe('officer')
  })
})

// ─── Tagline output sanity ─────────────────────────────────────────────

describe('goalTagline() output', () => {
  test('returns a non-empty string for every domain', () => {
    const tally: ChartTally = tallyFromProfile({
      dayElement: 'wood', dayPolarity: 'yang', dominantElement: 'wood',
    })
    for (const d of DOMAINS) {
      const line = goalTagline(tally, d)
      expect(line).toBeTruthy()
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(8)
    }
  })

  test('tagline varies per chart (different day elements produce different lines)', () => {
    const wood: ChartTally = tallyFromProfile({ dayElement: 'wood', dayPolarity: 'yang', dominantElement: 'wood' })
    const metal: ChartTally = tallyFromProfile({ dayElement: 'metal', dayPolarity: 'yin', dominantElement: 'metal' })
    const water: ChartTally = tallyFromProfile({ dayElement: 'water', dayPolarity: 'yang', dominantElement: 'water' })

    const woodCareer = goalTagline(wood, 'career')
    const metalCareer = goalTagline(metal, 'career')
    const waterCareer = goalTagline(water, 'career')

    // At least two of the three must be distinct lines, otherwise the engine
    // is not chart-specific.
    const distinct = new Set([woodCareer, metalCareer, waterCareer])
    expect(distinct.size).toBeGreaterThanOrEqual(2)
  })

  test('career vs health produce different lines on the same chart', () => {
    const tally = tallyFromProfile({ dayElement: 'fire', dayPolarity: 'yang', dominantElement: 'fire' })
    expect(goalTagline(tally, 'career')).not.toEqual(goalTagline(tally, 'health'))
  })

  test('relationships tagline uses the spouse-palace rule (yin DM → wealth class, yang DM → officer class)', () => {
    // Yin DM relationships map to wealth class, career always to officer —
    // so on the same chart, the two lines must differ (different god class).
    const yinTally: ChartTally = tallyFromProfile({ dayElement: 'water', dayPolarity: 'yin', dominantElement: 'water' })
    expect(goalTagline(yinTally, 'career')).not.toEqual(goalTagline(yinTally, 'relationships'))
    // Yang DM: both career and relationships map to officer, so the lines
    // SHOULD match on the same chart — that's the correct mapping.
    const yangTally: ChartTally = tallyFromProfile({ dayElement: 'water', dayPolarity: 'yang', dominantElement: 'water' })
    expect(goalTagline(yangTally, 'career')).toEqual(goalTagline(yangTally, 'relationships'))
  })

  test('goalTaglineForDomain returns null when no profile', () => {
    expect(goalTaglineForDomain(null, 'career')).toBeNull()
  })

  test('goalTaglineForDomain returns a string when profile is provided', () => {
    const tagline = goalTaglineForDomain(
      { dayElement: 'wood', dayPolarity: 'yang', dominantElement: 'fire' },
      'career',
    )
    expect(typeof tagline).toBe('string')
    expect(tagline).toBeTruthy()
  })

  test('example from the issue description reproduces', () => {
    // "Officer element supported, press the advantage" appears for a chart
    // where the day element is supported by the dominant element.
    const tally = tallyFromProfile({ dayElement: 'wood', dayPolarity: 'yang', dominantElement: 'wood' })
    const career = goalTagline(tally, 'career')
    expect(career).toMatch(/Officer/i)
  })
})