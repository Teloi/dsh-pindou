#!/usr/bin/env node
// Compare the settled plugin crops (plugin/*.png, written by run.mjs) of two E2E runs pixel by
// pixel, e.g. two runs of one build (must be identical) or a baseline and a refactor that must
// not change how anything looks:
//
//   node e2e/compare-shots.mjs <runA> <runB>     (each an e2e/.out or E2E_SELFCHECK_DIR)
//
// Each PNG is decoded to RGBA (bytes are not compared: equal pixels may be encoded differently),
// and a differing crop is listed with its size, the number of differing pixels, the largest
// channel delta and the bounding box of the change. Exits 1 when any crop differs or exists in
// only one run, 2 on bad input. tests/compare-shots.test.ts is the counter-proof: one changed
// pixel must be caught, a re-encoded identical image must not.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Decode an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB or RGBA) to RGBA. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0
  const idat = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), kind = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len)
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12] }
    else if (kind === 'IDAT') idat.push(body)
    else if (kind === 'IEND') break
    at += 12 + len
  }
  const ch = CHANNELS[type]
  if (depth !== 8 || !ch || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`)
  const raw = inflateSync(Buffer.concat(idat)), stride = width * ch
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride), line = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : Number.NaN
      if (Number.isNaN(pred)) throw new Error(`bad PNG filter ${f}`)
      line[i] = (src[i] + pred) & 255
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, s = x * ch
      if (ch <= 2) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = ch === 2 ? line[s + 1] : 255 }
      else { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = ch === 4 ? line[s + 3] : 255 }
    }
    ;[prev, line] = [line, prev]
  }
  return { width, height, data: out }
}

/** Pixel difference of two PNG buffers: null when every pixel is equal. */
export function diffPng(a, b) {
  const A = decodePng(a), B = decodePng(b)
  if (A.width !== B.width || A.height !== B.height) return { size: `${A.width}×${A.height} vs ${B.width}×${B.height}` }
  let pixels = 0, delta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let i = 0; i < A.data.length; i += 4) {
    let d = 0
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(A.data[i + c] - B.data[i + c]))
    if (!d) continue
    const x = (i / 4) % A.width, y = Math.floor(i / 4 / A.width)
    pixels++; delta = Math.max(delta, d)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return pixels ? { pixels, delta, box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } } : null
}

const crops = (d) => {
  const dir = join(d, 'plugin')
  if (!existsSync(dir)) throw new Error(`no plugin/ crops in ${d}`)
  return new Set(readdirSync(dir).filter(f => f.endsWith('.png')))
}

/** Compare the plugin/ crops of two run directories. */
export function compareRuns(a, b) {
  const list = crops
  const A = list(a), B = list(b)
  const both = [...A].filter(f => B.has(f)).toSorted()
  const differ = []
  for (const f of both) {
    const d = diffPng(readFileSync(join(a, 'plugin', f)), readFileSync(join(b, 'plugin', f)))
    if (d) differ.push({ file: f, ...d })
  }
  return {
    compared: both.length,
    differ,
    onlyA: [...A].filter(f => !B.has(f)).toSorted(),
    onlyB: [...B].filter(f => !A.has(f)).toSorted(),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2)
  if (!a || !b) { process.stderr.write('usage: node e2e/compare-shots.mjs <runA> <runB>\n'); process.exit(2) }
  let r
  try { r = compareRuns(a, b) } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2) }
  for (const d of r.differ) process.stdout.write(`  ≠ ${d.file} ${d.size ?? `${d.pixels} px, max Δ ${d.delta}, box ${d.box.width}×${d.box.height}@${d.box.x},${d.box.y}`}\n`)
  for (const f of r.onlyA) process.stdout.write(`  only in A: ${f}\n`)
  for (const f of r.onlyB) process.stdout.write(`  only in B: ${f}\n`)
  const unmatched = r.onlyA.length + r.onlyB.length
  process.stdout.write(`${r.compared - r.differ.length} of ${r.compared} plugin crops pixel-identical${unmatched ? `, ${unmatched} unmatched` : ''}\n`)
  process.exit(r.differ.length || unmatched ? 1 : 0)
}
