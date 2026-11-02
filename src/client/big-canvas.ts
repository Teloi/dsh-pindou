/**
 * The big board on a Canvas (plan §3–§4.2), part of the lazy chunk
 * lib/client.big.js. One controller owns the canvas, the minimap and the input:
 *
 * - view: `s` CSS px per cell and the board's offset; zoom levels fit, 4 … 64;
 *   the board stays centred when smaller than the canvas, else may overhang 48 px.
 * - tiles: the board is cut into square tiles of whole cells drawn at the view's
 *   own device px per cell (`b` = s × dpr, rounded), at most 256 × 256 device px,
 *   so a whole `b` draws 1:1 (no resampling: bead gaps even on both sides, no
 *   dropped rows); a tile is drawn once from pre-rendered bead sprites (drawImage
 *   only: no paths or gradients per frame) and reused while the view keeps its
 *   `b`. A frame only
 *   drawImages the visible tiles and builds new ones within a time budget (one
 *   at least, more while the frame stays under ~10 ms by the measured tile cost;
 *   the 1 px/cell base layer stands in for the rest); an edit patches its cells
 *   into every cached tile.
 *   LRU by bytes: 48 MB, 24 MB on touch or DPR ≥ 3.
 * - level of detail: < 5 px/cell flat squares; 5–14 round beads with a hole; ≥ 14
 *   the pattern's colour codes too.
 * - zoom gestures (Ctrl/⌘ + wheel, trackpad pinch, two fingers) only stretch the
 *   last frame with a CSS transform; 120 ms after the last event the view eases
 *   (120 ms, ease-out) to a level within 15 % around the last pointer and is
 *   redrawn at its own scale. Keys and buttons ease one level around the cursor
 *   cell. No easing under reduced motion.
 * - pointers (native listeners, `touch-action: none`, pointer capture): mouse and
 *   pen paint, right button erases, Alt picks, Space or the middle button pans;
 *   a finger waits 80 ms or 6 px before it paints, and a second finger within
 *   120 ms cancels that stroke (no undo step) and pinches/pans instead. Below
 *   24 px/cell for touch, 10 for mouse/pen, the first press only zooms in.
 */
import { EMPTY } from '../core/big-board.ts'
import type { Board } from '../core/board.ts'
import type { BigGame } from './big-game.ts'

export const LEVELS = [4, 8, 12, 16, 24, 32, 48, 64]
const TILE = 256
const EDGE = 48
const SETTLE_MS = 120
/** Work per frame for new tiles: a zoom sweep keeps its frame rate, detail fills in over the next frames. */
const TILE_BUDGET_MS = 10

