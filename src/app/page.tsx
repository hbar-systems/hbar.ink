'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import Link from 'next/link'

interface Drop {
  id: string
  text: string
  created: string
  publish: boolean
}

const STORAGE_KEY = 'hbar.ink.drops.v1'
const PUBLISH_KEY_STORAGE = 'hbar.ink.publish_key.v1'

type PublishResult =
  | { kind: 'ok'; title: string; slug: string; url: string; drops: number }
  | { kind: 'error'; message: string }

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function isToday(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
  } catch {
    return false
  }
}

export default function Home() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [publishKey, setPublishKey] = useState<string>('')
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setDrops(parsed)
      }
    } catch {}
    try {
      const k = localStorage.getItem(PUBLISH_KEY_STORAGE)
      if (k) setPublishKey(k)
    } catch {}
    setLoaded(true)
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drops))
    } catch {}
  }, [drops, loaded])

  const drop = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const entry: Drop = {
      id: newId(),
      text: trimmed,
      created: new Date().toISOString(),
      publish: false,
    }
    setDrops(prev => [entry, ...prev])
    setText('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const togglePublish = (id: string) => {
    setDrops(prev => prev.map(d => d.id === id ? { ...d, publish: !d.publish } : d))
  }

  const remove = (id: string) => {
    setDrops(prev => prev.filter(d => d.id !== id))
  }

  const copyAsMarkdown = (d: Drop) => {
    const md = `> ${d.text.split('\n').join('\n> ')}\n\n— ${formatDate(d.created)} ${formatTime(d.created)}`
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(md).catch(() => {})
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      drop()
    }
  }

  const setKey = () => {
    const current = publishKey || ''
    const next = typeof window !== 'undefined'
      ? window.prompt('publish key (gates /api/publish — stays in this browser)', current)
      : null
    if (next === null) return
    const trimmed = next.trim()
    try {
      if (trimmed) localStorage.setItem(PUBLISH_KEY_STORAGE, trimmed)
      else localStorage.removeItem(PUBLISH_KEY_STORAGE)
    } catch {}
    setPublishKey(trimmed)
  }

  const publishSelected = async () => {
    const selected = drops.filter(d => d.publish)
    if (selected.length === 0 || publishing) return
    if (!publishKey) {
      setPublishResult({ kind: 'error', message: 'no publish key set — click "key" in the header' })
      return
    }
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-publish-key': publishKey,
        },
        body: JSON.stringify({
          drops: selected.map(d => ({ id: d.id, text: d.text, created: d.created })),
        }),
      })
      const json: any = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        setPublishResult({
          kind: 'error',
          message: json?.error ? `${json.error}${json.detail ? ` — ${json.detail.slice(0, 200)}` : ''}` : `publish failed (${res.status})`,
        })
        return
      }
      setPublishResult({
        kind: 'ok',
        title: json.title,
        slug: json.slug,
        url: json.url,
        drops: json.drops,
      })
      // mark the selected drops as no longer pending-publish once they've landed
      const publishedIds = new Set(selected.map(d => d.id))
      setDrops(prev => prev.map(d => publishedIds.has(d.id) ? { ...d, publish: false } : d))
    } catch (e: any) {
      setPublishResult({ kind: 'error', message: String(e?.message || e) })
    } finally {
      setPublishing(false)
    }
  }

  const todayCount = drops.filter(d => isToday(d.created)).length
  const publishCount = drops.filter(d => d.publish).length

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
            <span>{todayCount} today</span>
            <span>{publishCount} to publish</span>
            <button
              type="button"
              onClick={setKey}
              className="hover:text-gray-800 transition-colors"
              title={publishKey ? 'publish key is set (click to change)' : 'no publish key set'}
            >
              key{publishKey ? ' ✓' : ''}
            </button>
            <a
              href="https://hbar.blog"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-800 transition-colors"
              title="where published drops land"
            >.blog</a>
            <Link href="/about" className="hover:text-gray-800 transition-colors">about</Link>
            <Link href="/legal" className="hover:text-gray-800 transition-colors">legal</Link>
            <Link href="/impressum" className="hover:text-gray-800 transition-colors">impressum</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="px-6 pt-8 pb-6">
          <div className="max-w-3xl mx-auto">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder="a thought."
              spellCheck={false}
              rows={6}
              className="w-full resize-none bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
              style={{
                fontFamily: 'var(--font-spectral), Georgia, serif',
                fontSize: '1.5rem',
                lineHeight: 1.55,
                letterSpacing: '-0.005em',
              }}
            />
            <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
              <span>{text.trim().length > 0 ? `${text.trim().length} chars` : ' '}</span>
              <span className="tracking-wide">⌘↵ to drop</span>
            </div>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="max-w-3xl mx-auto">
            {publishCount > 0 && (
              <div className="mb-6 flex items-center justify-between border-t border-b border-gray-200 py-3">
                <span className="text-[11px] text-gray-500">
                  {publishCount} drop{publishCount === 1 ? '' : 's'} flagged for publish
                </span>
                <button
                  type="button"
                  onClick={publishSelected}
                  disabled={publishing}
                  className="text-[11px] text-gray-700 border border-gray-300 px-3 py-1 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {publishing ? 'publishing…' : 'publish selected →'}
                </button>
              </div>
            )}
            {publishResult && publishResult.kind === 'ok' && (
              <div className="mb-6 text-[11px] text-gray-600 border-l-2 border-gray-400 pl-3 py-2">
                <div>published: {publishResult.title}</div>
                <div className="mt-1">
                  <a
                    href={publishResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 underline decoration-dotted hover:text-gray-900"
                  >
                    {publishResult.url}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setPublishResult(null)}
                  className="mt-2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  dismiss
                </button>
              </div>
            )}
            {publishResult && publishResult.kind === 'error' && (
              <div className="mb-6 text-[11px] text-gray-700 border-l-2 border-gray-500 pl-3 py-2">
                <div>publish failed</div>
                <div className="mt-1 text-gray-500 break-all">{publishResult.message}</div>
                <button
                  type="button"
                  onClick={() => setPublishResult(null)}
                  className="mt-2 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  dismiss
                </button>
              </div>
            )}
            {drops.length === 0 && loaded && (
              <div className="text-xs text-gray-400 text-center pt-8">
                no drops yet. thoughts land here, then decide whether to publish.
              </div>
            )}
            <ul className="space-y-5">
              {drops.map(d => (
                <li
                  key={d.id}
                  className="border-t border-gray-200 pt-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div
                      className="text-gray-800 whitespace-pre-wrap flex-1"
                      style={{ fontSize: '1.05rem', lineHeight: 1.65 }}
                    >
                      {d.text}
                    </div>
                    <div className="text-[10px] text-gray-400 whitespace-nowrap pt-1">
                      {isToday(d.created) ? formatTime(d.created) : `${formatDate(d.created)} ${formatTime(d.created)}`}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={d.publish}
                        onChange={() => togglePublish(d.id)}
                        className="accent-gray-700"
                      />
                      <span>publish to blog</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => copyAsMarkdown(d)}
                      className="hover:text-gray-800 transition-colors"
                    >
                      copy md
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      className="hover:text-gray-800 transition-colors ml-auto"
                    >
                      remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="px-6 py-5 border-t border-gray-200">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[10px] text-gray-400">
          <span>hbar.ink — drops are local to this browser</span>
          <div className="flex items-center gap-4">
            <Link
              href="/impressum"
              className="hover:text-gray-700 transition-colors"
            >
              impressum
            </Link>
            <a
              href="https://hbar.systems"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 transition-colors"
            >
              part of hbar.systems
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
