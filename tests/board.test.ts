import { describe, expect, it } from 'vitest'
import {
  boardsEqual, clearBoard, countBeads, createBoard, EMPTY, floodFill, getCell, isBoard, isSide, lineCells, paintLine, resizeBoard, setCell,
} from '../src/core/index.ts'

describe('board', () => {
  it('creates empty boards of each size', () => {
    for (const size of [12, 16, 24] as const) {
      const b = createBoard(size)
      expect(b.cells).toHaveLength(size * size)
      expect(countBeads(b)).toBe(0)
    }
  })

  it('creates w × h boards for every side the data layer takes (8–208)', () => {
    const b = createBoard(29, 58)
    expect([b.w, b.h, b.cells.length]).toEqual([29, 58, 29 * 58])
    expect(createBoard(208).cells).toHaveLength(43264)
    expect(isSide(8) && isSide(208) && isSide(57)).toBe(true)
    expect([7, 209, 16.5, '16', null].some(v => isSide(v))).toBe(false)
  })

  it('addresses non-square boards as cells[y * w + x]', () => {
    let b = createBoard(10, 20)
    b = setCell(b, 9, 19, 3)
    expect(b.cells[19 * 10 + 9]).toBe(3)
    expect(getCell(b, 9, 19)).toBe(3)
    expect(setCell(b, 10, 0, 1)).toBe(b)
    expect(setCell(b, 0, 20, 1)).toBe(b)
    b = paintLine(b, 0, 0, 9, 0, 2)
    expect(countBeads(b)).toBe(11)
    const f = floodFill(createBoard(10, 20), 0, 0, 4)
    expect(f.cells.every(c => c === 4)).toBe(true)
    expect(clearBoard(f)).toEqual(createBoard(10, 20))
    expect(isBoard(f)).toBe(true)
    expect(isBoard({ w: 10, h: 20, cells: f.cells.slice(1) })).toBe(false)
    expect(isBoard({ size: 16, cells: createBoard(16).cells })).toBe(false)
  })

  it('resizes non-square boards keeping the drawing centred per axis', () => {
    const b = setCell(createBoard(12), 6, 6, 1)
    const r = resizeBoard(b, 16, 24)
    expect([r.w, r.h]).toEqual([16, 24])
    expect(getCell(r, 8, 12)).toBe(1)
    expect(resizeBoard(r, 12)).toEqual(b)
    expect(resizeBoard(b, 12, 12)).toBe(b)
  })

  it('paints a 208² drag with one copy per segment', () => {
    const b = createBoard(208)
    const t0 = performance.now()
    let n = b
    for (let i = 0; i < 200; i++) n = paintLine(n, 0, i, 207, i, i % 16)
    expect(countBeads(n)).toBe(200 * 208)
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('sets and reads cells immutably', () => {
    const a = createBoard(16)
    const b = setCell(a, 3, 2, 4)
    expect(getCell(b, 3, 2)).toBe(4)
    expect(getCell(a, 3, 2)).toBe(EMPTY)
    expect(Object.isFrozen(b.cells)).toBe(true)
  })

  it('returns the same object for no-op and out-of-bounds writes', () => {
    const a = setCell(createBoard(12), 0, 0, 1)
    expect(setCell(a, 0, 0, 1)).toBe(a)
    expect(setCell(a, -1, 0, 1)).toBe(a)
    expect(setCell(a, 12, 0, 1)).toBe(a)
    expect(setCell(a, 1.5, 0, 1)).toBe(a)
  })

  it('treats invalid colour values as erase', () => {
    const a = setCell(createBoard(12), 1, 1, 2)
    expect(getCell(setCell(a, 1, 1, 99), 1, 1)).toBe(EMPTY)
    expect(getCell(setCell(a, 1, 1, Number.NaN), 1, 1)).toBe(EMPTY)
  })

  it('draws gap-free lines for fast drags', () => {
    expect(lineCells(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
    const diag = lineCells(0, 0, 5, 3)
    expect(diag[0]).toEqual([0, 0])
    expect(diag.at(-1)).toEqual([5, 3])
    for (let i = 1; i < diag.length; i++) {
      expect(Math.abs(diag[i]![0] - diag[i - 1]![0])).toBeLessThanOrEqual(1)
      expect(Math.abs(diag[i]![1] - diag[i - 1]![1])).toBeLessThanOrEqual(1)
    }
    expect(countBeads(paintLine(createBoard(16), 0, 0, 15, 15, 7))).toBe(16)
  })

  it('clears and resizes keeping the drawing centred', () => {
    const a = setCell(createBoard(12), 0, 0, 5)
    expect(countBeads(clearBoard(a))).toBe(0)
    const empty = createBoard(12)
    expect(clearBoard(empty)).toBe(empty)
    const big = resizeBoard(a, 16)
    expect(getCell(big, 2, 2)).toBe(5)
    const back = resizeBoard(big, 12)
    expect(boardsEqual(back, a)).toBe(true)
    expect(resizeBoard(a, 12)).toBe(a)
  })

  it('validates untrusted board shapes', () => {
    expect(isBoard(createBoard(16))).toBe(true)
    expect(isBoard({ size: 15, cells: [] })).toBe(false)
    expect(isBoard({ size: 12, cells: Array.from({ length: 144 }, () => 16) })).toBe(false)
    expect(isBoard(null)).toBe(false)
  })
})

describe('floodFill', () => {
  it('fills a 4-connected region and stops at borders', async () => {
    let b = createBoard(12)
    for (let y = 0; y < 12; y++) b = setCell(b, 5, y, 3)
    const f = floodFill(b, 0, 0, 7)
    expect(getCell(f, 4, 11)).toBe(7)
    expect(getCell(f, 5, 3)).toBe(3)
    expect(getCell(f, 6, 0)).toBe(-1)
    expect(floodFill(f, 0, 0, 7)).toBe(f)
    expect(floodFill(f, 99, 0, 1)).toBe(f)
  })
})
