'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface UserProfile {
  id: string
  email: string | null
  phone: string | null
  role: string
  emailVerified: boolean
  phoneVerified: boolean
  onboardingDone: boolean
  createdAt: string
}

export default function ProfileSettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleteMsg, setDeleteMsg] = useState('')

  useEffect(() => {
    fetch('/api/user/profile')
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  async function handleExport() {
    window.location.href = '/api/user/export'
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault()
    setDeleteMsg('')
    const res = await fetch('/api/user/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: deletePhrase }),
    })
    const data = await res.json()
    if (!res.ok) {
      setDeleteMsg(data.error ?? 'Deletion failed')
      return
    }
    setDeleteMsg(data.message)
    setTimeout(() => router.push('/login'), 2000)
  }

  if (loading) return <main style={styles.main}><p style={{ color: '#666' }}>Loading…</p></main>
  if (error) return <main style={styles.main}><p style={{ color: '#ff6b6b' }}>{error}</p></main>
  if (!user) return null

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <div style={styles.header}>
          <Link href="/dashboard" style={styles.back}>← Dashboard</Link>
          <h1 style={styles.title}>Account settings</h1>
        </div>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Profile</h2>
          <div style={styles.row}>
            <span style={styles.label}>Email</span>
            <span style={styles.value}>{user.email ?? '—'} {user.emailVerified ? '✓' : '(unverified)'}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Phone</span>
            <span style={styles.value}>{user.phone ?? '—'} {user.phone && (user.phoneVerified ? '✓' : '(unverified)')}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Role</span>
            <span style={{ ...styles.value, textTransform: 'capitalize' }}>{user.role}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Member since</span>
            <span style={styles.value}>{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Sign-in security</h2>
          <p style={{ color: '#999', fontSize: '0.875rem', margin: 0 }}>
            Authentication, active sessions, connected accounts, and MFA are now managed by Clerk.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Your data</h2>
          <p style={{ color: '#999', fontSize: '0.875rem' }}>Download a copy of all data we have stored about you.</p>
          <button onClick={handleExport} style={styles.btn}>Export data (JSON)</button>
        </section>

        <section style={{ ...styles.section, borderColor: '#3d1a1a' }}>
          <h2 style={{ ...styles.sectionTitle, color: '#ff6b6b' }}>Delete account</h2>
          <p style={{ color: '#999', fontSize: '0.875rem' }}>
            Permanently remove your local 8OS account data. Type DELETE to confirm.
          </p>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} style={styles.dangerBtn}>Delete my account</button>
          ) : (
            <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              {deleteMsg && <p style={{ color: '#ff6b6b', fontSize: '0.875rem', margin: 0 }}>{deleteMsg}</p>}
              <input
                type="text"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                placeholder="Type DELETE"
                required
                style={styles.input}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={styles.dangerBtn}>Confirm deletion</button>
                <button type="button" onClick={() => setDeleteConfirm(false)} style={styles.ghostBtn}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: { display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: '2rem 1rem', background: '#0a0a0a' },
  container: { width: '100%', maxWidth: '600px' },
  header: { marginBottom: '2rem' },
  back: { color: '#666', textDecoration: 'none', fontSize: '0.875rem' },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#ededed', margin: '0.5rem 0 0' },
  section: { background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '1rem', fontWeight: '600', color: '#ededed', margin: '0 0 1rem' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1a1a1a' },
  label: { color: '#666', fontSize: '0.875rem' },
  value: { color: '#ccc', fontSize: '0.875rem' },
  input: { background: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', padding: '0.625rem 0.875rem', color: '#ededed', fontSize: '0.9rem', outline: 'none' },
  btn: { background: '#ededed', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '0.625rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  dangerBtn: { background: '#3d1a1a', color: '#ff6b6b', border: '1px solid #5c2020', borderRadius: '8px', padding: '0.625rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  ghostBtn: { background: 'none', color: '#666', border: '1px solid #333', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.9rem', cursor: 'pointer' },
}
