import { describe, expect, it } from 'vitest'
import { aheadWait, LEVELS, PREBUILD_MAX, prebuildPlan, pxShown, QUIET_MS, snapScale, tileB, tileCells, tilesOf } from '../src/client/big-canvas.ts'

/** A 208 × 208 board on a 480 × 520 box at 2× (the designer's cold-cache case). */
const W = 208, CW = 480, CH = 520, DPR = 2
const about = (s0: number, ox: number, oy: number, s: number) => {
  const k = s / s0
  return { s, ox: CW / 2 - (CW / 2 - ox) * k, oy: CH / 2 - (CH / 2 - oy) * k }
}
/** The frame puts cell c's left edge at round((ox + c·s)·dpr) (BigCanvas.draw): device px of cells c0 … c0 + n − 1. */
const edges = (ox: number, s: number, dpr: number, c0: number, n: number) => Math.round((ox + (c0 + n) * s) * dpr) - Math.round((ox + c0 * s) * dpr)

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
    // first comes the next level in (tiles are built at each view's own device px per cell: 2.3 → 5, 4 → 8), its middle tile first
    expect(now).toMatchObject({ b: 5, lod: 0 })
    const inV = about(fit.s, fit.ox, fit.oy, LEVELS.find(l => l > fit.s)!)
    const want = tilesOf(inV, CW, CH, W, W, DPR)
    expect(plan[0]).toMatchObject({ b: want.b, lod: want.lod, T: want.T, tx: want.at[0]![0], ty: want.at[0]![1] })
    expect(plan.slice(0, Math.min(PREBUILD_MAX, want.at.length)).map(p => [p.tx, p.ty])).toEqual(want.at.slice(0, PREBUILD_MAX))
    // a smaller cap is kept
    expect(prebuildPlan(fit, CW, CH, W, W, DPR, 3)).toHaveLength(3)
    // at the top level only the level out is left: 48 px/cell, 96 device px
    const top = prebuildPlan({ s: 64, ox: -2000, oy: -2000 }, CW, CH, W, W, DPR)
    expect(top.length).toBeGreaterThan(0)
    expect(top.every(p => p.b === 96 && p.lod === 2)).toBe(true)
  })

  it.each([1, 1.25, 1.5, 2])('native tile size at dpr %s: b = device px per cell on every level, and a tile draws 1:1 wherever the view sits', (dpr) => {
    for (const s of LEVELS) {
      const k = s * dpr, b = tileB(k), T = tileCells(b)
      expect(b).toBe(k) // whole at these dprs, never a power of two rounded up
      expect(T).toBe(Math.max(1, Math.floor(256 / b)))
      expect(T * b).toBeLessThanOrEqual(256)
      expect(tilesOf({ s, ox: 0, oy: 0 }, CW, CH, W, W, dpr)).toMatchObject({ b, T })
      // any (fractional) offset: a whole tile spans exactly T·b device px, and every cell b, so no resampling
      for (const ox of [0, 0.3, 0.5, 0.8, -17.4, 123.6]) {
        for (const c0 of [0, 1, 7, T, 3 * T]) {
          expect(edges(ox, s, dpr, c0, T)).toBe(T * b)
          expect(edges(ox, s, dpr, c0, 1)).toBe(b)
        }
      }
    }
  })

  it('native tile size: a fractional device px per cell rounds to the nearest whole px, within 1…256', () => {
    expect(tileB(2.3 * 2)).toBe(5)
    expect(tileB(2.3 * 1.25)).toBe(3)
    expect(tileB(12 * 1.1)).toBe(13)
    expect(tileB(0.2)).toBe(1)
    expect(tileB(64 * 3)).toBe(192)
    expect(tileCells(192)).toBe(1)
    expect(tileB(400)).toBe(256)
    // the old rule built 1.5× · 16 px/cell at 32 and scaled it by 3/4: the gap went 1 px left, 2 px right
    expect(tileB(16 * 1.5)).toBe(24)
    expect(tileCells(24)).toBe(10)
  })


  it.each([1, 1.1, 1.25, 1.5, 1.75, 2, 3])('snapScale at dpr %s: a settled view has whole device px per cell, levels stay apart, a fit stays inside', (dpr) => {
    const whole = (s: number) => Math.abs(s * dpr - Math.round(s * dpr)) < 1e-9
    const lv = LEVELS.map(l => snapScale(l, dpr))
    for (const [i, s] of lv.entries()) {
      expect(whole(s)).toBe(true)
      expect(Math.abs(s * dpr - LEVELS[i]! * dpr)).toBeLessThanOrEqual(0.5) // half a device px at most
      if (i) expect(s).toBeGreaterThan(lv[i - 1]!) // no two levels meet
    }
    // the levels are whole already at 1, 1.25, 1.5, 2, 3: unchanged there
    if ([1, 1.25, 1.5, 2, 3].includes(dpr)) expect(lv).toEqual(LEVELS)
    for (const raw of [1, 2.3, 2.69, 3.9, 7.77, 19.5, 63.9]) {
      const d = snapScale(raw, dpr, true)
      expect(whole(d)).toBe(true)
      expect(d).toBeLessThanOrEqual(Math.max(raw, 1 / dpr) + 1e-9)
      expect(raw * dpr - d * dpr).toBeLessThan(1)
      expect(whole(snapScale(raw, dpr))).toBe(true)
    }
    // a whole scale is kept as it is (no drift from repeated snapping)
    for (const s of lv) expect(snapScale(s, dpr)).toBe(s)
  })
})

