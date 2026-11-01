import { appendFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ALPHABET, SHARE_CODE_MAX, shareCodeFits, decodeV4, encodeV4, expandRuns, hasDeflate, MAX_PAYLOAD, parseShareCode, plainOf, runLength,
} from '../src/core/codec-v4.ts'
import { type Board, createBoard, encode, EMPTY, fromShareCode, setCell, TEMPLATES, toShareCode } from '../src/core/index.ts'

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

function noisy(w: number, h: number, fill: number, seed = 1): Board {
  const r = rng(seed)
  const cells = Array.from({ length: w * h }, () => (r() < fill ? Math.floor(r() * 16) : EMPTY))
  return { w, h, cells: Object.freeze(cells) }
}

function stripes(w: number, h: number): Board {
  const cells = Array.from({ length: w * h }, (_, i) => (Math.floor(i / w / 13) % 3 === 0 ? EMPTY : Math.floor(i / w / 13) % 16))
  return { w, h, cells: Object.freeze(cells) }
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

async function err(code: string): Promise<unknown> {
  const r = await decodeV4(code)
  return r.ok ? 'ok' : r.error
}

describe('codec v4 (pd2)', () => {
  it('has a 64-symbol alphabet whose first 16 are the pd1 codes', () => {
    expect(ALPHABET).toHaveLength(64)
    expect(new Set(ALPHABET).size).toBe(64)
    expect(ALPHABET.slice(0, 16)).toBe('0123456789abcdef')
    expect(ALPHABET).not.toMatch(/[.~]/)
    const b = setCell(createBoard(16), 3, 3, 12)
    expect(plainOf(b)).toBe(encode(b))
  })

  it('round-trips every mode, square and not, from 8 to 208', async () => {
    const boards = [createBoard(8), noisy(29, 58, 0.5), stripes(208, 208), noisy(208, 208, 0.35, 7), noisy(8, 208, 1, 3), ...TEMPLATES.map(t => t.board)]
    for (const board of boards) {
      for (const enc of ['t', 'r', 'z'] as const) {
        const code = await encodeV4(board, { enc })
        expect(code.startsWith(`pd2:${board.w}x${board.h}:${enc}:`)).toBe(true)
        const r = await decodeV4(code)
        expect(r.ok && r.enc).toBe(enc)
        expect(r.ok && r.board).toEqual(board)
      }
    }
  })

  it('picks the shortest mode', async () => {
    const empty = await encodeV4(createBoard(208))
    expect(empty).toMatch(/^pd2:208x208:[rz]:/)
    expect(empty.length).toBeLessThan(80)
    // a small noisy board: neither runs nor deflate beat the plain string
    const tiny = await encodeV4(noisy(8, 8, 1, 9))
    expect(tiny).toMatch(/^pd2:8x8:t:/)
    // 208² photo-like: a pattern with 35 % of the cells replaced by uniform random colours.
    // Measured 21.5 KB as a share code (base64 is 4/3 of the deflate bytes, ≈16 KB): above
    // the plan's ≈14 KB estimate (§4.3), so binary saves (IDB) should keep the raw bytes.
    const r = rng(11)
    const photo = { ...stripes(208, 208), cells: Object.freeze(stripes(208, 208).cells.map(c => (r() < 0.35 ? Math.floor(r() * 16) : c))) }
    const worst = await encodeV4(photo)
    expect(worst).toMatch(/:z:/)
    expect(worst.length).toBeLessThan(22_000)
    expect((await encodeV4(noisy(208, 208, 0.35, 11))).length).toBeLessThan(22_000)
    for (const board of [stripes(208, 208), noisy(58, 58, 0.12)]) {
      const lens = await Promise.all((['t', 'r', 'z'] as const).map(async enc => (await encodeV4(board, { enc })).length))
      expect((await encodeV4(board)).length).toBe(Math.min(...lens))
    }
  })

  it('skips z when deflate is off or missing, and says so on decode', async () => {
    const board = stripes(64, 64)
    expect(await encodeV4(board, { deflate: false })).toMatch(/:[tr]:/)
    const z = await encodeV4(board, { enc: 'z' })
    const { CompressionStream: C, DecompressionStream: D } = globalThis
    try {
      // @ts-expect-error simulate an old engine
      delete globalThis.DecompressionStream
      expect(hasDeflate()).toBe(false)
      expect(await decodeV4(z)).toEqual({ ok: false, error: 'unsupported' })
      expect(await encodeV4(board)).toMatch(/:[tr]:/)
    } finally {
      Object.assign(globalThis, { CompressionStream: C, DecompressionStream: D })
    }
    expect(hasDeflate()).toBe(true)
  })

  it('run-length: runs of 5+ only, split at 4095, exact inverse', () => {
    expect(runLength('aaaa.')).toBe('aaaa.')
    expect(runLength('aaaaa')).toBe('~05a')
    expect(runLength('.'.repeat(4096))).toBe('~__..')
    expect(expandRuns(runLength('.'.repeat(4096)), 4096)).toBe('.'.repeat(4096))
    const s = plainOf(noisy(100, 100, 0.2, 5))
    expect(expandRuns(runLength(s), s.length)).toBe(s)
  })

  it('rejects malformed input strictly', async () => {
    const plain = '.'.repeat(64)
    expect(await err(`pd2:8x8:t:${plain}`)).toBe('ok')
    // header
    for (const bad of ['', 'pd2', `pd3:8x8:t:${plain}`, `pd2:8*8:t:${plain}`, `pd2:8x8:q:${plain}`, `pd2:8x8:t`, `pd2:8x8:t:${plain} x`, `<script>`]) {
      expect(await err(bad)).toBe('format')
    }
    // sides: 8–208, integers, one spelling
    for (const dims of ['7x8', '8x7', '209x8', '8x209', '0x0', '08x8']) expect(await err(`pd2:${dims}:t:${plain}`)).toBe('size')
    // length and characters
    expect(await err(`pd2:8x8:t:${plain}.`)).toBe('length')
    expect(await err(`pd2:8x8:t:${'.'.repeat(63)}`)).toBe('length')
    expect(await err(`pd2:8x8:t:${'.'.repeat(63)}g`)).toBe('char') // colour 16: reserved, not in v0.3
    expect(await err(`pd2:8x8:t:${'.'.repeat(63)}~`)).toBe('char')
    expect((await decodeV4(`pd2:8x8:t:${'.'.repeat(63)}g`, 64)).ok).toBe(true)
    // runs
    expect(await err('pd2:8x8:r:~10.')).toBe('ok')
    expect(await err('pd2:8x8:r:~11.')).toBe('run') // 65 > 64 cells
    expect(await err('pd2:8x8:r:~04.')).toBe('run') // run shorter than 5
    expect(await err('pd2:8x8:r:~0')).toBe('run') // truncated
    expect(await err('pd2:8x8:r:~0~.')).toBe('run')
    expect(await err('pd2:8x8:r:~0z~')).toBe('run')
    expect(await err('pd2:8x8:r:~0z.')).toBe('length') // 35 cells
    // deflate: bad base64, garbage, truncated stream, and a bomb
    expect(await err('pd2:8x8:z:A')).toBe('char')
    expect(await err('pd2:8x8:z:A.AA')).toBe('char')
    expect(await err('pd2:8x8:z:____')).toBe('inflate')
    const good = deflateRawSync(Buffer.from(plain))
    expect(await err(`pd2:8x8:z:${b64(good)}`)).toBe('ok')
    // a cut stream either fails to inflate or comes out short, never ok
    expect(['inflate', 'length']).toContain(await err(`pd2:8x8:z:${b64(good.subarray(0, good.length - 2))}`))
    expect(['inflate', 'length']).toContain(await err(`pd2:8x8:z:${b64(good.subarray(0, 1))}`))
    // a 50 MB bomb is too long a code to even look at; a 5 MB one stops at 43,264 bytes
    expect(await err(`pd2:208x208:z:${b64(deflateRawSync(Buffer.alloc(50_000_000, 46)))}`)).toBe('length')
    const bomb = deflateRawSync(Buffer.alloc(5_000_000, 46))
    expect(b64(bomb).length).toBeLessThan(MAX_PAYLOAD)
    expect(await err(`pd2:208x208:z:${b64(bomb)}`)).toBe('inflate')
    expect(await err(`pd2:8x8:z:${b64(deflateRawSync(Buffer.from('.'.repeat(63))))}`)).toBe('length')
  })

  it('caps the code length before doing any work', async () => {
    expect(MAX_PAYLOAD).toBe(208 * 208)
    expect(await decodeV4(`pd2:208x208:t:${'.'.repeat(MAX_PAYLOAD)}`)).toMatchObject({ ok: true })
    expect(await decodeV4(`pd2:208x208:t:${'.'.repeat(MAX_PAYLOAD + 40)}`)).toEqual({ ok: false, error: 'length' })
  })

  it('reads pd1 share codes as before, and pd2 through the same door', async () => {
    const b = setCell(createBoard(12), 4, 4, 3)
    expect(await parseShareCode(toShareCode(b), fromShareCode)).toEqual(b)
    expect(await parseShareCode(`  ${toShareCode(b)}\n`, fromShareCode)).toEqual(b)
    expect(await parseShareCode('pd1:13:...', fromShareCode)).toBeUndefined()
    const big = noisy(58, 29, 0.4)
    expect(await parseShareCode(await encodeV4(big))).toEqual(big)
    expect(await parseShareCode('pd9:whatever')).toBeUndefined()
    expect(await parseShareCode('pd2:8x8:t:...')).toBeUndefined()
  })

  it('decides up front whether a code fits a copied share code (steering 3)', async () => {
    expect(SHARE_CODE_MAX).toBe(20 * 1024)
    expect(shareCodeFits('x'.repeat(SHARE_CODE_MAX))).toBe(true)
    expect(shareCodeFits('x'.repeat(SHARE_CODE_MAX + 1))).toBe(false)
    // the plain mode is always a candidate, so a w × h board's code is at most w·h + header:
    // every board up to 143² fits, whatever is on it (143² = 20,449 cells)
    const full143 = noisy(143, 143, 1, 5)
    expect(shareCodeFits(await encodeV4(full143))).toBe(true)
    // so at the UI's largest size (116²) the export-file branch cannot be reached; measured:
    const r = rng(11)
    const photo116 = { ...stripes(116, 116), cells: Object.freeze(stripes(116, 116).cells.map(c => (r() < 0.35 ? Math.floor(r() * 16) : c))) }
    const lens = {
      photo116: (await encodeV4(photo116)).length,
      noise116: (await encodeV4(noisy(116, 116, 0.35, 11))).length,
      full116: (await encodeV4(noisy(116, 116, 1, 11))).length,
    }
    for (const n of Object.values(lens)) expect(n).toBeLessThan(SHARE_CODE_MAX)
    expect(lens.full116).toBeLessThanOrEqual(116 * 116 + 16)
    // past 143² a noisy board can overflow: 208² at 35 % noise does
    expect(shareCodeFits(await encodeV4(noisy(208, 208, 0.35, 11)))).toBe(false)
    if (process.env['PD_MEASURE']) appendFileSync(process.env['PD_MEASURE'], `${JSON.stringify(lens)}\n`)
  })
})

describe('codec-v4 limits', () => {
  it('repeats big-board.ts exactly (the store chunk may not import it)', async () => {
    const c = await import('../src/core/codec-v4.ts'), b = await import('../src/core/big-board.ts')
    expect([c.MIN_SIDE, c.MAX_SIDE, c.EMPTY, c.COLOR_COUNT]).toEqual([b.MIN_SIDE, b.MAX_SIDE, b.EMPTY, b.COLOR_COUNT])
  })
})
