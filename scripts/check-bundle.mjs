#!/usr/bin/env node
// Release guard: the committed lib/ must be loadable by DSH as-is.
// - lib/client.js is one `window.__ModuleLoader__.load({ id, factory })` call
//   that only requires modules the DSH web platform provides;
// - each lazy chunk lib/client.<name>.js is one `load({ id, chunk: "<file>", factory })`
//   call, is reached from the entry through `require.async("./<file>")`, and never
//   through a synchronous require (the host's sync require knows platform modules only;
//   see scripts/async-chunks.ts);
// - package.json declares what awesome-dsh-hub and `dsh plugin add` need;
// - no stray class prefixes or unscoped names leak into the shipped CSS;
// - custom properties ship short (scripts/css-vars.ts): no long name left, none used undefined.
// - size, gzip at the zlib default level (what CDNs and `gzip` ship), each below 90%
//   of its budget so there is always headroom for the next change:
//     first screen  lib/client.js            ≤ 40 KB = 40,960 B (spec §10)
//     lazy chunks   lib/client.<name>.js     ≤ 20 KB = 20,480 B together (spec §18.6)
//   and v0.2 may grow the first screen by at most 1.5 KB over v0.1 (spec §18.6):
//     lib/client.js ≤ 33,746 + 1,536 = 35,282 B (no headroom rule; this is the hard cap)
//
// Usage: node scripts/check-bundle.mjs [libDir]   (default lib; package.json from cwd)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Spec §10: the first-screen client bundle must stay at or below 40 KB gzip. */
export const GZIP_BUDGET = 40 * 1024
/** Spec §18.6: lazily loaded chunks, all together, at or below 20 KB gzip. */
export const ASYNC_GZIP_BUDGET = 20 * 1024
/** v0.1.0's lib/client.js, gzip (the spec §18.6 baseline). */
export const V01_FIRST_SCREEN = 33746
/** Spec §18.6: the v0.2 features add at most 1.5 KB gzip to the first screen. */
export const V02_FIRST_SCREEN_GROWTH = 1536
/** Project rule on top of the spec: stay at or below 90% so a feature can't silently use up the last few KB. */
export const GZIP_HEADROOM = 0.9
const PLATFORM = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])
const CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
const Q = '["\'`]'
const fail = []
const libDir = process.argv[2] ?? 'lib'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const client = readFileSync(join(libDir, 'client.js'), 'utf8')
const host = readFileSync(join(libDir, 'index.js'), 'utf8')

const libFiles = readdirSync(libDir).filter(f => !f.startsWith('.'))
const chunkFiles = libFiles.filter(f => f !== 'client.js' && f.startsWith('client.'))
for (const f of libFiles) {
  if (f !== 'index.js' && f !== 'client.js' && !CLIENT_CHUNK.test(f)) fail.push(`${libDir}/${f} is not a file the plugin ships (index.js, client.js, client.<name>.js)`)
}
for (const f of chunkFiles) {
  if (f.startsWith('client.node.')) fail.push(`${libDir}/${f}: client.node.* is reserved by the host and never served to the browser`)
}

