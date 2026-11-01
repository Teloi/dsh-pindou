import { type Board, isBoardSize, isSide } from './board.ts'
import { codeOf, indexOfCode } from './palette.ts'

/**
 * Compact board encoding: one character per cell, row-major, `.` for empty and
 * `0`–`f` for palette indices. A 16×16 board is exactly 256 characters. The
 * compressed `pd2` form for big boards lives in codec-v4.ts (lazy chunk).
 */
export function encode(board: Board): string {
  return board.cells.map(codeOf).join('')
}

/** Same encoding split into `h` rows (the shape the model is asked to produce). */
export function encodeRows(board: Board): string {
  const flat = encode(board)
  const rows: string[] = []
  for (let y = 0; y < board.h; y++) rows.push(flat.slice(y * board.w, (y + 1) * board.w))
  return rows.join('\n')
}

export type DecodeResult =
  | { readonly ok: true; readonly board: Board }
  | { readonly ok: false; readonly error: 'size' | 'length' | 'char' }

/** Strict decode of a `w × h` board (`h` defaults to `w`): whitespace between rows is allowed, anything else must be exact. */
export function decode(text: string, w: number, h = w): DecodeResult {
  if (!isSide(w) || !isSide(h)) return { ok: false, error: 'size' }
  const flat = text.replace(/\s+/g, '')
  if (flat.length !== w * h) return { ok: false, error: 'length' }
  const cells: number[] = []
  for (const ch of flat) {
    const v = indexOfCode(ch)
    if (v === undefined) return { ok: false, error: 'char' }
    cells.push(v)
  }
  return { ok: true, board: { w, h, cells: Object.freeze(cells) } }
}

/** Share code v1: `pd1:<size>:<flat>`, square UI sizes only (`pd2` covers w × h, codec-v4.ts). */
export function toShareCode(board: Board): string {
  return `pd1:${board.w}:${encode(board)}`
}

export function fromShareCode(code: string): Board | undefined {
  const m = /^pd1:(\d{1,2}):([.0-9a-f]+)$/.exec(code.trim())
  if (!m) return undefined
  const size = Number(m[1])
  if (!isBoardSize(size)) return undefined
  const r = decode(m[2]!, size)
  return r.ok ? r.board : undefined
}
