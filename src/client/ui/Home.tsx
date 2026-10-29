/** Start page: free play / AI cards, then the pattern grid with canvas thumbnails. */
import { memo, useEffect, useRef, type ReactElement } from 'react'
import { EMPTY, TEMPLATES, type Template } from '../../core/index.ts'
import { IconCheck, IconGrid, IconSparkle } from '../icons.tsx'
import { drawThumb } from '../render.ts'
import { useEnv, useGame } from './context.tsx'

const Thumb = memo(function Thumb({ tpl }: { readonly tpl: Template }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) drawThumb(ref.current, tpl.board) }, [tpl])
  return <canvas ref={ref} width={56} height={56} aria-hidden />
})

export function HomeView(): ReactElement {
  const { store, t, lang } = useEnv()
  const s = useGame()
  const inProgress = !s.ironed && s.history.present.cells.some(c => c !== EMPTY)
  return (
    <div className="pd-view pd-v-home">
      <div className="pd-start">
        <button type="button" className="pd-big" onClick={() => { store.startFree() }}>
          <span className="pd-ic" aria-hidden><IconGrid /></span>
          <b>{t('homeFree')}</b>
          <span>{t('homeFreeDesc')}</span>
        </button>
        <button type="button" className="pd-big" onClick={() => { store.go('ai') }}>
          <span className="pd-ic" aria-hidden><IconSparkle /></span>
          <b>{t('homeAi')}</b>
          <span>{t('homeAiDesc')}</span>
        </button>
      </div>
      <h3 className="pd-sec">
        <span>{t('homeTemplates')} · {t('homeCount', { n: TEMPLATES.length })}</span>
        {inProgress ? <button type="button" className="pd-link" onClick={() => { store.go('play') }}>{t('homeContinue')}</button> : null}
      </h3>
      <ul className="pd-tpls">
        {TEMPLATES.map((tpl) => {
          const name = lang === 'zh' ? tpl.zh : tpl.en
          const done = s.done.includes(tpl.id)
          return (
            <li key={tpl.id}>
              <button
                type="button"
                className="pd-tpl"
                aria-label={t('tplAria', { name, size: tpl.board.size, n: tpl.colors, diff: tpl.difficulty }) + (done ? `，${t('tplDone')}` : '')}
                onClick={() => { store.follow(tpl.id) }}
              >
                <Thumb tpl={tpl} />
                <span className="pd-nm">{name}</span>
                <span className="pd-meta" aria-hidden>
                  {t('tplMeta', { n: tpl.colors })}
                  <span className="pd-diff">{[1, 2, 3].map(d => <i key={d} className={d <= tpl.difficulty ? 'pd-on' : undefined} />)}</span>
                </span>
                {done ? <span className="pd-done" aria-hidden><IconCheck /></span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
