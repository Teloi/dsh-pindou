// @vitest-environment jsdom
// R3-4: the status line's AI facts (prompt, tokens, cache) belong to the board
// they came with. Undo back to an earlier AI board: the last generation's facts go.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_COOLDOWN_MS, GameStore } from '../src/client/game-store.ts'
import { App } from '../src/client/ui/App.tsx'
import { EnvContext, type Env } from '../src/client/ui/context.tsx'
import { createBoard, encode, makeTranslate, SafeStore, setCell, type GenerateResponse } from '../src/core/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => sink) as never)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => { root.unmount() })
  vi.restoreAllMocks()
  host.remove()
  document.body.innerHTML = ''
})

const reply = (cell: number, tokens: number): GenerateResponse => ({
  ok: true, size: 12, flat: encode(setCell(setCell(createBoard(12), cell, 0, 3), 0, 5, 4)), issues: [], repaired: false, usage: { input: tokens, output: 0 }, model: 'm', finish: 'stop',
}) as GenerateResponse

describe('R3-4: the AI facts follow the board', () => {
  it('undo back to the earlier AI board: no longer 「消耗 99 tokens」 or the later prompt', async () => {
    let now = 1_000_000
    const replies = [reply(1, 30), reply(2, 99)]
    const data = new Map<string, string>()
    const store = new GameStore({
      store: new SafeStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }),
      api: { generate: async () => replies.shift()!, status: async () => ({ configured: true, route: 'host' }) },
      now: () => now, saveDelayMs: 0,
    })
    const env: Env = { store, lang: 'zh', t: makeTranslate('zh'), reducedMotion: () => false, dark: () => false }
    await act(async () => { root.render(<EnvContext.Provider value={env}><App /></EnvContext.Provider>) })
    const line = (): string => host.querySelector('.pd-status .pd-line')?.textContent ?? ''
    store.setAiSize(12)
    store.setAiPrompt('橘猫')
    await act(async () => { await store.generate() })
    store.applyAt(0, 0)
    expect(line()).toContain('橘猫')
    expect(line()).toContain('消耗 30 tokens')
    now += AI_COOLDOWN_MS
    store.setAiPrompt('西瓜')
    await act(async () => { await store.generate() })
    expect(line()).toContain('西瓜')
    expect(line()).toContain('消耗 99 tokens')
    await act(async () => { store.undo() }) // back past the new board's start: the 橘猫 board
    expect(store.getSnapshot().history.present.cells.some(c => c === 3)).toBe(true)
    expect(line()).not.toContain('99')
    expect(line()).not.toContain('西瓜')
  })
})
