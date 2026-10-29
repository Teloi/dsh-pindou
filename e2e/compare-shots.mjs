#!/usr/bin/env node
// Compare the settled plugin crops (plugin/*.png, written by run.mjs) of two E2E runs, e.g.
// a baseline and a refactor that must not change how anything looks:
//
//   node e2e/compare-shots.mjs <runA> <runB>     (each an e2e/.out or E2E_SELFCHECK_DIR)
//
// Chrome encodes identical pixels to identical PNG bytes, so equal files mean equal pixels;
// a differing file is listed with its byte sizes for a closer look in an image viewer.
// Exits 1 when any crop differs or exists in only one run.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [a, b] = process.argv.slice(2)
if (!a || !b) { process.stderr.write('usage: node e2e/compare-shots.mjs <runA> <runB>\n'); process.exit(2) }
const list = (d) => {
  const dir = join(d, 'plugin')
  if (!existsSync(dir)) { process.stderr.write(`no plugin/ crops in ${d}\n`); process.exit(2) }
  return new Set(readdirSync(dir).filter(f => f.endsWith('.png')))
}
const A = list(a), B = list(b)
const both = [...A].filter(f => B.has(f)).toSorted()
const onlyA = [...A].filter(f => !B.has(f)).toSorted(), onlyB = [...B].filter(f => !A.has(f)).toSorted()
const differ = both.filter(f => !readFileSync(join(a, 'plugin', f)).equals(readFileSync(join(b, 'plugin', f))))
for (const f of differ) process.stdout.write(`  ≠ ${f}\n`)
for (const f of onlyA) process.stdout.write(`  only in A: ${f}\n`)
for (const f of onlyB) process.stdout.write(`  only in B: ${f}\n`)
process.stdout.write(`${both.length - differ.length} of ${both.length} plugin crops identical${onlyA.length + onlyB.length ? `, ${onlyA.length + onlyB.length} unmatched` : ''}\n`)
process.exit(differ.length || onlyA.length || onlyB.length ? 1 : 0)
