'use client'

interface Props {
  href: string
  label: string
}

export function GoogleAuthButton({ href, label }: Props) {
  return (
    <a href={href} style={styles.button}>
      <span style={styles.icon}>G</span>
      <span>{label}</span>
    </a>
  )
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#0f0f0f',
    color: '#ededed',
    textDecoration: 'none',
    fontSize: '0.95rem',
    fontWeight: '600',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.5rem',
    height: '1.5rem',
    borderRadius: '999px',
    background: '#fff',
    color: '#111',
    fontSize: '0.85rem',
    fontWeight: '700',
  },
}