describe('px/cell in the status bar (designer: whole numbers at any dpr)', () => {
  it.each([[8.181818, 8], [19.0909, 19], [11.8181, 12], [2.5, 3], [16, 16], [64, 64], [8.6, 9]])('shows %f px as %i', (s, n) => {
    expect(pxShown(s)).toBe(n)
    expect(Number.isInteger(pxShown(s))).toBe(true)
  })
  it('shows a whole number for every snapped level at fractional dprs', () => {
    for (const dpr of [1.1, 1.25, 1.5, 1.75]) for (const l of LEVELS) expect(Number.isInteger(pxShown(snapScale(l, dpr)))).toBe(true)
  })
})

describe('frames in motion borrow a settled tile size (perf: b71a0e0 regression)', () => {
  const v = { s: 11.3, ox: 0, oy: 0 }
  it('builds at the view\'s own rounded size when settled, at the borrowed size when given', () => {
    expect(tilesOf(v, 528, 520, 58, 58, 2).b).toBe(23)
    const t = tilesOf(v, 528, 520, 58, 58, 2, 32)
    expect(t.b).toBe(32)
    expect(t.T).toBe(8)
  })
  it('takes the lod of the borrowed size, not of the moving scale (no extra layer across a lod boundary)', () => {
    // 13.5 css px is lod 1 by itself; a borrowed 32 device px at dpr 2 is 16 css px: lod 2, the settled level's
    expect(tilesOf({ s: 13.5, ox: 0, oy: 0 }, 528, 520, 58, 58, 2).lod).toBe(1)
    expect(tilesOf({ s: 13.5, ox: 0, oy: 0 }, 528, 520, 58, 58, 2, 32).lod).toBe(2)
    expect(tilesOf({ s: 4.4, ox: 0, oy: 0 }, 528, 520, 58, 58, 2, 16).lod).toBe(1)
  })
  it('covers the same cells with the borrowed tiles (every visible cell in some tile)', () => {
    const t = tilesOf(v, 528, 520, 58, 58, 2, 32), seen = new Set<string>()
    for (const [tx, ty] of t.at) for (let y = ty * t.T; y < Math.min(58, (ty + 1) * t.T); y++) for (let x = tx * t.T; x < Math.min(58, (tx + 1) * t.T); x++) seen.add(`${x},${y}`)
    for (let y = 0; y < 58 && y * v.s < 520; y++) for (let x = 0; x < 58 && x * v.s < 528; x++) expect(seen.has(`${x},${y}`)).toBe(true)
  })
})

describe('build-ahead waits for quiet (designer: input first)', () => {
  it('waits QUIET_MS after the last input or frame, then not at all', () => {
    expect(QUIET_MS).toBe(300)
    expect(aheadWait(1000, 1000)).toBe(300)
    expect(aheadWait(1100, 1000)).toBe(200)
    expect(aheadWait(1300, 1000)).toBe(0)
    expect(aheadWait(5000, 1000)).toBe(0)
  })
})

