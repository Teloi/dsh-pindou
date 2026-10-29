// @vitest-environment jsdom
// The single focus-return mechanism (design I2): src/client/focus.ts.
import { act, useRef, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canFocus, fallbackTarget, focusLost, returnFocus, useFocusGuard, useFocusReturn } from '../src/client/focus.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => { root.unmount() }); host.remove() })
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => host.querySelector<T>(sel)!
const frame = (): Promise<void> => new Promise(r => { requestAnimationFrame(() => { r() }) })

describe('focus helpers', () => {
  it('canFocus rejects disabled, hidden, detached and <body>', () => {
    host.innerHTML = '<button id="a">a</button><button id="b" disabled>b</button><div hidden><button id="c">c</button></div>'
    expect(canFocus($('#a'))).toBe(true)
    expect(canFocus($('#b'))).toBe(false)
    expect(canFocus($('#c'))).toBe(false)
    expect(canFocus(document.createElement('button'))).toBe(false)
    expect(canFocus(document.body)).toBe(false)
  })
  it('fallback order: grid, then the first enabled control of the view, then the header, then the region', () => {
    host.innerHTML = '<div class="pd-root" tabindex="-1"><header class="pd-head"><button id="h">h</button></header><div class="pd-view"><button disabled>x</button><button id="v">v</button><div role="grid" tabindex="0" id="g"></div></div></div>'
    const r = $('.pd-root')
    expect(fallbackTarget(r)?.id).toBe('g')
    $('#g').remove()
    expect(fallbackTarget(r)?.id).toBe('v')
    $('.pd-view').remove()
    expect(fallbackTarget(r)?.id).toBe('h')
    $('.pd-head').remove()
    expect(fallbackTarget(r)).toBe(r)
  })
  it('fallback skips what Tab never reaches (aria-hidden, tabindex=-1) and takes a role=button (design I4)', () => {
    host.innerHTML = '<div class="pd-root" tabindex="-1"><header class="pd-head"><button id="h">h</button></header><div class="pd-view">'
      + '<span aria-hidden="true"><button id="ah">x</button></span><input id="file" type="file" tabindex="-1" aria-hidden="true"><input id="neg" tabindex="-1">'
      + '<div role="button" tabindex="0" id="zone">drop</div><button id="later">later</button></div></div>'
    const r = $('.pd-root')
    expect(fallbackTarget(r)?.id).toBe('zone')
    $('#zone').remove()
    expect(fallbackTarget(r)?.id).toBe('later')
    $('#later').remove()
    expect(fallbackTarget(r)?.id).toBe('h') // never the hidden file input
  })
  it('returnFocus never steals focus that is somewhere real, and prefers the given candidates', () => {
    host.innerHTML = '<div class="pd-root" tabindex="-1"><input id="outside"><div class="pd-view"><button id="v">v</button><button id="p">p</button></div></div>'
    $('#outside').focus()
    expect(returnFocus($('.pd-root'))).toBeNull()
    expect(document.activeElement?.id).toBe('outside')
    $('#outside').blur()
    expect(focusLost(document)).toBe(true)
    expect(returnFocus($('.pd-root'), [null, $('#p')])?.id).toBe('p')
  })
})

function Guarded({ show, disabled }: { readonly show: boolean; readonly disabled: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useFocusGuard(ref)
  return (
    <div ref={ref} className="pd-root" tabIndex={-1}>
      <div className="pd-view">
        <div role="grid" tabIndex={0} id="grid" />
        {show ? <button type="button" id="gone">gone</button> : null}
        <button type="button" id="dis" disabled={disabled}>dis</button>
        <button type="button" id="stay">stay</button>
      </div>
    </div>
  )
}

describe('useFocusGuard', () => {
  it('moves focus to the board when the focused control is removed (toast undo, Back, un-iron)', async () => {
    await act(async () => { root.render(<Guarded show disabled={false} />) })
    $('#gone').focus()
    await act(async () => { root.render(<Guarded show={false} disabled={false} />) })
    await act(frame)
    expect(document.activeElement?.id).toBe('grid')
  })
  it('moves focus to the board when the focused control becomes disabled (Clear on an empty board)', async () => {
    await act(async () => { root.render(<Guarded show={false} disabled={false} />) })
    $('#dis').focus()
    await act(async () => { root.render(<Guarded show={false} disabled />) })
    expect(document.activeElement?.id).toBe('grid')
  })
  it('leaves focus alone when the user simply clicked somewhere neutral', async () => {
    await act(async () => { root.render(<Guarded show={false} disabled={false} />) })
    $('#stay').focus()
    $('#stay').blur()
    await act(frame)
    await act(async () => { root.render(<Guarded show disabled={false} />) })
    expect(document.activeElement).toBe(document.body)
  })
})

function Surface({ withOpener }: { readonly withOpener: boolean }): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useFocusGuard(rootRef)
  return (
    <div ref={rootRef} className="pd-root" tabIndex={-1}>
      <div className="pd-view">
        <div role="grid" tabIndex={0} id="grid" />
        {withOpener ? <button type="button" id="opener" onClick={() => { setOpen(true) }}>open</button> : null}
        <button type="button" id="other" onClick={() => { setOpen(true) }}>other</button>
      </div>
      {open ? <Card cardRef={ref} onClose={() => { setOpen(false) }} /> : null}
    </div>
  )
}
function Card({ cardRef, onClose }: { readonly cardRef: { current: HTMLDivElement | null }; readonly onClose: () => void }): ReactElement {
  useFocusReturn(cardRef, true, '[data-primary]', el => el.closest('.pd-root')?.querySelector('#opener'))
  return <div ref={cardRef} role="dialog"><button type="button">secondary</button><button type="button" data-primary id="ok" onClick={onClose}>ok</button></div>
}

describe('useFocusReturn', () => {
  it('focuses the primary action on open and gives focus back to the opener on close', async () => {
    await act(async () => { root.render(<Surface withOpener />) })
    // a mouse click on Safari does not focus the button, so the opener comes from openerOf
    await act(async () => { $('#opener').click() })
    expect(document.activeElement?.id).toBe('ok')
    await act(async () => { $('#ok').click() })
    expect(document.activeElement?.id).toBe('opener')
  })
  it('falls back to the board when the opener is gone', async () => {
    await act(async () => { root.render(<Surface withOpener={false} />) })
    await act(async () => { $('#other').click() })
    expect(document.activeElement?.id).toBe('ok')
    await act(async () => { $('#ok').click() })
    expect(document.activeElement?.id).toBe('grid')
  })
})
