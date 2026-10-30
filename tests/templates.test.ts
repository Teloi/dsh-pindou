import { describe, expect, it } from 'vitest'
import { countBeads, findTemplate, TEMPLATE_DEFS, TEMPLATES } from '../src/core/index.ts'

describe('templates', () => {
  it('ships 10–12 unique, well-formed 16×16 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10)
    expect(TEMPLATES.length).toBeLessThanOrEqual(12)
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length)
    for (const def of TEMPLATE_DEFS) {
      expect(def.rows, def.id).toHaveLength(16)
      for (const row of def.rows) expect(row, def.id).toMatch(/^[.0-9a-f]{16}$/)
      expect(def.zh.length).toBeGreaterThan(0)
      expect(def.en.length).toBeGreaterThan(0)
    }
  })

  it('every template has enough beads to be worth playing', () => {
    for (const t of TEMPLATES) expect(countBeads(t.board), t.id).toBeGreaterThanOrEqual(30)
  })

  it('looks templates up by id', () => {
    expect(findTemplate('heart')?.en).toBe('Heart')
    expect(findTemplate('nope')).toBeUndefined()
  })
})
