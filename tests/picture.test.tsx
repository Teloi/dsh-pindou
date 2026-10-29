// @vitest-environment jsdom
// Picture to pattern (spec §18.2) and lazy modules (spec §18.6), in the real
// panel: the entry card's degraded states, the in-page retry, the skeleton,
// drop/paste, the audited read order (type → size → header → downscaled decode),
// and privacy (only the quantised pattern is stored).
import { act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { File as NodeFile } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, type ClientContext } from '../src/client/index.tsx'
import { GameStore } from '../src/client/game-store.ts'
import { hostLoadsChunks, lazy, SKELETON_MS, type Lazy } from '../src/client/lazy.ts'
import * as lazyModule from '../src/client/lazy.ts'
import { App } from '../src/client/ui/App.tsx'
import { EnvContext, type Env } from '../src/client/ui/context.tsx'
import { makeTranslate, SafeStore, STORAGE_KEY, type StorageLike } from '../src/core/index.ts'
import { MAX_BYTES } from '../src/core/image-sniff.ts'
import * as chunk from '../src/client/picture.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The probe reads the module loader's factory `require`; vitest gives modules a
// Node require (no .async), so the supported host is simulated by this switch.
vi.mock('../src/client/lazy.ts', async (orig) => {
  const real = await orig<typeof import('../src/client/lazy.ts')>()
  return { ...real, hostLoadsChunks: vi.fn(real.hostLoadsChunks) }
})

type Chunk = typeof chunk
const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) })
const flush = async (ms = 0): Promise<void> => { await act(async () => { await sleep(ms) }) }

// ── fixtures ──────────────────────────────────────────────────────────
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const pngHead = (w: number, h: number): Uint8Array =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])
// Node's File (jsdom's has no arrayBuffer()); the page only uses Blob APIs browsers have
const file = (bytes: Uint8Array | string, name: string, type: string): File => new NodeFile([bytes], name, { type }) as unknown as File
const svgFile = (): File => file('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'a.svg', 'image/svg+xml')

/** The pixels the fake decoder "decodes": a red square on white, or flat white. */
let decoded: { w: number, h: number, flat: boolean } = { w: 512, h: 384, flat: false }
function pixels(w: number, h: number, flat: boolean): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sq = !flat && x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7
      data.set(sq ? [215, 51, 59, 255] : [246, 244, 238, 255], (y * w + x) * 4)
    }
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData
}
/** Anything: callable, every property is itself (gradients, paths …). */
const sink: unknown = new Proxy(() => undefined, { get: () => sink, apply: () => sink, set: () => true })
/** A 2D context stand-in: every method a no-op, getImageData returns the fixture. */
function fakeContext(): CanvasRenderingContext2D {
  const props: Record<PropertyKey, unknown> = {}
  return new Proxy({}, {
    get: (_, k) => (k === 'getImageData' ? () => pixels(decoded.w, decoded.h, decoded.flat) : k in props ? props[k] : sink),
    set: (_, k, v) => { props[k] = v; return true },
  }) as CanvasRenderingContext2D
}

let bitmap: ReturnType<typeof vi.fn>
let close: ReturnType<typeof vi.fn>
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeContext as never)
  close = vi.fn()
  bitmap = vi.fn(async () => ({ width: decoded.w, height: decoded.h, close }))
  vi.stubGlobal('createImageBitmap', bitmap)
  decoded = { w: 512, h: 384, flat: false }
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => { root.unmount() })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  host.remove()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

