/**
 * Ten-Gods BaZi goal tagline engine.
 *
 * For each user, given their Day Master element and chart element composition,
 * produce a chart-specific one-line tagline per goal domain. The Ten Gods are
 * derived from the relationships between the Day Master and the other stems in
 * the four pillars; we project that against the *domain* (career → Officer,
 * wealth → Wealth star, etc.) so each goal gets a chart-tuned nudge.
 *
 * This is intentionally pure + dependency-free so it can run in server
 * components and unit tests.
 */

export type GoalDomain = 'career' | 'wealth' | 'health' | 'relationships' | 'learning' | 'legacy'

const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'] as const
type Element = typeof ELEMENTS[number]

// Production cycle: wood → fire → earth → metal → water → wood
const PRODUCES: Record<Element, Element> = {
  wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood',
}
// Control cycle: wood → earth → water → fire → metal → wood
const CONTROLS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
}

// Ten-Gods classification by relationship between Day Master and a given stem.
// Index parity (same/different) → direct vs indirect. Element relation → god name.
// Rules per canonical BaZi:
//   Same element, same polarity = Friend (比肩)
//   Same element, diff polarity = Robber (劫财)
//   DM produces stem            = Food God (食神) if diff polarity, Hurt Officer (伤官) if same
//   Stem produces DM            = Resource/Seal (偏印 if diff polarity, 正印 if same)
//   DM controls stem            = Wealth (偏财 if diff polarity, 正财 if same)
//   Stem controls DM            = Officer (偏官/Seven Killings if diff polarity, 正官 if same)
export type TenGod =
  | 'friend' | 'robber'
  | 'food' | 'hurt'
  | 'resource' | 'indirect_resource'
  | 'wealth' | 'indirect_wealth'
  | 'officer' | 'indirect_officer'

export function tenGod(dayElement: Element, dayPolarity: 'yang' | 'yin', stemElement: Element, stemPolarity: 'yang' | 'yin'): TenGod {
  if (dayElement === stemElement) {
    return dayPolarity === stemPolarity ? 'friend' : 'robber'
  }
  if (PRODUCES[dayElement] === stemElement) {
    // DM produces stem → Output (Food God if diff polarity, Hurt Officer if same)
    return dayPolarity === stemPolarity ? 'hurt' : 'food'
  }
  if (PRODUCES[stemElement] === dayElement) {
    // Stem produces DM → Resource (印)
    return dayPolarity === stemPolarity ? 'resource' : 'indirect_resource'
  }
  if (CONTROLS[dayElement] === stemElement) {
    // DM controls stem → Wealth (财)
    return dayPolarity === stemPolarity ? 'indirect_wealth' : 'wealth'
  }
  // Stem controls DM → Officer (官)
  return dayPolarity === stemPolarity ? 'indirect_officer' : 'officer'
}

// ─── Chart composition ───────────────────────────────────────────────────

export interface ChartTally {
  dayElement: Element
  dayPolarity: 'yang' | 'yin'
  elementCounts: Record<Element, number>   // 0..8 across 4 pillars (stem + branch)
  dominant: Element                        // strongest element (ties: production-order wins)
}

export function tallyFromProfile(p: {
  dayElement: string
  dayPolarity: string
  dominantElement: string
}): ChartTally {
  const counts: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }
  // Without the full 4-pillar breakdown on the profile, seed at least the
  // day element + dominant so the tagline varies per chart.
  const dayEl = p.dayElement as Element
  const domEl = p.dominantElement as Element
  counts[dayEl] = (counts[dayEl] ?? 0) + 1
  if (domEl && domEl !== dayEl) {
    counts[domEl] = (counts[domEl] ?? 0) + 1
  }
  return {
    dayElement: dayEl,
    dayPolarity: (p.dayPolarity === 'yin' ? 'yin' : 'yang'),
    elementCounts: counts,
    dominant: domEl || dayEl,
  }
}

// ─── Per-domain Ten-God mapping ──────────────────────────────────────────
// Career     → Officer (官): commands, hierarchy, recognition
// Wealth     → Wealth (财): direct/indirect wealth stars
// Health     → Resource (印): nourishment, rest, support system
// Learning   → Resource (印): same Seal — book-learning and synthesis
// Relations  → Wealth for yin DM (女命), Officer for yang DM —
//              the "spouse palace" rule of thumb
// Legacy     → Output (食神/伤官): what you produce and leave behind

type GodClass = 'officer' | 'wealth' | 'resource' | 'output'

function domainGodClass(domain: GoalDomain, dayPolarity: 'yang' | 'yin'): GodClass {
  switch (domain) {
    case 'career':     return 'officer'
    case 'wealth':     return 'wealth'
    case 'health':     return 'resource'
    case 'learning':   return 'resource'
    case 'relationships':
      return dayPolarity === 'yin' ? 'wealth' : 'officer'
    case 'legacy':     return 'output'
  }
}

// ─── Strength scoring ────────────────────────────────────────────────────

// Strength = how supported the Day Master is by its supporting element
// (Resource element, i.e. what PRODUCES the day element) AND by Friend/Robber
// (same element). Weak = officer/wealth/output drain them; strong = they have
// backup.

function dayElementStrength(t: ChartTally): number {
  const dm = t.dayElement
  const same = t.elementCounts[dm] ?? 0
  // Resource element = what produces the Day Master
  const resourceEl = PRODUCES[dm]
  const resource = t.elementCounts[resourceEl] ?? 0
  // Officer element = what controls the Day Master
  const officerEl = CONTROLS[dm]
  const officer = t.elementCounts[officerEl] ?? 0
  return same + resource * 0.7 - officer * 0.5
}

