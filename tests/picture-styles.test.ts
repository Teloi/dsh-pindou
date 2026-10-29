// Design I2: the zoom slider is drawn by us (the reset drops native appearance), so its
// track has to be visible in both themes. The real pixels are checked in e2e (light and
// dark); this pins the rules and the light-theme fallback contrast.
import { describe, expect, it } from 'vitest'
import { PICTURE_CSS } from '../src/client/picture-styles.ts'

const hex = (h: string): number[] => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16))
const linear = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ([r = 0, g = 0, b = 0]: number[]): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const ratio = (a: number[], b: number[]): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

const rule = (sel: string): string => PICTURE_CSS.split('\n').find(l => l.startsWith(`.pd-pic-row input[type=range]${sel}{`)) ?? ''

describe('zoom slider (design I2)', () => {
  it('a 4px round track, the filled share in accent, a 16px accent thumb, in Chromium and Firefox', () => {
    expect(rule('::-webkit-slider-runnable-track')).toMatch(/height:4px;border-radius:2px;background:linear-gradient\(to right,var\(--pd-accent\) var\(--pd-v,0%\),var\(--pd-track\) 0\)/)
    expect(rule('::-moz-range-track')).toMatch(/height:4px;.*background:var\(--pd-track\)/)
    expect(rule('::-moz-range-progress')).toMatch(/background:var\(--pd-accent\)/)
    for (const t of ['::-webkit-slider-thumb', '::-moz-range-thumb']) expect(rule(t)).toMatch(/width:16px;height:16px;.*border-radius:50%;background:var\(--pd-accent\)/)
    expect(rule('')).toMatch(/background:none/)
  })
  it('the unfilled track is ≥3:1 on the page with the fallback tokens (--pd-border alone is not)', () => {
    const mix = /--pd-track:color-mix\(in srgb,var\(--pd-text-2\) (\d+)%,var\(--pd-bg\)\)/.exec(PICTURE_CSS)
    expect(mix).not.toBeNull()
    const p = Number(mix![1]) / 100, text2 = hex('#61666B'), bg = [255, 255, 255]
    const track = text2.map((v, i) => v * p + bg[i]! * (1 - p))
    expect(ratio(track, bg)).toBeGreaterThanOrEqual(3)
    expect(ratio([229, 229, 229], bg)).toBeLessThan(3) // rgba(0,0,0,.10) on white
  })
})
