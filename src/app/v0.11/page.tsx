'use client'

// ARCHIVED LOOK v0.11 (retired 2026-11-18 by INK-MAGIC-1, the write-anywhere page).
// The front page as it stood from v0.11.0 (2026-10-13) to 2026-11-18. Served at /v0.11.

import { useState, useEffect, useRef, KeyboardEvent } from 'react'

// hbar.ink — public marketing page.
// The page IS the instrument. One seeded drop from hbar (sealed, dated)
// explains the tool in its own format. Visitors can drop their own thoughts;
// drops live in localStorage only, ephemeral. The marketing IS the demo.
//
// The drop input is a line editor: each line can carry its own font face
// (serif / sans / mono / display) without changing the rest of the drop —
// the "artistic writing" angle. Each drop can also be linked to hbar.social,
// the brain-federation social surface.

interface Drop {
  id: string
  text: string
  destination: string | null
  ts: string
  author?: string
  seeded?: boolean
  // per-line fonts, parallel to text.split('\n'); null = default face
  lineFonts?: (string | null)[]
  // linked to hbar.social (the brain-federation social feed)
  social?: boolean
}

const STORAGE_KEY = 'hbar.ink.demo.drops.v1'
const RECENT_LIMIT = 12

// per-line font faces. null = the default serif.
const LINE_CYCLE: (string | null)[] = [null, 'serif', 'sans', 'mono', 'display']
const LINE_FONT_STACK: Record<string, string> = {
  serif: 'var(--font-spectral), Georgia, serif',
  sans: 'var(--font-montserrat), system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  display: 'var(--font-audiowide), system-ui, sans-serif',
}

// destination presets — mirror the brain-app's `to: ℏ` picker.
// "keep" = inward (becomes memory); "publish" = outward, text.
// Each carries a signature shade shown as a dot. NOTE: picking one only
// tags the drop's destination — it does not yet publish to that system.
type DestPreset = { dest: string; label: string; tint: string }
const DEST_KEEP: DestPreset[] = [
  { dest: 'hbar.brain/episodic/', label: 'brain/ep', tint: '#6f8099' },
  { dest: 'hbar.brain/semantic/', label: 'brain/sem', tint: '#7d8aa0' },
  { dest: 'hbar.psychology/', label: 'psyche', tint: '#8a7aa3' },
  { dest: 'hbar.mirror/', label: 'mirror', tint: '#6f9088' },
]
const DEST_PUBLISH: DestPreset[] = [
  { dest: 'hbar.blog/', label: 'blog', tint: '#d4af37' },
  { dest: 'hbar.art/hbarnotes/', label: 'art', tint: '#bf5a93' },
  { dest: 'hbar.science/', label: 'science', tint: '#3d9aa8' },
  { dest: 'hbar.signals/', label: 'signals', tint: '#9a7bd0' },
  { dest: 'hbar.social/', label: 'social', tint: '#4f93d6' },
]

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
  // the closing line is set in display — the per-line font feature, shown.
  lineFonts: [null, null, null, null, null, null, 'display'],
  social: true,
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

