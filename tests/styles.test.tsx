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
import { contrast as coreContrast, DARK_BOARD, GHOST_RING_TARGET, GHOST_RINGS, GHOST_RINGS_LIGHT, ghostRing, LIGHT_BOARD, mix as coreMix, PALETTE } from '../src/core/index.ts'

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
/** A plain number token (first definition, i.e. the light theme). */
const numberToken = (name: string): number => Number(new RegExp(`${name}:\\s*([\\d.]+)`).exec(CSS)![1])
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

describe('N10: target ghost dots on the dark board reach 3:1 for all 16 colours', () => {
  const dark = CSS.slice(CSS.indexOf('body[data-ds-dark-theme] .pd-root, body[data-ds-dark-theme] .pd-portal {'))
  it('the core board constant is the dark --pd-board token', () => {
    expect(token('--pd-board', dark)).toBe(DARK_BOARD)
  })
  it('the shipped ring table is exactly what ghostRing() computes for the palette', () => {
    expect(GHOST_RINGS).toEqual(PALETTE.map(c => ghostRing(c.hex)))
  })
  for (const [i, c] of PALETTE.entries()) {
    it(`${c.en} ${c.hex}: ring ${GHOST_RINGS[i]} ≥ 3:1 on ${DARK_BOARD}`, () => {
      expect(contrast(GHOST_RINGS[i]!, DARK_BOARD)).toBeGreaterThanOrEqual(3)
      expect(coreContrast(GHOST_RINGS[i]!, DARK_BOARD)).toBeCloseTo(contrast(GHOST_RINGS[i]!, DARK_BOARD), 6)
    })
  }
  it('the rings are needed: grey-fill alone at the dark ghost alpha falls short for black, navy and brown', () => {
    const alpha = Number(/--pd-ghost-alpha:\s*([\d.]+)/.exec(dark)![1])
    expect(alpha).toBe(0.34)
    const fills = PALETTE.map(c => coreMix(DARK_BOARD, c.hex, alpha))
    expect(fills.filter(f => contrast(f, DARK_BOARD) < 3).length).toBeGreaterThan(8)
  })
  it('the dark theme draws the ring at full strength (faintness in the fill, not in opacity)', () => {
    expect(CSS).toContain('body[data-ds-dark-theme] .pd-root .pd-cell.pd-g::after{box-shadow:inset 0 0 0 1.5px var(--pd-gr)}')
    const ghost = /\.pd-cell\.pd-g::after\{[^}]*\}/.exec(CSS)![0]
    expect(ghost).not.toMatch(/opacity:var\(--pd-ghost/)
    expect(ghost).toContain('color-mix(in srgb,var(--pd-gc) calc(var(--pd-ga) * 100%),transparent)')
  })
  it('ghostRing keeps hue and never returns below target', () => {
    for (const h of ['#000000', '#26272B', '#1C1D20', '#FFFFFF', '#2D4FA0']) expect(contrast(ghostRing(h), DARK_BOARD)).toBeGreaterThanOrEqual(GHOST_RING_TARGET)
  })
})

