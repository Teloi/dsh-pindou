import { describe, expect, it } from 'vitest'
import * as D from '../src/core/diff-history.ts'
import * as S from '../src/core/history.ts'
import { clearBoard, createBoard, floodFill, getCell, paintLine, resizeBoard, setCell, type Board } from '../src/core/board.ts'

const { begin, cancel, canRedo, canUndo, commit, createHistory, historyBytes, preview, push, redo, stepBytes, undo, HISTORY_BYTES } = D

/** A seeded pattern: every board below is reproducible. */
function noisy(w: number, h = w, seed = 7): Board {
  let b = createBoard(w, h), r = seed
  for (let k = 0; k < (w * h) / 3; k++) {
    r = (r * 1103515245 + 12345) % 2 ** 31
    b = setCell(b, r % w, Math.floor(r / w) % h, r % 16)
  }
  return b
}

/** Drive the snapshot history (history.ts) and the diff one side by side: every state must match. */
type Op = (b: Board) => Board
function sideBySide(start: Board, script: readonly (Op | 'undo' | 'redo' | { stroke: readonly Op[] })[], limit?: number) {
  let s = S.createHistory(start), d = createHistory(start)
  for (const op of script) {
    if (op === 'undo') { s = S.undo(s); d = undo(d) } else if (op === 'redo') { s = S.redo(s); d = redo(d) } else if (typeof op === 'function') {
      s = S.push(s, op(s.present), limit); d = push(d, op(d.present), limit)
    } else {
      s = S.begin(s); d = begin(d)
      for (const f of op.stroke) { s = S.preview(s, f(s.present)); d = preview(d, f(d.present)) }
      s = S.commit(s, limit); d = commit(d, limit)
    }
    expect(d.present).toEqual(s.present)
    expect([d.past.length, d.future.length]).toEqual([s.past.length, s.future.length])
    expect([canUndo(d), canRedo(d)]).toEqual([S.canUndo(s), S.canRedo(s)])
  }
  return { s, d }
}