function mem(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

/** The real panel (App) with a lazy picture module we control. */
async function panel(picture: Lazy<Chunk> | undefined, lang: 'zh' | 'en' = 'zh') {
  const backend = mem()
  const store = new GameStore({ store: new SafeStore(backend), saveDelayMs: 0 })
  const env: Env = { store, lang, t: makeTranslate(lang), reducedMotion: () => false, dark: () => false, ...(picture ? { picture } : {}) }
  await act(async () => { root.render(<EnvContext.Provider value={env}><App /></EnvContext.Provider>) })
  const card = (): HTMLButtonElement => host.querySelectorAll<HTMLButtonElement>('.pd-start .pd-big')[2]!
  const rootEl = (): HTMLElement => host.firstElementChild as HTMLElement
  return { store, backend, card, rootEl }
}

/** A loader we resolve or reject by hand, counting calls. */
function gate() {
  const calls: Array<{ resolve: (m: Chunk) => void, reject: (e: Error) => void }> = []
  const mod = lazy<Chunk>(() => new Promise<Chunk>((resolve, reject) => { calls.push({ resolve, reject }) }), true)
  return { mod, calls }
}

function dropEvent(type: 'drop' | 'dragover' | 'dragenter', files: File[]): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'] } })
  return e
}
function pasteEvent(files: File[]): Event {
  const e = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', { value: { files, types: files.length ? ['Files'] : ['text/plain'] } })
  return e
}
async function choose(f: File): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('.pd-pic-file')!
  Object.defineProperty(input, 'files', { value: [f], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  await flush(10)
}

// ── lazy(): the state machine ───────────────────────────────────────
describe('lazy modules: state machine (spec §18.6)', () => {
  it('unsupported never calls the loader', async () => {
    const loader = vi.fn(async () => 1)
    const m = lazy(loader, false)
    expect(m.status()).toBe('unsupported')
    expect(await m.load()).toBeUndefined()
    expect(loader).not.toHaveBeenCalled()
    expect(m.status()).toBe('unsupported')
  })

  it('idle → loading → ready; concurrent loads share one fetch; ready does not refetch', async () => {
    const loader = vi.fn(async () => 'mod')
    const m = lazy(loader, true)
    const seen: string[] = []
    m.subscribe(() => { seen.push(m.status()) })
    expect(m.status()).toBe('idle')
    const [a, b] = await Promise.all([m.load(), m.load()])
    expect([a, b]).toEqual(['mod', 'mod'])
    expect(await m.load()).toBe('mod')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['loading', 'ready'])
  })

  it('failed → retry fetches again (the host forgot the failed chunk)', async () => {
    let n = 0
    const loader = vi.fn(async () => { if (++n === 1) throw new Error('offline'); return 'mod' })
    const m = lazy(loader, true)
    expect(await m.load()).toBeUndefined()
    expect(m.status()).toBe('failed')
    expect(await m.load()).toBe('mod')
    expect(m.status()).toBe('ready')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('hostLoadsChunks: a plain require (no .async) is not enough', () => {
    // (the true case runs in the real host: e2e/run.mjs)
    expect(hostLoadsChunks()).toBe(false)
  })
})

// ── degradation, end to end ────────────────────────────────────────
function fakeCtx(): { ctx: ClientContext, Body: () => ComponentType, setLang: (l: string) => void } {
  const slots: Array<{ component: ComponentType<never> }> = []
  let active = 'zh-CN'
  const listeners = new Set<() => void>()
  const ctx: ClientContext = {
    effect(fn) { fn() },
    slots: { inject: (_n, f) => f(), register: (_o, component) => { slots.push({ component }); return () => {} } },
    locale: { register: () => () => {}, getSnapshot: () => ({ active }), subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } } },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { openTab: vi.fn() },
    shortcuts: { register: () => () => {} },
  }
  return { ctx, Body: () => slots[0]!.component as ComponentType, setLang: (l) => { active = l; for (const fn of listeners) fn() } }
}

