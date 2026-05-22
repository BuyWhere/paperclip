'use client'

import type { CSSProperties, ReactNode } from 'react'

export function SkeletonBlock({
  width = '100%',
  height,
  radius = 8,
  style,
}: {
  width?: CSSProperties['width']
  height: number | string
  radius?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #141414 0%, #1d1d1d 50%, #141414 100%)',
        backgroundSize: '200% 100%',
        animation: 'dashboardSkeletonPulse 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

export function SectionCard({
  children,
  accent = '#1e1e1e',
  style,
}: {
  children: ReactNode
  accent?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: '#111',
        border: `1px solid ${accent}`,
        borderRadius: 14,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 999,
        border: '1px solid #26263a',
        background: '#11131c',
        color: '#a5b4fc',
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#818cf8',
          boxShadow: '0 0 0 0 rgba(129, 140, 248, 0.45)',
          animation: 'dashboardStatusPulse 1.4s ease-in-out infinite',
        }}
      />
      {children}
    </div>
  )
}

export function ErrorCard({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <SectionCard accent="#3a1f24" style={{ textAlign: 'center', padding: 36 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h2>
      <p style={{ margin: '0 auto 20px', color: '#8f8f96', fontSize: 14, maxWidth: 480, lineHeight: 1.6 }}>
        {message}
      </p>
      <button
        onClick={onAction}
        style={{
          background: '#ededed',
          color: '#0a0a0a',
          border: 'none',
          borderRadius: 8,
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {actionLabel}
      </button>
    </SectionCard>
  )
}

export function DashboardPageStyles() {
  return (
    <style>{`
      @keyframes dashboardSkeletonPulse {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @keyframes dashboardStatusPulse {
        0% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.45); }
        70% { box-shadow: 0 0 0 8px rgba(129, 140, 248, 0); }
        100% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
      }
    `}</style>
  )
}
