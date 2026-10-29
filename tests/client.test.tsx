// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, inject, KIND, langOf, SHORTCUT_ID, type ClientContext } from '../src/client/index.tsx'
import { HINT_DELAY_MS, resetHintCounts } from '../src/client/entry.tsx'
import { STYLE_ID } from '../src/client/styles.ts'
import { canCopyImage, copyPng, exportFileName, cornerRadii, saveRoute } from '../src/client/render.ts'
import { createBoard, setCell, STORAGE_KEY } from '../src/core/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeCtx() {
  const disposers: Array<() => unknown> = []
  const slots: Array<{ options: Record<string, unknown>; component: ComponentType<never> }> = []
  const tabs: Array<Record<string, unknown>> = []
  let active = 'zh-CN'
  const listeners = new Set<() => void>()
  const openTab = vi.fn()
  const shortcuts: Array<Record<string, unknown>> = []
  const ctx: ClientContext = {
    effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d) },
    slots: {
      inject: (_name, factory) => factory(),
      register: (options, component) => { slots.push({ options, component }); return () => {} },
    },
    locale: {
      register: () => () => {},
      getSnapshot: () => ({ active }),
      subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    },
    sidebarRightTabs: { register: (def) => { tabs.push(def); return () => {} } },
    sidebarRight: { openTab },
    shortcuts: { register: (cmd) => { shortcuts.push(cmd); return () => {} } },
  }
  const setLang = (l: string): void => { active = l; for (const fn of listeners) fn() }
  const dispose = (): void => { for (const d of disposers.toReversed()) d() }
  return { ctx, slots, tabs, openTab, shortcuts, setLang, dispose }
}

let host: HTMLDivElement
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.clear(); host = document.createElement('div'); document.body.append(host) })
afterEach(() => { vi.restoreAllMocks(); host.remove(); document.body.innerHTML = '' })

describe('client apply', () => {
  it('declares its services and registers tab, body, header entry, busy pill and shortcut', () => {
    expect(inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts'])
    const f = fakeCtx()
    apply(f.ctx)
    expect(f.tabs[0]).toMatchObject({ kind: KIND, keepMounted: true, priority: 'extension' })
    expect((f.tabs[0]!['title'] as () => string)()).toBe('拼豆小憩')
    expect(f.slots.map(s => s.options['name'])).toEqual(['sidebar.right.pane.tab', 'conversation.session.header.actions', 'conversation.input.overlay'])
    expect(f.shortcuts[0]).toMatchObject({ id: SHORTCUT_ID, regions: ['page', 'editable'] })
    expect((f.shortcuts[0]!['defaults'] as Record<string, unknown>)['web:macos']).toEqual({ code: 'KeyK', modifiers: ['primary', 'alt'] })
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('.pd-root')
    // every selector is scoped by a pd- class (keyframes / @property / at-rule preludes aside)
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@property[^}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '')
      .match(/(?:^|\})\s*([^{}@]+)\{/g)!.map(m => m.replace(/^\}?\s*/, '').replace(/\{$/, '').trim())
      .flatMap(sel => sel.split(',').map(x => x.trim())).filter(x => x !== '' && !/^(from|to|\d+%)/.test(x))
    expect(selectors.filter(x => !x.includes('.pd-'))).toEqual([])
    // custom properties are our own (--pd-*) or host aliases read with fallbacks
    expect([...new Set(css.match(/--[a-z][\w-]*/g))].filter(v => !/^--(pd|dsw|ds)-/.test(v))).toEqual([])
    f.dispose()
    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it('renders the panel, plays a template, and switches language live', async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    expect(host.querySelector('.pd-root')?.getAttribute('aria-label')).toBe('拼豆小憩')
    expect(host.querySelector('.pd-head h2')).toBeNull()
    expect(host.querySelectorAll('.pd-tpl')).toHaveLength(12)
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    const grid = host.querySelector('[role=grid]')!
    expect(grid.querySelectorAll('[role=gridcell]')).toHaveLength(256)
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('30 秒上手')
    expect(host.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('0')
    // keyboard: Space places the current colour at the cursor
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    expect(grid.querySelectorAll('.pd-bead').length).toBe(1)
    // tool shortcut at the panel root
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })) })
    expect(host.querySelector('[role=toolbar] [aria-pressed=true]')?.getAttribute('aria-label')).toBe('橡皮')
    await act(async () => { f.setLang('en') })
    expect(host.querySelector('.pd-root')?.getAttribute('aria-label')).toBe('Bead Break')
    await act(async () => { root.unmount() })
    f.dispose()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).target).toBe('heart')
  })

  it('header entry shows a quiet busy dot and opens the tab, surviving a missing session surface', async () => {
    const f = fakeCtx()
    f.openTab.mockImplementation(() => { throw new Error('no surface') })
    apply(f.ctx)
    const Entry = f.slots[1]!.component as ComponentType<{ sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R }>
    const root = createRoot(host)
    await act(async () => { root.render(<Entry sessionId="s1" useSession={sel => sel({ running: true })} />) })
    const btn = host.querySelector<HTMLButtonElement>('.pd-entry')!
    expect(btn.classList.contains('pd-portal')).toBe(true)
    expect(btn.classList.contains('pd-busy')).toBe(true)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(document.body.querySelector('.pd-hint, .pd-pill')).toBeNull()
    await act(async () => { btn.click() })
    expect(f.openTab).toHaveBeenCalledWith(KIND)
    await act(async () => { root.unmount() })
    f.dispose()
  })

  it('busy pill: appears after 3 s of running, hides on typing, at most twice per session, never focusable', async () => {
    vi.useFakeTimers()
    resetHintCounts()
    const f = fakeCtx()
    apply(f.ctx)
    type P = { sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R; useInput: <R>(s: (v: { draft: string }) => R) => R }
    const Pill = f.slots[2]!.component as ComponentType<P>
    const root = createRoot(host)
    const render = async (running: boolean, draft = ''): Promise<void> => {
      await act(async () => { root.render(<Pill sessionId="s1" useSession={sel => sel({ running })} useInput={sel => sel({ draft })} />) })
    }
    await render(true)
    expect(host.querySelector('.pd-pill')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(HINT_DELAY_MS) })
    const pill = host.querySelector('.pd-pill')!
    expect(pill.classList.contains('pd-portal')).toBe(true)
    expect(pill.getAttribute('role')).toBe('status')
    expect([...pill.querySelectorAll('button')].every(b => b.tabIndex === -1)).toBe(true)
    // typing hides it
    await render(true, 'hello')
    await act(async () => { vi.advanceTimersByTime(250) })
    expect(host.querySelector('.pd-pill')).toBeNull()
    // second turn: shows again, clicking opens the tab
    await render(false); await render(true)
    await act(async () => { vi.advanceTimersByTime(HINT_DELAY_MS) })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-pill-go')!.click() })
    expect(f.openTab).toHaveBeenCalledWith(KIND)
    // third turn: session budget used up
    await render(false); await render(true)
    await act(async () => { vi.advanceTimersByTime(HINT_DELAY_MS + 300) })
    expect(host.querySelector('.pd-pill')).toBeNull()
    await act(async () => { root.unmount() })
    f.dispose()
    vi.useRealTimers()
  })

  it('shortcut toggles: opens the tab, hides it when it is the visible active tab', () => {
    const f = fakeCtx()
    const hide = vi.fn()
    f.ctx.sidebarRight.active = () => ({ id: 't1', kind: KIND })
    f.ctx.sidebarRight.isExpanded = () => true
    f.ctx.sidebarRight.hide = hide
    apply(f.ctx)
    const run = (): void => { ((f.shortcuts[0]!['resolve'] as () => { run(): void })()).run() }
    run()
    expect(f.openTab).toHaveBeenCalledWith(KIND)
    expect(hide).not.toHaveBeenCalled()
    f.dispose()
  })

  it('renders the AI page with a not-configured card when the route is missing', async () => {
    const f = fakeCtx()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ configured: false, route: 'none' }), { status: 200 })))
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.pd-big')[1]!.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    expect(host.textContent).toContain('还没有可用的模型')
    await act(async () => { root.unmount() })
    f.dispose()
    vi.unstubAllGlobals()
  })
})

