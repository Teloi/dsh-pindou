import { type Board, type BoardSize, createBoard, DEFAULT_SIZE, isBoardSize, isClassic } from './board.ts'
import { decode, encode } from './codec.ts'
import { isColorIndex } from './palette.ts'

/** The subset of the Web Storage API we use; anything can throw. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const STORAGE_KEY = 'dsh-pindou:v1'
/** Where a save that did not parse is kept (the latest one), instead of being thrown away. */
export const BAD_SAVE_KEY = 'dsh-pindou:v1:unreadable'
/** Hard cap on what we write; a full board is ~600 bytes, the cache a few KB. */
export const MAX_STORED_CHARS = 64 * 1024

export type Tool = 'paint' | 'erase' | 'pick' | 'fill'
/** Which view the panel shows: start page, the board, or the AI prompt. */
export type Mode = 'home' | 'play' | 'ai'

export interface Prefs {
  readonly busyHint: boolean
  readonly showGuide: boolean
  /** Print colour codes on swatches and guide cells (helps colour-blind players). */
  readonly showCodes: boolean
}

export interface SavedState {
  readonly board: Board
  readonly color: number
  readonly tool: Tool
  readonly mode: Mode
  /**
   * Source key of the board (spec v1.6 §4.3): `template:<id>`, `board:<board id>`
   * for a generated or imported pattern, or null for free play.
   */
  readonly target: string | null
  /** The followed pattern of a `board:` source, encoded like `board` (same size). */
  readonly pattern: string | null
  readonly ironed: boolean
  readonly prefs: Prefs
  /** Built-in templates finished at least once. */
  readonly done: readonly string[]
  /** Whether the first-run coach card was dismissed. */
  readonly coached: boolean
  /** Id of this game's piece on the works wall (core/works.ts) while it is ironed, so un-ironing takes it back. */
  readonly work: number | null
}

/**
 * The works wall (spec §18.4) under its own key, so it can never stop the game
 * from saving. The entry appends and withdraws; the wall page (core/works.ts,
 * in the lazy chunk) validates. Max 60, oldest first.
 */
export const WORKS_KEY = 'dsh-pindou:works'
export const MAX_WORKS = 60
/** A work as stored: id = ironing time (ms), size, ironed code, source key, and a `board:` source's pattern. */
export interface StoredWork {
  readonly i: number
  readonly n: BoardSize
  readonly b: string
  readonly s: string | null
  readonly p?: string
}

export const DEFAULT_PREFS: Prefs = { busyHint: true, showGuide: true, showCodes: false }

export function defaultState(size: BoardSize = DEFAULT_SIZE): SavedState {
  return { board: createBoard(size), color: 4, tool: 'paint', mode: 'home', target: null, pattern: null, ironed: false, prefs: DEFAULT_PREFS, done: [], coached: false, work: null }
}

const TOOLS: readonly Tool[] = ['paint', 'erase', 'pick', 'fill']
const MODES: readonly Mode[] = ['home', 'play', 'ai']
const ID_RE = /^[a-z0-9-]{1,32}$/

/** Source key of a built-in template (spec v1.6 §4.3). */
export const templateKey = (id: string): string => `template:${id}`
/** The template id of a source key, or null for `board:` sources and free play. */
export const templateIdOf = (key: string | null): string | null => key?.startsWith('template:') ? key.slice(9) : null

/**
 * Source key and pattern from saved data. Data written before v1.6 keeps a
 * bare template id (→ `template:<id>`) or a content key `ai:<size>:<flat>`
 * (→ `board:legacy` with that pattern; a size mismatch fails to decode later).
 */
function parseSource(raw: unknown, pattern: unknown): { target: string | null; pattern: string | null } {
  const t = typeof raw === 'string' ? raw : ''
  const p = typeof pattern === 'string' && pattern.length <= 700 ? pattern : null
  if (ID_RE.test(t)) return { target: templateKey(t), pattern: null }
  const m = /^(template|board):[a-z0-9-]{1,32}$/.exec(t)
  if (m) return { target: m[1] === 'board' && p === null ? null : t, pattern: m[1] === 'board' ? p : null }
  const legacy = /^ai:\d+:([.0-9a-f]{1,700})$/.exec(t)
  return { target: legacy ? 'board:legacy' : null, pattern: legacy?.[1] ?? null }
}

