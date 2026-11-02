import { describe, expect, it } from 'vitest'
import { LEVELS, PREBUILD_MAX, prebuildPlan, tilesOf } from '../src/client/big-canvas.ts'

/** A 208 × 208 board on a 480 × 520 box at 2× (the designer's cold-cache case). */
const W = 208, CW = 480, CH = 520, DPR = 2
const about = (s0: number, ox: number, oy: number, s: number) => {
  const k = s / s0
  return { s, ox: CW / 2 - (CW / 2 - ox) * k, oy: CH / 2 - (CH / 2 - oy) * k }
}

describe('big canvas tiles (designer recheck P1/P2)', () => {
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

  it('P2: the build-ahead plan is the next level in (then out) about the middle, middle first, capped, never the tiles shown now', () => {
    const fit = { s: 2.3, ox: (CW - W * 2.3) / 2, oy: (CH - W * 2.3) / 2 }
    const plan = prebuildPlan(fit, CW, CH, W, W, DPR)
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.length).toBeLessThanOrEqual(PREBUILD_MAX)
    const now = tilesOf(fit, CW, CH, W, W, DPR)
    expect(plan.some(p => p.b === now.b && p.lod === now.lod)).toBe(false)
    // first comes the level in that needs new tiles: 4 px/cell shares 2.3's (8 device px, lod 0), so 8 px/cell, its middle tile first
    expect(tilesOf(about(fit.s, fit.ox, fit.oy, 4), CW, CH, W, W, DPR)).toMatchObject({ b: now.b, lod: now.lod })
    const inV = about(fit.s, fit.ox, fit.oy, LEVELS.find(l => l > 4)!)
    const want = tilesOf(inV, CW, CH, W, W, DPR)
    expect(plan[0]).toMatchObject({ b: want.b, lod: want.lod, T: want.T, tx: want.at[0]![0], ty: want.at[0]![1] })
    expect(plan.slice(0, Math.min(PREBUILD_MAX, want.at.length)).map(p => [p.tx, p.ty])).toEqual(want.at.slice(0, PREBUILD_MAX))
    // a smaller cap is kept
    expect(prebuildPlan(fit, CW, CH, W, W, DPR, 3)).toHaveLength(3)
    // at the top level only the level out is left: 48 px/cell shares 64's tiles (128 device px), so 32 (64)
    const top = prebuildPlan({ s: 64, ox: -2000, oy: -2000 }, CW, CH, W, W, DPR)
    expect(top.length).toBeGreaterThan(0)
    expect(top.every(p => p.b === 64 && p.lod === 2)).toBe(true)
  })
})
