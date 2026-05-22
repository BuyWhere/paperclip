'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { caldiyApi } from '@/lib/caldiy/client';
import type { CalDiyBooking } from '@/types/caldiy';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Productivity Coach',
    avatar: 'SC',
    content: 'This completely transformed how I approach my mornings. The AI understands my work style better than I do.',
    archetype: 'Strategic Commander',
    rating: 5,
  },
  {
    name: 'Marcus Rodriguez',
    role: 'Startup Founder',
    avatar: 'MR',
    content: 'Finally a system that adapts to me, not the other way around. BaZi insights are surprisingly accurate.',
    archetype: 'Nurturing Creative',
    rating: 5,
  },
  {
    name: 'Emily Watson',
    role: 'Marketing Director',
    avatar: 'EW',
    content: 'The scheduling intelligence is incredible. It knows exactly when I\'m most productive and protects that time.',
    archetype: 'Steady Achiever',
    rating: 5,
  },
  {
    name: 'David Kim',
    role: 'Software Engineer',
    avatar: 'DK',
    content: 'Built my entire task management around this. The archetype system actually gets my energy patterns.',
    archetype: 'Harmonizer Guardian',
    rating: 5,
  },
];

const mediaLogos = [
  { name: 'TechCrunch', initials: 'TC' },
  { name: 'Product Hunt', initials: 'PH' },
  { name: 'Indie Hackers', initials: 'IH' },
  { name: 'Hacker News', initials: 'HN' },
];

