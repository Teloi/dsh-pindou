/**
 * Panel body. The host tab strip already shows the title and the close button,
 * so the inner header carries only ‹ Back and ⋯ (spec §3.1/§14.3).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from 'react'
import { COLOR_COUNT, type MessageKey } from '../../core/index.ts'
import type { GameState, ToastKey } from '../game-store.ts'
import { focusBoard, useFocusGuard, useFocusReturn } from '../focus.ts'
import { IconBack, IconMore } from '../icons.tsx'
import { AiView } from './Ai.tsx'
import { cx, useEnv, useGame } from './context.tsx'
import { HomeView } from './Home.tsx'
import { useLazy } from './LazyView.tsx'
import { PictureView } from './Picture.tsx'
import { PlayView } from './Play.tsx'

const TOAST_TEXT: Record<ToastKey, MessageKey> = {
  cleared: 'toastCleared', newGame: 'toastNewGame', locked: 'toastLocked', exported: 'toastExported', exportFailed: 'toastExportFailed',
  copied: 'toastCopied', copyFailed: 'toastCopyFailed',
  storageUnavailable: 'storageUnavailable', storageRecovered: 'storageRecovered',
}
const TOAST_MS = 2400
const TOAST_UNDO_MS = 5000

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox')
}

const menuButton = (el: HTMLElement): Element | null | undefined => el.closest('.pd-root')?.querySelector('[data-pd-menu-btn]')

function Menu({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { store, t } = useEnv()
  const s = useGame()
  const ref = useRef<HTMLDivElement>(null)
  // Focus the first item; Esc or an item that closes the menu gives focus back to ⋯ (focus.ts).
  useFocusReturn(ref, true, '[role=menuitemcheckbox],[role=menuitem]', menuButton)
  useEffect(() => {
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

/**
 * Toast: 2.4 s, or 5 s with 撤销. Hovering or focusing it pauses the clock
 * (the remaining time is kept, design N14). 撤销 puts focus on the board,
 * where the change it undid is (design N4).
 */
const toastIds = new WeakMap<object, number>()
let toastSeq = 0
function Toast(): ReactElement | null {
  const toast = useGame().toast
  if (!toast) return null
  let id = toastIds.get(toast)
  if (id === undefined) { id = ++toastSeq; toastIds.set(toast, id) }
  // keyed by the toast: a new toast starts with a fresh clock and no hold
  return <ToastView key={id} toast={toast} />
}

function ToastView({ toast }: { toast: NonNullable<GameState['toast']> }): ReactElement {
  const { store, t } = useEnv()
  const [held, setHeld] = useState(0)
  const left = useRef(toast.undo ? TOAST_UNDO_MS : TOAST_MS)
  const started = useRef(0)
  useEffect(() => {
    if (held > 0) return
    started.current = Date.now()
    const id = setTimeout(() => { store.hideToast() }, left.current)
    return () => { clearTimeout(id); left.current = Math.max(0, left.current - (Date.now() - started.current)) }
  }, [held, store])
  const hold = (on: boolean) => (): void => { setHeld(h => Math.max(0, h + (on ? 1 : -1))) }
  return (
    <div className="pd-toast" role="status" data-held={held > 0 || undefined}
      onPointerEnter={hold(true)} onPointerLeave={hold(false)}
      onFocus={hold(true)} onBlur={hold(false)}>
      {/* the whole text stays in the DOM (read out by role=status) and in the tooltip when it is cut */}
      <span title={t(TOAST_TEXT[toast.key], toast.params)}>{t(TOAST_TEXT[toast.key], toast.params)}</span>
      {toast.undo
        ? (
          <button type="button" onClick={(e) => {
            const root = e.currentTarget.closest('.pd-root')
            store.undoToast()
            setTimeout(() => { focusBoard(root) }, 0)
          }}>{t('toastUndo')}</button>
        )
        : null}
    </div>
  )
}

/** Manual-save fallback: the exported PNG, shown in the panel (no popups in DSH desktop). */
function Preview(): ReactElement | null {
  const { store, t } = useEnv()
  const preview = useGame().preview
  const ref = useRef<HTMLDivElement>(null)
  useFocusReturn(ref, preview?.url ?? null, 'button')
  if (!preview) return null
  return (
    <div ref={ref} className="pd-preview" role="dialog" aria-modal="false" aria-label={t('exportPng')}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); store.setPreview(null) } }}>
      <p className="pd-d">{t('previewTitle')}</p>
      <img src={preview.url} alt={preview.name} />
      <button type="button" className="pd-btn" onClick={() => { store.setPreview(null) }}>{t('previewClose')}</button>
    </div>
  )
}

/** Is the panel on screen right now? (Exported for tests.) */
export function panelOnScreen(el: HTMLElement): boolean {
  if (!el.isConnected || el.getClientRects().length === 0 || el.ownerDocument.visibilityState === 'hidden') return false
  // The host hides a tab with [hidden]/display:none and a collapsed sidebar with inert + aria-hidden.
  if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false
  if (el.checkVisibility?.({ visibilityProperty: true }) === false) return false // (older engines lack it)
  const view = el.ownerDocument.defaultView
  if (!view || !view.innerWidth) return true
  const r = el.getBoundingClientRect()
  // A collapsed sidebar keeps its size but slides past the viewport edge.
  return r.right > 0 && r.bottom > 0 && r.left < view.innerWidth && r.top < view.innerHeight
}