describe('O3 (spec §18.5): target ghost dots on the light board reach 3:1 for all 16 colours', () => {
  it('the core board constant is the light --pd-board token', () => {
    expect(token('--pd-board')).toBe(LIGHT_BOARD)
  })
  it('the shipped light ring table is exactly what ghostRing() computes for the palette', () => {
    expect(GHOST_RINGS_LIGHT).toEqual(PALETTE.map(c => ghostRing(c.hex, LIGHT_BOARD)))
  })
  it('the light rings are needed: even the full colour falls short for white, cream and the pastels', () => {
    const short = PALETTE.filter(c => contrast(c.hex, LIGHT_BOARD) < 3).map(c => c.en)
    expect(short).toEqual(expect.arrayContaining(['White', 'Cream', 'Yellow', 'Lime']))
    // the §18.5 draft recipe (28% ink over the board, white and cream only) measures well below 3:1
    expect(contrast(coreMix(LIGHT_BOARD, '#0F1115', 0.28), LIGHT_BOARD)).toBeLessThan(3)
  })
  it('the light theme draws a 1px ring at full strength, also on the selected colour', () => {
    expect(/\.pd-cell\.pd-g::after\{[^}]*\}/.exec(CSS)![0]).toContain('box-shadow:inset 0 0 0 1px var(--pd-grl)')
    expect(CSS).toContain('.pd-cell.pd-g.pd-hot::after{box-shadow:inset 0 0 0 1px var(--pd-grl),')
  })
  it('ghostRing on a light board darkens (toward ink), never lightens', () => {
    for (const h of ['#FFFFFF', '#F6F4EE', '#EEF0F3', '#F7C531', '#000000']) {
      const r = ghostRing(h, LIGHT_BOARD)
      expect(contrast(r, LIGHT_BOARD)).toBeGreaterThanOrEqual(GHOST_RING_TARGET)
      expect(coreContrast(r, '#FFFFFF')).toBeGreaterThan(coreContrast(LIGHT_BOARD, '#FFFFFF'))
    }
  })
})

describe('§18.5 acceptance (design R3-1): 16 colours × light/dark × normal/selected, every guide ring ≥ 3:1 on its board', () => {
  const dark = CSS.slice(CSS.indexOf('body[data-ds-dark-theme] .pd-root, body[data-ds-dark-theme] .pd-portal {'))
  const RING_TABLES: Record<string, readonly string[]> = { '--pd-grl': GHOST_RINGS_LIGHT, '--pd-gr': GHOST_RINGS }
  /** The ring a rule draws: its first box-shadow must be an opaque `inset 0 0 0 <w>px var(--table)`. */
  const ringOf = (selector: string): { width: number; table: readonly string[] } => {
    const esc = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rule = new RegExp(`(?:^|[}\\n])${esc}\\{([^}]*)\\}`).exec(CSS)
    if (!rule) throw new Error(`no rule ${selector}`)
    const m = /box-shadow:inset 0 0 0 ([\d.]+)px var\((--pd-grl?)\)/.exec(rule[1]!)
    if (!m) throw new Error(`${selector} draws no ring first: ${rule[1]}`)
    return { width: Number(m[1]), table: RING_TABLES[m[2]!]! }
  }
  const cases = [
    ['light', 'normal', token('--pd-board'), '.pd-cell.pd-g::after'],
    ['light', 'selected', token('--pd-board'), '.pd-cell.pd-g.pd-hot::after'],
    ['dark', 'normal', token('--pd-board', dark), 'body[data-ds-dark-theme] .pd-root .pd-cell.pd-g::after'],
    ['dark', 'selected', token('--pd-board', dark), 'body[data-ds-dark-theme] .pd-root .pd-cell.pd-g.pd-hot::after'],
  ] as const
  for (const [theme, state, board, selector] of cases) {
    describe(`${theme}, ${state}`, () => {
      const { width, table } = ringOf(selector)
      it('ring is at least 1px wide and covers all 16 colours', () => {
        expect(width).toBeGreaterThanOrEqual(1)
        expect(table).toHaveLength(PALETTE.length)
      })
      for (const [i, c] of PALETTE.entries()) {
        it(`${c.code} ${c.en} ${c.hex}: ring ${table[i]} ≥ 3:1 on ${board}`, () => {
          expect(contrast(table[i]!, board)).toBeGreaterThanOrEqual(3)
        })
      }
    })
  }
  it('without the rings no colour would pass on the light board (R3-1 measured 1.01–1.84 normal; selected only black)', () => {
    const board = token('--pd-board')
    expect(PALETTE.filter(c => contrast(coreMix(board, c.hex, numberToken('--pd-ghost-alpha')), board) >= 3)).toHaveLength(0)
    expect(PALETTE.filter(c => contrast(coreMix(board, c.hex, numberToken('--pd-ghost-hot')), board) >= 3).map(c => c.en)).toEqual(['Black'])
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
