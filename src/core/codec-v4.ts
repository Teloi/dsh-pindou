/**
 * Codec v4 (plan §4.3): share codes and saves for `w × h` boards up to 208².
 *
 *   pd2:<w>x<h>:<enc>:<payload>
 *
 * - cells: one character each, row-major. Colour i is `ALPHABET[i]` (64
 *   symbols reserved, v0.3 uses the first 16, which are pd1's `0`–`f`), `.` is
 *   empty. So a 16-colour `t` payload is exactly the pd1 flat string.
 * - `enc` = `t` plain · `r` run-length · `z` deflate-raw of the plain string,
 *   base64url without padding. The encoder tries all three and keeps the
 *   shortest (ties: t, then r, then z).
 * - `r`: a run of n ≥ 5 equal cells is `~` + n in two alphabet digits
 *   (n = 64·hi + lo, at most 4095) + the cell; longer runs are split; anything
 *   else is the cells as they are.
 *
 * Async because `z` goes through the browser's CompressionStream. Decoding is
 * strict and bounded: the side is 8–208, the payload length is capped before
 * any work, and inflate stops as soon as the output passes w × h.
 *
 * Not exported from core/index.ts: nothing on the first screen imports it; the
 * big page's store chunk (client.big-store.js) does, so it imports no entry module
 * and nothing the big chunk has (not even big-board.ts). pd1 stays readable through {@link parseShareCode} with the
 * entry's pd1 decoder passed in.
 */
import type { Board } from './board.ts'

// big-board.ts's limits, repeated: this module ships in lib/client.big-store.js, which may share no
// module with lib/client.big.js (the loader can't require one chunk from another); a test keeps them equal
export const MIN_SIDE = 8
export const MAX_SIDE = 208
export const EMPTY = -1
export const COLOR_COUNT = 16
const isSide = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_SIDE && (v as number) <= MAX_SIDE

/** 64 colour symbols; the first 16 are pd1's codes. */
export const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
const EMPTY_CH = '.'
const RUN = '~'
const MIN_RUN = 5
const MAX_RUN = 64 * 64 - 1
/** Longest payload any mode can produce for a 208² board (plain = 43,264 chars). */
export const MAX_PAYLOAD = MAX_SIDE * MAX_SIDE

export type Enc = 't' | 'r' | 'z'
export type DecodeV4Error = 'format' | 'size' | 'length' | 'char' | 'run' | 'inflate' | 'unsupported'
export type DecodeV4Result =
  | { readonly ok: true; readonly board: Board; readonly enc: Enc }
  | { readonly ok: false; readonly error: DecodeV4Error }

const fail = (error: DecodeV4Error): DecodeV4Result => ({ ok: false, error })

function cellChar(v: number): string {
  return v >= 0 && v < ALPHABET.length ? ALPHABET[v]! : EMPTY_CH
}

/** The plain (`t`) payload. */
export function plainOf(board: Board): string {
  let s = ''
  for (const c of board.cells) s += cellChar(c)
  return s
}

/** Run-length (`r`) form of a plain payload. */
export function runLength(plain: string): string {
  const out: string[] = []
  for (let i = 0; i < plain.length;) {
    const ch = plain[i]!
    let n = 1
    while (n < MAX_RUN && plain[i + n] === ch) n++
    out.push(n >= MIN_RUN ? RUN + ALPHABET[n >> 6]! + ALPHABET[n & 63]! + ch : ch.repeat(n))
    i += n
  }
  return out.join('')
}

/** Expand an `r` payload; undefined when malformed or longer than `limit`. */
export function expandRuns(payload: string, limit: number): string | undefined {
  const out: string[] = []
  let len = 0
  for (let i = 0; i < payload.length;) {
    if (payload[i] === RUN) {
      const hi = ALPHABET.indexOf(payload[i + 1] ?? '')
      const lo = ALPHABET.indexOf(payload[i + 2] ?? '')
      const ch = payload[i + 3]
      const n = hi * 64 + lo
      if (hi < 0 || lo < 0 || ch === undefined || ch === RUN || n < MIN_RUN) return undefined
      len += n
      if (len > limit) return undefined
      out.push(ch.repeat(n))
      i += 4
    } else {
      if (++len > limit) return undefined
      out.push(payload[i]!)
      i++
    }
  }
  return out.join('')
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const k = Math.min(3, bytes.length - i) + 1
    for (let j = 0; j < k; j++) s += B64[(n >> (18 - 6 * j)) & 63]
  }
  return s
}

