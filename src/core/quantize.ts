/**
 * Picture to pattern (spec §18.2, T1): pure, self-contained functions that turn
 * the pixels of a (already downscaled) picture into palette indices.
 *
 * This module ships in the lazy chunk lib/client.picture.js. The DSH loader can
 * not share a module between the entry and a chunk (scripts/async-chunks.ts), so
 * it imports nothing at runtime: the palette comes in as an argument.
 *
 * Pipeline: crop → area-average downscale to N×N (premultiplied, so transparent
 * edges do not darken) → transparent cells become empty → with 8 or 4 colours,
 * k-means in OKLab picks the colours first, each cluster is mapped to its nearest
 * palette colour → every cell maps to its nearest allowed colour in OKLab,
 * optionally with Floyd–Steinberg dithering → optional background removal (the
 * most common corner colour, flood-filled from the edge).
 */

/** RGBA pixels, like ImageData. */
export interface Pixels {
  readonly data: ArrayLike<number>
  readonly width: number
  readonly height: number
}

/** A square crop in source pixels (may be fractional). */
export interface Crop {
  readonly x: number
  readonly y: number
  readonly side: number
}

export type PictureSize = 12 | 16 | 24
export type ColorLimit = 16 | 8 | 4

export interface QuantizeOptions {
  readonly size: PictureSize
  readonly colors: ColorLimit
  readonly dither: boolean
  readonly removeBg: boolean
}

export const PICTURE_SIZES: readonly PictureSize[] = [12, 16, 24]
export const COLOR_LIMITS: readonly ColorLimit[] = [16, 8, 4]
export const DEFAULT_OPTIONS: QuantizeOptions = { size: 16, colors: 16, dither: false, removeBg: true }
/** Below this many beads 「开始拼」 is disabled (spec §18.2). */
export const MIN_BEADS = 8
/** Empty cell in the result. */
export const NONE = -1
/** A cell is a bead when at least half of it is covered. */
const ALPHA_MIN = 0.5

export type Lab = readonly [number, number, number]

const toLinear = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }

/** sRGB (0–255) to OKLab (Björn Ottosson). */
export function oklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function hexLab(hex: string): Lab {
  const v = Number.parseInt(hex.replace('#', ''), 16)
  return oklab((v >> 16) & 255, (v >> 8) & 255, v & 255)
}

const dist2 = (a: Lab, b: Lab): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** Index (into `labs`) of the colour nearest to `c`, among `allowed`. */
export function nearest(c: Lab, labs: readonly Lab[], allowed: readonly number[]): number {
  let best = allowed[0] ?? 0
  let bd = Infinity
  for (const i of allowed) {
    const d = dist2(c, labs[i]!)
    if (d < bd) { bd = d; best = i }
  }
  return best
}

/** The largest centred square of a picture. */
export function centreCrop(width: number, height: number): Crop {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

/**
 * Area-average the crop down to n×n. Every source pixel contributes by the area
 * it overlaps each cell (exact box filter, fractional edges included). Colour is
 * averaged premultiplied by alpha. Returns n*n*4 values: r, g, b (0–255) and a (0–1).
 */
export function downsample(img: Pixels, crop: Crop, n: number): Float64Array {
  const out = new Float64Array(n * n * 4)
  const { data, width, height } = img
  const step = crop.side / n
  // per axis: for each cell, the source pixels it covers and their weights
  const spans = (start: number, limit: number): Array<Array<[number, number]>> => Array.from({ length: n }, (_, k) => {
    const a = start + k * step, b = a + step
    const list: Array<[number, number]> = []
    for (let p = Math.max(0, Math.floor(a)); p < Math.min(limit, Math.ceil(b)); p++) {
      const w = Math.min(b, p + 1) - Math.max(a, p)
      if (w > 0) list.push([p, w])
    }
    return list
  })
  const xs = spans(crop.x, width), ys = spans(crop.y, height)
  const area = step * step
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      let r = 0, g = 0, b = 0, a = 0
      for (const [py, wy] of ys[cy]!) {
        for (const [px, wx] of xs[cx]!) {
          const i = (py * width + px) * 4
          const al = (data[i + 3]! / 255) * wx * wy
          r += data[i]! * al; g += data[i + 1]! * al; b += data[i + 2]! * al; a += al
        }
      }
      const o = (cy * n + cx) * 4
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a }
      out[o + 3] = a / area
    }
  }
  return out
}

/**
 * k-means in OKLab (deterministic: farthest-point seeding from the mean), then
 * each cluster centre is mapped to its nearest palette colour. Returns the
 * distinct palette indices to use (at most k, fewer when clusters share one).
 */
