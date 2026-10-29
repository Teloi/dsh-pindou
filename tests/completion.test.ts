import { describe, expect, it } from 'vitest'
import { completion, createBoard, remainingByColor, setCell, templateColors, TEMPLATES } from '../src/core/index.ts'

const cat = TEMPLATES.find(t => t.id === 'cat')!

describe('completion', () => {
  it('is 0% on an empty board and 100% only when exact', () => {
    expect(completion(createBoard(16), cat.board)).toMatchObject({ matched: 0, percent: 0, done: false })
    const c = completion(cat.board, cat.board)
    expect(c).toMatchObject({ percent: 100, done: true, wrong: 0 })
    expect(c.total).toBeGreaterThan(0)
  })

  it('counts wrong colours and stray beads, and never shows 100% while wrong', () => {
    let b = cat.board
    b = setCell(b, 0, 0, 4) // stray bead where the template is empty
    const c = completion(b, cat.board)
    expect(c.wrong).toBe(1)
    expect(c.done).toBe(false)
    expect(c.percent).toBe(99)
  })

  it('reports progress proportionally', () => {
    let b = createBoard(16)
    let placed = 0
    cat.board.cells.forEach((v, i) => {
      if (v >= 0 && placed < 10) { b = setCell(b, i % 16, Math.floor(i / 16), v); placed++ }
    })
    const c = completion(b, cat.board)
    expect(c.matched).toBe(10)
    expect(c.percent).toBe(Math.floor((10 / c.total) * 100))
  })

  it('handles mismatched sizes', () => {
    expect(completion(createBoard(12), cat.board).percent).toBe(0)
  })

  it('lists template colours and remaining beads', () => {
    expect(templateColors(cat.board)[0]).toBe(3)
    const left = remainingByColor(createBoard(16), cat.board)
    expect([...left.values()].reduce((a, b) => a + b, 0)).toBe(completion(createBoard(16), cat.board).total)
  })
})
