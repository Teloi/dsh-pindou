// In-page audit of everything the plugin renders (.pd-root and .pd-portal), run by
// e2e/run.mjs in every state it visits. The function is passed to page.evaluate, so
// it must stay self-contained (no imports, no closures over module scope).
//
// It reports:
// - leaks:    host rules (any rule outside the plugin's own <style id="dsh-pindou-…">) that match our elements, with
//             the properties they set (design I1: find what bleeds in, don't guess)
// - icons:    every <svg>: rendered size and whether it carries .pd-i (B1)
// - round:    every element drawn as a circle (border-radius ≥ 50%): its corner-shape (I1)
// - wraps:    text that broke into one character per line, or buttons whose label wrapped
// - contrast: visible text against the background it is actually painted on (WCAG 1.4.3)

/* eslint-disable */
export function auditPanel() {
  const roots = [...document.querySelectorAll('.pd-root, .pd-portal')]
  const ours = new Set()
  for (const r of roots) { ours.add(r); for (const el of r.querySelectorAll('*')) ours.add(el) }
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'

  // ---- leaks
  const leaks = new Map()
  const splitTop = (list) => {
    const out = []
    let depth = 0, cur = ''
    for (const ch of list) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
      cur += ch
    }
    out.push(cur)
    return out
  }
  const walk = (rules, sheet) => {
    for (const rule of rules) {
      if (rule.cssRules && !(rule instanceof CSSStyleRule)) { walk(rule.cssRules, sheet); continue }
      if (!(rule instanceof CSSStyleRule)) continue
      const sel = rule.selectorText
      if (!sel) continue
      for (const part of splitTop(sel)) {
        const base = part.replace(/::?(before|after|placeholder|selection|marker|-webkit-[\w-]+)\b/g, '').trim() || '*'
        let hit = null
        try { for (const el of ours) if (el.matches(base)) { hit = el; break } } catch { continue }
        if (!hit) continue
        const props = [...rule.style].filter(p => !p.startsWith('--'))
        if (!props.length) continue
        const key = part.trim()
        const prev = leaks.get(key) ?? { selector: key, props: new Set(), example: `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` }
        for (const p of props) prev.props.add(p)
        leaks.set(key, prev)
      }
    }
  }
  for (const sheet of document.styleSheets) {
    // the plugin's own stylesheets (styles.ts, picture-styles.ts …); their class names ship short, so
    // telling them apart by a `pd-` in the selector no longer works
    if (sheet.ownerNode?.id?.startsWith('dsh-pindou-')) continue
    let rules
    try { rules = sheet.cssRules } catch { continue }
    walk(rules, sheet)
  }

  // ---- icons
  const icons = [...ours].filter(el => el instanceof SVGSVGElement && visible(el)).map(el => {
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, pdI: el.classList.contains('pd-i'), where: el.parentElement?.className ?? '' }
  })

  // ---- round things
  const shapeOf = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo)
    const r = parseFloat(cs.borderTopLeftRadius)
    const w = parseFloat(cs.width), h = parseFloat(cs.height)
    const pct = cs.borderTopLeftRadius.includes('%') ? parseFloat(cs.borderTopLeftRadius) : null
    const isRound = (pct !== null && pct >= 50) || (w > 0 && h > 0 && r >= Math.min(w, h) / 2 - 0.5)
    return isRound ? { el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${pseudo ?? ''}`, shape: cs.cornerShape ?? cs.getPropertyValue('corner-shape'), radius: cs.borderTopLeftRadius } : null
  }
  const round = []
  const seenShape = new Set()
  for (const el of ours) {
    if (!visible(el)) continue
    for (const pseudo of [undefined, '::before', '::after']) {
      if (pseudo && getComputedStyle(el, pseudo).content === 'none') continue
      const s = shapeOf(el, pseudo)
      if (!s) continue
      const k = `${s.el}|${s.shape}`
      if (seenShape.has(k)) continue
      seenShape.add(k)
      round.push(s)
    }
  }

  // ---- wraps
  // line boxes of the element's own text (icons and visually-hidden children excluded)
  const lines = (el) => {
    const tops = new Set()
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top + r.height / 2))
    }
    return tops.size
  }
  const wraps = []
  for (const el of ours) {
    if (!visible(el) || !(el instanceof HTMLElement) || el.closest('.pd-sr')) continue
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (own.length < 2) continue
    const cs = getComputedStyle(el)
    const n = lines(el)
    const fs = parseFloat(cs.fontSize)
    const rect = el.getBoundingClientRect()
    const perLine = own.length / Math.max(1, n)
    if (n >= 3 && perLine < 2.5) wraps.push({ el: `${el.tagName.toLowerCase()}.${el.className}`, text: own.slice(0, 20), lines: n, width: Math.round(rect.width), why: 'one char per line' })
    else if (el.closest('button') && !el.closest('.pd-tpl, .pd-big, .pd-mi') && n > 1) wraps.push({ el: `${el.tagName.toLowerCase()}.${el.className}`, text: own.slice(0, 20), lines: n, width: Math.round(rect.width), why: 'button label wrapped' })
    else if (rect.width > 0 && rect.width < fs * 1.5 && n > 1) wraps.push({ el: `${el.tagName.toLowerCase()}.${el.className}`, text: own.slice(0, 20), lines: n, width: Math.round(rect.width), why: 'squeezed' })
  }

  // ---- contrast
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c)
    if (!m) {
      const cv = document.createElement('canvas').getContext('2d')
      cv.fillStyle = '#000'; cv.fillStyle = c
      const hex = cv.fillStyle
      if (/^#[0-9a-f]{6}$/i.test(hex)) return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1]
      const m2 = /rgba?\(([^)]+)\)/.exec(hex)
      if (!m2) return null
      return m2[1].split(/[ ,/]+/).filter(Boolean).map(Number).concat([1]).slice(0, 4)
    }
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return [v[0], v[1], v[2], v[3] ?? 1]
  }
  const over = (top, bottom) => {
    const a = top[3]
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]
  }
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const backdrop = (el) => {
    // Compose backgrounds from the page root down to el. An image or gradient makes the
    // backdrop unknown, until an opaque background further down paints over it (the
    // pill sits on the host composer's gradient but has its own solid surface).
    const chain = []
    for (let e = el; e; e = e.parentElement) chain.unshift(e)
    let bg = [255, 255, 255, 1]
    let opacity = 1
    let image = false
    for (const e of chain) {
      const cs = getComputedStyle(e)
      const c = parse(cs.backgroundColor)
      if (c && c[3] >= 1) { bg = c; image = false } else if (c && c[3] > 0) bg = over(c, bg)
      if (cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement) image = true
      opacity *= parseFloat(cs.opacity)
    }
    return image ? { image } : { bg, opacity }
  }
  const contrast = []
  for (const el of ours) {
    if (!visible(el) || !(el instanceof HTMLElement)) continue
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (!own || el.closest('[aria-hidden=true], .pd-sr')) continue
    if (el.closest('button:disabled, textarea:disabled, input:disabled, [aria-disabled=true]')) continue // WCAG exempts inactive controls
    const cs = getComputedStyle(el)
    const b = backdrop(el)
    if (b.image) continue
    const fg0 = parse(cs.color)
    if (!fg0) continue
    // opacity on the element or an ancestor blends the text into what is behind it
    const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * b.opacity], b.bg)
    const fs = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
    const large = fs >= 24 || (bold && fs >= 18.66)
    const need = large ? 3 : 4.5
    const r = ratio(fg, b.bg)
    contrast.push({ el: `${el.tagName.toLowerCase()}.${el.className}`, text: own.slice(0, 16), ratio: Math.round(r * 100) / 100, need, ok: r >= need - 0.005 })
  }

  return {
    leaks: [...leaks.values()].map(l => ({ selector: l.selector, props: [...l.props], example: l.example })),
    icons, round, wraps, contrast,
  }
}

// Spec §18.5 / O3: the ring of every guide dot (`.pd-cell.pd-g::after`, first box-shadow)
// against the board it sits on, one cell per colour code, in the normal (`hot` false) or the
// selected-colour state (`hot` true). Same self-contained rule as above.
export function guideRings([codes, hot]) {
  const rgb = s => (/rgba?\(([^)]+)\)/.exec(s)?.[1] ?? '').split(',').map(Number)
  const lum = ([r, g, b]) => { const f = x => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const board = rgb(getComputedStyle(document.querySelector('.pd-board')).backgroundColor)
  return [...codes].map((code) => {
    const cell = document.querySelector(`.pd-board .pd-cell.pd-g${hot ? '.pd-hot' : ':not(.pd-hot)'}[data-code="${code}"]`)
    if (!cell) return { code, hot, missing: true, ok: false }
    // first shadow, e.g. "rgb(133, 133, 132) 0px 0px 0px 1px inset": the 4th length is the ring width
    const first = getComputedStyle(cell, '::after').boxShadow.split(/,(?![^(]*\))/)[0] ?? ''
    const ring = rgb(first)
    const width = /inset/.test(first) ? Number(first.match(/[\d.]+px/g)?.[3]?.slice(0, -2) ?? 0) : 0
    const alpha = ring.length === 4 ? ring[3] : 1
    const r = ratio(ring, board)
    return { code, hot, ring: first, ratio: Math.round(r * 100) / 100, width, ok: alpha === 1 && width >= 1 && r >= 3 }
  })
}

// Wait for the plugin's finite animations (beads landing, toasts sliding in), freeze the looping ones, wait two frames,
// then return one viewport-clipped box per top-level .pd-root / .pd-portal (empty when none is on screen).
export async function settlePlugin() {
  const ours = el => !!el && !!(el instanceof Element ? el : null)?.closest('.pd-root, .pd-portal')
  const finite = document.getAnimations().filter(a => ours(a.effect?.target) && Number.isFinite(a.effect?.getComputedTiming().endTime))
  await Promise.race([Promise.allSettled(finite.map(a => a.finished)), new Promise(r => { setTimeout(r, 2000) })])
  // infinite ones (the entry's pulsing dot, a generating shimmer) are frozen at t=0 until
  // resumePlugin(), so two runs capture the same frame
  const loops = document.getAnimations().filter(a => ours(a.effect?.target) && !Number.isFinite(a.effect?.getComputedTiming().endTime))
  for (const a of loops) { a.pause(); a.currentTime = 0 }
  globalThis.__pdFrozen = loops
  await new Promise(r => { requestAnimationFrame(() => { requestAnimationFrame(r) }) })
  // one crop per plugin root: the union would span the host chat between the pill and the
  // panel, and bring the host clock and streamed text back into the comparison
  return [...document.querySelectorAll('.pd-root, .pd-portal')]
    .filter(e => !e.parentElement?.closest('.pd-root, .pd-portal'))
    .map(e => e.getBoundingClientRect())
    .map(r => ({ x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), right: Math.min(innerWidth, Math.ceil(r.right)), bottom: Math.min(innerHeight, Math.ceil(r.bottom)) }))
    .filter(r => r.right > r.x && r.bottom > r.y)
    .map(r => ({ x: r.x, y: r.y, width: r.right - r.x, height: r.bottom - r.y }))
}

/** Restart the animations settlePlugin() froze. */
export function resumePlugin() {
  for (const a of globalThis.__pdFrozen ?? []) a.play()
  globalThis.__pdFrozen = []
}

// Design R3-2: what the visible toast covers — any control of the panel (buttons, swatches,
// focusable elements) or bead cell of the board, other than the toast's own button. Returns
// null when no toast is shown.
export function toastCovers() {
  const toast = document.querySelector('.pd-root .pd-toast')
  if (!toast) return null
  const t = toast.getBoundingClientRect()
  const hit = r => r.width > 0 && r.height > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top
  const sel = 'button, [role=radio], [role=switch], input, textarea, a[href], [tabindex]:not([tabindex="-1"]), .pd-board .pd-cell'
  const covered = [...document.querySelectorAll(`.pd-root :is(${sel})`)]
    .filter(el => !toast.contains(el) && el !== toast && getComputedStyle(el).visibility !== 'hidden' && hit(el.getBoundingClientRect()))
    .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 12)}`)
  return { toast: [Math.round(t.left), Math.round(t.top), Math.round(t.width), Math.round(t.height)], covered: [...new Set(covered)] }
}

