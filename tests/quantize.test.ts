// Picture to pattern (spec §18.2, T1): the pure pipeline in src/core/quantize.ts.
import { describe, expect, it } from 'vitest'
import { PALETTE } from '../src/core/index.ts'
import {
  beadCount, centreCrop, chooseColors, DEFAULT_OPTIONS, downsample, hexLab, MIN_BEADS, NONE, oklab, quantize, removeBackground,
  type Pixels, type QuantizeOptions,
} from '../src/core/quantize.ts'

const HEX = PALETTE.map(c => c.hex)
const rgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
/** w×h RGBA pixels from a per-pixel function. */
function image(w: number, h: number, px: (x: number, y: number) => readonly [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = px(x, y)
      data.set([r, g, b, a], (y * w + x) * 4)
    }
  }
  return { data, width: w, height: h }
}
const opts = (o: Partial<QuantizeOptions> = {}): QuantizeOptions => ({ ...DEFAULT_OPTIONS, removeBg: false, ...o })

describe('quantize: colour science', () => {
  it('OKLab: white is L=1, black L=0, greys have no chroma', () => {
    const w = oklab(255, 255, 255), k = oklab(0, 0, 0), g = oklab(128, 128, 128)
    expect(w[0]).toBeCloseTo(1, 3)
    expect(k[0]).toBeCloseTo(0, 6)
    expect(Math.hypot(g[1], g[2])).toBeLessThan(1e-4)
  })

  it('every palette colour maps to itself', () => {
    for (const [i, hex] of HEX.entries()) {
      const [r, g, b] = rgb(hex)
      expect(quantize(image(4, 4, () => [r, g, b]), centreCrop(4, 4), opts({ size: 12 }), HEX).every(c => c === i)).toBe(true)
    }
    expect(hexLab('#ffffff')[0]).toBeCloseTo(1, 3)
  })
})

describe('quantize: area-average downscale (not nearest neighbour)', () => {
  it('a 2×2 checker of black and white averages to one mid cell', () => {
    const px = downsample(image(2, 2, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0])), centreCrop(2, 2), 1)
    expect(px[0]).toBeCloseTo(127.5, 6)
    expect(px[3]).toBeCloseTo(1, 6)
  })

  it('fractional cells weigh each source pixel by the area it covers', () => {
    // 3 px wide → 2 cells: cell 0 = px0 + half of px1
    const px = downsample(image(3, 3, x => (x === 0 ? [0, 0, 0] : [255, 255, 255])), centreCrop(3, 3), 2)
    expect(px[0]).toBeCloseTo(255 / 3, 6)
    expect(px[4]).toBeCloseTo(255, 6)
  })

  it('a fine stripe pattern does not alias to one stripe colour (nearest neighbour would)', () => {
    const img = image(64, 64, x => (x % 2 ? [215, 51, 59] : [246, 244, 238]))
    const cells = quantize(img, centreCrop(64, 64), opts({ size: 16 }), HEX)
    // the average of red and white is pinkish, not pure red or pure white
    expect(new Set(cells).size).toBe(1)
    expect([0, 4]).not.toContain(cells[0])
  })

  it('transparency: premultiplied, and a mostly transparent cell is empty', () => {
    const img = image(4, 2, x => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 0]))
    const px = downsample(img, { x: 0, y: 0, side: 2 }, 1)
    expect(px[0]).toBe(255) // the transparent blue does not darken the red
    const cells = quantize(image(4, 4, x => (x < 2 ? [215, 51, 59, 255] : [0, 0, 0, 0])), centreCrop(4, 4), opts({ size: 12 }), HEX)
    expect(cells.filter(c => c === NONE).length).toBe(72)
    expect(cells.filter(c => c === 4).length).toBe(72)
  })

  it('crops: only the crop square is read', () => {
    const img = image(20, 10, x => (x < 10 ? [38, 39, 43] : [247, 197, 49]))
    expect(new Set(quantize(img, { x: 10, y: 0, side: 10 }, opts({ size: 12 }), HEX))).toEqual(new Set([2]))
    expect(new Set(quantize(img, { x: 0, y: 0, side: 10 }, opts({ size: 12 }), HEX))).toEqual(new Set([15]))
  })
})

/** A smooth gradient with many colours. */
const rainbow = image(96, 96, (x, y) => [Math.round(x * 2.6), Math.round(y * 2.6), Math.round(255 - x * 1.3)])

