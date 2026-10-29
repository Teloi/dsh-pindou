/**
 * AI page: one sentence → one LLM call → a pattern used as the faint guide.
 * Enter submits (never mid-IME composition), Esc cancels, 12|16 only.
 */
import { useEffect, useId, useRef, type ReactElement } from 'react'
import { MAX_PROMPT_CHARS } from '../../core/index.ts'
import { AI_SIZES } from '../game-store.ts'
import { useFocusReturn } from '../focus.ts'
import { IconAlert, IconSparkle } from '../icons.tsx'
import { cx, useEnv, useGame } from './context.tsx'

const ERR = {
  empty: 'aiErrEmpty', parse: 'aiErrParse', network: 'aiErrNetwork', busy: 'aiErrBusy',
  rate: 'aiErrRate', timeout: 'aiErrTimeout', 'not-configured': 'aiNotConfiguredBody',
} as const

export function AiView(): ReactElement {
  const env = useEnv()
  const { store, t } = env
  const s = useGame()
  const ai = s.ai
  const id = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const loading = ai.phase === 'loading'
  const notConfigured = ai.status?.configured === false || ai.error === 'not-configured'

  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void store.probeStatus()
    area.current?.focus({ preventScroll: true })
  }, [store])
  // While generation cannot work the input is disabled; put focus on the card's first action instead.
  useFocusReturn(card, notConfigured)
  const opener = notConfigured ? (env.settings?.() ?? {}) : {}
  const off = loading || notConfigured

  const submit = (): void => { void store.generate() }
  const examples = t('aiExamples').split('|')

  return (
    <div className="pd-view" onKeyDown={(e) => { if (e.key === 'Escape' && loading) { e.stopPropagation(); store.cancelGenerate() } }}>
      {notConfigured
        ? (
          <div className="pd-card pd-nocfg" role="status" ref={card}>
            <p className="pd-t"><IconAlert />{t('aiNotConfigured')}</p>
            <p>{t('aiNotConfiguredBody')}</p>
            <ol>
              <li>{opener.keys ? t('aiStep1Keys', { keys: opener.keys }) : t('aiStep1')}</li>
              <li>{t('aiStep2')}</li>
              <li>{t('aiStep3')}</li>
            </ol>
            {/* No public API opens a Settings section: say so instead of a button that does nothing. */}
            <p className="pd-muted">{t(opener.open ? 'aiSettingsHome' : 'aiSettingsManual')}</p>
            <div className="pd-acts">
              {opener.open
                ? <button type="button" className="pd-btn pd-primary" data-primary onClick={opener.open}>{t('aiOpenSettings')}</button>
                : null}
              <button type="button" className={cx('pd-btn', !opener.open && 'pd-primary')} {...(opener.open ? {} : { 'data-primary': true })}
                onClick={() => { store.setAiPrompt(ai.prompt); void store.probeStatus(true) }}>{t('aiRecheck')}</button>
              <button type="button" className="pd-btn pd-ghost" onClick={() => { store.go('home') }}>{t('aiPlayTemplates')}</button>
            </div>
          </div>
        )
        : null}
      <div className="pd-ai-box">
        <label htmlFor={`${id}-q`} className="pd-sr">{t('aiLabel')}</label>
        <textarea
          id={`${id}-q`}
          ref={area}
          value={ai.prompt}
          maxLength={MAX_PROMPT_CHARS}
          placeholder={t('aiPlaceholder')}
          disabled={off}
          aria-describedby={`${id}-n`}
          onChange={(e) => { store.setAiPrompt(e.target.value.slice(0, MAX_PROMPT_CHARS)) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="pd-ai-row">
          <span className="pd-seg" role="group" aria-label={t('size')}>
            {AI_SIZES.map(size => (
              <button key={size} type="button" aria-pressed={ai.size === size} disabled={off}
                onClick={() => { store.setAiSize(size) }}>{size}×{size}</button>
            ))}
          </span>
          <span className="pd-muted" id={`${id}-n`}>{t('aiChars', { n: ai.prompt.length, max: MAX_PROMPT_CHARS })}</span>
          {loading
            ? <button type="button" className="pd-btn pd-ghost" onClick={() => { store.cancelGenerate() }}>{t('aiCancel')}</button>
            : (
              <button type="button" className="pd-btn pd-primary" disabled={notConfigured || ai.prompt.trim() === ''} onClick={submit}>
                <IconSparkle />{t('aiGenerate')}
              </button>
            )}
        </div>
      </div>
      {/* Stays mounted for the live region; collapses while the page is disabled (not configured) so the chips don't float below an empty row. */}
      <div aria-live="polite" className="pd-ai-row" style={notConfigured ? undefined : { minHeight: 28, marginTop: 8 }}>
        {loading ? <span className="pd-shimmer" role="status">{t('aiGenerating')}</span> : null}
        {ai.status?.route === 'mock' && !loading ? <span className="pd-tokens">{t('aiMock')}</span> : null}
        {ai.status?.configured && ai.status.route !== 'mock' && !loading
          ? <span className="pd-tokens" title={ai.status.model ? t('aiModel', { model: ai.status.model }) : undefined}>{t('aiMeta')}</span>
          : null}
        {ai.status?.configured && ai.status.verified === false && !loading
          ? <span className="pd-tokens">{t('aiVerifyHint')}</span>
          : null}
      </div>
      {ai.phase === 'error' && ai.error && ai.error !== 'not-configured'
        ? (
          <div className="pd-card pd-err" role="alert">
            <p className="pd-t"><IconAlert />{t('aiErrTitle')}</p>
            <p>{t(ERR[ai.error])}</p>
            {ai.error !== 'empty'
              ? <div className="pd-acts"><button type="button" className="pd-btn" onClick={submit}>{t('aiRetry')}</button></div>
              : null}
          </div>
        )
        : null}
      <div className={cx('pd-chips')} role="group" aria-label={t('aiTipsTitle')}>
        {examples.map(ex => (
          <button key={ex} type="button" className="pd-chip" disabled={off}
            onClick={() => { store.setAiPrompt(ex); area.current?.focus() }}>{ex}</button>
        ))}
      </div>
      <div className="pd-card">
        <p className="pd-t">{t('aiTipsTitle')}</p>
        <p>{t('aiTips')}</p>
      </div>
    </div>
  )
}
