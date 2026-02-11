'use client'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h2>App page crashed</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{error?.message}</pre>
      <button onClick={() => reset()}>Retry</button>
    </div>
  )
}
