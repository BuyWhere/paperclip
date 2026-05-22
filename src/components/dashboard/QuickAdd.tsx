'use client'

import { useState, useRef, useEffect } from 'react'

interface QuickAddResult {
  type: 'task' | 'drift'
  message?: string
  emotion?: string
  suggestions?: string[]
  task?: { id: string; name: string }
  parsed?: {
    domainId?: string
    scheduledHour?: number
    durationMinutes?: number
    priority?: string
  }
}

interface Props {
  onTaskAdded?: (result: QuickAddResult) => void
}

export function QuickAdd({ onTaskAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<QuickAddResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setResult(null)
      setInput('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/nlp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) })
      const data = await res.json()
      setResult(data)
      onTaskAdded?.(data)
      if (data.type === 'task') {
        setTimeout(() => { setOpen(false); setResult(null) }, 2500)
      }
    } catch {
      setResult({ type: 'task', message: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const DOMAIN_COLORS: Record<string, string> = {
    career: '#6366f1', wealth: '#f59e0b', health: '#22c55e',
    relationships: '#ec4899', learning: '#3b82f6', legacy: '#8b5cf6',
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        title="Quick Add (⌘K)"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 100,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: '#fff', transition: 'transform 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        +
      </button>

      {/* Modal Overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '15vh',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={{
            background: '#111', border: '1px solid #2a2a2a', borderRadius: 16,
            width: '100%', maxWidth: 540, padding: '20px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>✦</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='Try "Gym at 7pm" or "I feel stressed"'
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: '#ededed', fontSize: 16, fontFamily: 'inherit',
                  }}
                  disabled={loading}
                />
                {loading && <span style={{ color: '#666', fontSize: 13 }}>...</span>}
              </div>
            </form>

            {result && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: '#1a1a1a', border: '1px solid #222' }}>
                {result.type === 'task' && (
                  <div>
                    <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>✓ {result.message}</div>
                    {result.parsed?.domainId && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: DOMAIN_COLORS[result.parsed.domainId] + '22',
                        color: DOMAIN_COLORS[result.parsed.domainId],
                      }}>
                        {result.parsed.domainId}
                      </span>
                    )}
                  </div>
                )}
                {result.type === 'drift' && (
                  <div>
                    <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: 8 }}>💛 {result.message}</div>
                    {result.suggestions && (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {result.suggestions.map((s, i) => (
                          <li key={i} style={{ color: '#aaa', fontSize: 13, marginBottom: 4, paddingLeft: 12 }}>→ {s}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => setOpen(false)}
                      style={{ marginTop: 12, padding: '6px 16px', borderRadius: 6, background: '#1e1e1e', border: '1px solid #333', color: '#ededed', cursor: 'pointer', fontSize: 13 }}
                    >
                      Got it
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Gym at 7pm', 'Read for 30 minutes', 'Team call tomorrow at 3pm'].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, background: '#1a1a1a', border: '1px solid #2a2a2a',
                    color: '#666', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, color: '#444', fontSize: 11 }}>Press ⌘K to open · Esc to close</div>
          </div>
        </div>
      )}
    </>
  )
}