export default function Home() {
  const [userDrops, setUserDrops] = useState<Drop[]>([])
  const [destination, setDestination] = useState('')
  const [destTint, setDestTint] = useState<string | null>(null)
  const [inkTheme, setInkTheme] = useState<'writers' | 'night' | 'academia' | 'blog'>('writers')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [activeLineFont, setActiveLineFont] = useState<string | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [grow, setGrow] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  // instrument theme (Writer's Room / Night Ink / Academia / Blog) — mirrors the brain-app
  useEffect(() => {
    try {
      const t = localStorage.getItem('hbar.ink.theme')
      if (t === 'writers' || t === 'night' || t === 'academia' || t === 'blog') setInkTheme(t)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('hbar.ink.theme', inkTheme) } catch {}
  }, [inkTheme])

  // ---------- line editor helpers ----------
  function isEditorEmpty() {
    const e = editorRef.current
    return !e || (e.textContent || '').trim() === ''
  }

  function updatePlaceholder() {
    const e = editorRef.current
    if (e) e.classList.toggle('is-empty', isEditorEmpty())
  }

  function clearEditor() {
    const e = editorRef.current
    if (e) {
      e.innerHTML = '<div><br></div>'
      updatePlaceholder()
    }
  }

  // Read the editor as ordered { text, font } lines.
  function readEditorLines(): { text: string; font: string | null }[] {
    const e = editorRef.current
    if (!e) return [{ text: '', font: null }]
    const lines: { text: string; font: string | null }[] = []
    e.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        lines.push({ text: node.textContent || '', font: null })
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        lines.push({ text: el.textContent || '', font: el.dataset.font || null })
      }
    })
    return lines.length ? lines : [{ text: '', font: null }]
  }

  // The line block (direct child of the editor) holding a node.
  function blockFromNode(node: Node | null): HTMLElement | null {
    const e = editorRef.current
    if (!e || !node) return null
    let n: Node | null = node
    while (n && n.parentNode && n.parentNode !== e) n = n.parentNode
    if (!n || n.parentNode !== e) return null
    if (n.nodeType === Node.TEXT_NODE) {
      const div = document.createElement('div')
      e.insertBefore(div, n)
      div.appendChild(n)
      return div
    }
    return n as HTMLElement
  }

  function currentBlock(): HTMLElement | null {
    const e = editorRef.current
    const sel = window.getSelection()
    if (!e || !sel || sel.rangeCount === 0) return null
    if (!e.contains(sel.anchorNode)) return null
    return blockFromNode(sel.anchorNode)
  }

  function setLineFont(block: HTMLElement | null, font: string | null) {
    if (!block) return
    if (!font || block.dataset.font === font) {
      delete block.dataset.font
      setActiveLineFont(null)
    } else {
      block.dataset.font = font
      setActiveLineFont(font)
    }
  }

  function cycleLineFont() {
    const block = currentBlock()
    if (!block) return
    const cur = block.dataset.font || null
    const next = LINE_CYCLE[(LINE_CYCLE.indexOf(cur) + 1) % LINE_CYCLE.length]
    setLineFont(block, next)
  }

  function trackLine() {
    const block = currentBlock()
    setActiveLineFont(block ? (block.dataset.font || null) : null)
  }

  // ---------- mount ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setUserDrops(parsed)
      }
    } catch {}
    setLoaded(true)
    try { document.execCommand('defaultParagraphSeparator', false, 'div') } catch {}
    clearEditor()
    editorRef.current?.focus()
    const onSel = () => trackLine()
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userDrops)) } catch {}
  }, [userDrops, loaded])

  // grow the rigged poll's bars in once a vote lands
  useEffect(() => {
    if (!voted) return
    const t = setTimeout(() => setGrow(true), 40)
    return () => clearTimeout(t)
  }, [voted])

  const commit = () => {
    const lines = readEditorLines()
    while (lines.length > 1 && lines[0].text.trim() === '' && !lines[0].font) lines.shift()
    while (lines.length > 1 && lines[lines.length - 1].text.trim() === '' && !lines[lines.length - 1].font) lines.pop()
    const text = lines.map(l => l.text).join('\n')
    if (!text.trim()) return
    const lineFonts = lines.map(l => l.font || null)
    const drop: Drop = {
      id: newId(),
      text,
      destination: destination.trim() || null,
      ts: new Date().toISOString(),
      lineFonts: lineFonts.some(Boolean) ? lineFonts : undefined,
    }
    setUserDrops(prev => [drop, ...prev])
    clearEditor()
    setStatus('sealed (in this browser only)')
    setTimeout(() => setStatus(''), 1600)
    editorRef.current?.focus()
  }

  const remove = (id: string) => {
    setUserDrops(prev => prev.filter(d => d.id !== id))
  }

  const toggleSocial = (id: string) => {
    setUserDrops(prev => prev.map(d => d.id === id ? { ...d, social: !d.social } : d))
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  const handleEditorKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
      return
    }
    // Cmd/Ctrl + .  →  cycle the current line's font
    if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault()
      cycleLineFont()
    }
  }

  // Render order: user drops newest-first, seeded drop always at the bottom
  // as the foundational reference.
  const drops = [...userDrops, SEEDED_DROP].slice(0, RECENT_LIMIT)

  return (
    <div
      className="ink-root min-h-screen flex flex-col"
      data-ink-theme={inkTheme}
      style={{ backgroundColor: 'var(--ink-bg)', color: 'var(--ink-text-soft)', fontFamily: 'var(--font-spectral), Georgia, serif', transition: 'background-color 0.2s ease, color 0.2s ease' }}
    >
      <header className="px-6 pt-6 pb-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="opacity-40">ℏ</span>
            <span className="tracking-wide">hbar.ink</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1" role="group" aria-label="theme">
              {([['writers', 'W', "Writer's Room"], ['night', 'N', 'Night Ink'], ['academia', 'A', 'Academia'], ['blog', 'B', 'Blog — matches hbar.blog']] as const).map(([key, letter, title]) => (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-pressed={inkTheme === key}
                  onClick={() => setInkTheme(key)}
                  className="rounded transition-colors"
                  style={{
                    width: 20,
                    height: 20,
                    fontFamily: 'ui-monospace, "DM Mono", monospace',
                    fontSize: 10,
                    lineHeight: 1,
                    border: '1px solid',
                    borderColor: inkTheme === key ? 'var(--ink-accent)' : 'var(--ink-border)',
                    background: inkTheme === key ? 'var(--ink-accent)' : 'transparent',
                    color: inkTheme === key ? 'var(--ink-bg)' : 'var(--ink-muted)',
                    cursor: 'pointer',
                  }}
                >{letter}</button>
              ))}
            </div>
            <a
              href="https://social.hbar.systems"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-800 transition-colors"
            >hbar.social</a>
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
            <div
              ref={editorRef}
              id="ink-editor"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="a thought"
              data-placeholder="a thought."
              spellCheck={false}
              onInput={updatePlaceholder}
              onKeyDown={handleEditorKey}
              onKeyUp={trackLine}
              onMouseUp={trackLine}
              onFocus={trackLine}
              onPaste={(e) => {
                e.preventDefault()
                const txt = e.clipboardData.getData('text/plain')
                if (txt) document.execCommand('insertText', false, txt)
              }}
              className="w-full bg-transparent outline-none text-gray-900"
              style={{
                fontFamily: 'var(--font-spectral), Georgia, serif',
                fontSize: '1.5rem',
                lineHeight: 1.55,
                letterSpacing: '-0.005em',
                minHeight: '8.5rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />
            <div className="mt-2 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--ink-hairline)' }}>
              <input
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                onKeyDown={handleKey}
                placeholder="to: hbar.brain/episodic/  (optional)"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 min-w-[180px] bg-transparent outline-none text-xs text-gray-600 placeholder:text-gray-400 placeholder:italic"
                style={{ fontFamily: 'ui-monospace, "DM Mono", monospace', letterSpacing: '0.01em' }}
              />
              <div
                className="flex items-center gap-1"
                style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}
              >
                <span className="text-[11px] text-gray-400 mr-1">line:</span>
                {(['serif', 'sans', 'mono', 'display'] as const).map(face => (
                  <button
                    key={face}
                    type="button"
                    title={`this line in ${face} — or press ⌘.`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setLineFont(currentBlock(), face)
                      editorRef.current?.focus()
                    }}
                    className="px-1.5 py-0.5 rounded transition-colors"
                    style={{
                      fontFamily: LINE_FONT_STACK[face],
                      fontSize: face === 'display' ? '9px' : '11px',
                      border: '1px solid',
                      borderColor: activeLineFont === face ? 'var(--ink-accent)' : 'var(--ink-border)',
                      color: activeLineFont === face ? 'var(--ink-accent)' : 'var(--ink-faint)',
                    }}
                  >{face}</button>
                ))}
              </div>
              <span className="text-[11px] text-gray-400 min-w-[40px] text-right" style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>
                {status}
              </span>
              <span className="text-[11px] text-gray-400 tracking-wide" style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>
                ⌘↵ to drop
              </span>
            </div>
            {/* destination presets — to: ℏ  keep · publish (mirrors the brain-app picker).
               picking one tags the drop's destination; it does not publish yet. */}
            <div
              className="mt-2 flex items-center gap-1.5 flex-wrap"
              style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}
            >
              <span className="text-[11px] text-gray-400 mr-0.5">to:</span>
              <span
                aria-hidden
                style={{ fontFamily: 'var(--font-spectral), Georgia, serif', fontSize: 13, color: destTint || 'var(--ink-accent)', lineHeight: 1 }}
              >ℏ</span>
              {[...DEST_KEEP, null, ...DEST_PUBLISH].map((d, i) =>
                d === null ? (
                  <span key={`sep-${i}`} className="text-gray-300 mx-0.5">·</span>
                ) : (
                  <button
                    key={d.dest}
                    type="button"
                    title={`to: ${d.dest} — tags the drop (does not publish yet)`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setDestination(d.dest)
                      setDestTint(d.tint)
                      editorRef.current?.focus()
                    }}
                    className="inline-flex items-center rounded transition-colors"
                    style={{
                      fontFamily: 'ui-monospace, "DM Mono", monospace',
                      fontSize: 11,
                      letterSpacing: '0.02em',
                      padding: '2px 8px',
                      border: '1px solid',
                      borderColor: destination === d.dest ? d.tint : 'var(--ink-border)',
                      color: destination === d.dest ? 'var(--ink-text)' : 'var(--ink-muted)',
                      background: destination === d.dest ? 'var(--ink-surface)' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: d.tint,
                        marginRight: 5,
                        opacity: destination === d.dest ? 1 : 0.85,
                      }}
                    />
                    {d.label}
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="max-w-3xl mx-auto">
            <ul className="m-0 p-0 list-none">
              {drops.map(d => {
                const isSeed = !!d.seeded
                const fonts = d.lineFonts
                const textLines = (fonts && fonts.some(Boolean)) ? d.text.split('\n') : null
                return (
                  <li
                    key={d.id}
                    className="py-5"
                    style={{
                      borderTop: isSeed ? '1px solid var(--ink-border)' : '1px solid var(--ink-border)',
                      borderBottom: isSeed ? '1px solid var(--ink-border)' : 'none',
                      marginTop: isSeed ? 32 : 0,
                      backgroundColor: isSeed ? 'var(--ink-surface)' : 'transparent',
                      paddingLeft: isSeed ? 16 : 0,
                      paddingRight: isSeed ? 16 : 0,
                    }}
                  >
                    {textLines ? (
                      <div style={{ color: 'var(--ink-text-soft)', fontSize: 16, lineHeight: 1.7 }}>
                        {textLines.map((ln, i) => (
                          <div
                            key={i}
                            className="whitespace-pre-wrap"
                            style={{
                              fontFamily: fonts && fonts[i] ? LINE_FONT_STACK[fonts[i] as string] : undefined,
                              minHeight: '1.7em',
                            }}
                          >{ln}</div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="whitespace-pre-wrap"
                        style={{ color: 'var(--ink-text-soft)', fontSize: 16, lineHeight: 1.7 }}
                      >{d.text}</div>
                    )}
                    <div
                      className="mt-3 flex items-center gap-3 text-[11px] text-gray-400"
                      style={{ fontFamily: 'ui-monospace, "DM Mono", monospace', letterSpacing: '0.02em', flexWrap: 'wrap' }}
                    >
                      <span>{fmtTime(d.ts)}</span>
                      {d.author && <span style={{ color: 'var(--ink-muted)' }}>by {d.author}</span>}
                      {d.destination ? (
                        <span style={{ color: 'var(--ink-muted)' }}>→ {d.destination}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-whisper)', fontStyle: 'italic' }}>→ unrouted</span>
                      )}
                      {d.social && <span style={{ color: 'var(--ink-accent)' }}>· hbar.social</span>}
                      {!isSeed && (
                        <button
                          type="button"
                          onClick={() => toggleSocial(d.id)}
                          title="link this drop to hbar.social — the brain-federation social feed"
                          className="transition-colors"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                            color: d.social ? 'var(--ink-accent)' : 'var(--ink-faint)',
                            textDecoration: 'underline',
                            textDecorationStyle: 'dotted',
                          }}
                        >{d.social ? 'on hbar.social' : '→ social'}</button>
                      )}
                      {!isSeed && (
                        <button
                          type="button"
                          onClick={() => remove(d.id)}
                          className="hover:text-gray-700 transition-colors"
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

      {/* ───── manifesto: the scroll-down hook. names Google once as the
           avatar, then attacks the category. medium matches message —
           this reads as a quiet, private page, not a SaaS comparison. ───── */}
      <section className="px-6 pt-24 pb-28" style={{ borderTop: '1px solid var(--ink-hairline)' }}>
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

      <footer className="px-6 py-6" style={{ borderTop: '1px solid var(--ink-border)' }}>
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[11px] text-gray-400">
          <span>part of <a href="https://hbar.systems" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">hbar.systems</a></span>
          <span style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>hbar.ink — phase 1</span>
        </div>
      </footer>
    </div>
  )
}
