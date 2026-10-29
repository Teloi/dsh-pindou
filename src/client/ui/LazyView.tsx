/**
 * React side of lazy modules (spec §18.6): the entry card's degraded states and
 * the page wrapper (a skeleton block after 150 ms, an in-page retry). No
 * spinner, no toast. Kept small: it is first-screen code.
 */
import { useEffect, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { lazy, SKELETON_MS, type Lazy, type LazyStatus } from '../lazy.ts'
import { useEnv } from './context.tsx'

/** Stand-in when no lazy module was provided (tests, or a host that cannot load chunks). */
export const UNSUPPORTED: Lazy<never> = lazy<never>(() => Promise.reject(new Error('unsupported')), false)

export function useLazy<T>(mod: Lazy<T> = UNSUPPORTED): LazyStatus {
  return useSyncExternalStore(mod.subscribe, mod.status, mod.status)
}

/**
 * A home entry card backed by a lazy module. Unsupported: 50% opacity,
 * aria-disabled (still focusable), clicks do nothing, subtitle 「需要新版 DSH」
 * (part of the accessible name). Failed: subtitle 「加载失败，点此重试」; opening
 * the page retries.
 */
export function LazyCard({ mod = UNSUPPORTED, icon, title, desc, onOpen }: {
  readonly mod: Lazy<unknown> | undefined
  readonly icon: ReactNode
  readonly title: string
  readonly desc: string
  readonly onOpen: () => void
}): ReactElement {
  const { t } = useEnv()
  const status = useLazy(mod)
  const off = status === 'unsupported'
  return (
    <button type="button" className={off ? 'pd-big pd-off' : 'pd-big'} aria-disabled={off || undefined} data-lazy={status}
      onClick={off ? undefined : onOpen}>
      <span className="pd-ic" aria-hidden>{icon}</span>
      <b>{title}</b>
      {/* a status line shows in full (design C1) */}
      {off || status === 'failed' ? <span className="pd-st">{t(off ? 'needNewerDsh' : 'loadRetry')}</span> : <span>{desc}</span>}
    </button>
  )
}

/**
 * The page of a lazy module: loads on mount; a `--pd-surface` block once loading
 * takes over 150 ms; on failure a real button 「加载失败，点此重试」 (so Enter and
 * Space retry too). (Unsupported hosts never get here: the card and the
 * drop/paste entries are off.)
 */
export function LazyPage<T>({ mod = UNSUPPORTED, children }: { readonly mod: Lazy<T> | undefined, readonly children: (m: T) => ReactNode }): ReactElement {
  const { t } = useEnv()
  const status = useLazy(mod)
  const [slow, setSlow] = useState(false)
  useEffect(() => { void mod.load() }, [mod])
  useEffect(() => {
    if (status !== 'loading') return
    const id = setTimeout(setSlow, SKELETON_MS, true)
    return () => { clearTimeout(id); setSlow(false) }
  }, [status])
  const value = mod.value()
  return value === undefined
    ? (
      <div className="pd-lazy" data-lazy={status}>
        {status === 'failed'
          ? <button type="button" className="pd-btn" onClick={() => { void mod.load() }}>{t('loadRetry')}</button>
          : slow ? <i className="pd-skel" /> : null}
      </div>
    )
    : <>{children(value)}</>
}
