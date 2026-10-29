import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSS_VARS, shortenCssVars } from '../scripts/css-vars.ts'

const ROOT = resolve(import.meta.dirname, '..')
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
})
/** Every `--pd-…` name the client source uses in code (CSS text or inline style keys; not comments). */
function sourceNames(): Set<string> {
  const names = new Set<string>()
  for (const f of files(join(ROOT, 'src/client'))) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
    for (const m of code.matchAll(/--pd-[\w-]*\w/g)) names.add(m[0])
  }
  return names
}

describe('custom property short names (scripts/css-vars.json, the one table)', () => {
  it('covers exactly the names the client source uses', () => {
    const used = sourceNames()
    expect([...used].filter(n => !(n in CSS_VARS)), 'add these to scripts/css-vars.json').toEqual([])
    expect(Object.keys(CSS_VARS).filter(n => !used.has(n)), 'no longer used: remove from scripts/css-vars.json').toEqual([])
  })

  it('short names are unique, --q plus one or two letters, and never a long name', () => {
    const short = Object.values(CSS_VARS)
    expect(new Set(short).size).toBe(short.length)
    for (const s of short) expect(s).toMatch(/^--q[A-Za-z]{1,2}$/)
  })

  it('rewrites whole tokens only, in CSS and inline style keys; unknown tokens stay', () => {
    const t = CSS_VARS['--pd-t']!, fast = CSS_VARS['--pd-t-fast']!, c = CSS_VARS['--pd-c']!
    expect(t).not.toBe(fast)
    expect(shortenCssVars('a{transition:x var(--pd-t-fast),y var(--pd-t)}')).toBe(`a{transition:x var(${fast}),y var(${t})}`)
    expect(shortenCssVars("({ '--pd-c': hex })")).toBe(`({ '${c}': hex })`)
    expect(shortenCssVars('/* --pd-bead-* */ --pd-nope')).toBe('/* --pd-bead-* */ --pd-nope')
  })
})
