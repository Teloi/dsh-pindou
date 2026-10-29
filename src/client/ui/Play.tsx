/** The play view: status line, board, toolbar, palette, footer and the under-board cards. */
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react'
import {
  BOARD_SIZES, codeOf, completion, COLOR_COUNT, EMPTY, findTemplate, PALETTE, remainingByColor, type Tool,
} from '../../core/index.ts'
import { IconBrush, IconEraser, IconFill, IconIron, IconPicker, IconRedo, IconSparkle, IconTrash, IconUndo, IconDownload } from '../icons.tsx'
import { downloadPng } from '../render.ts'
import { BoardView } from './Board.tsx'
import { cx, useEnv, useGame } from './context.tsx'

const TOOLS: ReadonlyArray<{ tool: Tool; key: string; icon: typeof IconBrush; label: 'toolPaint' | 'toolErase' | 'toolPick' | 'toolFill' }> = [
  { tool: 'paint', key: 'B', icon: IconBrush, label: 'toolPaint' },
  { tool: 'erase', key: 'E', icon: IconEraser, label: 'toolErase' },
  { tool: 'pick', key: 'I', icon: IconPicker, label: 'toolPick' },
  { tool: 'fill', key: 'G', icon: IconFill, label: 'toolFill' },
]

export function exportBoard(env: ReturnType<typeof useEnv>): void {
  const s = env.store.getSnapshot()
  void downloadPng(document, s.history.present, s.ironed, env.dark(), s.target).then((ok) => {
    env.store.showToast(ok ? 'exported' : 'exportFailed')
  })
}

function StatusLine(): ReactElement {
  const { store, t, lang } = useEnv()
  const s = useGame()
  const board = s.history.present
  const target = s.targetBoard
  const tpl = s.target ? findTemplate(s.target) : undefined
  const isAi = s.target?.startsWith('ai:') ?? false
  const ai = isAi ? s.ai.result : undefined
  const name = tpl ? (lang === 'zh' ? tpl.zh : tpl.en) : isAi ? (ai?.prompt ?? t('homeAi')) : t('playFree')
  const beads = board.cells.filter(c => c !== EMPTY).length
  const c = target ? completion(board, target) : null
  return (
    <div className="pd-status">
      <div className="pd-line">
        <strong title={name}>{name}</strong>
        {ai?.usage ? <span className="pd-tokens">{t('aiTokens', { n: ai.usage.input + ai.usage.output })}</span> : null}
        {ai?.cached ? <span className="pd-tokens">{t('aiTokensCached')}</span> : null}
        {c && c.wrong > 0 ? <span className="pd-warn">{t('playWrong', { n: c.wrong })}</span> : null}
        {c
          ? <span className="pd-r">{t('playProgress', { ok: c.matched, total: c.total, pct: c.percent })}</span>
          : (
            <span className="pd-r pd-seg" role="group" aria-label={t('size')}>
              {BOARD_SIZES.map(size => (
                <button key={size} type="button" aria-pressed={board.size === size} disabled={s.ironed}
                  onClick={() => { store.resize(size) }}>{size}</button>
              ))}
            </span>
          )}
        {!c ? <span className="pd-tokens">{t('playBeads', { n: beads })}</span> : null}
      </div>
      {c
        ? (
          <div className={cx('pd-prog', c.done && 'pd-full')} role="progressbar" aria-label={t('progressLabel')}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent}>
            <i style={{ width: `${c.percent}%` }} />
          </div>
        )
        : null}
      {ai && (ai.repaired || ai.truncated)
        ? <div className="pd-line"><span className="pd-tokens">{t(ai.truncated ? 'aiTruncated' : 'aiRepaired')}</span></div>
        : null}
    </div>
  )
}

function Toolbar(): ReactElement {
  const { store, t } = useEnv()
  const s = useGame()
  const locked = s.ironed || s.ironingSince !== null
  return (
    <div className="pd-tools" role="toolbar" aria-label={t('toolsLabel')}>
      {TOOLS.map(({ tool, key, icon: Icon, label }) => (
        <button key={tool} type="button" className="pd-tool" aria-pressed={s.tool === tool} disabled={locked}
          aria-label={t(label)} aria-keyshortcuts={key} title={`${t(label)} (${key})`}
          onClick={() => { store.setTool(tool) }}>
          <Icon />
          {tool === 'paint' ? <span className="pd-cur-swatch" style={{ '--pd-c': PALETTE[s.color]!.hex } as CSSProperties} /> : null}
        </button>
      ))}
      <span className="pd-sep" aria-hidden />
      <button type="button" className="pd-tool" aria-label={t('undo')} title={`${t('undo')} (⌘Z)`} aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!store.canUndo && !s.ironed} onClick={() => { store.undo() }}><IconUndo /></button>
      <button type="button" className="pd-tool" aria-label={t('redo')} title={`${t('redo')} (⇧⌘Z)`} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        disabled={!store.canRedo} onClick={() => { store.redo() }}><IconRedo /></button>
      <span className="pd-sep" aria-hidden />
      <button type="button" className="pd-tool" aria-label={t('clear')} title={t('clear')}
        disabled={locked || s.history.present.cells.every(c => c === EMPTY)} onClick={() => { store.clear() }}><IconTrash /></button>
    </div>
  )
}

