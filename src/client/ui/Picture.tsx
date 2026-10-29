/**
 * Picture to pattern, entry side (spec §18.2): the page shell around the lazy
 * chunk (lib/client.picture.js). The chunk may not import the entry's modules
 * (scripts/async-chunks.ts), so what it needs from here goes in as props.
 */
import type { ReactElement } from 'react'
import { PALETTE } from '../../core/index.ts'
import { IconPicture } from '../icons.tsx'
import { drawThumb } from '../render.ts'
import { useEnv } from './context.tsx'
import { LazyPage } from './LazyView.tsx'

const kit = { palette: PALETTE.map(c => c.hex), draw: drawThumb, icon: <IconPicture /> }

export function PictureView({ file, onTaken }: { readonly file: Blob | null, readonly onTaken: () => void }): ReactElement {
  const { store, lang, picture } = useEnv()
  return (
    <div className="pd-view">
      <LazyPage mod={picture}>{m => <m.PicturePage kit={kit} lang={lang} file={file} onTaken={onTaken} onStart={(b) => { store.startPicture(b) }} />}</LazyPage>
    </div>
  )
}
