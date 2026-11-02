import { describe, expect, it } from 'vitest'
import * as B from '../src/core/big-board.ts'
import { createBoard, floodFill, MAX_SIDE, MIN_SIDE, paintLine, setCell } from '../src/core/board.ts'
import { HISTORY_LIMIT } from '../src/core/history.ts'
import { COLOR_COUNT, EMPTY } from '../src/core/palette.ts'

describe('big-board helpers (chunk-side copies of entry constants and ops)', () => {
  it('repeats the entry constants exactly', () => {
    expect([B.MIN_SIDE, B.MAX_SIDE, B.EMPTY, B.COLOR_COUNT, B.HISTORY_LIMIT]).toEqual([MIN_SIDE, MAX_SIDE, EMPTY, COLOR_COUNT, HISTORY_LIMIT])
    expect(B.blank(9, 30)).toEqual(createBoard(9, 30))
    expect([7, 8, 208, 209, 8.5].map(B.isSide)).toEqual([false, true, true, false, false])
  })

  it('paints lines and fills regions like board.ts', () => {
    let a = createBoard(40, 23)
    let b = B.blank(40, 23)
    const lines: Array<[number, number, number, number, number]> = [[0, 0, 39, 22, 3], [5, 20, 30, 2, 7], [10, 10, 10, 10, 1], [39, 0, 0, 22, EMPTY]]
    for (const [x0, y0, x1, y1, v] of lines) {
      a = paintLine(a, x0, y0, x1, y1, v)
      b = B.setCells(b, B.lineIdx(40, x0, y0, x1, y1), v)
    }
    expect(b).toEqual(a)
    expect(B.setCells(b, B.regionIdx(b, 41), 9)).toEqual(floodFill(a, 1, 1, 9))
    expect(B.setCells(b, [0], b.cells[0]!)).toBe(b)
    const one = setCell(createBoard(8), 2, 2, 4)
    expect(B.regionIdx(one, 18)).toEqual([18])
  })
})