/** Parse untrusted JSON into a state; anything invalid falls back field by field. */
export function parseState(json: string | null): { state: SavedState; corrupt: boolean } {
  const fallback = defaultState()
  if (json === null) return { state: fallback, corrupt: false }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { state: fallback, corrupt: true } }
  if (typeof raw !== 'object' || raw === null) return { state: fallback, corrupt: true }
  const r = raw as Record<string, unknown>
  let corrupt = false
  let board = fallback.board
  // v2 saves have `size` (square); v3 adds `h` for w × h boards, `size` stays the width.
  // decode() refuses any side outside 8–208 (a `size` error), which marks the save corrupt.
  // This key only ever holds a first-screen board (12, 16 or 24 square); any other shape
  // decodes but would crash the DOM board, so it counts as unreadable too: backed up, not rendered.
  const w = r['size']
  if (typeof w === 'number' && typeof r['board'] === 'string') {
    const d = decode(r['board'], w, typeof r['h'] === 'number' ? r['h'] : w)
    if (d.ok && d.board.h === w && isBoardSize(w)) board = d.board
    else corrupt = true
  } else {
    corrupt = true
  }
  // anything but an object just has no booleans to read (a string or number reads undefined)
  const prefsRaw = (r['prefs'] ?? {}) as Record<string, unknown>
  const state: SavedState = {
    board,
    color: isColorIndex(r['color']) ? r['color'] : fallback.color,
    tool: TOOLS.includes(r['tool'] as Tool) ? (r['tool'] as Tool) : fallback.tool,
    mode: MODES.includes(r['mode'] as Mode) ? (r['mode'] as Mode) : fallback.mode,
    ...parseSource(r['target'], r['pattern']),
    ironed: r['ironed'] === true,
    // each known pref: the stored boolean, else its default (unknown keys are dropped)
    prefs: Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([k, v]) => [k, typeof prefsRaw[k] === 'boolean' ? prefsRaw[k] : v])) as unknown as Prefs,
    done: Array.isArray(r['done'])
      ? [...new Set(r['done'].filter((id): id is string => typeof id === 'string' && ID_RE.test(id)))].slice(0, 64)
      : [],
    coached: r['coached'] === true,
    work: r['ironed'] === true && Number.isSafeInteger(r['work']) ? r['work'] as number : null,
  }
  return { state, corrupt }
}

export function serializeState({ board, ...rest }: SavedState): string {
  // the width keeps the v2 name (`size`), so a square save still opens in older versions;
  // the rest keeps SavedState's key order (color … work), so the string is the one written before
  return JSON.stringify({ v: 3, size: board.w, h: board.h, board: encode(board), ...rest })
}

export type StorageStatus = 'ok' | 'unavailable' | 'recovered'

/**
 * Storage that never throws: reads and writes degrade to memory when the
 * browser refuses (private mode, quota, disabled cookies, sandboxing).
 */
export class SafeStore {
  readonly #memory = new Map<string, string>()
  readonly #backend: StorageLike | undefined
  /** An unreadable save could not be backed up: it stays, and this session does not save over it (audit A1-5). */
  #hold = false
  status: StorageStatus = 'ok'

  constructor(backend: StorageLike | undefined) {
    this.#backend = backend
    // no backend throws here too
    try {
      backend!.setItem(STORAGE_KEY + ':probe', '1')
      backend!.removeItem(STORAGE_KEY + ':probe')
    } catch {
      this.status = 'unavailable'
    }
  }

  get(key: string): string | null {
    if (this.status !== 'unavailable' && this.#backend) {
      try { return this.#backend.getItem(key) } catch { this.status = 'unavailable' }
    }
    return this.#memory.get(key) ?? null
  }

  /**
   * A refused write marks storage unavailable, except for a `side` key (the
   * works wall): its refusal (quota) must never stop the game from saving.
   */
  set(key: string, value: string, side = false): boolean {
    if (value.length > MAX_STORED_CHARS && !side) return false
    this.#memory.set(key, value)
    if (this.status === 'unavailable' || !this.#backend) return false
    try {
      this.#backend.setItem(key, value)
      return true
    } catch {
      if (!side) this.status = 'unavailable'
      return false
    }
  }

  remove(key: string): void {
    this.#memory.delete(key)
    try { this.#backend?.removeItem(key) } catch { /* ignore */ }
  }

  loadState(): SavedState {
    const { state, corrupt } = parseState(this.get(STORAGE_KEY))
    if (corrupt) this.setAside()
    return state
  }

  /**
   * Keep the save for a later version (or a human) and start over (an unreadable save, a reset after a crash).
   * True only when a backup was really written (the crash toast may then say so).
   */
  setAside(): boolean {
    const raw = this.get(STORAGE_KEY)
    if (raw === null) return false
    if (this.status === 'ok') this.status = 'recovered'
    // three backups, newest first (`…:unreadable`, `:2`, `:3`); each shifts down one, the oldest drops off.
    // Shifted from the old end, so a slot is reused only once its backup has a verified copy one down:
    // a refused write stops there with every backup still stored, and the original stays put (audit phase 2).
    // How many shift: up to the first empty slot; none when the newest already has its copy one down
    // (a rotation that stopped at its last write). A backup is written whatever its size.
    const keys = ['', ':2', ':3'].map(n => BAD_SAVE_KEY + n)
    const olds = keys.map(k => this.get(k))
    let k = olds[0] === olds[1] ? 0 : Math.min(2, olds.indexOf(null) >>> 0)
    while (k && this.set(keys[k]!, olds[k - 1]!, true)) k--
    if (k || !this.set(keys[0]!, raw, true)) { this.#hold = true; return false }
    this.remove(STORAGE_KEY)
    return true
  }

  /** Only a 12/16/24 square ever goes to `dsh-pindou:v1` (review I-2: v0.2 cannot open anything else); big boards save via save-store. */
  saveState(state: SavedState): boolean {
    return isClassic(state.board) && !this.#hold && this.set(STORAGE_KEY, serializeState(state))
  }
}

/** Resolve `window.localStorage` without throwing (access itself can throw). */
export function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
