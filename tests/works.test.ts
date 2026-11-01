import { describe, expect, it } from 'vitest'
import { BOARD_SIZES, createBoard, encode, MAX_WORKS as STORE_MAX, setCell, WORKS_KEY as STORE_KEY } from '../src/core/index.ts'
import { addWork, cleanWorks, MAX_WORK_CHARS, MAX_WORKS, parseWork, parseWorks, removeWork, WORK_SIZES, WORKS_KEY, type Work } from '../src/core/works.ts'

const b12 = encode(setCell(createBoard(12), 0, 0, 3))
const work = (i: number, extra: Partial<Work> = {}): Work => ({ i, n: 12, b: b12, s: null, ...extra })

describe('works wall (core/works.ts, in the works chunk)', () => {
  it('its copies of the entry constants match (the chunk may not import the entry)', () => {
    expect(WORK_SIZES).toEqual(BOARD_SIZES)
    expect(WORKS_KEY).toBe(STORE_KEY)
    expect(MAX_WORKS).toBe(STORE_MAX)
    expect(MAX_WORKS).toBe(60)
  })

  it('accepts a whole work and the sources the store writes', () => {
    expect(parseWork(work(5))).toEqual(work(5))
    expect(parseWork(work(5, { s: 'template:heart' }))).toEqual(work(5, { s: 'template:heart' }))
    expect(parseWork(work(5, { s: 'board:p-abc1', p: b12 }))).toEqual(work(5, { s: 'board:p-abc1', p: b12 }))
  })

  it('drops a broken entry on its own, keeps the rest (corrupt storage)', () => {
    const raw = [
      work(1), null, 'x', { ...work(2), i: 2.5 }, { ...work(3), n: 13 }, { ...work(4), b: 'zz' }, { ...work(5), s: 'javascript:alert(1)' },
      { ...work(6), s: null, p: b12 }, { ...work(7), b: b12.slice(1) }, work(8), work(8), { ...work(9), i: -1 }, work(10, { s: 'board:x', p: 'y'.repeat(MAX_WORK_CHARS) }),
    ]
    const { works, dropped } = cleanWorks(raw)
    expect(works.map(w => w.i)).toEqual([1, 8])
    expect(dropped).toBe(true)
    expect(parseWorks(JSON.stringify(raw)).works.map(w => w.i)).toEqual([1, 8])
  })

  it('unbroken storage is not rewritten; broken JSON or a non-array is an empty wall', () => {
    expect(cleanWorks([work(1), work(2)])).toEqual({ works: [work(1), work(2)], dropped: false })
    expect(parseWorks(null)).toEqual({ works: [], dropped: false })
    expect(parseWorks('{"i":1')).toEqual({ works: [], dropped: true })
    expect(parseWorks('{"i":1}')).toEqual({ works: [], dropped: true })
    // out of order: sorted, and written back
    expect(cleanWorks([work(2), work(1)])).toEqual({ works: [work(1), work(2)], dropped: true })
  })

  it('the 61st work pushes out the oldest', () => {
    let wall: Work[] = []
    for (let i = 1; i <= 61; i++) wall = addWork(wall, work(i))
    expect(wall).toHaveLength(60)
    expect(wall[0]!.i).toBe(2)
    expect(wall.at(-1)!.i).toBe(61)
    expect(cleanWorks(Array.from({ length: 61 }, (_, k) => work(k + 1))).works.map(w => w.i)[0]).toBe(2)
  })

  it('removes by id (undo puts it back in place)', () => {
    const wall = [work(1), work(2), work(3)]
    const without = removeWork(wall, 2)
    expect(without.map(w => w.i)).toEqual([1, 3])
    expect(addWork(without, work(2)).map(w => w.i)).toEqual([1, 2, 3])
  })
})
