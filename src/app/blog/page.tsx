import Link from 'next/link';
import type { Metadata } from 'next';
import { SidebarNav } from '@/components/SidebarNav';

export const metadata: Metadata = {
  title: 'Blog — 8os',
  description: 'Insights on productivity, BaZi, AI, and building your personalized Life OS.',
};

const SECTIONS = [
  { id: 'blog-header', label: 'Blog' },
  { id: 'coming-soon', label: 'Coming Soon' },
];

export default function BlogPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
      padding: '4rem 2rem',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', gap: '3rem', alignItems: 'flex-start' }}>

        <SidebarNav sections={SECTIONS} />

        <main style={{ flex: 1, minWidth: 0 }}>
          <Link href="/" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to 8os
          </Link>

          <section id="blog-header" style={{ marginTop: '2rem', marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Blog
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 0 }}>
              Insights on productivity, BaZi, AI, and building your personalized Life OS.
            </p>
          </section>

          <section id="coming-soon">
            <div style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              padding: '3rem 2rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✍️</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                Coming Soon
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                We&apos;re working on content about BaZi, AI-driven productivity, and how to get the most
                out of your personalized OS. Check back soon.
              </p>
              <div style={{ marginTop: '2rem' }}>
                <Link href="/" style={{
                  display: 'inline-block',
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '8px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}>
                  Try 8os Free
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
