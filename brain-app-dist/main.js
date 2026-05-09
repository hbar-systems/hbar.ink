// hbar.ink — brain-app v0.6.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, kind, ts, brainId?, pinned }. Storage is localStorage
// (immediate UI) AND the brain's episodic memory layer via the bridge
// memory.write intent.
//
// Bridge usage (v0.6):
//   meta.app_info  — header version display
//   meta.brain_info — header brain-name display
//   memory.write   — append the drop into the brain's episodic layer
//                    payload: { layer, content, source, metadata }
//                    success: result.id is the brain-side memory id

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v6'
  const THEME_KEY = 'hbar-ink-theme'
  const SIZE_KEY = 'hbar-ink-size'
  const INFO_KEY = 'hbar-ink-info-seen'
  const FOCUS_KEY = 'hbar-ink-focus'
  const RECENT_LIMIT = 30

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
  }

  // Track current source-kind picked from the kind preset row (null = unset)
  let currentKind = null

  // ---------- storage ----------
  function readDrops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        // One-time migration from v3 to v6 — same shape, just adds new fields
        // as null. Reads any older drops and brings them forward.
        const v3 = localStorage.getItem('hbar-ink-drops-v3')
        if (v3) {
          try {
            const parsed = JSON.parse(v3)
            if (Array.isArray(parsed)) {
              const upgraded = parsed.map(d => ({
                kind: null, pinned: false, ...d,
              }))
              localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded))
              return upgraded
            }
          } catch {}
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

  function addDrop(text, destination, kind) {
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
    writeDrops(readDrops().filter(d => d.id !== id))
  }

  function togglePin(id) {
    const all = readDrops()
    const idx = all.findIndex(d => d.id === id)
    if (idx < 0) return
    all[idx].pinned = !all[idx].pinned
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

    // Streak: count consecutive days (going backward from today) with at
    // least one drop. If there are zero drops today, streak = 0.
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

  // ---------- render ----------
  function fmtTime(iso) {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function renderDrops() {
    const drops = readDrops()
    els.drops.innerHTML = ''
    renderCounter()

    if (drops.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'empty'
      empty.innerHTML =
        '<span class="empty-line">no drops yet.</span>' +
        '<span class="empty-line">type a thought above and hit drop.</span>' +
        '<span class="empty-line empty-faint">drops route to your brain\'s episodic memory.</span>'
      els.drops.appendChild(empty)
      return
    }

    // Pinned first, then chronological among non-pinned.
    const pinned = drops.filter(d => d.pinned)
    const rest = drops.filter(d => !d.pinned)
    const ordered = [...pinned, ...rest]

    ordered.slice(0, RECENT_LIMIT).forEach(d => {
      const li = document.createElement('li')
      if (d.pinned) li.className = 'pinned'

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
      brainStatus.textContent = d.brainId ? 'in brain' : 'local only'
      meta.appendChild(brainStatus)

      const pin = document.createElement('button')
      pin.className = d.pinned ? 'drop-pin pinned' : 'drop-pin'
      pin.textContent = d.pinned ? 'unpin' : 'pin'
      pin.addEventListener('click', () => {
        togglePin(d.id)
        renderDrops()
      })
      pin.style.marginLeft = 'auto'
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
    } catch {
      // standalone-load (no parent host): leave the meta line empty.
    }
  }

  // ---------- input handling ----------
  async function commit() {
    const text = els.input.value
    const destination = els.destination.value
    const kind = currentKind
    const drop = addDrop(text, destination, kind)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    els.input.value = ''
    // Keep destination + kind so user can drop multiple of the same shape
    els.status.textContent = 'sealed → brain…'
    renderDrops()
    els.input.focus()

    try {
      const reply = await callBridge('memory.write', {
        layer: 'episodic',
        content: drop.text,
        source: 'hbar-ink',
        metadata: {
          drop_id: drop.id,
          destination: drop.destination,
          kind: drop.kind,
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
    } catch (e) {
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
  }

  // ---------- theme + size pickers ----------
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

  document.querySelectorAll('.ink-picker [data-theme]').forEach(b => {
    b.addEventListener('click', () => applyTheme(b.dataset.theme))
  })
  document.querySelectorAll('.ink-picker [data-size]').forEach(b => {
    b.addEventListener('click', () => applySize(b.dataset.size))
  })

  function bootPickers() {
    let theme = 't-writers-room'
    let size = 's-m'
    try {
      const t = localStorage.getItem(THEME_KEY)
      if (t === 't-writers-room' || t === 't-night-ink' || t === 't-academia') theme = t
      const s = localStorage.getItem(SIZE_KEY)
      if (s === 's-s' || s === 's-m' || s === 's-l') size = s
    } catch {}
    applyTheme(theme)
    applySize(size)
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
  renderDrops()
  loadHeaderMeta()
})()
