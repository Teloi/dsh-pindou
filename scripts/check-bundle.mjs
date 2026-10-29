#!/usr/bin/env node
// Release guard: the committed lib/ must be loadable by DSH as-is.
// - lib/client.js is one `window.__ModuleLoader__.load({ id, factory })` call
//   that only requires modules the DSH web platform provides;
// - package.json declares what awesome-dsh-hub and `dsh plugin add` need;
// - no stray class prefixes or unscoped names leak into the shipped CSS.
import { readFileSync } from 'node:fs'

const PLATFORM = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])
const fail = []
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const client = readFileSync('lib/client.js', 'utf8')
const host = readFileSync('lib/index.js', 'utf8')

if (!client.startsWith('window.__ModuleLoader__.load({')) fail.push('lib/client.js must start with window.__ModuleLoader__.load({')
if (!client.includes(`id: "${pkg.name}"`)) fail.push(`lib/client.js module id must be "${pkg.name}"`)
for (const [, spec] of client.matchAll(/require\("([^"]+)"\)/g)) {
  if (!PLATFORM.has(spec)) fail.push(`lib/client.js requires "${spec}", which the DSH platform does not provide`)
}
if (/\bbb-|--bb-/.test(client)) fail.push('lib/client.js contains a non-pd- class prefix')
if (/(?:^|\n)\s*import\s/.test(client)) fail.push('lib/client.js must be CJS (no import statements)')
if (!host.includes('export')) fail.push('lib/index.js must be an ES module')

if (!pkg.dsh?.bundle?.patch) fail.push('package.json dsh.bundle.patch is required (awesome-dsh-hub listing rule)')
if (pkg.dsh?.client?.platform !== 'web') fail.push('package.json dsh.client.platform must be "web"')
if (!pkg.files?.includes('lib')) fail.push('package.json files must include lib')
if (pkg.scripts?.prepare || pkg.scripts?.postinstall || pkg.scripts?.install) fail.push('no install-time scripts: git installs must not need allowBuilds')
if (!pkg.keywords?.includes('dsh-plugin')) fail.push('keywords should include dsh-plugin')

if (fail.length > 0) {
  for (const f of fail) console.error(`✗ ${f}`)
  process.exit(1)
}
process.stdout.write(`✓ bundle shape ok (${(client.length / 1024).toFixed(1)} kB client, ${(host.length / 1024).toFixed(1)} kB host)\n`)
