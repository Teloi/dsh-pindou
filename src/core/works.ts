/**
 * The works wall (spec §18.4, U1): every ironed piece is kept under its own
 * storage key, separate from the game (`dsh-pindou:v1`), so a full or broken
 * wall can never stop the current game from saving.
 *
 * A work is the ironed board's code, its source key, its date and size: under
 * 1 KB each (a 24×24 code is 576 characters), at most 60, oldest dropped first.
 * Its id is the ironing time in ms (unique per wall), which is also its date.
 * A `board:` or `daily:` source up to 16×16 keeps the followed pattern as well, so 再拼一次
 * can follow it again; a 24×24 one follows the piece itself.
 *
 * The entry (game-store.ts) appends and withdraws and only checks ids; this
 * module, part of the wall's lazy chunk, validates: a broken entry is dropped on
 * its own, the rest stay, and the cleaned wall is written back. Before v0.2
 * there is no key at all, which is simply an empty wall.
 */
import type { BoardSize } from './board.ts'

/**
 * board.ts BOARD_SIZES, repeated: this module ships in the lazy chunk, which may
 * not import an entry module (tests/works.test.ts keeps the two equal).
 */
export const WORK_SIZES: readonly number[] = [12, 16, 24]
const isBoardSize = (n: unknown): n is BoardSize => WORK_SIZES.includes(n as number)

/** Same values as storage.ts WORKS_KEY / MAX_WORKS (the entry's copy; tests/works.test.ts keeps them equal). */
export const WORKS_KEY = 'dsh-pindou:works'
export const MAX_WORKS = 60
/** One stored work, JSON-encoded, stays below this many characters (spec: under 1 KB). */
export const MAX_WORK_CHARS = 1000

export interface Work {
  /** Ironing time (ms since epoch); unique on the wall. */
  readonly i: number
  readonly n: BoardSize
  /** The ironed board, encoded like `codec.encode`. */
  readonly b: string
  /** Source key (spec v1.6 §4.3), null for free play. */
  readonly s: string | null
  /** The followed pattern of a `board:` source, when it differs from `b`. */
  readonly p?: string
}

const SOURCE_RE = /^(template|board|daily):[a-z0-9-]{1,32}$/
const codeOk = (v: unknown, n: number): v is string => typeof v === 'string' && v.length === n * n && /^[.0-9a-f]*$/.test(v)

/** One stored entry, or null when any part of it is broken. */
export function parseWork(raw: unknown): Work | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const { i, n, b, s, p } = r
  if (!Number.isSafeInteger(i) || (i as number) <= 0 || !isBoardSize(n) || !codeOk(b, n)) return null
  if (s !== null && !(typeof s === 'string' && SOURCE_RE.test(s))) return null
  if (p !== undefined && !(typeof s === 'string' && /^(board|daily):/.test(s) && codeOk(p, n))) return null
  if (JSON.stringify(raw).length >= MAX_WORK_CHARS) return null
  return p === undefined ? { i: i as number, n, b, s } : { i: i as number, n, b, s, p }
}

/**
 * Untrusted JSON → the wall, oldest first. Broken entries (and repeated ids)
 * are dropped one by one; `dropped` says whether anything was.
 */
export function parseWorks(json: string | null): { works: Work[]; dropped: boolean } {
  if (json === null) return { works: [], dropped: false }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { works: [], dropped: true } }
  return cleanWorks(raw)
}

/** The wall as the entry holds it (or anything else) → valid works only, oldest first. */
export function cleanWorks(raw: unknown): { works: Work[]; dropped: boolean } {
  if (!Array.isArray(raw)) return { works: [], dropped: true }
  const seen = new Set<number>()
  const works: Work[] = []
  for (const item of raw) {
    const w = parseWork(item)
    if (w && !seen.has(w.i)) { seen.add(w.i); works.push(w) }
  }
  works.sort((a, b) => a.i - b.i)
  return { works: works.slice(-MAX_WORKS), dropped: works.length !== raw.length || works.length > MAX_WORKS || works.some((w, k) => w.i !== (raw[k] as { i?: unknown } | null)?.i) }
}

/** Add a work (kept in id order); past 60 the oldest go. */
export function addWork(wall: readonly Work[], w: Work): Work[] {
  return [...wall.filter(x => x.i !== w.i), w].toSorted((a, b) => a.i - b.i).slice(-MAX_WORKS)
}

export function removeWork(wall: readonly Work[], id: number): Work[] {
  return wall.filter(x => x.i !== id)
}
