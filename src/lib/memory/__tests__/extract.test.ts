/**
 * OS-7620: Memory consolidation emits daily production exceptions.
 * Tests the fix: non-trivial gate uses user-authored text only, not total text.
 * Assistant-only windows are legitimately empty and must not trigger exception
 * tracking or unnecessary LLM retry overhead.
 *
 * Pattern: mock global.fetch (like flow-ai.test.ts) so the module under test
 * runs unchanged — no module-level mocking of createChatCompletion.
 */

// Mock global.fetch BEFORE importing the module so the flow-ai client uses it.
const mockFetch = jest.fn<typeof fetch>()
global.fetch = mockFetch

// Mock prisma before importing the module under test
const mockPrisma = {
  journalEntry: { findMany: jest.fn() },
  assistantConversation: { findMany: jest.fn() },
  assistantMessage: { findMany: jest.fn() },
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
}
jest.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }))

// Mock error tracking
const mockCaptureServerException = jest.fn()
jest.mock('@/lib/error-track', () => ({
  captureServerException: mockCaptureServerException,
}))

// Import after mocks are set — uses global.fetch for LLM calls (no flow-ai mock needed)
import { consolidateUser } from '../extract'

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.journalEntry.findMany.mockResolvedValue([])
  mockPrisma.assistantConversation.findMany.mockResolvedValue([])
  mockPrisma.assistantMessage.findMany.mockResolvedValue([])
  mockPrisma.$queryRawUnsafe.mockResolvedValue([])
  mockPrisma.$executeRawUnsafe.mockResolvedValue({} as never)
  // Default: no LLM calls (tests that call LLM set mockFetch explicitly).
  mockFetch.mockReset()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMessage(role: 'user' | 'assistant', content: string) {
  return { id: Math.random().toString(36), role, content, createdAt: new Date() }
}

function makeJournal(content: string) {
  return { id: Math.random().toString(36), content, kind: 'free', mood: null, createdAt: new Date() }
}

/** Set mockFetch to return a Flow AI response with the given memory/commitment arrays. */
function setLlmResponse(memory: unknown[], commitments: unknown[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ memory, commitments }) } }],
    }),
  } as unknown as Response)
}

/** Set mockFetch to return a parseable-but-empty LLM response. */
function setLlmEmptyResponse() {
  setLlmResponse([], [])
}

/** Set mockFetch to return an unparseable LLM response. */
function setLlmUnparseableResponse() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: 'Sorry, I could not process that.' } }],
    }),
  } as unknown as Response)
}

// ── OS-7620: Core fix — user-authored non-trivial gate ────────────────────────

describe('OS-7620: user-authored non-trivial gate', () => {
  /**
   * Root cause: an assistant-only window (proactive bot check-in ~280–560 chars)
   * was treated as "non-trivial" and fired exception tracking after both LLM
   * passes returned empty. The fix gates on user-authored text length so
   * assistant-only windows skip distillation entirely.
   */

  it('skips distillation for assistant-only window with 0 user-chars', async () => {
    // Exact PostHog failure shape: parsed=true, attempts=2, journalCount=0, messageCount=1.
    // The single message is an assistant check-in; userTextLength=0 → skip distillation.
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      makeMessage('assistant', 'Hey! Just checking in — how was your day? What\'s one thing you\'re grateful for right now?'),
    ])

    const result = await consolidateUser('user-1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.reason).toBe('no candidates')
    expect(result.usedLlm).toBe(false)
    // Critical: no exception for this legitimate empty window.
    expect(mockCaptureServerException).not.toHaveBeenCalled()
  })

  it('skips distillation when user journal is below 200 chars', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      makeJournal('Feeling good today.'), // 19 chars — below threshold
    ])
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      makeMessage('assistant', 'That\'s great to hear!'),
    ])

    const result = await consolidateUser('user-1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockCaptureServerException).not.toHaveBeenCalled()
  })

  it('triggers distillation when user journal exceeds 200 chars', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(250))])
    setLlmEmptyResponse()

    await consolidateUser('user-1')

    expect(mockFetch).toHaveBeenCalled()
  })

  it('triggers distillation when user chat messages exceed 200 chars', async () => {
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      makeMessage('user', 'A'.repeat(250)),
      makeMessage('assistant', 'Got it, thanks!'),
    ])
    setLlmEmptyResponse()

    await consolidateUser('user-1')

    expect(mockFetch).toHaveBeenCalled()
  })

  it('triggers distillation when user journal + user messages combined exceed 200 chars', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(100))])
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      makeMessage('user', 'B'.repeat(120)), // 100 + 120 = 220 > 200
      makeMessage('assistant', 'Thanks for sharing!'),
    ])
    setLlmEmptyResponse()

    await consolidateUser('user-1')

    expect(mockFetch).toHaveBeenCalled()
  })

  it('skips distillation for assistant-only window even with long assistant messages', async () => {
    // The original bug: long assistant messages made text > 200 chars even with userTextLength=0.
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      makeMessage('assistant', 'A'.repeat(400)),
      makeMessage('user', 'hi'), // 2 chars
      makeMessage('assistant', 'B'.repeat(300)),
    ])

    const result = await consolidateUser('user-1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.usedLlm).toBe(false)
  })
})

// ── Exception tracking (parse failures only) ──────────────────────────────────

