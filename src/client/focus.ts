/**
 * The one focus-return mechanism for the panel (design I2, spec §8.2).
 *
 * Two pieces, used everywhere instead of ad-hoc `.focus()` calls:
 *
 * - `useFocusReturn(ref, open)` for transient surfaces (cards, menu, preview,
 *   the not-configured card): when the surface appears it remembers the element
 *   that had focus and moves focus to its `[data-primary]` (or first) control;
 *   when it goes away it gives focus back to that opener, or to the panel's
 *   fallback when the opener is gone.
 * - `useFocusGuard(rootRef)` once on `.pd-root`: after every commit and on every
 *   `focusout`, if the element that last had focus inside the panel was removed,
 *   disabled or hidden (clear disables its own button, undo drops the toast,
 *   un-iron closes the card, Back leaves the view) and focus fell to <body>, it
 *   moves focus to the fallback. A user who simply clicked somewhere neutral
 *   keeps their focus where the browser put it.
 *
 * Fallback order: the board grid, the first enabled control of the current view,
 * the header controls, then the region itself.
 */
import { useEffect, useRef } from 'react'

type Ref<T> = { readonly current: T | null }

export function canFocus(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === el.ownerDocument.body) return false
  if ((el as HTMLButtonElement).disabled || el.closest('[inert]')) return false
  if (el.closest('[hidden]')) return false
  // Rendered? (A DOM without layout, such as the unit-test one, has no client rects at all.)
  return el.getClientRects().length > 0 || el.ownerDocument.documentElement.getClientRects().length === 0
}

/** Focus is nowhere useful: on <body>, on nothing, or on a node that left the page. */
export function focusLost(doc: Document): boolean {
  const a = doc.activeElement
  return a === null || a === doc.body || a === doc.documentElement || !a.isConnected
    || ((a as HTMLButtonElement).disabled === true)
}

export function fallbackTarget(root: Element): HTMLElement | null {
  const pick = (sel: string): HTMLElement | null => {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) if (canFocus(el)) return el
    return null
  }
  return pick('[role="grid"]')
    ?? pick('.pd-view button, .pd-view textarea, .pd-view input')
    ?? pick('.pd-head button')
    ?? (root instanceof HTMLElement && root.tabIndex >= -1 && root.hasAttribute('tabindex') ? root : null)
}

/**
 * If focus is lost, move it to the first focusable of `prefer`, else the
 * fallback inside `root`. Never steals focus that is somewhere real.
 */
export function returnFocus(root: Element | null | undefined, prefer: readonly (Element | null | undefined)[] = []): HTMLElement | null {
  if (!root?.isConnected) return null
  const doc = root.ownerDocument
  if (!focusLost(doc)) return null
  const target = prefer.find(canFocus) ?? fallbackTarget(root)
  target?.focus({ preventScroll: true })
  return target ?? null
}

/** Put focus on the board (or the view's fallback) after an action that changed it, e.g. the toast's 撤销. */
export function focusBoard(root: Element | null | undefined): HTMLElement | null {
  if (!root?.isConnected) return null
  const target = fallbackTarget(root)
  target?.focus({ preventScroll: true })
  return target ?? null
}

export function useFocusReturn(
  ref: Ref<HTMLElement>,
  open: string | boolean | null,
  initial = '[data-primary]',
  /** The control that opened the surface when it is not the focused one (Safari doesn't focus clicked buttons). */
  openerOf?: (el: HTMLElement) => Element | null | undefined,
): void {
  useEffect(() => {
    const el = ref.current
    if (open === null || open === false || !el) return
    const doc = el.ownerDocument
    const opener = openerOf?.(el) ?? doc.activeElement
    const root = el.closest('.pd-root') ?? el.closest('.pd-portal')
    const first = el.querySelector<HTMLElement>(initial)
      ?? [...el.querySelectorAll<HTMLElement>('button, [href], input, textarea, [tabindex]')].find(canFocus)
    if (canFocus(first)) first.focus({ preventScroll: true })
    return () => {
      // The surface is unmounting (or about to): if focus was inside it or got dropped, hand it back.
      const a = doc.activeElement
      const inside = a !== null && (el.contains(a) || !a.isConnected)
      if (!inside && !focusLost(doc)) return
      const target = [opener].find(canFocus) ?? (root ? fallbackTarget(root) : null)
      target?.focus({ preventScroll: true })
    }
  }, [ref, open, initial, openerOf])
}

export function useFocusGuard(rootRef: Ref<HTMLElement>): void {
  const last = useRef<Element | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const win = root.ownerDocument.defaultView
    const onIn = (e: FocusEvent): void => { last.current = e.target as Element }
    const check = (): void => {
      const prev = last.current
      if (prev === null || canFocus(prev) || !focusLost(root.ownerDocument)) return
      last.current = null
      returnFocus(root)
    }
    let raf = 0
    const onOut = (e: FocusEvent): void => {
      if (e.relatedTarget !== null && root.contains(e.relatedTarget as Node)) return
      if (e.relatedTarget !== null) { last.current = null; return } // focus moved out of the panel on purpose
      win?.cancelAnimationFrame(raf)
      raf = win?.requestAnimationFrame(check) ?? 0
    }
    root.addEventListener('focusin', onIn)
    root.addEventListener('focusout', onOut)
    return () => {
      win?.cancelAnimationFrame(raf)
      root.removeEventListener('focusin', onIn)
      root.removeEventListener('focusout', onOut)
    }
  }, [rootRef])
  // After every render of the owner: a control that had focus may have just been removed or disabled.
  useEffect(() => {
    const root = rootRef.current
    const prev = last.current
    if (!root || prev === null || canFocus(prev) || !focusLost(root.ownerDocument)) return
    last.current = null
    returnFocus(root)
  })
}
