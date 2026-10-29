import { afterEach, describe, expect, it } from 'vitest'
import { DAILY_DEFS, DAILY_EPOCH, dailyDate, dailyDay, dailyDayOf, dailyIndex, dailyStreak } from '../src/core/daily.ts'
import { countBeads, decode, TEMPLATES } from '../src/core/index.ts'

/** Spec §9: ≤2 colours and ≤120 beads is 1; ≥6 colours or 24×24 is 3; otherwise 2. */
const difficulty = (colors: number, beads: number, size: number) => colors <= 2 && beads <= 120 ? 1 : colors >= 6 || size === 24 ? 3 : 2

describe('daily patterns (F1, spec §18.3)', () => {
  const built = DAILY_DEFS.map(def => {
    const r = decode(def.rows.join(''), 16)
    if (!r.ok) throw new Error(`daily ${def.id} is malformed (${r.error})`)
    const used = r.board.cells.filter(c => c >= 0)
    return { def, board: r.board, colors: new Set(used).size, beads: used.length }
  })

  it('ships exactly 60 unique, well-formed 16×16 patterns', () => {
    expect(DAILY_DEFS).toHaveLength(60)
    expect(new Set(DAILY_DEFS.map(d => d.id)).size).toBe(60)
    for (const def of DAILY_DEFS) {
      expect(def.id, def.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(def.rows, def.id).toHaveLength(16)
      for (const row of def.rows) expect(row, def.id).toMatch(/^[.0-9a-f]{16}$/)
    }
  })

  it('does not reuse a built-in template id or drawing', () => {
    const ids = new Set(TEMPLATES.map(t => t.id))
    const boards = new Set(TEMPLATES.map(t => t.rows.join('')))
    for (const def of DAILY_DEFS) {
      expect(ids.has(def.id), def.id).toBe(false)
      expect(boards.has(def.rows.join('')), def.id).toBe(false)
    }
    expect(new Set(DAILY_DEFS.map(d => d.rows.join(''))).size).toBe(60)
  })

  it('names are 2–6 Chinese characters and a short English name', () => {
    for (const def of DAILY_DEFS) {
      expect([...def.zh].length, def.id).toBeGreaterThanOrEqual(2)
      expect([...def.zh].length, def.id).toBeLessThanOrEqual(6)
      expect(def.en.trim(), def.id).toBe(def.en)
      expect(def.en.length, def.id).toBeGreaterThan(0)
      expect(def.en.length, def.id).toBeLessThanOrEqual(16)
    }
  })

  it('every pattern has enough beads to be worth playing', () => {
    for (const { def, board } of built) expect(countBeads(board), def.id).toBeGreaterThanOrEqual(30)
  })

  it('mixes difficulties like the built-in set (mostly ●●, some ●, few ●●●)', () => {
    const n = [0, 0, 0, 0]
    for (const { colors, beads, board } of built) n[difficulty(colors, beads, board.size)]!++
    expect(n[1]).toBeGreaterThanOrEqual(6)
    expect(n[2]).toBeGreaterThanOrEqual(30)
    expect(n[3]).toBeGreaterThanOrEqual(3)
    expect(n[3]).toBeLessThanOrEqual(9)
  })
})

/** A local time (the process's zone). */
const at = (y: number, m: number, d: number, h = 12, min = 0): number => new Date(y, m - 1, d, h, min).getTime()

describe('which pattern is today\'s (F1, decision 03:26: days since 2026-01-01 mod 60)', () => {
  const zone = process.env['TZ']
  afterEach(() => { if (zone === undefined) delete process.env['TZ']; else process.env['TZ'] = zone })

  it('day 0 is 2026-01-01 and shows DAILY_DEFS[0] (胡萝卜, the designer\'s day 01), from 00:00 to 23:59', () => {
    expect(DAILY_EPOCH).toBe(Date.UTC(2026, 0, 1))
    for (const [h, min] of [[0, 0], [12, 0], [23, 59]] as const) expect(dailyDay(at(2026, 1, 1, h, min))).toBe(0)
    expect(dailyIndex(0)).toBe(0)
    expect(DAILY_DEFS[dailyIndex(dailyDay(at(2026, 1, 1)))]!.id).toBe('carrot')
    expect(dailyDate(0)).toBe('2026-01-01')
    expect(dailyDayOf('2026-01-01')).toBe(0)
  })

  it('the day before the epoch is day −1, the last pattern', () => {
    expect(dailyDay(at(2025, 12, 31, 23, 59))).toBe(-1)
    expect(dailyIndex(-1)).toBe(59)
    expect(dailyIndex(-60)).toBe(0)
    expect(dailyIndex(-61)).toBe(59)
    expect(dailyDate(-1)).toBe('2025-12-31')
  })

  it('year boundary: 2026-12-31 → 2027-01-01 is one day; 365 days after the epoch is 2027-01-01', () => {
    expect(dailyDay(at(2026, 12, 31, 23, 59))).toBe(364)
    expect(dailyDay(at(2027, 1, 1, 0, 0))).toBe(365)
    expect(dailyIndex(365)).toBe(365 % 60)
    expect(dailyDate(365)).toBe('2027-01-01')
  })

  it('leap day: 2028-02-28, 02-29 and 03-01 are three consecutive days', () => {
    const d = [at(2028, 2, 28), at(2028, 2, 29), at(2028, 3, 1)].map(dailyDay)
    expect(d[1]! - d[0]!).toBe(1)
    expect(d[2]! - d[1]!).toBe(1)
    expect(dailyDate(d[1]!)).toBe('2028-02-29')
    expect(dailyDayOf('2028-02-29')).toBe(d[1])
  })

  it('DST days in America/New_York (23 h and 25 h long) are still one day each, start to end', () => {
    process.env['TZ'] = 'America/New_York'
    expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).toBe(240) // the zone really is in effect
    for (const [m, d] of [[3, 8], [11, 1]] as const) {
      const day = dailyDay(at(2026, m, d, 0, 0))
      expect(dailyDay(at(2026, m, d, 1, 30))).toBe(day)
      expect(dailyDay(at(2026, m, d, 3, 30))).toBe(day)
      expect(dailyDay(at(2026, m, d, 23, 59))).toBe(day)
      expect(dailyDay(at(2026, m, d - 1, 23, 59))).toBe(day - 1)
      expect(dailyDay(at(2026, m, d + 1, 0, 0))).toBe(day + 1)
      expect(dailyDate(day)).toBe(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  })

  it('60 consecutive days show 60 different patterns, then it starts over', () => {
    const start = dailyDay(at(2026, 10, 30))
    const ids = Array.from({ length: 60 }, (_, i) => DAILY_DEFS[dailyIndex(start + i)]!.id)
    expect(new Set(ids).size).toBe(60)
    expect(dailyIndex(start + 60)).toBe(dailyIndex(start))
  })

  it('every value is a whole number (Date.UTC integer days), so the index is always a valid position', () => {
    for (let i = -400; i < 800; i += 7) {
      const day = dailyDay(DAILY_EPOCH + i * 86_400_000 + 5 * 3_600_000)
      expect(Number.isInteger(day)).toBe(true)
      expect(DAILY_DEFS[dailyIndex(day)]).toBeDefined()
    }
    expect(dailyDayOf('2026-1-1')).toBeNaN()
  })
})

describe('streak (F1: derived from the daily works, never stored)', () => {
  it('counts consecutive days ending today, or yesterday while today is still to do', () => {
    expect(dailyStreak([], 10)).toBe(0)
    expect(dailyStreak([10], 10)).toBe(1)
    expect(dailyStreak([8, 9, 10], 10)).toBe(3)
    expect(dailyStreak([8, 9], 10)).toBe(2)
    expect(dailyStreak([7, 8], 10)).toBe(0)
    expect(dailyStreak([5, 6, 8, 9, 10, 10], 10)).toBe(3)
    expect(dailyStreak([8, 10], 10)).toBe(1)
  })
})