export default function Home() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [calDiyUrl] = useState(() => process.env.NEXT_PUBLIC_CALDIY_URL || '');
  const [bookings, setBookings] = useState<CalDiyBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [osGeneratedCount] = useState(247);
  const [testimonialIndex, setTestimonialIndex] = useState(0);

  const howItWorksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!calDiyUrl) return;

    async function loadBookings() {
      setBookingsLoading(true);
      try {
        const data = await caldiyApi.bookings.list({ status: 'accepted', limit: 5 });
        setBookings(data.bookings || []);
      } catch {
        console.error('Failed to load Cal.diy bookings');
      } finally {
        setBookingsLoading(false);
      }
    }

    loadBookings();
  }, [calDiyUrl]);

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(`Welcome! You're #${data.position} on the waitlist.`);
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setMessage('Failed to join waitlist');
    }
  };

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minHeight: '100vh',
      padding: '4rem 2rem 2rem',
      textAlign: 'center',
      background: 'var(--color-bg-primary)',
    }}>
      <div style={{ maxWidth: '720px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Personalized Operating System
        </div>

        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #fff 0%, #999 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1.1,
        }}>
          Generate Your Life OS in 90 Seconds
        </h1>

        <p style={{
          fontSize: '1.25rem',
          color: '#aaa',
          marginBottom: '1.5rem',
          lineHeight: 1.6,
        }}>
          Free. No credit card. Works in Telegram.
        </p>

        <nav aria-label="Page navigation" style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '2rem',
        }}>
          <button
            onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.125rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'transform 0.2s, opacity 0.2s',
              boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
            }}
          >
            Get Started
          </button>
          <button
            onClick={scrollToHowItWorks}
            aria-label="See How It Works"
            style={{
              padding: '1rem 2rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            See How It Works
          </button>
        </nav>

        <div style={{
          display: 'flex',
          gap: '2rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '3rem',
        }}>
          {[
            { label: '38M+', sublabel: 'Configurations' },
            { label: 'Based on', sublabel: 'BaZi' },
            { label: 'AI', sublabel: 'Powered' },
          ].map((badge) => (
            <div key={badge.sublabel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#667eea',
              }}>
                {badge.label}
              </span>
              <span style={{
                fontSize: '0.875rem',
                color: '#888',
              }}>
                {badge.sublabel}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '2rem',
          backdropFilter: 'blur(10px)',
          marginBottom: '3rem',
        }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: '#667eea',
            marginBottom: '0.5rem',
          }}>
            {osGeneratedCount.toLocaleString()} OS generated today
          </div>
          <p style={{
            fontSize: '0.875rem',
            color: '#666',
          }}>
            Join thousands who've already built their personal operating system
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '2rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '3rem',
        }}>
          {[
            { title: 'Adaptive AI', desc: 'Learns your patterns' },
            { title: 'Unified Workspace', desc: 'All your tools in one' },
            { title: 'Privacy First', desc: 'Your data stays yours' },
            { title: 'Scheduling', desc: 'Built-in Cal.diy integration' },
          ].map((feature) => (
            <div key={feature.title} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#667eea',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.25rem',
              }}>
                {feature.title}
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: '#666',
              }}>
                {feature.desc}
              </div>
            </div>
          ))}
        </div>

        <div ref={howItWorksRef} id="how-it-works" style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '3rem 2rem',
          backdropFilter: 'blur(10px)',
          marginBottom: '3rem',
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: '2rem',
            color: '#fff',
          }}>
            How It Works
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '2rem',
          }}>
            {[
              { step: '1', title: 'Enter Your Birth Date', desc: 'BaZi analysis based on your exact birth details' },
              { step: '2', title: 'Answer 10 Questions', desc: 'Quick personality quiz to understand your work style' },
              { step: '3', title: 'Get Your Archetype', desc: 'AI-powered OS tailored to how you operate' },
              { step: '4', title: 'Set Your Goals', desc: 'Define what matters and let the system adapt to you' },
            ].map((item) => (
              <div key={item.step} style={{
                padding: '1.5rem',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                }}>
                  {item.step}
                </div>
                <h3 style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  color: '#fff',
                }}>
                  {item.title}
                </h3>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#888',
                  lineHeight: 1.5,
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          marginBottom: '3rem',
        }}>
          <p style={{
            textAlign: 'center',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '1.5rem',
          }}>
            As Seen On
          </p>
          <div style={{
            display: 'flex',
            gap: '3rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: '3rem',
          }}>
            {mediaLogos.map((logo) => (
              <div key={logo.name} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                opacity: 0.5,
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#888',
                }}>
                  {logo.initials}
                </div>
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#666',
                }}>
                  {logo.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Articles / content grid */}
        <div id="articles" style={{ width: '100%', marginBottom: '3rem', textAlign: 'left' }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: '0.375rem',
            color: '#fff',
          }}>
            From the 8os Journal
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            Insights on productivity, BaZi, and building your Life OS.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
          }}>
            {[
              {
                tag: 'BaZi',
                title: 'Why Your Birth Chart Predicts Your Productivity Style',
                excerpt: 'Ancient Chinese metaphysics encoded in 38 million+ configurations — and what that means for how you work best.',
                readTime: '5 min read',
                accent: '#667eea',
              },
              {
                tag: 'AI & Systems',
                title: 'Building a Life Operating System with AI',
                excerpt: 'The principles behind a personalized OS that adapts to your energy, goals, and daily rhythm instead of fighting them.',
                readTime: '7 min read',
                accent: '#764ba2',
              },
              {
                tag: 'Productivity',
                title: 'The Myth of the Universal Morning Routine',
                excerpt: 'Why the 5 AM club works for some people and destroys others — and how to find your real peak hours.',
                readTime: '4 min read',
                accent: '#22c55e',
              },
            ].map((article) => (
              <div
                key={article.title}
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  transition: 'border-color 0.2s',
                }}
              >
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: article.accent,
                }}>
                  {article.tag}
                </span>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#fff', margin: 0, lineHeight: 1.4 }}>
                  {article.title}
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
                  {article.excerpt}
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 'auto',
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{article.readTime}</span>
                  <span style={{ fontSize: '0.75rem', color: article.accent, fontWeight: 500 }}>Coming soon →</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '3rem 2rem',
          backdropFilter: 'blur(10px)',
          marginBottom: '3rem',
        }}>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: '#fff',
          }}>
            What People Are Saying
          </h2>
          <p style={{
            fontSize: '0.875rem',
            color: '#666',
            marginBottom: '2rem',
          }}>
            Join thousands who've already built their personal operating system
          </p>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '3rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '1rem',
            }}>
              {testimonials[testimonialIndex].avatar}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.25rem',
              marginBottom: '1rem',
            }}>
              {[...Array(5)].map((_, i) => (
                <span key={i} style={{ color: '#fbbf24', fontSize: '1rem' }}>★</span>
              ))}
            </div>
            <p style={{
              fontSize: '1.125rem',
              color: '#ccc',
              lineHeight: 1.7,
              marginBottom: '1.5rem',
              fontStyle: 'italic',
            }}>
              &ldquo;{testimonials[testimonialIndex].content}&rdquo;
            </p>
            <p style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: '#fff',
            }}>
              {testimonials[testimonialIndex].name}
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: '#888',
            }}>
              {testimonials[testimonialIndex].role}
            </p>
            <div style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.375rem 0.75rem',
              background: 'rgba(102, 126, 234, 0.15)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              color: '#667eea',
              fontWeight: 500,
            }}>
              {testimonials[testimonialIndex].archetype}
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            marginTop: '2rem',
          }}>
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setTestimonialIndex(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: 'none',
                  background: i === testimonialIndex ? '#667eea' : 'rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        </div>

        <div id="waitlist" style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '2rem',
          backdropFilter: 'blur(10px)',
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}>
            Join the Waitlist
          </h2>
          <p style={{
            fontSize: '0.875rem',
            color: '#666',
            marginBottom: '1.5rem',
          }}>
            Be the first to experience 8os when we launch.
          </p>

          {status === 'success' ? (
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              color: '#22c55e',
            }}>
              {message}
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}>
              <label htmlFor="waitlist-email" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                Email address
              </label>
              <input
                id="waitlist-email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  flex: '1 1 240px',
                  padding: '0.875rem 1rem',
                  fontSize: '1rem',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  padding: '0.875rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  background: status === 'loading' ? '#555' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p style={{
              marginTop: '1rem',
              color: '#ef4444',
              fontSize: '0.875rem',
            }}>
              {message}
            </p>
          )}
        </div>

        {calDiyUrl && (
          <div style={{
            marginTop: '3rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '2rem',
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}>
              Upcoming Bookings
            </h2>
            {bookingsLoading ? (
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Loading bookings...</p>
            ) : bookings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    style={{
                      padding: '1rem',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 500 }}>{booking.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>
                        {new Date(booking.startTime).toLocaleString()}
                      </div>
                    </div>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      background: booking.status === 'accepted' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
                      color: booking.status === 'accepted' ? '#22c55e' : '#999',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}>
                      {booking.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#666', fontSize: '0.875rem' }}>
                No upcoming bookings. Configure Cal.diy to see your schedule here.
              </p>
            )}
            <div style={{ marginTop: '1rem' }}>
              <a
                href={`${calDiyUrl}/book`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '8px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Book a Meeting
              </a>
            </div>
          </div>
        )}
      </div>

      <footer style={{
        width: '100%',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        marginTop: '4rem',
        padding: '3rem 2rem',
        color: '#555',
        fontSize: '0.875rem',
      }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '2rem',
            marginBottom: '2.5rem',
          }}>
            <div>
              <div style={{ fontWeight: 700, color: '#ededed', marginBottom: '0.75rem', fontSize: '1rem' }}>8os</div>
              <p style={{ lineHeight: 1.6, color: '#555' }}>
                A personalized operating system unique to every person on Earth.
              </p>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#999', marginBottom: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li><Link href="/features" style={{ color: '#666', textDecoration: 'none' }}>Features</Link></li>
                <li><Link href="/onboarding" style={{ color: '#666', textDecoration: 'none' }}>Get Started</Link></li>
              </ul>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#999', marginBottom: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Learn</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li><Link href="/blog" style={{ color: '#666', textDecoration: 'none' }}>Blog</Link></li>
                <li><Link href="/archetypes/explorer" style={{ color: '#666', textDecoration: 'none' }}>Archetype Explorer</Link></li>
              </ul>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#999', marginBottom: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Company</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li><Link href="/contact" style={{ color: '#666', textDecoration: 'none' }}>Contact</Link></li>
                <li><Link href="/privacy" style={{ color: '#666', textDecoration: 'none' }}>Privacy</Link></li>
                <li><Link href="/terms" style={{ color: '#666', textDecoration: 'none' }}>Terms</Link></li>
              </ul>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem', color: '#444', fontSize: '0.8rem' }}>
            © {new Date().getFullYear()} 8os. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  )
}
