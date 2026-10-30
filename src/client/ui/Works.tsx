/**
 * The works wall, entry side (spec §18.4): the home row and the page shell
 * around the lazy chunk lib/client.works.js. Collecting and withdrawing works
 * happen in the store (game-store.ts), synchronously, so they never wait on the
 * chunk. The chunk may not import the entry's modules (scripts/async-chunks.ts):
 * what it needs goes in as `kit` and `env`.
 *
 * Home row (design decision, an exception to §18.6): with works on the wall the
 * chunk is preloaded on the start page, once per session (lazy.ts keeps it), and
 * the thumbnails fade in (150 ms, none with reduced motion) when they arrive.
 * Until then the row keeps its fixed height: empty while loading, a retry button
 * (Enter/Space) when it failed, the 「需要新版 DSH」 line when the host cannot load
 * chunks. No toast. No works, no row (decided in the same render as everything
 * below it, so nothing moves).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { decode, findTemplate } from '../../core/index.ts'
import { renderExport } from '../render.ts'
import { useEnv, useGame } from './context.tsx'
import { LazyPage, useLazy } from './LazyView.tsx'
import { copyBoard, copySupported, exportBoard } from './Play.tsx'

const kit = { render: renderExport, decode, template: findTemplate, exportBoard, copyBoard, copySupported }
/** What the entry lends the works chunk. */
export type WorksKit = typeof kit

export function HomeWorks(): ReactElement | null {
  const env = useEnv()
  const { t, works: mod } = env
  useGame() // the wall changes with the game state (store.setWall)
  const wall = env.store.works()
  const status = useLazy(mod)
  const n = wall.length
  // the thumbnails fade in only when they arrive while the row is on screen
  const [fade] = useState(status !== 'ready')
  // the retry button goes when the row arrives: the row then takes the focus (b4 重要 3)
  const [retried, setRetried] = useState(false)
  useEffect(() => { if (n && status === 'idle') void mod?.load() }, [n, status, mod])
  const m = mod?.value()
  // loaded: the chunk draws the whole section (title, 全部 ›, thumbnails) in the same box
  return !n
    ? null
    : m
      ? <m.WorksRow env={env} kit={kit} wall={wall} fade={fade} focus={retried} />
      : (
        <section className="pd-works">
          <h3 className="pd-sec">{t('homeWorks')} · {n}</h3>
          <div className="pd-wrow">
            {status === 'failed'
              ? <button type="button" className="pd-link" onClick={() => { setRetried(true); void mod?.load() }}>{t('loadRetry')}</button>
              : status === 'unsupported' ? t('needNewerDsh') : null}
          </div>
        </section>
      )
}

export function WorksView(): ReactElement {
  const env = useEnv()
  useGame()
  return (
    <div className="pd-view">
      <LazyPage mod={env.works}>{m => <m.WorksPage env={env} kit={kit} wall={env.store.works()} />}</LazyPage>
    </div>
  )
}
