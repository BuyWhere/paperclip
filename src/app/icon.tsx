import { ImageResponse } from 'next/og'

// Route /favicon.ico is auto-served by Next.js from this file convention.
// See https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
