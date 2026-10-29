import { EMPTY, isColorIndex } from './palette.ts'

export const BOARD_SIZES = [12, 16, 24] as const
export type BoardSize = (typeof BOARD_SIZES)[number]
export const DEFAULT_SIZE: BoardSize = 16

export function isBoardSize(value: unknown): value is BoardSize {
  return BOARD_SIZES.includes(value as BoardSize)
}

/** An immutable square board. `cells[y * size + x]` is a colour index or EMPTY. */
export interface Board {
  readonly size: BoardSize
  readonly cells: readonly number[]
}

export function createBoard(size: BoardSize = DEFAULT_SIZE): Board {
  return { size, cells: Object.freeze(Array.from({ length: size * size }, () => EMPTY)) }
}

export function inBounds(board: Board, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < board.size && y < board.size
}

export function getCell(board: Board, x: number, y: number): number {
  return inBounds(board, x, y) ? board.cells[y * board.size + x]! : EMPTY
}

/**
 * Set one cell. Returns the same board object when nothing changes, which lets
 * callers (history, React) skip work for no-op paints during a drag.
 */
export function setCell(board: Board, x: number, y: number, value: number): Board {
  if (!inBounds(board, x, y)) return board
  const v = isColorIndex(value) ? value : EMPTY
  const i = y * board.size + x
  if (board.cells[i] === v) return board
  const cells = board.cells.slice()
  cells[i] = v
  return { size: board.size, cells: Object.freeze(cells) }
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

export function paintLine(board: Board, x0: number, y0: number, x1: number, y1: number, value: number): Board {
  let next = board
  for (const [x, y] of lineCells(x0, y0, x1, y1)) next = setCell(next, x, y, value)
  return next
}

/** 4-connected flood fill from (x, y); returns the same board when nothing changes. */
export function floodFill(board: Board, x: number, y: number, value: number): Board {
  if (!inBounds(board, x, y)) return board
  const { size } = board
  const from = board.cells[y * size + x]
  if (from === value) return board
  const cells = [...board.cells]
  const stack = [y * size + x]
  while (stack.length > 0) {
    const i = stack.pop()!
    if (cells[i] !== from) continue
    cells[i] = value
    const cx = i % size
    if (cx > 0) stack.push(i - 1)
    if (cx < size - 1) stack.push(i + 1)
    if (i >= size) stack.push(i - size)
    if (i < size * (size - 1)) stack.push(i + size)
  }
  return { size, cells: Object.freeze(cells) }
}

export function clearBoard(board: Board): Board {
  return board.cells.every(c => c === EMPTY) ? board : createBoard(board.size)
}

export function countBeads(board: Board): number {
  let n = 0
  for (const c of board.cells) if (c !== EMPTY) n++
  return n
}

export function isEmpty(board: Board): boolean {
  return countBeads(board) === 0
}

/** Resize keeping the drawing centred; cells that fall outside are dropped. */
export function resizeBoard(board: Board, size: BoardSize): Board {
  if (size === board.size) return board
  const offset = Math.floor((size - board.size) / 2)
  let next = createBoard(size)
  const cells = next.cells.slice()
  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const nx = x + offset
      const ny = y + offset
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) cells[ny * size + nx] = board.cells[y * board.size + x]!
    }
  }
  next = { size, cells: Object.freeze(cells) }
  return next
}

/** Structural validation of untrusted data (e.g. from storage). */
export function isBoard(value: unknown): value is Board {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { size?: unknown; cells?: unknown }
  return isBoardSize(v.size) && Array.isArray(v.cells) && v.cells.length === v.size * v.size
    && v.cells.every(c => c === EMPTY || isColorIndex(c))
}

export function boardsEqual(a: Board, b: Board): boolean {
  return a.size === b.size && a.cells.every((c, i) => c === b.cells[i])
}
