// Picture to pattern (spec §18.2, audit T1): type and size are judged from the
// first bytes, before any decoder sees the file; SVG is never decoded.
import { describe, expect, it } from 'vitest'
import { almostTransparent, decodeSize, isSvgText, MAX_BYTES, MAX_SIDE, precheck, sniff, VISIBLE_MIN } from '../src/core/image-sniff.ts'

const bytes = (...parts: Array<string | number[]>): Uint8Array =>
  new Uint8Array(parts.flatMap(p => (typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p)))
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number): number[] => [n & 255, (n >> 8) & 255]
const le24 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255]
const le32 = (n: number): number[] => [...le16(n & 0xffff), ...le16(n >>> 16)]
const be16 = (n: number): number[] => [(n >> 8) & 255, n & 255]

const png = (w: number, h: number): Uint8Array => bytes([0x89], 'PNG\r\n\x1a\n', be32(13), 'IHDR', be32(w), be32(h), [8, 6, 0, 0, 0])
const jpeg = (w: number, h: number): Uint8Array => bytes(
  [0xff, 0xd8],
  [0xff, 0xe1], be16(2 + 300), Array.from({ length: 300 }, () => 0), // a big APP1 (EXIF) block before the frame
  [0xff, 0xdb], be16(4), [0, 0],
  [0xff, 0xc2], be16(17), [8], be16(h), be16(w), [3], Array.from({ length: 9 }, () => 0),
)
interface GifFrame { readonly w: number, readonly h: number, readonly x?: number, readonly y?: number, readonly lct?: boolean }
/**
 * A complete GIF: screen `w`×`h` with a 2-colour global table, a NETSCAPE loop
 * extension, then each frame (graphic control extension, image descriptor,
 * optional local table, one LZW data sub-block), then the trailer.
 */
const gifOf = (w: number, h: number, frames: readonly GifFrame[] = [{ w, h }]): Uint8Array => bytes(
  'GIF89a', le16(w), le16(h), [0x80, 0, 0], [0, 0, 0, 255, 255, 255],
  [0x21, 0xff, 11], 'NETSCAPE2.0', [3, 1, 0, 0, 0],
  ...frames.flatMap(f => [
    [0x21, 0xf9, 4, 0, 10, 0, 0, 0],
    [0x2c], le16(f.x ?? 0), le16(f.y ?? 0), le16(f.w), le16(f.h), [f.lct ? 0x80 : 0], f.lct ? [0, 0, 0, 255, 255, 255] : [],
    [2, 3, 0x44, 0x01, 0x05, 0],
  ]),
  [0x3b],
)
const gif = (w: number, h: number): Uint8Array => gifOf(w, h)
const webpX = (w: number, h: number): Uint8Array => bytes('RIFF', le32(30), 'WEBP', 'VP8X', le32(10), [0, 0, 0, 0], le24(w - 1), le24(h - 1))
const webpL = (w: number, h: number): Uint8Array => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)
  return bytes('RIFF', le32(30), 'WEBP', 'VP8L', le32(10), [0x2f], le32(bits), [0, 0, 0])
}
const webpLossy = (w: number, h: number): Uint8Array => bytes('RIFF', le32(30), 'WEBP', 'VP8 ', le32(10), [0, 0, 0, 0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0])
const bmp = (w: number, h: number): Uint8Array => bytes('BM', le32(0), le32(0), le32(54), le32(40), le32(w), le32(-h), [1, 0, 32, 0])
const svg = bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')

describe('sniff: magic bytes and header size', () => {
  it.each([
    ['png', png(640, 480)],
    ['jpeg', jpeg(640, 480)],
    ['gif', gif(640, 480)],
    ['webp', webpX(640, 480)],
    ['webp', webpL(640, 480)],
    ['webp', webpLossy(640, 480)],
    ['bmp', bmp(640, 480)],
  ] as const)('%s', (kind, b) => {
    expect(sniff(b)).toEqual({ kind, width: 640, height: 480 })
  })

  it('SVG, text and truncated headers are not images we decode', () => {
    expect(sniff(svg)).toBeNull()
    expect(sniff(bytes('hello world, this is not a picture'))).toBeNull()
    expect(sniff(bytes([0x89], 'PNG'))).toBeNull()
    expect(sniff(new Uint8Array())).toBeNull()
  })

  it('a JPEG whose frame header is past the bytes read reports no size (the decoder size is checked then)', () => {
    expect(sniff(jpeg(640, 480).slice(0, 100))).toEqual({ kind: 'jpeg', width: null, height: null })
  })
})

