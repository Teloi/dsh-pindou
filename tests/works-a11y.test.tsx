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
