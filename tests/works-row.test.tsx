// @vitest-environment jsdom
// The home row of the works wall (spec §18.4) in the real panel: where focus goes
// once a failed chunk load is retried and the row arrives (b4 重要 3).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStore } from '../src/client/game-store.ts'
import { lazy } from '../src/client/lazy.ts'
import { App } from '../src/client/ui/App.tsx'
import { EnvContext, type Env } from '../src/client/ui/context.tsx'
import { createBoard, encode, makeTranslate, SafeStore, setCell, WORKS_KEY, type StorageLike } from '../src/core/index.ts'
import * as chunk from '../src/client/works.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../src/client/lazy.ts', async (orig) => {
  const real = await orig<typeof import('../src/client/lazy.ts')>()
  return { ...real, hostLoadsChunks: () => true }
})

type Chunk = typeof chunk
const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => sink) as never)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => { root.unmount() })
  vi.restoreAllMocks()
  host.remove()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

const b12 = encode(setCell(createBoard(12), 0, 0, 3))
async function panel(wall: unknown[]) {
  const data = new Map<string, string>([[WORKS_KEY, JSON.stringify(wall)]])
  const backend: StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
  const store = new GameStore({ store: new SafeStore(backend), saveDelayMs: 0 })
  const calls: Array<{ resolve: (m: Chunk) => void, reject: (e: Error) => void }> = []
  const works = lazy<Chunk>(() => new Promise<Chunk>((resolve, reject) => { calls.push({ resolve, reject }) }), true)
  const env: Env = { store, lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false, works }
  await act(async () => { root.render(<EnvContext.Provider value={env}><App /></EnvContext.Provider>) })
  await act(async () => { calls[0]!.reject(new Error('net::ERR_FAILED')) })
  const retry = host.querySelector<HTMLButtonElement>('.pd-works .pd-wrow button')!
  expect(retry.textContent).toBe('加载失败，点此重试')
  retry.focus()
  await act(async () => { retry.click() })
  await act(async () => { calls[1]!.resolve(chunk) })
  await act(async () => { await new Promise(r => { setTimeout(r, 0) }) })
}

describe('b4 重要 3: after a successful retry on the works row', () => {
  it('focus goes to the first thumbnail, not to 自由拼', async () => {
    await panel([{ i: 1, n: 12, b: b12, s: null }, { i: 2, n: 12, b: b12, s: null }])
    const first = host.querySelector<HTMLElement>('.pd-works .pd-wt')
    expect(first).not.toBeNull()
    expect(document.activeElement).toBe(first)
  })
  it('with no thumbnail to show, focus goes to the 「我的作品」 heading', async () => {
    // the chunk's row on its own: an empty (clean) wall draws the heading and no thumbnail
    const store = new GameStore({ store: new SafeStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }), saveDelayMs: 0 })
    const env: Env = { store, lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false }
    const kit = { render: () => document.createElement('canvas') } as unknown as Parameters<typeof chunk.WorksRow>[0]['kit']
    host.className = 'pd-root'
    const was = document.createElement('button')
    host.before(was)
    was.focus()
    was.remove() // the retry button went away: focus is lost to the body
    await act(async () => { root.render(<chunk.WorksRow env={env} kit={kit} wall={[]} fade={false} focus />) })
    expect(host.querySelector('.pd-works .pd-wt')).toBeNull()
    const h = host.querySelector<HTMLElement>('.pd-works h3')!
    expect(h.textContent).toContain('我的作品')
    expect(document.activeElement).toBe(h)
  })
  it('a row that loads without a retry takes no focus', async () => {
    const data = new Map<string, string>([[WORKS_KEY, JSON.stringify([{ i: 1, n: 12, b: b12, s: null }])]])
    const backend: StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
    const store = new GameStore({ store: new SafeStore(backend), saveDelayMs: 0 })
    const env: Env = { store, lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false, works: lazy<Chunk>(async () => chunk, true) }
    await act(async () => { root.render(<EnvContext.Provider value={env}><App /></EnvContext.Provider>) })
    await act(async () => { await new Promise(r => { setTimeout(r, 0) }) })
    expect(host.querySelector('.pd-works .pd-wt')).not.toBeNull()
    expect(host.querySelector('.pd-works')?.contains(document.activeElement)).toBe(false)
  })
})
