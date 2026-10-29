import { type Board, type BoardSize, countBeads, isBoardSize } from './board.ts'
import { EMPTY, indexOfCode } from './palette.ts'

/** What had to be fixed to turn model output into a board. */
export type RepairIssue =
  | 'trimmed-input'
  | 'stripped-wrapper'
  | 'uppercase'
  | 'invalid-chars'
  | 'row-length'
  | 'missing-rows'
  | 'extra-rows'
  | 'single-line'

export type RepairResult =
  | { readonly ok: true; readonly board: Board; readonly issues: readonly RepairIssue[]; readonly repaired: boolean }
  | { readonly ok: false; readonly error: 'not-text' | 'no-grid' | 'too-sparse' | 'too-damaged' }

/** Upper bound on the text we even look at; anything beyond is ignored. */
export const MAX_RAW_CHARS = 16_384

const EMPTY_ALIASES = new Set(['.', '-', '_', '·', '•', '○', '□', '⬜'])
const SEPARATORS = /[\s,|;`'"[\]]/g

function normaliseLine(line: string): string {
  return line.replace(SEPARATORS, '')
}

function gridRatio(line: string): number {
  if (line.length === 0) return 0
  let ok = 0
  for (const ch of line) if (indexOfCode(ch) !== undefined || EMPTY_ALIASES.has(ch)) ok++
  return ok / line.length
}

/**
 * Turn untrusted model output into a board, repairing what can be repaired:
 * code fences, reasoning wrappers, upper case, separators, wrong row lengths,
 * truncated or surplus rows, and a grid emitted as a single line. The text is
 * only ever mined for grid characters; nothing from it is rendered or executed.
 */
export function repairGrid(raw: unknown, size: BoardSize): RepairResult {
  if (typeof raw !== 'string' || !isBoardSize(size)) return { ok: false, error: 'not-text' }
  const issues = new Set<RepairIssue>()
  let text = raw
  if (text.length > MAX_RAW_CHARS) { text = text.slice(0, MAX_RAW_CHARS); issues.add('trimmed-input') }

  const unwrapped = text
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/```[a-z]*\n?/gi, '\n')
  if (unwrapped !== text) issues.add('stripped-wrapper')

  const half = Math.ceil(size / 2)
  const candidates = unwrapped.split(/\r?\n/).map(normaliseLine)

  // Longest run of consecutive grid-looking lines.
  let best: string[] = []
  let run: string[] = []
  for (const line of candidates) {
    const lower = line.toLowerCase()
    if (lower.length >= half && gridRatio(lower) >= 0.75) {
      if (lower !== line) issues.add('uppercase')
      run.push(lower)
      if (run.length > best.length) best = run
    } else if (run.length > 0 && lower.length > 0 && gridRatio(lower) >= 0.9) {
      run.push(lower) // a short trailing fragment, typically a truncated last row
      if (run.length > best.length) best = run
    } else if (line.length === 0 && run.length > 0) {
      continue // tolerate blank lines inside the grid
    } else {
      run = []
    }
  }

  let rows = best
  if (rows.length === 1 && rows[0]!.length >= size * half) {
    const flat = rows[0]!
    rows = []
    for (let i = 0; i < flat.length; i += size) rows.push(flat.slice(i, i + size))
    issues.add('single-line')
  }
  if (rows.length < Math.ceil(size / 4)) return { ok: false, error: 'no-grid' }

  if (rows.length > size) { rows = rows.slice(0, size); issues.add('extra-rows') }
  if (rows.length < size) issues.add('missing-rows')

  const cells: number[] = []
  let bad = 0
  for (let y = 0; y < size; y++) {
    const row = rows[y] ?? ''
    if (y < rows.length && row.length !== size) issues.add('row-length')
    for (let x = 0; x < size; x++) {
      const ch = row[x]
      if (ch === undefined) { cells.push(EMPTY); continue }
      const v = indexOfCode(ch)
      if (v !== undefined) cells.push(v)
      else if (EMPTY_ALIASES.has(ch)) cells.push(EMPTY)
      else { cells.push(EMPTY); bad++; issues.add('invalid-chars') }
    }
  }
  if (bad > (size * size) / 4) return { ok: false, error: 'too-damaged' }
  const board: Board = { size, cells: Object.freeze(cells) }
  if (countBeads(board) < Math.max(3, Math.floor(size / 2))) return { ok: false, error: 'too-sparse' }
  const list = [...issues]
  return { ok: true, board, issues: list, repaired: list.some(i => i !== 'stripped-wrapper') }
}