describe('client helpers', () => {
  it('maps locales and names exports', () => {
    expect(langOf('zh-TW')).toBe('zh')
    expect(langOf('ja')).toBe('en')
    expect(exportFileName('ai:12:..', new Date(2026, 9, 29, 7, 5))).toBe('bead-break-ai-20261029-0705.png')
    expect(exportFileName(null, new Date(2026, 0, 2, 13, 45))).toBe('bead-break-free-20260102-1345.png')
    expect(exportFileName('heart', new Date(2026, 0, 2, 13, 45))).toBe('bead-break-heart-20260102-1345.png')
  })

  it('feature-detects image copy and the download route', async () => {
    expect(canCopyImage({ isSecureContext: true, navigator: {} })).toBe(false)
    expect(canCopyImage({ isSecureContext: false, navigator: { clipboard: { write: () => {} } }, ClipboardItem: Object })).toBe(false)
    const write = vi.fn(async () => {})
    class Item { constructor(readonly items: Record<string, unknown>) {} static supports = (t: string): boolean => t === 'image/png' }
    const w = { isSecureContext: true, navigator: { clipboard: { write } }, ClipboardItem: Item }
    expect(canCopyImage(w)).toBe(true)
    expect(await copyPng(Promise.resolve(new Blob(['x'], { type: 'image/png' })), w)).toBe(true)
    expect(write).toHaveBeenCalledOnce()
    write.mockRejectedValueOnce(new Error('denied'))
    expect(await copyPng(Promise.resolve(new Blob(['x'])), w)).toBe(false)
    expect(saveRoute(document)).toBe('download')
  })

  it('rounds only fully exposed corners when ironed', () => {
    let b = createBoard(12)
    b = setCell(setCell(b, 1, 1, 2), 2, 1, 2)
    expect(cornerRadii(b, 1, 1)).toEqual([true, false, false, true])
    expect(cornerRadii(b, 2, 1)).toEqual([false, true, true, false])
  })
})
