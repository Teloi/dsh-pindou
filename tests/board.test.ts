import { describe, expect, it } from 'vitest'
import {
  boardsEqual, clearBoard, countBeads, createBoard, EMPTY, getCell, isBoard, lineCells, paintLine, resizeBoard, setCell,
} from '../src/core/index.ts'

describe('board', () => {
  it('creates empty boards of each size', () => {
    for (const size of [12, 16, 24] as const) {
      const b = createBoard(size)
      expect(b.cells).toHaveLength(size * size)
      expect(countBeads(b)).toBe(0)
    }
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
    const { floodFill } = await import('../src/core/board.ts')
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
