// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, inject, KIND, langOf, SHORTCUT_ID, type ClientContext } from '../src/client/index.tsx'
import { HINT_DELAY_MS, HINTS_KEY, hintCount, resetHintCounts } from '../src/client/entry.tsx'
import { CSS, STYLE_ID } from '../src/client/styles.ts'
import { formatKeys, settingsOpener } from '../src/client/settings.ts'
import { cellSize } from '../src/client/ui/Board.tsx'
import { panelOnScreen } from '../src/client/ui/App.tsx'
import { canCopyImage, copyPng, exportFileName, cornerRadii, saveRoute } from '../src/client/render.ts'
import { createBoard, defaultState, findTemplate, serializeState, setCell, STORAGE_KEY } from '../src/core/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeCtx(face: Record<string, unknown> = {}) {
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
    shortcuts: { ...face, register: (cmd) => { shortcuts.push(cmd); return () => {} } },
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

/** Split a selector list on top-level commas only (not inside :where()/:is()). */
function splitTop(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

describe('client apply', () => {
  it('declares its services and registers tab, body, header entry, busy pill and shortcut', () => {
    expect(inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts'])
    const f = fakeCtx()
    apply(f.ctx)
    expect(f.tabs[0]).toMatchObject({ kind: KIND, keepMounted: true, priority: 'extension' })
    expect((f.tabs[0]!['title'] as () => string)()).toBe('拼豆小憩')
    expect(f.slots.map(s => s.options['name'])).toEqual(['sidebar.right.pane.tab', 'conversation.session.header.actions', 'conversation.input.overlay'])
    expect(f.shortcuts[0]).toMatchObject({ id: SHORTCUT_ID, regions: ['page', 'editable'] })
    const defaults = f.shortcuts[0]!['defaults'] as Record<string, unknown>
    expect(defaults['desktop:macos']).toEqual({ code: 'KeyK', modifiers: ['primary', 'alt'] })
    // the Web shell already uses ⌘⌥K for session search: no Web defaults
    expect(Object.keys(defaults).filter(k => k.startsWith('web:'))).toEqual([])
    const css = document.getElementById(STYLE_ID)?.textContent ?? ''
    expect(css).toContain('.pd-root')
    // every selector is scoped by a pd- class (keyframes / @property / at-rule preludes aside)
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@property[^}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '')
      .match(/(?:^|\})\s*([^{}@]+)\{/g)!.map(m => m.replace(/^\}?\s*/, '').replace(/\{$/, '').trim())
      .flatMap(sel => splitTop(sel).map(x => x.trim())).filter(x => x !== '' && !/^(from|to|\d+%)/.test(x))
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
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).target).toBe('template:heart')
  })

  for (const desktop of [false, true]) {
    it(`entry button announces ⌘⌥K only in the desktop shell (${desktop ? 'desktop' : 'web'})`, async () => {
      if (desktop) vi.stubGlobal('dshDesktop', {})
      const f = fakeCtx()
      apply(f.ctx)
      const Entry = f.slots[1]!.component as ComponentType<{ sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R }>
      const root = createRoot(host)
      await act(async () => { root.render(<Entry sessionId="s1" useSession={sel => sel({ running: false })} />) })
      expect(host.querySelector('.pd-entry')?.getAttribute('aria-keyshortcuts') ?? null).toBe(desktop ? 'Control+Alt+K Meta+Alt+K' : null)
      await act(async () => { root.unmount() })
      f.dispose()
      vi.unstubAllGlobals()
    })
  }

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

// Real catalog shape (DSH packages/client/shortcuts/src/binding.ts presentBinding): keys is an array of keycaps,
// Windows already carries '+' separator tokens, macOS uses symbols, Linux plain names.
const binding = { code: 'Comma', modifiers: ['control', 'alt'] }
const entryFor = (keys: readonly string[]) => ({ id: 'settings.open', label: 'Open settings', aliases: [], keys, aria: 'Control+Alt+Comma', binding, modified: false, conflicts: [], issue: undefined })
const settingsEntry = entryFor(['Ctrl', '+', 'Alt', '+', ','])
const webShortcuts = { runtime: 'web', platform: 'windows', catalog: { getSnapshot: () => [settingsEntry] } }

async function renderAi(status: Record<string, unknown>, face: Record<string, unknown> = {}) {
  const f = fakeCtx(face)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(status), { status: 200 })))
  apply(f.ctx)
  const Body = f.slots[0]!.component as ComponentType
  const root = createRoot(host)
  await act(async () => { root.render(<Body />) })
  await act(async () => { host.querySelectorAll<HTMLButtonElement>('.pd-big')[1]!.click() })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const done = async (): Promise<void> => { await act(async () => { root.unmount() }); f.dispose(); vi.unstubAllGlobals() }
  return { done }
}

