// hbar.ink — brain-app v0.9.1.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, kind, ts, brainId?, pinned, sealedAt?, aiWeight, lineFonts? }.
// localStorage (immediate UI) + brain memory.write via the bridge.
//
// v0.9 — physicist symbol layer (an ink input layer, not a separate tool).
//   Data lives in physics.js (window.HBARPhysics), lifted from the
//   experiments/physicist-keyboard prototype. Three surfaces:
//     - inline \name completion in the editor (primary, LaTeX-style)
//     - a toggleable ∑ palette panel (category + QWERTY-shaped keyboard)
//     - Greek mode + Alt+letter — both letter-based, device-independent
//   See the "physicist symbol layer" section below for the editor glue.
//
// v0.8 additions (artistic-writing angle):
//   - per-line font: the drop input is a line editor — each line can carry
//     its own face (serif / sans / mono / display) without changing the
//     rest of the drop. Set it from the `line:` row or with Cmd/Ctrl+.
//   - AI use is now a 0–100% slider (starts at 50%) instead of a 3-state
//     button. 0% keeps the drop local; >0% writes it to the brain with the
//     weight as metadata.
//
// v0.7 carried forward: sealing ceremony, search filter, export .md/.pdf,
// document-level font/theme/size pickers.
//
// Bridge usage:
//   meta.app_info, meta.brain_info, memory.write — same as v0.6.

