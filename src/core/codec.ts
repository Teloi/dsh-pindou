import { type Board, type BoardSize, isBoardSize } from './board.ts'
import { codeOf, indexOfCode } from './palette.ts'

/**
 * Compact board encoding: one character per cell, row-major, `.` for empty and
 * `0`–`f` for palette indices. A 16×16 board is exactly 256 characters.
 */
export function encode(board: Board): string {
  return board.cells.map(codeOf).join('')
}

/** Same encoding split into `size` rows (the shape the model is asked to produce). */
export function encodeRows(board: Board): string {
  const flat = encode(board)
  const rows: string[] = []
  for (let y = 0; y < board.size; y++) rows.push(flat.slice(y * board.size, (y + 1) * board.size))
  return rows.join('\n')
}

export type DecodeResult =
  | { readonly ok: true; readonly board: Board }
  | { readonly ok: false; readonly error: 'size' | 'length' | 'char' }

/** Strict decode: whitespace between rows is allowed, anything else must be exact. */
export function decode(text: string, size: BoardSize): DecodeResult {
  if (!isBoardSize(size)) return { ok: false, error: 'size' }
  const flat = text.replace(/\s+/g, '')
  if (flat.length !== size * size) return { ok: false, error: 'length' }
  const cells: number[] = []
  for (const ch of flat) {
    const v = indexOfCode(ch)
    if (v === undefined) return { ok: false, error: 'char' }
    cells.push(v)
  }
  return { ok: true, board: { size, cells: Object.freeze(cells) } }
}

/** Share code: `pd1:<size>:<flat>`. */
export function toShareCode(board: Board): string {
  return `pd1:${board.size}:${encode(board)}`
}

export function fromShareCode(code: string): Board | undefined {
  const m = /^pd1:(\d{1,2}):([.0-9a-f]+)$/.exec(code.trim())
  if (!m) return undefined
  const size = Number(m[1])
  if (!isBoardSize(size)) return undefined
  const r = decode(m[2]!, size)
  return r.ok ? r.board : undefined
}
