import { describe, expect, it } from 'vitest'
import { en, makeTranslate, zh } from '../src/core/i18n.ts'

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? '').toSorted()

describe('i18n', () => {
  it('both dictionaries carry the same keys in the same order, none empty', () => {
    expect(Object.keys(en)).toEqual(Object.keys(zh))
    for (const dict of [zh, en]) {
      for (const [key, text] of Object.entries(dict)) expect(text, key).not.toBe('')
    }
  })

  it('placeholders match between the languages', () => {
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]))
  })

  it('translate substitutes parameters and leaves unknown ones', () => {
    expect(makeTranslate('zh')('homeCount', { n: 3 })).toBe('3 个')
    expect(makeTranslate('en')('tplMeta')).toBe(en.tplMeta)
  })

  // Copy is reviewed by the designer: any wording change shows up here as a snapshot
  // diff (update with `vitest -u` only for an intended change).
  it('copy matches the reviewed wording', () => {
    expect({ zh, en }).toMatchSnapshot()
  })
})
