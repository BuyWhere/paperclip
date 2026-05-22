'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--header-height)',
        background: 'rgba(13, 13, 15, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        padding: '0 2rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#fff',
            textDecoration: 'none',
            letterSpacing: '-0.03em',
          }}
        >
          8os
        </Link>

        {/* Nav links */}
        <nav className="header-nav-links" aria-label="Site navigation">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: pathname.startsWith(href) ? '#fff' : 'var(--color-text-secondary)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <Link
          href="/quiz"
          onClick={() => posthog.capture('quiz_start', { source: 'landing' })}
          style={{
            padding: '0.5rem 1.25rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '8px',
            color: '#fff',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Take the Quiz
        </Link>
      </div>
    </header>
  );
}