// ─── Tagline generation ──────────────────────────────────────────────────

// Per-day-element Ten-God phrasings. Each chart element has its own line per
// god class + season modifier, so two charts with different day elements
// never produce the same text on the same domain. Lines stay chart-specific
// and varied across the 6 domains.

const OFFICER_LINES: Record<Element, [string, string, string]> = {
  // [inSeason, normal, pressured]
  wood:   ['Officer and Wood aligned — growth meets structure, advance with intent', 'Officer present, step into the role',     'Officer pressure on Wood — bend, do not break'],
  fire:   ['Officer lights Fire — visibility is high, speak up first',         'Officer visible, claim the seat',         'Officer dims Fire — conserve heat until stable'],
  earth:  ['Officer steadies Earth — protocol and patience both pay',         'Officer expects rigor, deliver it',       'Officer weighs on Earth — lighten the load'],
  metal:  ['Officer sharpens Metal — form and discipline cut clean',          'Officer demands form, sharpen up',        'Officer contests Metal — choose your hill'],
  water:  ['Officer channels Water — direction without forcing',              'Officer is the current, follow it',       'Officer dams Water — release in stages'],
}

const WEALTH_LINES: Record<Element, [string, string, string]> = {
  wood:   ['Wealth star roots Wood — long-game planting pays',                 'Wealth star steady, tend the seed',     'Wealth star thin — protect the trunk'],
  fire:   ['Wealth star fuels Fire — momentum converts to flow',              'Wealth star warm, convert carefully',     'Wealth star burns hot — pace the spend'],
  earth:  ['Wealth star fills Earth — keep what you store',                    'Wealth star consistent, hold the line',   'Wealth star erodes Earth — plug the leak'],
  metal:  ['Wealth star cuts clean — refine value before volume',             'Wealth star refined, sharpen the offer',  'Wealth star edges — value quality over speed'],
  water:  ['Wealth star flows with Water — multiple streams compound',         'Wealth star moves, follow the current',   'Wealth star leaks — consolidate the source'],
}

const RESOURCE_LINES: Record<Element, [string, string, string]> = {
  wood:   ['Resource feeds Wood — read, then grow',                            'Resource stable, integrate before action','Resource scarce — rest is study'],
  fire:   ['Resource tempers Fire — cool intake before output',                'Resource present, slow the burn',         'Resource overdraws Fire — pull back'],
  earth:  ['Resource grounds Earth — slow study lands deep',                   'Resource steady, build the base',         'Resource overwhelms Earth — let it sink'],
  metal:  ['Resource sharpens Metal — study cuts both ways',                    'Resource present, refine the model',      'Resource starves Metal — seek input'],
  water:  ['Resource fills Water — quiet study, wide surface',                 'Resource flows, absorb continuously',     'Resource is shallow — go deeper than wide'],
}

const OUTPUT_LINES: Record<Element, [string, string, string]> = {
  wood:   ['Output grows Wood — share early, refine late',                     'Output stable, ship the next branch',     'Output drains Wood — prune before publishing'],
  fire:   ['Output radiates from Fire — the platform is the message',         'Output visible, ride the warmth',         'Output burns the source — protect the core'],
  earth:  ['Output manifests through Earth — patient craft compounds',         'Output solid, let it set',                'Output scatters Earth — focus the form'],
  metal:  ['Output cuts from Metal — precision is the product',                'Output refined, polish before releasing', 'Output dulls — sharpen the edge first'],
  water:  ['Output flows from Water — let the current carry the work',         'Output present, surface what is ready',   'Output evaporates — capture before it leaves'],
}

// Map "is this Ten-God class supported/pressured by current chart energy" →
// a chart-specific line. Vary phrasing so each chart produces different text.
export function goalTagline(t: ChartTally, domain: GoalDomain): string {
  const godClass = domainGodClass(domain, t.dayPolarity)
  const strength = dayElementStrength(t)
  // Dominant element tells us what's "in season" right now in the chart
  const dom = t.dominant

  let lines: Record<Element, [string, string, string]>
  switch (godClass) {
    case 'officer':  lines = OFFICER_LINES;  break
    case 'wealth':   lines = WEALTH_LINES;   break
    case 'resource': lines = RESOURCE_LINES; break
    case 'output':   lines = OUTPUT_LINES;   break
  }

  // Pick which of the three lines (inSeason / normal / pressured).
  // "inSeason" when the dominant element supports the god class:
  //   officer supported when dom is DM or resource
  //   wealth supported when dom is DM or what DM controls
  //   resource supported when dom is what produces DM
  //   output supported when dom is what DM produces
  const dm = t.dayElement
  let inSeason = false
  if (godClass === 'officer') inSeason = dom === dm || PRODUCES[dm] === dom
  else if (godClass === 'wealth') inSeason = dom === dm || CONTROLS[dm] === dom
  else if (godClass === 'resource') inSeason = PRODUCES[dm] === dom
  else /* output */ inSeason = PRODUCES[dm] === dom

  let bucket: 0 | 1 | 2
  if (inSeason) bucket = 0
  else if (strength < 0) bucket = 2
  else bucket = 1

  return lines[dm][bucket]
}

// ─── Convenience: full pipeline from a goal domain + a profile snapshot ───

export interface GoalTaglineInput {
  dayElement: string
  dayPolarity: string
  dominantElement: string
}

export function goalTaglineForDomain(input: GoalTaglineInput | null, domain: GoalDomain): string | null {
  if (!input || !input.dayElement) return null
  const tally = tallyFromProfile(input)
  return goalTagline(tally, domain)
}