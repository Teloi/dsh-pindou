/**
 * Big-board saves (plan §4.3): IndexedDB first, localStorage as the fallback.
 *
 *   IDB opens          → every save goes to IDB (`saves` store, one record per
 *                        game), `navigator.storage.persist()` is asked once.
 *   IDB cannot open    → boards whose longer side is ≤ 58 go to localStorage
 *                        (`dsh-pindou:save:<id>`, a pd2 code, < 1 KB compressed);
 *                        bigger boards stay playable but are not saved, and
 *                        the result says so (`unsaved-too-big`) for the UI's
 *                        「此环境无法保存大图进度…」 notice.
 *
 * Migration never loses data: a localStorage copy (a fallback save from an
 * earlier session, or the v0.2 game save) is copied into IDB, read back and
 * compared, and only a fallback copy is then removed. The game save
 * (`dsh-pindou:v1`) is the first screen's own and stays (plan: the small
 * current board lives in localStorage); IDB gets a verified copy of it. A
 * save that does not parse is never touched.
 *
 * Saves are pd2 codes (codec-v4.ts), so encoding is async. Everything
 * environmental (IDB factory, storage, persist) is injected; the module is
 * not exported from core/index.ts and costs the first screen nothing (it goes
 * into client.big.js in phase 2).
 */
import type { Board } from './board.ts'
import { decodeV4, encodeV4 } from './codec-v4.ts'
import type { StorageLike } from './storage.ts'

export const DB_NAME = 'dsh-pindou'
export const DB_VERSION = 1
export const SAVES = 'saves'
/** localStorage key prefix of fallback saves. */
export const LOCAL_SAVE_PREFIX = 'dsh-pindou:save:'
/** The longest side a fallback (localStorage) save may have (plan §4.3). */
export const LOCAL_MAX_SIDE = 58
/** Soft cap on everything in IDB (plan §4.3): past it the store reports `nearFull`. */
export const SOFT_CAP_BYTES = 4 * 1024 * 1024
/** The id the migrated v0.2 game save gets in IDB. */
export const LEGACY_ID = 'legacy-v1'
const ID_RE = /^[\w-]{1,64}$/

export interface SaveRecord {
  readonly id: string
  /** pd2 code of the board. */
  readonly code: string
  readonly w: number
  readonly h: number
  /** ms since epoch. */
  readonly at: number
  /** Opaque JSON-safe extras (target, colour, …), at most 4 KB as JSON. */
  readonly meta?: unknown
}

/** Where saves go in this environment. */
export type SaveBackend = 'idb' | 'local' | 'memory'
export type SaveResult =
  | { readonly ok: true; readonly where: 'idb' | 'local'; readonly bytes: number }
  | { readonly ok: false; readonly reason: 'unsaved-too-big' | 'no-storage' | 'bad-id' | 'too-big-meta' | 'write-failed' }

export interface StoreStatus {
  readonly backend: SaveBackend
  /** `navigator.storage.persist()` said yes (best effort; false is normal, Q14). */
  readonly persisted: boolean
  /** Bytes in IDB, and whether they pass the 4 MB soft cap. */
  readonly bytes: number
  readonly nearFull: boolean
}

/** The notice for a big board that cannot be saved here (plan §4.3). */
export const UNSAVED_TOO_BIG = {
  zh: '此环境无法保存大图进度，关闭面板后会丢失。建议选 58×58 以内，或完成后导出图片。',
  en: 'Progress on big boards can’t be saved here and is lost when the panel closes. Pick 58×58 or smaller, or export an image when done.',
} as const

// —— a promise face over the slice of IndexedDB we use ——

export interface IdbLike {
  open(name: string, version?: number): IDBOpenDBRequest
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.addEventListener('success', () => { resolve(r.result) })
    r.addEventListener('error', () => { reject(r.error ?? new Error('idb request failed')) })
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => { resolve() })
    tx.addEventListener('error', () => { reject(tx.error ?? new Error('idb transaction failed')) })
    tx.addEventListener('abort', () => { reject(tx.error ?? new Error('idb transaction aborted')) })
  })
}