const file = (type: string, size: number, name = 'x'): { type: string, size: number, name: string } => ({ type, size, name })

describe('precheck: the order of checks', () => {
  it('SVG is never decoded and says so (C4: 「暂不支持 SVG」): by type, by name, by its text when renamed', () => {
    expect(precheck(file('image/svg+xml', svg.length, 'a.svg'), svg)).toEqual({ error: 'svg' })
    // even when the browser gives no MIME type
    expect(precheck(file('', svg.length, 'a.svg'), svg)).toEqual({ error: 'svg' })
    // renamed to .png, typed image/png by the browser
    expect(precheck(file('image/png', svg.length, 'a.png'), svg)).toEqual({ error: 'svg' })
    const bare = bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(precheck(file('', bare.length, 'pic'), bare)).toEqual({ error: 'svg' })
  })

  it('isSvgText: BOM, XML declaration, comments and doctype before <svg>; nothing else', () => {
    expect(isSvgText(bytes([0xef, 0xbb, 0xbf], '  <svg>'))).toBe(true)
    expect(isSvgText(bytes('<?xml version="1.0"?>\n<!-- by hand -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg viewBox="0 0 1 1">'))).toBe(true)
    expect(isSvgText(bytes('<SVG/>'))).toBe(true)
    expect(isSvgText(bytes('<svgx>'))).toBe(false)
    expect(isSvgText(bytes('<html><svg>'))).toBe(false) // an HTML page is not an SVG
    expect(isSvgText(bytes('hello <svg>'))).toBe(false)
    expect(precheck(file('text/html', 11, 'a.html'), bytes('<html><svg>'))).toEqual({ error: 'notImage' })
  })

  it('not an image at all: 「这个文件不是图片」', () => {
    expect(precheck(file('text/plain', 10, 'a.txt'), bytes('hello'))).toEqual({ error: 'notImage' })
    expect(precheck(file('application/pdf', 10, 'a.pdf'), bytes('%PDF-1.7'))).toEqual({ error: 'notImage' })
  })

  it('a type we do not decode (HEIC, AVIF) cannot be opened', () => {
    expect(precheck(file('image/heic', 10, 'a.heic'), bytes([0, 0, 0, 24], 'ftypheic'))).toEqual({ error: 'cannotOpen' })
  })

  it('the type is judged from the bytes, not the name or MIME', () => {
    expect(precheck(file('text/plain', 100, 'renamed.txt'), png(10, 10))).toEqual({ ok: { kind: 'png', width: 10, height: 10 } })
    expect(precheck(file('image/png', 100, 'fake.png'), bytes('not really'))).toEqual({ error: 'cannotOpen' })
  })

  it('over 20 MB is too big, before the header size is even looked at', () => {
    expect(precheck(file('image/png', MAX_BYTES + 1), png(10, 10))).toEqual({ error: 'tooBig' })
    expect(precheck(file('image/png', MAX_BYTES), png(10, 10))).toHaveProperty('ok')
  })

  it('a side over 8000 px is too big (from the header, never decoded)', () => {
    expect(precheck(file('image/png', 100), png(MAX_SIDE + 1, 10))).toEqual({ error: 'tooBig' })
    expect(precheck(file('image/jpeg', 100), jpeg(10, MAX_SIDE + 1))).toEqual({ error: 'tooBig' })
    expect(precheck(file('image/gif', 100), gif(MAX_SIDE, MAX_SIDE))).toHaveProperty('ok')
    // a decompression bomb: tiny file, huge canvas
    expect(precheck(file('image/png', 60), png(50_000, 50_000))).toEqual({ error: 'tooBig' })
  })

  it('a zero-sized header cannot be opened', () => {
    expect(precheck(file('image/png', 100), png(0, 10))).toEqual({ error: 'cannotOpen' })
  })
})

