// Counter-proof for e2e/compare-shots.mjs: the screenshot comparison must catch a single changed
// pixel (also in a real Chrome screenshot), and must not flag an identical image that is
// encoded differently.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { compareRuns, decodePng, diffPng } from '../e2e/compare-shots.mjs'

const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
interface Enc { filter?: number, level?: number, rgb?: boolean, split?: boolean }
/** Encode RGBA pixels as PNG with a chosen filter (0–4, or -1 to cycle), zlib level, RGB or RGBA, and IDAT split. */
function encode(w: number, h: number, rgba: Uint8Array, { filter = 0, level = 6, rgb = false, split = false }: Enc = {}): Buffer {
  const ch = rgb ? 3 : 4, stride = w * ch
  const rows: Uint8Array[] = []
  for (let y = 0; y < h; y++) {
    const r = new Uint8Array(stride)
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) r[x * ch + c] = rgba[(y * w + x) * 4 + c] ?? 0
    rows.push(r)
  }
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const f = filter < 0 ? y % 5 : filter, cur = rows[y] ?? new Uint8Array(stride), up = rows[y - 1] ?? new Uint8Array(stride)
    raw[y * (stride + 1)] = f
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] ?? 0 : 0, b = up[i] ?? 0, c = i >= ch ? up[i - ch] ?? 0 : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f] ?? 0
      raw[y * (stride + 1) + 1 + i] = ((cur[i] ?? 0) - pred) & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, rgb ? 2 : 6, 0, 0, 0], 8)
  const z = deflateSync(raw, { level })
  const idat = split ? [chunk('IDAT', z.subarray(0, z.length >> 1)), chunk('IDAT', z.subarray(z.length >> 1))] : [chunk('IDAT', z)]
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...idat, chunk('IEND', Buffer.alloc(0))])
}
const picture = (w: number, h: number): Uint8Array => {
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set([(i * 37) & 255, (i * 11) & 255, (i * 3) & 255, 255], i * 4)
  return px
}

describe('compare-shots: identical pixels, any encoding, compare equal', () => {
  const w = 23, h = 17, px = picture(w, h), base = encode(w, h, px)
  it.each([
    ['sub filter', { filter: 1 }], ['up filter', { filter: 2 }], ['average filter', { filter: 3 }], ['paeth filter', { filter: 4 }],
    ['mixed filters', { filter: -1 }], ['no compression', { level: 0 }], ['best compression', { level: 9 }],
    ['RGB instead of opaque RGBA', { rgb: true }], ['IDAT split in two', { split: true }],
  ] as const)('%s', (_, enc) => {
    const other = encode(w, h, px, enc)
    expect(other.equals(base)).toBe(false) // the bytes differ…
    expect(diffPng(base, other)).toBeNull() // …the pixels do not
    expect(decodePng(other).data).toEqual(px)
  })
})

describe('compare-shots: a change is caught', () => {
  const w = 23, h = 17, px = picture(w, h), base = encode(w, h, px)
  it('one channel of one pixel off by 1', () => {
    const p = px.slice(), k = (5 * w + 7) * 4 + 1; p[k] = (p[k] ?? 0) ^ 1
    expect(diffPng(base, encode(w, h, p, { filter: -1 }))).toEqual({ pixels: 1, delta: 1, box: { x: 7, y: 5, width: 1, height: 1 } })
  })
  it('only the alpha of one pixel', () => {
    const p = px.slice(); p[3] = 254
    expect(diffPng(base, encode(w, h, p))).toMatchObject({ pixels: 1, delta: 1 })
  })
  it('a different size', () => {
    expect(diffPng(base, encode(w, h - 1, px.subarray(0, w * (h - 1) * 4)))).toEqual({ size: '23×17 vs 23×16' })
  })
  it('a corrupt file is an error, not "equal"', () => {
    expect(() => diffPng(base, Buffer.from('nope'))).toThrow(/not a PNG/)
  })
})

const cli = (...args: string[]) => spawnSync(process.execPath, [join(import.meta.dirname, '../e2e/compare-shots.mjs'), ...args], { encoding: 'utf8' })

describe('compare-shots: a real Chrome screenshot', () => {
  const real = readFileSync(join(import.meta.dirname, 'fixtures/shots/chrome-pill.png'))
  const img = decodePng(real)
  it('re-encoded unchanged: equal; one pixel nudged: exactly that pixel', () => {
    expect(img.width * img.height).toBeGreaterThan(1000)
    expect(diffPng(real, encode(img.width, img.height, img.data, { filter: -1, level: 1 }))).toBeNull()
    const p = img.data.slice(), x = img.width >> 1, y = img.height >> 1, i = (y * img.width + x) * 4
    p[i] = p[i] === 255 ? 254 : p[i] + 1
    expect(diffPng(real, encode(img.width, img.height, p))).toEqual({ pixels: 1, delta: 1, box: { x, y, width: 1, height: 1 } })
  })

  it('runs: compareRuns and the CLI exit code (0 equal, 1 changed or unmatched, 2 bad input)', () => {
    const root = mkdtempSync(join(tmpdir(), 'pd-cmp-'))
    const run = (name: string, files: Record<string, Buffer>): string => {
      const d = join(root, name); mkdirSync(join(d, 'plugin'), { recursive: true })
      for (const [f, b] of Object.entries(files)) writeFileSync(join(d, 'plugin', f), b)
      return d
    }
    const p = img.data.slice(); p[0] ^= 4
    const same = encode(img.width, img.height, img.data, { level: 9 })
    const changed = encode(img.width, img.height, p)
    const A = run('a', { 'pill.png': real, 'home.png': real })
    const B = run('b', { 'pill.png': same, 'home.png': real })
    const C = run('c', { 'pill.png': changed, 'home.png': real })
    const D = run('d', { 'pill.png': real })
    expect(compareRuns(A, B)).toEqual({ compared: 2, differ: [], onlyA: [], onlyB: [] })
    expect(compareRuns(A, C).differ).toEqual([{ file: 'pill.png', pixels: 1, delta: 4, box: { x: 0, y: 0, width: 1, height: 1 } }])
    expect(compareRuns(A, D).onlyA).toEqual(['home.png'])
    expect(cli(A, B).status).toBe(0)
    const c = cli(A, C)
    expect(c.status).toBe(1)
    expect(c.stdout).toContain('≠ pill.png 1 px, max Δ 4')
    expect(cli(A, D).status).toBe(1)
    expect(cli(A, join(root, 'missing')).status).toBe(2)
  })
})
