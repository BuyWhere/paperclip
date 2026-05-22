/**
 * Input sanitization utilities.
 * - XSS: strip HTML tags and dangerous attributes
 * - Profanity: word-boundary filter (NSFW list)
 * - Date range: validate birth date within acceptable bounds
 */

// ─── XSS Sanitization ─────────────────────────────────────────────────────────

const HTML_TAG_RE = /<[^>]*>/g
const DANGEROUS_PROTOCOLS_RE = /^(javascript|data|vbscript):/i
const NULL_BYTE_RE = /\0/g

export function sanitizeString(input: string): string {
  return input
    .replace(NULL_BYTE_RE, '')
    .replace(HTML_TAG_RE, '')
    .trim()
}

export function sanitizeUrl(url: string): string {
  if (DANGEROUS_PROTOCOLS_RE.test(url.trim())) return ''
  return url.trim()
}

// ─── Profanity Filter ─────────────────────────────────────────────────────────
// Minimal list — extend via PROFANITY_WORDS env var (comma-separated)

const BASE_PROFANITY = ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'retard']

function getProfanityList(): RegExp[] {
  const custom = (process.env.PROFANITY_WORDS ?? '').split(',').filter(Boolean)
  return [...BASE_PROFANITY, ...custom].map(
    (word) => new RegExp(`\\b${word.trim()}\\b`, 'i'),
  )
}

let _profanityList: RegExp[] | null = null

export function containsProfanity(text: string): boolean {
  if (!_profanityList) _profanityList = getProfanityList()
  return _profanityList.some((re) => re.test(text))
}

export function assertNoProfanity(text: string, field = 'input'): void {
  if (containsProfanity(text)) {
    throw Object.assign(new Error(`Profanity detected in ${field}`), { status: 422 })
  }
}

// ─── Date Range Validation ────────────────────────────────────────────────────

const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = new Date().getFullYear() - 5 // must be at least 5 years old

export function validateBirthDate(dateStr: string): { valid: boolean; reason?: string } {
  const parsed = new Date(dateStr)
  if (isNaN(parsed.getTime())) return { valid: false, reason: 'Invalid date format' }
  const year = parsed.getUTCFullYear()
  if (year < MIN_BIRTH_YEAR) return { valid: false, reason: `Birth year must be ${MIN_BIRTH_YEAR} or later` }
  if (year > MAX_BIRTH_YEAR) return { valid: false, reason: `Birth year must be ${MAX_BIRTH_YEAR} or earlier` }
  return { valid: true }
}

// ─── Generic text field validator ─────────────────────────────────────────────

export function validateTextField(
  value: unknown,
  opts: { field: string; maxLength?: number; required?: boolean } = { field: 'field' },
): string {
  if (value === null || value === undefined || value === '') {
    if (opts.required !== false) throw Object.assign(new Error(`${opts.field} is required`), { status: 400 })
    return ''
  }
  if (typeof value !== 'string') throw Object.assign(new Error(`${opts.field} must be a string`), { status: 400 })
  const cleaned = sanitizeString(value)
  const max = opts.maxLength ?? 2000
  if (cleaned.length > max) {
    throw Object.assign(new Error(`${opts.field} must be at most ${max} characters`), { status: 400 })
  }
  return cleaned
}
