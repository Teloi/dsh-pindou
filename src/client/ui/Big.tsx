/**
 * Big boards, entry side (plan §4.4): the page shell around the lazy chunk
 * lib/client.big.js. The chunk may not import the entry's modules
 * (scripts/async-chunks.ts): the palette and the PNG export go in as
 * `kit`.
 */
import type { ReactElement } from 'react'
import { PALETTE } from '../../core/index.ts'
import { useEnv } from './context.tsx'
import { LazyPage } from './LazyView.tsx'
import { exportBoard } from './Play.tsx'

const kit = { palette: PALETTE, exportBoard }
/** What the entry lends the big-board chunk. */
export type BigKit = typeof kit

export function BigView(): ReactElement {
  const env = useEnv()
  return <LazyPage mod={env.big}>{m => <m.BigPage env={env} kit={kit} />}</LazyPage>
}
