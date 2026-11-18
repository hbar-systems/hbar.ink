'use client'

import { useState, useEffect, useRef } from 'react'
import '../../brain-app-dist/free-canvas.css'

// hbar.ink v0.12 — the write-anywhere page (INK-MAGIC-1, 2026-11-18).
// hbar: "i want an ability for me to feel natural changing the words and being
// able to write anywhere on the page. it should be magical free writing. the
// surface should be positive."
//
// The page IS the instrument: tap anywhere and a fragment starts there, drag to
// move, every word editable in place, autosave, undo. The canvas is one shared
// module (brain-app-dist/free-canvas.js) used here and in the brain-app.
// Words live in this browser only (localStorage); nothing is sent anywhere.
// The previous look is archived at /v0.11.

const PAGE_KEY = 'hbar.ink.page.v1'
const OLD_DROPS_KEY = 'hbar.ink.demo.drops.v1' // read for migration, never deleted

const SEED_TEXT =
  "you're reading this on hbar.ink — the public window. it's just a webpage.\n\n" +
  "what you write here stays in your browser. nothing leaves it.\n\n" +
  "i made this for myself: to write the way thinking actually moves, anywhere on the page, " +
  "and to have a brain that remembers. the brain is the part you can't see — installed " +
  "locally, owned by you, federated with mine when we agree.\n\n" +
  "to keep your words: install hbar.ink into your brain."

// The muse on the public page is local: it asks about your own words, from a
// small set of question shapes, and never writes into the page. Inside a brain,
// the brain-app's muse asks through the brain's model instead.
const STOP = new Set('that this with from have what when where which there their they them then than were been being would could should about into your yours just like only also very much more most some such even over under after before because while these those other again still here know think really thing things something nothing every never always'.split(' '))
const SHAPES = [
  (w: string) => `what does “${w}” hold that the sentence has not said yet?`,
  (w: string) => `if “${w}” were the first word, what would come after it?`,
  (w: string) => `who would read “${w}” differently than you mean it?`,
  (w: string) => `what is the opposite of “${w}” here, and is it true too?`,
  (w: string) => `where were you when “${w}” first came to you?`,
]
let museTurn = 0
function localMuse(text: string): string {
  const words = (text.toLowerCase().match(new RegExp("[\\p{L}][\\p{L}'’-]{3,}", 'gu')) || []).filter(w => !STOP.has(w))
  museTurn++
  if (!words.length) return 'what are you not writing yet?'
  const near = words.slice(-5).sort((a, b) => b.length - a.length) // the weightiest of the last words
  const w = near[museTurn % Math.min(2, near.length)]
  return SHAPES[museTurn % SHAPES.length](w)
}

// One result bar in the (you chose) poll. The poll is rigged — that's the
// point — so the bars are fixed, not computed.
function VoteBar({ label, pct, accent, grow }: { label: string; pct: number; accent?: boolean; grow: boolean }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div
        className="flex justify-between"
        style={{ fontSize: '12px', color: accent ? 'var(--ink-accent)' : 'var(--ink-faint)', marginBottom: '0.35rem', letterSpacing: '0.02em' }}
      >
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--ink-hairline)', borderRadius: 4, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: grow ? `${pct}%` : '0%',
            background: accent ? 'var(--ink-accent)' : 'var(--ink-whisper)',
            borderRadius: 4,
            transition: 'width .9s cubic-bezier(.22,1,.36,1)',
          }}
        />
      </div>
    </div>
  )
}

type Theme = 'writers' | 'night' | 'academia' | 'blog'

