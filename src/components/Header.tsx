'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import posthog from 'posthog-js';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close the drawer on route change so it does not stay open across navigations.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

          {/* CTA — hidden on mobile via .header-cta-desktop */}
          <div className="header-cta-desktop" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              href="/login"
              prefetch={false}
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Sign in
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

          {/* Mobile hamburger — visible <=640px via .header-hamburger */}
          <button
            type="button"
            className="header-hamburger"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '0.4rem 0.55rem',
              color: '#fff',
              cursor: 'pointer',
              display: 'none',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {mobileMenuOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen ? (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 99,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 'var(--header-height)',
              right: 0,
              width: 'min(80vw, 320px)',
              height: 'calc(100vh - var(--header-height))',
              background: 'rgba(13, 13, 15, 0.98)',
              borderLeft: '1px solid var(--color-border)',
              padding: '1.5rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                prefetch={false}
                style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: '#fff',
                  textDecoration: 'none',
                  padding: '0.5rem 0',
                }}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login"
              prefetch={false}
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                padding: '0.5rem 0',
              }}
            >
              Sign in
            </Link>
            <Link
              href="/quiz"
              prefetch={false}
              onClick={() => posthog.capture('quiz_start', { source: 'header_mobile' })}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '8px',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '0.95rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Take the Quiz
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
