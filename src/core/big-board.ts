/**
 * Board helpers for the big-board chunk (client.big.js). A lazy chunk must not
 * share a module with the entry (scripts/async-chunks.ts), so this file and
 * everything client.big.js pulls in import nothing the first screen imports:
 * the few constants are repeated here and tests/big-board.test.ts holds them
 * equal to board.ts / palette.ts / history.ts.
 */
import type { Board } from './board.ts'

export const MIN_SIDE = 8
export const MAX_SIDE = 208
export const EMPTY = -1
export const COLOR_COUNT = 16
export const HISTORY_LIMIT = 100

export const isSide = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_SIDE && (v as number) <= MAX_SIDE

export const sameShape = (a: Board, b: Board): boolean => a.w === b.w && a.h === b.h

export function blank(w: number, h: number): Board {
  return { w, h, cells: Object.freeze(Array.from<number>({ length: w * h }).fill(EMPTY)) }
}

/**
 * Set many cells at once (indices into `cells`); the same board comes back
 * when nothing changes, so a stroke that repaints its own cells costs nothing.
 */
export function setCells(board: Board, idx: Iterable<number>, value: number): Board {
  let cells: number[] | undefined
  for (const i of idx) {
    if (i >= 0 && i < board.cells.length && (cells ?? board.cells)[i] !== value) (cells ??= board.cells.slice())[i] = value
  }
  return cells ? { ...board, cells: Object.freeze(cells) } : board
}

/** Cell indices on the line between two cells (Bresenham), so fast drags leave no gaps. */
export function lineIdx(w: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = []
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (let g = 0; g < 512; g++) {
    out.push(y0 * w + x0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  return out
}

/** Indices of the 4-connected region of cells equal to the one at `start`. */
export function regionIdx(board: Board, start: number): number[] {
  const { w, h, cells } = board
  const from = cells[start]
  const seen = new Uint8Array(w * h)
  const out: number[] = []
  const stack = [start]
  while (stack.length > 0) {
    const i = stack.pop()!
    if (seen[i] || cells[i] !== from) continue
    seen[i] = 1
    out.push(i)
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (h - 1)) stack.push(i + w)
  }
  return out
}
