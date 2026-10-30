import type { Board } from './board.ts'

/**
 * Undo/redo over immutable boards. A drag is one entry: callers bracket it
 * with `begin` / `commit`, and intermediate `preview` states are not recorded.
 */
export interface History {
  readonly past: readonly Board[]
  readonly present: Board
  readonly future: readonly Board[]
  /** Board at the start of an in-progress stroke, if any. */
  readonly strokeBase?: Board | undefined
}

export const HISTORY_LIMIT = 100

export function createHistory(present: Board): History {
  return { past: [], present, future: [] }
}

/** Record a finished change. No-ops (same object) are ignored. */
export function push(history: History, next: Board, limit = HISTORY_LIMIT): History {
  if (next === history.present) return history
  const past = [...history.past, history.present]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, present: next, future: [] }
}

/** Start a stroke: further `preview` calls update the present without new entries. */
export function begin(history: History): History {
  if (history.strokeBase !== undefined) return history
  return { ...history, strokeBase: history.present }
}

export function preview(history: History, next: Board): History {
  if (history.strokeBase === undefined) return push(history, next)
  return next === history.present ? history : { ...history, present: next }
}

/** Finish a stroke as one history entry (or nothing when the stroke changed nothing). */
export function commit(history: History, limit = HISTORY_LIMIT): History {
  const base = history.strokeBase
  if (base === undefined) return history
  const settled: History = { past: history.past, present: base, future: history.future }
  return history.present === base ? settled : push(settled, history.present, limit)
}

export function canUndo(history: History): boolean {
  return history.past.length > 0 && history.strokeBase === undefined
}

export function canRedo(history: History): boolean {
  return history.future.length > 0 && history.strokeBase === undefined
}

export function undo(history: History): History {
  const h = commit(history)
  const prev = h.past[h.past.length - 1]
  if (prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redo(history: History): History {
  const h = commit(history)
  const [next, ...rest] = h.future
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: rest }
}
