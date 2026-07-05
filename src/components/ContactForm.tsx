'use client'

import { FormEvent, useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Please enter your email address.'
  if (trimmed.length > 254) return 'That email is too long.'
  if (!EMAIL_REGEX.test(trimmed)) return 'Please enter a valid email address.'
  return null
}

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [messageText, setMessageText] = useState('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [notice, setNotice] = useState('')

  const clearError = () => {
    if (status === 'error') {
      setStatus('idle')
      setNotice('')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')

    if (website) {
      setStatus('success')
      setNotice('Thanks — your message has been sent.')
      setName('')
      setEmail('')
      setSubject('')
      setMessageText('')
      return
    }

    if (!name.trim()) {
      setStatus('error')
      setNotice('Please enter your name.')
      return
    }

    const emailError = validateEmail(email)
    if (emailError) {
      setStatus('error')
      setNotice(emailError)
      return
    }

    if (!subject.trim()) {
      setStatus('error')
      setNotice('Please add a subject.')
      return
    }

    if (!messageText.trim()) {
      setStatus('error')
      setNotice('Please write a message.')
      return
    }

    setStatus('loading')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: messageText.trim(),
        }),
      })

      const data = await response.json().catch(() => ({} as { error?: string }))

      if (response.ok) {
        setStatus('success')
        setNotice('Thanks — your message has been sent. We’ll get back to you soon.')
        setName('')
        setEmail('')
        setSubject('')
        setMessageText('')
      } else {
        setStatus('error')
        setNotice(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setNotice('Failed to send your message. Check your connection and try again.')
    }
  }

  const fieldStyle = {
    width: '100%',
    padding: '0.875rem 1rem',
    fontSize: '1rem',
    background: 'rgba(0,0,0,0.24)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: '0.5rem',
  }

  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        padding: '1.5rem',
      }}
    >
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem' }}>
        Send us a message
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Tell us what you need and the right person on the 8os team will follow up.
      </p>

      <form onSubmit={handleSubmit} noValidate aria-label="Contact 8os" style={{ display: 'grid', gap: '1rem' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-10000px',
            top: 'auto',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="contact-name" style={labelStyle}>Name</label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              clearError()
            }}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="contact-email" style={labelStyle}>Email</label>
          <input
            id="contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              clearError()
            }}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="contact-subject" style={labelStyle}>Subject</label>
          <input
            id="contact-subject"
            type="text"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value)
              clearError()
            }}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="contact-message" style={labelStyle}>Message</label>
          <textarea
            id="contact-message"
            rows={6}
            value={messageText}
            onChange={(event) => {
              setMessageText(event.target.value)
              clearError()
            }}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          aria-busy={status === 'loading'}
          style={{
            padding: '0.875rem 1.25rem',
            fontSize: '1rem',
            fontWeight: 700,
            background: status === 'loading' ? '#555' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '10px',
            color: '#fff',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'loading' ? 'Sending…' : 'Send message'}
        </button>
      </form>

      {notice && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          aria-live={status === 'error' ? 'assertive' : 'polite'}
          style={{
            marginTop: '1rem',
            marginBottom: 0,
            color: status === 'error' ? '#ef4444' : '#22c55e',
            fontSize: '0.875rem',
          }}
        >
          {notice}
        </p>
      )}
    </div>
  )
}
