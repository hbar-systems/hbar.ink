'use client'

export default function DocError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h2>Doc page crashed</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{error?.message}</pre>
      <button onClick={() => reset()}>Retry</button>
    </div>
  )
}
