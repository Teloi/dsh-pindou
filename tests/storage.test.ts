import { describe, expect, it } from 'vitest'
import {
  BAD_SAVE_KEY, CACHE_KEY, createBoard, encode, GenerationCache, parseState, SafeStore, serializeState, setCell, STORAGE_KEY,
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
    const s = { ...defaultState(), board: setCell(createBoard(24), 1, 2, 9), color: 9, tool: 'erase' as const, target: 'template:heart' }
    const { state, corrupt } = parseState(serializeState(s))
    expect(corrupt).toBe(false)
    expect(encode(state.board)).toBe(encode(s.board))
    expect(state).toMatchObject({ color: 9, tool: 'erase', target: 'template:heart', pattern: null })
  })

  it('reads v2 saves (square, `size` only) unchanged', () => {
    const board = setCell(createBoard(12), 3, 4, 7)
    const v2 = JSON.stringify({ v: 2, size: 12, board: encode(board), color: 7, tool: 'paint', mode: 'play', target: null, pattern: null, ironed: false })
    const { state, corrupt } = parseState(v2)
    expect(corrupt).toBe(false)
    expect(state.board).toEqual(board)
    expect(state).toMatchObject({ color: 7, mode: 'play' })
  })

  it('writes v3 with the width under `size`, so a square save still opens in v0.2 (isBoardSize(size) + size² cells)', () => {
    const raw = JSON.parse(serializeState({ ...defaultState(), board: createBoard(24) }))
    expect(raw).toMatchObject({ v: 3, size: 24, h: 24 })
    expect(raw.board).toHaveLength(24 * 24)
  })

  it('the v1 key only opens shapes the first screen draws (12, 16, 24 square); any other is unreadable (review I-1)', () => {
    // a valid v3 save of a w × h board decodes, but the DOM board can't draw it: corrupt, never rendered
    for (const [w, h] of [[16, 12], [29, 58], [20, 20], [208, 208], [8, 208]] as const) {
      const raw = JSON.stringify({ v: 3, size: w, h, board: encode(setCell(createBoard(w, h), w - 1, h - 1, 2)) })
      expect(parseState(raw).corrupt).toBe(true)
      expect(parseState(raw).state.board.w).toBe(16)
    }
    for (const n of [12, 16, 24]) expect(parseState(serializeState({ ...defaultState(), board: createBoard(n) })).corrupt).toBe(false)
    // a size the data layer refuses, or cells that don't fill w × h, is corrupt (and falls back)
    expect(parseState(JSON.stringify({ size: 209, board: '.'.repeat(209 * 209) })).corrupt).toBe(true)
    expect(parseState(JSON.stringify({ size: 29, h: 58, board: '.'.repeat(29 * 29) })).corrupt).toBe(true)
  })

  it('a valid non-square v3 save in the v1 key is backed up and the game starts over (review I-1)', () => {
    const backend = memoryStorage()
    const raw = JSON.stringify({ v: 3, size: 16, h: 12, board: encode(setCell(createBoard(16, 12), 15, 11, 3)), color: 3 })
    backend.data.set(STORAGE_KEY, raw)
    const store = new SafeStore(backend)
    const state = store.loadState()
    expect(state.board).toEqual(createBoard(16))
    expect(store.status).toBe('recovered')
    expect(backend.data.has(STORAGE_KEY)).toBe(false)
    expect(backend.data.get(BAD_SAVE_KEY)).toBe(raw)
  })

  it('setAside keeps the save under the backup key and clears it (the crash reset); nothing saved, nothing done', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    store.setAside()
    expect(store.status).toBe('ok')
    expect(backend.data.size).toBe(0)
    const raw = serializeState(defaultState())
    backend.data.set(STORAGE_KEY, raw)
    store.setAside()
    expect(store.status).toBe('recovered')
    expect(backend.data.get(BAD_SAVE_KEY)).toBe(raw)
    expect(backend.data.has(STORAGE_KEY)).toBe(false)
  })

  it('keeps at most three backups, newest first, dropping the oldest', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    backend.data.set(STORAGE_KEY, 'save 1')
    store.setAside()
    expect([...backend.data.keys()]).toEqual([BAD_SAVE_KEY])
    for (const n of [2, 3, 4, 5]) {
      backend.data.set(STORAGE_KEY, `save ${n}`)
      store.setAside()
    }
    expect(['', ':2', ':3'].map(n => backend.data.get(BAD_SAVE_KEY + n))).toEqual(['save 5', 'save 4', 'save 3'])
    expect(backend.data.size).toBe(3)
  })

  it('a corrupt save bigger than 64 KB is still backed up before it goes (audit A1-5)', () => {
    const backend = memoryStorage()
    const huge = 'x'.repeat(70 * 1024)
    backend.data.set(STORAGE_KEY, huge)
    const store = new SafeStore(backend)
    store.loadState()
    expect(backend.data.get(BAD_SAVE_KEY)).toBe(huge)
    expect(backend.data.has(STORAGE_KEY)).toBe(false)
  })

  it('when the backup is refused, the original save stays and this session never saves over it (audit A1-5)', () => {
    const backend = memoryStorage()
    const setItem = backend.setItem
    backend.setItem = (k, v) => { if (k.startsWith(BAD_SAVE_KEY)) throw new Error('QuotaExceededError'); setItem(k, v) }
    backend.data.set(STORAGE_KEY, '{broken')
    const store = new SafeStore(backend)
    store.loadState()
    expect(store.status).toBe('recovered')
    expect(backend.data.get(STORAGE_KEY)).toBe('{broken')
    expect(store.saveState({ ...defaultState(), board: createBoard(16) })).toBe(false)
    expect(backend.data.get(STORAGE_KEY)).toBe('{broken')
    expect(store.status).toBe('recovered')
  })

  it('never writes a non-square or big board to the v1 key, and stays ok (review I-2)', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    expect(store.saveState({ ...defaultState(), board: createBoard(16) })).toBe(true)
    const square = backend.data.get(STORAGE_KEY)
    for (const board of [createBoard(16, 12), createBoard(40, 30), createBoard(58), createBoard(208)]) {
      expect(store.saveState({ ...defaultState(), board })).toBe(false)
      expect(backend.data.get(STORAGE_KEY)).toBe(square)
    }
    expect(store.status).toBe('ok')
    expect(store.saveState({ ...defaultState(), board: createBoard(24) })).toBe(true)
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
    // the unreadable save is kept aside, not thrown away
    expect(backend.data.get(BAD_SAVE_KEY)).toBe('{"size":16,"board":"oops"}')
  })

  it('falls back to memory when storage throws or is missing', () => {
    for (const backend of [throwing, undefined]) {
      const store = new SafeStore(backend)
      expect(store.status).toBe('unavailable')
      expect(store.saveState(defaultState())).toBe(false)
      expect(store.loadState().board.w).toBe(16)
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

describe('storage: the works wall side key', () => {
  it('a refused side write keeps storage ok; a refused game write does not', () => {
    const backend = memoryStorage()
    const store = new SafeStore(backend)
    backend.setItem = () => { throw new Error('QuotaExceededError') }
    expect(store.set('dsh-pindou:works', '[]', true)).toBe(false)
    expect(store.status).toBe('ok')
    expect(store.set(STORAGE_KEY, '{}')).toBe(false)
    expect(store.status).toBe('unavailable')
  })

  it('a game keeps its work id only while ironed, and only a whole number', () => {
    const base = { ...defaultState(), board: setCell(createBoard(16), 0, 0, 1) }
    expect(parseState(serializeState({ ...base, ironed: true, work: 123 })).state.work).toBe(123)
    expect(parseState(serializeState({ ...base, ironed: false, work: 123 })).state.work).toBeNull()
    const raw = JSON.parse(serializeState({ ...base, ironed: true, work: 1 }))
    expect(parseState(JSON.stringify({ ...raw, work: 1.5 })).state.work).toBeNull()
    expect(parseState(JSON.stringify({ ...raw, work: '9' })).state.work).toBeNull()
    expect(defaultState().work).toBeNull()
  })
})
