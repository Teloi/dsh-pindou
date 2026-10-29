/**
 * Session-header entry: a 32 px bead button that opens the `pindou` tab.
 * While the session's model is running (and the pref is on) it shows a
 * breathing dot, and — at most twice per session, never stealing focus — a
 * small "趁现在拼一个？" bubble below the button, portaled to document.body.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { PALETTE } from '../core/index.ts'
import type { GameStore } from './game-store.ts'
import { IconBead, IconClose } from './icons.tsx'
import { cx } from './ui/context.tsx'
import type { Translate } from '../core/index.ts'

export const HINT_MS = 8000
export const HINTS_PER_SESSION = 2
const shown = new Map<string, number>()

type Selector<S> = <R>(select: (state: S) => R) => R

export interface EntryProps {
  readonly sessionId?: string
  readonly useSessionStatus?: Selector<ReadonlyMap<string, { readonly running?: boolean | undefined }>>
  readonly useSession?: Selector<{ readonly running?: boolean | undefined } | undefined>
}

export interface EntryDeps {
  readonly store: GameStore
  readonly open: () => void
  readonly useT: () => Translate
  readonly panelVisible: () => boolean
}

export function makeEntry(deps: EntryDeps): (props: EntryProps) => ReactElement {
  return function PindouEntry(props: EntryProps): ReactElement {
    const t = deps.useT()
    // Prefer the unified status map; fall back to the session snapshot. Which
    // prop exists is fixed for the component's life, so hook order is stable.
    const running = props.useSessionStatus
      ? props.useSessionStatus(m => m.get(props.sessionId ?? '')?.running === true)
      : props.useSession
        ? props.useSession(s => s?.running === true)
        : false
    const busyHint = useSyncExternalStore(deps.store.subscribe, () => deps.store.getSnapshot().prefs.busyHint)
    const busy = running && busyHint
    const btn = useRef<HTMLButtonElement>(null)
    const [hint, setHint] = useState(false)

    useEffect(() => {
      if (!busy) { setHint(false); return }
      const key = props.sessionId ?? ''
      const count = shown.get(key) ?? 0
      if (count >= HINTS_PER_SESSION || deps.panelVisible()) return
      shown.set(key, count + 1)
      setHint(true)
      const id = setTimeout(() => { setHint(false) }, HINT_MS)
      return () => { clearTimeout(id) }
    }, [busy, props.sessionId])

    const open = (): void => { setHint(false); deps.open() }
    return (
      <>
        <button
          ref={btn}
          type="button"
          className={cx('pd-entry', 'pd-portal', busy && 'pd-busy')}
          aria-label={busy ? t('entryBusyLabel') : t('entryLabel')}
          title={t('entryLabel')}
          onClick={open}
        >
          <IconBead />
          <span className="pd-dot" aria-hidden />
        </button>
        {hint ? <Hint anchor={btn} t={t} onOpen={open} onClose={() => { setHint(false) }} /> : null}
      </>
    )
  }
}

function Hint({ anchor, t, onOpen, onClose }: { anchor: { current: HTMLElement | null }; t: Translate; onOpen: () => void; onClose: () => void }): ReactElement | null {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useLayoutEffect(() => {
    const place = (): void => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r || r.width === 0) { setPos(null); return }
      const vw = document.documentElement.clientWidth
      setPos({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(vw - r.right - 4)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor])
  if (!pos || typeof document === 'undefined') return null
  return createPortal(
    <div className="pd-portal pd-hint" role="status" style={{ top: pos.top, right: pos.right }}>
      <span className="pd-mini" aria-hidden>
        {[4, 2, 8].map(i => <i key={i} style={{ background: PALETTE[i]!.hex }} />)}
      </span>
      <span>{t('hintText')}</span>
      <button type="button" className="pd-go" tabIndex={-1} onClick={onOpen}>{t('hintGo')}</button>
      <button type="button" className="pd-x" tabIndex={-1} aria-label={t('hintClose')} onClick={onClose}><IconClose /></button>
    </div>,
    document.body,
  )
}
