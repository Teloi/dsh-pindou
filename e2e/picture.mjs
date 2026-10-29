// T1 picture to pattern (spec §18.2) and lazy modules (spec §18.6) in the real
// product: the chunk is fetched from DSH and runs; nothing leaves the page; both
// degraded states (a host without require.async, a chunk that fails to load).
import { deflateSync, crc32 } from 'node:zlib'

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** A PNG from a per-pixel function (RGBA 8-bit). */
export function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 4 + 1) + 1 + x * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

/** A strawberry-ish test picture: a red heart with a green leaf on a white ground. */
export const HEART = png(1200, 900, (x, y) => {
  const u = (x - 600) / 300, v = (450 - y) / 300
  const heart = (u * u + v * v - 1) ** 3 - u * u * v * v * v < 0
  const leaf = (x - 600) ** 2 / 90 ** 2 + (y - 140) ** 2 / 40 ** 2 < 1
  return heart ? [215, 51, 59, 255] : leaf ? [76, 175, 80, 255] : [250, 249, 245, 255]
})

/**
 * Init script for a host without `require.async` (DSH before 0.2.2): our entry's
 * factory gets a require that only knows platform modules.
 */
export const NO_ASYNC_REQUIRE = `(() => {
  let target
  Object.defineProperty(window, '__ModuleLoader__', { configurable: true, get: () => target, set(t) {
    let load = t.load
    Object.defineProperty(t, 'load', { configurable: true,
      get: () => (r) => load.call(t, r.id === 'dsh-pindou' && !r.chunk ? { ...r, factory: req => r.factory(s => req(s)) } : r),
      set(v) { load = v } })
    target = t
  } })
})()`

/** What the page stored: localStorage and IndexedDB names (the picture must be in none). */
export async function storedFootprint() {
  const ls = Object.keys(localStorage).map(k => [k, localStorage.getItem(k) ?? ''])
  const dbs = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map(d => d.name) : []
  const caches = typeof globalThis.caches?.keys === 'function' ? await globalThis.caches.keys() : []
  return {
    keys: ls.map(([k]) => k),
    bytes: ls.reduce((n, [k, v]) => n + k.length + v.length, 0),
    picture: ls.some(([, v]) => /data:image|iVBORw0|base64,/.test(v)),
    dbs,
    caches,
  }
}

/** Drop a file onto an element the way a browser does (a real DataTransfer). */
export async function dropFile([selector, b64, name, type]) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const dt = new DataTransfer()
  dt.items.add(new File([bytes], name, { type }))
  const el = document.querySelector(selector)
  const r = el.getBoundingClientRect()
  const at = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
  const hostSaw = []
  const spy = (e) => { hostSaw.push(e.type) }
  for (const t of ['dragenter', 'dragover', 'drop']) document.addEventListener(t, spy)
  el.dispatchEvent(new DragEvent('dragenter', at))
  const over = new DragEvent('dragover', at)
  el.dispatchEvent(over)
  const drop = new DragEvent('drop', at)
  el.dispatchEvent(drop)
  for (const t of ['dragenter', 'dragover', 'drop']) document.removeEventListener(t, spy)
  return { overPrevented: over.defaultPrevented, dropPrevented: drop.defaultPrevented, hostSaw }
}

/** Paste a file into an element (a real ClipboardEvent with a DataTransfer). */
export function pasteFile([selector, b64, name, type]) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const dt = new DataTransfer()
  dt.items.add(new File([bytes], name, { type }))
  const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
  document.querySelector(selector).dispatchEvent(e)
  return e.defaultPrevented
}

/**
 * How many host elements outside the plugin name this file: DSH shows an attached image as a
 * thumbnail (img alt = file name, remove/retry buttons labelled with it) and other files as a card
 * with the name as text (ui-attachment ComposerAttachments.tsx).
 */
export function hostFileCards(name) {
  return [...document.querySelectorAll('img, [aria-label], span, div')]
    .filter(e => !e.closest('.pd-root, .pd-portal'))
    .filter(e => e.getAttribute('alt') === name || (e.getAttribute('aria-label') ?? '').includes(name) || (e.childElementCount === 0 && e.textContent?.trim() === name)).length
}
