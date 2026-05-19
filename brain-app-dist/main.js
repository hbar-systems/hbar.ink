// hbar.ink — brain-app v0.8.
//
// Drop instrument inside a brain iframe. Each drop is { id, text,
// destination, kind, ts, brainId?, pinned, sealedAt?, aiWeight, lineFonts? }.
// localStorage (immediate UI) + brain memory.write via the bridge.
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
  els.input.addEventListener('keydown', (e) => {
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
      alert('popup blocked — allow popups for this page to export PDF.')
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

  // ---------- boot ----------
  try { document.execCommand('defaultParagraphSeparator', false, 'div') } catch {}
  clearEditor()
  bootPickers()
  bootFocus()
  bootInfo()
  bootPresets()
  bootAi()
  bootLineFonts()
  bootSearch()
  renderDrops()
  loadHeaderMeta()
  els.input.focus()
  placeCaret(els.input.firstChild, true)
})()