describe('design walkthrough fixes', () => {
  it('I3/I4: not configured → input and chips disabled, primary 「打开 DSH 设置」 fires the settings shortcut', async () => {
    const { done } = await renderAi({ configured: false, route: 'host', model: 'deepseek-v4-flash', verified: true }, webShortcuts)
    const card = host.querySelector('.pd-nocfg')!
    const open = [...card.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === '打开 DSH 设置')!
    expect(open.className).toContain('pd-primary')
    expect([...card.querySelectorAll('button.pd-ghost')].map(b => b.textContent)).toEqual(['先玩模板'])
    expect(card.textContent).toContain('按 Ctrl+Alt+, 打开 DSH 设置 → 模型')
    expect(host.querySelector('textarea')!.disabled).toBe(true)
    expect([...host.querySelectorAll<HTMLButtonElement>('.pd-chip')].every(b => b.disabled)).toBe(true)
    expect(document.activeElement).toBe(open)
    const seen: KeyboardEvent[] = []
    const spy = (e: KeyboardEvent): void => { seen.push(e) }
    window.addEventListener('keydown', spy)
    await act(async () => { open.click() })
    window.removeEventListener('keydown', spy)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ code: 'Comma', ctrlKey: true, altKey: true, metaKey: false, shiftKey: false })
    await done()
  })

  it('I4: no usable settings shortcut → no fake button, honest manual steps, 「重新检测」 is primary', async () => {
    const { done } = await renderAi({ configured: false, route: 'none' })
    const card = host.querySelector('.pd-nocfg')!
    expect(card.textContent).not.toContain('打开 DSH 设置按')
    expect([...card.querySelectorAll('button')].map(b => b.textContent)).toEqual(['重新检测', '先玩模板'])
    expect(card.querySelector('.pd-primary')?.textContent).toBe('重新检测')
    expect(card.textContent).toContain('插件没法直接帮你打开模型设置')
    await done()
  })

  it('I3/S5: unverified credentials show the first-run hint; the token estimate carries the model as a tooltip', async () => {
    const { done } = await renderAi({ configured: true, route: 'host', model: 'deepseek-v4-flash', verified: false })
    expect(host.textContent).toContain('首次生成会检测模型配置')
    const meta = [...host.querySelectorAll('.pd-tokens')].find(e => e.textContent === '约 300–900 tokens')!
    expect(meta.getAttribute('title')).toBe('模型：deepseek-v4-flash')
    expect(host.querySelector('textarea')!.disabled).toBe(false)
    await done()
  })

  it('I2: focus never falls back to <body> after coach, clear, toast undo, menu Esc and Back', async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    const grid = host.querySelector<HTMLElement>('[role=grid]')!
    const coach = host.querySelector('.pd-boardbox .pd-overlay.pd-coach')!
    expect(coach).not.toBeNull()
    expect(document.activeElement?.textContent).toBe('开始拼')
    await act(async () => { (document.activeElement as HTMLButtonElement).click() })
    expect(document.activeElement).toBe(grid)
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    const clear = host.querySelector<HTMLButtonElement>('[role=toolbar] button[aria-label="清空"]')!
    clear.focus()
    await act(async () => { clear.click() })
    expect(document.activeElement).toBe(grid)
    const undo = host.querySelector<HTMLButtonElement>('.pd-toast button')!
    undo.focus()
    await act(async () => { undo.click() })
    expect(document.activeElement).not.toBe(document.body)
    expect(grid.querySelectorAll('.pd-bead').length).toBe(1)
    const menuBtn = host.querySelector<HTMLButtonElement>('[data-pd-menu-btn]')!
    await act(async () => { menuBtn.click() })
    expect(document.activeElement?.closest('[role=menu]')).not.toBeNull()
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(host.querySelector('[role=menu]')).toBeNull()
    expect(document.activeElement).toBe(menuBtn)
    // Back removes itself: focus lands in the home view, not on <body>
    const back = host.querySelector<HTMLButtonElement>('.pd-head .pd-ib[aria-label="返回"]')!
    back.focus()
    await act(async () => { back.click() })
    expect(host.querySelector('.pd-tpl')).not.toBeNull()
    expect(document.activeElement).not.toBe(document.body)
    expect(host.contains(document.activeElement)).toBe(true)
    await act(async () => { root.unmount() })
    f.dispose()
  })

  it('S6: every target right but one stray bead → "还差一步", 99%, no done card', async () => {
    const heart = findTemplate('heart')!
    // the stray bead sits on an empty corner of the pattern
    const board = setCell(heart.board, 0, 0, 4)
    localStorage.setItem(STORAGE_KEY, serializeState({ ...defaultState(), board, target: 'template:heart', mode: 'play', coached: true }))
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    expect(host.querySelector('.pd-warn')?.textContent).toBe('还差一步：擦掉 1 颗放错的豆')
    expect(host.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('99')
    expect(host.querySelector('.pd-overlay.pd-done')).toBeNull()
    await act(async () => { root.unmount() })
    f.dispose()
  })

  it('S11: each template button is named by its visible text first (WCAG 2.5.3)', async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    const tpls = [...host.querySelectorAll<HTMLButtonElement>('.pd-tpl')]
    expect(tpls).toHaveLength(12)
    for (const b of tpls) {
      expect(b.hasAttribute('aria-label')).toBe(false)
      const visible = b.querySelector('.pd-nm')!.textContent!
      expect(b.textContent!.startsWith(visible)).toBe(true)
    }
    await act(async () => { root.unmount() })
    f.dispose()
  })

  it('I9: board side follows width and the height left over, 140..480', () => {
    expect(cellSize(640 - 32, Number.POSITIVE_INFINITY, 12)).toBe(39)
    expect(cellSize(608, Number.POSITIVE_INFINITY, 16)).toBe(29)
    expect(cellSize(608, Number.POSITIVE_INFINITY, 24)).toBe(19)
    expect(cellSize(268, 900, 16)).toBe(16)
    expect(cellSize(608, 300, 16)).toBe(18)
    expect(cellSize(608, 20, 16)).toBe(8)
  })

  it('I4: settings opener only on DOM keyboard adapters with a bound shortcut', () => {
    expect(settingsOpener(undefined)).toEqual({})
    expect(settingsOpener({ runtime: 'web', catalog: { getSnapshot: () => [{ ...settingsEntry, binding: null }] } })).toEqual({})
    expect(settingsOpener({ runtime: 'desktop', platform: 'macos', catalog: { getSnapshot: () => [entryFor(['⌃', '⌥', ','])] } })).toEqual({ keys: '⌃⌥,' })
    expect(typeof settingsOpener({ runtime: 'desktop', platform: 'linux', catalog: { getSnapshot: () => [settingsEntry] } }).open).toBe('function')
    expect(settingsOpener({ runtime: 'web', catalog: { getSnapshot: () => { throw new Error('x') } } })).toEqual({})
  })

  it('N2: keycaps from the real catalog array, per platform (never 「⌥,⌘,,」)', () => {
    const mac = { runtime: 'web', platform: 'macos', catalog: { getSnapshot: () => [{ ...entryFor(['⌥', '⌘', ',']), binding: { code: 'Comma', modifiers: ['alt', 'meta'] } }] } }
    expect(settingsOpener(mac).keys).toBe('⌥⌘,')
    expect(settingsOpener(webShortcuts).keys).toBe('Ctrl+Alt+,')
    expect(settingsOpener({ ...webShortcuts, platform: 'linux', catalog: { getSnapshot: () => [entryFor(['Ctrl', 'Alt', ','])] } }).keys).toBe('Ctrl+Alt+,')
    expect(formatKeys(['⌘', 'K', 'L'], 'macos', true)).toBe('⌘K L')
    expect(formatKeys(['Ctrl', '+', 'K', 'L'], 'windows', true)).toBe('Ctrl+K L')
    expect(formatKeys(['Ctrl', '+', '+'], 'windows')).toBe('Ctrl++')
    expect(formatKeys([], 'linux')).toBeUndefined()
    expect(formatKeys('⌘ ,', 'macos')).toBe('⌘ ,')
    expect(formatKeys(42, 'macos')).toBeUndefined()
  })
})