describe('degradation path, from apply() to a game (host without require.async)', () => {
  it('the card is shown but off; nothing loads; drop and paste are ignored; the rest still plays', async () => {
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.Body()
    await act(async () => { root.render(<Body />) })
    const card = host.querySelectorAll<HTMLButtonElement>('.pd-start .pd-big')[2]!
    expect(card.dataset['lazy']).toBe('unsupported')
    expect(card.getAttribute('aria-disabled')).toBe('true')
    expect(card.classList.contains('pd-off')).toBe(true)
    // still focusable: a real button, not disabled, not taken out of the tab order
    expect(card.disabled).toBe(false)
    expect(card.tabIndex).toBe(0)
    card.focus()
    expect(document.activeElement).toBe(card)
    // the reason is part of its accessible name
    expect(card.textContent).toContain('图片转图纸')
    expect(card.textContent).toContain('需要新版 DSH')
    // clicking (Enter/Space on a button are clicks) does nothing
    await act(async () => { card.click() })
    expect(host.querySelector('.pd-v-home')).not.toBeNull()
    expect(host.querySelector('.pd-lazy, .pd-pic')).toBeNull()
    // a dropped or pasted picture is not taken: the host keeps its default
    const panelRoot = host.querySelector<HTMLElement>('.pd-root')!
    const png = file(pngHead(10, 10), 'a.png', 'image/png')
    const drop = dropEvent('drop', [png])
    await act(async () => { panelRoot.dispatchEvent(drop) })
    const paste = pasteEvent([png])
    await act(async () => { panelRoot.dispatchEvent(paste) })
    expect(drop.defaultPrevented).toBe(false) // DSH's own drop handling (attach to chat) still applies
    expect(paste.defaultPrevented).toBe(false)
    expect(host.querySelector('.pd-v-home')).not.toBeNull()
    expect(bitmap).not.toHaveBeenCalled()
    // English, too
    await act(async () => { f.setLang('en-US') })
    expect(card.textContent).toContain('Requires a newer DSH')
    // core play still works
    await act(async () => { host.querySelector<HTMLButtonElement>('.pd-start .pd-big')!.click() })
    expect(host.querySelector('.pd-v-home')).toBeNull()
    expect(host.querySelector('.pd-boardbox')).not.toBeNull()
  })

  it('a host with require.async gets a live card (the real chunk loads in the panel)', async () => {
    vi.mocked(lazyModule.hostLoadsChunks).mockReturnValue(true)
    const f = fakeCtx()
    apply(f.ctx)
    const Body = f.Body()
    await act(async () => { root.render(<Body />) })
    const card = host.querySelectorAll<HTMLButtonElement>('.pd-start .pd-big')[2]!
    expect(card.dataset['lazy']).toBe('idle')
    expect(card.hasAttribute('aria-disabled')).toBe(false)
    expect(card.textContent).toContain('照片变成图纸')
    await act(async () => { card.click() })
    await vi.waitFor(() => { expect(host.querySelector('.pd-pic-drop')).not.toBeNull() })
    expect(host.querySelector('.pd-head h2')?.textContent).toBe('图片转图纸')
  })
})

describe('load failure: in-page retry, no toast (spec §18.6)', () => {
  it('skeleton after 150 ms (not before), 「加载失败，点此重试」, Enter/Space retry by being a button, then the page', async () => {
    const { mod, calls } = gate()
    const { card } = await panel(mod)
    await act(async () => { card().click() })
    expect(calls).toHaveLength(1)
    const lazyEl = (): HTMLElement => host.querySelector<HTMLElement>('.pd-lazy')!
    expect(lazyEl().dataset['lazy']).toBe('loading')
    // no spinner, and no block before 150 ms
    expect(host.querySelector('.pd-skel')).toBeNull()
    await flush(SKELETON_MS - 60)
    expect(host.querySelector('.pd-skel')).toBeNull()
    await flush(90)
    expect(host.querySelector('.pd-skel')).not.toBeNull()
    await act(async () => { calls[0]!.reject(new Error('net::ERR_FAILED')) })
    await flush()
    expect(lazyEl().dataset['lazy']).toBe('failed')
    expect(host.querySelector('.pd-skel')).toBeNull()
    const retry = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('.pd-lazy button')!
    expect(retry().textContent).toBe('加载失败，点此重试')
    expect(retry().type).toBe('button') // a real button: Enter and Space press it
    expect(host.querySelector('.pd-toast')).toBeNull()
    // back home, the card says it too
    await act(async () => { mod.load() })
    await act(async () => { calls[1]!.reject(new Error('again')) })
    await flush()
    expect(host.querySelector('.pd-toast')).toBeNull()
    await act(async () => { retry().click() })
    expect(calls).toHaveLength(3)
    expect(lazyEl().dataset['lazy']).toBe('loading')
    // a quick retry: no skeleton flash
    await act(async () => { calls[2]!.resolve(chunk) })
    await flush()
    expect(host.querySelector('.pd-pic-drop')).not.toBeNull()
  })

  it('the home card says 加载失败，点此重试 after a failure and opening it retries', async () => {
    const { mod, calls } = gate()
    const { card, store } = await panel(mod, 'en')
    await act(async () => { card().click() })
    await act(async () => { calls[0]!.reject(new Error('x')) })
    await act(async () => { store.go('home') })
    expect(card().dataset['lazy']).toBe('failed')
    expect(card().textContent).toContain('Couldn’t load · Retry')
    expect(card().hasAttribute('aria-disabled')).toBe(false)
    await act(async () => { card().click() })
    expect(calls).toHaveLength(2)
    await act(async () => { calls[1]!.resolve(chunk) })
    await flush()
    expect(host.querySelector('.pd-pic-drop')?.getAttribute('aria-label')).toBe('Drop, paste or choose a picture')
  })
})

