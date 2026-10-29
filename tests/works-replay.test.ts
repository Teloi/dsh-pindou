// 再拼一次 (spec 03:30): an unfinished game of the same source is picked up again
// (§4.3) and a top toast says so; with none, a new game starts without it.
import { describe, expect, it } from 'vitest'
import { GameStore } from '../src/client/game-store.ts'
import { renderExport } from '../src/client/render.ts'
import type { Env } from '../src/client/ui/context.tsx'
import { decode, EMPTY, findTemplate, makeTranslate, SafeStore, TEMPLATES, translate, type BoardSize } from '../src/core/index.ts'
import { replay } from '../src/client/works.tsx'

const kit = { render: renderExport, decode, template: findTemplate } as unknown as Parameters<typeof replay>[1]
function setup(lang: 'zh' | 'en' = 'zh') {
  const data = new Map<string, string>()
  const store = new GameStore({ store: new SafeStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }), saveDelayMs: 0 })
  const env: Env = { store, lang, t: makeTranslate(lang), reducedMotion: () => false, dark: () => false }
  return { store, env }
}
const tpl = TEMPLATES[0]!
const work = (s: string | null) => ({ i: 1, n: tpl.board.size as BoardSize, b: '', s })
const said = (store: GameStore, lang: 'zh' | 'en' = 'zh'): string | null => {
  const t = store.getSnapshot().toast
  return t ? translate(lang, t.key === 'say' ? 'say' : 'toastNewGame', t.params) : null
}
const beads = (store: GameStore): number => store.getSnapshot().history.present.cells.filter(c => c !== EMPTY).length

describe('再拼一次 (spec 03:30)', () => {
  it('the same template unfinished: that game goes on, and the toast says 「接着上次没拼完的」', () => {
    const { store, env } = setup()
    store.follow(tpl.id)
    store.applyAt(0, 0)
    store.go('works')
    replay(env, kit, work(`template:${tpl.id}`))
    const s = store.getSnapshot()
    expect(s.mode).toBe('play')
    expect(s.target).toBe(`template:${tpl.id}`)
    expect(beads(store)).toBe(1)
    expect(s.toast?.key).toBe('say')
    expect(said(store)).toBe('接着上次没拼完的')
  })
  it('in English: “Picked up where you left off.”', () => {
    const { store, env } = setup('en')
    store.follow(tpl.id)
    store.applyAt(0, 0)
    store.go('works')
    replay(env, kit, work(`template:${tpl.id}`))
    expect(said(store, 'en')).toBe('Picked up where you left off.')
  })
  it('no unfinished game of that template: a new game, and no such toast', () => {
    const { store, env } = setup()
    store.startFree()
    store.applyAt(0, 0)
    replay(env, kit, work(`template:${tpl.id}`))
    const s = store.getSnapshot()
    expect(s.target).toBe(`template:${tpl.id}`)
    expect(beads(store)).toBe(0)
    expect(s.toast?.key).not.toBe('say')
  })
  it('free play unfinished: the same game goes on, with the toast', () => {
    const { store, env } = setup()
    store.startFree()
    store.applyAt(0, 0)
    store.go('works')
    replay(env, kit, work(null))
    expect(beads(store)).toBe(1)
    expect(said(store)).toBe('接着上次没拼完的')
  })
})
