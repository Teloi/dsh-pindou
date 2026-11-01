// @vitest-environment jsdom
// The works wall's keyboard and screen-reader tree (b4 suggestions): the grid behind
// the detail card is out of reach while the card is open; the home row's thumbnails
// are one Tab stop with arrow keys, like the wall.
import { act, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStore } from '../src/client/game-store.ts'
import { renderExport } from '../src/client/render.ts'
import type { Env } from '../src/client/ui/context.tsx'
import { createBoard, decode, encode, findTemplate, makeTranslate, SafeStore, setCell } from '../src/core/index.ts'
import * as chunk from '../src/client/works.tsx'
import { parseWorks, WORKS_KEY, WORKS_PARK_KEY } from '../src/core/works.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => sink) as never)
  host = document.createElement('div')
  host.className = 'pd-root'
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

const kit = { render: renderExport, decode, template: findTemplate, exportBoard: async () => false, copyBoard: async () => false, copySupported: () => false } as unknown as Parameters<typeof chunk.WorksRow>[0]['kit']
const env = (): Env => ({ store: new GameStore({ store: new SafeStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }), saveDelayMs: 0 }), lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false })
const wall = [1, 2, 3, 4].map(i => ({ i, n: 12 as const, b: encode(setCell(createBoard(12), 0, 0, 3)), s: null }))
const key = (el: Element, k: string): void => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }

describe('b4 suggestion: the wall behind an open detail card', () => {
  it('is inert while the card is open (out of the screen-reader tree and of Tab), and back when it closes', async () => {
    await act(async () => { root.render(<chunk.WorksPage env={env()} kit={kit} wall={wall} />) })
    const grid = (): HTMLElement => host.querySelector<HTMLElement>('.pd-wall')!
    expect(grid().hasAttribute('inert')).toBe(false)
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-wc')!.click() })
    expect(host.querySelector('.pd-wdet')).not.toBeNull()
    expect(grid().hasAttribute('inert')).toBe(true)
    expect(host.querySelector('.pd-wdet')!.closest('[inert]')).toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-wclose')!.click() })
    expect(grid().hasAttribute('inert')).toBe(false)
  })
})

describe('b4 suggestion: the home row is one Tab stop (roving tabindex, like the wall)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600)
  })
  it('only one thumbnail is in the Tab order; ← → Home End move it and the focus', async () => {
    await act(async () => { root.render(<chunk.WorksRow env={env()} kit={kit} wall={wall} fade={false} />) })
    const thumbs = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.pd-wt')]
    const stops = (): number[] => thumbs().map(t => t.tabIndex)
    expect(thumbs()).toHaveLength(4)
    expect(stops()).toEqual([0, -1, -1, -1])
    thumbs()[0]!.focus()
    await act(async () => { key(thumbs()[0]!, 'ArrowRight') })
    expect(stops()).toEqual([-1, 0, -1, -1])
    expect(document.activeElement).toBe(thumbs()[1])
    await act(async () => { key(thumbs()[1]!, 'End') })
    expect(document.activeElement).toBe(thumbs()[3])
    await act(async () => { key(thumbs()[3]!, 'ArrowRight') })
    expect(document.activeElement).toBe(thumbs()[3])
    await act(async () => { key(thumbs()[3]!, 'Home') })
    expect(stops()).toEqual([0, -1, -1, -1])
    expect(document.activeElement).toBe(thumbs()[0])
    await act(async () => { key(thumbs()[0]!, 'ArrowLeft') })
    expect(document.activeElement).toBe(thumbs()[0])
  })
})

describe('b4 suggestion: Ctrl+Z / ⌘Z on the wall undoes a delete, like 撤销', () => {
  it.each([['ctrlKey'], ['metaKey']] as const)('%s+Z right after Delete brings the work back, focus on it, the toast gone', async (mod) => {
    const e = env()
    e.store.setWall(wall)
    // like the entry: re-render with the stored wall whenever the store changes
    const Live = (): ReturnType<typeof chunk.WorksPage> => { useSyncExternalStore(e.store.subscribe, e.store.getSnapshot); return <chunk.WorksPage env={e} kit={kit} wall={e.store.works()} /> }
    await act(async () => { root.render(<Live />) })
    const first = host.querySelector<HTMLElement>('.pd-wc')!
    const id = first.dataset['work']
    first.focus()
    await act(async () => { key(first, 'Delete') })
    expect(e.store.works()).toHaveLength(3)
    expect(host.querySelector('.pd-toast')).not.toBeNull()
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', [mod]: true, bubbles: true })) })
    expect(e.store.works()).toHaveLength(4)
    expect(host.querySelector('.pd-toast')).toBeNull()
    expect((document.activeElement as HTMLElement).dataset['work']).toBe(id)
  })

  it('with nothing to undo it does nothing (the key is left alone)', async () => {
    const e = env()
    e.store.setWall(wall)
    await act(async () => { root.render(<chunk.WorksPage env={e} kit={kit} wall={e.store.works()} />) })
    const first = host.querySelector<HTMLElement>('.pd-wc')!
    first.focus()
    const z = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { first.dispatchEvent(z) })
    expect(z.defaultPrevented).toBe(false)
    expect(e.store.works()).toHaveLength(4)
  })
})