// ── the picture page ─────────────────────────────────────────────────
const ready = (): Lazy<Chunk> => lazy<Chunk>(async () => chunk, true)

describe('picture page (spec §18.2)', () => {
  async function open(lang: 'zh' | 'en' = 'zh') {
    const p = await panel(ready(), lang)
    await act(async () => { p.card().click() })
    await flush()
    return p
  }

  it('empty state: the drop zone, its text, the picker (image/*), the privacy note; Enter opens the picker', async () => {
    await open()
    const zone = host.querySelector<HTMLElement>('.pd-pic-drop')!
    expect(zone.getAttribute('role')).toBe('button')
    expect(zone.tabIndex).toBe(0)
    expect(zone.textContent).toContain('拖入、粘贴或选择一张图片')
    expect(zone.textContent).toContain('选择图片')
    expect(host.querySelector<HTMLInputElement>('input[type=file]')!.accept).toBe('image/*')
    expect(host.querySelector('.pd-pic-note')!.textContent).toBe('图片只在本机处理，不会上传')
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    await act(async () => { zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    await act(async () => { zone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    expect(click).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['text', () => file('hello', 'a.txt', 'text/plain'), '这不是图片'],
    ['SVG (never decoded)', svgFile, '这张图打不开'],
    ['over 20 MB', () => file(new Uint8Array(MAX_BYTES + 1).fill(0, 0).map((_, i) => (i < 33 ? pngHead(10, 10)[i]! : 0)), 'big.png', 'image/png'), '图片太大了，换一张小点的'],
    ['a side over 8000 px', () => file(pngHead(8001, 100), 'wide.png', 'image/png'), '图片太大了，换一张小点的'],
  ])('%s: refused before any decode, red border + shake, message in an alert', async (_, make, message) => {
    await open()
    await choose(make())
    expect(bitmap).not.toHaveBeenCalled()
    const zone = host.querySelector<HTMLElement>('.pd-pic-drop')!
    expect(zone.dataset['error']).toBeTruthy()
    expect(zone.classList.contains('pd-shake')).toBe(true)
    expect(host.querySelector('[role=alert]')!.textContent).toBe(message)
    await flush(200)
    expect(zone.classList.contains('pd-shake')).toBe(false)
  })

  it('a decoder failure: 这张图打不开', async () => {
    await open()
    bitmap.mockRejectedValueOnce(new Error('InvalidStateError'))
    await choose(file(pngHead(10, 10), 'broken.png', 'image/png'))
    expect(host.querySelector('[role=alert]')!.textContent).toBe('这张图打不开')
  })

  it('a big picture is decoded downscaled (long side 512), the bitmap released, then previewed and started', async () => {
    const { store, backend } = await open()
    await choose(file(pngHead(4000, 3000), 'photo.png', 'image/png'))
    expect(bitmap).toHaveBeenCalledTimes(1)
    expect(bitmap.mock.calls[0]![1]).toMatchObject({ resizeWidth: 512 })
    expect(close).toHaveBeenCalledTimes(1)
    // adjust state
    expect(host.querySelector('.pd-pic-drop')).toBeNull()
    const prev = host.querySelector<HTMLCanvasElement>('.pd-pic-prev canvas')!
    expect(prev.getAttribute('role')).toBe('img')
    expect(prev.getAttribute('aria-busy')).toBe('true')
    // the preview waits for 120 ms of quiet, then a frame
    await flush(chunk.PREVIEW_DEBOUNCE_MS + 40)
    expect(prev.getAttribute('aria-busy')).toBe('false')
    expect(prev.getAttribute('aria-label')).toMatch(/^16×16 预览，共 \d+ 颗豆$/)
    const beads = Number(/共 (\d+) 颗豆/.exec(prev.getAttribute('aria-label')!)![1])
    expect(beads).toBeGreaterThan(8)
    expect(beads).toBeLessThan(256) // 去掉背景 is on by default
    const pressed = [...host.querySelectorAll('[aria-pressed=true]')].map(b => b.textContent)
    expect(pressed).toEqual(['16×16', '全部 16 色'])
    const switches = [...host.querySelectorAll('[role=switch]')].map(b => [b.textContent, b.getAttribute('aria-checked')])
    expect(switches).toEqual([['抖动', 'false'], ['去掉背景', 'true']])
    // size 24
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(b => b.textContent === '24×24')!.click() })
    await flush(chunk.PREVIEW_DEBOUNCE_MS + 40)
    expect(prev.getAttribute('aria-label')).toMatch(/^24×24 预览/)
    // start
    const start = [...host.querySelectorAll<HTMLButtonElement>('.pd-pic-acts button')].find(b => b.textContent === '开始拼')!
    expect(start.disabled).toBe(false)
    expect(start.classList.contains('pd-primary')).toBe(true)
    await act(async () => { start.click() })
    const s = store.getSnapshot()
    expect(s.mode).toBe('play')
    expect(s.target).toMatch(/^board:p-[0-9a-z]+$/)
    expect(s.history.present.size).toBe(24)
    expect(host.querySelector('.pd-status')!.textContent).toContain('我的图纸')
    expect(host.querySelector('.pd-status')!.textContent).not.toMatch(/token/i)
    // privacy: only the pattern is saved — no picture data, nothing big
    store.flush()
    const saved = backend.data.get(STORAGE_KEY) ?? ''
    expect(saved).toContain('board:p-')
    expect(saved).not.toMatch(/data:image|base64|blob:/)
    expect([...backend.data.values()].join('').length).toBeLessThan(8 * 1024)
    expect(localStorage.length).toBe(0)
  })

  it('too simple: start disabled with the hint until 去掉背景 is turned off', async () => {
    decoded = { w: 300, h: 300, flat: true }
    await open()
    await choose(file(pngHead(300, 300), 'flat.png', 'image/png'))
    await flush(chunk.PREVIEW_DEBOUNCE_MS + 40)
    const start = (): HTMLButtonElement => [...host.querySelectorAll<HTMLButtonElement>('.pd-pic-acts button')].find(b => b.textContent === '开始拼')!
    expect(start().disabled).toBe(true)
    expect(host.querySelector('#pd-pic-simple')!.textContent).toBe('图案太简单了，试试关掉去背景')
    expect(start().getAttribute('aria-describedby')).toBe('pd-pic-simple')
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role=switch]')][1]!.click() })
    await flush(chunk.PREVIEW_DEBOUNCE_MS + 40)
    expect(start().disabled).toBe(false)
    expect(host.querySelector('#pd-pic-simple')).toBeNull()
  })

  it('crop keys: +/- zoom, arrows pan (clamped); 换一张 goes back to the empty state', async () => {
    await open()
    await choose(file(pngHead(800, 600), 'p.png', 'image/png'))
    const crop = host.querySelector<HTMLElement>('.pd-pic-crop')!
    expect(crop.tabIndex).toBe(0)
    const zoom = host.querySelector<HTMLInputElement>('input[type=range]')!
    expect(zoom.value).toBe('1')
    const key = async (k: string): Promise<void> => { await act(async () => { crop.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) }) }
    await key('+')
    expect(Number(zoom.value)).toBeCloseTo(1.25)
    await key('-')
    await key('-')
    expect(Number(zoom.value)).toBe(1) // clamped at 1
    await key('ArrowLeft') // at zoom 1 there is room to pan sideways on a 4:3 picture
    await key('+')
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('.pd-pic-acts button')].find(b => b.textContent === '换一张')!.click() })
    expect(host.querySelector('.pd-pic-drop')).not.toBeNull()
    expect(host.querySelector('[role=alert]')!.textContent).toBe('')
  })

  it('clampView / cropOf keep the crop square inside the picture', () => {
    expect(chunk.clampView(400, 300, { cx: -50, cy: 999, zoom: 9 })).toEqual({ zoom: 4, cx: 37.5, cy: 262.5 })
    expect(chunk.cropOf(400, 300, { cx: 200, cy: 150, zoom: 1 })).toEqual({ x: 50, y: 0, side: 300 })
  })
})

