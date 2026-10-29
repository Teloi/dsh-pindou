// @vitest-environment jsdom
// The works wall's pieces (b4 重要 1/2): every bead a whole number of device
// pixels, nothing scaled, the pattern centred; the home thumbnail keeps 4px
// inside its round corner. At 1× and 2× device pixel ratios.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStore } from '../src/client/game-store.ts'
import { renderExport } from '../src/client/render.ts'
import type { Env } from '../src/client/ui/context.tsx'
import { createBoard, decode, encode, findTemplate, makeTranslate, SafeStore, setCell, type BoardSize } from '../src/core/index.ts'
import * as chunk from '../src/client/works.tsx'
import { WORKS_CSS } from '../src/client/works-styles.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Draw = { on: HTMLCanvasElement, args: unknown[] }
let draws: Draw[]
const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
/** A 2D context that records what is drawn onto `on`. */
const context = (on: HTMLCanvasElement): unknown => new Proxy({}, {
  get: (_, k) => (k === 'drawImage' ? (...args: unknown[]) => { draws.push({ on, args }) } : k === 'canvas' ? on : sink), set: () => true,
})
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  draws = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return context(this)
  } as never)
  host = document.createElement('div')
  host.className = 'pd-root'
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => { root.unmount() })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  host.remove()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

const kit = { render: renderExport, decode, template: findTemplate, exportBoard: async () => false, copyBoard: async () => false, copySupported: () => false } as unknown as Parameters<typeof chunk.WorksRow>[0]['kit']
const env = (): Env => ({ store: new GameStore({ store: new SafeStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }), saveDelayMs: 0 }), lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false })
const work = (n: BoardSize) => ({ i: 1, n, b: encode(setCell(createBoard(n), 0, 0, 3)), s: null })

/** The one draw onto `c`: the source is drawn as it is (no size given) at a whole, centred offset. */
function placed(c: HTMLCanvasElement, n: number) {
  const d = draws.filter(x => x.on === c)
  expect(d).toHaveLength(1)
  const [src, x, y, ...scaled] = d[0]!.args as [HTMLCanvasElement, number, number, ...number[]]
  expect(scaled).toEqual([]) // not stretched
  const k = src.width / n
  expect(Number.isInteger(k)).toBe(true)
  expect(src.height).toBe(src.width)
  expect(Number.isInteger(x) && x === y).toBe(true)
  expect(x).toBe(Math.floor((c.width - src.width) / 2)) // centred, the rest left empty
  expect(c.width - src.width - x - x).toBeLessThanOrEqual(1)
  return k
}

describe.each([1, 2])('b4 重要 1/2 at devicePixelRatio %i', (dpr) => {
  beforeEach(() => { vi.stubGlobal('devicePixelRatio', dpr) })

  it.each([12, 16, 24] as const)('home thumbnail, a %i-cell board: whole device pixels per bead, 46 css inside 4px padding', async (n) => {
    await act(async () => { root.render(<chunk.WorksRow env={env()} kit={kit} wall={[work(n)]} fade={false} />) })
    const c = host.querySelector<HTMLCanvasElement>('.pd-wt canvas')!
    expect(c.width).toBe(46 * dpr) // 56 − 2 border − 2×4 padding
    const k = placed(c, n)
    expect(k).toBe(Math.floor(46 * dpr / n))
    expect(WORKS_CSS).toMatch(/\.pd-wt\{[^}]*padding:4px/)
  })

  it('12×12 detail image: a whole multiple of the board, centred, not blown up from the 448 px export', async () => {
    await act(async () => { root.render(<chunk.WorksPage env={env()} kit={kit} wall={[work(12)]} />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-wc')!.click() })
    const c = host.querySelector<HTMLCanvasElement>('.pd-wbig canvas')!
    expect(c.width).toBe(304 * dpr)
    expect(placed(c, 12)).toBe(Math.floor(304 * dpr / 12))
  })
})

describe('pieceFit', () => {
  it('whole cells, centred on whole pixels, at least one pixel a cell', () => {
    expect(chunk.pieceFit(46, 1, 12)).toEqual({ px: 46, k: 3, at: 5 })
    expect(chunk.pieceFit(46, 2, 24)).toEqual({ px: 92, k: 3, at: 10 })
    expect(chunk.pieceFit(304, 2, 12)).toEqual({ px: 608, k: 50, at: 4 })
    expect(chunk.pieceFit(10, 1, 24)).toEqual({ px: 10, k: 1, at: -7 })
  })
})
