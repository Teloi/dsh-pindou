import { describe, expect, it } from 'vitest'
import { createBoard, decode, encode, encodeRows, fromShareCode, setCell, toShareCode, TEMPLATES } from '../src/core/index.ts'

describe('codec', () => {
  it('encodes a 16×16 board in 256 characters', () => {
    const b = setCell(setCell(createBoard(16), 0, 0, 10), 15, 15, 15)
    const flat = encode(b)
    expect(flat).toHaveLength(256)
    expect(flat[0]).toBe('a')
    expect(flat.at(-1)).toBe('f')
    expect(encodeRows(b).split('\n')).toHaveLength(16)
  })

  it('round-trips every template and size', () => {
    for (const t of TEMPLATES) {
      const r = decode(encode(t.board), 16)
      expect(r.ok && r.board.cells).toEqual(t.board.cells)
      expect(decode(encodeRows(t.board), 16).ok).toBe(true)
    }
    for (const size of [12, 24] as const) {
      const b = setCell(createBoard(size), 2, 3, 6)
      const r = decode(encode(b), size)
      expect(r.ok && r.board.cells).toEqual(b.cells)
    }
  })

  it('rejects malformed input strictly', () => {
    expect(decode('...', 16)).toEqual({ ok: false, error: 'length' })
    expect(decode('g'.repeat(256), 16)).toEqual({ ok: false, error: 'char' })
    expect(decode('A'.repeat(256), 16)).toEqual({ ok: false, error: 'char' })
    // the data layer takes any side 8–208 (plan §2.3); outside that, or fractional, is a size error
    expect(decode('.'.repeat(49), 7)).toEqual({ ok: false, error: 'size' })
    expect(decode('.'.repeat(209 * 209), 209)).toEqual({ ok: false, error: 'size' })
    expect(decode('.'.repeat(225), 15.5)).toEqual({ ok: false, error: 'size' })
    expect(decode('.'.repeat(8 * 208), 8, 209)).toEqual({ ok: false, error: 'size' })
    expect(decode('.'.repeat(225), 15).ok).toBe(true)
  })

  it('decodes w × h boards row-major, and encodeRows gives h rows of w', () => {
    const b = setCell(createBoard(29, 8), 28, 7, 5)
    expect(b.cells).toHaveLength(29 * 8)
    expect(encodeRows(b).split('\n').map(r => r.length)).toEqual(Array.from({ length: 8 }, () => 29))
    const r = decode(encodeRows(b), 29, 8)
    expect(r.ok && r.board).toEqual(b)
    expect(decode(encode(b), 8, 29).ok && 'transposed sizes decode, as another board').toBeTruthy()
    expect(decode(encode(b), 29, 9)).toEqual({ ok: false, error: 'length' })
    const big = createBoard(208)
    expect(decode(encode(big), 208).ok).toBe(true)
  })

  it('round-trips share codes and rejects junk', () => {
    const b = setCell(createBoard(12), 4, 4, 3)
    expect(fromShareCode(toShareCode(b))?.cells).toEqual(b.cells)
    expect(fromShareCode('pd1:13:...')).toBeUndefined()
    // pd1 stays the square UI sizes only; w × h share codes are pd2 (codec-v4)
    expect(fromShareCode(`pd1:20:${'.'.repeat(400)}`)).toBeUndefined()
    expect(fromShareCode('<script>')).toBeUndefined()
  })
})
