import { type Board, type BoardSize, createBoard, DEFAULT_SIZE, isBoardSize } from './board.ts'
import { decode, encode } from './codec.ts'
import { isColorIndex } from './palette.ts'

/** The subset of the Web Storage API we use; anything can throw. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const STORAGE_KEY = 'dsh-pindou:v1'
/** Hard cap on what we write; a full board is ~600 bytes, the cache a few KB. */
export const MAX_STORED_CHARS = 64 * 1024

export type Tool = 'paint' | 'pick' | 'erase'
export type Mode = 'free' | 'templates' | 'ai'

export interface Prefs {
  readonly busyHint: boolean
  readonly showGuide: boolean
}

export interface SavedState {
  readonly board: Board
  readonly color: number
  readonly tool: Tool
  readonly mode: Mode
  /** Built-in template id, or `ai:<size>:<flat>` for a generated pattern. */
  readonly target: string | null
  readonly ironed: boolean
  readonly prefs: Prefs
}

export const DEFAULT_PREFS: Prefs = { busyHint: true, showGuide: true }

export function defaultState(size: BoardSize = DEFAULT_SIZE): SavedState {
  return { board: createBoard(size), color: 4, tool: 'paint', mode: 'free', target: null, ironed: false, prefs: DEFAULT_PREFS }
}

const TOOLS: readonly Tool[] = ['paint', 'pick', 'erase']
const MODES: readonly Mode[] = ['free', 'templates', 'ai']

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
  if (isBoardSize(r['size']) && typeof r['board'] === 'string') {
    const d = decode(r['board'], r['size'])
    if (d.ok) board = d.board
    else corrupt = true
  } else {
    corrupt = true
  }
  const prefsRaw = (typeof r['prefs'] === 'object' && r['prefs'] !== null ? r['prefs'] : {}) as Record<string, unknown>
  const state: SavedState = {
    board,
    color: isColorIndex(r['color']) ? r['color'] : fallback.color,
    tool: TOOLS.includes(r['tool'] as Tool) ? (r['tool'] as Tool) : fallback.tool,
    mode: MODES.includes(r['mode'] as Mode) ? (r['mode'] as Mode) : fallback.mode,
    target: typeof r['target'] === 'string' && r['target'].length <= 700 ? r['target'] : null,
    ironed: r['ironed'] === true,
    prefs: {
      busyHint: typeof prefsRaw['busyHint'] === 'boolean' ? prefsRaw['busyHint'] : DEFAULT_PREFS.busyHint,
      showGuide: typeof prefsRaw['showGuide'] === 'boolean' ? prefsRaw['showGuide'] : DEFAULT_PREFS.showGuide,
    },
  }
  return { state, corrupt }
}

export function serializeState(state: SavedState): string {
  return JSON.stringify({
    v: 1,
    size: state.board.size,
    board: encode(state.board),
    color: state.color,
    tool: state.tool,
    mode: state.mode,
    target: state.target,
    ironed: state.ironed,
    prefs: state.prefs,
  })
}

export type StorageStatus = 'ok' | 'unavailable' | 'recovered'

/**
 * Storage that never throws: reads and writes degrade to memory when the
 * browser refuses (private mode, quota, disabled cookies, sandboxing).
 */
export class SafeStore {
  private memory = new Map<string, string>()
  status: StorageStatus = 'ok'

  constructor(private readonly backend: StorageLike | undefined) {
    if (backend === undefined) this.status = 'unavailable'
    else {
      try {
        const probe = `${STORAGE_KEY}:probe`
        backend.setItem(probe, '1')
        backend.removeItem(probe)
      } catch {
        this.status = 'unavailable'
      }
    }
  }

  get(key: string): string | null {
    if (this.status !== 'unavailable' && this.backend) {
      try { return this.backend.getItem(key) } catch { this.status = 'unavailable' }
    }
    return this.memory.get(key) ?? null
  }

  set(key: string, value: string): boolean {
    if (value.length > MAX_STORED_CHARS) return false
    this.memory.set(key, value)
    if (this.status === 'unavailable' || !this.backend) return false
    try {
      this.backend.setItem(key, value)
      return true
    } catch {
      this.status = 'unavailable'
      return false
    }
  }

  remove(key: string): void {
    this.memory.delete(key)
    try { this.backend?.removeItem(key) } catch { /* ignore */ }
  }

  loadState(): SavedState {
    const { state, corrupt } = parseState(this.get(STORAGE_KEY))
    if (corrupt) {
      if (this.status === 'ok') this.status = 'recovered'
      this.remove(STORAGE_KEY)
    }
    return state
  }

  saveState(state: SavedState): boolean {
    return this.set(STORAGE_KEY, serializeState(state))
  }
}

/** Resolve `window.localStorage` without throwing (access itself can throw). */
export function browserStorage(): StorageLike | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage
  } catch {
    return undefined
  }
}