describe('exception tracking (parse failures only)', () => {
  /**
   * The PostHog exception fired for ALL zero-candidate results, including
   * parseable-but-empty replies (the 85% assistant-only case). After the fix,
   * exception fires ONLY on actual parse failures (parsed=false).
   */

  it('fires exception on parse failure for non-trivial user input', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    setLlmUnparseableResponse()

    await consolidateUser('user-1')

    expect(mockCaptureServerException).toHaveBeenCalledTimes(1)
    expect(mockCaptureServerException.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((mockCaptureServerException.mock.calls[0][0] as Error).message)
      .toBe('memory consolidation yielded 0 candidates on non-trivial input')
  })

  it('does NOT fire exception for parseable-but-empty on non-trivial user input', async () => {
    // Both LLM passes return empty but parseable — not an error.
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    setLlmEmptyResponse()

    await consolidateUser('user-1')

    expect(mockCaptureServerException).not.toHaveBeenCalled()
  })

  it('does NOT fire exception when user text is below threshold', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('tiny')])
    // Should not call LLM at all.
    const result = await consolidateUser('user-1')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockCaptureServerException).not.toHaveBeenCalled()
    expect(result.reason).toBe('no candidates')
  })
})

// ── LLM integration ───────────────────────────────────────────────────────────

describe('LLM passthrough (happy paths)', () => {
  it('inserts a memory item returned by the LLM', async () => {
    // Journal content must be > 200 chars to trigger distillation (userTextLength > 200).
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      makeJournal('I started a new job at Acme Corp last Monday and I am really excited about the role and the team I will be working with. The projects look really interesting and I think I will learn a lot from my colleagues there.'),
    ])
    setLlmResponse(
      [{ kind: 'fact', content: 'Works at Acme Corp', salience: 4, source_kind: 'journal', source_id: 'j1' }],
      [],
    )

    await consolidateUser('user-1')

    const insertCall = mockPrisma.$executeRawUnsafe.mock.calls.find(
      (c: unknown[]) => String(c[0]).includes('INSERT INTO memory_items'),
    )
    expect(insertCall).toBeDefined()
  })

  it('merges (confirms) a near-duplicate memory item', async () => {
    // Journal content must be > 200 chars to trigger distillation.
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      makeJournal('My manager is Sarah Chen and she has been very supportive of my career growth and professional development goals. I really appreciate her mentorship and guidance in my day-to-day work and long-term career planning.'),
    ])
    setLlmResponse(
      [{ kind: 'person', content: 'Manager is Sarah', salience: 3, source_kind: 'journal', source_id: 'j1' }],
      [],
    )
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'existing-1', kind: 'person', content: 'Manager is Sarah Chen' },
    ])

    await consolidateUser('user-1')

    const updateCall = mockPrisma.$executeRawUnsafe.mock.calls.find(
      (c: unknown[]) => String(c[0]).includes('UPDATE memory_items'),
    )
    expect(updateCall).toBeDefined()
  })

  it('returns reason=unparseable llm reply on parse failure', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    setLlmUnparseableResponse()

    const result = await consolidateUser('user-1')

    expect(result.reason).toBe('unparseable llm reply')
    expect(result.candidatesMemory).toBe(0)
  })

  it('bypasses LLM when window has no source content', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([])
    mockPrisma.assistantConversation.findMany.mockResolvedValue([])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([])

    const result = await consolidateUser('user-1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.reason).toBe('no source in window')
    expect(result.usedLlm).toBe(false)
  })
})

// ── Retry-on-empty ───────────────────────────────────────────────────────────

describe('retry-on-empty (OS-2808)', () => {
  it('retries once when first pass returns empty on non-trivial user input', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    // First pass: empty but parseable; second pass: also empty.
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: '{"memory":[],"commitments":[]}' } }] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: '{"memory":[],"commitments":[]}' } }] }),
      } as unknown as Response)

    await consolidateUser('user-1')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('keeps first-pass result if second pass is unparseable but first was parseable', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: '{"memory":[],"commitments":[]}' } }] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: 'invalid json' } }] }),
      } as unknown as Response)

    const result = await consolidateUser('user-1')

    expect(result.usedLlm).toBe(true)
    expect(mockCaptureServerException).not.toHaveBeenCalled()
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles null content in journal entries gracefully', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      { id: 'j1', content: null, kind: 'free', mood: null, createdAt: new Date() },
      makeJournal('Real content here that is over 200 characters long. ' + 'x'.repeat(200)),
    ])
    setLlmEmptyResponse()

    const result = await consolidateUser('user-1')
    // 2nd journal is over threshold → LLM called
    expect(result.usedLlm).toBe(true)
  })

  it('handles null content in messages gracefully', async () => {
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    mockPrisma.assistantConversation.findMany.mockResolvedValue([{ id: 'conv1' }])
    mockPrisma.assistantMessage.findMany.mockResolvedValue([
      { id: 'm1', role: 'user', content: null, createdAt: new Date() },
    ])
    setLlmEmptyResponse()

    const result = await consolidateUser('user-1')
    // content:null is skipped; journal is still over threshold
    expect(result.usedLlm).toBe(true)
  })

  it('respects the at= option for backfill/testing', async () => {
    const pastDate = new Date('2026-09-10T12:00:00Z')
    mockPrisma.journalEntry.findMany.mockResolvedValue([makeJournal('A'.repeat(300))])
    setLlmEmptyResponse()

    await consolidateUser('user-1', { at: pastDate })

    expect(mockPrisma.journalEntry.findMany).toHaveBeenCalled()
    const call = mockPrisma.journalEntry.findMany.mock.calls[0][0]
    expect(call.where.createdAt.gte).toBeInstanceOf(Date)
  })
})
