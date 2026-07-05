import type { Metadata } from 'next'
import Link from 'next/link'

// OS-2671: /search was returning HTTP 404 on 8os.ai. Search is not implemented
// in the v1 launch (2026-07-07), but the URL was reachable (curl confirmed) and
// the 404 was a launch-blocker regression. This page returns 200 with a short
// notice + useful links so direct navigation, mis-linked crawlers, and bookmarks
// all resolve to real content instead of a Next.js not-found screen. Marked
// `noindex` so Google doesn't index a transient stub.
export const metadata: Metadata = {
  title: 'Search — 8os',
  description:
    '8os does not expose a public search index yet. Browse the blog, archetypes, or reserve early access for the July 7, 2026 launch.',
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: '/search',
  },
}

export default function SearchPage() {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        color: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: '38rem',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <p
          aria-hidden
          style={{
            fontSize: '0.85rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#E8B86D',
            margin: 0,
            marginBottom: '1rem',
            fontWeight: 600,
          }}
        >
          8os · search
        </p>
        <h1
          style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 600,
            lineHeight: 1.15,
            margin: 0,
            marginBottom: '1.25rem',
          }}
        >
          Search isn&rsquo;t available yet
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.6,
            color: '#a3a3a3',
            margin: 0,
            marginBottom: '2.25rem',
          }}
        >
          A public search index isn&rsquo;t part of the July 7, 2026 launch. In the
          meantime, the fastest way to find what you&rsquo;re looking for is one of
          the links below.
        </p>

        <nav
          aria-label="Search alternatives"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            justifyContent: 'center',
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Link
            href="/"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Homepage
          </Link>
          <Link
            href="/blog"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Blog
          </Link>
          <Link
            href="/archetypes"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Archetypes
          </Link>
          <Link
            href="/how-it-works"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            How it works
          </Link>
          <Link
            href="/coming-soon"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '999px',
              background: '#1A1B4B',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.9rem',
            }}
          >
            Reserve early access
          </Link>
        </nav>
      </div>
    </main>
  )
}