describe('GIF: every frame counts, not just the screen size (audit N-2)', () => {
  it('a screen forged to 10×10 over a 9000×9000 frame is too big before decoding', () => {
    const forged = gifOf(10, 10, [{ w: 9000, h: 9000 }])
    expect(sniff(forged)).toEqual({ kind: 'gif', width: 9000, height: 9000 })
    expect(precheck(file('image/gif', forged.length, 'forged.gif'), forged)).toEqual({ error: 'tooBig' })
  })

  it('a frame pushed past 8000 px by its left/top offset is too big', () => {
    const shifted = gifOf(10, 10, [{ w: 20, h: 10, x: MAX_SIDE - 10 }])
    expect(sniff(shifted)).toMatchObject({ width: MAX_SIDE + 10, height: 10 })
    expect(precheck(file('image/gif', shifted.length), shifted)).toEqual({ error: 'tooBig' })
    expect(precheck(file('image/gif', 100), gifOf(10, 10, [{ w: 10, h: 20, y: MAX_SIDE - 10 }]))).toEqual({ error: 'tooBig' })
  })

  it('several frames: the largest of all of them, wherever it is (local colour tables skipped)', () => {
    const big = gifOf(100, 100, [{ w: 100, h: 100 }, { w: 50, h: 50, lct: true }, { w: 9000, h: 30, lct: true }, { w: 10, h: 10 }])
    expect(sniff(big)).toEqual({ kind: 'gif', width: 9000, height: 100 })
    expect(precheck(file('image/gif', big.length), big)).toEqual({ error: 'tooBig' })
  })

  it('a normal animated GIF (frames inside the screen) is not refused', () => {
    const anim = gifOf(640, 480, [{ w: 640, h: 480 }, { w: 100, h: 80, x: 20, y: 30, lct: true }, { w: 640, h: 480 }])
    expect(sniff(anim)).toEqual({ kind: 'gif', width: 640, height: 480 })
    expect(precheck(file('image/gif', anim.length, 'anim.gif'), anim)).toEqual({ ok: { kind: 'gif', width: 640, height: 480 } })
    expect(precheck(file('image/gif', 100), gif(MAX_SIDE, MAX_SIDE))).toHaveProperty('ok')
  })

  it('cut short anywhere, it never throws and never reports a size (then the whole file is read, or it is not decoded)', () => {
    const full = gifOf(10, 10, [{ w: 10, h: 10 }, { w: 9000, h: 9000, lct: true }])
    for (let n = 10; n < full.length; n++) {
      const cut = full.slice(0, n)
      expect(() => sniff(cut)).not.toThrow()
      expect(sniff(cut)).toEqual({ kind: 'gif', width: null, height: null })
      expect(precheck(file('image/gif', n), cut)).not.toEqual({ ok: expect.objectContaining({ width: 10 }) })
    }
    expect(sniff(full)).toMatchObject({ width: 9000 })
  })

  it('an unknown block, or a frame header cut in half, is no size, not a guess', () => {
    const good = gifOf(10, 10)
    const junk = new Uint8Array([...good.slice(0, -1), 0x99, 0x3b])
    expect(sniff(junk)).toEqual({ kind: 'gif', width: null, height: null })
    expect(sniff(bytes('GIF89a', le16(10), le16(10), [0, 0, 0], [0x2c, 0, 0]))).toEqual({ kind: 'gif', width: null, height: null })
  })
})

describe('decodeSize: big pictures are decoded small', () => {
  it('the long side is at most max, aspect kept, never upscaled', () => {
    expect(decodeSize(4000, 3000, 512)).toEqual({ width: 512, height: 384 })
    expect(decodeSize(1000, 8000, 512)).toEqual({ width: 64, height: 512 })
    expect(decodeSize(100, 50, 512)).toEqual({ width: 100, height: 50 })
    expect(decodeSize(8000, 1, 512)).toEqual({ width: 512, height: 1 })
  })
})

const rgba = (n: number, visible: number, alpha = 255): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < visible; i++) d[i * 4 + 3] = alpha
  return d
}

describe('almostTransparent (C4: 「这张图几乎是透明的」)', () => {
  it('fully transparent, or only faint (alpha < 16) pixels: yes', () => {
    expect(almostTransparent(rgba(10000, 0))).toBe(true)
    expect(almostTransparent(rgba(10000, 10000, 15))).toBe(true)
  })
  it(`under ${VISIBLE_MIN * 100}% visible: yes; at it or above: no`, () => {
    expect(almostTransparent(rgba(10000, 49))).toBe(true)
    expect(almostTransparent(rgba(10000, 50))).toBe(false)
    expect(almostTransparent(rgba(10000, 10000, 16))).toBe(false)
    expect(almostTransparent(rgba(10000, 10000))).toBe(false)
  })
  it('an empty buffer is not judged', () => {
    expect(almostTransparent(new Uint8ClampedArray(0))).toBe(false)
  })
})
