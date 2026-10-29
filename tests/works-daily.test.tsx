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
import { DAILY_DEFS, dailyCounts, dailyDay, dailyDayOf, dailyIndex } from '../src/core/daily.ts'
import { decode, defaultState, encode, findTemplate, makeTranslate, parseState, SafeStore, serializeState, STORAGE_KEY, WORKS_KEY, type StoredWork } from '../src/core/index.ts'
import { cleanWorks } from '../src/core/works.ts'
import { App } from '../src/client/ui/App.tsx'
import { EnvContext } from '../src/client/ui/context.tsx'
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
/** The pattern of a daily date. */
const defOf = (date: string): typeof today => DAILY_DEFS[dailyIndex(dailyDayOf(date))]!
/** A finished daily work of the given date (ironed at noon that day, the day's pattern exactly). */
const daily = (date: string, at = Date.parse(`${date}T04:00:00Z`), b = pattern(defOf(date))): StoredWork => ({ i: at, n: 16, b, s: `daily:${date}`, p: pattern(defOf(date)) })
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

  it('开始 starts a new game following today\'s pattern, keyed daily:2026-10-30 (spec §18.3), on the play page', async () => {
    const e = env()
    await mount(e, [])
    await act(async () => { card().click() })
    const g = e.store.getSnapshot()
    expect(g.mode).toBe('play')
    expect(g.target).toBe('daily:2026-10-30')
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
    expect(wall.at(-1)?.s).toBe('daily:2026-10-30')
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
    chunk.replay(e, kit, { i: 1, n: 16, b: pattern(), s: 'daily:2026-10-01', p: pattern() })
    expect(e.store.getSnapshot().target).toBe('daily:2026-10-01')
  })

  it('dailyOf reads the date of a daily key only', () => {
    expect(chunk.dailyOf('daily:2026-10-30')).toBe('2026-10-30')
    for (const s of [null, 'board:p-mh2k', 'board:abc', 'template:heart', 'board:p-daily-2026-10-30-k3', 'daily:2026-1-30', 'daily:x', 'daily:']) expect(chunk.dailyOf(s)).toBeNull()
  })
})

const mem = (): { data: Map<string, string>; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } => {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}
const storeOn = (backend: ReturnType<typeof mem>): GameStore => new GameStore({ store: new SafeStore(backend), saveDelayMs: 0, reducedMotion: () => true })

describe('F1: the spec key daily:<YYYY-MM-DD> (spec §18.3), kept by the entry', () => {
  it('the saved game keeps a daily key and its pattern (the entry drops no unknown-but-valid key)', () => {
    const { state } = parseState(serializeState({ ...defaultState(), target: 'daily:2026-10-30', pattern: pattern() }))
    expect(state.target).toBe('daily:2026-10-30')
    expect(state.pattern).toBe(pattern())
    // without its pattern a daily is nothing to follow: free play, like a `board:` key
    expect(parseState(serializeState({ ...defaultState(), target: 'daily:2026-10-30', pattern: null })).state.target).toBeNull()
    // a template never carries one
    expect(parseState(serializeState({ ...defaultState(), target: 'template:heart', pattern: pattern() })).state.pattern).toBeNull()
  })

  it('a daily game survives a reload: same key, same pattern to follow', () => {
    const backend = mem()
    const a = storeOn(backend)
    const d = decode(pattern(), 16)
    if (!d.ok) throw new Error('pattern')
    a.startPattern('daily:2026-10-30', d.board)
    a.flush()
    expect(JSON.parse(backend.data.get(STORAGE_KEY)!)).toMatchObject({ target: 'daily:2026-10-30', pattern: pattern() })
    const b = storeOn(backend).getSnapshot()
    expect(b.target).toBe('daily:2026-10-30')
    expect(b.targetBoard && encode(b.targetBoard)).toBe(pattern())
  })

  it('an ironed daily goes on the wall with its pattern, and the wall chunk keeps it', () => {
    const backend = mem()
    const e = storeOn(backend)
    const d = decode(pattern(), 16)
    if (!d.ok) throw new Error('pattern')
    e.startPattern('daily:2026-10-30', d.board)
    e.fillTarget()
    e.iron()
    const raw = JSON.parse(backend.data.get(WORKS_KEY)!) as StoredWork[]
    expect(raw.at(-1)).toMatchObject({ s: 'daily:2026-10-30', p: pattern() })
    const { works, dropped } = cleanWorks(raw)
    expect(dropped).toBe(false)
    expect(works.at(-1)).toMatchObject({ s: 'daily:2026-10-30', p: pattern() })
  })

  it('the play page names a daily game 「我的图纸」, not 自由拼, and offers no 一键铺满 (an AI helper)', async () => {
    const e = env()
    const d = decode(pattern(), 16)
    if (!d.ok) throw new Error('pattern')
    e.store.startPattern('daily:2026-10-30', d.board)
    await act(async () => { root.render(<EnvContext.Provider value={e}><App /></EnvContext.Provider>) })
    expect(host.querySelector('.pd-status')!.textContent).toContain('我的图纸')
    expect(host.querySelector('.pd-status')!.textContent).not.toContain('自由拼')
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.includes('一键铺满'))).toBe(false)
  })
})