/** v0.2's start: the same cleanWorks (src/core/works.ts is unchanged from v0.2), written back when anything was dropped. */
const v02Start = (): ReturnType<typeof parseWorks> => {
  const r = parseWorks(localStorage.getItem(WORKS_KEY))
  if (r.dropped) localStorage.setItem(WORKS_KEY, JSON.stringify(r.works))
  return r
}

/** A store on the real (jsdom) localStorage, the one parkWorks writes to. */
const liveStore = (): Env => ({ ...env(), store: new GameStore({ store: new SafeStore(localStorage), saveDelayMs: 0 }) })
/** The wall page (or the home row) on the store's current wall, re-rendered as it changes. */
const show = async (e: Env, row = false): Promise<void> => {
  const Live = (): ReturnType<typeof chunk.WorksPage> => {
    useSyncExternalStore(e.store.subscribe, e.store.getSnapshot)
    const p = { env: e, kit, wall: e.store.works() }
    return row ? <chunk.WorksRow {...p} fade={false} /> : <chunk.WorksPage {...p} />
  }
  await act(async () => { root.render(<Live />) })
}

describe('review A1-6 (designer 21:33): entries the wall can’t show leave WORKS_KEY for a key v0.2 never reads', () => {
  const odd = [{ i: 7, n: 29, b: '.'.repeat(841), s: null }, null, 'x', { i: 2, n: 12, b: 'zz', s: null }]
  beforeEach(() => { localStorage.clear() })

  it('opening the wall moves them, as they were, to the park key; a v0.2 start afterwards drops nothing', async () => {
    localStorage.setItem(WORKS_KEY, JSON.stringify([odd[0], wall[0], odd[1], wall[1], odd[2], wall[2], odd[3], wall[3]]))
    const e = liveStore()
    await show(e)
    expect(host.querySelectorAll('.pd-wc')).toHaveLength(4)
    expect(JSON.parse(localStorage.getItem(WORKS_KEY)!)).toEqual(wall)
    expect(JSON.parse(localStorage.getItem(WORKS_PARK_KEY)!)).toEqual(odd)
    // rolled back to v0.2: its start finds nothing to drop and never touches the park key
    const v02 = v02Start()
    expect(v02.dropped).toBe(false)
    expect(v02.works).toEqual(wall)
    expect(JSON.parse(localStorage.getItem(WORKS_KEY)!)).toEqual(wall)
    expect(JSON.parse(localStorage.getItem(WORKS_PARK_KEY)!)).toEqual(odd)
  })

  it('the home row parks too (it is what renders at start), and the park key is outside the 60', async () => {
    const sixty = Array.from({ length: 60 }, (_, k) => ({ ...wall[0]!, i: 100 + k }))
    localStorage.setItem(WORKS_KEY, JSON.stringify([...odd, ...sixty.slice(4)]))
    await show(liveStore(), true)
    expect(JSON.parse(localStorage.getItem(WORKS_KEY)!)).toEqual(sixty.slice(4))
    expect(JSON.parse(localStorage.getItem(WORKS_PARK_KEY)!)).toEqual(odd)
  })

  it('parks once: a later start, a delete and its undo leave the park key as it is', async () => {
    localStorage.setItem(WORKS_KEY, JSON.stringify([...odd, ...wall]))
    await show(liveStore())
    const parked = localStorage.getItem(WORKS_PARK_KEY)
    act(() => { root.unmount() })
    root = createRoot(host)
    await show(liveStore())
    expect(localStorage.getItem(WORKS_PARK_KEY)).toBe(parked)
    const first = host.querySelector<HTMLElement>('.pd-wc')!
    first.focus()
    await act(async () => { key(first, 'Delete') })
    expect(JSON.parse(localStorage.getItem(WORKS_KEY)!)).toHaveLength(3)
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(JSON.parse(localStorage.getItem(WORKS_KEY)!)).toEqual(wall)
    expect(localStorage.getItem(WORKS_PARK_KEY)).toBe(parked)
  })

  it('adds to what is already parked; unreadable JSON is parked whole', async () => {
    localStorage.setItem(WORKS_PARK_KEY, JSON.stringify(['earlier']))
    localStorage.setItem(WORKS_KEY, '{oops')
    await show(liveStore())
    expect(localStorage.getItem(WORKS_KEY)).toBe('[]')
    expect(JSON.parse(localStorage.getItem(WORKS_PARK_KEY)!)).toEqual(['earlier', '{oops'])
    expect(v02Start().dropped).toBe(false)
  })

  it('when the park key can’t be written, WORKS_KEY is left exactly as stored (nothing is lost)', async () => {
    const raw = JSON.stringify([...odd, ...wall])
    localStorage.setItem(WORKS_KEY, raw)
    const real = Storage.prototype.setItem
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === WORKS_PARK_KEY) throw new Error('QuotaExceededError')
      real.call(this, k, v)
    })
    await show(liveStore())
    set.mockRestore()
    expect(host.querySelectorAll('.pd-wc')).toHaveLength(4)
    expect(localStorage.getItem(WORKS_KEY)).toBe(raw)
    expect(localStorage.getItem(WORKS_PARK_KEY)).toBeNull()
  })
})
