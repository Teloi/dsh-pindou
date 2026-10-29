/**
 * "Open DSH Settings" from inside the panel (design walkthrough I4).
 *
 * DSH exposes no public "run command" API to plugins. The `settings.open`
 * shortcut is in the shortcuts catalog with its effective binding, and the Web
 * keyboard adapter listens on `window`, so on Web (and the Linux desktop app,
 * which uses the same DOM adapter) a synthetic keydown with that binding opens
 * the Settings shell. It lands on Settings' default section, not on Models.
 *
 * On desktop macOS / Windows the native keyboard bridge handles bindings and a
 * DOM event does nothing, and the user may have unbound the shortcut: in those
 * cases this returns null and the panel shows only the written steps.
 */
export interface ShortcutBinding {
  readonly code: string
  readonly modifiers: readonly string[]
  readonly secondCode?: string
}
export interface ShortcutsFace {
  readonly runtime?: string
  readonly platform?: string
  readonly catalog?: { getSnapshot(): ReadonlyArray<{ readonly id: string; readonly keys?: string | readonly string[]; readonly aria?: string; readonly binding?: ShortcutBinding | null }> }
}

export const SETTINGS_SHORTCUT = 'settings.open'

export interface SettingsOpener {
  /** The shortcut as text for the written steps, e.g. 「⌥⌘,」 or 「Ctrl+Alt+,」 (see formatKeys). */
  readonly keys?: string | undefined
  /** Fire the shortcut; undefined when a synthetic key event cannot work here. */
  readonly open?: (() => void) | undefined
}

/**
 * The catalog's keycaps as one string. DSH (`presentBinding`) gives an array:
 * macOS symbols `['⌥', '⌘', ',']` → 「⌥⌘,」; Windows with separator tokens
 * `['Ctrl', '+', 'Alt', '+', ',']` → 「Ctrl+Alt+,」; Linux `['Ctrl', 'Alt', ',']`
 * → 「Ctrl+Alt+,」. A chord's second key comes last and is set off by a space.
 */
export function formatKeys(keys: unknown, platform: string | undefined, chord = false): string | undefined {
  if (typeof keys === 'string') return keys.trim() || undefined
  if (!Array.isArray(keys)) return undefined
  const caps = keys.filter((k, i): k is string => typeof k === 'string' && k !== ''
    && !(platform === 'windows' && k === '+' && i % 2 === 1))
  if (caps.length === 0) return undefined
  const tail = chord && caps.length > 1 ? caps.pop() : undefined
  const head = caps.join(platform === 'macos' ? '' : '+')
  return tail === undefined ? head : `${head} ${tail}`
}

function keyOf(code: string): string {
  if (code === 'Comma') return ','
  if (code === 'Period') return '.'
  const m = /^(?:Key|Digit)(.)$/.exec(code)
  return m ? m[1]!.toLowerCase() : code
}

export function settingsOpener(shortcuts: ShortcutsFace | undefined, win: Window | undefined = globalThis.window): SettingsOpener {
  let entry
  try { entry = shortcuts?.catalog?.getSnapshot().find(e => e.id === SETTINGS_SHORTCUT) } catch { return {} }
  const binding = entry?.binding
  if (!entry || !binding || !binding.code) return {}
  const keys = formatKeys(entry.keys, shortcuts?.platform, binding.secondCode !== undefined)
  const domAdapter = shortcuts?.runtime === 'web' || shortcuts?.platform === 'linux'
  if (!domAdapter || !win) return { keys }
  const has = (m: string): boolean => binding.modifiers.includes(m)
  return {
    keys,
    open: () => {
      const target = win.document.body
      target.dispatchEvent(new (win as Window & typeof globalThis).KeyboardEvent('keydown', {
        code: binding.code, key: keyOf(binding.code), bubbles: true, cancelable: true,
        ctrlKey: has('control'), altKey: has('alt'), shiftKey: has('shift'), metaKey: has('meta'),
      }))
    },
  }
}
