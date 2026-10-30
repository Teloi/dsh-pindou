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
    expect(decode('.'.repeat(225), 15 as never)).toEqual({ ok: false, error: 'size' })
  })

  it('round-trips share codes and rejects junk', () => {
    const b = setCell(createBoard(12), 4, 4, 3)
    expect(fromShareCode(toShareCode(b))?.cells).toEqual(b.cells)
    expect(fromShareCode('pd1:13:...')).toBeUndefined()
    expect(fromShareCode('<script>')).toBeUndefined()
  })
})
