import { describe, expect, it } from 'vitest'
import { blank, EMPTY, setCells } from '../src/core/big-board.ts'
import { BigGame, blocksOf } from '../src/client/big-game.ts'

const filled = (w: number, h: number, v: number) => setCells(blank(w, h), Array.from({ length: w * h }, (_, i) => i), v)

describe('blocksOf', () => {
  it('names blocks row letter + column number and clips the last ones', () => {
    const bl = blocksOf(blank(60, 30), null, 29)
    expect(bl.map(b => b.name)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
    expect(bl[2]).toMatchObject({ x0: 58, x1: 60, y0: 0, y1: 29 })
    expect(bl[5]).toMatchObject({ x0: 58, x1: 60, y0: 29, y1: 30 })
    expect(blocksOf(blank(40, 20), null, 0)).toEqual([{ name: 'A1', x0: 0, y0: 0, x1: 40, y1: 20, pct: 0 }])
  })

  it('without a pattern counts filled cells; with one, right cells (extra beads count against)', () => {
    const b = setCells(blank(8, 8), [0, 1, 2, 3], 4)
    expect(blocksOf(b, null, 0)[0]!.pct).toBe(Math.floor(400 / 64))
    const target = setCells(blank(8, 8), [0, 1], 4)
    // 2 right + 2 extra out of 4 counted cells
    expect(blocksOf(b, target, 0)[0]!.pct).toBe(50)
    expect(blocksOf(setCells(blank(8, 8), [0, 1], 4), target, 0)[0]!.pct).toBe(100)
    expect(blocksOf(blank(8, 8), blank(8, 8), 0)[0]!.pct).toBe(100)
  })
})

describe('BigGame', () => {
  it('one stroke is one undo step; redo; a new edit drops redo', () => {
    const g = new BigGame(blank(58, 58), null, 29, 4)
    g.strokeStart(0, 0)
    g.strokeMove(5, 0)
    g.strokeMove(5, 5)
    g.strokeEnd()
    expect(g.board.cells.filter(c => c === 4)).toHaveLength(11)
    expect(g.canUndo).toBe(true)
    g.undo()
    expect(g.board.cells.every(c => c === EMPTY)).toBe(true)
    expect(g.canRedo).toBe(true)
    g.redo()
    expect(g.board.cells.filter(c => c === 4)).toHaveLength(11)
    g.undo()
    g.applyAt(9, 9)
    expect(g.canRedo).toBe(false)
  })

  it('a no-op adds no step; a cancelled stroke leaves no step', () => {
    const g = new BigGame(blank(30, 30), null, 0, 2)
    g.applyAt(1, 1, 'erase')
    expect(g.canUndo).toBe(false)
    g.strokeStart(2, 2)
    g.strokeMove(8, 2)
    g.strokeCancel()
    expect(g.canUndo).toBe(false)
    expect(g.board.cells.every(c => c === EMPTY)).toBe(true)
  })

  it('keeps 100 steps', () => {
    const g = new BigGame(blank(60, 60), null, 0, 1)
    for (let i = 0; i < 110; i++) g.applyAt(i % 60, (i / 60) | 0)
    let n = 0
    while (g.canUndo) { g.undo(); n++ }
    expect(n).toBe(100)
    expect(g.board.cells.filter(c => c === 1)).toHaveLength(10)
  })

  it('fill, pick, clear and 只看本色', () => {
    const target = setCells(blank(10, 10), [0, 1, 2], 3)
    const g = new BigGame(blank(10, 10), target, 0, 3)
    g.set({ only: true })
    g.strokeStart(0, 0)
    g.strokeMove(9, 0)
    g.strokeEnd()
    expect(g.board.cells.filter(c => c === 3)).toHaveLength(3)
    g.set({ only: false, color: 5 })
    g.applyAt(5, 5, 'fill')
    expect(g.board.cells.filter(c => c === 5)).toHaveLength(97)
    g.applyAt(0, 0, 'pick')
    expect(g.get()).toMatchObject({ color: 3, tool: 'paint' })
    expect(g.clear()).toBe(true)
    expect(g.clear()).toBe(false)
    g.undo()
    expect(g.board.cells.filter(c => c === 5)).toHaveLength(97)
    expect(g.blocks()[0]!.pct).toBe(Math.floor(300 / 100))
  })

  it('an undo mid-stroke closes the stroke first', () => {
    const g = new BigGame(filled(8, 8, 1), null, 0, 2)
    g.strokeStart(0, 0)
    g.strokeMove(3, 0)
    g.undo()
    expect(g.board.cells.every(c => c === 1)).toBe(true)
    expect(g.stroking).toBe(false)
    g.redo()
    expect(g.board.cells.filter(c => c === 2)).toHaveLength(4)
  })
})