describe('drop and paste (spec §18.2)', () => {
  it('a picture dropped anywhere on the panel opens the page with it; the host never sees it (no chat attachment)', async () => {
    const { rootEl } = await panel(ready())
    // DSH's attachment view listens on document for drops (ui-attachment drop-events.ts)
    const hostSaw: string[] = []
    const spy = (e: Event): void => { hostSaw.push(e.type) }
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) document.addEventListener(type, spy)
    await act(async () => { rootEl().dispatchEvent(dropEvent('dragenter', [])) })
    const over = dropEvent('dragover', [])
    await act(async () => { rootEl().dispatchEvent(over) })
    expect(over.defaultPrevented).toBe(true)
    const drop = dropEvent('drop', [file(pngHead(600, 600), 'd.png', 'image/png')])
    await act(async () => { rootEl().dispatchEvent(drop) })
    expect(drop.defaultPrevented).toBe(true)
    await flush(20)
    expect(bitmap).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.pd-pic-crop')).not.toBeNull()
    expect(hostSaw).toEqual([])
    // text drags are not ours
    const textDrop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(textDrop, 'dataTransfer', { value: { files: [], types: ['text/plain'] } })
    await act(async () => { rootEl().dispatchEvent(textDrop) })
    expect(hostSaw).toEqual(['drop'])
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) document.removeEventListener(type, spy)
  })

  it('paste on the start page opens it; paste while playing and text pastes are left alone', async () => {
    const { rootEl, store } = await panel(ready())
    const text = pasteEvent([])
    await act(async () => { rootEl().dispatchEvent(text) })
    expect(text.defaultPrevented).toBe(false)
    await act(async () => { store.startFree() })
    const inPlay = pasteEvent([file(pngHead(10, 10), 'x.png', 'image/png')])
    await act(async () => { rootEl().dispatchEvent(inPlay) })
    expect(inPlay.defaultPrevented).toBe(false)
    expect(store.getSnapshot().mode).toBe('play')
    await act(async () => { store.go('home') })
    const p = pasteEvent([file(pngHead(600, 400), 'x.png', 'image/png')])
    await act(async () => { rootEl().dispatchEvent(p) })
    expect(p.defaultPrevented).toBe(true)
    await flush(20)
    expect(store.getSnapshot().mode).toBe('picture')
    expect(host.querySelector('.pd-pic-crop')).not.toBeNull()
  })

  it('a dropped non-image lands on the page with its error', async () => {
    const { rootEl } = await panel(ready())
    await act(async () => { rootEl().dispatchEvent(dropEvent('drop', [svgFile()])) })
    await flush(20)
    expect(host.querySelector('[role=alert]')!.textContent).toBe('这张图打不开')
    expect(bitmap).not.toHaveBeenCalled()
  })

  it('the picture page is not persisted: a reload lands on the start page', async () => {
    const { store, backend } = await panel(ready())
    await act(async () => { store.go('picture') })
    store.flush()
    expect(JSON.parse(backend.data.get(STORAGE_KEY)!)).toMatchObject({ mode: 'home' })
  })
})
