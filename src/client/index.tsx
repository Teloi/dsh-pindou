/**
 * Browser half of dsh-pindou (Bead Break · 拼豆小憩).
 *
 * - a `pindou` right-sidebar tab (kind `pindou`, kept mounted, on the guide page)
 * - an entry button in `conversation.session.header.actions` (quiet busy / progress dot)
 * - a busy pill in `conversation.input.overlay`
 * - a rebindable global shortcut that toggles the tab (default ⌘⌥K / Ctrl+Alt+K
 *   in the desktop app only; unbound on Web, where the host already uses it)
 * - one shared GameStore per plugin lifetime (localStorage-backed, disposed with the plugin)
 *
 * Host types are not bundled; the minimal shapes used here are declared below
 * so the bundle depends on nothing but React at runtime.
 */
import { useSyncExternalStore, type ComponentType, type ReactElement } from 'react'
import { en, makeTranslate, SafeStore, browserStorage, zh, type Translate } from '../core/index.ts'
import { fetchApi } from './api.ts'
import { makeBusyPill, makeEntry, type SessionProps } from './entry.tsx'
import { GameStore } from './game-store.ts'
import { IconBead } from './icons.tsx'
import { settingsOpener, type ShortcutsFace } from './settings.ts'
import { hostLoadsChunks, lazy } from './lazy.ts'
import { ensureStyles } from './styles.ts'
import { App } from './ui/App.tsx'
import { EnvContext, isDark, prefersReducedMotion } from './ui/context.tsx'

export const name = 'dsh-pindou'
export const NS = 'pindou'
export const KIND = 'pindou'
export const TAB_ID = 'dsh-pindou'

export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts']
export const SHORTCUT_ID = 'pindou.toggle'
const DESKTOP_PROFILES = ['desktop:macos', 'desktop:windows', 'desktop:linux'] as const

/** The DSH desktop app's preload exposes `window.dshDesktop` (apps/desktop/src/preload-app.ts). */
function isDesktopShell(): boolean {
  return 'dshDesktop' in globalThis
}

type Dispose = () => void
interface LocaleFace {
  register(ns: string, dicts: Record<string, Record<string, string>>): Dispose
  getSnapshot(): { readonly active: string }
  subscribe(fn: () => void): Dispose
}
interface SlotsFace {
  inject(name: string, factory: () => Dispose): Dispose
  register(options: Record<string, unknown>, component: ComponentType<never>): Dispose
}
export interface ClientContext {
  effect(fn: () => Dispose | (() => unknown), label?: string): void
  slots: SlotsFace
  locale: LocaleFace
  sidebarRightTabs: { register(def: Record<string, unknown>): Dispose }
  sidebarRight: {
    openTab(kind: string, options?: Record<string, unknown>): unknown
    active?(): { readonly id: string; readonly kind: string } | undefined
    isExpanded?(): boolean
    hide?(tabId: string): void
  }
  shortcuts?: ShortcutsFace & { register(command: Record<string, unknown>): Dispose }
}

export function langOf(active: string | undefined): 'zh' | 'en' {
  return active?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), 'pindou: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pindou: dictionaries')

  const store = new GameStore({ store: new SafeStore(browserStorage()), api: fetchApi(), reducedMotion: prefersReducedMotion })
  ctx.effect(() => () => { store.dispose() }, 'pindou: game store')
  const flush = (): void => { store.flush() }
  ctx.effect(() => {
    globalThis.addEventListener?.('pagehide', flush)
    return () => { globalThis.removeEventListener?.('pagehide', flush) }
  }, 'pindou: save on pagehide')

  // Picture to pattern lives in lib/client.picture.js, fetched on first open (spec §18.6)
  const picture = lazy(() => import('./picture.tsx'), hostLoadsChunks())
  const lang = (): 'zh' | 'en' => langOf(ctx.locale.getSnapshot().active)
  const tFor = (l: 'zh' | 'en'): Translate => (l === 'zh' ? tZh : tEn)
  const tZh = makeTranslate('zh')
  const tEn = makeTranslate('en')
  const useLang = (): 'zh' | 'en' => useSyncExternalStore(fn => ctx.locale.subscribe(fn), lang, lang)
  const useT = (): Translate => tFor(useLang())

  const open = (): void => {
    try { ctx.sidebarRight.openTab(KIND) } catch { /* no session surface mounted yet */ }
  }
  /** Shortcut: hide the tab when it is the visible one, open it otherwise. */
  const toggle = (): void => {
    try {
      const active = ctx.sidebarRight.active?.()
      if (active?.kind === KIND && ctx.sidebarRight.isExpanded?.() === true && store.getSnapshot().panelVisible) {
        ctx.sidebarRight.hide?.(active.id)
        return
      }
    } catch { /* fall through to open */ }
    open()
  }

  function Body(): ReactElement {
    const l = useLang()
    return (
      <EnvContext.Provider value={{ store, lang: l, t: tFor(l), reducedMotion: prefersReducedMotion, dark: () => isDark(), settings: () => settingsOpener(ctx.shortcuts), picture }}>
        <App />
      </EnvContext.Provider>
    )
  }

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: KIND,
    priority: 'extension',
    keepMounted: true,
    title: () => tFor(lang())('appName'),
    guide: [{
      id: 'pindou',
      order: 90,
      title: () => tFor(lang())('appName'),
      description: () => tFor(lang())('guideDesc'),
      icon: IconBead,
    }],
  }), 'pindou: tab type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
    Body as ComponentType<never>,
  )), 'pindou: tab body')

  // A clashing or rejected binding must not take the plugin down: the entry
  // button and the pill still open the tab.
  let keyshortcuts: string | undefined
  const shortcuts = ctx.shortcuts
  if (shortcuts) {
    const binding = { code: 'KeyK', modifiers: ['primary', 'alt'] }
    ctx.effect(() => {
      try {
        const off = shortcuts.register({
          id: SHORTCUT_ID,
          label: () => tFor(lang())('shortcutToggle'),
          aliases: ['pindou', 'bead', '拼豆'],
          // Desktop only. In the Web shell ⌘⌥K / Ctrl+Alt+K is the host's own
          // "search sessions" default (ui-workspace/src/client/shortcuts.ts), and
          // the shortcut registry throws on overlapping defaults, which would stop
          // whichever package registers second. Web users can bind it in Settings.
          defaults: Object.fromEntries(DESKTOP_PROFILES.map(p => [p, binding])),
          regions: ['page', 'editable'],
          modals: [],
          resolve: () => ({ status: 'handled', run: toggle }),
        })
        keyshortcuts = isDesktopShell() ? 'Control+Alt+K Meta+Alt+K' : undefined
        return () => { keyshortcuts = undefined; off() }
      } catch (error) {
        console.warn('[dsh-pindou] shortcut not registered:', error)
        return () => {}
      }
    }, 'pindou: shortcut')
  }

  const deps = { store, open, useT, get keyshortcuts() { return keyshortcuts } }
  const Entry = makeEntry(deps)
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'dsh-pindou-entry', order: 30, locale: NS },
    Entry as ComponentType<SessionProps> as ComponentType<never>,
  )), 'pindou: header entry')

  const Pill = makeBusyPill(deps)
  ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register(
    // Large order: list entries render in order, so the pill sits last (rightmost).
    { name: 'conversation.input.overlay', id: 'dsh-pindou-busy-pill', order: 1000, locale: NS },
    Pill as ComponentType<SessionProps> as ComponentType<never>,
  )), 'pindou: busy pill')
}
