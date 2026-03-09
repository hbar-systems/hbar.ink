import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          fontFamily: 'Georgia, serif',
          color: '#1a1a1a',
          letterSpacing: '-0.02em',
        }}
      >
        ℏ
      </div>
    ),
    { ...size }
  )
}
