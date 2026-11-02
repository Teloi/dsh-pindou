import { describe, expect, it } from 'vitest'
import { tilesOf } from '../src/client/big-canvas.ts'

/** A 208 × 208 board on a 480 × 520 box at 2× (the designer's cold-cache case). */
const W = 208, CW = 480, CH = 520, DPR = 2
const about = (s0: number, ox: number, oy: number, s: number) => {
  const k = s / s0
  return { s, ox: CW / 2 - (CW / 2 - ox) * k, oy: CH / 2 - (CH / 2 - oy) * k }
}

describe('big canvas tiles (designer recheck P1)', () => {
  it('P1: a view’s tiles come nearest the box’s middle first, each once', () => {
    const v = about(2.3, (CW - W * 2.3) / 2, (CH - W * 2.3) / 2, 16)
    const { b, T, at } = tilesOf(v, CW, CH, W, W, DPR)
    expect(b).toBe(32)
    expect(T).toBe(8)
    expect(new Set(at.map(p => p.join())).size).toBe(at.length)
    const span = T * v.s, mx = (CW / 2 - v.ox) / span, my = (CH / 2 - v.oy) / span
    const d = at.map(([x, y]) => (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2)
    expect(d).toEqual(d.toSorted((p, q) => p - q))
    // the first one holds the middle of the box (here the middle falls on a tile corner, mx = my = 13,
    // so any of the four tiles meeting there is right: check it touches the point rather than floor())
    const [fx, fy] = at[0]!
    expect(fx <= mx && mx <= fx + 1 && fy <= my && my <= fy + 1).toBe(true)
    // and every tile on screen is there (the same range as before the reorder)
    const n = (o: number, box: number) => Math.min(Math.ceil(W / T) - 1, Math.floor((box - o) / span)) - Math.max(0, Math.floor(-o / span)) + 1
    expect(at).toHaveLength(n(v.ox, CW) * n(v.oy, CH))
  })
})
