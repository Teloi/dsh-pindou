// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, inject, KIND, langOf, type ClientContext } from '../src/client/index.tsx'
import { STYLE_ID } from '../src/client/styles.ts'
import { exportFileName, cornerRadii } from '../src/client/render.ts'
import { createBoard, setCell, STORAGE_KEY } from '../src/core/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeCtx() {
  const disposers: Array<() => unknown> = []
  const slots: Array<{ options: Record<string, unknown>; component: ComponentType<never> }> = []
  const tabs: Array<Record<string, unknown>> = []
  let active = 'zh-CN'
  const listeners = new Set<() => void>()
  const openTab = vi.fn()
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
  }
  const setLang = (l: string): void => { active = l; for (const fn of listeners) fn() }
  const dispose = (): void => { for (const d of disposers.toReversed()) d() }
  return { ctx, slots, tabs, openTab, setLang, dispose }
}

let host: HTMLDivElement
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.clear(); host = document.createElement('div'); document.body.append(host) })
afterEach(() => { vi.restoreAllMocks(); host.remove(); document.body.innerHTML = '' })

describe('client apply', () => {
  it('declares its services and registers tab, body and header entry', () => {
    expect(inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'])
    const f = fakeCtx()
    apply(f.ctx)
    expect(f.tabs[0]).toMatchObject({ kind: KIND, keepMounted: true, priority: 'extension' })
    expect((f.tabs[0]!['title'] as () => string)()).toBe('拼豆小憩')
    expect(f.slots.map(s => s.options['name'])).toEqual(['sidebar.right.pane.tab', 'conversation.session.header.actions'])
    expect(document.getElementById(STYLE_ID)?.textContent).toContain('.pd-root')
    expect(document.getElementById(STYLE_ID)?.textContent).not.toMatch(/\.bb-|--bb-/)
    f.dispose()
    expect(document.getElementById(STYLE_ID)).toBeNull()
  })

  it('renders the panel, plays a template, and switches language live', async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    expect(host.querySelector('.pd-head h2')?.textContent).toBe('拼豆小憩')
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
    expect(host.querySelector('.pd-head h2')?.textContent).toBe('Bead Break')
    await act(async () => { root.unmount() })
    f.dispose()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).target).toBe('heart')
  })

  it('header entry opens the tab and survives a missing session surface', async () => {
    const f = fakeCtx()
    f.openTab.mockImplementation(() => { throw new Error('no surface') })
    apply(f.ctx)
    const Entry = f.slots[1]!.component as ComponentType<{ sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R }>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 42, left: 900, right: 932, width: 32, height: 32, x: 900, y: 10, toJSON: () => ({}) })
    const root = createRoot(host)
    await act(async () => { root.render(<Entry sessionId="s1" useSession={sel => sel({ running: true })} />) })
    const btn = host.querySelector<HTMLButtonElement>('.pd-entry')!
    expect(btn.classList.contains('pd-busy')).toBe(true)
    expect(document.body.querySelector('.pd-hint')?.textContent).toContain('趁现在拼一个')
    await act(async () => { btn.click() })
    expect(f.openTab).toHaveBeenCalledWith(KIND)
    expect(document.body.querySelector('.pd-hint')).toBeNull()
    await act(async () => { root.unmount() })
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

  it('rounds only fully exposed corners when ironed', () => {
    let b = createBoard(12)
    b = setCell(setCell(b, 1, 1, 2), 2, 1, 2)
    expect(cornerRadii(b, 1, 1)).toEqual([true, false, false, true])
    expect(cornerRadii(b, 2, 1)).toEqual([false, true, true, false])
  })
})
