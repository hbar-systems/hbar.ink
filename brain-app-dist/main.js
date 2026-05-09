// hbar.ink — brain-app v0.2.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, ts }. Storage is localStorage in v0.2; the
// brain.memory.write integration ships v0.3 — that's when the
// `destination` field starts actually routing thoughts into the
// brain's RAG layer.
//
// Bridge usage (v0.2):
//   meta.app_info  — header version display
//   meta.brain_info — header brain-name display
//
// Roadmap intents (NOT YET wired):
//   memory.write   — { layer, content, source, destination }

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v2'
  const RECENT_LIMIT = 20

  const els = {
    input: document.getElementById('drop-input'),
    destination: document.getElementById('destination'),
    status: document.getElementById('status'),
    drops: document.getElementById('drops'),
    today: document.getElementById('count-today'),
    bfMeta: document.getElementById('bf-meta'),
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
    }
    const all = readDrops()
    all.unshift(drop)
    writeDrops(all)
    return drop
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
      empty.textContent = 'no drops yet. thoughts land here.'
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
  function commit() {
    const text = els.input.value
    const destination = els.destination.value
    const drop = addDrop(text, destination)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    els.input.value = ''
    // Keep destination so user can drop multiple thoughts to same dest
    els.status.textContent = 'sealed'
    setTimeout(() => { els.status.textContent = '' }, 1200)
    renderDrops()
    els.input.focus()
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

  // ---------- boot ----------
  renderDrops()
  loadHeaderMeta()
})()
