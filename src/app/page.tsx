'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'

// hbar.ink — public marketing page.
// The page IS the instrument. One seeded drop from hbar (sealed, dated)
// explains the tool in its own format. Visitors can drop their own thoughts;
// drops live in localStorage only, ephemeral. The marketing IS the demo.

interface Drop {
  id: string
  text: string
  destination: string | null
  ts: string
  author?: string
  seeded?: boolean
}

const STORAGE_KEY = 'hbar.ink.demo.drops.v1'
const RECENT_LIMIT = 12

const SEEDED_DROP: Drop = {
  id: 'seed-2026-05-09-hbar-manifesto',
  text:
    "you're reading this on hbar.ink — the public window. it's just a webpage.\n\n" +
    "drops you type here live in your browser memory and disappear when you close the tab.\n\n" +
    "i made this for myself. to drop thoughts fast, route each one where it belongs, " +
    "and have a brain that remembers. the brain is the part you can't see — installed " +
    "locally, owned by you, federated with mine when we agree.\n\n" +
    "to keep your thoughts: install hbar.ink into your brain.",
  destination: 'hbar.systems/manifesto/',
  ts: '2026-05-09T13:00:00Z',
  author: 'hbar',
  seeded: true,
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function Home() {
  const [userDrops, setUserDrops] = useState<Drop[]>([])
  const [text, setText] = useState('')
  const [destination, setDestination] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setUserDrops(parsed)
      }
    } catch {}
    setLoaded(true)
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userDrops)) } catch {}
  }, [userDrops, loaded])

  const commit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const drop: Drop = {
      id: newId(),
      text: trimmed,
      destination: destination.trim() || null,
      ts: new Date().toISOString(),
    }
    setUserDrops(prev => [drop, ...prev])
    setText('')
    setStatus('sealed (in this browser only)')
    setTimeout(() => setStatus(''), 1600)
    textareaRef.current?.focus()
  }

  const remove = (id: string) => {
    setUserDrops(prev => prev.filter(d => d.id !== id))
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  // Render order: user drops newest-first, seeded drop always at the bottom
  // as the foundational reference.
  const drops = [...userDrops, SEEDED_DROP].slice(0, RECENT_LIMIT)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#f6f5f2', fontFamily: 'var(--font-spectral), Georgia, serif' }}
    >
      <header className="px-6 pt-6 pb-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="opacity-40">ℏ</span>
            <span className="tracking-wide">hbar.ink</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/hbar-systems/hbar.ink"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-800 transition-colors"
            >install</a>
            <a
              href="https://brainfoundry.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-800 transition-colors"
              style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}
            >{'{ get-a-brain }'}</a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="px-6 pt-10 pb-4">
          <div className="max-w-3xl mx-auto">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder="a thought."
              spellCheck={false}
              rows={6}
              className="w-full resize-none bg-transparent outline-none text-gray-900 placeholder:text-gray-400 placeholder:italic"
              style={{
                fontFamily: 'var(--font-spectral), Georgia, serif',
                fontSize: '1.5rem',
                lineHeight: 1.55,
                letterSpacing: '-0.005em',
              }}
            />
            <div className="mt-2 pt-3 flex items-center gap-4" style={{ borderTop: '1px solid #ece9e3' }}>
              <input
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                onKeyDown={handleKey}
                placeholder="to: hbar.brain/episodic/  (optional)"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 bg-transparent outline-none text-xs text-gray-600 placeholder:text-gray-400 placeholder:italic"
                style={{ fontFamily: 'ui-monospace, "DM Mono", monospace', letterSpacing: '0.01em' }}
              />
              <span className="text-[11px] text-gray-400 min-w-[40px] text-right" style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>
                {status}
              </span>
              <span className="text-[11px] text-gray-400 tracking-wide" style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>
                ⌘↵ to drop
              </span>
            </div>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="max-w-3xl mx-auto">
            <ul className="m-0 p-0 list-none">
              {drops.map(d => {
                const isSeed = !!d.seeded
                return (
                  <li
                    key={d.id}
                    className="py-5"
                    style={{
                      borderTop: isSeed ? '1px solid #d6d3cd' : '1px solid #e5e7eb',
                      borderBottom: isSeed ? '1px solid #d6d3cd' : 'none',
                      marginTop: isSeed ? 32 : 0,
                      backgroundColor: isSeed ? 'rgba(255,255,255,0.4)' : 'transparent',
                      paddingLeft: isSeed ? 16 : 0,
                      paddingRight: isSeed ? 16 : 0,
                    }}
                  >
                    <div
                      className="whitespace-pre-wrap"
                      style={{
                        color: '#1f2937',
                        fontSize: 16,
                        lineHeight: 1.7,
                      }}
                    >{d.text}</div>
                    <div
                      className="mt-3 flex items-center gap-3 text-[11px] text-gray-400"
                      style={{ fontFamily: 'ui-monospace, "DM Mono", monospace', letterSpacing: '0.02em', flexWrap: 'wrap' }}
                    >
                      <span>{fmtTime(d.ts)}</span>
                      {d.author && <span style={{ color: '#6b7280' }}>by {d.author}</span>}
                      {d.destination ? (
                        <span style={{ color: '#6b7280' }}>→ {d.destination}</span>
                      ) : (
                        <span style={{ color: '#c0bdb5', fontStyle: 'italic' }}>→ unrouted</span>
                      )}
                      {!isSeed && (
                        <button
                          type="button"
                          onClick={() => remove(d.id)}
                          className="ml-auto hover:text-gray-700 transition-colors"
                          style={{ background: 'transparent', border: 'none', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        >delete</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      </main>

      <footer className="px-6 py-6" style={{ borderTop: '1px solid #e5e7eb' }}>
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[11px] text-gray-400">
          <span>part of <a href="https://hbar.systems" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">hbar.systems</a></span>
          <span style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>hbar.ink — phase 1</span>
        </div>
      </footer>
    </div>
  )
}
