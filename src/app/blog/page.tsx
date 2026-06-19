import Link from 'next/link';
import type { Metadata } from 'next';
import { SidebarNav } from '@/components/SidebarNav';
import { getAllBlogPosts } from '@/lib/content/blog';

export const metadata: Metadata = {
  title: 'Blog — 8os',
  description: 'Insights on productivity, BaZi, AI, and building your personalized Life OS.',
};

const SECTIONS = [
  { id: 'blog-header', label: 'Blog' },
];

export default function BlogPage() {
  const posts = getAllBlogPosts();

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
          {posts.length > 0 ? (
            <section>
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {posts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    style={{
                      display: 'block',
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '1.75rem',
                      textDecoration: 'none',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      {post.date} • {post.readTime}
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem 0' }}>
                      {post.title}
                    </h2>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
                      {post.excerpt}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                  No posts yet
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Check back soon for content about BaZi, AI-driven productivity, and building your personalized Life OS.
                </p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