function Palette(): ReactElement {
  const { store, t, lang } = useEnv()
  const s = useGame()
  const target = s.targetBoard
  const remaining = target ? remainingByColor(s.history.present, target) : null
  const used = target ? new Set(target.cells.filter(c => c !== EMPTY)) : null
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (to: number): void => {
    const i = (to + COLOR_COUNT) % COLOR_COUNT
    store.setColor(i)
    refs.current[i]?.focus()
  }
  return (
    <div className="pd-palette" role="radiogroup" aria-label={t('paletteLabel')}>
      {PALETTE.map((p, i) => {
        const left = remaining?.get(i) ?? 0
        const inTarget = used?.has(i) ?? false
        const name = lang === 'zh' ? p.zh : p.en
        return (
          <button
            key={p.code}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={s.color === i}
            tabIndex={s.color === i ? 0 : -1}
            aria-label={t('colorTip', { name, code: p.code })}
            title={t('colorTip', { name, code: p.code })}
            className={cx('pd-sw', used !== null && !inTarget && 'pd-dim')}
            style={{ '--pd-c': p.hex, '--pd-l': lightLabelOf(i) } as CSSProperties}
            onClick={() => { store.setColor(i) }}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
              if (d !== 0) { e.preventDefault(); move(i + (e.key === 'ArrowDown' || e.key === 'ArrowUp' ? d * 8 : d)) }
            }}
          >
            <span className="pd-swb" aria-hidden />
            <span className="pd-k" aria-hidden>{codeOf(i)}</span>
            {inTarget
              ? <span className={cx('pd-cnt', left === 0 && 'pd-ok')} aria-hidden>{left === 0 ? '✓' : left}</span>
              : null}
          </button>
        )
      })}
    </div>
  )
}

function lightLabelOf(i: number): string {
  const v = Number.parseInt(PALETTE[i]!.hex.slice(1), 16)
  const l = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
  return l > 150 ? 'rgba(0,0,0,.7)' : '#fff'
}

function Footer(): ReactElement {
  const env = useEnv()
  const { store, t } = env
  const s = useGame()
  const empty = s.history.present.cells.every(c => c === EMPTY)
  const ironing = s.ironingSince !== null
  const isAi = s.target?.startsWith('ai:') ?? false
  return (
    <div className="pd-foot">
      {isAi && !s.ironed
        ? <button type="button" className="pd-btn pd-ghost" disabled={ironing || s.celebrateAt !== null} onClick={() => { store.fillTarget() }}><IconSparkle />{t('fillBoard')}</button>
        : null}
      <button type="button" className="pd-btn pd-warm pd-grow" disabled={empty || s.ironed || ironing} aria-busy={ironing}
        onClick={() => { store.iron() }}>
        <IconIron />{ironing ? t('ironing') : t('iron')}
      </button>
      <button type="button" className="pd-btn" disabled={empty} onClick={() => { exportBoard(env) }}><IconDownload />{t('exportPng')}</button>
    </div>
  )
}

function OverlayCard(): ReactElement | null {
  const env = useEnv()
  const { store, t } = env
  const s = useGame()
  const ref = useRef<HTMLDivElement>(null)
  const kind = s.overlay
  useEffect(() => {
    // Move focus to the card's primary action; it never covers the board.
    ref.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus({ preventScroll: true })
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- refocus when the card kind changes
  }, [kind])
  if (kind === null) return null
  const board = s.history.present
  const beads = board.cells.filter(c => c !== EMPTY).length
  const colors = new Set(board.cells.filter(c => c !== EMPTY)).size
  const title = kind === 'coach' ? t('coachTitle') : kind === 'done' ? t('doneTitle') : t('resultTitle')
  return (
    <div ref={ref} className="pd-overlay" role="dialog" aria-modal="false" aria-labelledby="pd-ov-t"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); store.dismissOverlay() } }}>
      <p className="pd-t" id="pd-ov-t">{kind === 'result' ? '✨ ' : kind === 'done' ? '🎉 ' : ''}{title}</p>
      {kind === 'coach' ? <p className="pd-d">{t('coachBody')}</p> : null}
      {kind === 'done' ? <p className="pd-d">{t('doneBody')}</p> : null}
      {kind === 'result' ? <p className="pd-d">{t('resultCount', { n: beads, c: colors })}</p> : null}
      <div className="pd-acts">
        {kind === 'coach' ? <button type="button" className="pd-btn pd-primary" data-primary onClick={() => { store.dismissOverlay() }}>{t('coachOk')}</button> : null}
        {kind === 'done'
          ? (<>
            <button type="button" className="pd-btn pd-ghost" onClick={() => { store.dismissOverlay() }}>{t('doneLater')}</button>
            <button type="button" className="pd-btn pd-warm" data-primary onClick={() => { store.iron() }}><IconIron />{t('iron')}</button>
          </>)
          : null}
        {kind === 'result'
          ? (<>
            <button type="button" className="pd-btn pd-ghost" onClick={() => { store.unIron() }}>{t('unIron')}</button>
            <button type="button" className="pd-btn" onClick={() => { store.again() }}>{t('again')}</button>
            <button type="button" className="pd-btn pd-primary" data-primary onClick={() => { exportBoard(env) }}><IconDownload />{t('exportPng')}</button>
          </>)
          : null}
      </div>
    </div>
  )
}

export function PlayView(): ReactElement {
  return (
    <div className="pd-view">
      <StatusLine />
      <BoardView />
      <div className="pd-under">
        <Toolbar />
        <Palette />
        <Footer />
        <OverlayCard />
      </div>
    </div>
  )
}
