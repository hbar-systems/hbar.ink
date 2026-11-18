// free-canvas.js — write anywhere on the page. Created 2026-11-18 (INK-MAGIC-1).
//
// One framework-free module, shared by the hbar.ink site (src/app/page.tsx
// imports this file) and the brain-app (brain-app-dist/index.html loads it).
// The fragment shape matches the film page (FILM-PAGE-1, /home/hands/out/film/):
//   { id, text, x, y, font, ts, from, locked?, meta? }
//   x = fraction of the canvas width (0..1), y = px from the canvas top.
// so a film or any other page can mount the same canvas on the same data.
//
// What it does:
//   tap anywhere      a fragment starts there, the caret in it
//   drag a fragment   it moves; it settles where you let go
//   tap a word        the caret lands on that word; edit in place
//   empty a fragment  it fades when you leave it
//   Cmd/Ctrl+Z        undo (shift = redo), across typing, moves, creates, deletes
//   Cmd/Ctrl+.        cycle the fragment's face (serif, sans, mono, display)
//   Cmd/Ctrl+J        the muse: one question beside the fragment, never written into it
//   autosave          every change, to localStorage under opts.storageKey
//
// The muse rule: questions only (anything that does not end in "?" is dropped,
// never shown), and no code path writes a muse question into a fragment.

