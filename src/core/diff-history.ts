import { HISTORY_LIMIT, sameShape } from './big-board.ts'
import type { Board } from './board.ts'

/**
 * Undo/redo that stores differences, not boards (plan §4.3, "撤销改差异"), for
 * the big boards of client.big.js (phase 2). Same API and semantics as
 * history.ts: a drag is one entry (`begin` / `preview` / `commit`), a new
 * change drops the redo branch, at most `limit` (HISTORY_LIMIT = 100) steps.
 *
 * A step is the changed cell indices (Uint16: 208² = 43,264 fits) and the
 * values on the other side of the step (Int8), 3 B per changed cell; undo swaps
 * them in, and the values it replaced become the redo step. A change of size
 * keeps the whole other board. On top of the step count, all steps together
 * stay under {@link HISTORY_BYTES} (16 MB): past it the oldest go.
 *
 * The first screen keeps history.ts (boards up to 24², 100 snapshots ≈ 0.5 MB
 * at most): this module costs ~115–180 B gzip there and the entry has 20 B left
 * under its hard cap, so it ships only in lazy chunks.
 */
export type Step = Board | { readonly i: Uint16Array; readonly v: Int8Array }

export interface DiffHistory {
  readonly past: readonly Step[]
  readonly present: Board
  readonly future: readonly Step[]
  /** Board at the start of an in-progress stroke, if any. */
  readonly strokeBase?: Board | undefined
}

/**
 * 16 MB: above 100 whole-board steps of a 208² board (100 × 43,264 × 3 B ≈
 * 13 MB), so in practice the step limit is the same 100 as the first screen's
 * snapshot undo (steering 1: the two must not feel different); the byte cap
 * only guards against size-change steps piling up.
 */
export const HISTORY_BYTES = 16 * 1024 * 1024

/** Bytes a step holds: 3 per changed cell, or one per cell of a whole board. */
export const stepBytes = (s: Step): number => ('cells' in s ? s.cells.length : s.i.length * 3)

/** Bytes all steps hold together. */
export const historyBytes = (h: DiffHistory): number =>
  [...h.past, ...h.future].reduce((n, s) => n + stepBytes(s), 0)

/** The step that turns `to` back into `from`. */
export function diff(from: Board, to: Board): Step {
  if (!sameShape(from, to)) return from
  const i: number[] = []
  to.cells.forEach((c, k) => { if (c !== from.cells[k]) i.push(k) })
  return { i: Uint16Array.from(i), v: Int8Array.from(i, k => from.cells[k]!) }
}

/** Swap a step in; also returns the step that swaps it back out. */
function swap(board: Board, s: Step): [Board, Step] {
  if ('cells' in s) return [s, board]
  const cells = board.cells.slice()
  const v = s.v.map((x, n) => {
    const k = s.i[n]!, old = cells[k]!
    cells[k] = x
    return old
  })
  return [{ ...board, cells: Object.freeze(cells) }, { i: s.i, v }]
}

export function createHistory(present: Board): DiffHistory {
  return { past: [], present, future: [] }
}

/** Record a finished change. No-ops (same object) are ignored. */
export function push(history: DiffHistory, next: Board, limit = HISTORY_LIMIT, maxBytes = HISTORY_BYTES): DiffHistory {
  if (next === history.present) return history
  const past = [...history.past, diff(history.present, next)]
  let bytes = past.reduce((n, s) => n + stepBytes(s), 0)
  // the newest step always stays, even alone over the cap
  while (past.length > limit || (bytes > maxBytes && past.length > 1)) bytes -= stepBytes(past.shift()!)
  return { past, present: next, future: [] }
}

/** Start a stroke: further `preview` calls update the present without new entries. */
export function begin(history: DiffHistory): DiffHistory {
  if (history.strokeBase !== undefined) return history
  return { ...history, strokeBase: history.present }
}

export function preview(history: DiffHistory, next: Board): DiffHistory {
  if (history.strokeBase === undefined) return push(history, next)
  return next === history.present ? history : { ...history, present: next }
}

/** Finish a stroke as one history entry (or nothing when the stroke changed nothing). */
export function commit(history: DiffHistory, limit = HISTORY_LIMIT, maxBytes = HISTORY_BYTES): DiffHistory {
  const base = history.strokeBase
  if (base === undefined) return history
  const settled: DiffHistory = { past: history.past, present: base, future: history.future }
  return history.present === base ? settled : push(settled, history.present, limit, maxBytes)
}

export function canUndo(history: DiffHistory): boolean {
  return history.past.length > 0 && history.strokeBase === undefined
}

export function canRedo(history: DiffHistory): boolean {
  return history.future.length > 0 && history.strokeBase === undefined
}

export function undo(history: DiffHistory): DiffHistory {
  const h = commit(history)
  const s = h.past.at(-1)
  if (s === undefined) return h
  const [present, back] = swap(h.present, s)
  return { past: h.past.slice(0, -1), present, future: [back, ...h.future] }
}

export function redo(history: DiffHistory): DiffHistory {
  const h = commit(history)
  const [s, ...rest] = h.future
  if (s === undefined) return h
  const [present, back] = swap(h.present, s)
  return { past: [...h.past, back], present, future: rest }
}
