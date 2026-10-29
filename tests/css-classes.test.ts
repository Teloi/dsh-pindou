import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLASS_TOKEN, CSS_CLASSES, shortenClasses } from '../scripts/css-classes.ts'

const ROOT = resolve(import.meta.dirname, '..')
const files = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) ? [p] : []
})
const code = (f: string): string => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const tokens = (fs: string[]): Set<string> => new Set(fs.flatMap(f => code(f).match(CLASS_TOKEN) ?? []))

describe('class name short names (scripts/css-classes.json, the one table)', () => {
  it('covers exactly the names the client source uses', () => {
    const used = tokens(files(join(ROOT, 'src/client'), /\.tsx?$/))
    expect([...used].filter(n => !(n in CSS_CLASSES)), 'add these to scripts/css-classes.json').toEqual([])
    expect(Object.keys(CSS_CLASSES).filter(n => !used.has(n)), 'no longer used: remove from scripts/css-classes.json').toEqual([])
  })

  it('every name e2e looks for is one the source uses (e2e/classes-hook.mjs maps it to what ships)', () => {
    const asked = tokens(files(join(ROOT, 'e2e'), /\.mjs$/))
    expect([...asked].filter(n => !(n in CSS_CLASSES))).toEqual([])
  })

  it('short names are unique, pd plus one or two letters (never pdf), and never a long name', () => {
    const short = Object.values(CSS_CLASSES)
    expect(new Set(short).size).toBe(short.length)
    for (const s of short) expect(s).toMatch(/^pd[a-z]{1,2}$/)
    expect(short).not.toContain('pdf')
  })

  it('no class name is built from a template (it could not be shortened)', () => {
    const built = files(join(ROOT, 'src/client'), /\.tsx?$/).filter(f => /(?<![\w$-])pd-[\w-]*\$\{/.test(code(f)))
    expect(built).toEqual([])
  })

  it('rewrites whole tokens only: not custom properties, data attributes or longer names', () => {
    const board = CSS_CLASSES['pd-board']!, pic = CSS_CLASSES['pd-pic']!, zone = CSS_CLASSES['pd-pic-zone']!
    expect(pic).not.toBe(zone)
    expect(shortenClasses('.pd-board .pd-pic-zone,.pd-pic{color:var(--pd-accent)}')).toBe(`.${board} .${zone},.${pic}{color:var(--pd-accent)}`)
    expect(shortenClasses('<b data-pd-menu-btn className="pd-board">')).toBe(`<b data-pd-menu-btn className="${board}">`)
    expect(shortenClasses('pd-nope')).toBe('pd-nope')
  })
})
