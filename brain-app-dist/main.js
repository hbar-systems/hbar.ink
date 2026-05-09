// hbar.ink — drop instrument inside a brain iframe.
//
// v0 storage: localStorage key `hbar-ink-drops-v1`. v1 will switch to
// the brain's memory.write intent through the postMessage bridge.
//
// Bridge usage (v0):
//   - meta.app_info  — used to display app name+version in the header
//   - meta.brain_info — used to display "drops on <brain>" in the header
//
// Permission-gated intents (memory.write, memory.read) are NOT used in
// this version. The manifest declares zero permissions to match.

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v1'
  const RECENT_LIMIT = 12

  const els = {
    input: document.getElementById('drop-input'),
    status: document.getElementById('status'),
    drops: document.getElementById('drops'),
    meta: document.getElementById('bf-meta'),
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

  function addDrop(text) {
    const trimmed = text.trim()
    if (!trimmed) return null
    const drop = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text: trimmed,
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

    if (drops.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'empty'
      empty.textContent = 'No drops yet.'
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
      const del = document.createElement('button')
      del.textContent = 'delete'
      del.addEventListener('click', () => {
        deleteDrop(d.id)
        renderDrops()
      })

      meta.appendChild(time)
      meta.appendChild(del)
      li.appendChild(text)
      li.appendChild(meta)
      els.drops.appendChild(li)
    })
  }

  // ---------- bridge ----------
  // Lightweight request/reply against the host. Each request gets a uuid;
  // we resolve a Promise when a 'reply' event with the matching id arrives.
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
        els.meta.textContent = `v${appReply.result.version} · drops on ${brainReply.result.name}`
      }
    } catch {
      // Standalone-load (no parent host): leave the meta line empty.
    }
  }

  // ---------- input handling ----------
  function commit() {
    const text = els.input.value
    const drop = addDrop(text)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    els.input.value = ''
    els.status.textContent = `dropped at ${fmtTime(drop.ts)}`
    renderDrops()
    els.input.focus()
  }

  els.input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  })

  // ---------- boot ----------
  renderDrops()
  loadHeaderMeta()
})()
