// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { panelOnScreen } from '../src/client/ui/App.tsx'
import { hintCount, resetHintCounts } from '../src/client/entry.tsx'
import { renderExport } from '../src/client/render.ts'
import { browserStorage, createBoard, setCell } from '../src/core/index.ts'

/** A 2D context with just what renderExport calls, plus the optional extras when asked. */
function fakeCtx(extras: boolean) {
  const calls: string[] = []
  const rec = (name: string) => (): void => { calls.push(name) }
  const ctx: Record<string, unknown> = { beginPath: rec('beginPath'), fill: rec('fill'), arc: rec('arc'), rect: rec('rect'), stroke: rec('stroke'), save: rec('save'), restore: rec('restore'), clip: rec('clip'), fillRect: rec('fillRect') }
  const gradient = (): unknown => { calls.push('gradient'); return { addColorStop: () => {} } }
  ctx.createLinearGradient = gradient
  if (extras) { ctx.roundRect = rec('roundRect'); ctx.createRadialGradient = gradient } else ctx.createRadialGradient = undefined
  return { ctx, calls }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

// The feature checks are written as plain truthiness / optional calls to keep the first screen
// small (spec §18.6); these pin that older engines still take the fallback paths.
describe('feature detection on the first screen', () => {
  it('browserStorage: the storage, or undefined when absent or throwing', () => {
    expect(browserStorage()).toBe(globalThis.localStorage)
    vi.stubGlobal('localStorage', undefined)
    expect(browserStorage()).toBeUndefined()
    vi.unstubAllGlobals()
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied') })
    expect(browserStorage()).toBeUndefined()
  })

  it('hint counts survive a session storage that throws', () => {
    vi.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('denied') })
    expect(hintCount('x')).toBe(0)
    expect(() => { resetHintCounts() }).not.toThrow()
  })

  it('panelOnScreen without checkVisibility, and when it says hidden', () => {
    const el = document.createElement('div'); document.body.append(el)
    vi.spyOn(el, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 10, top: 0, bottom: 10 } as DOMRect)
    Object.defineProperty(el, 'checkVisibility', { value: undefined, configurable: true })
    expect(panelOnScreen(el)).toBe(true)
    Object.defineProperty(el, 'checkVisibility', { value: () => false, configurable: true })
    expect(panelOnScreen(el)).toBe(false)
    Object.defineProperty(el, 'checkVisibility', { value: () => true, configurable: true })
    expect(panelOnScreen(el)).toBe(true)
    el.remove()
  })

  for (const extras of [true, false]) {
    it(`renderExport ${extras ? 'uses roundRect and the inner shade' : 'falls back to rect, without the shade'}`, () => {
      const { ctx, calls } = fakeCtx(extras)
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
      const board = setCell(createBoard(12), 1, 1, 2)
      renderExport(document, board, true, false)
      expect(calls.includes('roundRect')).toBe(extras)
      expect(calls.includes('rect')).toBe(!extras)
      expect(calls.includes('gradient')).toBe(extras)
    })
  }
})
