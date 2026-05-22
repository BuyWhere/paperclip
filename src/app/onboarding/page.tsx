'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

type Step = 'birthdate' | 'quiz' | 'archetype' | 'goals' | 'complete';

interface StepIndicatorProps {
  current: Step;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  const steps: Step[] = ['birthdate', 'quiz', 'archetype', 'goals', 'complete'];
  const currentIndex = steps.indexOf(current);

  return (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      justifyContent: 'center',
      marginBottom: '2rem',
    }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i < currentIndex ? '100%' : i === currentIndex ? '2rem' : '0.5rem',
            height: '0.25rem',
            borderRadius: '9999px',
            background: i < currentIndex
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : i === currentIndex
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'rgba(255,255,255,0.2)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('birthdate');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthLocation, setBirthLocation] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});

  const getTrackedArchetype = () => {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage.getItem('8os_archetype_id') ?? window.sessionStorage.getItem('8os_archetype_id') ?? undefined;
  };

  const handleBirthDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    posthog.capture('birth_submitted', { birth_date: birthDate });
    setStep('quiz');
  };

  const handleQuizSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    posthog.capture('quiz_completed', { archetype: getTrackedArchetype() ?? 'unknown' });
    setStep('archetype');
  };

  const handleArchetypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    posthog.capture('sign_up');
    setStep('goals');
  };

  const handleGoalsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('complete');
  };

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)',
    }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <StepIndicator current={step} total={5} />

        {step === 'birthdate' && (
          <form onSubmit={handleBirthDateSubmit} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '2rem',
          }}>
            <h1 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: '#fff',
            }}>
              When were you born?
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: '#888',
              marginBottom: '2rem',
            }}>
              Your BaZi chart is calculated from your exact birth details
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                style={{
                  padding: '1rem',
                  fontSize: '1rem',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <input
                type="time"
                value={birthTime}
                onChange={(e) => setBirthTime(e.target.value)}
                placeholder="Birth time (optional)"
                style={{
                  padding: '1rem',
                  fontSize: '1rem',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                value={birthLocation}
                onChange={(e) => setBirthLocation(e.target.value)}
                placeholder="Birth location (city, country)"
                style={{
                  padding: '1rem',
                  fontSize: '1rem',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          </form>
        )}

        {step === 'quiz' && (
          <form onSubmit={handleQuizSubmit} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '2rem',
          }}>
            <h1 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: '#fff',
            }}>
              Quick Personality Quiz
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: '#888',
              marginBottom: '2rem',
            }}>
              10 questions to understand how you work
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '0.875rem', color: '#aaa', marginBottom: '0.5rem' }}>1. When solving a complex problem, you prefer to:</p>
                <select
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none',
                  }}
                >
                  <option value="">Select an option</option>
                  <option value="systematic">Break it into steps and execute systematically</option>
                  <option value="intuitive">Explore broadly and see patterns emerge</option>
                  <option value="analytical">Gather all data before deciding</option>
                  <option value="instinctive">Trust your gut and act quickly</option>
                </select>
              </div>

              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '0.875rem', color: '#aaa', marginBottom: '0.5rem' }}>2. Your ideal work environment is:</p>
                <select
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none',
                  }}
                >
                  <option value="">Select an option</option>
                  <option value="structured">Structured schedule, clear deadlines</option>
                  <option value="flexible">Flexible hours, creative space</option>
                  <option value="quiet">Quiet focus, deep work blocks</option>
                  <option value="dynamic">Dynamic chaos, rapid pivots</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          </form>
        )}

        {step === 'archetype' && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '3rem 2rem',
          }}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#667eea',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '1rem',
            }}>
              Your Archetype
            </div>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              marginBottom: '1rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              The Commander
            </h1>
            <p style={{
              fontSize: '1rem',
              color: '#aaa',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}>
              Forge your path with precision. Your Metal energy drives efficiency and discipline.
            </p>
            <button
              onClick={handleArchetypeSubmit}
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'goals' && (
          <form onSubmit={handleGoalsSubmit} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '2rem',
          }}>
            <h1 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: '#fff',
            }}>
              What matters most to you?
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: '#888',
              marginBottom: '2rem',
            }}>
              Select 1-5 goal domains
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
              marginBottom: '2rem',
            }}>
              {['Career', 'Wealth', 'Health', 'Relationships', 'Learning', 'Legacy'].map((domain) => (
                <div
                  key={domain}
                  style={{
                    padding: '1rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {domain}
                </div>
              ))}
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          </form>
        )}

        {step === 'complete' && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '3rem 2rem',
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}>
              🎉
            </div>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginBottom: '1rem',
              color: '#fff',
            }}>
              Onboarding complete!
            </h1>
            <p style={{
              fontSize: '1rem',
              color: '#aaa',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}>
              Welcome to 8os. Your personalized operating system is now configured for how you work.
            </p>
            <a
              href="/dashboard"
              style={{
                display: 'inline-block',
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              View Dashboard
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
