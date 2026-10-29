/**
 * Picture to pattern (spec §18.2, T1). This module is the lazy chunk
 * lib/client.picture.js, loaded the first time the page opens (spec §18.6).
 *
 * The DSH loader cannot share a module between the entry and a chunk
 * (scripts/async-chunks.ts), so this file imports only platform modules and
 * chunk-only code; the palette, the bead renderer, the icon and the language
 * come in as props, and it carries its own strings and stylesheet.
 *
 * Privacy (spec §18.2): the picture is read from the File in memory only. The
 * first bytes are sniffed before anything decodes (SVG never reaches a decoder),
 * big files are refused before decoding, the decode is downscaled, and the File
 * is dropped once decoded. Nothing is uploaded, written to disk, or stored; only
 * the quantised pattern leaves this module (through `onStart`).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react'
import { almostTransparent, decodeSize, MAX_SIDE, precheck, SNIFF_BYTES, type SniffError } from '../core/image-sniff.ts'
import { beadCount, COLOR_LIMITS, DEFAULT_OPTIONS, MIN_BEADS, PICTURE_SIZES, quantize, type ColorLimit, type Crop, type PictureSize, type Pixels, type QuantizeOptions } from '../core/quantize.ts'
import { PICTURE_CSS } from './picture-styles.ts'

const STRINGS = {
  zh: {
    drop: '拖入、粘贴或选择一张图片', choose: '选择图片', note: '图片只在本机处理，不会上传',
    notImage: '这个文件不是图片', tooBig: '图片太大了，换一张小点的', cannotOpen: '这张图打不开',
    svg: '暂不支持 SVG，换成 PNG 或 JPG 试试', transparent: '这张图几乎是透明的，换一张试试',
    tooSimple: '图案太简单了，试试关掉去背景', start: '开始拼', another: '换一张',
    crop: '裁剪框：拖动或用方向键移动，+ / - 缩放', zoom: '缩放', size: '尺寸', colors: '颜色数',
    all: '全部 16 色', some: '{n} 色', dither: '抖动', removeBg: '去掉背景', preview: '{n}×{n} 预览，共 {beads} 颗豆', loaded: '已载入图片',
  },
  en: {
    drop: 'Drop, paste or choose a picture', choose: 'Choose a picture', note: 'Your picture never leaves this device',
    notImage: 'That file isn’t an image.', tooBig: 'That picture is too big — try a smaller one', cannotOpen: 'Couldn’t open this picture',
    svg: 'SVG isn\'t supported yet. Try a PNG or JPG.', transparent: 'This image is almost fully transparent. Try another one.',
    tooSimple: 'Too simple — try turning off Remove background', start: 'Start beading', another: 'Choose another',
    crop: 'Crop: drag or use the arrow keys to move, + / - to zoom', zoom: 'Zoom', size: 'Size', colors: 'Colours',
    all: 'All 16', some: '{n} colours', dither: 'Dithering', removeBg: 'Remove background', preview: '{n}×{n} preview, {beads} beads', loaded: 'Image loaded',
  },
} as const
type Key = keyof typeof STRINGS.zh
export const PICTURE_STRINGS = STRINGS

const fill = (s: string, p: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? ''))

/** Decoded pictures are at most this many pixels on the long side (quantising 512² for 24 cells is a few ms). */
export const DECODE_MAX = 512
/** Spec §18.2: preview after 120 ms of quiet, drawn in a frame. */
export const PREVIEW_DEBOUNCE_MS = 120
const ZOOM_MAX = 4
/** The alert is emptied, then written after this long, so a repeated error is read again. */
export const ANNOUNCE_MS = 60
const STYLE_ID = 'dsh-pindou-picture-styles'

export interface Picture {
  readonly pixels: Pixels
  /** The decoded (downscaled) picture, for the crop view. */
  readonly canvas: HTMLCanvasElement
}

/**
 * File → pixels, in the audited order: sniff the first bytes (type), the byte
 * size, the header's width/height, and only then a downscaled decode.
 */