/**
 * Report whether the (kept-mounted) panel is on screen (spec §15.1-3). Event
 * driven, so the report is never a tick late: size changes, viewport
 * intersection, and the host's hide/collapse attributes on any ancestor; a
 * slow tick stays as a safety net. The store also gets a live probe, so a
 * result that lands between two reports is judged on the current state.
 */
function usePanelVisibility(ref: { readonly current: HTMLElement | null }): void {
  const { store } = useEnv()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const doc = el.ownerDocument
    const check = (): void => { store.setPanelVisible(panelOnScreen(el)) }
    check()
    store.setVisibilityProbe(() => panelOnScreen(el))
    const win = doc.defaultView
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : undefined
    ro?.observe(el)
    const io = win && typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(check) : undefined
    io?.observe(el)
    const mo = win && typeof win.MutationObserver === 'function' ? new win.MutationObserver(check) : undefined
    mo?.observe(doc.documentElement, { attributes: true, subtree: true, attributeFilter: ['hidden', 'inert', 'aria-hidden'] })
    doc.addEventListener('visibilitychange', check)
    const id = setInterval(check, 1000)
    return () => {
      ro?.disconnect(); io?.disconnect(); mo?.disconnect(); clearInterval(id)
      doc.removeEventListener('visibilitychange', check)
      store.setVisibilityProbe(null)
      store.setPanelVisible(false)
    }
  }, [ref, store])
}

/**
 * Files dragged onto the panel are the panel's, always (spec §18.6): its root alone calls
 * preventDefault + stopPropagation, so DSH's document-level drop listener never attaches them
 * to the chat; drags anywhere else are untouched. Bound to the root, unbound on unmount.
 */
function useFileDrops(ref: RefObject<HTMLElement | null>, onFiles: (files: FileList) => void): void {
  useEffect(() => {
    const el = ref.current
    const on = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'drop') onFiles(e.dataTransfer.files)
    }
    for (const type of DRAGS) el?.addEventListener(type, on)
    return () => { for (const type of DRAGS) el?.removeEventListener(type, on) }
  }, [ref, onFiles])
}
const DRAGS = ['dragenter', 'dragover', 'dragleave', 'drop'] as const

export function App(): ReactElement {
  const { store, t, picture } = useEnv()
  const s = useGame()
  const [menu, setMenu] = useState(false)
  // Picture to pattern (spec §18.2): a picture dropped anywhere on the panel, or pasted on
  // the start or picture page, opens the page with it. Never when the host cannot load the chunk.
  const status = useLazy(picture)
  const pictures = status !== 'unsupported'
  const [dropped, setDropped] = useState<Blob | null>(null)
  const taken = useCallback(() => { setDropped(null) }, [])
  const take = useCallback((file: File | undefined): void => {
    if (!file) return
    setDropped(file)
    store.go('picture')
  }, [store])
  // The first picture of a drop; on the picture page any file (it explains why it is not one);
  // elsewhere a drop without a picture is ignored. Nothing when the chunk cannot load (§18.6).
  const onFiles = useCallback((files: FileList): void => {
    if (pictures && status !== 'failed') take([...files].find(f => f.type.startsWith('image/')) ?? (s.mode === 'picture' ? files[0] : undefined))
  }, [pictures, status, s.mode, take])
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  usePanelVisibility(root)
  useFileDrops(root, onFiles)
  useFocusGuard(root)
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

  const live = s.complete ? t('celebrate') : ''
  return (
    <div ref={root} className={cx('pd-root', s.prefs.showCodes && 'pd-codes')} onKeyDown={onKeyDown} data-mode={s.mode}
      // only paste events from inside the panel reach here: the chat input is never touched
      onPaste={(e) => {
        const f = e.clipboardData.files[0]
        if (pictures && f && (s.mode === 'home' || s.mode === 'picture')) { e.preventDefault(); e.stopPropagation(); take(f) }
      }}
      role="region" aria-label={t('appName')} tabIndex={-1}>
      <header className="pd-head">
        {s.mode !== 'home'
          ? <button type="button" className="pd-ib" aria-label={t('back')} title={t('back')} onClick={() => { store.go('home') }}><IconBack /></button>
          : null}
        {s.mode === 'picture' ? <h2>{t('homePicture')}</h2> : null}
        <span className="pd-spacer" />
        <button type="button" className="pd-ib" data-pd-menu-btn aria-label={t('settings')} title={t('settings')}
          aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu(m => !m) }}><IconMore /></button>
      </header>
      {menu ? <Menu onClose={() => { setMenu(false) }} /> : null}
      <div className="pd-scroll" ref={scroller}>
        {s.mode === 'home' ? <HomeView /> : s.mode === 'ai' ? <AiView /> : s.mode === 'picture' ? <PictureView file={dropped} onTaken={taken} /> : <PlayView />}
      </div>
      <Preview />
      <Toast />
      <div className="pd-sr" aria-live="polite" role="status">{live}</div>
    </div>
  )
}
