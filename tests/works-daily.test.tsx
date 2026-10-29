// @vitest-environment jsdom
// F1 每日一拼, all in the works chunk: today's pattern on top of the wall page (start /
// continue / again), the streak derived from the daily works, the badge, the label, the
// delete note, and 再拼一次 keeping a daily a daily.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameStore } from '../src/client/game-store.ts'
import { renderExport } from '../src/client/render.ts'
import type { Env } from '../src/client/ui/context.tsx'
import { DAILY_DEFS, dailyDay, dailyIndex } from '../src/core/daily.ts'
import { decode, encode, findTemplate, makeTranslate, SafeStore, type StoredWork } from '../src/core/index.ts'
import * as chunk from '../src/client/works.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
/** 2026-10-30 12:00 local: day 302 since 2026-01-01, pattern 302 mod 60 = 2. */
const NOW = new Date(2026, 9, 30, 12).getTime()
const DAY = 86_400_000
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => sink) as never)
  host = document.createElement('div')
  host.className = 'pd-root'
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => { root.unmount() })
  vi.useRealTimers()
  vi.restoreAllMocks()
  host.remove()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

const kit = { render: renderExport, decode, template: findTemplate, exportBoard: async () => false, copyBoard: async () => false, copySupported: () => false } as unknown as Parameters<typeof chunk.WorksRow>[0]['kit']
const env = (lang: 'zh' | 'en' = 'zh', reduced = true): Env => ({
  store: new GameStore({ store: new SafeStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }), saveDelayMs: 0, reducedMotion: () => reduced }),
  lang, t: makeTranslate(lang), reducedMotion: () => reduced, dark: () => false,
})
const today = DAILY_DEFS[2]!
const pattern = (def = today): string => def.rows.join('')
/** A daily work of the given date (ironed at noon that day). */
const daily = (date: string, at = Date.parse(`${date}T04:00:00Z`)): StoredWork => ({ i: at, n: 16, b: pattern(), s: `board:p-daily-${date}-abc`, p: pattern() })
const tpl = (i: number): StoredWork => ({ i, n: 16, b: encode(findTemplate('heart')!.board), s: 'template:heart' })
const card = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('.pd-wdaily')!
const mount = async (e: Env, wall: readonly StoredWork[]): Promise<void> => {
  await act(async () => { root.render(<chunk.WorksPage env={e} kit={kit} wall={wall} />) })
}

describe('F1: today\'s pattern on the wall page', () => {
  it('2026-10-30 is day 302, pattern 2; the card names it, no streak yet, 开始', async () => {
    expect(dailyIndex(dailyDay(NOW))).toBe(2)
    await mount(env(), [])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}开始`)
    expect(host.querySelector('.pd-wday + .pd-wempty')).not.toBeNull() // above the empty wall too
  })

  it('开始 starts a new game following today\'s pattern, keyed board:p-daily-2026-10-30-…, on the play page', async () => {
    const e = env()
    await mount(e, [])
    await act(async () => { card().click() })
    const g = e.store.getSnapshot()
    expect(g.mode).toBe('play')
    expect(g.target).toMatch(/^board:p-daily-2026-10-30-[0-9a-z]+$/)
    expect(encode(g.targetBoard!)).toBe(pattern())
    expect(chunk.dailyOf(g.target)).toBe('2026-10-30')
  })

  it('with today\'s game unfinished it says 继续 and goes back to it (no new game)', async () => {
    const e = env()
    await mount(e, [])
    await act(async () => { card().click() })
    const target = e.store.getSnapshot().target
    e.store.go('works')
    await mount(e, [])
    expect(card().textContent).toMatch(/继续$/)
    await act(async () => { card().click() })
    expect(e.store.getSnapshot().target).toBe(target)
    expect(e.store.getSnapshot().mode).toBe('play')
  })

  it('the streak counts back from today, or from yesterday while today is still to do; 再拼一次 once today is done', async () => {
    await mount(env(), [daily('2026-10-28'), daily('2026-10-29'), tpl(NOW - 3 * DAY)])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}连续 2 天开始`)
    await mount(env(), [daily('2026-10-27'), daily('2026-10-28'), daily('2026-10-29'), daily('2026-10-30')])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}连续 4 天再拼一次`)
    await mount(env(), [daily('2026-10-27'), daily('2026-10-28')])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}开始`)
    await mount(env('en'), [daily('2026-10-29')])
    expect(card().textContent).toBe(`Daily · ${today.en}1-day streakStart`)
  })

  it('through the real store: iron today\'s daily and the streak takes it (derived from the wall, nothing else stored)', async () => {
    const e = env()
    e.store.setWall([daily('2026-10-29')])
    await mount(e, e.store.works())
    await act(async () => { card().click() })
    e.store.fillTarget()
    e.store.iron()
    const wall = e.store.works()
    expect(wall.at(-1)?.s).toMatch(/^board:p-daily-2026-10-30-/)
    e.store.go('works')
    await mount(e, wall)
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}连续 2 天再拼一次`)
  })
})

describe('F1: daily works on the wall', () => {
  it('badge 今日一拼 / Daily on the card; the label names the day\'s pattern', async () => {
    await mount(env(), [tpl(NOW - DAY), daily('2026-01-01')])
    const cards = [...host.querySelectorAll<HTMLElement>('.pd-wc')]
    const d = cards.find(c => c.querySelector('.pd-wtag'))!
    expect(d.querySelector('.pd-wtag')!.textContent).toBe('今日一拼')
    expect(d.querySelector('.pd-wtag')!.getAttribute('aria-hidden')).toBe('true')
    expect(d.getAttribute('aria-label')).toBe('今日一拼 · 胡萝卜 · 1 月 1 日')
    expect(cards.filter(c => c.querySelector('.pd-wtag'))).toHaveLength(1)
    await mount(env('en'), [daily('2026-01-01')])
    expect(host.querySelector('.pd-wtag')!.textContent).toBe('Daily')
  })

  it.each([['zh', '删除后连续天数会重新计算'], ['en', 'Your streak will be recalculated.']] as const)('(%s) the detail card of a daily work says the streak will be recalculated, and 删除 is described by it', async (lang, note) => {
    await mount(env(lang), [daily('2026-10-29')])
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-wc')!.click() })
    const del = host.querySelector<HTMLButtonElement>('.pd-wdel')!
    const id = del.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)!.textContent).toBe(note)
  })

  it('a template work\'s detail card has no such note', async () => {
    await mount(env(), [tpl(NOW - DAY)])
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-wc')!.click() })
    expect(host.querySelector('.pd-wdel')!.hasAttribute('aria-describedby')).toBe(false)
    expect(host.textContent).not.toContain('删除后连续天数会重新计算')
  })

  it('再拼一次 of a daily work stays a daily of its own date (so a replay never makes up a missed day)', () => {
    const e = env()
    chunk.replay(e, kit, { i: 1, n: 16, b: pattern(), s: 'board:p-daily-2026-10-01-xyz', p: pattern() })
    expect(e.store.getSnapshot().target).toMatch(/^board:p-daily-2026-10-01-/)
  })

  it('dailyOf reads the date of a daily key only', () => {
    expect(chunk.dailyOf('board:p-daily-2026-10-30-k3')).toBe('2026-10-30')
    for (const s of [null, 'board:p-mh2k', 'board:abc', 'template:heart', 'board:p-dailyx']) expect(chunk.dailyOf(s)).toBeNull()
  })
})