export function chooseColors(points: readonly Lab[], labs: readonly Lab[], k: number): number[] {
  const all = labs.map((_, i) => i)
  if (points.length === 0 || k >= labs.length) return all
  const mean: Lab = [0, 1, 2].map(d => points.reduce((s, p) => s + p[d]!, 0) / points.length) as unknown as Lab
  const centres: Lab[] = []
  let far = points[0]!
  let fd = -1
  for (const p of points) { const d = dist2(p, mean); if (d > fd) { fd = d; far = p } }
  centres.push(far)
  while (centres.length < k) {
    let pick: Lab | null = null
    let pd = 0
    for (const p of points) {
      const d = Math.min(...centres.map(c => dist2(p, c)))
      if (d > pd) { pd = d; pick = p }
    }
    if (!pick) break
    centres.push(pick)
  }
  const assign = new Int32Array(points.length)
  for (let iter = 0; iter < 12; iter++) {
    let moved = false
    points.forEach((p, i) => {
      let best = 0, bd = Infinity
      centres.forEach((c, j) => { const d = dist2(p, c); if (d < bd) { bd = d; best = j } })
      if (assign[i] !== best) { assign[i] = best; moved = true }
    })
    for (let j = 0; j < centres.length; j++) {
      const mine = points.filter((_, i) => assign[i] === j)
      if (mine.length) centres[j] = [0, 1, 2].map(d => mine.reduce((s, p) => s + p[d]!, 0) / mine.length) as unknown as Lab
    }
    if (!moved && iter > 0) break
  }
  return [...new Set(centres.map(c => nearest(c, labs, all)))].toSorted((a, b) => a - b)
}

/** Remove the most common corner colour, flood-filling from the edge (4-neighbour). */
export function removeBackground(cells: Int8Array | number[], n: number): void {
  const corners = [0, n - 1, n * (n - 1), n * n - 1].map(i => cells[i]!).filter(c => c !== NONE)
  if (corners.length === 0) return
  const count = new Map<number, number>()
  for (const c of corners) count.set(c, (count.get(c) ?? 0) + 1)
  let bg = corners[0]!
  for (const c of corners) if (count.get(c)! > count.get(bg)!) bg = c
  const stack: number[] = []
  for (let i = 0; i < n; i++) stack.push(i, n * (n - 1) + i, i * n, i * n + n - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (cells[i] !== bg) continue
    cells[i] = NONE
    const x = i % n, y = (i - x) / n
    if (x > 0) stack.push(i - 1)
    if (x < n - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - n)
    if (y < n - 1) stack.push(i + n)
  }
}

/**
 * The whole pipeline: palette indices (0–15) or NONE, row by row, n*n long.
 * `palette` is the list of bead colours as #RRGGBB.
 */
export function quantize(img: Pixels, crop: Crop, opts: QuantizeOptions, palette: readonly string[]): number[] {
  const n = opts.size
  const labs = palette.map(hexLab)
  const px = downsample(img, crop, n)
  const lab: Array<[number, number, number] | null> = []
  for (let i = 0; i < n * n; i++) {
    const o = i * 4
    lab.push(px[o + 3]! < ALPHA_MIN ? null : [...oklab(px[o]!, px[o + 1]!, px[o + 2]!)])
  }
  const solid = lab.filter((c): c is [number, number, number] => c !== null)
  const allowed = opts.colors >= labs.length ? labs.map((_, i) => i) : chooseColors(solid, labs, opts.colors)
  const cells: number[] = Array.from({ length: n * n }, () => NONE)
  for (let i = 0; i < n * n; i++) {
    const c = lab[i]
    if (!c) continue
    const idx = nearest(c, labs, allowed)
    cells[i] = idx
    if (!opts.dither) continue
    // Floyd–Steinberg in OKLab; the error only flows into cells that are beads
    const t = labs[idx]!
    const err = [c[0] - t[0], c[1] - t[1], c[2] - t[2]]
    const x = i % n
    const spread = (j: number, w: number): void => {
      const d = lab[j]
      if (d) for (let k = 0; k < 3; k++) d[k]! += err[k]! * w
    }
    if (x < n - 1) spread(i + 1, 7 / 16)
    if (i + n < n * n) {
      if (x > 0) spread(i + n - 1, 3 / 16)
      spread(i + n, 5 / 16)
      if (x < n - 1) spread(i + n + 1, 1 / 16)
    }
  }
  if (opts.removeBg) removeBackground(cells, n)
  return cells
}

export const beadCount = (cells: readonly number[]): number => cells.reduce((s, c) => s + (c === NONE ? 0 : 1), 0)
