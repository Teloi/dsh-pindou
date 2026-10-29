import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { UserConfig } from 'tsdown'
import { afterAll, describe, expect, it } from 'vitest'
import { assertOnlyDynamicChunks, registrationBanner, rewriteDynamicImports } from '../scripts/async-chunks.ts'

const ROOT = resolve(import.meta.dirname, '..')
const tmp: string[] = []
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }) })
const tempDir = (): string => { const d = mkdtempSync(join(tmpdir(), 'pindou-split-')); tmp.push(d); return d }

const checkBundle = (libDir: string): { status: number | null; out: string } => {
  const r = spawnSync(process.execPath, ['scripts/check-bundle.mjs', libDir], { cwd: ROOT, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}
const opening = (chunk?: string): string => `window.__ModuleLoader__.load({ id: "dsh-pindou", ${chunk ? `chunk: "${chunk}", ` : ''}factory: (require) => {`
const close = 'return module.exports; } });'
/** A lib dir with the real host half and the given client files. */
function libWith(files: Record<string, string>): string {
  const dir = tempDir()
  copyFileSync(join(ROOT, 'lib/index.js'), join(dir, 'index.js'))
  for (const [f, code] of Object.entries(files)) writeFileSync(join(dir, f), code)
  return dir
}

describe('async chunks: build helpers', () => {
  it('entry and chunk registrations', () => {
    expect(registrationBanner('dsh-pindou', { isEntry: true, fileName: 'client.js' })).toBe(opening())
    expect(registrationBanner('dsh-pindou', { isEntry: false, fileName: 'client.lazy.js' })).toBe(opening('client.lazy.js'))
  })

  it('rewrites rolldown CJS import() to require.async, any quote style', () => {
    const code = 'a=Promise.resolve().then(() => require("./client.lazy.js"));b=Promise.resolve().then(()=>require(`./client.lazy.js`))'
    expect(rewriteDynamicImports(code, { fileName: 'client.js', dynamicImports: ['client.lazy.js'] }))
      .toBe('a=require.async("./client.lazy.js");b=require.async("./client.lazy.js")')
  })

  it('fails loudly when an import() it must rewrite is missing or misnamed', () => {
    expect(() => rewriteDynamicImports('x', { fileName: 'client.js', dynamicImports: ['client.lazy.js'] })).toThrow(/no import\(\) expression/)
    expect(() => rewriteDynamicImports('x', { fileName: 'client.js', dynamicImports: ['lazy.js'] })).toThrow(/client.<name>.js/)
  })

  it('rejects a shared (non-dynamic) chunk', () => {
    expect(() => assertOnlyDynamicChunks([
      { fileName: 'client.js', isEntry: true, isDynamicEntry: false, dynamicImports: [] },
      { fileName: 'client.shared.js', isEntry: false, isDynamicEntry: false, dynamicImports: [] },
    ])).toThrow(/shared between the entry and a lazy module/)
  })
})

// tsdown needs Node ^22.18 || >=24.11; the Node 20 CI leg runs the rest of the suite.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
const canBuild = major > 22 || (major === 22 && minor >= 18)

describe.skipIf(!canBuild)('async chunks: the real client build config', () => {
  async function buildFixture(entry: string): Promise<string> {
    const { build } = await import('tsdown')
    const { default: configs } = await import('../tsdown.config.ts')
    const client = (configs as UserConfig[]).find(c => c.outDir === 'lib' && c.format === 'cjs')
    if (!client) throw new Error('client config missing')
    const outDir = tempDir()
    await build({ ...client, config: false, entry: { client: join(ROOT, 'tests/fixtures/split', entry) }, outDir, logLevel: 'silent' })
    copyFileSync(join(ROOT, 'lib/index.js'), join(outDir, 'index.js'))
    return outDir
  }

  it('a lazy module becomes client.<name>.js, loaded with require.async, and passes check:bundle', async () => {
    const dir = await buildFixture('entry.ts')
    expect(readdirSync(dir).toSorted()).toEqual(['client.js', 'client.lazy.js', 'index.js'])
    const entry = readFileSync(join(dir, 'client.js'), 'utf8')
    const chunk = readFileSync(join(dir, 'client.lazy.js'), 'utf8')
    expect(entry).toMatch(/require\.async\(["'`]\.\/client\.lazy\.js["'`]\)/)
    expect(entry).not.toMatch(/Promise\.resolve\(\)\.then/)
    expect(chunk).toMatch(/^window\.__ModuleLoader__\.load\(\{id:["'`]dsh-pindou["'`],chunk:["'`]client\.lazy\.js["'`],factory:require=>/)
    const r = checkBundle(dir)
    expect(r.out).toContain('lazy chunks 1')
    expect(r.status).toBe(0)
  })

  it('a module shared by the entry and a lazy module fails the build, not the user', async () => {
    await expect(buildFixture('entry-shared.ts')).rejects.toThrow(/shared between the entry and a lazy module/)
  })
})

/** Incompressible filler: ~10 KB gzip, so two chunks pass 90% of the 20 KB lazy budget. */
function noise(seed: number): string {
  let x = seed
  let s = ''
  while (s.length < 14000) { x = (x * 1103515245 + 12345) % 2147483648; s += String.fromCharCode(48 + (x % 75)).replace(/[`\\$]/, 'a') }
  return `var n=\`${s}\`;`
}

describe('check:bundle on lazy chunks', () => {
  const entry = (body = ''): string => `${opening()}var module={exports:{}};${body}${close}`
  const chunk = (name: string, body = ''): string => `${opening(name)}var module={exports:{}};${body}${close}`

  it('the committed lib passes', () => {
    expect(checkBundle('lib').status).toBe(0)
  })

  it('a synchronous require of a package chunk fails', () => {
    const r = checkBundle(libWith({
      'client.js': entry('require("./client.common.js");require.async("./client.lazy.js");'),
      'client.lazy.js': chunk('client.lazy.js'),
      'client.common.js': chunk('client.common.js'),
    }))
    expect(r.status).toBe(1)
    expect(r.out).toContain('requires "./client.common.js" synchronously')
  })

  it('a chunk nobody loads, a missing chunk and a wrong registration fail', () => {
    const r = checkBundle(libWith({
      'client.js': entry('require.async("./client.gone.js");'),
      'client.stale.js': chunk('client.other.js'),
    }))
    expect(r.status).toBe(1)
    expect(r.out).toContain('loads "./client.gone.js" with require.async, but')
    expect(r.out).toContain('client.stale.js is never loaded')
    expect(r.out).toContain('with chunk "client.stale.js"')
  })

  it('non-platform requires in a chunk fail, whatever the quotes', () => {
    const r = checkBundle(libWith({
      'client.js': entry('require.async("./client.lazy.js");'),
      'client.lazy.js': chunk('client.lazy.js', 'require(`left-pad`);'),
    }))
    expect(r.status).toBe(1)
    expect(r.out).toContain('requires "left-pad"')
  })

  it('lazy chunks have their own budget, 90% of 20 KB together', () => {
    const files = {
      'client.js': entry('require.async("./client.a.js");require.async("./client.b.js");'),
      'client.a.js': chunk('client.a.js', noise(1)),
      'client.b.js': chunk('client.b.js', noise(2)),
    }
    const total = gzipSync(files['client.a.js']).length + gzipSync(files['client.b.js']).length
    expect(total).toBeGreaterThan(20 * 1024 * 0.9)
    const r = checkBundle(libWith(files))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/lazy chunks \(2\) is \d+ B gzip/)
  })

  it('a factory whose require is renamed (mangled) fails: the require checks could not see it', () => {
    const r = checkBundle(libWith({ 'client.js': `window.__ModuleLoader__.load({id:"dsh-pindou",factory:e=>{e("left-pad");${close}` }))
    expect(r.status).toBe(1)
    expect(r.out).toContain('a factory whose parameter is named require')
  })

  it('unexpected files in lib fail', () => {
    const r = checkBundle(libWith({ 'client.js': entry(), 'notes.txt': 'x' }))
    expect(r.status).toBe(1)
    expect(r.out).toContain('notes.txt is not a file the plugin ships')
  })
})