describe('quantize: colour limits, dithering, background', () => {
  it('8 and 4 colours: clustering first, then at most that many palette colours', () => {
    for (const k of [8, 4] as const) {
      const cells = quantize(rainbow, centreCrop(96, 96), opts({ size: 24, colors: k }), HEX)
      const used = new Set(cells)
      expect(used.size).toBeLessThanOrEqual(k)
      expect(used.size).toBeGreaterThan(1)
    }
    const all = new Set(quantize(rainbow, centreCrop(96, 96), opts({ size: 24, colors: 16 }), HEX))
    expect(all.size).toBeGreaterThan(8)
  })

  it('chooseColors is deterministic and returns sorted distinct indices', () => {
    const labs = HEX.map(hexLab)
    const pts = Array.from({ length: 50 }, (_, i) => oklab(i * 5, 255 - i * 5, 128))
    const a = chooseColors(pts, labs, 4)
    expect(a).toEqual(chooseColors(pts, labs, 4))
    expect(a).toEqual([...new Set(a)].toSorted((x, y) => x - y))
    expect(chooseColors([], labs, 4)).toHaveLength(16)
  })

  it('Floyd–Steinberg: a flat in-between grey mixes two colours; off keeps one', () => {
    // halfway between Gray (#9DA1A8) and White (#F6F4EE)
    const grey = image(32, 32, () => [202, 203, 203])
    const plain = new Set(quantize(grey, centreCrop(32, 32), opts({ size: 16 }), HEX))
    const dith = new Set(quantize(grey, centreCrop(32, 32), opts({ size: 16, dither: true }), HEX))
    expect(plain.size).toBe(1)
    expect(dith.size).toBeGreaterThan(1)
    // deterministic
    expect(quantize(grey, centreCrop(32, 32), opts({ size: 16, dither: true }), HEX)).toEqual(quantize(grey, centreCrop(32, 32), opts({ size: 16, dither: true }), HEX))
  })

  it('dithering never puts beads into transparent cells', () => {
    const img = image(32, 32, x => (x < 16 ? [202, 203, 203, 255] : [0, 0, 0, 0]))
    const cells = quantize(img, centreCrop(32, 32), opts({ size: 16, dither: true }), HEX)
    for (let i = 0; i < cells.length; i++) if (i % 16 >= 8) expect(cells[i]).toBe(NONE)
  })

  it('remove background: the most common corner colour, flood-filled from the edge', () => {
    // white background, a red square with a white hole in the middle (not connected to the edge)
    const img = image(12, 12, (x, y) => {
      const inSquare = x >= 2 && x < 10 && y >= 2 && y < 10
      const hole = x >= 5 && x < 7 && y >= 5 && y < 7
      return inSquare && !hole ? [215, 51, 59] : [246, 244, 238]
    })
    const cells = quantize(img, centreCrop(12, 12), opts({ size: 12, removeBg: true }), HEX)
    expect(cells[0]).toBe(NONE)
    expect(cells[2 * 12 + 2]).toBe(4)
    expect(cells[5 * 12 + 5]).toBe(0) // the enclosed white stays
    expect(beadCount(cells)).toBe(64)
  })

  it('remove background with all corners transparent changes nothing', () => {
    const cells = [NONE, 1, NONE, 1, 2, 1, NONE, 1, NONE]
    removeBackground(cells, 3)
    expect(cells).toEqual([NONE, 1, NONE, 1, 2, 1, NONE, 1, NONE])
  })

  it('a flat picture with the background removed is "too simple" (fewer than 8 beads)', () => {
    const cells = quantize(image(10, 10, () => [98, 182, 233]), centreCrop(10, 10), opts({ size: 16, removeBg: true }), HEX)
    expect(beadCount(cells)).toBeLessThan(MIN_BEADS)
  })
})

describe('quantize: speed (spec §18.2: 24 cells ≤ 30 ms)', () => {
  it('a 512×512 picture to 24×24, 16 colours and 4 colours with dithering', () => {
    const big = image(512, 512, (x, y) => [x % 256, y % 256, (x * y) % 256])
    const best = (o: QuantizeOptions): number => {
      let min = Infinity
      for (let i = 0; i < 5; i++) {
        const t = performance.now()
        quantize(big, centreCrop(512, 512), o, HEX)
        min = Math.min(min, performance.now() - t)
      }
      return min
    }
    expect(best(opts({ size: 24 }))).toBeLessThan(30)
    expect(best(opts({ size: 24, colors: 4, dither: true, removeBg: true }))).toBeLessThan(30)
  })
})