export interface View { readonly s: number; readonly ox: number; readonly oy: number }
interface Theme { bg: string; peg: string; accent: string; danger: string; ga: number; gh: number }
interface Sprites { bead: HTMLCanvasElement[]; ghost: HTMLCanvasElement[]; hot: HTMLCanvasElement[]; peg: HTMLCanvasElement | null }
interface Ptr { x: number; y: number; sx: number; sy: number; t: string; at: number }

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}
const ctx2 = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d')!
const rgb = (hex: string): number[] => {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
/** Towards white (a > 0) or black (a < 0). */
const mix = (hex: string, a: number): string => `rgb(${rgb(hex).map(c => Math.round(c + ((a > 0 ? 255 : 0) - c) * Math.abs(a))).join()})`
const light = (hex: string): boolean => {
  const [r, g, b] = rgb(hex)
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150
}
/** Level of detail for `s` CSS px per cell. */
const lodOf = (s: number): number => (s < 5 ? 0 : s < 14 ? 1 : 2)

/** Tiles built ahead for the next zoom level at most, per idle spell (designer recheck P2). */
export const PREBUILD_MAX = 48

/**
 * Device px per cell a tile is built at for `k` device px per cell on screen: `k` itself, rounded (any dpr, not
 * only powers of two). On a whole `k` (every level at dpr 1, 1.25, 1.5, 2 …) the frame's cell edges, rounded to
 * whole device px, lie exactly `k` apart, so the tile draws 1:1: the bead's gaps stay even on both sides and no
 * row or column is dropped, which a power-of-two tile scaled down by nearest neighbour did (32 → 24 at 1.5×:
 * 1 px gap left/top, 2 px right/bottom).
 */
export function tileB(k: number): number {
  return Math.min(TILE, Math.max(1, Math.round(k)))
}

/**
 * A scale settled on (designer, native tiles): `s` CSS px per cell snapped to a whole number of device px per cell,
 * the nearest (`down`: not over, for a fit that must stay inside the box), 1 device px at least. Every level is whole
 * already at dpr 1, 1.25, 1.5, 2; at e.g. 1.1 a level moves by half a device px at most, so no two levels meet (they
 * are ≥ 4 CSS px apart).
 */
export function snapScale(s: number, dpr: number, down = false): number {
  const k = s * dpr, r = Math.round(k)
  return Math.max(1, Math.abs(k - r) < 1e-6 ? r : down ? Math.floor(k) : r) / dpr
}

/** Cells a side of a tile built at `b` device px per cell (at most TILE device px a side, one cell at least). */
export const tileCells = (b: number): number => Math.max(1, (TILE / b) | 0)

/**
 * The tiles a view shows on a `cw` × `ch` box over a `w` × `h` board: their size (`b` device px per cell, `lod`,
 * `T` cells a side) and their places, the one nearest the box's middle first (designer recheck P1: on a cold
 * cache the detail fills in from the middle outwards, where the eye is).
 */
export function tilesOf(v: View, cw: number, ch: number, w: number, h: number, dpr: number): { b: number; lod: number; T: number; at: Array<[number, number]> } {
  const b = tileB(v.s * dpr)
  const T = tileCells(b), span = T * v.s
  const at: Array<[number, number]> = []
  for (let ty = Math.max(0, Math.floor(-v.oy / span)); ty <= Math.min(Math.ceil(h / T) - 1, Math.floor((ch - v.oy) / span)); ty++) {
    for (let tx = Math.max(0, Math.floor(-v.ox / span)); tx <= Math.min(Math.ceil(w / T) - 1, Math.floor((cw - v.ox) / span)); tx++) at.push([tx, ty])
  }
  const mx = (cw / 2 - v.ox) / span, my = (ch / 2 - v.oy) / span
  const d = ([x, y]: [number, number]): number => (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2
  return { b, lod: lodOf(v.s), T, at: at.toSorted((p, q) => d(p) - d(q)) }
}

/**
 * The tiles to build ahead while the page is idle (designer recheck P2): those of the nearest zoom level each
 * way that needs other tiles than `v` (in first, then out), zoomed about the box's middle as the buttons and keys do, middle first, without the
 * tile size `v` itself shows, and `max` at most.
 */
export function prebuildPlan(v: View, cw: number, ch: number, w: number, h: number, dpr: number, max = PREBUILD_MAX): Array<{ b: number; lod: number; T: number; tx: number; ty: number }> {
  const now = tilesOf(v, cw, ch, w, h, dpr), key = `${now.b}/${now.lod}`
  const at = (s: number): ReturnType<typeof tilesOf> => {
    const k = s / v.s
    return tilesOf({ s, ox: cw / 2 - (cw / 2 - v.ox) * k, oy: ch / 2 - (ch / 2 - v.oy) * k }, cw, ch, w, h, dpr)
  }
  const out: Array<{ b: number; lod: number; T: number; tx: number; ty: number }> = []
  // each way, the nearest level that needs other tiles than these (4 and 8 px/cell may share a tile size)
  for (const ls of [LEVELS.filter(l => l > v.s + 0.01), LEVELS.filter(l => l < v.s - 0.01).toReversed()]) {
    const g = ls.map(at).find(t => `${t.b}/${t.lod}` !== key)
    if (g) for (const [tx, ty] of g.at) if (out.length < max) out.push({ b: g.b, lod: g.lod, T: g.T, tx, ty })
  }
  return out
}

export class BigCanvas {
  view: View = { s: 16, ox: 0, oy: 0 }
  /** What the canvas shows now (differs from `view` while a gesture stretches it). */
  #shown: View = this.view
  cw = 0
  ch = 0
  #dpr = 1
  #th!: Theme
  #board: Board
  readonly #ctx: CanvasRenderingContext2D
  #base!: HTMLCanvasElement
  #img!: ImageData
  readonly #tiles = new Map<string, HTMLCanvasElement>()
  #bytes = 0
  readonly #cap: number
  readonly #sprites = new Map<string, Sprites>()
  /** [b, lod] of every tile size in the cache, for patching. */
  readonly #layers = new Map<string, [number, number]>()
  #frame = 0
  /** Stops the idle build-ahead in progress (P2). */
  #idleStop: (() => void) | null = null
  /** Running estimate of one new tile's build time (ms). */
  #tileMs = 4
  #settle: ReturnType<typeof setTimeout> | undefined
  /** The running ease: its frame and the scale it ends on. */
  #anim = 0
  #to = 0
  /** Where the last zoom gesture was (the snap's anchor). */
  #at: [number, number] | null = null
  #gesture = false
  readonly #ptrs = new Map<number, Ptr>()
  #mode: 'none' | 'wait' | 'paint' | 'pan' | 'pinch' | 'dead' = 'none'
  #wait: ReturnType<typeof setTimeout> | undefined
  #pinch: { d: number; mx: number; my: number; v: View } | null = null
  #pen = false
  #space = false
  #spacePanned = false
  #hover = -1
  /** Keyboard in use: the cursor box shows. */
  kbd = false
  readonly #off: Array<() => void> = []

  constructor(
    readonly host: HTMLElement,
    readonly el: HTMLCanvasElement,
    readonly mini: HTMLCanvasElement,
    readonly game: BigGame,
    readonly pal: readonly string[],
    readonly onView: (v: View) => void,
  ) {
    this.#ctx = ctx2(el)
    this.#board = game.board
    this.#cap = (globalThis.matchMedia?.('(pointer: coarse)').matches || devicePixelRatio >= 3 ? 24 : 48) << 20
    this.#theme()
    this.#reset()
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void, o: AddEventListenerOptions = { passive: false }): void => {
      t.addEventListener(type, fn as EventListener, o)
      this.#off.push(() => { t.removeEventListener(type, fn as EventListener, o) })
    }
    on(el, 'pointerdown', e => { this.#down(e) })
    on(el, 'pointermove', e => { this.#move(e) })
    on(el, 'pointerup', e => { this.#up(e) })
    on(el, 'pointercancel', e => { this.#up(e) })
    on(el, 'pointerleave', () => { this.#setHover(-1) })
    on(el, 'contextmenu', e => { e.preventDefault() })
    on(el, 'wheel', e => { this.#wheel(e) })
    on(el, 'touchmove', e => { e.preventDefault() })
    on(mini, 'pointerdown', e => { this.#miniAt(e, true) })
    on(mini, 'pointermove', e => { if (e.buttons) this.#miniAt(e, false) })
    on(host, 'keyup', e => {
      if (e.key !== ' ' || !this.#space) return
      this.#space = false
      el.style.cursor = ''
      if (!this.#spacePanned) this.#apply()
    })
    const mo = new MutationObserver(() => { this.#theme(); this.#flush(); this.paint() })
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    this.#off.push(() => { mo.disconnect() })
    const unsub = game.subscribe(() => { this.#sync() })
    this.#off.push(unsub)
  }

  dispose(): void {
    for (const f of this.#off) f()
    cancelAnimationFrame(this.#frame)
    cancelAnimationFrame(this.#anim)
    this.#idleStop?.()
    clearTimeout(this.#settle)
    clearTimeout(this.#wait)
  }

  // —— size, theme, data ——

  /** The canvas box in CSS px; the first call fits the board. */
  resize(cw: number, ch: number): void {
    const first = this.cw === 0, was = this.#dpr
    this.#dpr = Math.min(3, globalThis.devicePixelRatio || 1)
    // whole device px both ways and the CSS box exactly that, so the backing store maps 1:1 on the screen (a
    // rounded-up store in a whole CSS box would be rescaled, e.g. 815 px into 543 × 1.5 = 814.5)
    this.el.width = Math.max(1, Math.floor(cw * this.#dpr))
    this.el.height = Math.max(1, Math.floor(ch * this.#dpr))
    this.cw = this.el.width / this.#dpr
    this.ch = this.el.height / this.#dpr
    this.el.style.width = `${this.cw}px`
    this.el.style.height = `${this.ch}px`
    this.#flush()
    if (first) this.setView(this.fitView())
    // a new screen scale: settle on whole device px again, about the middle
    else if (this.#dpr !== was) this.#zoomAt(this.view.s, this.cw / 2, this.ch / 2)
    else this.setView(this.view)
  }

  #theme(): void {
    const cs = getComputedStyle(this.host)
    // styles.ts sets all of these on .pd-root, light and dark, which the page always sits in
    const v = (n: string): string => cs.getPropertyValue(n).trim()
    this.#th = { bg: v('--pd-board'), peg: v('--pd-peg'), accent: v('--pd-accent'), danger: v('--pd-danger'), ga: Number(v('--pd-ghost-alpha')), gh: Number(v('--pd-ghost-hot')) }
  }

  /** Drop every cached tile and sprite (theme, guide colour, size). */
  #flush(): void {
    this.#tiles.clear()
    this.#sprites.clear()
    this.#layers.clear()
    this.#bytes = 0
    this.#reset()
  }

  /** Rebuild the 1 px/cell base layer. */
  #reset(): void {
    const { w, h } = this.#board
    if (this.#base?.width !== w || this.#base.height !== h) {
      this.#base = canvas(w, h)
      this.#img = ctx2(this.#base).createImageData(w, h)
    }
    for (let i = 0; i < w * h; i++) this.#basePx(i)
    ctx2(this.#base).putImageData(this.#img, 0, 0)
  }

  #basePx(i: number): void {
    const g = this.game.get(), v = this.#board.cells[i]!, t = g.target?.cells[i] ?? EMPTY
    const bg = rgb(this.#th.bg)
    const c = v !== EMPTY ? rgb(this.pal[v]!) : t !== EMPTY ? rgb(this.pal[t]!).map((x, k) => Math.round(bg[k]! + (x - bg[k]!) * this.#th.ga)) : bg
    this.#img.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4)
  }

  #color = -1

  /** The game changed: patch the base layer and the cached tiles, redraw. */
  #sync(): void {
    const g = this.game.get()
    const next = g.history.present
    const prev = this.#board
    this.#board = next
    if (g.color !== this.#color && g.target) { this.#color = g.color; this.#flush() }
    else if (next !== prev) {
      if (next.w !== prev.w || next.h !== prev.h) { this.#flush(); this.setView(this.fitView()) }
      let dirty = this.game.dirty
      if (!dirty) {
        dirty = []
        for (let i = 0; i < next.cells.length; i++) if (next.cells[i] !== prev.cells[i]) dirty.push(i)
      }
      if (dirty.length > 4096) this.#flush()
      else if (dirty.length) this.#patch(dirty)
    }
    this.paint()
  }

  #patch(dirty: number[]): void {
    const { w } = this.#board
    let x0 = w, y0 = this.#board.h, x1 = 0, y1 = 0
    for (const i of dirty) {
      const x = i % w, y = (i / w) | 0
      this.#basePx(i)
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      for (const [b, lod] of this.#layers.values()) {
        const T = tileCells(b)
        const tile = this.#tiles.get(`${b}/${lod}/${(x / T) | 0}/${(y / T) | 0}`)
        if (!tile) continue
        const c = ctx2(tile), px = (x % T) * b, py = (y % T) * b
        c.fillStyle = this.#th.bg
        c.fillRect(px, py, b, b)
        this.#cell(c, i, px, py, b, this.#sprite(b, lod))
      }
    }
    if (dirty.length) ctx2(this.#base).putImageData(this.#img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  }

  // —— drawing ——

  #sprite(b: number, lod: number): Sprites {
    const key = `${b}/${lod}`
    let sp = this.#sprites.get(key)
    if (sp) return sp
    const th = this.#th
    const one = (hex: string, kind: 0 | 1 | 2, code: string): HTMLCanvasElement => {
      const c = canvas(b, b), x = ctx2(c), r = b * 0.44, m = b / 2
      if (lod === 0) {
        x.globalAlpha = kind ? (kind === 2 ? th.gh : th.ga) : 1
        x.fillStyle = hex
        x.fillRect(0, 0, b, b)
        return c
      }
      x.beginPath()
      x.arc(m, m, r, 0, Math.PI * 2)
      if (kind) {
        x.globalAlpha = kind === 2 ? th.gh : th.ga
        x.fillStyle = hex
        x.fill()
        x.globalAlpha = 1
        if (lod === 2) {
          x.fillStyle = light(hex) ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.9)'
          x.font = `600 ${Math.round(b * 0.42)}px ui-monospace,monospace`
          x.textAlign = 'center'
          x.textBaseline = 'middle'
          x.fillText(code, m, m + b * 0.03)
        }
        return c
      }
      const g = x.createRadialGradient(m - r * 0.25, m - r * 0.3, r * 0.1, m, m, r)
      g.addColorStop(0, mix(hex, 0.18))
      g.addColorStop(0.5, hex)
      g.addColorStop(1, mix(hex, -0.22))
      x.fillStyle = g
      x.fill()
      x.beginPath()
      x.arc(m, m, r * 0.36, 0, Math.PI * 2)
      x.fillStyle = mix(hex, -0.5)
      x.fill()
      return c
    }
    let peg: HTMLCanvasElement | null = null
    if (lod) {
      peg = canvas(b, b)
      const x = ctx2(peg)
      x.fillStyle = th.peg
      x.beginPath()
      x.arc(b / 2, b / 2, Math.max(0.5, b * 0.11), 0, Math.PI * 2)
      x.fill()
    }
    sp = {
      bead: this.pal.map(h => one(h, 0, '')),
      ghost: this.pal.map((h, i) => one(h, 1, i.toString(16))),
      hot: this.pal.map((h, i) => one(h, 2, i.toString(16))),
      peg,
    }
    this.#sprites.set(key, sp)
    return sp
  }

  #cell(c: CanvasRenderingContext2D, i: number, x: number, y: number, b: number, sp: Sprites): void {
    const g = this.game.get(), v = this.#board.cells[i]!, t = g.target ? g.target.cells[i]! : EMPTY
    if (v !== EMPTY) {
      c.drawImage(sp.bead[v]!, x, y)
      // a wrong bead gets a dashed red frame, not only a colour (plan §3.6)
      if (g.target && t !== v) {
        c.strokeStyle = this.#th.danger
        c.lineWidth = Math.max(1, b * 0.08)
        c.setLineDash([b * 0.16, b * 0.1])
        c.strokeRect(x + c.lineWidth, y + c.lineWidth, b - 2 * c.lineWidth, b - 2 * c.lineWidth)
        c.setLineDash([])
      }
    } else if (t !== EMPTY) c.drawImage((t === g.color ? sp.hot : sp.ghost)[t]!, x, y)
    else if (sp.peg) c.drawImage(sp.peg, x, y)
  }

  #tile(b: number, lod: number, T: number, tx: number, ty: number): HTMLCanvasElement {
    const { w, h } = this.#board
    const cw = Math.min(T, w - tx * T), chh = Math.min(T, h - ty * T)
    const c = canvas(cw * b, chh * b), x = ctx2(c), sp = this.#sprite(b, lod)
    x.fillStyle = this.#th.bg
    x.fillRect(0, 0, c.width, c.height)
    for (let yy = 0; yy < chh; yy++) for (let xx = 0; xx < cw; xx++) this.#cell(x, (ty * T + yy) * w + tx * T + xx, xx * b, yy * b, b, sp)
    return c
  }

  /** Ask for a frame (coalesced); once the view is whole, the next zoom levels' tiles are built while idle. */
  paint(): void {
    this.#idleStop?.()
    if (this.#gesture) { this.#stretch(); return }
    cancelAnimationFrame(this.#frame)
    this.#frame = requestAnimationFrame(() => { if (this.draw()) this.paint(); else this.#ahead() })
  }

  /** Keep a new tile, the oldest going past the memory cap. */
  #keep(key: string, t: HTMLCanvasElement): void {
    this.#tiles.set(key, t)
    this.#bytes += t.width * t.height * 4
    for (const [k2, old] of this.#tiles) {
      if (this.#bytes <= this.#cap) break
      this.#tiles.delete(k2)
      this.#bytes -= old.width * old.height * 4
    }
  }

  /**
   * Build the next zoom levels' tiles ahead, in idle time only (designer recheck P2): requestIdleCallback, one
   * tile per spell and more while it has room for them; without it one tile per 50 ms. At most PREBUILD_MAX, never past the
   * memory cap (nothing shown is dropped for them); any paint stops it.
   */
  #ahead(): void {
    const plan = prebuildPlan(this.view, this.cw, this.ch, this.#board.w, this.#board.h, this.#dpr)
    const ric = (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback
    let k = 0, h: unknown
    const step = (dl?: IdleDeadline): void => {
      let built = 0
      while (k < plan.length && this.#bytes + TILE * TILE * 4 <= this.#cap) {
        // one tile per idle spell at least: Chrome may hand out spells with no time left at all while the page
        // has frames to draw (seen in e2e, every spell 0 ms), and then nothing would ever be built ahead
        if (dl && built && dl.timeRemaining() < this.#tileMs + 1) break
        const { b, lod, T, tx, ty } = plan[k++]!, key = `${b}/${lod}/${tx}/${ty}`
        if (this.#tiles.has(key)) continue
        this.#layers.set(`${b}/${lod}`, [b, lod])
        this.#keep(key, this.#tile(b, lod, T, tx, ty))
        built++
        if (!dl) break
      }
      if (k < plan.length && this.#bytes + TILE * TILE * 4 <= this.#cap) h = ric ? ric(step) : setTimeout(step, 50)
      else this.#idleStop = null
    }
    h = ric ? ric(step) : setTimeout(step, 50)
    this.#idleStop = () => { if (ric) cancelIdleCallback(h as number); else clearTimeout(h as ReturnType<typeof setTimeout>); this.#idleStop = null }
  }

  /** Draw the view now; true when tiles are still missing (drawn from the base layer). */
  draw(): boolean {
    const ctx = this.#ctx, dpr = this.#dpr, { w, h } = this.#board
    const { s, ox, oy } = this.view
    const k0 = s * dpr
    const { b, lod, T, at } = tilesOf(this.view, this.cw, this.ch, w, h, dpr)
    this.#shown = this.view
    this.el.style.transform = ''
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.el.width, this.el.height)
    // every edge on a whole device pixel: cell c starts at ex(c) / ey(c), so a tile, the base layer
    // standing in for one and their neighbours meet exactly; no smoothing, so no blended edge either
    const ex = (c: number): number => Math.round((ox + c * s) * dpr), ey = (c: number): number => Math.round((oy + c * s) * dpr)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = this.#th.bg
    ctx.fillRect(ex(0), ey(0), ex(w) - ex(0), ey(h) - ey(0))
    this.#layers.set(`${b}/${lod}`, [b, lod])
    const t0 = performance.now()
    let built = 0, more = false
    // nearest the middle first, so a cold cache fills in from where the eye is (P1)
    for (const [tx, ty] of at) {
      const key = `${b}/${lod}/${tx}/${ty}`
      let t = this.#tiles.get(key)
      if (t) { this.#tiles.delete(key); this.#tiles.set(key, t) } else if (!built || performance.now() - t0 + this.#tileMs < TILE_BUDGET_MS) {
        built++
        const tb = performance.now()
        t = this.#tile(b, lod, T, tx, ty)
        this.#tileMs = (this.#tileMs + performance.now() - tb) / 2
        this.#keep(key, t)
      }
      const x = tx * T, y = ty * T, n = Math.min(T, w - x), m = Math.min(T, h - y)
      const dx = ex(x), dy = ey(y), dw = ex(x + n) - dx, dh = ey(y + m) - dy
      if (t) ctx.drawImage(t, dx, dy, dw, dh)
      else {
        more = true
        ctx.drawImage(this.#base, x, y, n, m, dx, dy, dw, dh)
      }
    }
    const g = this.game.get()
    // seams every `unit` cells: accent at 70 %, max(1, 0.06 × cell) wide (plan §2.4)
    if (g.unit > 0) {
      ctx.strokeStyle = this.#th.accent
      ctx.globalAlpha = 0.7
      // whole device pixels too: a crisp line on the cell edge, not two half-blended ones (designer steering 2)
      const lw = ctx.lineWidth = Math.max(1, Math.round(0.06 * k0)), o = (lw % 2) / 2
      ctx.beginPath()
      for (let x = g.unit; x < w; x += g.unit) { ctx.moveTo(ex(x) + o, ey(0)); ctx.lineTo(ex(x) + o, ey(h)) }
      for (let y = g.unit; y < h; y += g.unit) { ctx.moveTo(ex(0), ey(y) + o); ctx.lineTo(ex(w), ey(y) + o) }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const box = (i: number, a: number, lw: number): void => {
      ctx.globalAlpha = a
      ctx.strokeStyle = this.#th.accent
      ctx.lineWidth = lw * dpr
      ctx.strokeRect((ox + (i % w) * s) * dpr + ctx.lineWidth / 2, (oy + ((i / w) | 0) * s) * dpr + ctx.lineWidth / 2, k0 - ctx.lineWidth, k0 - ctx.lineWidth)
      ctx.globalAlpha = 1
    }
    if (this.#hover >= 0) box(this.#hover, 0.5, 1.5)
    if (this.kbd) box(g.cy * w + g.cx, 1, 2)
    this.#drawMini()
    return more
  }

  #drawMini(): void {
    const m = this.mini
    if (!m.isConnected || m.offsetParent === null) return
    const { w, h } = this.#board
    const css = m.clientWidth || 96, sc = css / Math.max(w, h)
    const dw = Math.round(w * sc * this.#dpr), dh = Math.round(h * sc * this.#dpr)
    if (m.width !== dw || m.height !== dh) { m.width = dw; m.height = dh; m.style.height = `${Math.round(h * sc)}px` }
    const c = ctx2(m), k = dw / w, { s, ox, oy } = this.view
    c.imageSmoothingEnabled = false
    c.drawImage(this.#base, 0, 0, dw, dh)
    c.lineWidth = Math.max(1, this.#dpr)
    const g = this.game.get()
    for (const bl of this.game.blocks()) {
      const cur = g.cx >= bl.x0 && g.cx < bl.x1 && g.cy >= bl.y0 && g.cy < bl.y1
      if (!cur && bl.pct < 100) continue
      c.strokeStyle = cur ? '#F08A24' : '#2BA24C'
      c.strokeRect(bl.x0 * k, bl.y0 * k, (bl.x1 - bl.x0) * k, (bl.y1 - bl.y0) * k)
    }
    c.strokeStyle = '#4176E6'
    c.strokeRect((-ox / s) * k, (-oy / s) * k, (this.cw / s) * k, (this.ch / s) * k)
  }

  // —— view ——

  /** The whole board in the box, on whole device px per cell (rounded down, so it still fits). */
  #fitScale(): number {
    return snapScale(Math.max(1, Math.min((this.cw - 8) / this.#board.w, (this.ch - 8) / this.#board.h)), this.#dpr, true)
  }

  /** The zoom levels on whole device px per cell. */
  #levels(): number[] {
    return LEVELS.map(l => snapScale(l, this.#dpr))
  }

  fitView(): View { return this.#clamp({ s: this.#fitScale(), ox: 0, oy: 0 }) }

  #clamp(v: View): View {
    const lv = this.#levels(), s = Math.max(Math.min(this.#fitScale(), lv[0]!), Math.min(lv.at(-1)!, v.s))
    const one = (o: number, size: number, box: number): number => (size <= box ? (box - size) / 2 : Math.min(EDGE, Math.max(box - size - EDGE, o)))
    return { s, ox: one(v.ox, this.#board.w * s, this.cw), oy: one(v.oy, this.#board.h * s, this.ch) }
  }

  /** `easing`: a frame of the running ease, which goes on; anything else stops it. */
  setView(v: View, easing?: boolean): void {
    if (!easing) { cancelAnimationFrame(this.#anim); this.#to = 0 }
    const prev = this.view
    this.view = this.#clamp(v)
    if (this.view.s !== prev.s) this.onView(this.view)
    this.paint()
  }

  /**
   * Zoom to `s` keeping the cell under (px, py) in place: at once, or eased over 120 ms (ease-out) when `ease`
   * is set and motion is not reduced. It ends on whole device px per cell (snapScale), the anchor exact on the
   * last frame (no jump after the ease); `raw`: a gesture's own frames, which may be fractional until it settles.
   */
  #zoomAt(s: number, px: number, py: number, ease?: boolean, raw?: boolean): void {
    const a = this.view, c = this.#clamp({ ...a, s }).s, z = (raw ? c : this.#clamp({ ...a, s: snapScale(c, this.#dpr) }).s) / a.s, t0 = performance.now()
    const at = (k: number): View => ({ s: a.s * k, ox: px - (px - a.ox) * k, oy: py - (py - a.oy) * k })
    if (!ease || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { this.setView(at(z)); return }
    cancelAnimationFrame(this.#anim)
    this.#to = a.s * z
    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / SETTLE_MS)
      this.setView(at(z ** (1 - (1 - t) ** 3)), true)
      // #to stays: it is the scale it ended on, until any other view change clears it
      if (t < 1) this.#anim = requestAnimationFrame(tick)
    }
    this.#anim = requestAnimationFrame(tick)
  }

  /** One level in or out (keys, buttons), around the cursor cell when it is in view; a held key goes on from where the ease is heading. */
  step(d: 1 | -1): void {
    const v = this.view, at = this.#to || v.s, fit = this.#fitScale()
    const lv = [...new Set([fit, ...this.#levels()])].toSorted((a, b) => a - b)
    const s = d > 0 ? lv.find(l => l > at * 1.001) : lv.findLast(l => l < at / 1.001)
    if (s === undefined) return
    const g = this.game.get()
    let px = v.ox + (g.cx + 0.5) * v.s, py = v.oy + (g.cy + 0.5) * v.s
    if (px < 0 || py < 0 || px > this.cw || py > this.ch) { px = this.cw / 2; py = this.ch / 2 }
    this.#zoomAt(s, px, py, true)
  }

  /** Keep cell (x, y) in view with a two-cell margin. */
  #follow(x: number, y: number): void {
    const { s, ox, oy } = this.view, m = 2 * s
    const one = (o: number, c: number, box: number): number => {
      const p = o + c * s
      return p < m ? o + m - p : p + s > box - m ? o - (p + s - (box - m)) : o
    }
    this.setView({ s, ox: one(ox, x, this.cw), oy: one(oy, y, this.ch) })
  }

  /** Show a block whole (N, the block list). */
  showBlock(x0: number, y0: number, x1: number, y1: number): void {
    const s = snapScale(Math.min(64, (this.cw - 16) / (x1 - x0), (this.ch - 16) / (y1 - y0)), this.#dpr, true)
    this.setView({ s, ox: this.cw / 2 - ((x0 + x1) / 2) * s, oy: this.ch / 2 - ((y0 + y1) / 2) * s })
  }

  /** While a gesture runs, stretch the last frame; redraw once it settles. */
  #stretch(): void {
    const a = this.#shown, v = this.view, k = v.s / a.s
    this.el.style.transform = `translate(${v.ox - a.ox * k}px,${v.oy - a.oy * k}px) scale(${k})`
    clearTimeout(this.#settle)
    this.#settle = setTimeout(() => { this.#settleNow() }, SETTLE_MS)
  }

  #settleNow(): void {
    if (this.#mode === 'pinch') { this.#stretch(); return }
    this.#gesture = false
    const v = this.view, fit = this.#fitScale()
    const lv = this.#levels(), near = [fit, ...lv].find(l => Math.abs(v.s - l) / l < 0.15 && l >= Math.min(fit, lv[0]!))
    // around the last pointer or pinch centre, so the cell under it stays put (review I3); between levels it still
    // ends on whole device px per cell
    const [px, py] = this.#at ?? [this.cw / 2, this.ch / 2], to = near ?? snapScale(v.s, this.#dpr)
    if (to !== v.s) this.#zoomAt(to, px, py, true)
    else this.paint()
  }

  // —— input ——

  #local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.host.getBoundingClientRect()
    return [e.clientX - r.left - this.el.offsetLeft, e.clientY - r.top - this.el.offsetTop]
  }

  /** The cell under a point, or -1. */
  #cellAt(px: number, py: number): number {
    const { s, ox, oy } = this.view, { w, h } = this.#board
    const x = Math.floor((px - ox) / s), y = Math.floor((py - oy) / s)
    return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1
  }

  #wheel(e: WheelEvent): void {
    e.preventDefault()
    const u = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.ch : 1
    const v = this.view
    if (e.ctrlKey || e.metaKey) {
      const [px, py] = this.#local(e)
      this.#at = [px, py]
      this.#gesture = true
      this.#zoomAt(v.s * Math.exp(-Math.max(-50, Math.min(50, e.deltaY * u)) / 100), px, py, false, true)
      return
    }
    const dx = (e.shiftKey ? e.deltaY : e.deltaX) * u, dy = e.shiftKey ? 0 : e.deltaY * u
    this.setView({ s: v.s, ox: v.ox - dx, oy: v.oy - dy })
  }

  #setHover(i: number): void {
    if (i === this.#hover) return
    this.#hover = i
    this.paint()
  }

  #down(e: PointerEvent): void {
    this.host.focus({ preventScroll: true })
    if (e.pointerType === 'pen') this.#pen = true
    const [x, y] = this.#local(e)
    this.#ptrs.set(e.pointerId, { x, y, sx: x, sy: y, t: e.pointerType, at: e.timeStamp })
    try { this.el.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
    e.preventDefault()
    this.kbd = false
    if (this.#ptrs.size === 2) {
      const [a, b] = [...this.#ptrs.values()]
      if (a!.t !== 'touch' || b!.t !== 'touch') return
      // a second finger: within 120 ms the first one's stroke never happened (plan §3.5)
      clearTimeout(this.#wait)
      if (this.#mode === 'paint') {
        if (e.timeStamp - a!.at < 120) this.game.strokeCancel()
        else this.game.strokeEnd()
      }
      this.#mode = 'pinch'
      this.#pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2, v: this.view }
      this.#gesture = true
      return
    }
    if (this.#ptrs.size > 2) return
    const touch = e.pointerType === 'touch'
    if (e.button === 1 || this.#space || (touch && this.#pen)) {
      this.#mode = 'pan'
      this.#spacePanned = this.#space
      return
    }
    if (e.button !== 0 && e.button !== 2) return
    const i = this.#cellAt(x, y)
    if (i < 0) { this.#mode = 'pan'; return }
    // too small to hit: the first press zooms in on the spot instead (plan §3.2)
    if (this.view.s < (touch ? 24 : 10)) {
      this.#mode = 'dead'
      this.#zoomAt(touch ? 32 : 16, x, y)
      return
    }
    this.#setCursor(i)
    if (touch) {
      this.#mode = 'wait'
      this.#wait = setTimeout(() => { if (this.#mode === 'wait') this.#begin(e, i) }, 80)
    } else this.#begin(e, i)
  }

  #begin(e: PointerEvent, i: number): void {
    this.#mode = i < 0 ? 'dead' : 'paint'
    if (i < 0) return
    const w = this.#board.w
    this.game.strokeStart(i % w, (i / w) | 0, e.button === 2 ? 'erase' : e.altKey ? 'pick' : undefined)
    if (!this.game.stroking) this.#mode = 'dead'
  }

  #move(e: PointerEvent): void {
    const p = this.#ptrs.get(e.pointerId)
    const [x, y] = this.#local(e)
    if (!p) {
      if (e.pointerType === 'mouse') this.#setHover(this.#cellAt(x, y))
      return
    }
    const dx = x - p.x, dy = y - p.y
    p.x = x
    p.y = y
    const v = this.view
    if (this.#mode === 'pinch' && this.#pinch) {
      const [a, b] = [...this.#ptrs.values()]
      const pi = this.#pinch, k = Math.max(Math.min(this.#fitScale(), 4), Math.min(64, (pi.v.s * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pi.d)) / pi.v.s
      const mx = (a!.x + b!.x) / 2, my = (a!.y + b!.y) / 2
      this.#at = [mx, my]
      this.setView({ s: pi.v.s * k, ox: mx - (pi.mx - pi.v.ox) * k, oy: my - (pi.my - pi.v.oy) * k })
    } else if (this.#mode === 'pan') this.setView({ s: v.s, ox: v.ox + dx, oy: v.oy + dy })
    else if (this.#mode === 'wait' && Math.hypot(x - p.sx, y - p.sy) >= 6) {
      // a finger that moves 6 px paints before its 80 ms are up
      clearTimeout(this.#wait)
      this.#begin(e, this.#cellAt(p.sx, p.sy))
      this.#drag(this.#cellAt(x, y))
    } else if (this.#mode === 'paint') {
      const i = this.#cellAt(x, y)
      this.#drag(i < 0 ? this.#cellAt(Math.max(v.ox, Math.min(v.ox + this.#board.w * v.s - 1, x)), Math.max(v.oy, Math.min(v.oy + this.#board.h * v.s - 1, y))) : i)
    }
  }

  #drag(i: number): void {
    if (i < 0) return
    const w = this.#board.w
    this.game.strokeMove(i % w, (i / w) | 0)
  }

  #up(e: PointerEvent): void {
    if (!this.#ptrs.delete(e.pointerId)) return
    if (this.#mode === 'wait') {
      // a quick tap places at once
      clearTimeout(this.#wait)
      const g = this.game.get()
      this.game.applyAt(g.cx, g.cy)
    }
    if (this.#mode === 'paint') this.game.strokeEnd()
    if (this.#ptrs.size === 0) {
      if (this.#mode === 'pinch') { this.#mode = 'none'; this.#settleNow() }
      this.#mode = 'none'
      this.#pinch = null
    } else if (this.#mode === 'pinch') this.#mode = 'dead'
  }

  #miniAt(e: PointerEvent, first: boolean): void {
    e.preventDefault()
    const r = this.mini.getBoundingClientRect(), { w, h } = this.#board
    const cx = ((e.clientX - r.left) / r.width) * w, cy = ((e.clientY - r.top) / r.height) * h
    const s = first && this.view.s <= this.#fitScale() + 0.01 ? snapScale(16, this.#dpr) : this.view.s
    this.setView({ s, ox: this.cw / 2 - cx * s, oy: this.ch / 2 - cy * s })
  }

  // —— keyboard (the page passes the canvas's keys here) ——

  #setCursor(i: number): void {
    const w = this.#board.w
    this.game.set({ cx: i % w, cy: (i / w) | 0 })
  }

  #moveCursor(x: number, y: number): void {
    const { w, h } = this.#board
    x = Math.max(0, Math.min(w - 1, x))
    y = Math.max(0, Math.min(h - 1, y))
    this.kbd = true
    this.game.set({ cx: x, cy: y })
    this.#follow(x, y)
  }

  /** Space released without panning, Enter: the tool at the cursor. */
  #apply(tool?: 'erase'): void {
    const g = this.game.get()
    this.kbd = true
    this.game.applyAt(g.cx, g.cy, tool)
  }

  /** Canvas keys (plan §3.6); true when handled. */
  key(e: KeyboardEvent): boolean {
    const g = this.game.get(), { w, h } = this.#board, u = g.unit || Math.max(w, h)
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const a = arrows[e.key]
    if (a) {
      // Shift: a whole block
      const n = e.shiftKey ? u : 1
      this.#moveCursor(e.shiftKey && a[0] ? (Math.floor(g.cx / u) + a[0]) * u : g.cx + a[0] * n, e.shiftKey && a[1] ? (Math.floor(g.cy / u) + a[1]) * u : g.cy + a[1] * n)
    } else if (e.key === 'Home' || e.key === 'End') {
      const end = e.key === 'End'
      this.#moveCursor(end ? w - 1 : 0, e.ctrlKey || e.metaKey ? (end ? h - 1 : 0) : g.cy)
    } else if (e.key === ' ') {
      if (!e.repeat) { this.#space = true; this.#spacePanned = false; this.el.style.cursor = 'grab' }
    } else if (e.key === 'Enter') this.#apply()
    else if (e.key === 'Delete' || e.key === 'Backspace') this.#apply('erase')
    else if (e.key === '+' || e.key === '=') this.step(1)
    else if (e.key === '-' || e.key === '_') this.step(-1)
    else if (e.key === '0') this.setView(this.fitView())
    else return false
    e.preventDefault()
    return true
  }
}