describe('diff history', () => {
  const base = noisy(24)

  it('matches the snapshot history across strokes, fill, clear and size change', () => {
    const { d } = sideBySide(base, [
      { stroke: [b => paintLine(b, 0, 0, 10, 0, 4), b => paintLine(b, 10, 0, 10, 9, 4)] },
      b => floodFill(b, 5, 5, 2),
      b => clearBoard(b),
      'undo', 'undo', 'redo',
      b => resizeBoard(b, 16),
      b => setCell(b, 1, 1, 9),
      'undo', 'undo', 'undo', 'undo', 'redo', 'redo', 'redo', 'redo', 'redo',
      b => resizeBoard(b, 40, 30),
      { stroke: [b => paintLine(b, 0, 29, 39, 0, 15)] },
      'undo', 'undo', 'undo', 'undo', 'undo', 'undo', 'undo',
      'redo', 'redo', 'redo', 'redo', 'redo', 'redo', 'redo',
    ])
    expect([d.present.w, d.present.h]).toEqual([40, 30])
  })

  it('a size change keeps the whole other board, both ways', () => {
    let h = push(createHistory(base), resizeBoard(base, 12))
    expect(h.past[0]).toBe(base)
    h = undo(h)
    expect(h.present).toBe(base)
    expect((h.future[0] as Board).w).toBe(12)
    h = redo(h)
    expect(h.present.w).toBe(12)
    expect(h.past[0]).toBe(base)
  })

  it('stores 3 B per changed cell, not the board', () => {
    const big = createBoard(208)
    let h = createHistory(big)
    h = push(h, setCell(h.present, 207, 207, 3))
    const s = h.past[0] as Exclude<D.Step, Board>
    expect([...s.i]).toEqual([208 * 208 - 1])
    expect([...s.v]).toEqual([-1])
    expect(stepBytes(s)).toBe(3)
    h = undo(h)
    expect(getCell(h.present, 207, 207)).toBe(-1)
    expect(stepBytes(h.future[0]!)).toBe(3)
    // a 208² fill is one step of 43,264 cells
    h = push(h, floodFill(h.present, 0, 0, 5))
    expect(stepBytes(h.past.at(-1)!)).toBe(208 * 208 * 3)
  })

  it('keeps HISTORY_LIMIT: at most 100 steps, the oldest go', () => {
    let h = createHistory(createBoard(12))
    for (let i = 0; i < 130; i++) h = push(h, setCell(h.present, i % 12, Math.floor(i / 12) % 12, i % 16))
    expect(h.past).toHaveLength(S.HISTORY_LIMIT)
    for (let i = 0; i < 130; i++) h = undo(h)
    expect(h.past).toHaveLength(0)
    expect(h.future).toHaveLength(100)
    // 30 changes were dropped, so the board is the state after change 30, not the empty one
    let ref = createBoard(12)
    for (let i = 0; i < 30; i++) ref = setCell(ref, i % 12, Math.floor(i / 12) % 12, i % 16)
    expect(h.present).toEqual(ref)
    const { s, d } = sideBySide(createBoard(12), Array.from({ length: 20 }, (_, i) => (b: Board) => setCell(b, i, 0, 1)), 5)
    expect(d.past).toHaveLength(5)
    expect(d.present).toEqual(s.present)
  })

  it('keeps the same 100 steps as snapshot undo even for whole-board repaints of 208² (steering 1)', () => {
    let h = createHistory(createBoard(208))
    // each full repaint of 208² is 129,792 B; 100 of them (≈ 13 MB) stay under the 16 MB cap
    for (let i = 0; i < 120; i++) h = push(h, floodFill(clearBoard(h.present), 0, 0, i % 16))
    expect(h.past).toHaveLength(100)
    expect(historyBytes(h)).toBeLessThanOrEqual(HISTORY_BYTES)
  })

  it('caps all steps by bytes, dropping the oldest, and keeps the newest even alone', () => {
    let h = createHistory(createBoard(208))
    for (let i = 0; i < 40; i++) h = push(h, floodFill(clearBoard(h.present), 0, 0, i % 16), 100, 4 * 1024 * 1024)
    expect(h.past).toHaveLength(Math.floor(4 * 1024 * 1024 / (208 * 208 * 3)))
    h = push(createHistory(createBoard(8)), floodFill(createBoard(8), 0, 0, 1), 100, 10)
    expect(h.past).toHaveLength(1)
  })

  it('records a drag as one entry and ignores no-ops', () => {
    let h = begin(createHistory(base))
    for (let x = 0; x < 6; x++) h = preview(h, setCell(h.present, x, 0, 4))
    expect(canUndo(h)).toBe(false)
    h = commit(h)
    expect(h.past).toHaveLength(1)
    expect(stepBytes(h.past[0]!)).toBeLessThanOrEqual(18)
    h = undo(h)
    expect(h.present).toEqual(base)
    h = push(h, h.present)
    expect(h.future).toHaveLength(1)
    h = commit(begin(h))
    expect(h.past).toHaveLength(0)
    expect(h.strokeBase).toBeUndefined()
  })

  it('cancel drops a stroke without an entry and keeps redo', () => {
    let h = push(createHistory(base), setCell(base, 1, 1, 2))
    h = undo(h)
    const before = h
    h = begin(h)
    for (let x = 0; x < 4; x++) h = preview(h, setCell(h.present, x, 3, 5))
    h = cancel(h)
    expect(h.present).toBe(before.present)
    expect([h.past.length, h.future.length, h.strokeBase]).toEqual([0, 1, undefined])
    expect(cancel(h)).toBe(h)
  })

  it('undo during a stroke commits it first; a new change drops redo', () => {
    let h = begin(createHistory(base))
    h = preview(h, setCell(h.present, 0, 0, 1))
    h = undo(h)
    expect(h.present).toEqual(base)
    expect(h.future).toHaveLength(1)
    h = push(h, setCell(h.present, 5, 5, 3))
    expect(canRedo(h)).toBe(false)
  })

  it('never touches the boards it was given', () => {
    const b = noisy(16), before = [...b.cells]
    let h = push(createHistory(b), floodFill(b, 0, 0, 7))
    h = redo(undo(redo(undo(h))))
    expect([...b.cells]).toEqual(before)
    expect(Object.isFrozen(h.present.cells)).toBe(true)
  })

  it('survives rapid alternating undo/redo like the snapshot history', () => {
    const script: ('undo' | 'redo' | Op)[] = Array.from({ length: 10 }, (_, i) => (b: Board) => setCell(b, i, 0, i % 16))
    for (let i = 0; i < 100; i++) script.push(i % 3 === 0 ? 'redo' : 'undo')
    sideBySide(base, script)
  })
})