describe('client helpers', () => {
  it('maps locales and names exports', () => {
    expect(langOf('zh-TW')).toBe('zh')
    expect(langOf('ja')).toBe('en')
    expect(exportFileName('board:k1', new Date(2026, 9, 29, 7, 5))).toBe('bead-break-ai-20261029-0705.png')
    expect(exportFileName(null, new Date(2026, 0, 2, 13, 45))).toBe('bead-break-free-20260102-1345.png')
    expect(exportFileName('template:heart', new Date(2026, 0, 2, 13, 45))).toBe('bead-break-heart-20260102-1345.png')
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

describe('design walkthrough round 2 fixes (r3)', () => {
  const mount = async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.slots[0]!.component as ComponentType
    const root = createRoot(host)
    await act(async () => { root.render(<Body />) })
    const done = async (): Promise<void> => { await act(async () => { root.unmount() }); f.dispose() }
    return { f, root, done }
  }

  it('N1: template → beads → home → same template keeps the beads; the UI shows the newGame toast for a different one', async () => {
    const { done } = await mount()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-coach .pd-btn')!.click() })
    const grid = (): HTMLElement => host.querySelector<HTMLElement>('[role=grid]')!
    await act(async () => { grid().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    expect(grid().querySelectorAll('.pd-bead').length).toBe(1)
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-head .pd-ib[aria-label="返回"]')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    expect(grid().querySelectorAll('.pd-bead').length).toBe(1)
    expect(host.querySelector('.pd-toast')).toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-head .pd-ib[aria-label="返回"]')!.click() })
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.pd-tpl')[1]!.click() })
    expect(grid().querySelectorAll('.pd-bead').length).toBe(0)
    expect(host.querySelector('.pd-toast')?.textContent).toContain('已开始新的一局')
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-toast button')!.click() })
    expect(grid().querySelectorAll('.pd-bead').length).toBe(1)
    await done()
  })

  it('N4/N14: toast 撤销 puts focus on the board; hover or focus pauses the 5 s clock and keeps the rest', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { done } = await mount()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-coach .pd-btn')!.click() })
    const grid = host.querySelector<HTMLElement>('[role=grid]')!
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[role=toolbar] button[aria-label="清空"]')!.click() })
    const toast = (): HTMLElement | null => host.querySelector<HTMLElement>('.pd-toast')
    await act(async () => { vi.advanceTimersByTime(1000) })
    // focus inside the toast holds it
    await act(async () => { toast()!.querySelector('button')!.focus() })
    expect(toast()!.dataset['held']).toBe('true')
    await act(async () => { vi.advanceTimersByTime(20_000) })
    expect(toast()).not.toBeNull()
    await act(async () => { toast()!.querySelector('button')!.blur() })
    await act(async () => { vi.advanceTimersByTime(3900) })
    expect(toast()).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(toast()).toBeNull()
    // again, then 撤销: the bead is back and focus is on the board
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[role=toolbar] button[aria-label="清空"]')!.click() })
    const undo = toast()!.querySelector<HTMLButtonElement>('button')!
    undo.focus()
    await act(async () => { undo.click() })
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(grid.querySelectorAll('.pd-bead').length).toBe(1)
    expect(document.activeElement).toBe(grid)
    await done()
    vi.useRealTimers()
  })

  it('v1.6 §4.3: back to the same template keeps the 已清空 toast; its 撤销 restores the beads and focuses the board', async () => {
    const { done } = await mount()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-coach .pd-btn')!.click() })
    const grid = (): HTMLElement => host.querySelector<HTMLElement>('[role=grid]')!
    await act(async () => { grid().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[role=toolbar] button[aria-label="清空"]')!.click() })
    const text = host.querySelector('.pd-toast')!.textContent
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-head .pd-ib[aria-label="返回"]')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    expect(host.querySelector('.pd-toast')?.textContent).toBe(text)
    const undo = host.querySelector<HTMLButtonElement>('.pd-toast button')!
    undo.focus()
    await act(async () => { undo.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 5)) })
    expect(grid().querySelectorAll('.pd-bead').length).toBe(1)
    expect(document.activeElement).toBe(grid())
    await done()
  })

  it('N8: the done card swaps in for tools + palette + footer, in the flow, with ≥32px actions', async () => {
    const { done } = await mount()
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-coach .pd-btn')!.click() })
    const under = host.querySelector('.pd-under')!
    expect(under.classList.contains('pd-swapped')).toBe(false)
    expect(under.querySelector(':scope > .pd-tp > .pd-tools + .pd-palette + .pd-foot')).not.toBeNull()
    // an ironed, finished heart restored from storage shows the result card
    await done()
    const heart = findTemplate('heart')!
    localStorage.setItem(STORAGE_KEY, serializeState({ ...defaultState(), board: heart.board, target: 'template:heart', mode: 'play', coached: true, ironed: true }))
    const again = await mount()
    const u = host.querySelector('.pd-under')!
    expect(u.classList.contains('pd-swapped')).toBe(true)
    const card = u.querySelector(':scope > .pd-overlay.pd-result')!
    expect(card).not.toBeNull()
    expect(u.querySelector(':scope > .pd-tp')).not.toBeNull()
    expect(CSS).toContain('.pd-under.pd-swapped>.pd-tp{visibility:hidden}')
    expect(CSS).toContain('.pd-overlay .pd-acts .pd-btn{min-height:var(--pd-hit)}')
    expect(CSS).toMatch(/\.pd-overlay\{position:relative;/)
    // the toast is absolutely centred; without max-content its box shrinks to half the panel and 撤销 wraps at 300 px
    expect(CSS).toMatch(/\.pd-toast\{[^}]*width:max-content;max-width:calc\(100% - 32px\)/)
    expect(CSS).toContain('.pd-toast button{flex:none;white-space:nowrap;')
    await again.done()
  })

  it('N5: the busy pill budget survives a reload of the page (sessionStorage), memory when storage fails', async () => {
    vi.useFakeTimers()
    resetHintCounts()
    sessionStorage.setItem(HINTS_KEY, JSON.stringify({ s1: 2 }))
    expect(hintCount('s1')).toBe(2)
    const f = fakeCtx()
    apply(f.ctx)
    type P = { sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R; useInput: <R>(s: (v: { draft: string }) => R) => R }
    const Pill = f.slots[2]!.component as ComponentType<P>
    const root = createRoot(host)
    const render = async (id: string): Promise<void> => {
      await act(async () => { root.render(<Pill sessionId={id} useSession={sel => sel({ running: true })} useInput={sel => sel({ draft: '' })} />) })
    }
    await render('s1')
    await act(async () => { vi.advanceTimersByTime(HINT_DELAY_MS + 50) })
    expect(host.querySelector('.pd-pill')).toBeNull()
    await render('s2')
    await act(async () => { vi.advanceTimersByTime(HINT_DELAY_MS + 50) })
    expect(host.querySelector('.pd-pill')).not.toBeNull()
    expect(JSON.parse(sessionStorage.getItem(HINTS_KEY)!)).toEqual({ s1: 2, s2: 1 })
    // corrupt or unavailable storage: no throw, memory count applies
    sessionStorage.setItem(HINTS_KEY, '{oops')
    expect(hintCount('s2')).toBe(1)
    await act(async () => { root.unmount() })
    f.dispose()
    resetHintCounts()
    vi.useRealTimers()
  })

  it('N4: a failed generation puts focus on 重试', async () => {
    const fetch = vi.fn(async (url: string) => String(url).includes('status')
      ? new Response(JSON.stringify({ configured: true, route: 'host', model: 'm', verified: true }), { status: 200 })
      : new Response(JSON.stringify({ ok: false, error: 'upstream', message: 'x' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { done } = await mount()
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.pd-big')[1]!.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    const area = host.querySelector('textarea')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(area, '小猫'); area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-ai-row .pd-primary')!.click() })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(host.querySelector('.pd-card.pd-err')).not.toBeNull()
    expect(document.activeElement?.textContent).toBe('重试')
    await done()
    vi.unstubAllGlobals()
  })

  // Split view / several sessions: each mounted panel registers its own visibility; the
  // entry dot is off while ANY panel is on screen, whatever the mount or unmount order.
  for (const mounts of [['shown', 'hidden'], ['hidden', 'shown']] as const) {
    for (const unmount of [['shown', 'hidden'], ['hidden', 'shown']] as const) {
      it(`entry dot with one shown + one hidden panel: mount ${mounts.join(' then ')}, unmount ${unmount.join(' then ')}`, async () => {
        vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, top: 0, bottom: 600 } as DOMRect)
        vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800)
        const f = fakeCtx()
        apply(f.ctx)
        const Body = f.slots[0]!.component as ComponentType
        const Entry = f.slots[1]!.component as ComponentType<{ sessionId: string; useSession: <R>(s: (v: { running: boolean }) => R) => R }>
        const entryHost = document.createElement('div'); document.body.append(entryHost)
        const entry = createRoot(entryHost)
        await act(async () => { entry.render(<Entry sessionId="s1" useSession={sel => sel({ running: false })} />) })
        const lit = (): boolean => entryHost.querySelector('.pd-entry')!.classList.contains('pd-has-progress')
        const hosts = { shown: document.createElement('div'), hidden: document.createElement('div') }
        hosts.hidden.hidden = true
        const roots = {} as Record<'shown' | 'hidden', ReturnType<typeof createRoot>>
        for (const k of mounts) {
          document.body.append(hosts[k]); roots[k] = createRoot(hosts[k])
          await act(async () => { roots[k].render(<Body />) })
        }
        // unfinished work in the shown panel
        await act(async () => { hosts.shown.querySelector<HTMLButtonElement>('.pd-tpl')!.click() })
        const grid = hosts.shown.querySelector('[role=grid]')!
        await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
        expect(grid.querySelectorAll('.pd-bead').length).toBe(1)
        expect(lit()).toBe(false)
        // the hidden panel re-reporting (host attribute churn, the slow tick) never wins
        await act(async () => { hosts.hidden.setAttribute('data-x', '1'); hosts.hidden.hidden = true; await new Promise(r => setTimeout(r, 1100)) })
        expect(lit()).toBe(false)
        await act(async () => { roots[unmount[0]].unmount() })
        expect(lit()).toBe(unmount[0] === 'shown')
        await act(async () => { roots[unmount[1]].unmount() })
        expect(lit()).toBe(true)
        await act(async () => { entry.unmount() })
        f.dispose()
        vi.unstubAllGlobals()
      })
    }
  }

  it('N9: panelOnScreen follows the host hide / collapse attributes and the viewport', () => {
    const outer = document.createElement('section')
    const el = document.createElement('div')
    outer.append(el); document.body.append(outer)
    vi.spyOn(el, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const rect = { left: 900, right: 1280, top: 0, bottom: 800 }
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => rect as DOMRect)
    vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800)
    expect(panelOnScreen(el)).toBe(true)
    for (const [k, v] of [['hidden', ''], ['inert', ''], ['aria-hidden', 'true']] as const) {
      outer.setAttribute(k, v)
      expect(panelOnScreen(el)).toBe(false)
      outer.removeAttribute(k)
    }
    rect.left = 1281; rect.right = 1661 // collapsed: same size, slid past the edge
    expect(panelOnScreen(el)).toBe(false)
    vi.unstubAllGlobals()
  })
})