export async function readPicture(file: Blob, doc: Document = document, max = DECODE_MAX): Promise<Picture | { readonly error: SniffError }> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
  const pre = precheck({ type: file.type, size: file.size, name: (file as Partial<File>).name ?? '' }, head)
  if ('error' in pre) return pre
  const { width: w, height: h } = pre.ok
  let bmp: ImageBitmap
  try {
    const big = w !== null && h !== null && Math.max(w, h) > max
    bmp = await createImageBitmap(file, big ? (w >= h ? { resizeWidth: max, resizeQuality: 'high' } : { resizeHeight: max, resizeQuality: 'high' }) : {})
  } catch {
    return { error: 'cannotOpen' }
  }
  try {
    // a header without a size (rare JPEGs): judge the decoded size instead
    if (Math.max(bmp.width, bmp.height) > MAX_SIDE) return { error: 'tooBig' }
    const size = decodeSize(bmp.width, bmp.height, max)
    const canvas = doc.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx || size.width < 1 || size.height < 1) return { error: 'cannotOpen' }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, size.width, size.height)
    const pixels = ctx.getImageData(0, 0, size.width, size.height)
    return almostTransparent(pixels.data) ? { error: 'transparent' } : { pixels, canvas }
  } catch {
    return { error: 'cannotOpen' }
  } finally {
    bmp.close()
  }
}

/** The crop: centre and zoom over the decoded picture (zoom 1 = the largest centred square). */
export interface View { readonly cx: number, readonly cy: number, readonly zoom: number }

const ZONE_DRAGS = ['dragenter', 'dragleave', 'drop'] as const

export function clampView(w: number, h: number, v: View): View {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom))
  const half = Math.min(w, h) / zoom / 2
  return { zoom, cx: Math.min(w - half, Math.max(half, v.cx)), cy: Math.min(h - half, Math.max(half, v.cy)) }
}

export function cropOf(w: number, h: number, v: View): Crop {
  const side = Math.min(w, h) / v.zoom
  return { x: v.cx - side / 2, y: v.cy - side / 2, side }
}

function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const el = doc.createElement('style')
  el.id = STYLE_ID
  el.textContent = PICTURE_CSS
  doc.head.append(el)
}

const SHAKE_MS = 160

/** What the entry lends the chunk (it may not import the entry's modules). */
export interface PictureKit {
  /** The 16 bead colours, #RRGGBB, in palette order. */
  readonly palette: readonly string[]
  /** The entry's bead renderer (render.ts drawThumb: the template thumbnails' look). */
  readonly draw: (canvas: HTMLCanvasElement, board: PictureBoard, cssPx: number) => void
  readonly icon: ReactNode
}

/** A board as the entry's core defines it: indices or -1 (empty), row by row. */
export interface PictureBoard { readonly size: PictureSize, readonly cells: readonly number[] }

export interface PictureProps {
  readonly kit: PictureKit
  readonly lang: 'zh' | 'en'
  /** A picture dropped or pasted on the panel; handed over once, then `onTaken`. */
  readonly file: Blob | null
  readonly onTaken: () => void
  readonly onStart: (board: PictureBoard) => void
}

