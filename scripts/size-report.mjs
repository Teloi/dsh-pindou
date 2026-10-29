#!/usr/bin/env node
// Where the client gzip goes: build lib/client.js unminified with module regions,
// minify each region the way the release build does, and report per module the
// minified bytes and its marginal gzip (whole bundle with vs. without it).
// Usage: node scripts/size-report.mjs   (does not touch lib/)
import { gzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { build } from 'tsdown'
import { createRequire } from 'node:module'
import config from '../tsdown.config.ts'

// rolldown comes with tsdown; reach its minifier through tsdown's own resolution
const tsdownReq = createRequire(createRequire(import.meta.url).resolve('tsdown'))
const { minifySync } = await import(tsdownReq.resolve('rolldown/experimental'))

const out = '/tmp/pindou-size-report'
const client = config.find(c => c.outDir === 'lib' && c.format === 'cjs')
rmSync(out, { recursive: true, force: true })
await build({ ...client, config: false, outDir: out, minify: false, logLevel: 'silent' })
const raw = readFileSync(`${out}/client.js`, 'utf8')
const parts = []
let cur = { name: '(wrapper)', code: '' }
for (const line of raw.split('\n')) {
  // rolldown marks where each module starts: `// src/…` (or `//#region …`)
  const m = /^\/\/(?:#region)? ((?:src|node_modules)\/\S+)$/.exec(line)
  if (m) { parts.push(cur); cur = { name: m[1], code: '' }; continue }
  cur.code += `${line}\n`
}
parts.push(cur)
const min = code => minifySync('x.js', code, { compress: true, mangle: false, codegen: { removeWhitespace: true } }).code
const groups = new Map()
for (const p of parts) {
  const key = p.name.replace(/^.*node_modules\/(\.pnpm\/)?/, 'npm:').replace(/^(npm:[^/]+).*/, '$1')
  groups.set(key, (groups.get(key) ?? '') + p.code)
}
const mins = [...groups].map(([name, code]) => { let m; try { m = min(code) } catch { m = code } return { name, m } })
const all = gzipSync(mins.map(x => x.m).join('\n')).length
const rows = mins.map(x => ({
  name: x.name, min: x.m.length, gz: gzipSync(x.m).length,
  marginal: all - gzipSync(mins.filter(y => y !== x).map(y => y.m).join('\n')).length,
})).toSorted((a, b) => b.marginal - a.marginal)
const pad = (v, n) => String(v).padStart(n)
const lines = [
  `approx. whole: ${all} B gzip (per-module minify; the release build is ${gzipSync(readFileSync('lib/client.js')).length} B)`,
  `${'module'.padEnd(44)} ${pad('min B', 8)} ${pad('gzip B', 8)} ${pad('marginal', 9)}`,
  ...rows.map(r => `${r.name.padEnd(44)} ${pad(r.min, 8)} ${pad(r.gz, 8)} ${pad(r.marginal, 9)}`),
]
process.stdout.write(`${lines.join('\n')}\n`)
