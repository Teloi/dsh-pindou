import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en, makeTranslate, zh } from '../src/core/i18n.ts'
import { KEYS } from '../src/client/keys.ts'

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? '').toSorted()

/** Every source file but the dictionary itself. */
const src = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? src(join(dir, e.name)) : /\.tsx?$/.test(e.name) && e.name !== 'i18n.ts' ? [readFileSync(join(dir, e.name), 'utf8')] : []))

describe('i18n', () => {
  it('the ⋯ menu shortcut lines moved to keys.ts (client.big-store.js) word for word, zh and en in step', () => {
    expect(KEYS).toMatchSnapshot()
    expect(KEYS.en).toHaveLength(KEYS.zh.length)
    expect(KEYS.zh[0]).toBe('B 画笔 · E 橡皮 · I 取色 · G 填充')
    expect(KEYS.en.at(-1)).toBe('Esc closes menus and cards')
  })
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
  // The dictionary ships on the first screen (spec §18.6 budget): a string no code names is dead weight.
  it('every key is named somewhere in the source', () => {
    const code = src('src').join('\n')
    expect(Object.keys(zh).filter(k => !code.includes(`'${k}'`))).toEqual([])
  })
})
