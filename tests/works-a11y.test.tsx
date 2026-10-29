// @vitest-environment jsdom
// The works wall's keyboard and screen-reader tree (b4 suggestions): the grid behind
// the detail card is out of reach while the card is open; the home row's thumbnails
// are one Tab stop with arrow keys, like the wall.
import { act } from 'react'
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
