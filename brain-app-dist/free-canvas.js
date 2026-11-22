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
// With opts.edit (INK-EDIT-1, 2026-11-22; the site passes it, the brain-app not yet):
//   select words, Aa, or Cmd/Ctrl+E   the quill: one small window to shape the words
//   Tab / Shift+Tab   indent / outdent (nests inside lists)
//   Cmd+B / Cmd+I     bold / italic        Cmd+Shift+H  highlight   Cmd+Shift+X  strike
//   Cmd+Alt+1 / 2 / 0 title / heading / plain       Cmd+Shift+8 / 7 / 9  bullets / numbers / checks
//   Cmd+Shift+.       quote                Cmd+\  clear            Alt+Shift+Up/Down  font shape
//   line starts       "# " "## " "- " "1. " "[] " "> " become structure as you type
//   Formatted words are kept as f.html (a small sanitised subset); f.text stays the plain words.
//
// The muse rule: questions only (anything that does not end in "?" is dropped,
// never shown), and no code path writes a muse question into a fragment.

;(function (root) {
  'use strict'

  const FACES = [null, 'sans', 'mono', 'display']
  const FACE_NAME = { null: 'serif', sans: 'sans', mono: 'mono', display: 'display' }
  const HISTORY_MAX = 300

  // ---------- rich words: the small subset that is kept ----------
  const TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', S: 's', STRIKE: 's', DEL: 's', MARK: 'mark', U: 'u', H1: 'h2', H2: 'h2', H3: 'h3', BLOCKQUOTE: 'blockquote', UL: 'ul', OL: 'ol', LI: 'li', DIV: 'div', P: 'div', BR: 'br', SPAN: 'span', FONT: 'span' }
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'HEAD', 'TITLE'])
  const BLOCK = new Set(['DIV', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'P', 'H1'])
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  function textToHtml(text) {
    const lines = String(text || '').split('\n')
    return lines.map(l => '<div>' + (l ? esc(l) : '<br>') + '</div>').join('')
  }
  function faceClass(n) {
    const m = n.className && String(n.className).match(/\bface-(sans|mono|display|serif)\b/)
    return m ? m[1] : null
  }
  function cleanKids(src, dst) {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) { dst.append(document.createTextNode(n.textContent)); continue }
      if (n.nodeType !== 1) continue
      if (DROP_TAGS.has(n.tagName)) continue
      let tag = TAGS[n.tagName]
      let host = dst
      // browsers sometimes write bold/italic/strike as styled spans; keep the meaning
      if (tag === 'span' || !tag) {
        const st = (n.getAttribute && n.getAttribute('style')) || ''
        const wrap = []
        if (/font-weight:\s*(bold|[6-9]00)/.test(st)) wrap.push('b')
        if (/font-style:\s*italic/.test(st)) wrap.push('i')
        if (/line-through/.test(st)) wrap.push('s')
        for (const w of wrap) { const e = document.createElement(w); host.append(e); host = e }
        const fc = tag === 'span' ? faceClass(n) : null
        if (!fc) { cleanKids(n, host); continue }
        const e = document.createElement('span'); e.className = 'face-' + fc
        cleanKids(n, e); host.append(e); continue
      }
      const e = document.createElement(tag)
      const ind = parseInt(n.getAttribute('data-indent') || '', 10)
      if (ind > 0 && /^(div|h2|h3|blockquote)$/.test(tag)) e.setAttribute('data-indent', String(Math.min(8, ind)))
      if (tag === 'ul' && /\bcheck\b/.test(n.className || '')) e.className = 'check'
      if (tag === 'li' && n.getAttribute('data-done') === '1') e.setAttribute('data-done', '1')
      if (tag !== 'br') cleanKids(n, e)
      // browsers nest a list inside a line (<div><ul>..</ul>next</div>); lift it to its own lines
      if ((tag === 'div' || tag === 'blockquote') && [...e.children].some(c => BLOCK.has(c.tagName))) {
        let run = null
        for (const c of [...e.childNodes]) {
          if (c.nodeType === 1 && BLOCK.has(c.tagName)) { run = null; host.append(c); continue }
          if (!run) { run = document.createElement(tag); if (e.getAttribute('data-indent')) run.setAttribute('data-indent', e.getAttribute('data-indent')); host.append(run) }
          run.append(c)
        }
        continue
      }
      host.append(e)
    }
  }
  function clean(html) {
    const tpl = document.createElement('template')
    tpl.innerHTML = String(html || '')
    const out = document.createElement('div')
    cleanKids(tpl.content, out)
    return out.innerHTML
  }
  // markdown out (export): structure and marks survive as plain characters
  function toMarkdown(f) {
    if (!f || f.html == null) return (f && f.text) || ''
    const tpl = document.createElement('template')
    tpl.innerHTML = clean(f.html)
    const lines = []
    const inl = n => {
      if (n.nodeType === 3) return n.textContent
      if (n.nodeType !== 1) return ''
      const inner = [...n.childNodes].map(inl).join('')
      switch (n.tagName) {
        case 'B': return inner.trim() ? '**' + inner + '**' : inner
        case 'I': return inner.trim() ? '*' + inner + '*' : inner
        case 'S': return inner.trim() ? '~~' + inner + '~~' : inner
        case 'MARK': return inner.trim() ? '==' + inner + '==' : inner
        case 'BR': return '\n'
        default: return inner
      }
    }
    const pad = n => '\u2003'.repeat(parseInt(n.getAttribute('data-indent') || '0', 10) || 0)
    const walk = (node, depth) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.textContent.trim()) lines.push(n.textContent); continue }
        if (n.nodeType !== 1) continue
        const t = n.tagName
        if (t === 'UL' || t === 'OL') {
          let k = 0
          for (const li of n.children) {
            if (li.tagName !== 'LI') { walk(li, depth + 1); continue }
            k++
            const own = [...li.childNodes].filter(c => !(c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')))
            const mark = n.classList.contains('check') ? (li.getAttribute('data-done') === '1' ? '- [x] ' : '- [ ] ') : t === 'OL' ? k + '. ' : '- '
            lines.push('  '.repeat(depth) + mark + own.map(inl).join('').replace(/\n+$/, ''))
            for (const c of li.children) if (c.tagName === 'UL' || c.tagName === 'OL') walk({ childNodes: [c] }, depth + 1)
          }
          continue
        }
        if ([...n.children].some(c => BLOCK.has(c.tagName))) { walk(n, depth); continue }
        const body = inl(n).replace(/\n+$/, '')
        if (t === 'H2') lines.push('## ' + body)
        else if (t === 'H3') lines.push('### ' + body)
        else if (t === 'BLOCKQUOTE') lines.push('> ' + body)
        else lines.push(pad(n) + body)
      }
    }
    walk(tpl.content, 0)
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

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
    const EDIT = !!opts.edit
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
    function textOf(t) {
      if (t.classList.contains('rich')) return t.innerText.replace(/\n+$/, '')
      return (PLAINTEXT ? t.textContent : t.innerText).replace(/\n$/, '')
    }
    function richOf(f) { return f.html != null ? clean(f.html) : textToHtml(f.text) }
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
      if (!f.locked) { t.contentEditable = EDIT ? 'true' : (PLAINTEXT ? 'plaintext-only' : 'true'); t.spellcheck = true }
      if (EDIT && !f.locked) t.classList.add('rich')
      t.setAttribute('role', 'textbox')
      t.setAttribute('aria-multiline', 'true')
      e.append(t)
      if (f.by) e.append(el('span', 'fc-by', f.by))
      canvas.append(e)
      wire(e, t, f.id)
      return e
    }

    function wire(e, t, id) {
      t.addEventListener('input', ev => {
        const f = byId(id); if (!f) return
        if (t.classList.contains('rich')) {
          if (ev.inputType === 'insertText' && ev.data === ' ') autoformat(t)
          f.html = clean(t.innerHTML)
          placeAa(); if (quillOpen()) { placeQuill(); paintQuill() }
        }
        f.text = textOf(t); f.ts = iso()
        wet(e)
        if (museFor === id) placeMuse()
        commitSoon(); persist(); grow()
      })
      t.addEventListener('focus', () => { e.classList.add('edit'); if (EDIT) { editing = id; placeAa() } })
      t.addEventListener('blur', () => {
        e.classList.remove('edit')
        if (EDIT) setTimeout(() => { if (!focusedFragmentId()) { editing = null; aa.classList.remove('on'); closeQuill() } }, 0)
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
      if (EDIT && !f0locked(id)) t.addEventListener('keydown', ev => editKey(ev, t, id))
      if (EDIT && !f0locked(id)) t.addEventListener('pointerdown', ev => checkTap(ev, t, id))
      if (!PLAINTEXT || EDIT) t.addEventListener('paste', ev => {
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
        if (t.classList.contains('rich')) {
          const want = richOf(f)
          if ((force || document.activeElement !== t) && t.innerHTML !== want) t.innerHTML = want
          if (f.html != null && !f.text) f.text = textOf(t)
        } else if ((force || document.activeElement !== t) && textOf(t) !== f.text) t.textContent = f.text || ''
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

    // ---------- the quill: one small window to shape the words (opts.edit) ----------
    // Opens on a selection, on the Aa handle beside the fragment, or Cmd/Ctrl+E.
    // No dropdowns: every choice is one press, structure cycles in place, and the
    // font shape is a slider you push up or down while the words change under it.
    function f0locked(id) { const f = byId(id); return !f || !!f.locked }
    let editing = null, saved = null, pinned = false, qT = null
    const aa = el('button', 'fc-aa', 'Aa')
    aa.type = 'button'
    aa.setAttribute('aria-label', 'shape the words (Cmd/Ctrl+E)')
    aa.title = 'shape the words · ⌘E'
    const quill = el('div', 'fc-quill')
    quill.hidden = true
    quill.setAttribute('role', 'toolbar')
    quill.setAttribute('aria-label', 'shape the words')
    const BTN = [
      ['bold', '<b>B</b>', 'bold', '⌘B'],
      ['italic', '<i>I</i>', 'italic', '⌘I'],
      ['mark', '<span class="q-hl">ab</span>', 'highlight', '⌘⇧H'],
      ['strike', '<s>S</s>', 'cross out', '⌘⇧X'],
      ['clear', '<span class="q-clear">T<sub>×</sub></span>', 'plain again', '⌘\\'],
      ['head', '<span class="q-h">H</span>', 'title, heading, plain', '⌘⌥1 · 2 · 0'],
      ['list', '<span class="q-list">•</span>', 'bullets, numbers, checks', '⌘⇧8 · 7 · 9'],
      ['quote', '<span class="q-quote">❝</span>', 'quote', '⌘⇧.'],
      ['outdent', '<span class="q-ar">⇤</span>', 'outdent', '⇧Tab'],
      ['indent', '<span class="q-ar">⇥</span>', 'indent', 'Tab'],
    ]
    const grid = el('div', 'fc-q-grid')
    const btns = {}
    for (const [cmd, html, name, keys] of BTN) {
      const b = el('button', 'fc-q-b')
      b.type = 'button'; b.dataset.cmd = cmd; b.innerHTML = html
      b.setAttribute('aria-label', name + ' (' + keys + ')')
      b.dataset.say = name + '  ' + keys
      grid.append(b); btns[cmd] = b
    }
    // font shape: a vertical slider. serif at the bottom, display at the top.
    const shape = el('div', 'fc-q-shape')
    shape.setAttribute('role', 'slider')
    shape.setAttribute('aria-label', 'font shape (Alt+Shift+Up/Down)')
    shape.setAttribute('aria-valuemin', '0'); shape.setAttribute('aria-valuemax', String(FACES.length - 1))
    shape.tabIndex = -1
    shape.dataset.say = 'shape · push up or down · ⌥⇧↑↓'
    const track = el('div', 'fc-q-track')
    for (let i = 0; i < FACES.length; i++) { const n = el('span', 'fc-q-notch'); n.style.bottom = (i / (FACES.length - 1) * 100) + '%'; track.append(n) }
    const thumb = el('div', 'fc-q-thumb', 'Aa')
    track.append(thumb)
    const shapeName = el('div', 'fc-q-shapename', 'serif')
    shape.append(track, shapeName)
    const say = el('div', 'fc-q-say', '')
    const body = el('div', 'fc-q-body')
    const left = el('div', 'fc-q-left')
    left.append(grid, say)
    body.append(left, shape)
    quill.append(body)
    if (EDIT) canvas.append(quill, aa)

    function txtOf(id) { const e = id && canvas.querySelector('[data-id="' + id + '"]'); return e && e.querySelector('.fc-txt') }
    function quillOpen() { return !quill.hidden }
    function selIn(t) {
      const s = getSelection()
      if (!s.rangeCount || !t) return null
      const r = s.getRangeAt(0)
      return t.contains(r.commonAncestorContainer) ? r : null
    }
    // selection as character offsets, so it survives the DOM being rewrapped
    function offsets(t, r) {
      const pre = document.createRange(); pre.selectNodeContents(t)
      pre.setEnd(r.startContainer, r.startOffset); const a = pre.toString().length
      pre.setEnd(r.endContainer, r.endOffset); const b = pre.toString().length
      return [a, b]
    }
    function setOffsets(t, a, b) {
      const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
      let n = 0, node, r = document.createRange(), sa = false, sb = false
      while ((node = w.nextNode())) {
        const L = node.textContent.length
        if (!sa && a <= n + L) { r.setStart(node, a - n); sa = true }
        if (!sb && b <= n + L) { r.setEnd(node, b - n); sb = true; break }
        n += L
      }
      if (!sa) { r.selectNodeContents(t); r.collapse(false) } else if (!sb) r.collapse(true)
      const s = getSelection(); s.removeAllRanges(); s.addRange(r)
      return r
    }
    function remember() {
      const t = txtOf(editing); const r = selIn(t)
      if (r) saved = { id: editing, r: r.cloneRange() }
    }
    // put focus and the remembered selection back before a command
    function ready() {
      const id = editing || (saved && saved.id)
      const t = txtOf(id)
      if (!t) return null
      if (document.activeElement !== t) t.focus({ preventScroll: true })
      if (!selIn(t) && saved && saved.id === id && t.contains(saved.r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved.r) }
      if (!selIn(t)) caretEnd(t)
      return t
    }
    function sync(t, id) {
      const f = byId(id); if (!f) return
      f.html = clean(t.innerHTML); f.text = textOf(t); f.ts = iso()
      wet(t.parentNode); unstack(); grow(); placeAa(); commit(); persist()
      if (quillOpen()) { placeQuill(); paintQuill() }
    }
    function blockOf(t, node) {
      let n = node && node.nodeType === 3 ? node.parentNode : node
      while (n && n !== t && !(n.nodeType === 1 && BLOCK.has(n.tagName) && n.tagName !== 'UL' && n.tagName !== 'OL')) n = n.parentNode
      return n && n !== t ? n : null
    }
    // stray words at the top level become their own line, so every line can be shaped
    function normalize(t) {
      let run = null
      const r = selIn(t); const off = r ? offsets(t, r) : null
      let changed = false
      for (const n of [...t.childNodes]) {
        if (n.nodeType === 1 && BLOCK.has(n.tagName)) { run = null; continue }
        if (n.nodeType === 3 && !n.textContent) { n.remove(); continue }
        if (n.nodeType === 1 && n.tagName === 'BR' && run) { run.append(n); run = null; changed = true; continue }
        if (!run) { run = document.createElement('div'); t.insertBefore(run, n) }
        run.append(n); changed = true
      }
      if (!t.firstChild) { t.innerHTML = '<div><br></div>'; changed = true }
      if (changed && off) setOffsets(t, off[0], off[1])
    }
    function blocksIn(t, r) {
      normalize(t)
      r = selIn(t) || r
      const all = [...t.querySelectorAll('div,h2,h3,blockquote,li')].filter(b => !b.querySelector('div,h2,h3,blockquote,li'))
      const hit = all.filter(b => r.intersectsNode(b))
      return hit.length ? hit : [blockOf(t, r.startContainer)].filter(Boolean)
    }
    function wrapInline(t, tag, cls) {
      const r = selIn(t); if (!r || r.collapsed) return false
      const [a, b] = offsets(t, r)
      const frag = r.extractContents()
      const kill = tag === 'mark' ? 'mark' : 'span[class^="face-"]'
      frag.querySelectorAll(kill).forEach(x => x.replaceWith(...x.childNodes))
      if (tag) {
        const w = document.createElement(tag); if (cls) w.className = cls
        w.append(frag); r.insertNode(w)
      } else r.insertNode(frag)
      t.normalize()
      setOffsets(t, a, b)
      return true
    }
    function unwrapAround(t, sel) {
      const r = selIn(t); if (!r) return false
      const n = r.collapsed ? r.startContainer : firstSel(r)
      const hit = (n.nodeType === 1 ? n : n.parentNode).closest(sel)
      if (!hit || !t.contains(hit)) return false
      const [a, b] = offsets(t, r)
      hit.replaceWith(...hit.childNodes); t.normalize(); setOffsets(t, a, b)
      return true
    }
    function inList(t) { const r = selIn(t); if (!r) return null; const n = r.startContainer; const li = (n.nodeType === 1 ? n : n.parentNode).closest('li'); return li && t.contains(li) ? li : null }
    function listState(t) {
      const li = inList(t); if (!li) return 'none'
      const l = li.parentNode
      return l.tagName === 'OL' ? 'ol' : l.classList.contains('check') ? 'check' : 'ul'
    }
    function setList(t, want) {
      const now = listState(t)
      if (now === want) return
      if (now === 'check') { const l = inList(t).parentNode; l.classList.remove('check') }
      if (want === 'none') { document.execCommand(now === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); return }
      if (want === 'ol') { document.execCommand('insertOrderedList'); return }
      if (now !== 'ul') document.execCommand('insertUnorderedList')
      if (want === 'check') { const li = inList(t); if (li) li.parentNode.classList.add('check') }
    }
    function headState(t) { const r = selIn(t); const b = r && blockOf(t, r.startContainer); return b ? b.tagName : 'DIV' }
    function setBlock(t, tag) {
      if (inList(t)) setList(t, 'none')
      document.execCommand('formatBlock', false, '<' + tag + '>')
    }
    function indent(t, dir) {
      if (inList(t)) { document.execCommand(dir > 0 ? 'indent' : 'outdent'); return }
      const r = selIn(t); if (!r) return
      for (const b of blocksIn(t, r)) {
        const n = Math.max(0, Math.min(8, (parseInt(b.getAttribute('data-indent') || '0', 10) || 0) + dir))
        if (n) b.setAttribute('data-indent', String(n)); else b.removeAttribute('data-indent')
      }
    }
    // the element the selected letters actually sit in (a selection edge can rest just outside a span)
    function firstSel(r) {
      const root = r.commonAncestorContainer
      if (root.nodeType === 3) return root.parentNode
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let n
      while ((n = w.nextNode())) {
        if (!r.intersectsNode(n)) continue
        if (n === r.endContainer && r.endOffset === 0) continue
        if (n === r.startContainer && r.startOffset >= n.textContent.length) continue
        return n.parentNode
      }
      return root
    }
    function faceNow(t, id) {
      const r = selIn(t)
      if (r && !r.collapsed) {
        const sp = firstSel(r).closest('span[class^="face-"]')
        if (sp && t.contains(sp)) { const c = faceClass(sp); return c === 'serif' ? null : c }
      }
      const f = byId(id); return f ? f.font || null : null
    }
    function setFaceTo(t, id, face) {
      const r = selIn(t)
      const f = byId(id)
      if (r && !r.collapsed) {
        const whole = f && (face || null) === (f.font || null)
        wrapInline(t, whole ? null : 'span', whole ? null : 'face-' + (face || 'serif'))
      } else if (f) {
        f.font = face || null
        setFace(t.parentNode, f)
      }
    }
    function run(cmd, arg) {
      const t = ready(); if (!t) return
      const id = editing || (saved && saved.id)
      document.execCommand('styleWithCSS', false, false)
      switch (cmd) {
        case 'bold': document.execCommand('bold'); break
        case 'italic': document.execCommand('italic'); break
        case 'strike': document.execCommand('strikeThrough'); break
        case 'mark': if (!unwrapAround(t, 'mark')) wrapInline(t, 'mark'); break
        case 'clear': {
          document.execCommand('removeFormat')
          const r = selIn(t)
          if (r) {
            const [a, b] = offsets(t, r)
            t.querySelectorAll('mark,span[class^="face-"],b,i,s,u').forEach(x => { if (r.intersectsNode(x)) x.replaceWith(...x.childNodes) })
            t.normalize(); setOffsets(t, a, b)
          }
          break
        }
        case 'head': { const h = headState(t); setBlock(t, arg || (h === 'H2' ? 'h3' : h === 'H3' ? 'div' : 'h2')); break }
        case 'quote': setBlock(t, headState(t) === 'BLOCKQUOTE' ? 'div' : 'blockquote'); break
        case 'list': { const order = ['none', 'ul', 'ol', 'check']; const now = listState(t); setList(t, arg || order[(order.indexOf(now) + 1) % order.length]); break }
        case 'indent': indent(t, 1); break
        case 'outdent': indent(t, -1); break
        case 'face': setFaceTo(t, id, arg); break
        case 'faceStep': { const i = FACES.indexOf(faceNow(t, id)); setFaceTo(t, id, FACES[Math.max(0, Math.min(FACES.length - 1, i + arg))]); break }
      }
      remember()
      sync(t, id)
    }

    function paintQuill() {
      const t = txtOf(editing); if (!t) return
      const on = (c, v) => btns[c].classList.toggle('on', !!v)
      const qs = k => { try { return document.queryCommandState(k) } catch (e) { return false } }
      on('bold', qs('bold')); on('italic', qs('italic')); on('strike', qs('strikeThrough'))
      const r = selIn(t); const n = r && (r.collapsed ? (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode) : firstSel(r))
      on('mark', n && n.closest('mark'))
      const h = headState(t)
      btns.head.querySelector('.q-h').innerHTML = h === 'H2' ? 'H<sub>1</sub>' : h === 'H3' ? 'H<sub>2</sub>' : 'H'
      on('head', h === 'H2' || h === 'H3')
      on('quote', h === 'BLOCKQUOTE')
      const ls = listState(t)
      btns.list.querySelector('.q-list').textContent = ls === 'ol' ? '1.' : ls === 'check' ? '☐' : '•'
      on('list', ls !== 'none')
      const face = faceNow(t, editing)
      const i = Math.max(0, FACES.indexOf(face))
      thumb.style.bottom = 'calc(' + (i / (FACES.length - 1) * 100) + '% - 12px)'
      thumb.className = 'fc-q-thumb' + (face ? ' face-' + face : '')
      shapeName.textContent = FACE_NAME[face]
      shape.setAttribute('aria-valuenow', String(i)); shape.setAttribute('aria-valuetext', FACE_NAME[face])
    }
    function placeQuill() {
      const t = txtOf(editing); if (!t) return
      const cr = canvas.getBoundingClientRect()
      const r = selIn(t)
      let rect = r && !r.collapsed ? r.getBoundingClientRect() : null
      if (!rect || (!rect.width && !rect.height)) rect = t.getBoundingClientRect()
      const qw = quill.offsetWidth || 260, qh = quill.offsetHeight || 120
      const narrow = W() < 640
      let left = rect.left - cr.left + rect.width / 2 - qw / 2
      left = Math.max(6, Math.min(W() - qw - 6, left))
      let top = rect.bottom - cr.top + 12
      // wide screens: above the selected words, like a lifted pen; phones: below (their own menu sits above)
      if (!narrow && rect.top - qh - 14 > 0 && rect.top - cr.top - qh - 14 > 0) top = rect.top - cr.top - qh - 14
      quill.style.left = left + 'px'; quill.style.top = top + 'px'
    }
    function openQuill(pin) {
      if (!editing) return
      pinned = pinned || !!pin
      quill.hidden = false
      paintQuill(); placeQuill()
      requestAnimationFrame(() => quill.classList.add('on'))
      aa.classList.add('lit')
    }
    function closeQuill() {
      pinned = false
      quill.classList.remove('on'); quill.hidden = true; aa.classList.remove('lit')
    }
    function placeAa() {
      const e = editing && canvas.querySelector('[data-id="' + editing + '"]')
      if (!e || !e.classList.contains('edit')) { aa.classList.remove('on'); return }
      aa.style.left = Math.min(W() - 34, e.offsetLeft + e.offsetWidth - 6) + 'px'
      aa.style.top = (parseFloat(e.style.top) - 14) + 'px'
      aa.classList.add('on')
    }
    // the window never steals focus or the selection
    const keep = ev => { ev.preventDefault() }
    for (const n of [quill, aa]) { n.addEventListener('mousedown', keep); n.addEventListener('touchstart', keep, { passive: false }) }
    aa.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); remember(); quillOpen() ? closeQuill() : openQuill(true) })
    aa.addEventListener('click', ev => { if (ev.detail === 0) { quillOpen() ? closeQuill() : openQuill(true) } })
    quill.addEventListener('pointerdown', ev => {
      ev.preventDefault(); ev.stopPropagation()
      pinned = true
      const b = ev.target.closest('.fc-q-b')
      if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160); run(b.dataset.cmd); return }
      if (ev.target.closest('.fc-q-shape')) startShape(ev)
    })
    quill.addEventListener('click', ev => { const b = ev.target.closest('.fc-q-b'); if (b && ev.detail === 0) run(b.dataset.cmd) })
    quill.addEventListener('pointerover', ev => { const s = ev.target.closest('[data-say]'); say.textContent = s ? s.dataset.say : '' })
    quill.addEventListener('pointerleave', () => { say.textContent = '' })
    // the slider: the words change shape as it moves, one step per notch
    let shaping = null
    function shapeAt(clientY) {
      const tr = track.getBoundingClientRect()
      const p = 1 - Math.max(0, Math.min(1, (clientY - tr.top) / tr.height))
      return Math.round(p * (FACES.length - 1))
    }
    function startShape(ev) {
      shaping = { pid: ev.pointerId, last: -1 }
      try { shape.setPointerCapture(ev.pointerId) } catch (e) {}
      moveShape(ev)
    }
    function moveShape(ev) {
      if (!shaping || ev.pointerId !== shaping.pid) return
      const i = shapeAt(ev.clientY)
      if (i === shaping.last) return
      shaping.last = i
      run('face', FACES[i])
    }
    shape.addEventListener('pointermove', moveShape)
    shape.addEventListener('pointerup', () => { shaping = null })
    shape.addEventListener('pointercancel', () => { shaping = null })
    shape.addEventListener('wheel', ev => { ev.preventDefault(); run('faceStep', ev.deltaY < 0 ? 1 : -1) }, { passive: false })

    function onSel() {
      if (!EDIT || !editing) return
      const t = txtOf(editing); const r = selIn(t)
      if (!r) return
      remember()
      clearTimeout(qT)
      qT = setTimeout(() => {
        const r2 = selIn(txtOf(editing))
        if (!r2) return
        if (!r2.collapsed && r2.toString().trim()) openQuill(false)
        else if (quillOpen() && !pinned) closeQuill()
        else if (quillOpen()) { paintQuill() }
      }, drag ? 260 : 140)
    }
    if (EDIT) document.addEventListener('selectionchange', onSel)

    // line starts become structure: "# " "## " "- " "* " "1. " "[] " "> "
    function autoformat(t) {
      const r = selIn(t); if (!r || !r.collapsed) return
      const node = r.startContainer
      if (node.nodeType !== 3) return
      const b = blockOf(t, node)
      if (b && b.tagName === 'LI') return
      const pre = document.createRange(); pre.selectNodeContents(b || t); pre.setEnd(node, r.startOffset)
      const head = pre.toString().replace(/ /g, ' ')
      const rules = { '# ': ['head', 'h2'], '## ': ['head', 'h3'], '- ': ['list', 'ul'], '* ': ['list', 'ul'], '1. ': ['list', 'ol'], '[] ': ['list', 'check'], '[ ] ': ['list', 'check'], '> ': ['quote'] }
      const rule = rules[head]
      if (!rule || node.textContent.slice(0, r.startOffset).replace(/ /g, ' ') !== head) return
      node.textContent = node.textContent.slice(r.startOffset)
      const c = document.createRange(); c.setStart(node, 0); c.collapse(true)
      const s = getSelection(); s.removeAllRanges(); s.addRange(c)
      if (!node.textContent && b) { b.innerHTML = '<br>'; const c2 = document.createRange(); c2.setStart(b, 0); c2.collapse(true); s.removeAllRanges(); s.addRange(c2) }
      run(rule[0], rule[1])
    }
    // a check box is the space just left of a checked line
    function checkTap(ev, t, id) {
      const li = ev.target.closest && ev.target.closest('ul.check > li')
      if (!li || !t.contains(li)) return
      if (ev.clientX - li.getBoundingClientRect().left > 2) return
      ev.preventDefault(); ev.stopPropagation()
      if (li.getAttribute('data-done') === '1') li.removeAttribute('data-done'); else li.setAttribute('data-done', '1')
      sync(t, id)
    }
    function editKey(ev, t, id) {
      const mod = ev.metaKey || ev.ctrlKey
      const c = ev.code
      let hit = null
      if (ev.key === 'Tab' && !mod && !ev.altKey) hit = [ev.shiftKey ? 'outdent' : 'indent']
      else if (mod && !ev.altKey && !ev.shiftKey && c === 'KeyB') hit = ['bold']
      else if (mod && !ev.altKey && !ev.shiftKey && c === 'KeyI') hit = ['italic']
      else if (mod && ev.shiftKey && c === 'KeyH') hit = ['mark']
      else if (mod && ev.shiftKey && c === 'KeyX') hit = ['strike']
      else if (mod && c === 'Backslash') hit = ['clear']
      else if (mod && ev.altKey && c === 'Digit1') hit = ['head', 'h2']
      else if (mod && ev.altKey && c === 'Digit2') hit = ['head', 'h3']
      else if (mod && ev.altKey && c === 'Digit0') hit = ['head', 'div']
      else if (mod && ev.shiftKey && c === 'Digit8') hit = ['list', listState(t) === 'ul' ? 'none' : 'ul']
      else if (mod && ev.shiftKey && c === 'Digit7') hit = ['list', listState(t) === 'ol' ? 'none' : 'ol']
      else if (mod && ev.shiftKey && c === 'Digit9') hit = ['list', listState(t) === 'check' ? 'none' : 'check']
      else if (mod && ev.shiftKey && c === 'Period') hit = ['quote']
      else if (ev.altKey && ev.shiftKey && !mod && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) hit = ['faceStep', ev.key === 'ArrowUp' ? 1 : -1]
      else if (mod && !ev.shiftKey && !ev.altKey && c === 'KeyE') { ev.preventDefault(); ev.stopPropagation(); remember(); quillOpen() ? closeQuill() : openQuill(true); return }
      if (!hit) return
      ev.preventDefault(); ev.stopPropagation()
      editing = id
      remember()
      run(hit[0], hit[1])
    }

    // ---------- keys ----------
    function onKey(ev) {
      if (!canvas.offsetParent) return // hidden (another view is showing)
      const mod = ev.metaKey || ev.ctrlKey
      const inside = canvas.contains(document.activeElement) || document.activeElement === document.body
      if (!inside) return
      if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return }
      if (mod && (ev.key === 'y')) { ev.preventDefault(); redo(); return }
      if (mod && ev.key === '.' && EDIT && focusedFragmentId() && !f0locked(focusedFragmentId())) {
        ev.preventDefault(); editing = focusedFragmentId(); remember()
        const t = txtOf(editing); const i = FACES.indexOf(faceNow(t, editing))
        run('face', FACES[(i + 1) % FACES.length]); return
      }
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
        if (EDIT && quillOpen()) { closeQuill(); return }
        if (!muse.hidden) { hideMuse(); return }
        if (focusedFragmentId()) document.activeElement.blur()
      }
    }

    function onResize() { F.forEach(f => { const e = canvas.querySelector('[data-id="' + f.id + '"]'); if (e) place(e, f) }); unstack(); grow(); placeMuse(); if (EDIT) { placeAa(); if (quillOpen()) placeQuill() } }

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
      // open the quill on a fragment, optionally selecting characters a..b first (used by the ?try=edit page)
      openQuill: (id, a, b) => {
        const t = txtOf(id); if (!t || !EDIT) return
        t.focus(); editing = id
        if (a != null) setOffsets(t, a, b == null ? a : b)
        remember(); openQuill(true)
      },
      markdown: id => toMarkdown(byId(id)),
      destroy: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('selectionchange', onSel)
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

  const api = { create, fromDrops, toQuestion, toMarkdown, clean }
  root.FreeCanvas = api
  if (typeof module === 'object' && module && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this)
