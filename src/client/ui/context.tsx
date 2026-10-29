import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Translate } from '../../core/index.ts'
import type { GameState, GameStore } from '../game-store.ts'
import type { SettingsOpener } from '../settings.ts'

export interface Env {
  readonly store: GameStore
  readonly lang: 'zh' | 'en'
  readonly t: Translate
  readonly reducedMotion: () => boolean
  readonly dark: () => boolean
  /** How to open DSH Settings from the panel (read when needed; see settings.ts). */
  readonly settings?: () => SettingsOpener
}

export const EnvContext = createContext<Env | null>(null)

export function useEnv(): Env {
  const env = useContext(EnvContext)
  if (!env) throw new Error('dsh-pindou: EnvContext missing')
  return env
}

/** The whole immutable game snapshot; components derive what they need. */
export function useGame(): GameState {
  const { store } = useEnv()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function isDark(doc: Document = document): boolean {
  return doc.body?.hasAttribute('data-ds-dark-theme') ?? false
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
