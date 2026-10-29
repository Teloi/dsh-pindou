import { describe, expect, it } from 'vitest'
import {
  CACHE_KEY, createBoard, encode, GenerationCache, parseState, SafeStore, serializeState, setCell, STORAGE_KEY,
  defaultState, type StorageLike,
} from '../src/core/index.ts'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v) },
    removeItem: k => { data.delete(k) },
  }
}

const throwing: StorageLike = {
  getItem() { throw new Error('SecurityError') },
  setItem() { throw new Error('QuotaExceededError') },
  removeItem() { throw new Error('SecurityError') },
}

describe('storage', () => {
  it('round-trips state', () => {
    const s = { ...defaultState(), board: setCell(createBoard(24), 1, 2, 9), color: 9, tool: 'erase' as const, target: 'heart' }
    const { state, corrupt } = parseState(serializeState(s))
    expect(corrupt).toBe(false)
    expect(encode(state.board)).toBe(encode(s.board))
    expect(state).toMatchObject({ color: 9, tool: 'erase', target: 'heart' })
  })

  it('recovers from corrupt or tampered data field by field', () => {
    expect(parseState('{not json').corrupt).toBe(true)
    expect(parseState('null').corrupt).toBe(true)
    const tampered = parseState(JSON.stringify({ size: 16, board: 'zz', color: 99, tool: 'rm -rf', prefs: { busyHint: 'yes' } }))
    expect(tampered.corrupt).toBe(true)
    expect(tampered.state).toMatchObject({ color: 4, tool: 'paint', prefs: { busyHint: true } })
  })

  it('keeps completed ids and the coach flag, dropping bad ids', () => {
    const s = { ...defaultState(), done: ['heart', 'cat', 'heart'], coached: true, mode: 'play' as const, tool: 'fill' as const }
    const { state } = parseState(serializeState(s))
    expect(state).toMatchObject({ done: ['heart', 'cat'], coached: true, mode: 'play', tool: 'fill' })
    const bad = parseState(JSON.stringify({ ...JSON.parse(serializeState(s)), done: ['ok-1', '<script>', 7, 'x'.repeat(40)], coached: 'yes' }))
    expect(bad.state.done).toEqual(['ok-1'])
    expect(bad.state.coached).toBe(false)
  })

  it('reports recovered and resets the key', () => {
    const backend = memoryStorage()
    backend.data.set(STORAGE_KEY, '{"size":16,"board":"oops"}')
    const store = new SafeStore(backend)
    store.loadState()
    expect(store.status).toBe('recovered')
    expect(backend.data.has(STORAGE_KEY)).toBe(false)
  })

  it('falls back to memory when storage throws or is missing', () => {
    for (const backend of [throwing, undefined]) {
      const store = new SafeStore(backend)
      expect(store.status).toBe('unavailable')
      expect(store.saveState(defaultState())).toBe(false)
      expect(store.loadState().board.size).toBe(16)
    }
  })

  it('degrades when the quota runs out mid-session', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    backend.setItem = () => { throw new Error('QuotaExceededError') }
    expect(store.saveState(defaultState())).toBe(false)
    expect(store.status).toBe('unavailable')
    expect(store.get(STORAGE_KEY)).not.toBeNull()
  })
})

describe('generation cache', () => {
  it('stores, hits, evicts and persists', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    const cache = new GenerationCache(store, 2)
    const flat = encode(setCell(createBoard(12), 0, 0, 1))
    cache.put({ key: 'a', size: 12, flat, at: 1 })
    cache.put({ key: 'b', size: 12, flat, at: 2 })
    expect(cache.get('a')?.flat).toBe(flat)
    cache.put({ key: 'c', size: 12, flat, at: 3 })
    expect(cache.get('b')).toBeUndefined()
    expect(new GenerationCache(store).get('a')).toBeDefined()
    expect(backend.data.has(CACHE_KEY)).toBe(true)
  })

  it('ignores corrupt cache entries', () => {
    expect(GenerationCache.parse('[{"key":"x","size":16,"flat":"bad","at":1}, 5, null]')).toEqual([])
    expect(GenerationCache.parse('{')).toEqual([])
  })
})
