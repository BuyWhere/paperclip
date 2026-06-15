import { ImageResponse } from 'next/og'

// Serve /favicon.ico from the same icon rendering used by app/icon.tsx.
// Some browsers and curl fall back to /favicon.ico when no <link rel="icon">
// matches, so we expose the icon there too.
export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 800,
          borderRadius: 6,
          letterSpacing: '-0.05em',
        }}
      >
        8
      </div>
    ),
    { ...size }
  )
}