// Spec v2.0 (22:15): put a long message into the visible toast and measure it. The toast must
// stay one line, at most panel width − 32, cut with an ellipsis, without moving the status row.
export async function toastLongLine(text) {
  const root = document.querySelector('.pd-root')
  const toast = root?.querySelector('.pd-toast')
  const span = toast?.querySelector(':scope > span')
  if (!root || !toast || !span) return null
  const status = root.querySelector('.pd-status')
  const before = status?.getBoundingClientRect().height ?? 0
  span.textContent = text
  await new Promise(r => { requestAnimationFrame(() => { requestAnimationFrame(r) }) })
  const t = toast.getBoundingClientRect()
  const panel = root.getBoundingClientRect()
  const cs = getComputedStyle(span)
  const lineH = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.4
  const range = document.createRange()
  range.selectNodeContents(span)
  const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size
  const btn = toast.querySelector('button')
  return {
    lines,
    spanH: Math.round(span.getBoundingClientRect().height), lineH: Math.round(lineH),
    width: Math.round(t.width), limit: Math.round(panel.width - 32),
    cut: span.scrollWidth > span.clientWidth, ellipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap',
    button: btn ? btn.scrollWidth <= Math.ceil(btn.getBoundingClientRect().width) : true,
    statusBefore: Math.round(before), statusAfter: Math.round(status?.getBoundingClientRect().height ?? 0),
  }
}
