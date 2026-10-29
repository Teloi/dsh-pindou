/**
 * Canvas drawing for the two places the design uses bitmaps: the start-page
 * thumbnails and PNG export (spec §13). The board itself is DOM.
 */
import { EMPTY, PALETTE, templateIdOf, type Board } from '../core/index.ts'

/** Ironed export: a cell's corner rounds only when both orthogonal neighbours along it are empty. */
export function cornerRadii(board: Board, x: number, y: number): [boolean, boolean, boolean, boolean] {
  const n = board.size
  const filled = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < n && cy < n && board.cells[cy * n + cx] !== EMPTY
  const up = filled(x, y - 1), down = filled(x, y + 1), left = filled(x - 1, y), right = filled(x + 1, y)
  // top-left, top-right, bottom-right, bottom-left
  return [!up && !left, !up && !right, !down && !right, !down && !left]
}

function bead(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hex: string, hole: boolean): void {
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r)
  g.addColorStop(0, shade(hex, 0.18))
  g.addColorStop(0.5, hex)
  g.addColorStop(1, shade(hex, -0.22))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  if (hole) {
    ctx.fillStyle = shade(hex, -0.5)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Mix a hex colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const v = Number.parseInt(hex.slice(1), 16)
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const t = amount > 0 ? 255 : 0
    return Math.round(c + (t - c) * Math.abs(amount))
  })
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`
}

/** Draw a small preview of a board into a canvas of `css` CSS pixels. */
export function drawThumb(canvas: HTMLCanvasElement, board: Board, css = 56, dpr = globalThis.devicePixelRatio || 1): void {
  const px = Math.round(css * dpr)
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, px, px)
  const cell = px / board.size
  for (let i = 0; i < board.cells.length; i++) {
    const c = board.cells[i]!
    if (c === EMPTY) continue
    const x = i % board.size, y = Math.floor(i / board.size)
    bead(ctx, (x + 0.5) * cell, (y + 0.5) * cell, cell * 0.47, PALETTE[c]!.hex, cell >= 5)
  }
}

export const EXPORT_CELL = 32

/** Render the export bitmap: 32 px per cell plus a one-cell margin. */
export function renderExport(doc: Document, board: Board, ironed: boolean, dark: boolean): HTMLCanvasElement {
  const n = board.size
  const side = (n + 2) * EXPORT_CELL
  const canvas = doc.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  const o = EXPORT_CELL
  if (!ironed) {
    ctx.fillStyle = dark ? '#1C1D20' : '#EEF0F3'
    roundRect(ctx, o / 2, o / 2, side - o, side - o, 24)
    ctx.fill()
    ctx.fillStyle = dark ? '#34373D' : '#D3D8DF'
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (board.cells[y * n + x] !== EMPTY) continue
      ctx.beginPath()
      ctx.arc(o + (x + 0.5) * o, o + (y + 0.5) * o, o * 0.11, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = board.cells[y * n + x]!
    if (c === EMPTY) continue
    const hex = PALETTE[c]!.hex
    if (ironed) {
      const [tl, tr, br, bl] = cornerRadii(board, x, y)
      const r = o * 0.42
      ctx.fillStyle = hex
      roundRect(ctx, o + x * o - 0.5, o + y * o - 0.5, o + 1, o + 1, [tl ? r : 0, tr ? r : 0, br ? r : 0, bl ? r : 0])
      ctx.fill()
      // the same soft inner shade as the panel, so fused light beads keep their texture (design N13)
      if (ctx.createRadialGradient) {
        const cx = o + (x + 0.5) * o, cy = o + (y + 0.5) * o
        const inner = ctx.createRadialGradient(cx, cy, o * 0.22, cx, cy, o * 0.72)
        inner.addColorStop(0, 'rgba(0,0,0,0)')
        inner.addColorStop(1, 'rgba(0,0,0,0.07)')
        ctx.fillStyle = inner
        ctx.fill()
      }
    } else {
      bead(ctx, o + (x + 0.5) * o, o + (y + 0.5) * o, o * 0.44, hex, true)
    }
  }
  return canvas
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]): void {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

const p = (v: number): string => String(v).padStart(2, '0')

/** `bead-break-<id|ai|free>-YYYYMMDD-HHmm.png` */
export function exportFileName(target: string | null, at: Date): string {
  const tag = target === null ? 'free' : (templateIdOf(target) ?? 'ai').replaceAll(/[^a-z0-9-]/g, '')
  return `bead-break-${tag || 'free'}-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.png`
}

/** Encode the export canvas (spec §13) as a PNG blob; null when the canvas refuses. */
export async function exportBlob(doc: Document, board: Board, ironed: boolean, dark: boolean): Promise<Blob | null> {
  try {
    const canvas = renderExport(doc, board, ironed, dark)
    return await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve, 'image/png') })
  } catch {
    return null
  }
}

/**
 * How a PNG is handed to the user:
 * - `download`: `<a download>` with a blob URL. Verified in the DSH desktop shell
 *   (Electron 44, secure `dsh-app:` scheme): the click raises `will-download`
 *   on the default session, which DSH leaves to Electron's native save dialog
 *   (apps/desktop/src/main.ts only blocks downloads for browser guests).
 * - `manual`: no download attribute support. `window.open` is not an option
 *   (DSH desktop denies non-http popups), so the image is shown in the panel
 *   for right-click / long-press saving.
 */
export type SaveRoute = 'download' | 'manual'

export function saveRoute(doc: Document): SaveRoute {
  const view = doc.defaultView
  return view && 'download' in view.HTMLAnchorElement.prototype ? 'download' : 'manual'
}

/** Trigger the download; returns false when the browser throws. */
export function downloadBlob(doc: Document, blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const a = doc.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.className = 'pd-portal'
    a.hidden = true
    doc.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => { URL.revokeObjectURL(url) }, 4000)
    return true
  } catch {
    return false
  }
}

interface ClipboardWindow {
  readonly isSecureContext?: boolean
  readonly navigator: { readonly clipboard?: { readonly write?: unknown } }
  readonly ClipboardItem?: { new (items: Record<string, Blob | Promise<Blob>>): unknown; supports?(type: string): boolean }
}

/** Whether "Copy image" can work here: secure context + async clipboard + PNG ClipboardItem. */
export function canCopyImage(view: unknown = globalThis): boolean {
  const w = view as ClipboardWindow | undefined
  if (!w || w.isSecureContext === false) return false
  if (typeof w.ClipboardItem !== 'function' || typeof w.navigator?.clipboard?.write !== 'function') return false
  try { return w.ClipboardItem.supports ? w.ClipboardItem.supports('image/png') : true } catch { return false }
}

/**
 * Copy a PNG to the system clipboard. The blob is passed as a promise so
 * Safari keeps the click's user activation while the canvas encodes.
 */
export async function copyPng(blob: Promise<Blob | null>, view: unknown = globalThis): Promise<boolean> {
  if (!canCopyImage(view)) return false
  const w = view as Required<ClipboardWindow> & { navigator: { clipboard: { write(items: unknown[]): Promise<void> } } }
  try {
    const png = blob.then((b) => { if (!b) throw new Error('no image'); return b })
    await w.navigator.clipboard.write([new w.ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}