(() => {
  'use strict'

  const STORAGE_KEY = 'hbar-ink-drops-v8'
  const THEME_KEY = 'hbar-ink-theme'
  const SIZE_KEY = 'hbar-ink-size'
  const FONT_KEY = 'hbar-ink-font'
  const INFO_KEY = 'hbar-ink-info-seen'
  const FOCUS_KEY = 'hbar-ink-focus'
  const AI_WEIGHT_KEY = 'hbar-ink-ai-weight'
  const RECENT_LIMIT = 50

  // per-line font faces. null = inherit the document font.
  const LINE_FONT_CYCLE = [null, 'serif', 'sans', 'mono', 'display']

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
    aiSlider: document.getElementById('ai-weight'),
    aiValue: document.getElementById('ai-weight-value'),
    lineBtns: Array.from(document.querySelectorAll('.preset-line')),
    search: document.getElementById('search'),
    searchCount: document.getElementById('search-count'),
    exportBtn: document.getElementById('export-md'),
    exportPdfBtn: document.getElementById('export-pdf'),
    stats: document.getElementById('stats'),
    exportOverlay: document.getElementById('ink-export'),
    exportText: document.getElementById('ink-export-text'),
    exportClose: document.getElementById('ink-export-close'),
    exportCopy: document.getElementById('ink-export-copy'),
    exportNote: document.getElementById('ink-export-note'),
  }

  // session state
  let currentKind = null
  let currentAiWeight = 50
  let searchQuery = ''
  let lastLineBlock = null // last line block the caret was seen in

  // ---------- storage ----------
  // Bring any drop (legacy or current) to the v8 shape: numeric aiWeight,
  // optional lineFonts array. Legacy aiPolicy strings map onto the slider.
  function migrateDrop(d) {
    const aiWeight =
      typeof d.aiWeight === 'number' ? d.aiWeight
        : d.aiPolicy === 'deny' ? 0
        : d.aiPolicy === 'allow_rag_only' ? 50
        : 100
    return {
      kind: null,
      pinned: false,
      sealedAt: null,
      brainId: null,
      social: false,
      ...d,
      aiWeight,
      lineFonts: Array.isArray(d.lineFonts) ? d.lineFonts : null,
    }
  }

  function readDrops() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map(migrateDrop) : []
      }
      // One-time migration from older keys — same shape, new fields.
      for (const key of ['hbar-ink-drops-v7', 'hbar-ink-drops-v6', 'hbar-ink-drops-v3']) {
        const old = localStorage.getItem(key)
        if (old) {
          try {
            const parsed = JSON.parse(old)
            if (Array.isArray(parsed)) {
              const upgraded = parsed.map(migrateDrop)
              localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded))
              return upgraded
            }
          } catch {}
        }
      }
      return []
    } catch {
      return []
    }
  }

  function writeDrops(drops) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drops))
  }

  function addDrop(text, destination, kind, aiWeight, lineFonts) {
    if (!text || !text.trim()) return null
    const drop = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      text: text,
      destination: (destination || '').trim() || null,
      kind: kind || null,
      ts: new Date().toISOString(),
      brainId: null,
      pinned: false,
      sealedAt: null,
      social: false,
      aiWeight: typeof aiWeight === 'number' ? aiWeight : 100,
      lineFonts: (Array.isArray(lineFonts) && lineFonts.some(Boolean)) ? lineFonts : null,
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

  // Link a drop to hbar.social — the brain-federation social feed. The drop
  // stays where it is; this flags it to surface there once federation is up.
  function toggleSocial(id) {
    const all = readDrops()
    const idx = all.findIndex(d => d.id === id)
    if (idx < 0) return
    all[idx].social = !all[idx].social
    writeDrops(all)
  }

  // ---------- line editor ----------
  // The drop input is a contenteditable surface. Each visual line is one
  // top-level block; a block may carry data-font to render in another face.
  function isEditorEmpty() {
    return els.input.textContent.trim() === ''
  }

  function updatePlaceholder() {
    els.input.classList.toggle('is-empty', isEditorEmpty())
  }

  function clearEditor() {
    els.input.innerHTML = '<div><br></div>'
    updatePlaceholder()
  }

  // Read the editor as an ordered list of { text, font } lines.
  function readEditorLines() {
    const lines = []
    els.input.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        lines.push({ text: node.textContent, font: null })
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const font = node.dataset ? (node.dataset.font || null) : null
        lines.push({ text: node.textContent, font })
      }
    })
    return lines.length ? lines : [{ text: '', font: null }]
  }

  // Resolve the line block (direct child of the editor) containing a node,
  // wrapping a stray top-level text node in a block if needed.
  function blockFromNode(node) {
    let n = node
    while (n && n.parentNode && n.parentNode !== els.input) n = n.parentNode
    if (!n || n.parentNode !== els.input) return null
    if (n.nodeType === Node.TEXT_NODE) {
      const div = document.createElement('div')
      els.input.insertBefore(div, n)
      div.appendChild(n)
      return div
    }
    return n
  }

  function currentLineBlock() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    if (!els.input.contains(sel.anchorNode)) return null
    return blockFromNode(sel.anchorNode)
  }

  function syncLineButtons(font) {
    els.lineBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.linefont === font)
    })
  }

  function trackCurrentLine() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    if (!els.input.contains(sel.anchorNode)) return
    const block = blockFromNode(sel.anchorNode)
    lastLineBlock = block
    syncLineButtons(block ? (block.dataset.font || null) : null)
  }

  function setLineFont(block, font) {
    if (!block) return
    if (!font || block.dataset.font === font) {
      delete block.dataset.font // toggle off → back to the document font
      syncLineButtons(null)
    } else {
      block.dataset.font = font
      syncLineButtons(font)
    }
  }

  function cycleLineFont() {
    const block = currentLineBlock()
    if (!block) return
    const cur = block.dataset.font || null
    const next = LINE_FONT_CYCLE[(LINE_FONT_CYCLE.indexOf(cur) + 1) % LINE_FONT_CYCLE.length]
    setLineFont(block, next)
  }

  function placeCaret(block, atStart) {
    if (!block) return
    const r = document.createRange()
    r.selectNodeContents(block)
    r.collapse(!!atStart)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
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

  // Render a drop's text, honouring any per-line fonts captured at drop time.
  function renderDropText(container, drop) {
    const fonts = Array.isArray(drop.lineFonts) ? drop.lineFonts : null
    if (!fonts || !fonts.some(Boolean)) {
      container.textContent = drop.text
      return
    }
    const lines = (drop.text || '').split('\n')
    lines.forEach((ln, i) => {
      const lineEl = document.createElement('div')
      lineEl.className = 'drop-line'
      const f = fonts[i]
      if (f) lineEl.dataset.font = f
      if (ln === '') lineEl.appendChild(document.createElement('br'))
      else lineEl.textContent = ln
      container.appendChild(lineEl)
    })
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
      renderDropText(text, d)

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
      brainStatus.textContent = d.brainId ? 'in brain' : (d.aiWeight === 0 ? 'local (no brain)' : 'local only')
      meta.appendChild(brainStatus)

      if (typeof d.aiWeight === 'number' && d.aiWeight < 100) {
        const ai = document.createElement('span')
        ai.className = 'drop-ai' + (d.aiWeight === 0 ? ' deny' : '')
        ai.textContent = `· ai ${d.aiWeight}%`
        meta.appendChild(ai)
      }

      if (d.social) {
        const soc = document.createElement('span')
        soc.className = 'drop-social-badge'
        soc.textContent = '· hbar.social'
        meta.appendChild(soc)
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

      const social = document.createElement('button')
      social.className = d.social ? 'drop-social on' : 'drop-social'
      social.textContent = d.social ? 'on social' : '→ social'
      social.title = 'link this drop to hbar.social — the brain-federation social feed'
      social.addEventListener('click', () => {
        toggleSocial(d.id)
        renderDrops()
      })
      meta.appendChild(social)

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
    const lines = readEditorLines()
    // drop blank lines at the head and tail — they carry no thought.
    while (lines.length > 1 && lines[0].text.trim() === '' && !lines[0].font) lines.shift()
    while (lines.length > 1 && lines[lines.length - 1].text.trim() === '' && !lines[lines.length - 1].font) lines.pop()

    const text = lines.map(l => l.text).join('\n')
    if (!text.trim()) {
      els.status.textContent = ''
      return
    }
    const lineFonts = lines.map(l => l.font || null)

    const drop = addDrop(text, els.destination.value, currentKind, currentAiWeight, lineFonts)
    if (!drop) {
      els.status.textContent = ''
      return
    }
    clearEditor()
    renderDrops()
    els.input.focus()
    placeCaret(els.input.firstChild, true)

    if (drop.aiWeight === 0) {
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
          ai_weight: drop.aiWeight,
          line_fonts: drop.lineFonts,
          social: drop.social,
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

  els.input.addEventListener('input', () => {
    updatePlaceholder()
    trackCurrentLine()
  })
  els.input.addEventListener('keyup', trackCurrentLine)
  els.input.addEventListener('mouseup', trackCurrentLine)
  els.input.addEventListener('focus', trackCurrentLine)
  els.input.addEventListener('paste', (e) => {
    e.preventDefault()
    const cd = e.clipboardData || window.clipboardData
    const txt = cd ? cd.getData('text/plain') : ''
    if (txt) document.execCommand('insertText', false, txt)
  })
  // Editor keydown — a single priority chain so the physicist symbol layer
  // never breaks ink's own shortcuts or normal typing.
  els.input.addEventListener('keydown', (e) => {
    // 1. inline-completion dropdown owns its nav keys while open
    if (completion.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCompletion(1); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveCompletion(-1); return }
      // plain Enter/Tab accepts; Cmd/Ctrl+Enter falls through to commit
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); acceptCompletion(); return
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCompletion(); return }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        closeCompletion() // caret is leaving the \query — let it move freely
      }
    }
    // 2. ink shortcuts — unchanged
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); cycleLineFont(); return }
    if (e.metaKey || e.ctrlKey) return
    // 3. Esc turns Greek mode OFF — it never turns it on (that stays a real
    //    toggle), so Esc still falls through to ink's focus-mode exit.
    if (e.key === 'Escape' && greekMode) { e.preventDefault(); e.stopPropagation(); setGreekMode(false); return }
    // 4. Alt + letter → one-off Greek. Keyed off e.code, not e.key, so it
    //    survives macOS Option-composition (⌥q would arrive as 'œ').
    if (e.altKey) {
      const k = CODE_TO_KEY[e.code]
      if (k && P && P.physicalMap[k]) {
        e.preventDefault()
        insertText(greekSymbolFor(k, e.shiftKey))
      }
      return
    }
    // 5. Greek mode — physical keys type physics symbols, no modifier
    if (greekMode && P) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (k in P.physicalMap) {
        e.preventDefault()
        insertText(greekSymbolFor(k, e.shiftKey))
      }
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

  // ---------- presets (destination + kind) ----------
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

  // ---------- AI-use slider ----------
  function bootAi() {
    let w = 50 // starts in the middle
    try {
      const v = parseInt(localStorage.getItem(AI_WEIGHT_KEY), 10)
      if (!isNaN(v) && v >= 0 && v <= 100) w = v
    } catch {}
    currentAiWeight = w
    els.aiSlider.value = String(w)
    els.aiValue.textContent = `${w}%`
    els.aiSlider.addEventListener('input', () => {
      currentAiWeight = parseInt(els.aiSlider.value, 10) || 0
      els.aiValue.textContent = `${currentAiWeight}%`
      try { localStorage.setItem(AI_WEIGHT_KEY, String(currentAiWeight)) } catch {}
    })
  }

  // ---------- per-line font row ----------
  function bootLineFonts() {
    els.lineBtns.forEach(b => {
      // mousedown + preventDefault keeps the caret inside the editor so the
      // font lands on the line the writer was actually in.
      b.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const block = (lastLineBlock && els.input.contains(lastLineBlock))
          ? lastLineBlock
          : currentLineBlock()
        setLineFont(block, b.dataset.linefont)
        els.input.focus()
      })
    })
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
  // The brain runs ink in a sandboxed iframe (allow-scripts allow-same-origin)
  // — file downloads and popups are blocked there. So export builds the text
  // and shows it in a copyable panel rather than triggering a download.
  function buildMarkdown() {
    const drops = readDrops()
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
      if (typeof d.aiWeight === 'number' && d.aiWeight < 100) meta.push(`ai: ${d.aiWeight}%`)
      if (d.social) meta.push('hbar.social')
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
    return lines.join('\n')
  }

  function openExport(text, note) {
    els.exportText.value = text
    els.exportNote.textContent = note || ''
    els.exportOverlay.hidden = false
    els.exportText.focus()
    els.exportText.select()
  }
  function closeExport() {
    els.exportOverlay.hidden = true
  }
  function exportMd() {
    if (readDrops().length === 0) {
      alert('nothing to export — drop a thought first.')
      return
    }
    openExport(buildMarkdown(),
      'select all (⌘A / Ctrl+A) and copy — or hit copy. paste into a .md file to keep it.')
  }

  els.exportBtn.addEventListener('click', exportMd)
  els.exportClose.addEventListener('click', closeExport)
  els.exportOverlay.addEventListener('click', (e) => {
    if (e.target === els.exportOverlay) closeExport()
  })
  els.exportCopy.addEventListener('click', async () => {
    els.exportText.focus()
    els.exportText.select()
    let ok = false
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(els.exportText.value)
        ok = true
      }
    } catch {}
    if (!ok) { try { ok = document.execCommand('copy') } catch {} }
    els.exportNote.textContent = ok
      ? 'copied to clipboard.'
      : 'select the text and press ⌘C / Ctrl+C to copy.'
  })

  // ---------- export pdf (via browser print dialog) ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Render a drop body for print, keeping per-line fonts intact.
  function dropBodyHtml(d) {
    const fonts = Array.isArray(d.lineFonts) ? d.lineFonts : null
    if (!fonts || !fonts.some(Boolean)) {
      return escapeHtml(d.text).replace(/\n/g, '<br>')
    }
    return (d.text || '').split('\n').map((ln, i) => {
      const f = fonts[i]
      const cls = f ? ` class="lf-${f}"` : ''
      return `<div${cls}>${escapeHtml(ln) || '<br>'}</div>`
    }).join('')
  }

  function exportPdf() {
    const drops = readDrops()
    if (drops.length === 0) {
      alert('nothing to export — drop a thought first.')
      return
    }
    const generated = new Date().toISOString()
    const inBrain = drops.filter(d => d.brainId).length
    const sealed = drops.filter(d => d.sealedAt).length

    const dropsHtml = drops.map(d => {
      const meta = []
      meta.push(`<span class="m-time">${escapeHtml(new Date(d.ts).toLocaleString())}</span>`)
      if (d.kind) meta.push(`<span class="m-kind">${escapeHtml(d.kind)}</span>`)
      if (d.destination) meta.push(`<span class="m-dest">→ ${escapeHtml(d.destination)}</span>`)
      if (typeof d.aiWeight === 'number' && d.aiWeight < 100) meta.push(`<span class="m-ai">ai ${d.aiWeight}%</span>`)
      if (d.social) meta.push(`<span class="m-social">hbar.social</span>`)
      if (d.brainId) meta.push(`<span class="m-brain">in brain</span>`)
      if (d.sealedAt) meta.push(`<span class="m-seal">sealed ${escapeHtml(new Date(d.sealedAt).toLocaleString())}</span>`)
      if (d.pinned) meta.push(`<span class="m-pin">pinned</span>`)
      return `<article class="drop">
        <div class="text">${dropBodyHtml(d)}</div>
        <div class="meta">${meta.join(' · ')}</div>
      </article>`
    }).join('\n')

    const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>hbar.ink — drops export</title>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600&family=Inter:wght@400;500&family=DM+Mono:wght@400&family=Audiowide&display=swap" rel="stylesheet">
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 28px; background: #f6f5f2; color: #111827; font-family: 'Spectral', Georgia, serif; line-height: 1.6; }
  h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 4px; }
  .lede { color: #6b7280; font-size: 13px; font-style: italic; margin: 0 0 24px; }
  .stats { font-family: 'DM Mono', ui-monospace, monospace; font-size: 11px; color: #6b7280; margin: 0 0 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  article.drop { padding: 18px 0; border-top: 1px solid #e5e7eb; break-inside: avoid; }
  article.drop:first-of-type { border-top: none; }
  .text { font-size: 16px; line-height: 1.7; color: #1f2937; white-space: pre-wrap; margin-bottom: 10px; }
  .text .lf-serif   { font-family: 'Spectral', Georgia, serif; }
  .text .lf-sans    { font-family: 'Inter', system-ui, sans-serif; }
  .text .lf-mono    { font-family: 'DM Mono', ui-monospace, monospace; }
  .text .lf-display { font-family: 'Audiowide', system-ui, sans-serif; }
  .meta { font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px; color: #9ca3af; letter-spacing: 0.02em; }
  .meta span { margin-right: 4px; }
  .m-dest { color: #6b7280; }
  .m-brain { color: #6b7280; }
  .m-seal { color: #8a6f48; font-style: italic; }
  .m-pin { color: #8a6f48; }
  .m-ai { color: #8a6f48; }
  .m-social { color: #8a6f48; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print { body { background: white; } }
</style>
</head><body>
<h1>hbar.ink — drops</h1>
<p class="lede">a single-user thought-drop instrument.</p>
<div class="stats">${drops.length} drops · ${inBrain} in brain · ${sealed} sealed · exported ${escapeHtml(generated)}</div>
${dropsHtml}
<footer>part of hbar.systems</footer>
<script>setTimeout(() => window.print(), 400)<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) {
      // sandboxed brain iframe — popups are blocked. Fall back to the
      // copyable panel with the same content as Markdown.
      openExport(buildMarkdown(),
        'PDF needs a popup, which the brain blocks for apps — here is the same content as Markdown. copy it, or use export .md.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  els.exportPdfBtn.addEventListener('click', exportPdf)

  // ---------- theme + size + font pickers (document-level) ----------
  function applyTheme(themeClass) {
    const all = ['t-writers-room', 't-night-ink', 't-academia']
    document.documentElement.classList.remove(...all)
    document.documentElement.classList.add(themeClass)
    document.querySelectorAll('.ink-picker [data-theme]').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === themeClass)
    })
    try { localStorage.setItem(THEME_KEY, themeClass) } catch {}
  }
  function applySize(sizeClass) {
    const all = ['s-s', 's-m', 's-l']
    document.documentElement.classList.remove(...all)
    document.documentElement.classList.add(sizeClass)
    document.querySelectorAll('.ink-picker [data-size]').forEach(b => {
      b.classList.toggle('active', b.dataset.size === sizeClass)
    })
    try { localStorage.setItem(SIZE_KEY, sizeClass) } catch {}
  }
  function applyFont(fontClass) {
    const all = ['f-serif', 'f-sans', 'f-mono']
    document.documentElement.classList.remove(...all)
    document.documentElement.classList.add(fontClass)
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
    document.documentElement.classList.toggle('focus-on', on)
    els.focusToggle.classList.toggle('active', on)
    try { localStorage.setItem(FOCUS_KEY, on ? '1' : '0') } catch {}
    if (on) els.input.focus()
  }
  els.focusToggle.addEventListener('click', () => {
    applyFocus(!document.documentElement.classList.contains('focus-on'))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.documentElement.classList.contains('focus-on')) {
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

  // ---------- physicist symbol layer ----------
  // An ink input layer (not a separate tool). Data: window.HBARPhysics
  // (physics.js). Three surfaces — inline \name completion, the ∑ palette
  // panel, and Greek mode / Alt+letter. The keydown chain above already
  // wires the modes; everything else lives here.
  const P = window.HBARPhysics

  // e.code → physical-key char. Used for Alt+letter so the mapping is the
  // same on every OS/layout (e.key would be Option-composed on macOS).
  const CODE_TO_KEY = (() => {
    const m = {
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    }
    for (let i = 0; i < 10; i++) m['Digit' + i] = String(i)
    for (const c of 'abcdefghijklmnopqrstuvwxyz') m['Key' + c.toUpperCase()] = c
    return m
  })()

  let physEls = null
  let greekMode = false
  let paletteOpen = false
  let paletteLayout = 'category'
  let descMode = false
  const completion = { open: false, items: [], sel: 0, queryLen: 0 }

  function greekSymbolFor(k, shift) {
    let sym = P.physicalMap[k]
    if (k >= 'a' && k <= 'z' && shift) sym = P.greekUpper[k] || sym
    return sym
  }

  // --- editor insertion (contenteditable; execCommand keeps native undo) ---
  function ensureEditorSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && els.input.contains(sel.anchorNode)) return
    els.input.focus()
    placeCaret(els.input.lastChild, false)
  }
  function insertText(text) {
    ensureEditorSelection()
    document.execCommand('insertText', false, text)
    updatePlaceholder()
    trackCurrentLine()
  }
  function insertLineBreak() {
    ensureEditorSelection()
    document.execCommand('insertParagraph')
    updatePlaceholder()
  }
  function doBackspace() {
    ensureEditorSelection()
    document.execCommand('delete')
    updatePlaceholder()
  }

  // --- Greek mode ---
  function setGreekMode(on) {
    greekMode = on
    physEls.greekToggle.classList.toggle('active', on)
    physEls.greekToggle.setAttribute('aria-pressed', on ? 'true' : 'false')
    if (paletteOpen && paletteLayout === 'keyboard') renderPaletteBoard()
  }

  // --- description hover card ---
  function showSymCard(el) {
    if (!descMode || !el._info) return
    const card = physEls.symCard
    card.innerHTML = ''
    const head = document.createElement('div')
    head.className = 'symcard-head'
    if (el._cardSym) {
      const s = document.createElement('span')
      s.className = 'symcard-sym'
      s.textContent = el._cardSym
      head.appendChild(s)
    }
    const n = document.createElement('span')
    n.className = 'symcard-name'
    n.textContent = el._info.n
    head.appendChild(n)
    const d = document.createElement('div')
    d.className = 'symcard-desc'
    d.textContent = el._info.d
    card.appendChild(head)
    card.appendChild(d)
    card.style.display = 'block'
    const r = el.getBoundingClientRect()
    const cw = card.offsetWidth, ch = card.offsetHeight
    let left = r.left + r.width / 2 - cw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8))
    let top = r.top - ch - 10
    if (top < 8) top = r.bottom + 10
    card.style.left = left + 'px'
    card.style.top = top + 'px'
  }
  function hideSymCard() { physEls.symCard.style.display = 'none' }

  // --- palette panel ---
  function makePalKey(opts) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'ink-pal-key' + (opts.cls ? ' ' + opts.cls.join(' ') : '')
    b.textContent = opts.show != null ? opts.show : (opts.sym || '')
    if (opts.snippetName != null) {
      const n = document.createElement('span')
      n.className = 'pal-name'
      n.textContent = opts.snippetName
      b.prepend(n)
    }
    if (opts.phys != null) {
      const p = document.createElement('span')
      p.className = 'pal-phys'
      p.textContent = opts.phys
      b.appendChild(p)
    }
    b._info = opts.info || null
    b._cardSym = opts.cardSym != null ? opts.cardSym : (opts.show || opts.sym || '')
    // mousedown + preventDefault keeps the editor's caret/selection alive,
    // so the symbol lands where the writer actually was.
    b.addEventListener('mousedown', (e) => { e.preventDefault(); opts.onAction() })
    b.addEventListener('mouseenter', () => showSymCard(b))
    b.addEventListener('mouseleave', hideSymCard)
    return b
  }

  function renderCategory(board) {
    for (const panel of P.panels) {
      const sec = document.createElement('section')
      sec.className = 'ink-pal-group'
      const h = document.createElement('h3')
      h.textContent = panel.title
      sec.appendChild(h)
      const row = document.createElement('div')
      row.className = 'ink-pal-row'
      for (const item of panel.keys) {
        if (panel.snippet) {
          row.appendChild(makePalKey({
            sym: item.sym, show: item.sym, snippetName: item.name, cls: ['snippet'],
            info: { n: item.name, d: item.idea }, cardSym: '',
            onAction: () => insertText(item.sym),
          }))
        } else if (panel.accent) {
          row.appendChild(makePalKey({
            sym: item.sym, show: item.show, info: P.desc[item.sym], cardSym: item.show,
            onAction: () => insertText(item.sym),
          }))
        } else {
          const sym = item
          row.appendChild(makePalKey({
            sym, show: sym, info: P.desc[sym], phys: P.symToPhys[sym],
            cls: sym === 'ℏ' ? ['hbar'] : null,
            onAction: () => insertText(sym),
          }))
        }
      }
      sec.appendChild(row)
      board.appendChild(sec)
    }
  }

  function specialAction(kind) {
    return {
      backspace: doBackspace,
      tab: () => insertText('    '),
      enter: insertLineBreak,
      space: () => insertText(' '),
      mode: () => setGreekMode(!greekMode),
      shift: () => {},
      alt: () => {},
    }[kind]
  }
  function renderKeyboard(board) {
    const kb = document.createElement('div')
    kb.className = 'ink-pal-kb'
    for (const rowDef of P.kbRows) {
      const row = document.createElement('div')
      row.className = 'ink-pal-kbrow'
      for (const k of rowDef) {
        if (k.special) {
          const b = makePalKey({
            sym: '', show: k.label, info: k.info, cardSym: '',
            cls: ['kb', 'sp'], onAction: specialAction(k.kind),
          })
          b.style.width = P.spWidth[k.kind] + 'px'
          if (k.kind === 'mode' && greekMode) b.classList.add('on')
          row.appendChild(b)
        } else {
          row.appendChild(makePalKey({
            sym: k.sym, show: k.sym, info: P.desc[k.sym], phys: k.phys,
            cls: k.sym === 'ℏ' ? ['kb', 'hbar'] : ['kb'],
            onAction: () => insertText(k.sym),
          }))
        }
      }
      kb.appendChild(row)
    }
    board.appendChild(kb)
  }

  function renderPaletteBoard() {
    const board = physEls.paletteBoard
    board.innerHTML = ''
    hideSymCard()
    if (paletteLayout === 'keyboard') renderKeyboard(board)
    else renderCategory(board)
  }

  function setPaletteOpen(on) {
    paletteOpen = on
    physEls.palette.hidden = !on
    physEls.paletteToggle.classList.toggle('active', on)
    physEls.paletteToggle.setAttribute('aria-pressed', on ? 'true' : 'false')
    if (on) renderPaletteBoard()
    else hideSymCard()
  }

  // --- inline \name completion ---
  function closeCompletion() {
    if (!completion.open) return
    completion.open = false
    completion.items = []
    physEls.complete.hidden = true
  }
  function moveCompletion(d) {
    if (!completion.items.length) return
    completion.sel = (completion.sel + d + completion.items.length) % completion.items.length
    renderCompletionList()
  }
  function caretRect() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return null
    const r = sel.getRangeAt(0).cloneRange()
    r.collapse(true)
    const rects = r.getClientRects()
    if (rects && rects.length) return rects[0]
    const br = r.getBoundingClientRect()
    if (br && (br.width || br.height || br.top)) return br
    const block = currentLineBlock()
    return block ? block.getBoundingClientRect() : null
  }
  function renderCompletionList() {
    const box = physEls.complete
    box.innerHTML = ''
    completion.items.forEach((en, i) => {
      const row = document.createElement('div')
      row.className = 'ink-cmp-row' + (i === completion.sel ? ' sel' : '')
      row.setAttribute('role', 'option')
      const sym = document.createElement('span')
      sym.className = 'ink-cmp-sym'
      sym.textContent = en.show
      const name = document.createElement('span')
      name.className = 'ink-cmp-name'
      name.textContent = en.name
      const desc = document.createElement('span')
      desc.className = 'ink-cmp-desc'
      desc.textContent = en.info ? en.info.d : ''
      row.appendChild(sym)
      row.appendChild(name)
      row.appendChild(desc)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        completion.sel = i
        acceptCompletion()
      })
      box.appendChild(row)
    })
    const selRow = box.children[completion.sel]
    if (selRow) selRow.scrollIntoView({ block: 'nearest' })
  }
  function checkCompletion() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !els.input.contains(sel.anchorNode)) { closeCompletion(); return }
    const node = sel.anchorNode
    if (node.nodeType !== Node.TEXT_NODE) { closeCompletion(); return }
    const before = node.textContent.slice(0, sel.anchorOffset)
    const m = before.match(/\\([A-Za-z0-9]*)$/) // trigger: backslash, LaTeX-style
    if (!m) { closeCompletion(); return }
    const query = m[1].toLowerCase()
    completion.queryLen = m[1].length
    const items = query
      ? P.matchSearch(query).slice(0, 24)
      : P.commonEntries.slice(0, 24)
    if (!items.length) { closeCompletion(); return }
    completion.items = items
    completion.sel = 0
    completion.open = true
    physEls.complete.hidden = false
    renderCompletionList()
    const rect = caretRect()
    if (rect) {
      const box = physEls.complete
      const bw = box.offsetWidth || 320
      const bh = box.offsetHeight || 200
      let left = Math.max(8, Math.min(rect.left, window.innerWidth - bw - 8))
      let top = rect.bottom + 6
      if (top + bh > window.innerHeight - 8) top = rect.top - bh - 6
      box.style.left = left + 'px'
      box.style.top = top + 'px'
    }
  }
  function acceptCompletion() {
    const item = completion.items[completion.sel]
    if (!item) { closeCompletion(); return }
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        // select the "\query" we're replacing, then overwrite it
        const offset = range.startOffset
        const start = Math.max(0, offset - (completion.queryLen + 1))
        const r = document.createRange()
        r.setStart(node, start)
        r.setEnd(node, offset)
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
    document.execCommand('insertText', false, item.sym)
    closeCompletion()
    updatePlaceholder()
    trackCurrentLine()
  }

  function bootPhysics() {
    if (!P) return // physics.js missing — degrade to plain ink
    physEls = {
      greekToggle: document.getElementById('greek-toggle'),
      paletteToggle: document.getElementById('palette-toggle'),
      palette: document.getElementById('palette'),
      paletteLayout: document.getElementById('palette-layout'),
      paletteBoard: document.getElementById('palette-board'),
      descToggle: document.getElementById('desc-toggle'),
      complete: document.getElementById('ink-complete'),
      symCard: document.getElementById('ink-symcard'),
    }
    physEls.greekToggle.addEventListener('click', () => setGreekMode(!greekMode))
    physEls.paletteToggle.addEventListener('click', () => setPaletteOpen(!paletteOpen))
    physEls.paletteLayout.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      paletteLayout = btn.dataset.layout
      physEls.paletteLayout.querySelectorAll('button')
        .forEach(b => b.classList.toggle('on', b === btn))
      renderPaletteBoard()
    })
    physEls.descToggle.addEventListener('click', () => {
      descMode = !descMode
      physEls.descToggle.classList.toggle('active', descMode)
      physEls.descToggle.setAttribute('aria-pressed', descMode ? 'true' : 'false')
      physEls.descToggle.textContent = 'descriptions: ' + (descMode ? 'on' : 'off')
      if (!descMode) hideSymCard()
    })
    // inline-completion lifecycle
    els.input.addEventListener('input', checkCompletion)
    els.input.addEventListener('blur', () => setTimeout(closeCompletion, 120))
    els.input.addEventListener('mousedown', closeCompletion)
    window.addEventListener('scroll', () => { hideSymCard(); closeCompletion() }, true)
  }

  // ---------- boot ----------
  try { document.execCommand('defaultParagraphSeparator', false, 'div') } catch {}
  clearEditor()
  bootPickers()
  bootFocus()
  bootInfo()
  bootPresets()
  bootAi()
  bootLineFonts()
  bootPhysics()
  bootSearch()
  renderDrops()
  loadHeaderMeta()
  els.input.focus()
  placeCaret(els.input.firstChild, true)
})()
