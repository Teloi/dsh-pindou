/**
 * The game behind the big-board page (lazy chunk lib/client.big.js, plan §2–§3):
 * a `w × h` board with diff undo (diff-history.ts), an optional pattern to follow
 * (`target`, from an imported share code), blocks of `unit` cells (A1, A2 …) and
 * the cursor and zoom the page shows. No DOM here: the canvas (big-canvas.ts) and
 * the React page (big.tsx) subscribe to it.
 *
 * Painting follows the first screen's GameStore so the two feel the same (plan
 * §3.8): one stroke, one fill or one clear is one undo step; a no-op adds none;
 * a new change drops redo; at most 100 steps. A stroke cancelled by a second
 * finger leaves no step at all (§3.5).
 */
import { blank, EMPTY, lineIdx, regionIdx, setCells } from '../core/big-board.ts'
import type { Board } from '../core/board.ts'
import { begin, cancel, canRedo, canUndo, commit, createHistory, preview, push, redo, undo, type DiffHistory } from '../core/diff-history.ts'

export type BigTool = 'paint' | 'erase' | 'pick' | 'fill'

export interface Block {
  /** A1, A2 … B1: row letter, column number (plan §2.4). */
  readonly name: string
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  /** Done share, 0–100: right cells of the pattern, or filled cells without one. */
  readonly pct: number
}

export interface BigState {
  readonly history: DiffHistory
  readonly target: Board | null
  /** Seam spacing in cells; 0 = one block. */
  readonly unit: number
  readonly color: number
  readonly tool: BigTool
  /** 只看本色 (O): strokes only fill cells the pattern wants in the current colour. */
  readonly only: boolean
  readonly cx: number
  readonly cy: number
}

/** Blocks of a board, row-major, with their done share. */
export function blocksOf(board: Board, target: Board | null, unit: number): Block[] {
  const { w, h, cells } = board
  const u = unit > 0 ? unit : Math.max(w, h)
  const out: Block[] = []
  for (let r = 0, y0 = 0; y0 < h; r++, y0 += u) {
    for (let c = 0, x0 = 0; x0 < w; c++, x0 += u) {
      const x1 = Math.min(w, x0 + u), y1 = Math.min(h, y0 + u)
      let all = 0, ok = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * w + x, t = target ? target.cells[i]! : 0
        if (t === EMPTY) { if (cells[i] !== EMPTY) all++; continue }
        all++
        if (target ? cells[i] === t : cells[i] !== EMPTY) ok++
      }
      out.push({ name: String.fromCharCode(65 + r) + (c + 1), x0, y0, x1, y1, pct: all ? Math.floor((ok * 100) / all) : 100 })
    }
  }
  return out
}

export class BigGame {
  #s: BigState
  readonly #fns = new Set<() => void>()
  #last: { x: number; y: number; v: number } | null = null
  #memo: [Board, Block[]] | null = null
  /** Cells changed by the latest edit (null: unknown, compare the whole board). */
  dirty: number[] | null = null

  constructor(board: Board, target: Board | null = null, unit = 29, color = 4) {
    this.#s = { history: createHistory(board), target, unit, color, tool: 'paint', only: false, cx: board.w >> 1, cy: board.h >> 1 }
  }

  readonly subscribe = (fn: () => void): (() => void) => {
    this.#fns.add(fn)
    return () => { this.#fns.delete(fn) }
  }
  readonly get = (): BigState => this.#s

  set(p: Partial<BigState>, dirty: number[] | null = null): void {
    this.dirty = dirty
    this.#s = { ...this.#s, ...p }
    for (const fn of this.#fns) fn()
  }

  get board(): Board { return this.#s.history.present }
  get canUndo(): boolean { return canUndo(this.#s.history) }
  get canRedo(): boolean { return canRedo(this.#s.history) }
  get stroking(): boolean { return this.#last !== null }

  blocks(): Block[] {
    const b = this.board
    if (this.#memo?.[0] !== b) this.#memo = [b, blocksOf(b, this.#s.target, this.#s.unit)]
    return this.#memo[1]
  }

  /** Indices a stroke may paint: all, or under 只看本色 only those the pattern wants in this colour. */
  #keep(idx: number[], v: number): number[] {
    const t = this.#s.target
    return this.#s.only && t && v !== EMPTY ? idx.filter(i => t.cells[i] === v) : idx
  }

  strokeStart(x: number, y: number, override?: BigTool): void {
    const b = this.board
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
    const tool = override ?? this.#s.tool
    const i = y * b.w + x
    if (tool === 'pick') {
      if (b.cells[i] !== EMPTY) this.set({ color: b.cells[i]!, tool: 'paint' })
      return
    }
    if (tool === 'fill') {
      const idx = this.#keep(regionIdx(b, i), this.#s.color)
      const next = setCells(b, idx, this.#s.color)
      if (next !== b) this.set({ history: push(commit(this.#s.history), next) }, idx)
      return
    }
    const v = tool === 'erase' ? EMPTY : this.#s.color
    this.#last = { x, y, v }
    const idx = this.#keep([i], v)
    this.set({ history: preview(begin(this.#s.history), setCells(b, idx, v)) }, idx)
  }

  strokeMove(x: number, y: number): void {
    const l = this.#last
    if (!l) return
    const b = this.board
    x = Math.max(0, Math.min(b.w - 1, x))
    y = Math.max(0, Math.min(b.h - 1, y))
    if (x === l.x && y === l.y) return
    const idx = this.#keep(lineIdx(b.w, l.x, l.y, x, y), l.v)
    this.#last = { x, y, v: l.v }
    const next = setCells(b, idx, l.v)
    if (next !== b) this.set({ history: preview(this.#s.history, next) }, idx)
  }

  strokeEnd(): void {
    if (!this.#last) return
    this.#last = null
    this.set({ history: commit(this.#s.history) }, [])
  }

  /** A second finger came down: the stroke never happened (plan §3.5). */
  strokeCancel(): void {
    if (!this.#last) return
    this.#last = null
    this.set({ history: cancel(this.#s.history) })
  }

  applyAt(x: number, y: number, override?: BigTool): void {
    this.strokeStart(x, y, override)
    this.strokeEnd()
  }

  undo(): void {
    this.#last = null
    const h = commit(this.#s.history)
    if (canUndo(h)) this.set({ history: undo(h) })
  }

  redo(): void {
    this.#last = null
    const h = commit(this.#s.history)
    if (canRedo(h)) this.set({ history: redo(h) })
  }

  clear(): boolean {
    const b = this.board
    if (b.cells.every(c => c === EMPTY)) return false
    this.#last = null
    this.set({ history: push(commit(this.#s.history), blank(b.w, b.h)) })
    return true
  }
}
