import { type BoardSize, isBoardSize } from './board.ts'
import { decode } from './codec.ts'
import type { SafeStore } from './storage.ts'

export const CACHE_KEY = 'dsh-pindou:ai-cache:v1'
export const CACHE_LIMIT = 24

export interface CachedGeneration {
  readonly key: string
  readonly size: BoardSize
  /** Flat encoding of the validated board. */
  readonly flat: string
  readonly model?: string | undefined
  readonly at: number
}

/** A small LRU of validated generations, persisted beside the game state. */
export class GenerationCache {
  private entries: CachedGeneration[] = []

  constructor(private readonly store?: SafeStore, private readonly limit = CACHE_LIMIT) {
    this.entries = store ? GenerationCache.parse(store.get(CACHE_KEY)) : []
  }

  static parse(json: string | null): CachedGeneration[] {
    if (json === null) return []
    try {
      const raw: unknown = JSON.parse(json)
      if (!Array.isArray(raw)) return []
      return raw.filter((e): e is CachedGeneration => {
        if (typeof e !== 'object' || e === null) return false
        const v = e as Record<string, unknown>
        return typeof v['key'] === 'string' && isBoardSize(v['size']) && typeof v['flat'] === 'string'
          && typeof v['at'] === 'number' && decode(v['flat'], v['size']).ok
      }).slice(0, CACHE_LIMIT)
    } catch {
      return []
    }
  }

  get(key: string): CachedGeneration | undefined {
    const i = this.entries.findIndex(e => e.key === key)
    if (i < 0) return undefined
    const [hit] = this.entries.splice(i, 1)
    this.entries.unshift(hit!)
    this.persist()
    return hit
  }

  put(entry: CachedGeneration): void {
    this.entries = [entry, ...this.entries.filter(e => e.key !== entry.key)].slice(0, this.limit)
    this.persist()
  }

  get size(): number {
    return this.entries.length
  }

  private persist(): void {
    this.store?.set(CACHE_KEY, JSON.stringify(this.entries))
  }
}
