import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every .ts/.tsx source under a directory, path → text. */
const sources = (dir: string): Array<[string, string]> => readdirSync(dir, { withFileTypes: true }).flatMap(e => (
  e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [[join(dir, e.name), readFileSync(join(dir, e.name), 'utf8')] as [string, string]] : []))

describe('first-screen dead code', () => {
  // lib/client.js is the first screen (spec §18.6 budget): a store method no code calls is pure bytes.
  it('every GameStore method and getter is used somewhere in src', () => {
    const all = sources(join(import.meta.dirname, '../src'))
    const store = all.find(([p]) => p.endsWith('game-store.ts'))![1]
    const body = store.slice(store.indexOf('export class GameStore'))
    const names = [...body.matchAll(/^ {2}(?:private |readonly |static |async |get |set )*([a-zA-Z]\w*)\s*[(=:<]/gm)].map(m => m[1]!)
    expect(names.length).toBeGreaterThan(20)
    const text = all.map(([, t]) => t).join('\n')
    const unused = [...new Set(names)].filter(n => n !== 'constructor' && (text.match(new RegExp(`\\b${n}\\b`, 'g')) ?? []).length < 2)
    expect(unused).toEqual([])
  })
})
