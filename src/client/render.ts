/**
 * Canvas drawing for the two places the design uses bitmaps: the start-page
 * thumbnails and PNG export (spec §13). The board itself is DOM.
 */
import { EMPTY, PALETTE, type Board } from '../core/index.ts'

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
    } else {
      bead(ctx, o + (x + 0.5) * o, o + (y + 0.5) * o, o * 0.44, hex, true)
    }
  }
  return canvas
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

const p = (v: number): string => String(v).padStart(2, '0')

/** `bead-break-<id|ai|free>-YYYYMMDD-HHmm.png` */
export function exportFileName(target: string | null, at: Date): string {
  const tag = target === null ? 'free' : target.startsWith('ai:') ? 'ai' : target.replaceAll(/[^a-z0-9-]/g, '')
  return `bead-break-${tag || 'free'}-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.png`
}

/** Download the board as PNG. Resolves false when the browser refuses. */
export async function downloadPng(doc: Document, board: Board, ironed: boolean, dark: boolean, target: string | null, now = new Date()): Promise<boolean> {
  try {
    const canvas = renderExport(doc, board, ironed, dark)
    const blob = await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve, 'image/png') })
    if (!blob) return false
    const url = URL.createObjectURL(blob)
    const a = doc.createElement('a')
    a.href = url
    a.download = exportFileName(target, now)
    a.rel = 'noopener'
    doc.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => { URL.revokeObjectURL(url) }, 4000)
    return true
  } catch {
    return false
  }
}
