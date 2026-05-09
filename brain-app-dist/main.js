// hbar.ink — brain-app v0.7.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, kind, ts, brainId?, pinned, sealedAt?, aiPolicy }.
// localStorage (immediate UI) + brain memory.write via the bridge.
//
// v0.7 additions:
//   - sealing ceremony (sealedAt timestamp, visual + delete-confirm)
//   - per-drop AI policy (allow / allow_rag_only / deny) — gates whether
//     memory.write is called and is sent as metadata
//   - search filter (live, client-side substring match)
//   - export-all to a single .md file
//   - 3 font families (Spectral / Inter / DM Mono)
//
// Bridge usage:
//   meta.app_info, meta.brain_info, memory.write — same as v0.6.

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v7'
  const THEME_KEY = 'hbar-ink-theme'
  const SIZE_KEY = 'hbar-ink-size'
  const FONT_KEY = 'hbar-ink-font'
  const INFO_KEY = 'hbar-ink-info-seen'
  const FOCUS_KEY = 'hbar-ink-focus'
  const POLICY_KEY = 'hbar-ink-default-policy'
  const RECENT_LIMIT = 50

  const POLICY_CYCLE = ['allow', 'allow_rag_only', 'deny']
  const POLICY_LABEL = {
    allow: 'allow',
    allow_rag_only: 'rag-only',
    deny: 'deny',
  }

  const els = {
    input: document.getElementById('drop-input'),
    destination: document.getElementById('destination'),
    status: document.getElementById('status'),
    drops: document.getElementById('drops'),
    counter: document.getElementById('counter'),
    bfMeta: document.getElementById('bf-meta'),
    infoToggle: document.getElementById('info-toggle'),
    infoPanel: document.getElementById('info-panel'),
    dropBtn: document.getElementById('drop-btn'),
    presets: document.getElementById('presets'),
    focusToggle: document.getElementById('focus-toggle'),
    aiPolicyBtn: document.getElementById('ai-policy-btn'),
    search: document.getElementById('search'),
    searchCount: document.getElementById('search-count'),
    exportBtn: document.getElementById('export-md'),
    stats: document.getElementById('stats'),
  }

  // session state
  let currentKind = null
  let currentPolicy = 'allow'
  let searchQuery = ''

  // ---------- storage ----------
  function readDrops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        // One-time migration from v6/v3 — same shape, add new fields.
        for (const key of ['hbar-ink-drops-v6', 'hbar-ink-drops-v3']) {
          const old = localStorage.getItem(key)
          if (old) {
            try {
              const parsed = JSON.parse(old)
              if (Array.isArray(parsed)) {
                const upgraded = parsed.map(d => ({
                  kind: null,
                  pinned: false,
                  sealedAt: null,
                  aiPolicy: 'allow',
                  ...d,
                }))
                localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded))
                return upgraded
              }
            } catch {}
          }
        }
        return []
      }
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function writeDrops(drops) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drops))
  }

  function addDrop(text, destination, kind, aiPolicy) {
    const trimmed = (text || '').trim()
    if (!trimmed) return null
    const drop = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text: trimmed,
      destination: (destination || '').trim() || null,
      kind: kind || null,
      ts: new Date().toISOString(),
      brainId: null,
      pinned: false,
      sealedAt: null,
      aiPolicy: aiPolicy || 'allow',
    }
    const all = readDrops()
    all.unshift(drop)
    writeDrops(all)
    return drop
  }

  function markDropSavedToBrain(id, brainId) {
    const all = readDrops()
    const idx = all.findIndex(d => d.id === id)
    if (idx < 0) return
    all[idx].brainId = brainId
    writeDrops(all)
  }

  function deleteDrop(id) {
    const drop = readDrops().find(d => d.id === id)
    if (drop && drop.sealedAt) {
      if (!confirm(`This drop is sealed (${new Date(drop.sealedAt).toLocaleString()}). Delete anyway?`)) return
    }
    writeDrops(readDrops().filter(d => d.id !== id))
  }

  function togglePin(id) {
    const all = readDrops()
    const idx = all.findIndex(d => d.id === id)
    if (idx < 0) return
    all[idx].pinned = !all[idx].pinned
    writeDrops(all)
  }

  function toggleSeal(id) {
    const all = readDrops()
    const idx = all.findIndex(d => d.id === id)
    if (idx < 0) return
    all[idx].sealedAt = all[idx].sealedAt ? null : new Date().toISOString()
    writeDrops(all)
  }

  // ---------- counters / streak ----------
  function isSameDay(d, now) {
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
  }

  function computeCounter(drops) {
    const now = new Date()
    const todayCount = drops.filter(d => isSameDay(new Date(d.ts), now)).length
    if (todayCount === 0) return { todayCount, streak: 0 }
    const dayKeys = new Set(drops.map(d => {
      const dd = new Date(d.ts)
      return `${dd.getFullYear()}-${dd.getMonth()}-${dd.getDate()}`
    }))
    let streak = 0
    const cur = new Date(now)
    while (true) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`
      if (!dayKeys.has(key)) break
      streak++
      cur.setDate(cur.getDate() - 1)
    }
    return { todayCount, streak }
  }

  function renderCounter() {
    const { todayCount, streak } = computeCounter(readDrops())
    els.counter.textContent =
      streak > 1
        ? `${todayCount} today · ${streak} day streak`
        : `${todayCount} today`
  }

  function renderStats() {
    const all = readDrops()
    const total = all.length
    const sealed = all.filter(d => d.sealedAt).length
    const inBrain = all.filter(d => d.brainId).length
    const oldest = all.length > 0 ? all[all.length - 1].ts : null
    const oldestDate = oldest ? new Date(oldest).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
    els.stats.textContent = total === 0
      ? '—'
      : `${total} drops · ${inBrain} in brain · ${sealed} sealed · since ${oldestDate}`
  }

  // ---------- render ----------
  function fmtTime(iso) {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function matchesSearch(drop) {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (drop.text || '').toLowerCase().includes(q)
      || (drop.destination || '').toLowerCase().includes(q)
      || (drop.kind || '').toLowerCase().includes(q)
  }

  function renderDrops() {
    const allDrops = readDrops()
    const filtered = allDrops.filter(matchesSearch)
    els.drops.innerHTML = ''
    renderCounter()
    renderStats()

    // search count
    if (searchQuery) {
      els.searchCount.textContent = `${filtered.length} of ${allDrops.length}`
    } else {
      els.searchCount.textContent = ''
    }

    if (filtered.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'empty'
      if (searchQuery && allDrops.length > 0) {
        empty.innerHTML =
          '<span class="empty-line">no matching drops.</span>' +
          '<span class="empty-line empty-faint">try a different search term, or clear the field.</span>'
      } else {
        empty.innerHTML =
          '<span class="empty-line">no drops yet.</span>' +
          '<span class="empty-line">type a thought above and hit drop.</span>' +
          '<span class="empty-line empty-faint">drops route to your brain\'s episodic memory.</span>'
      }
      els.drops.appendChild(empty)
      return
    }

    const pinned = filtered.filter(d => d.pinned)
    const rest = filtered.filter(d => !d.pinned)
    const ordered = [...pinned, ...rest]

    ordered.slice(0, RECENT_LIMIT).forEach(d => {
      const li = document.createElement('li')
      const classes = []
      if (d.pinned) classes.push('pinned')
      if (d.sealedAt) classes.push('sealed')
      if (classes.length) li.className = classes.join(' ')

      const text = document.createElement('div')
      text.className = 'drop-text'
      text.textContent = d.text

      const meta = document.createElement('div')
      meta.className = 'drop-meta'

      const time = document.createElement('span')
      time.textContent = fmtTime(d.ts)
      meta.appendChild(time)

      if (d.kind) {
        const kindEl = document.createElement('span')
        kindEl.className = 'drop-kind'
        kindEl.textContent = `· ${d.kind}`
        meta.appendChild(kindEl)
      }

      const dest = document.createElement('span')
      if (d.destination) {
        dest.className = 'drop-dest'
        dest.textContent = `→ ${d.destination}`
      } else {
        dest.className = 'drop-dest empty'
        dest.textContent = '→ unrouted'
      }
      meta.appendChild(dest)

      const brainStatus = document.createElement('span')
      brainStatus.className = d.brainId ? 'drop-brain saved' : 'drop-brain pending'
      brainStatus.textContent = d.brainId ? 'in brain' : (d.aiPolicy === 'deny' ? 'local (no brain)' : 'local only')
      meta.appendChild(brainStatus)

      if (d.aiPolicy && d.aiPolicy !== 'allow') {
        const ai = document.createElement('span')
        ai.className = `drop-ai ${d.aiPolicy}`
        ai.textContent = `· ${POLICY_LABEL[d.aiPolicy] || d.aiPolicy}`
        meta.appendChild(ai)
      }

      if (d.sealedAt) {
        const sb = document.createElement('span')
        sb.className = 'drop-sealed-badge'
        sb.textContent = `· sealed ${fmtTime(d.sealedAt)}`
        meta.appendChild(sb)
      }

      const seal = document.createElement('button')
      seal.className = d.sealedAt ? 'drop-seal sealed' : 'drop-seal'
      seal.textContent = d.sealedAt ? 'unseal' : 'seal'
      seal.style.marginLeft = 'auto'
      seal.addEventListener('click', () => {
        toggleSeal(d.id)
        renderDrops()
      })
      meta.appendChild(seal)

      const pin = document.createElement('button')
      pin.className = d.pinned ? 'drop-pin pinned' : 'drop-pin'
      pin.textContent = d.pinned ? 'unpin' : 'pin'
      pin.addEventListener('click', () => {
        togglePin(d.id)
        renderDrops()
      })
      meta.appendChild(pin)

      const del = document.createElement('button')
      del.textContent = 'delete'
      del.addEventListener('click', () => {
        deleteDrop(d.id)
        renderDrops()
      })
      meta.appendChild(del)

      li.appendChild(text)
      li.appendChild(meta)
      els.drops.appendChild(li)
    })
  }

  // ---------- bridge ----------
  const pending = new Map()
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return
    const msg = event.data
    if (!msg || msg.type !== 'reply' || !msg.request_id) return
    const resolve = pending.get(msg.request_id)
    if (!resolve) return
    pending.delete(msg.request_id)
    resolve(msg)
  })

  function callBridge(type, payload, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const request_id = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      pending.set(request_id, resolve)
      window.parent.postMessage({ type, payload, request_id }, window.location.origin)
      setTimeout(() => {
        if (pending.has(request_id)) {
          pending.delete(request_id)
          reject(new Error(`bridge timeout: ${type}`))
        }
      }, timeoutMs)
    })
  }

  async function loadHeaderMeta() {
    try {
      const [appReply, brainReply] = await Promise.all([
        callBridge('meta.app_info'),
        callBridge('meta.brain_info'),
      ])
      if (appReply.ok && brainReply.ok) {
        els.bfMeta.textContent = `v${appReply.result.version} · ${brainReply.result.name}`
      }
    } catch {}
  }

  // ---------- input handling ----------
  async function commit() {
    const text = els.input.value
    const destination = els.destination.value
    const kind = currentKind
    const drop = addDrop(text, destination, kind, currentPolicy)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    els.input.value = ''
    renderDrops()
    els.input.focus()

    if (drop.aiPolicy === 'deny') {
      els.status.textContent = 'sealed (local — no brain)'
      setTimeout(() => { els.status.textContent = '' }, 2000)
      return
    }

    els.status.textContent = 'sealed → brain…'
    try {
      const reply = await callBridge('memory.write', {
        layer: 'episodic',
        content: drop.text,
        source: 'hbar-ink',
        metadata: {
          drop_id: drop.id,
          destination: drop.destination,
          kind: drop.kind,
          ai_policy: drop.aiPolicy,
          ts: drop.ts,
        },
      }, 5000)
      if (reply.ok && reply.result && reply.result.id) {
        markDropSavedToBrain(drop.id, reply.result.id)
        els.status.textContent = 'in brain'
      } else {
        const code = (reply.error && reply.error.code) || 'memory_write_failed'
        els.status.textContent = `local only (${code})`
      }
    } catch {
      els.status.textContent = 'local only (offline)'
    }
    setTimeout(() => { els.status.textContent = '' }, 2000)
    renderDrops()
  }

  els.dropBtn.addEventListener('click', () => commit())
  els.input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  })
  els.destination.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
  })

  // ---------- presets ----------
  function bootPresets() {
    document.querySelectorAll('.preset[data-dest]').forEach(b => {
      b.addEventListener('click', () => {
        els.destination.value = b.dataset.dest
        els.input.focus()
      })
    })
    document.querySelectorAll('.preset[data-kind]').forEach(b => {
      b.addEventListener('click', () => {
        if (currentKind === b.dataset.kind) {
          currentKind = null
          b.classList.remove('active')
        } else {
          currentKind = b.dataset.kind
          document.querySelectorAll('.preset[data-kind]').forEach(other => {
            other.classList.toggle('active', other === b)
          })
        }
      })
    })

    // AI policy cycle
    function applyPolicy(p) {
      currentPolicy = p
      els.aiPolicyBtn.dataset.policy = p
      els.aiPolicyBtn.textContent = POLICY_LABEL[p] || p
      try { localStorage.setItem(POLICY_KEY, p) } catch {}
    }
    els.aiPolicyBtn.addEventListener('click', () => {
      const i = POLICY_CYCLE.indexOf(currentPolicy)
      const next = POLICY_CYCLE[(i + 1) % POLICY_CYCLE.length]
      applyPolicy(next)
    })
    let saved = 'allow'
    try {
      const v = localStorage.getItem(POLICY_KEY)
      if (POLICY_CYCLE.includes(v)) saved = v
    } catch {}
    applyPolicy(saved)
  }

  // ---------- search ----------
  function bootSearch() {
    els.search.addEventListener('input', () => {
      searchQuery = els.search.value.trim()
      renderDrops()
    })
    els.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        els.search.value = ''
        searchQuery = ''
        renderDrops()
        els.search.blur()
      }
    })
  }

  // ---------- export ----------
  function exportMd() {
    const drops = readDrops()
    if (drops.length === 0) {
      alert('nothing to export — drop a thought first.')
      return
    }
    const lines = []
    const now = new Date().toISOString()
    lines.push('# hbar.ink — drops export')
    lines.push('')
    lines.push(`generated ${now}`)
    lines.push(`${drops.length} drops total`)
    lines.push('')
    lines.push('---')
    lines.push('')
    drops.forEach(d => {
      lines.push(`## ${new Date(d.ts).toLocaleString()}`)
      const meta = []
      if (d.destination) meta.push(`to: ${d.destination}`)
      if (d.kind) meta.push(`kind: ${d.kind}`)
      if (d.aiPolicy && d.aiPolicy !== 'allow') meta.push(`ai: ${d.aiPolicy}`)
      if (d.sealedAt) meta.push(`sealed: ${new Date(d.sealedAt).toLocaleString()}`)
      if (d.pinned) meta.push('pinned')
      if (meta.length) {
        lines.push('')
        lines.push(`*${meta.join(' · ')}*`)
      }
      lines.push('')
      lines.push(d.text)
      lines.push('')
      lines.push('---')
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `hbar-ink-drops-${stamp}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  els.exportBtn.addEventListener('click', exportMd)

  // ---------- theme + size + font pickers ----------
  function applyTheme(themeClass) {
    const all = ['t-writers-room', 't-night-ink', 't-academia']
    document.body.classList.remove(...all)
    document.body.classList.add(themeClass)
    document.querySelectorAll('.ink-picker [data-theme]').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === themeClass)
    })
    try { localStorage.setItem(THEME_KEY, themeClass) } catch {}
  }
  function applySize(sizeClass) {
    const all = ['s-s', 's-m', 's-l']
    document.body.classList.remove(...all)
    document.body.classList.add(sizeClass)
    document.querySelectorAll('.ink-picker [data-size]').forEach(b => {
      b.classList.toggle('active', b.dataset.size === sizeClass)
    })
    try { localStorage.setItem(SIZE_KEY, sizeClass) } catch {}
  }
  function applyFont(fontClass) {
    const all = ['f-serif', 'f-sans', 'f-mono']
    document.body.classList.remove(...all)
    document.body.classList.add(fontClass)
    document.querySelectorAll('.ink-picker [data-font]').forEach(b => {
      b.classList.toggle('active', b.dataset.font === fontClass)
    })
    try { localStorage.setItem(FONT_KEY, fontClass) } catch {}
  }

  document.querySelectorAll('.ink-picker [data-theme]').forEach(b => {
    b.addEventListener('click', () => applyTheme(b.dataset.theme))
  })
  document.querySelectorAll('.ink-picker [data-size]').forEach(b => {
    b.addEventListener('click', () => applySize(b.dataset.size))
  })
  document.querySelectorAll('.ink-picker [data-font]').forEach(b => {
    b.addEventListener('click', () => applyFont(b.dataset.font))
  })

  function bootPickers() {
    let theme = 't-writers-room'
    let size = 's-m'
    let font = 'f-serif'
    try {
      const t = localStorage.getItem(THEME_KEY)
      if (t === 't-writers-room' || t === 't-night-ink' || t === 't-academia') theme = t
      const s = localStorage.getItem(SIZE_KEY)
      if (s === 's-s' || s === 's-m' || s === 's-l') size = s
      const f = localStorage.getItem(FONT_KEY)
      if (f === 'f-serif' || f === 'f-sans' || f === 'f-mono') font = f
    } catch {}
    applyTheme(theme)
    applySize(size)
    applyFont(font)
  }

  // ---------- focus mode ----------
  function applyFocus(on) {
    document.body.classList.toggle('focus-on', on)
    els.focusToggle.classList.toggle('active', on)
    try { localStorage.setItem(FOCUS_KEY, on ? '1' : '0') } catch {}
    if (on) els.input.focus()
  }
  els.focusToggle.addEventListener('click', () => {
    applyFocus(!document.body.classList.contains('focus-on'))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-on')) {
      applyFocus(false)
    }
  })
  function bootFocus() {
    let on = false
    try { on = localStorage.getItem(FOCUS_KEY) === '1' } catch {}
    applyFocus(on)
  }

  // ---------- info panel ----------
  function setInfoOpen(open) {
    if (open) {
      els.infoPanel.removeAttribute('hidden')
      try { localStorage.setItem(INFO_KEY, '1') } catch {}
    } else {
      els.infoPanel.setAttribute('hidden', '')
    }
  }
  els.infoToggle.addEventListener('click', () => {
    setInfoOpen(els.infoPanel.hasAttribute('hidden'))
  })
  function bootInfo() {
    let seen = false
    try { seen = localStorage.getItem(INFO_KEY) === '1' } catch {}
    if (!seen && readDrops().length === 0) setInfoOpen(true)
  }

  // ---------- boot ----------
  bootPickers()
  bootFocus()
  bootInfo()
  bootPresets()
  bootSearch()
  renderDrops()
  loadHeaderMeta()
})()