function fromBase64Url(text: string): Uint8Array | undefined {
  if (text.length % 4 === 1) return undefined
  const out = new Uint8Array(Math.floor(text.length * 3 / 4))
  let o = 0
  for (let i = 0; i < text.length; i += 4) {
    let n = 0
    const k = Math.min(4, text.length - i)
    for (let j = 0; j < 4; j++) {
      const v = j < k ? B64.indexOf(text[i + j]!) : 0
      if (v < 0) return undefined
      n = (n << 6) | v
    }
    for (let j = 0; j < k - 1; j++) out[o++] = (n >> (16 - 8 * j)) & 255
  }
  return out
}

/** Can this environment do the `z` mode? */
export function hasDeflate(g: typeof globalThis = globalThis): boolean {
  return typeof g.CompressionStream === 'function' && typeof g.DecompressionStream === 'function'
}

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Inflate, giving up (undefined) once the output passes `limit` bytes or the data is bad. */
async function inflate(bytes: Uint8Array, limit: number): Promise<string | undefined> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const parts: Uint8Array[] = []
  let len = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      len += value.length
      if (len > limit) { void reader.cancel().catch(() => {}); return undefined }
      parts.push(value)
    }
  } catch {
    return undefined
  }
  const all = new Uint8Array(len)
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  return new TextDecoder().decode(all)
}

export interface EncodeOptions {
  /** Force one mode (tests, benchmarks); default picks the shortest. */
  readonly enc?: Enc
  readonly deflate?: boolean
}

/** `pd2:<w>x<h>:<enc>:<payload>`, the shortest of t / r / z unless `enc` is forced. */
export async function encodeV4(board: Board, opts: EncodeOptions = {}): Promise<string> {
  const plain = plainOf(board)
  const head = `pd2:${board.w}x${board.h}:`
  const cands: Array<[Enc, string]> = []
  if (!opts.enc || opts.enc === 't') cands.push(['t', plain])
  if (!opts.enc || opts.enc === 'r') cands.push(['r', runLength(plain)])
  if ((!opts.enc && opts.deflate !== false && hasDeflate()) || opts.enc === 'z') cands.push(['z', toBase64Url(await deflate(plain))])
  let best = cands[0]!
  for (const c of cands) if (c[1].length < best[1].length) best = c
  return `${head}${best[0]}:${best[1]}`
}

const HEAD_RE = /^pd2:(\d{1,3})x(\d{1,3}):([trz]):([\w.~-]*)$/

/**
 * Strict pd2 decode. `colors` is how many palette entries are valid (v0.3: 16);
 * a symbol past it is a `char` error, as is anything outside the alphabet.
 */
export async function decodeV4(code: string, colors: number = COLOR_COUNT): Promise<DecodeV4Result> {
  const text = code.trim()
  if (text.length > MAX_PAYLOAD + 32) return fail('length')
  const m = HEAD_RE.exec(text)
  if (!m) return fail('format')
  const w = Number(m[1])
  const h = Number(m[2])
  // no leading zeros: one board, one spelling
  if (!isSide(w) || !isSide(h) || `${w}x${h}` !== `${m[1]}x${m[2]}`) return fail('size')
  const enc = m[3] as Enc
  const payload = m[4]!
  const n = w * h
  let plain: string | undefined
  if (enc === 't') plain = payload
  else if (enc === 'r') {
    plain = expandRuns(payload, n)
    if (plain === undefined) return fail('run')
  } else {
    if (!hasDeflate()) return fail('unsupported')
    const bytes = fromBase64Url(payload)
    if (!bytes) return fail('char')
    plain = await inflate(bytes, n)
    if (plain === undefined) return fail('inflate')
  }
  if (plain.length !== n) return fail('length')
  const cells: number[] = []
  for (let i = 0; i < n; i++) {
    const ch = plain[i]!
    if (ch === EMPTY_CH) { cells.push(EMPTY); continue }
    const v = ALPHABET.indexOf(ch)
    if (v < 0 || v >= colors) return fail('char')
    cells.push(v)
  }
  return { ok: true, enc, board: { w, h, cells: Object.freeze(cells) } }
}

/**
 * Any share code: pd1 (square, through `pd1`, the entry's codec.ts decoder) or
 * pd2. Undefined for anything else or invalid.
 */
export async function parseShareCode(code: string, pd1?: (code: string) => Board | undefined, colors: number = COLOR_COUNT): Promise<Board | undefined> {
  const text = code.trim()
  if (text.startsWith('pd1:')) return pd1?.(text)
  const r = await decodeV4(text, colors)
  return r.ok ? r.board : undefined
}

/**
 * Longest share code the UI offers to copy (steering 3, plan §4.3): past it the
 * copy button is swapped for 「导出图纸文件」 before anyone clicks. A code is
 * never cut short; a board whose code does not fit is shared as a file.
 */
export const SHARE_CODE_MAX = 20 * 1024

/** Does this code fit in a copied share code? (Measured up front, never by trying.) */
export const shareCodeFits = (code: string): boolean => code.length <= SHARE_CODE_MAX
