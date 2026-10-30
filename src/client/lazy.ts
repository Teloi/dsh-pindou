/**
 * Lazy modules (spec §18.6): a feature that lives in an async chunk
 * (lib/client.<name>.js, scripts/async-chunks.ts) is loaded the first time its
 * page opens. One small state machine serves every such feature:
 *
 *   unsupported — the host has no `require.async`: the entry card is shown but
 *                 unavailable (aria-disabled, 「需要新版 DSH」); nothing loads.
 *   idle → loading → ready
 *            ↘ failed → (retry) loading …  — 「加载失败，点此重试」, no toast.
 *
 * The host's loader forgets a failed chunk, so a retry fetches it again.
 */

/**
 * The module loader's factory parameter (the bundle wraps this file in
 * `factory: (require) => …`, tsdown.config.ts). Outside the host (tests, SSR)
 * there is no `require` at all.
 */
declare const require: unknown

/**
 * Can the host load package chunks? `require.async` is there from DSH 0.2.1-rc.3 on, the oldest
 * version engines.dsh admits: @deepseek-ai/dsh-client-modules@0.2.1-rc.3 lib/client.js:842, from
 * packages/client/modules/src/client/system.ts:338 at tag dsh-v0.2.1-rc.3.
 */
export function hostLoadsChunks(): boolean {
  return typeof require === 'function' && typeof (require as { async?: unknown }).async === 'function'
}

export type LazyStatus = 'unsupported' | 'idle' | 'loading' | 'ready' | 'failed'

export interface Lazy<T> {
  readonly status: () => LazyStatus
  readonly value: () => T | undefined
  /** Start (or retry) loading; resolves with the module, or undefined when it failed or cannot load. */
  readonly load: () => Promise<T | undefined>
  readonly subscribe: (fn: () => void) => () => void
}

export function lazy<T>(loader: () => Promise<T>, supported: boolean): Lazy<T> {
  let status: LazyStatus = supported ? 'idle' : 'unsupported'
  let value: T | undefined
  let pending: Promise<T | undefined> | null = null
  const listeners = new Set<() => void>()
  const set = (next: LazyStatus): void => { status = next; listeners.forEach(fn => { fn() }) }
  return {
    status: () => status,
    value: () => value,
    load() {
      if (status === 'unsupported') return Promise.resolve(undefined)
      if (status === 'ready') return Promise.resolve(value)
      if (pending) return pending
      set('loading')
      const p = (async () => {
        try {
          value = await loader()
          set('ready')
          return value
        } catch {
          set('failed')
          return undefined
        } finally {
          pending = null
        }
      })()
      pending = p
      return p
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
}

/** After this long in `loading`, show the skeleton block (spec §18.6). */
export const SKELETON_MS = 150
