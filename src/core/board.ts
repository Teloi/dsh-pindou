import { EMPTY, isColorIndex } from './palette.ts'

/** Square sizes the board UI offers today (the v0.3 size tiers come with the canvas, plan §2.2). */
export const BOARD_SIZES = [12, 16, 24] as const
export type BoardSize = (typeof BOARD_SIZES)[number]
export const DEFAULT_SIZE: BoardSize = 16

/**
 * Sides the data layer accepts (plan §2.3, decision 4): 8–208 cells, width and
 * height independent. 208 × 208 = 43,264 cells is the largest board.
 */
export const MIN_SIDE = 8
export const MAX_SIDE = 208

export function isBoardSize(value: unknown): value is BoardSize {
  return BOARD_SIZES.includes(value as BoardSize)
}

/** A 12/16/24 square: the only boards v0.2 can open (`dsh-pindou:v1`, the works wall). */
export const isClassic = (b: { readonly w: number; readonly h: number }): boolean => b.w === b.h && isBoardSize(b.w)

/** A width or height the data layer accepts. */
export function isSide(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_SIDE && (value as number) <= MAX_SIDE
}

/** An immutable `w × h` board. `cells[y * w + x]` is a colour index or EMPTY. */
export interface Board {
  readonly w: number
  readonly h: number
  readonly cells: readonly number[]
}

/** A blank board; `h` defaults to `w` (square). */
export function createBoard(w: number = DEFAULT_SIZE, h = w): Board {
  return { w, h, cells: Object.freeze(Array.from({ length: w * h }, () => EMPTY)) }
}

export function inBounds(board: Board, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < board.w && y < board.h
}

export function getCell(board: Board, x: number, y: number): number {
  return inBounds(board, x, y) ? board.cells[y * board.w + x]! : EMPTY
}

/**
 * Set one cell. Returns the same board object when nothing changes, which lets
 * callers (history, React) skip work for no-op paints during a drag.
 */
export function setCell(board: Board, x: number, y: number, value: number): Board {
  return paintLine(board, x, y, x, y, value)
}

/** Cells on the straight line between two points (Bresenham), so fast drags leave no gaps. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (let guard = 0; guard < 4096; guard++) {
    out.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return out
}

/**
 * Paint the line between two cells. The cells are copied once per call, not
 * once per cell, so a fast drag on a 208² board stays cheap; the same board
 * comes back when nothing changes.
 */
export function paintLine(board: Board, x0: number, y0: number, x1: number, y1: number, value: number): Board {
  const v = isColorIndex(value) ? value : EMPTY
  let cells: number[] | undefined
  for (const [x, y] of lineCells(x0, y0, x1, y1)) {
    const i = y * board.w + x
    if (inBounds(board, x, y) && (cells ?? board.cells)[i] !== v) (cells ??= board.cells.slice())[i] = v
  }
  return cells ? { ...board, cells: Object.freeze(cells) } : board
}

/** 4-connected flood fill from (x, y); returns the same board when nothing changes. */
export function floodFill(board: Board, x: number, y: number, value: number): Board {
  if (!inBounds(board, x, y)) return board
  const { w, h } = board
  const from = board.cells[y * w + x]
  if (from === value) return board
  const cells = [...board.cells]
  const stack = [y * w + x]
  while (stack.length > 0) {
    const i = stack.pop()!
    if (cells[i] !== from) continue
    cells[i] = value
    const cx = i % w
    if (cx > 0) stack.push(i - 1)
    if (cx < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < w * (h - 1)) stack.push(i + w)
  }
  return { ...board, cells: Object.freeze(cells) }
}

export function clearBoard(board: Board): Board {
  return board.cells.every(c => c === EMPTY) ? board : createBoard(board.w, board.h)
}

export function countBeads(board: Board): number {
  let n = 0
  for (const c of board.cells) if (c !== EMPTY) n++
  return n
}

export function isEmpty(board: Board): boolean {
  return countBeads(board) === 0
}

/** Resize to `w × h` (default square) keeping the drawing centred; cells that fall outside are dropped. */
export function resizeBoard(board: Board, w: number, h = w): Board {
  if (w === board.w && h === board.h) return board
  const ox = Math.floor((w - board.w) / 2)
  const oy = Math.floor((h - board.h) / 2)
  const cells = createBoard(w, h).cells.slice()
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      const nx = x + ox
      const ny = y + oy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) cells[ny * w + nx] = board.cells[y * board.w + x]!
    }
  }
  return { w, h, cells: Object.freeze(cells) }
}

/** Structural validation of untrusted data (e.g. from storage). */
export function isBoard(value: unknown): value is Board {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { w?: unknown; h?: unknown; cells?: unknown }
  return isSide(v.w) && isSide(v.h) && Array.isArray(v.cells) && v.cells.length === v.w * v.h
    && v.cells.every(c => c === EMPTY || isColorIndex(c))
}

/** Same width and height. */
export function sameShape(a: Board, b: Board): boolean {
  return a.w === b.w && a.h === b.h
}

/** An `n × n` board (the square UI sizes). */
export function isSquareOf(board: Board, n: number): boolean {
  return board.w === n && board.h === n
}

export function boardsEqual(a: Board, b: Board): boolean {
  return sameShape(a, b) && a.cells.every((c, i) => c === b.cells[i])
}