export function PicturePage(props: PictureProps): ReactElement {
  const { kit: { palette, draw, icon }, lang, file, onTaken, onStart } = props
  const t = (k: Key, p?: Record<string, string | number>): string => (p ? fill(STRINGS[lang][k], p) : STRINGS[lang][k])
  const [pic, setPic] = useState<Picture | null>(null)
  const [view, setView] = useState<View>({ cx: 0, cy: 0, zoom: 1 })
  const [opts, setOpts] = useState<QuantizeOptions>(DEFAULT_OPTIONS)
  // the preview's board: its size and cells change together, so a new size never redraws the old
  // cells (design I3); until the new ones are ready the old preview stays, label and all
  const [shown, setShown] = useState<PictureBoard | null>(null)
  const cells = shown?.cells ?? null
  const [error, setError] = useState<SniffError | null>(null)
  // What the alert says. Cleared first and written a moment later, so the same error twice in
  // a row is announced again (spec v2.0 23:40; design S5). `tries` makes each error a new one.
  const [tries, setTries] = useState(0)
  const [said, setSaid] = useState<{ readonly n: number; readonly error: SniffError } | null>(null)
  useEffect(() => {
    if (!error) return
    const n = tries
    const id = setTimeout(() => { setSaid({ n, error }) }, ANNOUNCE_MS)
    return () => { clearTimeout(id) }
  }, [error, tries])
  const saying = error && said?.n === tries ? said.error : null
  // Each picture that loads (dropped, pasted or chosen, anywhere): `loads` counts them, and the
  // status line says 「已载入图片」 a moment after it was emptied, so a second one is read again.
  const [loads, setLoads] = useState(0)
  const [told, setTold] = useState(0)
  useEffect(() => {
    if (!loads) return
    const id = setTimeout(setTold, ANNOUNCE_MS, loads)
    return () => { clearTimeout(id) }
  }, [loads])
  const [shake, setShake] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  // The drop highlight. Native listeners: the panel root stops file drags from propagating (so
  // DSH never attaches them to the chat), which also keeps them from React's delegated handlers.
  // A depth count keeps it lit while the pointer crosses the zone's own text and button.
  useEffect(() => {
    const el = zone.current
    let depth = 0
    const on = (e: DragEvent): void => {
      depth = e.type === 'dragenter' ? depth + 1 : e.type === 'dragleave' ? depth - 1 : 0
      setOver(depth > 0)
    }
    for (const type of ZONE_DRAGS) el?.addEventListener(type, on)
    return () => { for (const type of ZONE_DRAGS) el?.removeEventListener(type, on) }
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the zone is rendered only while there is no picture
  }, [pic])
  const crop = useRef<HTMLDivElement>(null)
  const cropCanvas = useRef<HTMLCanvasElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, { x: number, y: number }>())
  const seq = useRef(0)

  useLayoutEffect(() => { injectStyles(document) }, [])

  const take = useCallback(async (f: Blob): Promise<void> => {
    const mine = ++seq.current
    const r = await readPicture(f)
    if (mine !== seq.current) return
    // a refused file never takes the place of a loaded picture: that one stays, the alert says why (spec 00:58)
    if ('error' in r) {
      setError(r.error); setTries(n => n + 1); setShake(true)
      return
    }
    const { width: w, height: h } = r.pixels
    setError(null)
    setPic(r)
    setShown(null)
    setView({ cx: w / 2, cy: h / 2, zoom: 1 })
    setLoads(n => n + 1)
  }, [])

  // Opened from the card (keyboard or pointer): focus the drop zone, the page's one action
  // (design I4). Only when focus is already in the panel; never pulled from the chat.
  const empty = useRef(file === null)
  useEffect(() => {
    const z = zone.current
    if (empty.current && z?.closest('.pd-root')?.contains(z.ownerDocument.activeElement)) z.focus({ preventScroll: true })
  }, [])

  // A picture loaded: focus the crop frame, the page's next step (design b2 D-I1), never the
  // hidden file input. Only when focus is in the panel or was lost with the drop zone; a drop
  // from the chat leaves the chat's focus alone.
  useEffect(() => {
    const c = crop.current
    const a = c?.ownerDocument.activeElement
    if (loads && c && (!a || a === c.ownerDocument.body || c.closest('.pd-root')?.contains(a))) c.focus({ preventScroll: true })
  }, [loads])

  // a picture dropped or pasted on the panel: take it over (the entry then lets go of it)
  useEffect(() => {
    if (!file) return
    const id = setTimeout(() => { onTaken(); void take(file) }, 0)
    return () => { clearTimeout(id) }
  }, [file, onTaken, take])

  useEffect(() => {
    if (!shake) return
    const id = setTimeout(() => { setShake(false) }, SHAKE_MS)
    return () => { clearTimeout(id) }
  }, [shake])

  // the crop frame follows every move at once (one frame)
  useEffect(() => {
    const c = cropCanvas.current
    if (!pic || !c) return
    const raf = requestAnimationFrame(() => {
      const px = Math.round((c.clientWidth || 320) * (globalThis.devicePixelRatio || 1))
      if (c.width !== px) { c.width = px; c.height = px }
      const ctx = c.getContext('2d')
      if (!ctx) return
      const r = cropOf(pic.pixels.width, pic.pixels.height, view)
      ctx.clearRect(0, 0, px, px)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(pic.canvas, r.x, r.y, r.side, r.side, 0, 0, px, px)
    })
    return () => { cancelAnimationFrame(raf) }
  }, [pic, view])

  // the bead preview: 120 ms after the last change, in a frame (spec §18.2)
  useEffect(() => {
    if (!pic) return
    let raf = 0
    const id = setTimeout(() => {
      raf = requestAnimationFrame(() => { setShown({ size: opts.size, cells: quantize(pic.pixels, cropOf(pic.pixels.width, pic.pixels.height, view), opts, palette) }) })
    }, PREVIEW_DEBOUNCE_MS)
    return () => { clearTimeout(id); cancelAnimationFrame(raf) }
  }, [pic, view, opts, palette])

  useEffect(() => {
    const c = preview.current
    if (c && shown) draw(c, shown, c.clientWidth || 160)
  }, [shown, draw])

  const pick = (): void => { input.current?.click() }
  const move = (dx: number, dy: number, zoom = 1): void => {
    if (!pic) return
    const { width: w, height: h } = pic.pixels
    setView(v => clampView(w, h, { cx: v.cx + dx, cy: v.cy + dy, zoom: v.zoom * zoom }))
  }
  const side = pic ? cropOf(pic.pixels.width, pic.pixels.height, view).side : 1

  const onCropKey = (e: KeyboardEvent): void => {
    const step = side * 0.05
    const k: Record<string, [number, number, number]> = {
      ArrowLeft: [-step, 0, 1], ArrowRight: [step, 0, 1], ArrowUp: [0, -step, 1], ArrowDown: [0, step, 1],
      '+': [0, 0, 1.25], '=': [0, 0, 1.25], '-': [0, 0, 0.8], _: [0, 0, 0.8],
    }
    const a = k[e.key]
    if (!a) return
    e.preventDefault()
    move(...a)
  }
  const onPointerDown = (e: ReactPointerEvent): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerMove = (e: ReactPointerEvent): void => {
    const all = pointers.current
    const prev = all.get(e.pointerId)
    if (!prev) return
    const scale = side / (e.currentTarget.clientWidth || 1)
    if (all.size >= 2) {
      const other = [...all.entries()].find(([id]) => id !== e.pointerId)![1]
      const before = Math.hypot(prev.x - other.x, prev.y - other.y)
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
      if (before > 0 && after > 0) move(0, 0, after / before)
    } else {
      move((prev.x - e.clientX) * scale, (prev.y - e.clientY) * scale)
    }
    all.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: ReactPointerEvent): void => { pointers.current.delete(e.pointerId) }

  const beads = cells ? beadCount(cells) : 0
  const simple = cells !== null && beads < MIN_BEADS
  const set = (p: Partial<QuantizeOptions>): void => { setOpts(o => ({ ...o, ...p })) }

  const fileInput = (
    <input ref={input} className="pd-pic-file" type="file" accept="image/*" tabIndex={-1} aria-hidden
      onChange={(e) => {
        const f = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (f) void take(f)
      }} />
  )

  if (!pic) {
    return (
      <div className="pd-pic">
        <p className="pd-sr" role="status">{told === loads && loads ? t('loaded') : ''}</p>
        <div key="z" ref={zone} className={`pd-pic-zone pd-pic-drop${shake ? ' pd-shake' : ''}`} role="button" tabIndex={0}
          aria-label={t('drop')} aria-describedby="pd-pic-err pd-pic-note" data-error={error ?? undefined} data-over={over || undefined}
          onClick={pick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }}
>
          <span className="pd-pic-ic" aria-hidden>{icon}</span>
          <span>{t('drop')}</span>
          <span className="pd-btn" aria-hidden>{t('choose')}</span>
        </div>
        {fileInput}
        <p id="pd-pic-err" className="pd-pic-err" role="alert">{saying ? t(saying) : ''}</p>
        <p id="pd-pic-note" className="pd-pic-note">{t('note')}</p>
      </div>
    )
  }

  const n = opts.size
  return (
    <div className="pd-pic">
      {/* the same status node in both states, so it is live before it speaks */}
      <p className="pd-sr" role="status">{told === loads && loads ? t('loaded') : ''}</p>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a pan/zoom surface: focusable for the arrow and +/- keys its label announces */}
      <div key="c" ref={crop} className="pd-pic-zone pd-pic-crop" role="group" tabIndex={0} aria-label={t('crop')}
        onKeyDown={onCropKey} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas ref={cropCanvas} aria-hidden />
      </div>
      {fileInput}
      <p id="pd-pic-err" className="pd-pic-err" role="alert">{saying ? t(saying) : ''}</p>
      <label className="pd-pic-row">
        <span>{t('zoom')}</span>
        <input type="range" min={1} max={ZOOM_MAX} step={0.01} value={view.zoom} style={{ '--pd-v': `${((view.zoom - 1) / (ZOOM_MAX - 1)) * 100}%` } as CSSProperties}
          onChange={(e) => { const z = Number(e.currentTarget.value); move(0, 0, z / view.zoom) }} />
      </label>
      <div className="pd-pic-prev">
        <canvas ref={preview} role="img" aria-label={t('preview', { n: shown?.size ?? n, beads })} aria-busy={cells === null} />
        <p>{simple ? <span className="pd-pic-err" id="pd-pic-simple">{t('tooSimple')}</span> : null}</p>
      </div>
      <div className="pd-pic-row">
        <span>{t('size')}</span>
        <span className="pd-seg" role="group" aria-label={t('size')}>
          {PICTURE_SIZES.map(s => <button key={s} type="button" aria-pressed={n === s} onClick={() => { set({ size: s }) }}>{s}×{s}</button>)}
        </span>
      </div>
      <div className="pd-pic-row">
        <span>{t('colors')}</span>
        <span className="pd-seg" role="group" aria-label={t('colors')}>
          {COLOR_LIMITS.map((c: ColorLimit) => (
            <button key={c} type="button" aria-pressed={opts.colors === c} onClick={() => { set({ colors: c }) }}>{c === 16 ? t('all') : t('some', { n: c })}</button>
          ))}
        </span>
      </div>
      <button type="button" role="switch" className="pd-pic-row pd-pic-tg" aria-checked={opts.dither} onClick={() => { set({ dither: !opts.dither }) }}>
        <span>{t('dither')}</span><i className="pd-pic-sw" aria-hidden />
      </button>
      <button type="button" role="switch" className="pd-pic-row pd-pic-tg" aria-checked={opts.removeBg} onClick={() => { set({ removeBg: !opts.removeBg }) }}>
        <span>{t('removeBg')}</span><i className="pd-pic-sw" aria-hidden />
      </button>
      <div className="pd-pic-acts">
        <button type="button" className="pd-btn" onClick={() => { seq.current++; setPic(null); setShown(null); setError(null); setTimeout(() => { zone.current?.focus() }, 0) }}>{t('another')}</button>
        <button type="button" className="pd-btn pd-primary" disabled={cells === null || simple} aria-describedby={simple ? 'pd-pic-simple' : undefined}
          onClick={() => {
            // quantise again now: the debounced preview may be one change behind
            const final = quantize(pic.pixels, cropOf(pic.pixels.width, pic.pixels.height, view), opts, palette)
            // NONE is the core's EMPTY (-1), so the cells are a board as they are
            if (beadCount(final) >= MIN_BEADS) onStart({ size: opts.size, cells: Object.freeze(final) })
          }}>{t('start')}</button>
      </div>
      <p className="pd-pic-note">{t('note')}</p>
    </div>
  )
}
