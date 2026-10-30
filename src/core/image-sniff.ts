/**
 * Picture to pattern (spec §18.2): what a file is, judged from its first bytes,
 * before anything decodes it. Pure; ships in the lazy chunk, imports nothing.
 *
 * Order of checks (audit T1): type from the magic bytes (SVG and anything we do
 * not recognise is never handed to a decoder) → file size → width/height from
 * the header → only then decode, downscaled.
 */

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp'
export type SniffError = 'notImage' | 'tooBig' | 'cannotOpen' | 'svg' | 'transparent'

/** 20 MB, spec §18.2. */
export const MAX_BYTES = 20 * 1024 * 1024
/** Longest side, spec §18.2. */
export const MAX_SIDE = 8000
/** How much of the file the sniffer reads (JPEG SOF markers can sit after big EXIF blocks). */
export const SNIFF_BYTES = 256 * 1024

export interface Sniffed {
  readonly kind: ImageKind
  /** From the header; null when the header did not say (then the decoder's size is checked). */
  readonly width: number | null
  readonly height: number | null
}

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false
  return true
}
const u16be = (b: Uint8Array, i: number): number => (b[i]! << 8) | b[i + 1]!
const u16le = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8)
const u32be = (b: Uint8Array, i: number): number => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
const u24le = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
const i32le = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)

function jpegSize(b: Uint8Array): [number, number] | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]!
    if (m === 0xff) { i++; continue }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [u16be(b, i + 7), u16be(b, i + 5)]
    i += 2 + u16be(b, i + 2)
  }
  return null
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (ascii(b, 12, 'VP8X')) return [u24le(b, 24) + 1, u24le(b, 27) + 1]
  if (ascii(b, 12, 'VP8L') && b.length >= 25) {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
  }
  if (ascii(b, 12, 'VP8 ') && b.length >= 30) return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff]
  return null
}

/**
 * GIF (audit N-2): the logical screen size alone can be forged small while a
 * frame is huge, and the browser decodes the frame's size. So walk every block
 * to the trailer and take the furthest any frame reaches (left/top + width/height).
 * Not reaching the trailer (bytes read end first, or a malformed block) is
 * "no size": readPicture then reads the whole file, and a file that still has
 * no trailer is never decoded (cannotOpen) — safe over lenient.
 */
function gifSize(b: Uint8Array): [number, number] | null {
  let w = u16le(b, 6), h = u16le(b, 8), i = 13
  if (b[10]! & 0x80) i += 3 << ((b[10]! & 7) + 1) // global colour table
  const blocks = (): void => { while (i < b.length && b[i]) i += b[i]! + 1; i++ } // sub-blocks to the 0 terminator
  while (i < b.length) {
    const t = b[i]
    if (t === 0x3b) return [w, h]
    if (t === 0x21) { i += 2; blocks() } // extension: label, then sub-blocks
    else if (t === 0x2c && i + 10 <= b.length) {
      w = Math.max(w, u16le(b, i + 1) + u16le(b, i + 5))
      h = Math.max(h, u16le(b, i + 3) + u16le(b, i + 7))
      const f = b[i + 9]!
      i += 10
      if (f & 0x80) i += 3 << ((f & 7) + 1) // local colour table
      i++ // LZW minimum code size
      blocks()
    } else return null
  }
  return null
}

const make = (kind: ImageKind, s: [number, number] | null): Sniffed => ({ kind, width: s?.[0] ?? null, height: s?.[1] ?? null })

/** The image kind and header size, or null when the bytes are not an image we decode. */
export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n')) return make('png', ascii(b, 12, 'IHDR') ? [u32be(b, 16), u32be(b, 20)] : null)
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return make('jpeg', jpegSize(b))
  if (b.length >= 10 && (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'))) return make('gif', gifSize(b))
  if (b.length >= 16 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return make('webp', webpSize(b))
  if (b.length >= 26 && ascii(b, 0, 'BM')) return make('bmp', [Math.abs(i32le(b, 18)), Math.abs(i32le(b, 22))])
  return null
}

/** Does the text start like an SVG document (BOM, XML declaration, comments and doctype allowed)? */
export function isSvgText(head: Uint8Array): boolean {
  const text = String.fromCharCode(...head.subarray(0, 1024))
  return /^(?:\xEF\xBB\xBF|\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i.test(text)
}

/** A decoded picture is 「几乎是透明的」 when fewer than this share of its pixels is visible (alpha ≥ 16). */
export const VISIBLE_MIN = 0.005

/** Spec v2.0 (23:40, C4): almost nothing in the picture is visible. RGBA bytes. */
export function almostTransparent(rgba: ArrayLike<number>): boolean {
  const n = rgba.length >> 2
  let seen = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! >= 16) seen++
  return n > 0 && seen < n * VISIBLE_MIN
}

/**
 * The verdict before decoding. `type` is the browser's MIME guess, `size` the
 * byte length, `head` the first SNIFF_BYTES. SVG (by type, name or text) is
 * never decoded and says so; a file that claims to be an image (or has an image
 * extension) but is not one we decode cannot be opened; anything else that is
 * not an image is 「这个文件不是图片」.
 */
export function precheck(file: { readonly type: string, readonly size: number, readonly name?: string }, head: Uint8Array): { ok: Sniffed } | { error: SniffError } {
  const s = sniff(head)
  if (!s) {
    // SVG gets its own message (spec v2.0 23:40, C4): by its type, its name, or its text (renamed .png too)
    if (/svg/i.test(file.type) || /\.svg$/i.test(file.name ?? '') || isSvgText(head)) return { error: 'svg' }
    const claimsImage = file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|ico|tiff?)$/i.test(file.name ?? '')
    return { error: claimsImage ? 'cannotOpen' : 'notImage' }
  }
  if (file.size > MAX_BYTES) return { error: 'tooBig' }
  if ((s.width ?? 0) > MAX_SIDE || (s.height ?? 0) > MAX_SIDE) return { error: 'tooBig' }
  if (s.width === 0 || s.height === 0) return { error: 'cannotOpen' }
  return { ok: s }
}

/** Size to decode at: the long side at most `max`, never upscaled. */
export function decodeSize(width: number, height: number, max: number): { width: number, height: number } {
  const k = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}
