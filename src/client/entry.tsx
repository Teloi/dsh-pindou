/**
 * The two session-scoped surfaces outside the panel (spec §2):
 *
 * - `PindouEntry` — a 32 px ghost button in `conversation.session.header.actions`.
 *   It never pops anything; a 6 px dot is the only signal: breathing accent
 *   while the model runs, steady warm when unfinished work or a fresh AI
 *   pattern waits in the closed panel.
 * - `BusyPill` — the 28 px "趁现在拼一个？" pill in `conversation.input.overlay`.
 *   The host anchors that slot as a zero-height, absolutely positioned strip on
 *   the composer card's top edge (`position: relative`, no overflow clipping),
 *   so the pill floats above the card's top-right corner without covering the
 *   typed text or the send button. It never takes focus.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { Translate } from '../core/index.ts'
import { entryDot, type GameStore } from './game-store.ts'
import { IconBead, IconClose } from './icons.tsx'
import { cx } from './ui/context.tsx'

export const HINT_DELAY_MS = 3000
export const HINT_MS = 8000
export const HINT_FADE_MS = 200
export const HINTS_PER_SESSION = 2
export const HINT_MIN_VIEWPORT = 480

type Selector<S> = <R>(select: (state: S) => R) => R

export interface SessionProps {
  readonly sessionId?: string
  readonly useSession?: Selector<{ readonly running?: boolean | undefined } | undefined>
  /** ui-conversation's input selector; only used to notice typing. */
  readonly useInput?: Selector<{ readonly draft?: string } | undefined>
}

export interface EntryDeps {
  readonly store: GameStore
  readonly open: () => void
  readonly useT: () => Translate
  /** e.g. "Control+Alt+K Meta+Alt+K" when the global shortcut is registered. */
  readonly keyshortcuts?: string | undefined
}

function useRunning(props: SessionProps): boolean {
  return props.useSession ? props.useSession(s => s?.running === true) : false
}

function useStore<T>(store: GameStore, pick: (s: ReturnType<GameStore['getSnapshot']>) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.getSnapshot()))
}

export function makeEntry(deps: EntryDeps): (props: SessionProps) => ReactElement {
  const { store } = deps
  return function PindouEntry(props: SessionProps): ReactElement {
    const t = deps.useT()
    const running = useRunning(props)
    const dot = useSyncExternalStore(store.subscribe, () => entryDot(store.getSnapshot(), running))
    const open = useStore(store, s => s.panelVisible)
    return (
      <button
        type="button"
        className={cx('pd-portal', 'pd-entry', dot === 'busy' && 'pd-busy', dot === 'progress' && 'pd-has-progress')}
        aria-label={running ? t('entryBusyLabel') : t('entryLabel')}
        aria-expanded={open}
        aria-keyshortcuts={deps.keyshortcuts}
        title={t('entryLabel')}
        onClick={deps.open}
      >
        <IconBead />
        <span className="pd-dot" aria-hidden />
      </button>
    )
  }
}

/**
 * Per-session show counts (design N5): kept in sessionStorage, so a reload
 * doesn't hand out two more pills for the same conversation, and in memory as
 * the fallback when storage is unavailable (private mode, quota, sandbox).
 */
export const HINTS_KEY = 'dsh-pindou:hints'
const HINTS_KEPT = 50
const shownCount = new Map<string, number>()

function sessionStore(): Storage | undefined {
  try { return globalThis.sessionStorage } catch { return undefined }
}

function readCounts(): Record<string, number> {
  try {
    const raw = sessionStore()?.getItem(HINTS_KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && e[1] >= 0))
  } catch { return {} }
}

export function hintCount(key: string): number {
  return Math.max(shownCount.get(key) ?? 0, readCounts()[key] ?? 0)
}

function noteHintShown(key: string, count: number): void {
  shownCount.set(key, count)
  try {
    const all = { ...readCounts() }
    delete all[key]
    all[key] = count
    const keep = Object.entries(all).slice(-HINTS_KEPT)
    sessionStore()?.setItem(HINTS_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch { /* memory count still applies */ }
}

/** Test hook: forget how often the pill was shown. */
export function resetHintCounts(): void {
  shownCount.clear()
  try { sessionStore()?.removeItem(HINTS_KEY) } catch { /* nothing stored */ }
}

function useNarrow(): boolean {
  const get = (): boolean => globalThis.innerWidth < HINT_MIN_VIEWPORT // (false without a window)
  return useSyncExternalStore((fn) => {
    window.addEventListener('resize', fn)
    return () => { window.removeEventListener('resize', fn) }
  }, get, () => false)
}

export function makeBusyPill(deps: EntryDeps): (props: SessionProps) => ReactElement | null {
  const { store } = deps
  return function BusyPill(props: SessionProps): ReactElement | null {
    const t = deps.useT()
    const running = useRunning(props)
    const typing = props.useInput ? props.useInput(s => (s?.draft ?? '').trim() !== '') : false
    const enabled = useStore(store, s => s.prefs.busyHint)
    const panelOpen = useStore(store, s => s.panelVisible)
    const narrow = useNarrow()
    const blocked = !enabled || panelOpen || typing || narrow
    const [phase, setPhase] = useState<'hidden' | 'shown' | 'leaving'>('hidden')
    const blockedRef = useRef(blocked)
    blockedRef.current = blocked
    const key = props.sessionId ?? ''

    // One chance per turn: the pill may appear once the run has lasted 3 s.
    useEffect(() => {
      if (!running) return
      const id = setTimeout(() => {
        const count = hintCount(key)
        if (count >= HINTS_PER_SESSION || blockedRef.current) return
        noteHintShown(key, count + 1)
        setPhase('shown')
      }, HINT_DELAY_MS)
      return () => { clearTimeout(id) }
    }, [running, key])

    const hide = (): void => { setPhase(p => (p === 'shown' ? 'leaving' : p)) }
    // Leave at once when the turn ends or the user starts typing / opens the panel.
    useEffect(() => { if (!running || blocked) hide() }, [running, blocked])

    // 8 s dwell, paused while hovered.
    const remaining = useRef(HINT_MS)
    const [hover, setHover] = useState(false)
    useEffect(() => {
      if (phase !== 'shown') { remaining.current = HINT_MS; return }
      if (hover) return
      const started = Date.now()
      const id = setTimeout(hide, remaining.current)
      return () => { clearTimeout(id); remaining.current -= Date.now() - started }
    }, [phase, hover])

    useEffect(() => {
      if (phase !== 'leaving') return
      const id = setTimeout(() => { setPhase('hidden') }, HINT_FADE_MS)
      return () => { clearTimeout(id) }
    }, [phase])

    if (phase === 'hidden') return null
    return (
      <div className={cx('pd-portal', 'pd-pill', phase === 'leaving' && 'pd-out')} role="status" aria-live="polite"
        onPointerEnter={() => { setHover(true) }} onPointerLeave={() => { setHover(false) }}>
        <button type="button" className="pd-pill-go" tabIndex={-1} aria-label={t('hintGo')}
          onMouseDown={(e) => { e.preventDefault() }}
          onClick={(e) => { e.stopPropagation(); hide(); deps.open() }}>
          <i className="pd-pill-bead" aria-hidden />
          <span>{t('hintText')}</span>
        </button>
        <button type="button" className="pd-pill-x" tabIndex={-1} aria-label={t('hintClose')}
          onMouseDown={(e) => { e.preventDefault() }}
          onClick={(e) => { e.stopPropagation(); hide() }}>
          <IconClose />
        </button>
      </div>
    )
  }
}
