import { describe, expect, it } from 'vitest'
import {
  begin, canRedo, canUndo, commit, createBoard, createHistory, getCell, preview, push, redo, setCell, undo,
} from '../src/core/index.ts'

describe('history', () => {
  const base = createBoard(12)

  it('undoes and redoes single changes', () => {
    let h = createHistory(base)
    expect(canUndo(h)).toBe(false)
    h = push(h, setCell(h.present, 0, 0, 1))
    h = push(h, setCell(h.present, 1, 0, 2))
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(getCell(h.present, 1, 0)).toBe(-1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(getCell(h.present, 1, 0)).toBe(2)
    expect(canRedo(h)).toBe(false)
  })

  it('drops the redo branch on a new change', () => {
    let h = push(createHistory(base), setCell(base, 0, 0, 1))
    h = undo(h)
    h = push(h, setCell(h.present, 5, 5, 3))
    expect(canRedo(h)).toBe(false)
  })

  it('records a drag as one entry', () => {
    let h = begin(createHistory(base))
    for (let x = 0; x < 6; x++) h = preview(h, setCell(h.present, x, 0, 4))
    h = commit(h)
    expect(h.past).toHaveLength(1)
    h = undo(h)
    expect(h.present).toBe(base)
  })

  it('ignores no-op pushes and empty strokes', () => {
    let h = createHistory(base)
    h = push(h, h.present)
    expect(h.past).toHaveLength(0)
    h = commit(begin(h))
    expect(h.past).toHaveLength(0)
    expect(h.strokeBase).toBeUndefined()
  })

  it('undo during a stroke commits it first', () => {
    let h = begin(createHistory(base))
    h = preview(h, setCell(h.present, 0, 0, 1))
    h = undo(h)
    expect(h.present).toBe(base)
    expect(h.future).toHaveLength(1)
  })

  it('caps the history length', () => {
    let h = createHistory(base)
    for (let i = 0; i < 20; i++) h = push(h, setCell(h.present, i % 12, Math.floor(i / 12), 1), 5)
    expect(h.past).toHaveLength(5)
  })

  it('survives rapid alternating undo/redo', () => {
    let h = createHistory(base)
    for (let i = 0; i < 10; i++) h = push(h, setCell(h.present, i, 0, i % 16))
    for (let i = 0; i < 100; i++) h = i % 3 === 0 ? redo(h) : undo(h)
    expect(h.past.length + h.future.length).toBe(10)
  })
})
