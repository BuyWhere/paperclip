'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import posthog from 'posthog-js';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
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
            prefetch={false}
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#fff',
              textDecoration: 'none',
              letterSpacing: '-0.03em',
              whiteSpace: 'nowrap',
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
                prefetch={false}
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

          {/* CTA - Desktop */}
          <div className="header-cta-desktop">
            <Link
              href="/coming-soon"
              prefetch={false}
              onClick={() => posthog.capture('coming_soon_click', { source: 'header' })}
              style={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'var(--color-text-muted)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              July 7?{' '}
              <span style={{ color: '#c4b5fd', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                Reserve
              </span>
            </Link>
            <Link
              href="/quiz"
              prefetch={false}
              onClick={() => posthog.capture('quiz_start', { source: 'header' })}
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

          {/* Hamburger - Mobile */}
          <button
            className="header-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0.5rem',
            }}
          >
            {mobileMenuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: 'var(--header-height)',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            zIndex: 99,
            display: 'flex',
            flexDirection: 'column',
            padding: '1rem',
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              background: 'var(--color-bg-secondary)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: pathname.startsWith(href) ? '#fff' : 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  padding: '0.5rem 0',
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              background: 'var(--color-bg-secondary)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href="/coming-soon"
              prefetch={false}
              onClick={() => {
                posthog.capture('coming_soon_click', { source: 'header_mobile' });
                setMobileMenuOpen(false);
              }}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              July 7? Reserve
            </Link>
            <Link
              href="/quiz"
              prefetch={false}
              onClick={() => {
                posthog.capture('quiz_start', { source: 'header_mobile' });
                setMobileMenuOpen(false);
              }}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Take the Quiz
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