/** Open the database, or undefined when IDB is missing, blocked or broken (never throws). */
export async function openDb(idb: IdbLike | undefined, timeoutMs = 2000): Promise<IDBDatabase | undefined> {
  if (!idb) return undefined
  try {
    const r = idb.open(DB_NAME, DB_VERSION)
    r.addEventListener('upgradeneeded', () => {
      if (!r.result.objectStoreNames.contains(SAVES)) r.result.createObjectStore(SAVES, { keyPath: 'id' })
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<undefined>(resolve => { timer = setTimeout(() => { resolve(undefined) }, timeoutMs) })
    const db = await Promise.race([req(r).catch(() => undefined), timeout])
    clearTimeout(timer)
    return db
  } catch {
    return undefined
  }
}

function isRecord(v: unknown): v is SaveRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r['id'] === 'string' && typeof r['code'] === 'string' && typeof r['w'] === 'number' && typeof r['h'] === 'number' && typeof r['at'] === 'number'
}

const sizeOf = (r: SaveRecord): number => r.code.length + (r.meta === undefined ? 0 : JSON.stringify(r.meta).length)

export interface SaveStoreDeps {
  readonly idb?: IdbLike | undefined
  readonly local?: StorageLike | undefined
  /** `navigator.storage` (its `persist`), when there is one. */
  readonly storageManager?: { persist?: () => Promise<boolean> } | undefined
  readonly now?: () => number
  readonly timeoutMs?: number
  /**
   * The v0.2 game save to copy into IDB on {@link SaveStore.migrate}: its key
   * and the entry's parser (storage.ts `STORAGE_KEY` / `parseState`), passed in
   * because a lazy chunk may not import entry modules. Without it migrate only
   * moves fallback saves.
   */
  readonly legacy?: { readonly key: string; readonly parse: (raw: string) => { readonly board: Board } | undefined } | undefined
}

/** What {@link SaveStore.migrate} did with each localStorage key. */
export interface MigrateReport {
  /** Fallback saves now in IDB (verified) and removed from localStorage. */
  readonly moved: string[]
  /** Copied into IDB (verified) and left in place: the v0.2 game save. */
  readonly copied: string[]
  /** Left alone because the IDB write or the removal failed. */
  readonly kept: string[]
  /** Did not parse: left untouched for a later version or a human. */
  readonly corrupt: string[]
}

export class SaveStore {
  #db: IDBDatabase | undefined
  #persisted = false
  #bytes = 0
  #backendKind: SaveBackend = 'memory'

  readonly #deps: SaveStoreDeps

  private constructor(deps: SaveStoreDeps) { this.#deps = deps }

  /** Open IDB (falls back to localStorage, then memory) and ask for persistence once. */
  static async open(deps: SaveStoreDeps): Promise<SaveStore> {
    const s = new SaveStore(deps)
    s.#db = await openDb(deps.idb, deps.timeoutMs)
    if (s.#db) {
      s.#backendKind = 'idb'
      try { s.#persisted = (await deps.storageManager?.persist?.()) === true } catch { s.#persisted = false }
      try { s.#bytes = (await s.#allIdb()).reduce((n, r) => n + sizeOf(r), 0) } catch { /* counted as 0 */ }
    } else if (s.#localWorks()) {
      s.#backendKind = 'local'
    }
    return s
  }

  status(): StoreStatus {
    return { backend: this.#backendKind, persisted: this.#persisted, bytes: this.#bytes, nearFull: this.#bytes > SOFT_CAP_BYTES }
  }

  /** Can a `w × h` board be saved here at all? (The new-board wizard asks before starting.) */
  canSave(w: number, h: number): boolean {
    return this.#backendKind === 'idb' || (this.#backendKind === 'local' && Math.max(w, h) <= LOCAL_MAX_SIDE)
  }

  async save(id: string, board: Board, meta?: unknown): Promise<SaveResult> {
    if (!ID_RE.test(id)) return { ok: false, reason: 'bad-id' }
    if (meta !== undefined && JSON.stringify(meta).length > 4096) return { ok: false, reason: 'too-big-meta' }
    if (!this.canSave(board.w, board.h)) {
      return { ok: false, reason: this.#backendKind === 'memory' ? 'no-storage' : 'unsaved-too-big' }
    }
    const rec: SaveRecord = { id, code: await encodeV4(board), w: board.w, h: board.h, at: (this.#deps.now ?? Date.now)(), ...(meta === undefined ? {} : { meta }) }
    if (this.#backendKind === 'idb') {
      const ok = await this.#putVerified(rec)
      return ok ? { ok: true, where: 'idb', bytes: sizeOf(rec) } : { ok: false, reason: 'write-failed' }
    }
    try {
      this.#deps.local!.setItem(LOCAL_SAVE_PREFIX + id, JSON.stringify(rec))
      return { ok: true, where: 'local', bytes: sizeOf(rec) }
    } catch {
      return { ok: false, reason: 'write-failed' }
    }
  }

  /** The saved board (and meta), from IDB or the localStorage fallback; undefined when missing or unreadable. */
  async load(id: string): Promise<{ board: Board; meta?: unknown; at: number } | undefined> {
    if (!ID_RE.test(id)) return undefined
    let rec: SaveRecord | undefined
    if (this.#db) {
      try { rec = await this.#getIdb(id) } catch { rec = undefined }
    }
    rec ??= this.#readLocal(id)
    if (!rec) return undefined
    const d = await decodeV4(rec.code)
    if (!d.ok || d.board.w !== rec.w || d.board.h !== rec.h) return undefined
    return { board: d.board, at: rec.at, ...(rec.meta === undefined ? {} : { meta: rec.meta }) }
  }

  async remove(id: string): Promise<void> {
    if (this.#db) {
      try {
        const prev = await this.#getIdb(id)
        const tx = this.#db.transaction(SAVES, 'readwrite')
        tx.objectStore(SAVES).delete(id)
        await done(tx)
        if (prev) this.#bytes = Math.max(0, this.#bytes - sizeOf(prev))
      } catch { /* leave it */ }
    }
    try { this.#deps.local?.removeItem(LOCAL_SAVE_PREFIX + id) } catch { /* ignore */ }
  }

  /**
   * Move localStorage copies into IDB (no-op without IDB). For each one: parse,
   * write, read back, compare; only a verified fallback copy is removed. The v0.2
   * game save is copied (as {@link LEGACY_ID}) but stays where it is.
   */
  async migrate(): Promise<MigrateReport> {
    const out: MigrateReport = { moved: [], copied: [], kept: [], corrupt: [] }
    const local = this.#deps.local
    if (!this.#db || !local) return out
    for (const key of this.#localKeys()) {
      const id = key.slice(LOCAL_SAVE_PREFIX.length)
      const rec = this.#readLocal(id)
      if (!rec || !(await decodeV4(rec.code)).ok) { out.corrupt.push(key); continue }
      const existing = await this.#getIdb(id).catch(() => undefined)
      // a newer IDB save wins; the older local copy is still only dropped once IDB is verified
      if (existing && existing.at >= rec.at && (await decodeV4(existing.code)).ok) {
        this.#dropLocal(key, out)
        continue
      }
      if (await this.#putVerified(rec)) this.#dropLocal(key, out)
      else out.kept.push(key)
    }
    const legacy = this.#deps.legacy
    const raw = legacy ? this.#safeGet(legacy.key) : null
    if (legacy && raw !== null) {
      const state = legacy.parse(raw)
      if (!state) out.corrupt.push(legacy.key)
      else {
        const rec: SaveRecord = { id: LEGACY_ID, code: await encodeV4(state.board), w: state.board.w, h: state.board.h, at: (this.#deps.now ?? Date.now)(), meta: { v1: raw.length <= 64 * 1024 ? raw : null } }
        // copied or not, the game save stays: the first screen reads it
        const copied = await this.#putVerified(rec)
        if (copied) out.copied.push(legacy.key)
        else out.kept.push(legacy.key)
      }
    }
    return out
  }

  // —— internals ——

  #dropLocal(key: string, out: MigrateReport): void {
    try { this.#deps.local!.removeItem(key); out.moved.push(key) } catch { out.kept.push(key) }
  }

  async #putVerified(rec: SaveRecord): Promise<boolean> {
    if (!this.#db) return false
    try {
      const prev = await this.#getIdb(rec.id)
      const tx = this.#db.transaction(SAVES, 'readwrite')
      tx.objectStore(SAVES).put(rec)
      await done(tx)
      const back = await this.#getIdb(rec.id)
      const ok = back !== undefined && back.code === rec.code && back.w === rec.w && back.h === rec.h && back.at === rec.at
        && JSON.stringify(back.meta) === JSON.stringify(rec.meta)
      if (ok) this.#bytes += sizeOf(rec) - (prev ? sizeOf(prev) : 0)
      return ok
    } catch {
      return false
    }
  }

  async #getIdb(id: string): Promise<SaveRecord | undefined> {
    const tx = this.#db!.transaction(SAVES, 'readonly')
    const v: unknown = await req(tx.objectStore(SAVES).get(id))
    return isRecord(v) ? v : undefined
  }

  async #allIdb(): Promise<SaveRecord[]> {
    const tx = this.#db!.transaction(SAVES, 'readonly')
    const all: unknown[] = await req(tx.objectStore(SAVES).getAll())
    return all.filter(isRecord)
  }

  #safeGet(key: string): string | null {
    try { return this.#deps.local?.getItem(key) ?? null } catch { return null }
  }

  #readLocal(id: string): SaveRecord | undefined {
    const raw = this.#safeGet(LOCAL_SAVE_PREFIX + id)
    if (raw === null) return undefined
    try {
      const v: unknown = JSON.parse(raw)
      return isRecord(v) && v.id === id ? v : undefined
    } catch {
      return undefined
    }
  }

  #localKeys(): string[] {
    const l = this.#deps.local as (StorageLike & { length?: number; key?: (i: number) => string | null }) | undefined
    const keys: string[] = []
    try {
      for (let i = 0; i < (l?.length ?? 0); i++) {
        const k = l!.key!(i)
        if (k?.startsWith(LOCAL_SAVE_PREFIX)) keys.push(k)
      }
    } catch { /* none */ }
    return keys
  }

  #localWorks(): boolean {
    const l = this.#deps.local
    if (!l) return false
    try {
      const probe = `${LOCAL_SAVE_PREFIX}probe`
      l.setItem(probe, '1')
      l.removeItem(probe)
      return true
    } catch {
      return false
    }
  }
}
