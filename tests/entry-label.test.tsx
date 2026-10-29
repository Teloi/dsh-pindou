// @vitest-environment jsdom
// R3-5 (N9): the entry's dot is aria-hidden, so what it shows is in the label:
// 「打开拼豆小憩（有未完成的进度）」 / 「…（生成完成）」 while it is lit, the plain label when not.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeEntry } from '../src/client/entry.tsx'
import { GameStore } from '../src/client/game-store.ts'
import { createBoard, encode, makeTranslate, SafeStore, setCell, translate, type GenerateResponse } from '../src/core/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => { root.unmount() }); host.remove() })

const ok = { ok: true, size: 12, flat: encode(setCell(createBoard(12), 1, 1, 3)), issues: [], repaired: false, usage: { input: 1, output: 1 }, model: 'm', finish: 'stop' } as GenerateResponse
function setup(lang: 'zh' | 'en') {
  const data = new Map<string, string>()
  const store = new GameStore({
    store: new SafeStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }),
    api: { generate: async () => ok, status: async () => ({ configured: true, route: 'host' }) }, saveDelayMs: 0,
  })
  const Entry = makeEntry({ store, open: () => undefined, useT: () => makeTranslate(lang) })
  return { store, Entry }
}
const button = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('.pd-entry')!

describe('R3-5: the entry says what its dot shows', () => {
  for (const lang of ['zh', 'en'] as const) {
    it(`(${lang}) unfinished work in a closed panel, then a finished generation`, async () => {
      const { store, Entry } = setup(lang)
      await act(async () => { root.render(<Entry sessionId="s" useSession={sel => sel({ running: false })} />) })
      expect(button().getAttribute('aria-label')).toBe(translate(lang, 'entryLabel'))
      await act(async () => { store.startFree(); store.applyAt(0, 0) })
      expect(button().classList.contains('pd-has-progress')).toBe(true)
      expect(button().getAttribute('aria-label')).toBe(lang === 'zh' ? '打开拼豆小憩（有未完成的进度）' : 'Open Bead Break (in progress)')
      store.setAiSize(12)
      store.setAiPrompt('cat')
      await act(async () => { await store.generate() })
      expect(button().classList.contains('pd-has-progress')).toBe(true)
      expect(button().getAttribute('aria-label')).toBe(lang === 'zh' ? '打开拼豆小憩（生成完成）' : 'Open Bead Break (new pattern)')
      // the tooltip stays the plain name
      expect(button().title).toBe(translate(lang, 'entryLabel'))
    })
  }
  it('while the model runs the busy label wins', async () => {
    const { store, Entry } = setup('zh')
    await act(async () => { store.startFree(); store.applyAt(0, 0) })
    await act(async () => { root.render(<Entry sessionId="s" useSession={sel => sel({ running: true })} />) })
    expect(button().getAttribute('aria-label')).toBe(translate('zh', 'entryBusyLabel'))
  })
})
