/** Panel shell: inner header (back · logo + name · ⋯ menu), the current view, toast and live region. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { COLOR_COUNT, type MessageKey } from '../../core/index.ts'
import type { ToastKey } from '../game-store.ts'
import { IconBack, IconLogo, IconMore } from '../icons.tsx'
import { AiView } from './Ai.tsx'
import { cx, useEnv, useGame } from './context.tsx'
import { HomeView } from './Home.tsx'
import { PlayView } from './Play.tsx'

const TOAST_TEXT: Record<ToastKey, MessageKey> = {
  cleared: 'toastCleared', locked: 'toastLocked', exported: 'toastExported', exportFailed: 'toastExportFailed',
  storageUnavailable: 'storageUnavailable', storageRecovered: 'storageRecovered',
}
const TOAST_MS = 2400
const TOAST_UNDO_MS = 5000

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox')
}

function Menu({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { store, t } = useEnv()
  const s = useGame()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role=menuitemcheckbox],[role=menuitem]')?.focus()
    const close = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('[data-pd-menu-btn]')) onClose()
    }
    document.addEventListener('pointerdown', close, true)
    return () => { document.removeEventListener('pointerdown', close, true) }
  }, [onClose])
  const toggles = [
    { key: 'busyHint', label: 'menuBusyHint' },
    { key: 'showGuide', label: 'menuGuide' },
    { key: 'showCodes', label: 'menuCodes' },
  ] as const
  const items = (): HTMLElement[] => [...(ref.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])]
  return (
    <div ref={ref} className="pd-menu" role="menu" tabIndex={-1} aria-label={t('settings')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const list = items()
          const i = list.indexOf(document.activeElement as HTMLElement)
          list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
        }
      }}>
      {toggles.map(({ key, label }) => (
        <button key={key} type="button" className="pd-mi" role="menuitemcheckbox" aria-checked={s.prefs[key]}
          onClick={() => { store.setPrefs({ [key]: !s.prefs[key] }) }}>
          {t(label)}<span className="pd-sw2" aria-hidden />
        </button>
      ))}
      <hr />
      <button type="button" className="pd-mi" role="menuitem" onClick={() => { store.showCoach(); onClose() }}>{t('menuCoach')}</button>
      <hr />
      <p className="pd-sec" style={{ margin: '4px 8px 2px' }}>{t('keysTitle')}</p>
      <ul className="pd-keys">
        <li>{t('keysTools')}</li><li>{t('keysColors')}</li><li>{t('keysHistory')}</li><li>{t('keysBoard')}</li><li>{t('keysEsc')}</li>
      </ul>
    </div>
  )
}

function Toast(): ReactElement | null {
  const { store, t } = useEnv()
  const s = useGame()
  const toast = s.toast
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => { store.hideToast() }, toast.undo ? TOAST_UNDO_MS : TOAST_MS)
    return () => { clearTimeout(id) }
  }, [toast, store])
  if (!toast) return null
  return (
    <div className="pd-toast" role="status">
      <span>{t(TOAST_TEXT[toast.key])}</span>
      {toast.undo ? <button type="button" onClick={() => { store.undo(); store.hideToast() }}>{t('toastUndo')}</button> : null}
    </div>
  )
}

export function App(): ReactElement {
  const { store, t } = useEnv()
  const s = useGame()
  const [menu, setMenu] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- scroll to top whenever the view changes
  useEffect(() => { scroller.current?.scrollTo?.({ top: 0 }) }, [s.mode])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      if (menu) { setMenu(false); return }
      if (s.overlay) { store.dismissOverlay(); return }
      if (s.ai.phase === 'loading') { store.cancelGenerate(); return }
      return
    }
    if (s.mode !== 'play' || isTyping(e.target) || (e.target as HTMLElement).closest?.('[role=menu]')) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); store.redo(); return }
    if (mod || e.altKey) return
    const toolKeys: Record<string, 'paint' | 'erase' | 'pick' | 'fill'> = { b: 'paint', e: 'erase', i: 'pick', g: 'fill' }
    const tool = toolKeys[e.key.toLowerCase()]
    if (tool) { e.preventDefault(); store.setTool(tool); return }
    const digit = /^Digit(\d)$/.exec(e.code)
    if (digit) {
      const d = Number(digit[1])
      const idx = e.shiftKey ? (d >= 1 && d <= 6 ? 9 + d : -1) : d === 0 ? 9 : d - 1
      if (idx >= 0) { e.preventDefault(); store.setColor(idx) }
      return
    }
    if (e.key === '[' || e.key === ']') {
      e.preventDefault()
      store.setColor((s.color + (e.key === ']' ? 1 : -1) + COLOR_COUNT) % COLOR_COUNT)
    }
  }

  const live = s.celebrateAt !== null ? t('celebrate') : ''
  return (
    <div className={cx('pd-root', s.prefs.showCodes && 'pd-codes')} onKeyDown={onKeyDown} data-mode={s.mode}>
      <header className="pd-head">
        {s.mode !== 'home'
          ? <button type="button" className="pd-ib" aria-label={t('back')} title={t('back')} onClick={() => { store.go('home') }}><IconBack /></button>
          : null}
        <h2><IconLogo className="pd-logo" />{t('appName')}</h2>
        <button type="button" className="pd-ib" data-pd-menu-btn aria-label={t('settings')} title={t('settings')}
          aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu(m => !m) }}><IconMore /></button>
      </header>
      {menu ? <Menu onClose={() => { setMenu(false) }} /> : null}
      <div className="pd-scroll" ref={scroller}>
        {s.mode === 'home' ? <HomeView /> : s.mode === 'ai' ? <AiView /> : <PlayView />}
      </div>
      <Toast />
      <div className="pd-sr" aria-live="polite" role="status">{live}</div>
    </div>
  )
}