/** Shape checks shared by the entry and every chunk. */
function checkScript(file, code, chunk) {
  const opening = new RegExp(`^window\\.__ModuleLoader__\\.load\\(\\{\\s*id:\\s*${Q}${pkg.name}${Q},\\s*${chunk ? `chunk:\\s*${Q}${chunk.replaceAll('.', '\\.')}${Q},\\s*` : ''}factory:\\s*\\(?require\\)?\\s*=>`)
  if (!code.startsWith('window.__ModuleLoader__.load({')) fail.push(`${file} must start with window.__ModuleLoader__.load({`)
  else if (!opening.test(code)) fail.push(`${file} must register id "${pkg.name}"${chunk ? ` with chunk "${chunk}"` : ' with no chunk'} and a factory whose parameter is named require (the require checks below read it by name)`)
  for (const [, spec] of code.matchAll(new RegExp(`\\brequire\\(${Q}([^"'\`]+)${Q}\\)`, 'g'))) {
    if (spec.startsWith('.')) fail.push(`${file} requires "${spec}" synchronously; the DSH loader only loads package chunks through require.async (shared code between the entry and a lazy module?)`)
    else if (!PLATFORM.has(spec)) fail.push(`${file} requires "${spec}", which the DSH platform does not provide`)
  }
  for (const [, spec] of code.matchAll(new RegExp(`\\brequire\\.async\\(${Q}([^"'\`]+)${Q}\\)`, 'g'))) {
    if (!spec.startsWith('./') || !chunkFiles.includes(spec.slice(2))) fail.push(`${file} loads "${spec}" with require.async, but ${libDir} has no such chunk`)
  }
  if (/\bbb-|--bb-/.test(code)) fail.push(`${file} contains a non-pd- class prefix`)
  if (/(?:^|\n)\s*import\s/.test(code)) fail.push(`${file} must be CJS (no import statements)`)
  if (/\(0,\s*\w+\.jsxs?\)\(/.test(code)) fail.push(`${file} calls the JSX runtime as (0,x.jsx)(…); tsdown.config.ts dsh-client-jsx-alias must turn these into local aliases`)
  if (code.includes('__PURE__')) fail.push(`${file} ships /* @__PURE__ */ annotations; tsdown.config.ts output.comments.annotation must stay false`)
}

checkScript(`${libDir}/client.js`, client)
const chunks = chunkFiles.map(f => ({ f, code: readFileSync(join(libDir, f), 'utf8') }))
for (const { f, code } of chunks) checkScript(`${libDir}/${f}`, code, f)
// a chunk nobody loads is dead weight (or a stale file from an earlier build)
const loaded = new Set([client, ...chunks.map(c => c.code)].flatMap(code => [...code.matchAll(new RegExp(`\\brequire\\.async\\(${Q}\\./([^"'\`]+)${Q}\\)`, 'g'))].map(m => m[1])))
for (const { f } of chunks) if (!loaded.has(f)) fail.push(`${libDir}/${f} is never loaded with require.async (stale build output?)`)

// Custom properties ship under their short names (scripts/css-vars.ts, one table: css-vars.json).
// No long `--pd-` name may be left, and every `var(--…)` must be defined somewhere in what ships
// (a declaration `--x:`, an `@property --x`, or an inline style key "--x"); host tokens
// (--ds-*, --dsw-*) are read with a fallback only.
const SHORT = new Set(Object.values(JSON.parse(readFileSync(new URL('./css-vars.json', import.meta.url), 'utf8'))))
const shipped = [{ f: `${libDir}/client.js`, code: client }, ...chunks.map(c => ({ f: `${libDir}/${c.f}`, code: c.code }))]
const defined = new Set(shipped.flatMap(({ code }) => [
  ...[...code.matchAll(/(?:[{;(\s]|@property )(--[\w-]+)\s*:/g)].map(m => m[1]),
  ...[...code.matchAll(/@property (--[\w-]+)/g)].map(m => m[1]),
  ...[...code.matchAll(new RegExp(`${Q}(--[\\w-]+)${Q}`, 'g'))].map(m => m[1]),
]))
for (const { f, code } of shipped) {
  const long = [...new Set(code.match(/--pd-[\w-]*/g) ?? [])]
  if (long.length) fail.push(`${f} still has long custom property names (add them to scripts/css-vars.json): ${long.join(' ')}`)
  for (const [, name, fallback] of code.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
    if (/^--dsw?-/.test(name)) { if (!fallback) fail.push(`${f} reads host token ${name} without a fallback`) }
    else if (!SHORT.has(name)) fail.push(`${f} uses var(${name}), which is neither a short name from scripts/css-vars.json nor a host token`)
    else if (!defined.has(name)) fail.push(`${f} uses var(${name}), which nothing that ships defines`)
  }
}

function budget(label, bytes, limit) {
  if (bytes > limit) fail.push(`${label} is ${bytes} B gzip, over the ${limit} B budget`)
  else if (bytes > limit * GZIP_HEADROOM) fail.push(`${label} is ${bytes} B gzip, above ${GZIP_HEADROOM * 100}% of the ${limit} B budget; trim before adding more`)
}
const gz = gzipSync(client).length
budget(`${libDir}/client.js`, gz, GZIP_BUDGET)
if (gz > V01_FIRST_SCREEN + V02_FIRST_SCREEN_GROWTH) fail.push(`${libDir}/client.js is ${gz} B gzip, ${gz - V01_FIRST_SCREEN} B over v0.1 (${V01_FIRST_SCREEN} B); spec §18.6 allows at most ${V02_FIRST_SCREEN_GROWTH} B: move code into a lazy chunk`)
const asyncGz = chunks.reduce((sum, { code }) => sum + gzipSync(code).length, 0)
budget(`lazy chunks (${chunks.length})`, asyncGz, ASYNC_GZIP_BUDGET)
if (!host.includes('export')) fail.push(`${libDir}/index.js must be an ES module`)

if (!pkg.dsh?.bundle?.patch) fail.push('package.json dsh.bundle.patch is required (awesome-dsh-hub listing rule)')
if (pkg.dsh?.client?.platform !== 'web') fail.push('package.json dsh.client.platform must be "web"')
if (!pkg.files?.includes('lib')) fail.push('package.json files must include lib')
if (pkg.scripts?.prepare || pkg.scripts?.postinstall || pkg.scripts?.install) fail.push('no install-time scripts: git installs must not need allowBuilds')
if (!pkg.keywords?.includes('dsh-plugin')) fail.push('keywords should include dsh-plugin')

if (fail.length > 0) {
  for (const f of fail) console.error(`✗ ${f}`)
  process.exit(1)
}
const pct = (n, of) => ((n / of) * 100).toFixed(1)
process.stdout.write(`✓ bundle shape ok (client ${client.length} B, ${gz} B gzip = ${pct(gz, GZIP_BUDGET)}% of ${GZIP_BUDGET} B budget; `
  + `lazy chunks ${chunks.length}, ${asyncGz} B gzip = ${pct(asyncGz, ASYNC_GZIP_BUDGET)}% of ${ASYNC_GZIP_BUDGET} B; host ${host.length} B)\n`)
