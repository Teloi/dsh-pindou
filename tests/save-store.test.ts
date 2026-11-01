import { describe, expect, it } from 'vitest'
import { decodeV4, encodeV4 } from '../src/core/codec-v4.ts'
import { type Board, createBoard, defaultState, EMPTY, parseState, serializeState, setCell, STORAGE_KEY } from '../src/core/index.ts'
import {
  LEGACY_ID, LOCAL_MAX_SIDE, LOCAL_SAVE_PREFIX, openDb, SaveStore, SOFT_CAP_BYTES, UNSAVED_TOO_BIG,
} from '../src/core/save-store.ts'
import { FakeIdb, fakeLocal } from './fake-idb.ts'

function noisy(w: number, h: number, seed = 1): Board {
  let s = seed
  const r = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
  return { w, h, cells: Object.freeze(Array.from({ length: w * h }, () => (r() < 0.4 ? Math.floor(r() * 16) : EMPTY))) }
}

const persistYes = { persist: async () => true }

describe('save store: IndexedDB first', () => {
  it('opens IDB, asks persist() once, and round-trips 208² boards', async () => {
    const idb = new FakeIdb()
    let asked = 0
    const store = await SaveStore.open({ idb, local: fakeLocal(), storageManager: { persist: async () => { asked++; return false } } })
    expect(store.status()).toEqual({ backend: 'idb', persisted: false, bytes: 0, nearFull: false })
    expect(asked).toBe(1)
    const big = noisy(208, 208)
    const r = await store.save('g1', big, { target: 'board:x' })
    expect(r).toMatchObject({ ok: true, where: 'idb' })
    expect(await store.load('g1')).toMatchObject({ board: big, meta: { target: 'board:x' } })
    expect(store.canSave(208, 208)).toBe(true)
    // a reopened store finds it, and counts its bytes
    const again = await SaveStore.open({ idb, storageManager: persistYes })
    expect(again.status()).toMatchObject({ backend: 'idb', persisted: true })
    expect(again.status().bytes).toBe(r.ok ? r.bytes : -1)
    expect((await again.load('g1'))?.board).toEqual(big)
  })

  it('reports a failed write, and never trusts a write it could not read back', async () => {
    const idb = new FakeIdb()
    const store = await SaveStore.open({ idb })
    idb.faults.put = true
    expect(await store.save('g', createBoard(16))).toEqual({ ok: false, reason: 'write-failed' })
    idb.faults = { readBack: true }
    expect(await store.save('g', createBoard(16))).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('rejects bad ids and oversized meta; load is undefined for missing or damaged records', async () => {
    const idb = new FakeIdb()
    const store = await SaveStore.open({ idb })
    expect(await store.save('../x', createBoard(8))).toEqual({ ok: false, reason: 'bad-id' })
    expect(await store.save('m', createBoard(8), { pad: 'x'.repeat(5000) })).toEqual({ ok: false, reason: 'too-big-meta' })
    expect(await store.load('nope')).toBeUndefined()
    idb.data.get('saves')!.set('bad', { id: 'bad', code: 'pd2:8x8:t:zz', w: 8, h: 8, at: 1 })
    expect(await store.load('bad')).toBeUndefined()
    idb.data.get('saves')!.set('liar', { id: 'liar', code: await encodeV4(createBoard(8)), w: 9, h: 8, at: 1 })
    expect(await store.load('liar')).toBeUndefined()
    idb.data.get('saves')!.set('junk', 'not a record')
    expect(await store.load('junk')).toBeUndefined()
  })

  it('counts bytes and flags the 4 MB soft cap', async () => {
    const idb = new FakeIdb()
    const store = await SaveStore.open({ idb })
    await store.save('a', createBoard(16), { pad: 'x'.repeat(4000) })
    const b = store.status().bytes
    expect(b).toBeGreaterThan(4000)
    await store.save('a', createBoard(16))
    expect(store.status().bytes).toBeLessThan(b)
    await store.remove('a')
    expect(store.status().bytes).toBe(0)
    idb.data.get('saves')!.set('huge', { id: 'huge', code: 'x'.repeat(SOFT_CAP_BYTES + 1), w: 8, h: 8, at: 1 })
    expect((await SaveStore.open({ idb })).status().nearFull).toBe(true)
  })
})

describe('save store: when IDB is unavailable', () => {
  for (const fault of ['error', 'throw', 'hang'] as const) {
    it(`falls back to localStorage (open ${fault})`, async () => {
      const idb = new FakeIdb()
      idb.faults.open = fault
      const local = fakeLocal()
      const store = await SaveStore.open({ idb, local, timeoutMs: 50 })
      expect(store.status()).toMatchObject({ backend: 'local', persisted: false })
      // ≤ 58 saves to localStorage, compressed
      const b58 = noisy(LOCAL_MAX_SIDE, 40)
      const r = await store.save('mid', b58)
      expect(r).toMatchObject({ ok: true, where: 'local' })
      expect(local.data.get(`${LOCAL_SAVE_PREFIX}mid`)!.length).toBeLessThan(LOCAL_MAX_SIDE * 40)
      expect((await store.load('mid'))?.board).toEqual(b58)
      // > 58 is playable but not saved, and the UI gets a status (and text) to show
      expect(store.canSave(59, 8)).toBe(false)
      expect(await store.save('big', createBoard(59, 8))).toEqual({ ok: false, reason: 'unsaved-too-big' })
      expect(local.data.has(`${LOCAL_SAVE_PREFIX}big`)).toBe(false)
      expect(UNSAVED_TOO_BIG.zh).toContain('此环境无法保存大图进度')
    })
  }

  it('reports no-storage when neither IDB nor localStorage works, and survives quota errors', async () => {
    const local = fakeLocal()
    local.broken = true
    const none = await SaveStore.open({ idb: undefined, local })
    expect(none.status().backend).toBe('memory')
    expect(await none.save('a', createBoard(8))).toEqual({ ok: false, reason: 'no-storage' })
    const tiny = fakeLocal(200)
    const store = await SaveStore.open({ local: tiny })
    expect(await store.save('a', noisy(58, 58))).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('openDb never throws and gives up after the timeout', async () => {
    expect(await openDb(undefined)).toBeUndefined()
    const idb = new FakeIdb()
    idb.faults.open = 'hang'
    const t0 = Date.now()
    expect(await openDb(idb, 30)).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('save store: migration', () => {
  it('moves fallback saves into IDB and removes them only after a verified write', async () => {
    const idb = new FakeIdb()
    idb.faults.open = 'error'
    const local = fakeLocal()
    const offline = await SaveStore.open({ idb, local })
    const a = noisy(40, 30, 3)
    await offline.save('a', a)
    await offline.save('b', noisy(20, 20, 4))
    // IDB comes back, but the first write attempt fails: nothing is removed
    idb.faults = { put: true }
    const s1 = await SaveStore.open({ idb, local })
    const r1 = await s1.migrate()
    expect(r1.moved).toEqual([])
    expect(r1.kept.toSorted()).toEqual([`${LOCAL_SAVE_PREFIX}a`, `${LOCAL_SAVE_PREFIX}b`])
    expect(local.data.has(`${LOCAL_SAVE_PREFIX}a`)).toBe(true)
    // a write that reads back wrong: still nothing removed
    idb.faults = { readBack: true }
    expect((await s1.migrate()).moved).toEqual([])
    expect(local.data.has(`${LOCAL_SAVE_PREFIX}a`)).toBe(true)
    // healthy: moved, verified, then removed
    idb.faults = {}
    const r2 = await s1.migrate()
    expect(r2.moved.toSorted()).toEqual([`${LOCAL_SAVE_PREFIX}a`, `${LOCAL_SAVE_PREFIX}b`])
    expect(local.data.has(`${LOCAL_SAVE_PREFIX}a`)).toBe(false)
    expect((await s1.load('a'))?.board).toEqual(a)
  })

  it('keeps a local copy when its removal fails, and lets a newer IDB save win', async () => {
    const idb = new FakeIdb()
    const local = fakeLocal()
    const store = await SaveStore.open({ idb, local, now: () => 100 })
    const newer = noisy(16, 16, 9)
    await store.save('g', newer)
    local.setItem(`${LOCAL_SAVE_PREFIX}g`, JSON.stringify({ id: 'g', code: await encodeV4(createBoard(16)), w: 16, h: 16, at: 50 }))
    local.failRemove = true
    expect((await store.migrate()).kept).toContain(`${LOCAL_SAVE_PREFIX}g`)
    local.failRemove = false
    expect((await store.migrate()).moved).toEqual([`${LOCAL_SAVE_PREFIX}g`])
    expect((await store.load('g'))?.board).toEqual(newer)
  })

  it('never touches corrupt saves', async () => {
    const idb = new FakeIdb()
    const local = fakeLocal()
    local.setItem(`${LOCAL_SAVE_PREFIX}x`, '{not json')
    local.setItem(`${LOCAL_SAVE_PREFIX}y`, JSON.stringify({ id: 'y', code: 'pd2:8x8:t:???', w: 8, h: 8, at: 1 }))
    local.setItem(STORAGE_KEY, '{"size":16,"board":"oops"}')
    const store = await SaveStore.open({ idb, local })
    const r = await store.migrate()
    expect(r.corrupt.toSorted()).toEqual([STORAGE_KEY, `${LOCAL_SAVE_PREFIX}x`, `${LOCAL_SAVE_PREFIX}y`].toSorted())
    expect(r.moved).toEqual([])
    expect(local.data.get(`${LOCAL_SAVE_PREFIX}x`)).toBe('{not json')
    expect(local.data.get(STORAGE_KEY)).toBe('{"size":16,"board":"oops"}')
    expect(idb.data.get('saves')!.size).toBe(0)
  })

  it('copies the v0.2 game save into IDB (verified) and leaves it for the first screen', async () => {
    const idb = new FakeIdb()
    const local = fakeLocal()
    const board = setCell(createBoard(24), 3, 3, 9)
    const v2 = JSON.stringify({ v: 2, size: 24, board: serializeState({ ...defaultState(), board }).match(/"board":"([^"]+)"/)![1], color: 9, tool: 'fill', mode: 'play', done: ['heart'] })
    local.setItem(STORAGE_KEY, v2)
    const store = await SaveStore.open({ idb, local })
    const r = await store.migrate()
    expect(r.copied).toEqual([STORAGE_KEY])
    expect(local.data.get(STORAGE_KEY)).toBe(v2)
    const back = await store.load(LEGACY_ID)
    expect(back?.board).toEqual(board)
    const meta = back?.meta as { v1?: string } | undefined
    expect(parseState(meta?.v1 ?? null).state).toMatchObject({ color: 9, tool: 'fill', done: ['heart'] })
  })

  it('migrates saves over 20 KB intact', async () => {
    const idb = new FakeIdb()
    const local = fakeLocal()
    // a 150 × 150 v3 game save: 22,500 board characters plus the rest, > 20 KB
    const board = noisy(150, 150, 12)
    const raw = serializeState({ ...defaultState(), board })
    expect(raw.length).toBeGreaterThan(20 * 1024)
    local.setItem(STORAGE_KEY, raw)
    // and a > 20 KB fallback record (plain-coded, as an old writer might have left it)
    const big = noisy(58, 58, 13)
    const plain = await encodeV4(big, { enc: 't' })
    const rec = JSON.stringify({ id: 'p', code: plain, w: 58, h: 58, at: 5, meta: { note: 'n'.repeat(3000) } })
    local.setItem(`${LOCAL_SAVE_PREFIX}p`, rec)
    const store = await SaveStore.open({ idb, local })
    const r = await store.migrate()
    expect(r).toMatchObject({ moved: [`${LOCAL_SAVE_PREFIX}p`], copied: [STORAGE_KEY], corrupt: [] })
    expect((await store.load(LEGACY_ID))?.board).toEqual(board)
    expect((await store.load('p'))?.board).toEqual(big)
    expect((await decodeV4(plain)).ok).toBe(true)
    expect(local.data.get(STORAGE_KEY)).toBe(raw)
  })

  it('does nothing without IDB', async () => {
    const idb = new FakeIdb()
    idb.faults.open = 'error'
    const local = fakeLocal()
    local.setItem(STORAGE_KEY, serializeState(defaultState()))
    const store = await SaveStore.open({ idb, local })
    expect(await store.migrate()).toEqual({ moved: [], copied: [], kept: [], corrupt: [] })
  })
})