describe('F1: only finished dailies ironed on their own day make the streak (spec §18.3)', () => {
  /** The day's pattern with one bead missing. */
  const partial = (date: string): string => { const p = pattern(defOf(date)); const i = p.search(/[^.]/); return `${p.slice(0, i)}.${p.slice(i + 1)}` }
  /** The day's pattern with one extra bead. */
  const extra = (date: string): string => { const p = pattern(defOf(date)); const i = p.indexOf('.'); return `${p.slice(0, i)}1${p.slice(i + 1)}` }

  it('dailyCounts: exact pattern, same local day', () => {
    const at = Date.parse('2026-10-29T04:00:00Z')
    expect(dailyCounts('2026-10-29', daily('2026-10-29'))).toBe(true)
    expect(dailyCounts('2026-10-29', { i: at, b: partial('2026-10-29') })).toBe(false)
    expect(dailyCounts('2026-10-29', { i: at, b: extra('2026-10-29') })).toBe(false)
    expect(dailyCounts('2026-10-29', { i: at, b: pattern(defOf('2026-10-28')) })).toBe(false)
    // 补拼: yesterday's pattern ironed today
    expect(dailyCounts('2026-10-29', { i: NOW, b: pattern(defOf('2026-10-29')) })).toBe(false)
    // past midnight: 23:59 counts, 00:01 the next day does not
    expect(dailyCounts('2026-10-29', { i: new Date(2026, 9, 29, 23, 59).getTime(), b: pattern(defOf('2026-10-29')) })).toBe(true)
    expect(dailyCounts('2026-10-29', { i: new Date(2026, 9, 30, 0, 1).getTime(), b: pattern(defOf('2026-10-29')) })).toBe(false)
    expect(dailyCounts('x', daily('2026-10-29'))).toBe(false)
  })

  it('an unfinished daily on the wall makes no streak day', async () => {
    await mount(env(), [daily('2026-10-28'), daily('2026-10-29', undefined, partial('2026-10-29'))])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}开始`)
    await mount(env(), [daily('2026-10-28'), daily('2026-10-29', undefined, extra('2026-10-29'))])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}开始`)
  })

  it('a 补拼 of yesterday\'s daily done today does not fill the gap', async () => {
    await mount(env(), [daily('2026-10-28'), daily('2026-10-29', NOW - 60_000)])
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}开始`)
  })

  it('through the real store: ironing today\'s daily half done keeps the streak where it was', async () => {
    const e = env()
    e.store.setWall([daily('2026-10-29')])
    await mount(e, e.store.works())
    await act(async () => { card().click() })
    const t = e.store.getSnapshot().targetBoard!
    const i = t.cells.findIndex(c => c >= 0)
    e.store.setColor(t.cells[i]!)
    e.store.applyAt(i % 16, Math.floor(i / 16), 'paint')
    e.store.iron()
    expect(e.store.works().at(-1)?.s).toBe('daily:2026-10-30')
    e.store.go('works')
    await mount(e, e.store.works())
    expect(card().textContent).toBe(`今日一拼 · ${today.zh}连续 1 天开始`)
  })
})