;(function (root) {
  'use strict'

  const FACES = [null, 'sans', 'mono', 'display']
  const HISTORY_MAX = 300

  function uid() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
  function iso() { return new Date().toISOString() }
  function el(tag, cls, text) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }
  const PLAINTEXT = (() => {
    try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only' } catch (e) { return false }
  })()

  // Keep the first sentence that ends in "?"; everything else is dropped.
  function toQuestion(raw) {
    const flat = String(raw || '').replace(/\s+/g, ' ').replace(/^[\s"“'«*_-]+/, '').trim()
    const m = flat.match(/[^?.!…]*\?/)
    if (!m) return null
    const q = m[0].replace(/^[\s"“'«*_-]+/, '').trim()
    if (q.length < 6 || q.length > 240) return null
    return q
  }

  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y)
      if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r }
    }
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
    return null
  }
  function caretEnd(node) {
    const r = document.createRange(); r.selectNodeContents(node); r.collapse(false)
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  }

  function create(host, opts) {
    opts = opts || {}
    const key = opts.storageKey || 'free-canvas'
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const canvas = el('div', 'fc')
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-label', 'a page: tap anywhere to write')
    const hint = el('div', 'fc-hint')
    hint.append(el('span', 'fc-hint-big', opts.hint || 'Write anywhere.'), el('span', 'fc-hint-small', opts.hintSmall || 'Tap the page and begin.'))
    const muse = el('div', 'fc-muse')
    muse.setAttribute('aria-live', 'polite')
    muse.hidden = true
    const kept = el('div', 'fc-kept', '')
    canvas.append(hint, muse, kept)
    host.append(canvas)

    // ---------- state ----------
    let F = load()
    let hist = [], hi = -1, typingT = null, saveT = null, keptT = null
    let drag = null
    let museFor = null, museSeq = 0

    function load() {
      try {
        const raw = localStorage.getItem(key)
        if (raw) { const o = JSON.parse(raw); if (o && Array.isArray(o.fragments)) return o.fragments }
      } catch (e) {}
      let list = []
      if (typeof opts.migrate === 'function') { try { list = opts.migrate() || [] } catch (e) { list = [] } }
      if (Array.isArray(opts.seed)) list = list.concat(opts.seed.filter(s => !list.some(f => f.id === s.id)))
      return list.map(f => Object.assign({ font: null, ts: iso(), from: 'him' }, f))
    }
    function persist() {
      clearTimeout(saveT)
      saveT = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify({ v: 1, updated: iso(), fragments: F }))
          showKept()
        } catch (e) { kept.textContent = 'not saved: this browser refused storage'; kept.classList.add('on') }
        if (typeof opts.onChange === 'function') opts.onChange(F)
      }, 250)
    }
    function showKept() {
      kept.textContent = 'kept'
      kept.classList.add('on')
      clearTimeout(keptT)
      keptT = setTimeout(() => kept.classList.remove('on'), 1100)
    }

    // ---------- history ----------
    function snap() { return JSON.stringify(F) }
    function commit() {
      clearTimeout(typingT); typingT = null
      const s = snap()
      if (hist[hi] === s) return
      hist = hist.slice(0, hi + 1); hist.push(s)
      if (hist.length > HISTORY_MAX) hist.shift()
      hi = hist.length - 1
    }
    function commitSoon() { clearTimeout(typingT); typingT = setTimeout(commit, 650) }
    function restore(s) {
      const focusedId = focusedFragmentId()
      F = JSON.parse(s)
      render(false, true)
      persist()
      if (focusedId) {
        const t = canvas.querySelector('[data-id="' + focusedId + '"] .fc-txt')
        if (t) { t.focus(); caretEnd(t) }
      }
    }
    function undo() { if (typingT) commit(); if (hi > 0) { hi--; restore(hist[hi]) } }
    function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]) } }

    // ---------- geometry ----------
    function W() { return canvas.clientWidth || 1 }
    function place(e, f) {
      const w = e.offsetWidth || 200
      const left = Math.max(10, Math.min(W() - w - 10, f.x * W()))
      e.style.left = left + 'px'
      e.style.top = Math.max(12, f.y) + 'px'
    }
    // words never sit on words: a fragment that would cover another shows just
    // below it. Display only; the stored place stays until it is moved by hand.
    function unstack() {
      const rs = [...canvas.querySelectorAll('.fc-frag')]
        .filter(e => !e.classList.contains('drag') && !e.classList.contains('gone'))
        .map(e => ({ e, l: e.offsetLeft, t: parseFloat(e.style.top) || 0, w: e.offsetWidth, h: e.offsetHeight }))
        .sort((a, b) => a.t - b.t || a.l - b.l)
      const done = []
      for (const r of rs) {
        let moved = true
        while (moved) {
          moved = false
          for (const o of done) {
            if (r.l < o.l + o.w + 6 && o.l < r.l + r.w + 6 && r.t < o.t + o.h + 8 && o.t < r.t + r.h + 8) { r.t = o.t + o.h + 14; moved = true }
          }
        }
        r.e.style.top = r.t + 'px'
        done.push(r)
      }
    }
    function grow() {
      const bottom = Math.max(0, ...[...canvas.querySelectorAll('.fc-frag')].map(e => e.offsetTop + e.offsetHeight))
      // never below the host's own CSS min-height; grows with the words
      canvas.style.minHeight = opts.minHeight ? opts.minHeight + 'px' : ''
      const need = bottom + 220
      if (need > canvas.clientHeight) canvas.style.minHeight = need + 'px'
    }

    // ---------- fragments ----------
    function byId(id) { return F.find(f => f.id === id) }
    function textOf(t) { return (PLAINTEXT ? t.textContent : t.innerText).replace(/\n$/, '') }
    function focusedFragmentId() {
      const a = document.activeElement
      const fe = a && a.closest && a.closest('.fc-frag')
      return fe && canvas.contains(fe) ? fe.dataset.id : null
    }

    function fragEl(f) {
      let e = canvas.querySelector('[data-id="' + f.id + '"]')
      if (e) return e
      e = el('div', 'fc-frag')
      e.dataset.id = f.id
      const t = el('div', 'fc-txt')
      if (!f.locked) { t.contentEditable = PLAINTEXT ? 'plaintext-only' : 'true'; t.spellcheck = true }
      t.setAttribute('role', 'textbox')
      t.setAttribute('aria-multiline', 'true')
      e.append(t)
      if (f.by) e.append(el('span', 'fc-by', f.by))
      canvas.append(e)
      wire(e, t, f.id)
      return e
    }

    function wire(e, t, id) {
      t.addEventListener('input', () => {
        const f = byId(id); if (!f) return
        f.text = textOf(t); f.ts = iso()
        wet(e)
        if (museFor === id) placeMuse()
        commitSoon(); persist(); grow()
      })
      t.addEventListener('focus', () => { e.classList.add('edit') })
      t.addEventListener('blur', () => {
        e.classList.remove('edit')
        const f = byId(id)
        if (f && !f.locked && !f.text.trim()) {
          F = F.filter(x => x !== f)
          e.classList.add('gone')
          setTimeout(() => { e.remove(); unstack(); grow() }, reduce ? 0 : 420)
          if (museFor === id) hideMuse()
          commit(); persist()
        } else commit()
        updateHint()
      })
      if (!PLAINTEXT) t.addEventListener('paste', ev => {
        ev.preventDefault()
        document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain'))
      })
      // press: a drag if it moves, else the caret lands where the finger did
      e.addEventListener('pointerdown', ev => {
        if (ev.button) return
        if (e.classList.contains('edit') && ev.target.closest('.fc-txt')) return // selecting text while editing
        const r = e.getBoundingClientRect()
        drag = { e, t, id, sx: ev.clientX, sy: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, moved: false, pid: ev.pointerId }
        ev.preventDefault()
      })
    }

    // fresh ink: a faint warm bloom while the hand moves, settling when it rests
    function wet(e) {
      if (reduce) return
      e.classList.add('wet')
      clearTimeout(e._dry)
      e._dry = setTimeout(() => e.classList.remove('wet'), 700)
    }

    function onMove(ev) {
      if (!drag || ev.pointerId !== drag.pid) return
      if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 5) return
      if (!drag.moved) {
        drag.moved = true
        drag.e.classList.add('drag')
        try { drag.e.setPointerCapture(drag.pid) } catch (e) {}
        hideMuse()
      }
      const cr = canvas.getBoundingClientRect()
      drag.e.style.left = (ev.clientX - cr.left - drag.dx) + 'px'
      drag.e.style.top = (ev.clientY - cr.top - drag.dy) + 'px'
    }
    function onUp(ev) {
      if (!drag || ev.pointerId !== drag.pid) return
      const d = drag; drag = null
      const f = byId(d.id)
      if (d.moved && f) {
        const left = parseFloat(d.e.style.left) || 0
        f.x = Math.max(0, Math.min(1, left / W()))
        f.y = Math.max(12, parseFloat(d.e.style.top) || 0)
        d.e.classList.remove('drag')
        settle(d.e)
        place(d.e, f); unstack(); grow()
        commit(); persist()
        return
      }
      d.e.classList.remove('drag')
      if (f && !f.locked) {
        d.t.focus()
        const r = caretAt(ev.clientX, ev.clientY)
        const s = getSelection()
        if (r && d.t.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r) } else caretEnd(d.t)
      }
    }
    function settle(e) {
      if (reduce) return
      e.classList.remove('settle'); void e.offsetWidth; e.classList.add('settle')
      setTimeout(() => e.classList.remove('settle'), 600)
    }

    function setFace(e, f) {
      FACES.forEach(x => x && e.classList.remove('face-' + x))
      if (f.font) e.classList.add('face-' + f.font)
    }

    function render(first, force) {
      const live = new Set()
      F.forEach((f, i) => {
        const e = fragEl(f)
        live.add(e)
        const t = e.querySelector('.fc-txt')
        if ((force || document.activeElement !== t) && textOf(t) !== f.text) t.textContent = f.text || ''
        e.classList.toggle('locked', !!f.locked)
        setFace(e, f)
        if (!e.classList.contains('drag')) place(e, f)
        if (first && !reduce) { e.style.setProperty('--i', String(Math.min(i, 12))); e.classList.add('arrive') }
      })
      for (const e of [...canvas.querySelectorAll('.fc-frag')]) if (!live.has(e) && !e.classList.contains('gone')) e.remove()
      unstack(); grow(); updateHint()
      if (first) setTimeout(() => canvas.querySelectorAll('.arrive').forEach(e => e.classList.remove('arrive')), 1600)
    }
    function updateHint() {
      const any = F.some(f => !f.locked && f.text.trim()) || !!focusedFragmentId()
      hint.classList.toggle('away', any)
    }

    // ---------- start writing anywhere ----------
    canvas.addEventListener('pointerdown', ev => {
      if (ev.button) return
      if (ev.target !== canvas && !ev.target.closest('.fc-hint')) return
      const cr = canvas.getBoundingClientRect()
      const px = ev.clientX - cr.left, py = ev.clientY - cr.top
      drop(px, py)
      const f = { id: uid(), text: '', x: Math.max(0, (px - 10) / W()), y: Math.max(12, py - 18), font: null, ts: iso(), from: 'him' }
      F.push(f)
      render()
      const e = canvas.querySelector('[data-id="' + f.id + '"]')
      e.classList.add('fresh')
      const t = e.querySelector('.fc-txt')
      ev.preventDefault()
      t.focus()
      updateHint()
    })
    // a drop of ink where the page was touched
    function drop(x, y) {
      if (reduce) return
      const d = el('span', 'fc-drop')
      d.style.left = x + 'px'; d.style.top = y + 'px'
      canvas.append(d)
      setTimeout(() => d.remove(), 900)
    }

    // ---------- the muse ----------
    function placeMuse() {
      const e = museFor && canvas.querySelector('[data-id="' + museFor + '"]')
      if (!e) return
      const right = e.offsetLeft + e.offsetWidth + 18
      const narrow = W() < 640 || right + 240 > W()
      muse.classList.toggle('below', narrow)
      if (narrow) { muse.style.left = e.offsetLeft + 'px'; muse.style.top = (e.offsetTop + e.offsetHeight + 8) + 'px' }
      else { muse.style.left = right + 'px'; muse.style.top = e.offsetTop + 'px' }
    }
    function showMuse(text, quiet) {
      muse.textContent = ''
      muse.append(el('span', 'fc-muse-mark', '?'), el('span', 'fc-muse-q', text))
      muse.classList.toggle('quiet', !!quiet)
      muse.hidden = false
      placeMuse()
      requestAnimationFrame(() => muse.classList.add('on'))
    }
    function hideMuse() {
      museSeq++; museFor = null
      muse.classList.remove('on'); muse.hidden = true; muse.textContent = ''
    }
    async function askMuse() {
      const id = focusedFragmentId() || (F.length ? [...F].filter(f => !f.locked).sort((a, b) => (a.ts < b.ts ? 1 : -1))[0]?.id : null)
      const f = id && byId(id)
      if (!f || !f.text.trim()) { museFor = id; showMuse('write first; the muse asks about the words in front of you.', true); if (!id) { muse.style.left = '24px'; muse.style.top = '24px' } return }
      if (typeof opts.muse !== 'function') return
      museFor = id
      const mine = ++museSeq
      showMuse('…', true)
      let res = null
      try { res = await opts.muse(f.text, f) } catch (e) { res = null }
      if (mine !== museSeq) return
      if (res && typeof res === 'object' && res.quiet) { showMuse(res.quiet, true); return }
      const q = toQuestion(res)
      if (!q) { showMuse('the muse kept quiet.', true); return }
      showMuse(q, false) // shown beside the words, never written into them
    }

    // ---------- keys ----------
    function onKey(ev) {
      if (!canvas.offsetParent) return // hidden (another view is showing)
      const mod = ev.metaKey || ev.ctrlKey
      const inside = canvas.contains(document.activeElement) || document.activeElement === document.body
      if (!inside) return
      if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return }
      if (mod && (ev.key === 'y')) { ev.preventDefault(); redo(); return }
      if (mod && ev.key === '.') {
        const id = focusedFragmentId(); const f = id && byId(id)
        if (!f || f.locked) return
        ev.preventDefault()
        f.font = FACES[(FACES.indexOf(f.font || null) + 1) % FACES.length]
        setFace(canvas.querySelector('[data-id="' + id + '"]'), f)
        unstack(); commit(); persist(); return
      }
      if (mod && (ev.key === 'j' || ev.key === 'J')) { ev.preventDefault(); askMuse(); return }
      if (ev.key === 'Escape') {
        if (!muse.hidden) { hideMuse(); return }
        if (focusedFragmentId()) document.activeElement.blur()
      }
    }

    function onResize() { F.forEach(f => { const e = canvas.querySelector('[data-id="' + f.id + '"]'); if (e) place(e, f) }); unstack(); grow(); placeMuse() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize)

    render(true)
    commit()
    // a first visit still writes its migrated/seeded page down at once
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, updated: iso(), fragments: F })) } catch (e) {}

    return {
      fragments: () => JSON.parse(JSON.stringify(F)),
      focused: () => { const id = focusedFragmentId(); return id ? JSON.parse(JSON.stringify(byId(id))) : null },
      remove: id => { F = F.filter(f => f.id !== id); render(); commit(); persist() },
      update: (id, patch) => { const f = byId(id); if (!f) return; Object.assign(f, patch); render(); commit(); persist() },
      askMuse, hideMuse, undo, redo,
      destroy: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
        canvas.remove()
      },
    }
  }

  // ---------- migration helper: a list of old drops becomes a page ----------
  // Every word is kept: text is copied whole; the old record rides along in meta.
  // Old storage is never deleted; this only reads it.
  function fromDrops(drops, width) {
    const narrow = (width || 1200) < 640
    const out = []
    let y = 40
    ;[...drops].reverse().forEach((d, i) => { // oldest first, top of the page
      if (!d || typeof d.text !== 'string' || !d.text.trim()) return
      const lines = d.text.split('\n').length + Math.ceil(d.text.length / 42)
      const faces = Array.isArray(d.lineFonts) ? d.lineFonts.filter(Boolean) : []
      out.push({
        id: 'm-' + (d.id || i),
        text: d.text,
        x: narrow ? 0.04 : (i % 2 ? 0.52 : 0.08),
        y,
        font: faces.length && faces.length === d.lineFonts.length ? (faces[0] === 'serif' ? null : faces[0]) : null,
        ts: d.ts || iso(),
        from: 'him',
        meta: { migratedFrom: 'drop', drop: d },
      })
      if (narrow || i % 2) y += Math.min(420, 40 + lines * 30)
    })
    return out
  }

  const api = { create, fromDrops, toQuestion }
  root.FreeCanvas = api
  if (typeof module === 'object' && module && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this)
