'use client'

import { useEffect, useState } from 'react'

export function LiveCounter() {
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    fetch('/api/waitlist/count')
      .then((r) => r.json())
      .then((data) => setWaitlistCount(data.count ?? null))
      .catch(() => {});

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        hour12: true,
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  if (waitlistCount === null) return null;

  return (
    <div
      style={{
        fontSize: '0.7rem',
        color: 'var(--color-text-muted)',
        marginTop: '0.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#22c55e',
          flexShrink: 0,
        }}
      />
      Updated live &mdash; {waitlistCount.toLocaleString()} users
      {currentTime && <>&nbsp;&middot;&nbsp;{currentTime}</>}
    </div>
  );
}
