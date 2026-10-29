/** The play view: status line, board, toolbar, palette, footer and the under-board cards. */
import { useRef, type CSSProperties, type ReactElement } from 'react'
import {
  BOARD_SIZES, codeOf, completion, COLOR_COUNT, EMPTY, findTemplate, PALETTE, remainingByColor, type Tool,
} from '../../core/index.ts'
import { IconBrush, IconCopy, IconEraser, IconFill, IconIron, IconPicker, IconRedo, IconSparkle, IconTrash, IconUndo, IconDownload } from '../icons.tsx'
import { canCopyImage, copyPng, downloadBlob, exportBlob, exportFileName, saveRoute } from '../render.ts'
import { useFocusReturn } from '../focus.ts'
import { BoardView } from './Board.tsx'
import { cx, useEnv, useGame } from './context.tsx'

const TOOLS: ReadonlyArray<{ tool: Tool; key: string; icon: typeof IconBrush; label: 'toolPaint' | 'toolErase' | 'toolPick' | 'toolFill' }> = [
  { tool: 'paint', key: 'B', icon: IconBrush, label: 'toolPaint' },
  { tool: 'erase', key: 'E', icon: IconEraser, label: 'toolErase' },
  { tool: 'pick', key: 'I', icon: IconPicker, label: 'toolPick' },
  { tool: 'fill', key: 'G', icon: IconFill, label: 'toolFill' },
]

/** PNG export (spec §13): download, or the in-panel preview where downloads are unsupported. */
export function exportBoard(env: ReturnType<typeof useEnv>): void {
  const s = env.store.getSnapshot()
  const name = exportFileName(s.target, new Date())
  void exportBlob(document, s.history.present, s.ironed, env.dark()).then((blob) => {
    if (!blob) { env.store.showToast('exportFailed'); return }
    if (saveRoute(document) === 'manual') { env.store.setPreview({ url: URL.createObjectURL(blob), name }); return }
    if (downloadBlob(document, blob, name)) env.store.showToast('exported', false, { name })
    else env.store.setPreview({ url: URL.createObjectURL(blob), name })
  })
}

/** "Copy image": PNG to the clipboard, so it can be pasted straight into the conversation. */
export function copyBoard(env: ReturnType<typeof useEnv>): void {
  const s = env.store.getSnapshot()
  void copyPng(exportBlob(document, s.history.present, s.ironed, env.dark())).then((ok) => {
    env.store.showToast(ok ? 'copied' : 'copyFailed')
  })
}

/** Evaluated once: clipboard image support does not change during a page's life. */
let copyable: boolean | undefined
export function copySupported(): boolean {
  copyable ??= canCopyImage(globalThis)
  return copyable
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
        {c && c.wrong > 0
          ? <span className="pd-warn">{t(c.matched === c.total ? 'playOneStep' : 'playWrong', { n: c.wrong })}</span>
          : null}
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
  const env = useEnv()
  const { store, t } = env
  const s = useGame()
  const locked = s.ironed || s.ironingSince !== null
  const empty = s.history.present.cells.every(c => c === EMPTY)
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
        disabled={locked || empty} onClick={() => { store.clear() }}><IconTrash /></button>
      {/* below 768px the host shows the sidebar full screen and the footer's iron / export move here (spec §3.2) */}
      <span className="pd-sep pd-m-only" aria-hidden />
      <button type="button" className="pd-tool pd-m-only" aria-label={t('iron')} title={t('iron')}
        disabled={empty || locked} onClick={() => { store.iron() }}><IconIron /></button>
      <button type="button" className="pd-tool pd-m-only" aria-label={t('exportPng')} title={t('exportPng')}
        disabled={empty} onClick={() => { exportBoard(env) }}><IconDownload /></button>
      {copySupported()
        ? <button type="button" className="pd-tool pd-m-only" aria-label={t('copyImage')} title={t('copyImage')}
          disabled={empty} onClick={() => { copyBoard(env) }}><IconCopy /></button>
        : null}
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
  // The result card carries export / copy itself; don't show them twice (spec §4.6).
  const dup = s.overlay === 'result'
  return (
    <div className="pd-foot">
      {isAi && !s.ironed
        ? <button type="button" className="pd-btn pd-ghost" disabled={ironing || s.complete} onClick={() => { store.fillTarget() }}><IconSparkle />{t('fillBoard')}</button>
        : null}
      <button type="button" className="pd-btn pd-warm pd-grow pd-io" disabled={empty || s.ironed || ironing} aria-busy={ironing}
        onClick={() => { store.iron() }}>
        <IconIron />{ironing ? t('ironing') : t('iron')}
      </button>
      {dup ? null : <button type="button" className="pd-btn pd-io" disabled={empty} onClick={() => { exportBoard(env) }}><IconDownload />{t('exportPng')}</button>}
      {copySupported() && !dup
        ? <button type="button" className="pd-btn pd-io pd-icon-only" disabled={empty} aria-label={t('copyImage')} title={t('copyImage')} onClick={() => { copyBoard(env) }}><IconCopy /></button>
        : null}
    </div>
  )
}

function OverlayCard({ only }: { readonly only: 'coach' | 'other' }): ReactElement | null {
  const env = useEnv()
  const { store, t } = env
  const s = useGame()
  const ref = useRef<HTMLDivElement>(null)
  const kind = s.overlay !== null && (s.overlay === 'coach') === (only === 'coach') ? s.overlay : null
  // Focus moves to the card's primary action and comes back to whatever opened it (focus.ts).
  useFocusReturn(ref, kind)
  if (kind === null) return null
  const board = s.history.present
  const beads = board.cells.filter(c => c !== EMPTY).length
  const colors = new Set(board.cells.filter(c => c !== EMPTY)).size
  const title = kind === 'coach' ? t('coachTitle') : kind === 'done' ? t('doneTitle') : t('resultTitle')
  return (
    <div ref={ref} className={cx('pd-overlay', kind === 'coach' && 'pd-coach', kind === 'result' && 'pd-result')} role="dialog" aria-modal="false" aria-labelledby="pd-ov-t"
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
            {copySupported()
              ? <button type="button" className="pd-btn pd-icon-only" aria-label={t('copyImage')} title={t('copyImage')} onClick={() => { copyBoard(env) }}><IconCopy /></button>
              : null}
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
      <BoardView overlay={<OverlayCard only="coach" />} />
      <div className="pd-under">
        <Toolbar />
        <Palette />
        <Footer />
        <OverlayCard only="other" />
      </div>
    </div>
  )
}
