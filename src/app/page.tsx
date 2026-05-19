'use client'

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

export default function Home() {
  const [userDrops, setUserDrops] = useState<Drop[]>([])
  const [destination, setDestination] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [activeLineFont, setActiveLineFont] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

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
              href="https://hbar.social"
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
            <div className="mt-2 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid #ece9e3' }}>
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
                      borderColor: activeLineFont === face ? '#8a6f48' : '#e5e7eb',
                      color: activeLineFont === face ? '#8a6f48' : '#9ca3af',
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
                      borderTop: isSeed ? '1px solid #d6d3cd' : '1px solid #e5e7eb',
                      borderBottom: isSeed ? '1px solid #d6d3cd' : 'none',
                      marginTop: isSeed ? 32 : 0,
                      backgroundColor: isSeed ? 'rgba(255,255,255,0.4)' : 'transparent',
                      paddingLeft: isSeed ? 16 : 0,
                      paddingRight: isSeed ? 16 : 0,
                    }}
                  >
                    {textLines ? (
                      <div style={{ color: '#1f2937', fontSize: 16, lineHeight: 1.7 }}>
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
                        style={{ color: '#1f2937', fontSize: 16, lineHeight: 1.7 }}
                      >{d.text}</div>
                    )}
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
                      {d.social && <span style={{ color: '#8a6f48' }}>· hbar.social</span>}
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
                            color: d.social ? '#8a6f48' : '#9ca3af',
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

      <footer className="px-6 py-6" style={{ borderTop: '1px solid #e5e7eb' }}>
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[11px] text-gray-400">
          <span>part of <a href="https://hbar.systems" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">hbar.systems</a></span>
          <span style={{ fontFamily: 'ui-monospace, "DM Mono", monospace' }}>hbar.ink — phase 1</span>
        </div>
      </footer>
    </div>
  )
}
