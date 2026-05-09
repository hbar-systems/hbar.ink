// hbar.ink — brain-app v0.4.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, ts, brainId? }. Storage is localStorage (immediate UI)
// AND the brain's episodic memory layer via the bridge memory.write
// intent. brainId is set when the brain accepts the write.
//
// Bridge usage (v0.3):
//   meta.app_info  — header version display
//   meta.brain_info — header brain-name display
//   memory.write   — append the drop into the brain's episodic layer.
//                    payload: { layer, content, source, metadata }
//                    success: result.id is the brain-side memory id.

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v3'
  const THEME_KEY = 'hbar-ink-theme'
  const SIZE_KEY = 'hbar-ink-size'
  const INFO_KEY = 'hbar-ink-info-seen'
  const RECENT_LIMIT = 20

  const els = {
    input: document.getElementById('drop-input'),
    destination: document.getElementById('destination'),
    status: document.getElementById('status'),
    drops: document.getElementById('drops'),
    today: document.getElementById('count-today'),
    bfMeta: document.getElementById('bf-meta'),
    infoToggle: document.getElementById('info-toggle'),
    infoPanel: document.getElementById('info-panel'),
  }

  // ---------- storage ----------
  function readDrops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function writeDrops(drops) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drops))
  }

  function addDrop(text, destination) {
    const trimmed = (text || '').trim()
    if (!trimmed) return null
    const drop = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text: trimmed,
      destination: (destination || '').trim() || null,
      ts: new Date().toISOString(),
      brainId: null,  // set when brain memory.write succeeds
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

  function isToday(iso) {
    const d = new Date(iso)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
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

  function renderCounters() {
    const drops = readDrops()
    const today = drops.filter(d => isToday(d.ts)).length
    els.today.textContent = `${today} today`
  }

  function renderDrops() {
    const drops = readDrops()
    els.drops.innerHTML = ''
    renderCounters()

    if (drops.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'empty'
      empty.innerHTML =
        '<span class="empty-line">no drops yet.</span>' +
        '<span class="empty-line">type a thought above. Cmd+↵ to seal.</span>' +
        '<span class="empty-line empty-faint">drops route to your brain\'s episodic memory.</span>'
      els.drops.appendChild(empty)
      return
    }

    drops.slice(0, RECENT_LIMIT).forEach(d => {
      const li = document.createElement('li')

      const text = document.createElement('div')
      text.className = 'drop-text'
      text.textContent = d.text

      const meta = document.createElement('div')
      meta.className = 'drop-meta'

      const time = document.createElement('span')
      time.textContent = fmtTime(d.ts)
      meta.appendChild(time)

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
    const drop = addDrop(text, destination)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    els.input.value = ''
    // Keep destination so user can drop multiple thoughts to same dest
    els.status.textContent = 'sealed → brain…'
    renderDrops()
    els.input.focus()

    // Append to brain episodic memory via bridge. Local copy already saved
    // above; brain write is best-effort — if it fails, the drop stays
    // local-only (visible as "local only" in the meta strip) and the user
    // can retry by dropping it again.
    try {
      const reply = await callBridge('memory.write', {
        layer: 'episodic',
        content: drop.text,
        source: 'hbar-ink',
        metadata: {
          drop_id: drop.id,
          destination: drop.destination,
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
  })

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
    // Show info panel automatically on first visit ever — once dismissed,
    // it stays closed unless the user clicks ? again.
    let seen = false
    try { seen = localStorage.getItem(INFO_KEY) === '1' } catch {}
    if (!seen && readDrops().length === 0) setInfoOpen(true)
  }

  // ---------- boot ----------
  bootPickers()
  bootInfo()
  renderDrops()
  loadHeaderMeta()
})()