export default function Home() {
  const [inkTheme, setInkTheme] = useState<Theme>('writers')
  const [voted, setVoted] = useState<string | null>(null)
  const [grow, setGrow] = useState(false)
  const [touched, setTouched] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<any>(null)

  useEffect(() => {
    try {
      const t = localStorage.getItem('hbar.ink.theme')
      if (t === 'writers' || t === 'night' || t === 'academia' || t === 'blog') setInkTheme(t)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('hbar.ink.theme', inkTheme) } catch {}
  }, [inkTheme])

  // mount the shared canvas (client only)
  useEffect(() => {
    let cancelled = false
    let inst: any = null
    import('../../brain-app-dist/free-canvas.js').then((mod: any) => {
      if (cancelled || !hostRef.current) return
      const FC = (mod && (mod.create ? mod : mod.default)) || (globalThis as any).FreeCanvas
      const w = window.innerWidth
      const narrow = w < 640
      inst = FC.create(hostRef.current, {
        storageKey: PAGE_KEY,
        minHeight: Math.max(520, window.innerHeight - 90),
        hint: 'Write anywhere.',
        hintSmall: 'Tap the page and begin. Your words stay in this browser.',
        migrate: () => {
          const raw = localStorage.getItem(OLD_DROPS_KEY)
          const old = raw ? JSON.parse(raw) : []
          return Array.isArray(old) ? FC.fromDrops(old, w) : []
        },
        seed: [{
          id: 'seed-2026-05-09-hbar-manifesto',
          text: SEED_TEXT,
          x: narrow ? 0.05 : 0.64,
          y: Math.round(window.innerHeight * (narrow ? 0.66 : 0.6)),
          locked: true,
          by: 'hbar · may 2026',
          ts: '2026-05-09T13:00:00Z',
          from: 'seed',
        }],
        muse: async (text: string) => localMuse(text),
        onChange: () => setTouched(true),
      })
      canvasRef.current = inst
    })
    return () => { cancelled = true; if (inst) inst.destroy(); canvasRef.current = null }
  }, [])

  useEffect(() => {
    if (!voted) return
    const t = setTimeout(() => setGrow(true), 40)
    return () => clearTimeout(t)
  }, [voted])

  const exportMd = () => {
    const inst = canvasRef.current
    if (!inst) return
    const frags = inst.fragments().filter((f: any) => !f.locked && f.text.trim())
      .sort((a: any, b: any) => a.y - b.y || a.x - b.x)
    const md = '# hbar.ink page\n\n' + frags.map((f: any) => f.text).join('\n\n---\n\n') + '\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = 'hbar-ink-page-' + new Date().toISOString().slice(0, 10) + '.md'
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div
      className="ink-root ink-page min-h-screen flex flex-col"
      data-ink-theme={inkTheme}
      style={{ backgroundColor: 'var(--ink-bg)', color: 'var(--ink-text-soft)', fontFamily: 'var(--font-spectral), Georgia, serif', transition: 'background-color 0.4s ease, color 0.4s ease', position: 'relative' }}
    >
      <div className="ink-light" aria-hidden />
      <header className="px-6 pt-6 pb-2" style={{ position: 'relative', zIndex: 2 }}>
        <div className="mx-auto flex justify-between items-center text-xs text-gray-500 gap-4 flex-wrap" style={{ maxWidth: 1240 }}>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--ink-accent)', fontSize: 15 }}>ℏ</span>
            <span className="tracking-wide">hbar.ink</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1" role="group" aria-label="theme">
              {([['writers', 'W', "Writer's Room"], ['night', 'N', 'Night Ink'], ['academia', 'A', 'Academia'], ['blog', 'B', 'Blog — matches hbar.blog']] as const).map(([key, letter, title]) => (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-pressed={inkTheme === key}
                  onClick={() => setInkTheme(key)}
                  className="transition-colors"
                  style={{
                    width: 20, height: 20, borderRadius: 999,
                    fontFamily: 'ui-monospace, "DM Mono", monospace', fontSize: 10, lineHeight: 1,
                    border: '1px solid', borderColor: inkTheme === key ? 'var(--ink-accent)' : 'var(--ink-border)',
                    background: inkTheme === key ? 'var(--ink-accent)' : 'transparent',
                    color: inkTheme === key ? 'var(--ink-bg)' : 'var(--ink-muted)', cursor: 'pointer',
                  }}
                >{letter}</button>
              ))}
            </div>
            <button type="button" className="ink-chip" title="the muse: one question about the words you are on (⌘J). It never writes into your page." onMouseDown={e => { e.preventDefault(); canvasRef.current?.askMuse() }}>muse</button>
            <button type="button" className="ink-chip" title="download this page as markdown" onClick={exportMd}>.md</button>
            <a href="https://github.com/hbar-systems/hbar.ink" target="_blank" rel="noopener noreferrer" className="hidden sm:inline hover:text-gray-800 transition-colors">install</a>
            <a href="https://brainfoundry.ai" target="_blank" rel="noopener noreferrer" className="hidden sm:inline hover:text-gray-800 transition-colors" style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>{'{ get-a-brain }'}</a>
          </div>
        </div>
      </header>

      <main className="flex-1" style={{ position: 'relative', zIndex: 1 }}>
        <div ref={hostRef} className="mx-auto" style={{ maxWidth: 1240, padding: '0 12px' }} />
        <div className="mx-auto px-6 pb-6 ink-legend" style={{ maxWidth: 1240, opacity: touched ? 0.55 : 1 }}>
          tap to write · drag to move · ⌘Z undo · ⌘. face · ⌘J muse
        </div>
      </main>

      {/* ───── manifesto: the scroll-down hook. names Google once as the
           avatar, then attacks the category. medium matches message —
           this reads as a quiet, private page, not a SaaS comparison. ───── */}
      <section className="px-6 pt-24 pb-28" style={{ borderTop: '1px solid var(--ink-hairline)', position: 'relative', zIndex: 1 }}>
        <div className="max-w-3xl mx-auto" style={{ color: 'var(--ink-text-soft)' }}>
          <p style={{ fontSize: '1.85rem', lineHeight: 1.4, letterSpacing: '-0.01em', marginBottom: '1.5rem' }}>
            Google Docs is where your words go to work for someone else.
          </p>
          <p style={{ fontSize: '1.85rem', lineHeight: 1.4, letterSpacing: '-0.01em', marginBottom: '2.6rem' }}>
            hbar.ink is where they stay yours.
          </p>

          <div style={{ fontSize: '1.2rem', lineHeight: 1.95, color: 'var(--ink-text-soft)', marginBottom: '2.4rem' }}>
            <div>Writing made personal.</div>
            <div>Writing made private.</div>
            <div>Writing as art.</div>
          </div>

          <div style={{ fontSize: '1.2rem', lineHeight: 1.95, color: 'var(--ink-text-soft)' }}>
            <div>Your words live in your brain.</div>
            <div>Not on a server that reads them.</div>
          </div>

          {/* the (you chose) poll — openly rigged, and the rig is the punchline */}
          <div
            style={{ marginTop: '3.5rem', paddingTop: '2.25rem', borderTop: '1px solid var(--ink-hairline)', fontFamily: 'ui-monospace, "DM Mono", monospace' }}
          >
            {!voted ? (
              <>
                <div style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '1.1rem', letterSpacing: '0.02em' }}>
                  where should your words live?
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setVoted('ink')}
                    className="transition-colors"
                    style={{
                      padding: '0.6rem 1.1rem', borderRadius: 6, fontSize: '13px',
                      border: '1px solid var(--ink-accent)', color: 'var(--ink-accent)', background: 'transparent', cursor: 'pointer',
                    }}
                  >ℏ hbar.ink</button>
                  <button
                    type="button"
                    onClick={() => setVoted('gdocs')}
                    className="transition-colors"
                    style={{
                      padding: '0.6rem 1.1rem', borderRadius: 6, fontSize: '13px',
                      border: '1px solid var(--ink-border)', color: 'var(--ink-muted)', background: 'transparent', cursor: 'pointer',
                    }}
                  >Google Docs</button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink-whisper)', marginTop: '0.85rem' }}>
                  cast your vote
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '1.1rem', letterSpacing: '0.02em' }}>
                  where words should live — results
                </div>
                <VoteBar label="hbar.ink" pct={98} accent grow={grow} />
                <VoteBar label="Google Docs" pct={2} grow={grow} />
                <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '1.4rem', lineHeight: 1.65, fontStyle: 'italic', maxWidth: '40rem' }}>
                  {voted === 'gdocs'
                    ? "you voted Google Docs. the house voted hbar.ink. the house always wins. your vote, like everything on this page, never left your browser."
                    : "this poll is rigged. so is the one deciding what your documents are worth to an ad model. your vote here never left your browser."}
                </div>
              </>
            )}
          </div>

          {/* CTA back to the install path — the instruction line (get-a-brain
               is the link), then the copy-pastable repo, then a shot of where
               it goes (the brain's Apps tab). */}
          <div style={{ marginTop: '3.5rem' }}>
            <p style={{ fontSize: '1.05rem', color: 'var(--ink-text-soft)', lineHeight: 1.6, marginBottom: '1.4rem' }}>
              when you{' '}
              <a
                href="https://brainfoundry.ai/get-a-brain"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-70 transition-opacity"
                style={{ color: 'var(--ink-text-soft)', textDecoration: 'underline', textDecorationColor: 'var(--ink-whisper)', textUnderlineOffset: '4px' }}
              >get-a-brain</a>
              , go to the app section and paste this link:
            </p>

            <div
              className="select-all"
              style={{
                display: 'inline-block',
                fontFamily: 'ui-monospace, "DM Mono", monospace',
                fontSize: '13px',
                color: 'var(--ink-text-soft)',
                background: 'var(--ink-surface)',
                border: '1px solid var(--ink-hairline)',
                borderRadius: 6,
                padding: '0.5rem 0.8rem',
                userSelect: 'all',
              }}
            >https://github.com/hbar-systems/hbar.ink</div>

            <figure style={{ marginTop: '1.75rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hbar-brain-ink-white-main.png"
                alt="The brain's Apps tab — paste the hbar.ink repo to install it as a sandboxed tab in your own brain."
                style={{ width: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--ink-hairline)', display: 'block' }}
              />
              <figcaption
                style={{ fontFamily: 'ui-monospace, "DM Mono", monospace', fontSize: '11px', color: 'var(--ink-faint)', marginTop: '0.6rem', letterSpacing: '0.02em' }}
              >paste the repo into your brain&apos;s Apps tab — it installs as a sandboxed tab you own.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <footer className="px-6 py-6" style={{ borderTop: '1px solid var(--ink-border)', position: 'relative', zIndex: 1 }}>
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[11px] text-gray-400">
          <span>part of <a href="https://hbar.systems" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">hbar.systems</a></span>
          <span style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>hbar.ink v0.12 · <a href="/v0.11" className="hover:text-gray-700 transition-colors">v0.11</a></span>
        </div>
      </footer>
    </div>
  )
}
