// @vitest-environment jsdom
// Regression tests for the style isolation (design I1/B1) and colour contrast (I10).
// The browser-side counterparts (computed styles against the real host) are in
// e2e/audit.mjs, which run.mjs applies to every screenshot.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as icons from '../src/client/icons.tsx'
import { CSS } from '../src/client/styles.ts'

const hex = (h: string): [number, number, number] => {
  const v = h.replace('#', '')
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as [number, number, number]
}
const channel = (x: number): number => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = (c: [number, number, number]): number => {
  const f = channel
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const contrast = (a: string, b: string): number => {
  const x = lum(hex(a)), y = lum(hex(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** The literal a token falls back to when the host does not define it. */
const token = (name: string, block = CSS.slice(0, CSS.indexOf('body[data-ds-dark-theme]'))): string => {
  const m = new RegExp(`${name}:\\s*(?:var\\([^,]+,\\s*)?(#[0-9A-Fa-f]{6})`).exec(block)
  if (!m) throw new Error(`no literal for ${name}`)
  return m[1]!
}

describe('contrast of the fallback palette (WCAG AA 4.5:1 for body text)', () => {
  const bg = token('--pd-bg'), surface = token('--pd-surface'), raised = token('--pd-surface-raised')
  for (const fg of ['--pd-text', '--pd-text-2', '--pd-text-3']) {
    for (const [name, back] of [['bg', bg], ['surface', surface], ['raised', raised]] as const) {
      it(`${fg} on ${name}`, () => { expect(contrast(token(fg), back)).toBeGreaterThanOrEqual(4.5) })
    }
  }
  it('text links on bg and surface', () => {
    expect(contrast(token('--pd-link'), bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('--pd-link'), surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('primary button label on its fill', () => { expect(contrast(token('--pd-primary-label'), token('--pd-primary-fill'))).toBeGreaterThanOrEqual(4.5) })
  it('toast label on the toast', () => { expect(contrast(token('--pd-toast-label'), token('--pd-toast-bg'))).toBeGreaterThanOrEqual(4.5) })
  it('warm (Iron) button label on both ends of its gradient', () => {
    const rule = /\.pd-btn\.pd-warm\{background:linear-gradient\(180deg,(#\w{6}),(#\w{6})\);color:(#\w{6})/.exec(CSS)
    expect(rule).not.toBeNull()
    expect(contrast(rule![3]!, rule![1]!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rule![3]!, rule![2]!)).toBeGreaterThanOrEqual(4.5)
  })
  it('the light theme does not use the host tertiary (3.6:1 on white)', () => {
    expect(token('--pd-text-3')).toBe('#6B6F76')
    expect(contrast('#81858C', '#FFFFFF')).toBeLessThan(4.5)
  })
})

describe('style isolation', () => {
  it('every element and pseudo-element under the panel and portals is reset to round corners and border-box', () => {
    expect(CSS).toContain('.pd-root *,.pd-root *::before,.pd-root *::after,.pd-portal *,.pd-portal *::before,.pd-portal *::after{box-sizing:border-box;corner-shape:round}')
  })
  it('form controls inherit font, colour and spacing instead of UA defaults', () => {
    expect(CSS).toMatch(/:where\(\.pd-root,\.pd-portal\) :where\(button,input,textarea,select\)\{font:inherit;color:inherit;letter-spacing:inherit/)
  })
  it('no rule reintroduces a corner-shape other than round', () => {
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/corner-shape:\s*([\w()., ]+)/g)!.every(d => /corner-shape:\s*round/.test(d))).toBe(true)
  })
  it('icons are sized in one place: .pd-i with --pd-i, no per-context svg sizes', () => {
    expect(CSS).toMatch(/\.pd-i\{width:var\(--pd-i,16px\);height:var\(--pd-i,16px\)/)
    expect(CSS).not.toMatch(/svg\{[^}]*(width|height)/)
    for (const m of CSS.matchAll(/--pd-i:(\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(24)
  })
  it('every icon renders with .pd-i and an intrinsic 16×16 size', () => {
    const entries = Object.entries(icons).filter(([k]) => k.startsWith('Icon'))
    expect(entries.length).toBeGreaterThan(10)
    for (const [name, Icon] of entries) {
      const html = renderToStaticMarkup((Icon as (p: { className?: string }) => ReactElement)({ className: 'x' }))
      expect(html, name).toMatch(/^<svg[^>]* width="16" height="16"/)
      expect(html, name).toMatch(/class="pd-i x"/)
      expect(html, name).toMatch(/aria-hidden="true"/)
    }
  })
  it('no component draws its own <svg>; all icons come from icons.tsx', () => {
    const dir = join(import.meta.dirname, '../src/client/ui')
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('<svg')
  })
})

const count = (s: string): number => (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) ?? []).length

describe('build-time CSS minifier', () => {
  it('drops comments and insignificant whitespace but keeps combinators and calc() spacing', async () => {
    const { minifyCss } = await import('../scripts/minify-css.ts')
    expect(minifyCss('/* x */ .pd-root :focus-visible { outline: 2px solid red ; }\n.a > .b, .c{width:calc(100% + 2 * var(--x)) }'))
      .toBe('.pd-root :focus-visible{outline: 2px solid red}.a > .b,.c{width:calc(100% + 2 * var(--x))}')
  })
  it('the shipped stylesheet keeps every rule of the source', async () => {
    const { minifyCss } = await import('../scripts/minify-css.ts')
    const out = minifyCss(CSS)
    expect(out).not.toMatch(/\/\*/)
    expect(count(out)).toBe(count(CSS))
    expect(out.length).toBeLessThan(CSS.length * 0.95)
  })
})

describe('design walkthrough suggestions that live in the stylesheet', () => {
  const plain = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  it('S1: busy dot breathes in accent 1 ↔ .35 over 1.6 s; the progress dot is warm and still', () => {
    expect(plain).toMatch(/\.pd-entry\.pd-busy \.pd-dot\{[^}]*background:var\(--pd-accent\)[^}]*animation:pd-breathe 1\.6s/)
    expect(plain).toMatch(/\.pd-entry\.pd-has-progress \.pd-dot\{[^}]*background:var\(--pd-warm\)[^}]*animation:none/)
    expect(plain).toContain('@keyframes pd-breathe{0%,100%{opacity:1}50%{opacity:.35}}')
  })
  it('S2: erased beads shrink and fade over --pd-t-erase (90 ms)', () => {
    expect(plain).toMatch(/\.pd-bead\.pd-out\{animation:pd-erase var\(--pd-t-erase\)/)
    expect(plain).toContain('@keyframes pd-erase{to{transform:scale(.6);opacity:0}}')
    expect(plain).toMatch(/--pd-t-erase:\s*90ms/)
  })
  it('S3: the result card waits 80 ms after the ironing sweep', () => {
    expect(plain).toMatch(/\.pd-overlay\.pd-result\{animation-delay:80ms/)
  })
  it('S9: dark beads get a light rim; dark thumbnails get a backdrop', () => {
    expect(plain).toContain('body[data-ds-dark-theme] .pd-root .pd-bead{box-shadow:0 1px 1.5px rgba(0,0,0,.5),inset 0 0 0 .5px rgba(255,255,255,.18)}')
    expect(plain).toContain('body[data-ds-dark-theme] .pd-tpl canvas{background:#2a2b2f}')
  })
  it('S10: every :hover rule sits inside @media (hover:hover)', () => {
    // walk the sheet and track which block each rule is in
    let depth = 0
    let media: string[] = []
    let sel = ''
    const bad: string[] = []
    for (const ch of plain) {
      if (ch === '{') {
        const head = sel.trim()
        if (head.startsWith('@')) media = [...media.slice(0, depth), head]
        else if (head.includes(':hover') && !media.slice(0, depth).some(m => m.includes('(hover:hover)'))) bad.push(head)
        depth++
        sel = ''
      } else if (ch === '}') {
        depth--
        media = media.slice(0, depth)
        sel = ''
      } else if (ch === ';') {
        sel = ''
      } else {
        sel += ch
      }
    }
    expect(bad).toEqual([])
  })
  it('every var(--pd-*) without a fallback is defined in the sheet or set by a component', () => {
    const defined = new Set([...plain.matchAll(/(--pd-[\w-]+)\s*:/g)].map(m => m[1]))
    const files = readdirSync(join(import.meta.dirname, '../src/client'), { recursive: true, encoding: 'utf8' }).filter(f => /\.tsx?$/.test(f))
    for (const f of files) {
      for (const m of readFileSync(join(import.meta.dirname, '../src/client', f), 'utf8').matchAll(/['"](--pd-[\w-]+)['"]/g)) defined.add(m[1])
    }
    const missing = [...plain.matchAll(/var\((--pd-[\w-]+)\)/g)].map(m => m[1]).filter(v => !defined.has(v))
    expect([...new Set(missing)]).toEqual([])
  })
})
