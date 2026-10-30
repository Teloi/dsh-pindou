import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodings, githubSlug, isCiBadge, isRelative, packedReadmeProblems, pinReadme, rawBase, readmeRefs, repoPath, webBase } from '../scripts/npm-readme.ts'
import { nodeVersionProblem } from '../scripts/node-version.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { repository: unknown, scripts: Record<string, string> }
const SLUG = githubSlug(pkg.repository)
const REF = 'v0.2.1'
const RAW = rawBase(SLUG, REF)
const BLOB = webBase(SLUG, REF, 'blob')
const TREE = webBase(SLUG, REF, 'tree')
const onlyLicense = (p: string): 'blob' | 'tree' => { if (p !== 'LICENSE') throw new Error(`"${p}" is not in commit`); return 'blob' }
const pin = (md: string, objectType?: (path: string) => 'blob' | 'tree') => pinReadme(md, objectType ? { slug: SLUG, ref: REF, objectType } : { slug: SLUG, ref: REF })

describe('npm README pinning (scripts/npm-readme.ts)', () => {
  it('reads the GitHub slug from package.json and rejects unsafe refs', () => {
    expect(SLUG).toBe('Teloi/dsh-pindou')
    expect(() => githubSlug({ url: 'https://gitlab.com/a/b' })).toThrow(/not a GitHub repository/)
    expect(() => rawBase(SLUG, '../main')).toThrow(/unsafe ref/)
    expect(() => webBase(SLUG, 'a/b', 'blob')).toThrow(/unsafe ref/)
  })

  it('tells relative paths from URLs and anchors', () => {
    expect(['docs/a.png', './a.png', '/a.png', 'LICENSE', './'].every(isRelative)).toBe(true)
    expect(['https://x/a.png', '//x/a.png', 'data:image/png;base64,AA', 'mailto:a@b.c', '#top', ''].some(isRelative)).toBe(false)
    expect(repoPath('./docs/a.png')).toBe('docs/a.png')
    expect(repoPath('/docs/a.png')).toBe('docs/a.png')
    expect(() => repoPath('../x.png')).toThrow(/leaves the repository/)
    expect(() => repoPath('docs/../../x.md#a')).toThrow(/leaves the repository/)
  })

  it('pins img src, every source srcset candidate and Markdown images to raw at the ref', () => {
    const md = [
      '<picture>',
      '  <source media="(prefers-color-scheme: dark)" srcset="docs/d.png">',
      "  <source srcset='docs/a.png 1x, ./docs/b.png 2x'>",
      '  <img src="docs/l.png" width="100%" alt="banner">',
      '</picture>',
      '![shot](docs/s.png "title") ![abs](https://e.com/x.png) ![angle](<docs/a b.png>)',
    ].join('\n')
    const { text, paths } = pin(md)
    expect(text).toBe([
      '<picture>',
      `  <source media="(prefers-color-scheme: dark)" srcset="${RAW}docs/d.png">`,
      `  <source srcset='${RAW}docs/a.png 1x, ${RAW}docs/b.png 2x'>`,
      `  <img src="${RAW}docs/l.png" width="100%" alt="banner">`,
      '</picture>',
      `![shot](${RAW}docs/s.png "title") ![abs](https://e.com/x.png) ![angle](<${RAW}docs/a b.png>)`,
    ].join('\n'))
    expect(paths).toEqual(['docs/d.png', 'docs/a.png', 'docs/b.png', 'docs/l.png', 'docs/s.png', 'docs/a b.png'].map((path) => ({ path, kind: 'image' })))
    expect(packedReadmeProblems(text, SLUG, REF)).toEqual([])
    expect(pin(text).text).toBe(text) // idempotent
  })

  it('pins <a href>, Markdown links and reference definitions to blob/tree; keeps anchors, queries and absolute URLs', () => {
    const tree = new Set(['docs', 'docs/assets', ''])
    const objectType = (p: string) => (tree.has(p) ? 'tree' : 'blob') as 'blob' | 'tree'
    const md = [
      '<a href="./CHANGELOG.md"><img alt="badge" src="https://img.shields.io/badge/x-y-blue"></a>',
      "<a href='LICENSE'>MIT</a> · <a href=\"#install\">jump</a> · <a href=\"https://github.com/Teloi/dsh-pindou/actions\">CI</a>",
      'See [the rules](docs/dsh-ui-constraints.md#layout), [docs](docs/), [assets](./docs/assets) and [root](./).',
      '[![badge](docs/b.png)](CONTRIBUTING.md "Contributing") [home](https://example.com/a.md) [top](#top) [mail](mailto:a@b.c)',
      '[guide]: docs/guide.md "Guide"',
      '[logo]: <docs/logo.svg>',
      '[q](README.en.md?plain=1#usage)',
    ].join('\n')
    const { text, paths } = pin(md, objectType)
    expect(text).toBe([
      `<a href="${BLOB}CHANGELOG.md"><img alt="badge" src="https://img.shields.io/badge/x-y-blue"></a>`,
      `<a href='${BLOB}LICENSE'>MIT</a> · <a href="#install">jump</a> · <a href="https://github.com/Teloi/dsh-pindou/actions">CI</a>`,
      `See [the rules](${BLOB}docs/dsh-ui-constraints.md#layout), [docs](${TREE}docs), [assets](${TREE}docs/assets) and [root](${TREE}).`,
      `[![badge](${RAW}docs/b.png)](${BLOB}CONTRIBUTING.md "Contributing") [home](https://example.com/a.md) [top](#top) [mail](mailto:a@b.c)`,
      `[guide]: ${BLOB}docs/guide.md "Guide"`,
      `[logo]: <${RAW}docs/logo.svg>`,
      `[q](${BLOB}README.en.md?plain=1#usage)`,
    ].join('\n'))
    expect(paths).toEqual([
      { path: 'CHANGELOG.md', kind: 'link' },
      { path: 'LICENSE', kind: 'link' },
      { path: 'docs/dsh-ui-constraints.md', kind: 'link' },
      { path: 'docs', kind: 'link' },
      { path: 'docs/assets', kind: 'link' },
      { path: '', kind: 'link' },
      { path: 'docs/b.png', kind: 'image' },
      { path: 'CONTRIBUTING.md', kind: 'link' },
      { path: 'docs/guide.md', kind: 'link' },
      { path: 'docs/logo.svg', kind: 'image' },
      { path: 'README.en.md', kind: 'link' },
    ])
    expect(packedReadmeProblems(text, SLUG, REF)).toEqual([])
    expect(pin(text, objectType).text).toBe(text) // idempotent
  })

  it('a directory link without objectType falls back to tree only for a trailing slash', () => {
    expect(pin('[d](docs/) [f](docs)').text).toBe(`[d](${TREE}docs) [f](${BLOB}docs)`)
  })

  it('a missing target fails the pin (objectType throws)', () => {
    expect(() => pin('[ok](LICENSE) [x](gone.md)', onlyLicense)).toThrow(/gone\.md/)
  })

  it('does not touch fenced code or inline code spans', () => {
    const md = '```html\n<img src="docs/x.png">\n[a](b.md)\n```\n<img src="docs/y.png"> `[c](d.md)` ``<a href="e.md">`` [f](g.md)'
    expect(pin(md).text).toBe(`\`\`\`html\n<img src="docs/x.png">\n[a](b.md)\n\`\`\`\n<img src="${RAW}docs/y.png"> \`[c](d.md)\` \`\`<a href="e.md">\`\` [f](${BLOB}g.md)`)
    expect(packedReadmeProblems(md, SLUG, REF)).toEqual(['line 5: relative src "docs/y.png"', 'line 5: relative markdown-link "g.md"'])
  })

  it('the check fails on any leftover relative image, srcset or link and on another ref of this repo', () => {
    const md = [
      `<img src="${RAW}docs/ok.png"> <a href="${BLOB}LICENSE">ok</a> [ok](${TREE}docs) [top](#top)`,
      '<source media="(prefers-color-scheme: dark)" srcset="docs/d.png">',
      '<img src="docs/l.png">',
      '![x](./s.png)',
      '<a href="./README.en.md">English</a>',
      '[rules](docs/dsh-ui-constraints.md)',
      '[ref]: CONTRIBUTING.md',
      `<img src="https://raw.githubusercontent.com/${SLUG}/main/docs/m.png">`,
      `[h](https://github.com/${SLUG}/blob/HEAD/LICENSE) [t](https://github.com/${SLUG}/tree/main/docs)`,
    ].join('\n')
    expect(packedReadmeProblems(md, SLUG, REF)).toEqual([
      'line 2: relative srcset "docs/d.png"',
      'line 3: relative src "docs/l.png"',
      'line 4: relative markdown-image "./s.png"',
      'line 5: relative href "./README.en.md"',
      'line 6: relative markdown-link "docs/dsh-ui-constraints.md"',
      'line 7: relative definition "CONTRIBUTING.md"',
      `line 8: src "https://raw.githubusercontent.com/${SLUG}/main/docs/m.png" is not pinned to ${REF}`,
      `line 9: markdown-link "https://github.com/${SLUG}/blob/HEAD/LICENSE" is not pinned to ${REF}`,
      `line 9: markdown-link "https://github.com/${SLUG}/tree/main/docs" is not pinned to ${REF}`,
    ])
  })

  it.each(['README.md', 'README.en.md'])('%s: the repository copy stays relative; pinned, every target exists, it passes and only URLs change', (name) => {
    const md = readFileSync(resolve(ROOT, name), 'utf8')
    const relative = readmeRefs(md).filter((r) => isRelative(r.url))
    expect(relative.some((r) => r.kind === 'src')).toBe(true)
    expect(relative.some((r) => r.kind === 'srcset')).toBe(true)
    expect(relative.some((r) => r.kind === 'href')).toBe(true)
    expect(relative.some((r) => r.kind === 'markdown-link')).toBe(true)
    // every relative reference, plus the version and engines badges reading main's package.json
    expect(packedReadmeProblems(md, SLUG, REF).length).toBe(relative.length + 2)
    const objectType = (p: string): 'blob' | 'tree' => {
      const abs = resolve(ROOT, p)
      if (!existsSync(abs)) throw new Error(`${name}: "${p}" does not exist`)
      return statSync(abs).isDirectory() ? 'tree' : 'blob'
    }
    const { text, paths } = pin(md, objectType)
    expect(paths.filter((p) => p.kind !== 'embedded').length).toBe(relative.length)
    // H-2: the version and engines badges read package.json at the release ref.
    expect(paths.filter((p) => p.kind === 'embedded')).toEqual([{ path: 'package.json', kind: 'embedded' }, { path: 'package.json', kind: 'embedded' }])
    const encodedMain = `url=${encodeURIComponent(`https://raw.githubusercontent.com/${SLUG}/main/package.json`)}`
    const encodedRef = `url=${encodeURIComponent(`https://raw.githubusercontent.com/${SLUG}/${REF}/package.json`)}`
    expect(md.split(encodedMain).length - 1).toBe(2)
    expect(text).not.toContain(encodedMain)
    expect(text.split(encodedRef).length - 1).toBe(2)
    // The CI badge keeps following main, untouched.
    const ci = md.split('\n').find((l) => l.includes('actions/workflow/status'))!
    expect(ci).toContain('ci.yml?branch=main')
    expect(text.split('\n')).toContain(ci)
    expect(packedReadmeProblems(text, SLUG, REF)).toEqual([])
    expect(text.split('\n').length).toBe(md.split('\n').length)
    const unpinned = text.replaceAll(RAW, '').replaceAll(BLOB, '').replaceAll(TREE, '').replaceAll(encodedRef, encodedMain)
    expect(unpinned).toBe(md.replace(/((?:src|srcset|href)="|\]\()\.\//g, '$1'))
  })

  it('H-2: pins this repo\'s main/HEAD inside encoded (nested, multi-level) URLs; the CI badge stays on main', () => {
    const raw = (ref: string) => `https://raw.githubusercontent.com/${SLUG}/${ref}/package.json`
    const once = (ref: string) => `https://img.shields.io/badge/dynamic/json?url=${encodeURIComponent(raw(ref))}&query=%24.version&label=version`
    const twice = (ref: string) => `https://example.com/proxy?u=${encodeURIComponent(once(ref))}`
    const ciShields = `https://img.shields.io/github/actions/workflow/status/${SLUG}/ci.yml?branch=main&style=flat-square&label=CI`
    const ciGithub = `https://github.com/${SLUG}/actions/workflows/ci.yml/badge.svg?branch=main`
    const md = [
      `<img alt="v" src="${once('main')}"> <img src="${twice('HEAD')}">`,
      `<img alt="CI" src="${ciShields}"> ![CI](${ciGithub})`,
      `[lic](https://github.com/${SLUG}/blob/main/LICENSE) <img src="${raw('main')}">`,
      `<img src="https://img.shields.io/badge/dynamic/json?url=${encodeURIComponent('https://raw.githubusercontent.com/other/repo/main/package.json')}">`,
    ].join('\n')
    const files = new Set(['package.json', 'LICENSE'])
    const { text, paths } = pin(md, (p) => { if (!files.has(p)) throw new Error(`"${p}" missing`); return 'blob' })
    expect(text).toBe([
      `<img alt="v" src="${once(REF)}"> <img src="${twice(REF)}">`,
      `<img alt="CI" src="${ciShields}"> ![CI](${ciGithub})`,
      `[lic](${BLOB}LICENSE) <img src="${raw(REF)}">`,
      md.split('\n')[3],
    ].join('\n'))
    expect(paths.map((p) => p.path)).toEqual(['package.json', 'package.json', 'package.json', 'LICENSE']) // HTML tags first, then Markdown
    expect(packedReadmeProblems(text, SLUG, REF)).toEqual([])
    expect(pin(text).text).toBe(text) // idempotent
    expect(decodings(twice('main')).at(-1)).toContain(raw('main'))
  })

  it('H-2: the check decodes URLs and still blocks every other main/HEAD/other-ref reference; only the CI badge is allowed', () => {
    const enc = encodeURIComponent
    const raw = (ref: string) => `https://raw.githubusercontent.com/${SLUG}/${ref}/package.json`
    const ciShields = `https://img.shields.io/github/actions/workflow/status/${SLUG}/ci.yml?branch=main&style=flat-square&label=CI`
    const ok = [
      `<img src="${ciShields}">`,
      `![CI](https://github.com/${SLUG}/actions/workflows/ci.yml/badge.svg?branch=main)`,
      `<a href="https://github.com/${SLUG}/actions/workflows/ci.yml">CI</a>`,
      `<img src="https://img.shields.io/badge/dynamic/json?url=${enc(raw(REF))}&query=%24.version">`,
    ]
    expect(packedReadmeProblems(ok.join('\n'), SLUG, REF)).toEqual([])
    const bad = [
      `<img src="https://img.shields.io/badge/dynamic/json?url=${enc(raw('main'))}&query=%24.version">`,
      `<img src="https://x.example/p?u=${enc(`https://img.shields.io/badge/dynamic/json?url=${enc(raw('HEAD'))}`)}">`,
      `<img src="https://img.shields.io/badge/dynamic/json?url=${enc(raw('v0.2.0'))}">`,
      `<img src="https://raw.githubusercontent.com/${SLUG}/refs/heads/main/docs/a.png">`,
      `<img src="https://img.shields.io/github/package-json/v/${SLUG}/main">`,
      `<img src="https://cdn.jsdelivr.net/gh/${SLUG}@main/docs/a.png">`,
      `<img src="https://img.shields.io/github/actions/workflow/status/${SLUG}/release.yml?branch=main">`,
      `<a href="${ciShields}">not an image</a>`,
      `<img src="${ciShields}&x=${enc(raw('main'))}">`,
    ]
    const problems = packedReadmeProblems(bad.join('\n'), SLUG, REF)
    expect(problems.map((p) => p.split(':')[0])).toEqual(bad.map((_, i) => `line ${i + 1}`))
    expect(problems.slice(0, 4).every((p) => p.endsWith(`is not pinned to ${REF}`))).toBe(true)
    expect(problems.slice(4, 8).every((p) => p.endsWith(`points at main/HEAD of ${SLUG}`))).toBe(true)
    expect(isCiBadge('src', ciShields, SLUG)).toBe(true)
    expect(isCiBadge('href', ciShields, SLUG)).toBe(false)
    expect(isCiBadge('src', ciShields.replace(SLUG, 'other/repo'), SLUG)).toBe(false)
  })

  it('package.json: pack:npm runs the script, prepublishOnly refuses a directory publish', () => {
    expect(pkg.scripts['pack:npm']).toBe('node scripts/pack-npm.mjs')
    expect(pkg.scripts.prepublishOnly).toMatch(/process\.exit\(1\)/)
    expect(pkg.scripts.prepublishOnly).toContain('npm publish <tgz> --ignore-scripts')
    expect(pkg.scripts.prepare).toBeUndefined()
  })
})

// The CLI imports a .ts module, which needs Node >= 22.18 (CI's Node 20 job skips this).
const tsImports = nodeVersionProblem(process.versions.node) === ''

describe('pack-npm.mjs Node version gate (H-3)', () => {
  it('nodeVersionProblem: 22.18+, 23.6+ and 24+ pass; older ones get a plain message', () => {
    for (const v of ['22.18.0', '22.20.1', '23.6.0', '24.0.0', '24.22.1', '26.1.0']) expect(nodeVersionProblem(v)).toBe('')
    for (const v of ['20.3.0', '20.19.5', '22.0.0', '22.17.9', '23.5.0', '18.20.8']) {
      expect(nodeVersionProblem(v)).toBe(`pack:npm 需要 Node >= 22.18，当前 ${v} / pack:npm needs Node >= 22.18 (it imports a .ts module); this is ${v}`)
    }
  })

  it('checks the version before any .ts import (the .ts module is imported dynamically after the gate)', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/pack-npm.mjs'), 'utf8')
    expect(src).not.toMatch(/^import [^\n]*\.ts['"]/m)
    const gate = src.indexOf('nodeVersionProblem(process.versions.node)')
    expect(gate).toBeGreaterThan(0)
    expect(src.indexOf("await import('./npm-readme.ts')")).toBeGreaterThan(gate)
    expect(src.slice(gate, src.indexOf("await import('./npm-readme.ts')"))).toContain('process.exit(1)')
  })

  it.skipIf(tsImports)('on this Node (< 22.18) the CLI prints the version message and exits 1', () => {
    const r = spawnSync(process.execPath, ['scripts/pack-npm.mjs', '--ref', REF], { cwd: ROOT, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr.trim()).toBe(nodeVersionProblem(process.versions.node))
  })
})

describe.skipIf(!tsImports)('pack-npm.mjs --verify', () => {
  let dir = ''
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'npm-readme-test-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const tgz = (label: string, readme: string) => {
    const root = join(dir, label)
    mkdirSync(join(root, 'package'), { recursive: true })
    writeFileSync(join(root, 'package', 'README.md'), readme)
    writeFileSync(join(root, 'package', 'README.en.md'), readme)
    const file = join(dir, `${label}.tgz`)
    execFileSync('tar', ['-czf', file, '-C', root, 'package'])
    return file
  }
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/pack-npm.mjs', ...args], { cwd: ROOT, encoding: 'utf8' })

  it('exits 0 and prints the sha512 for a fully pinned README', () => {
    const r = run('--verify', tgz('ok', `<img src="${RAW}docs/a.png"> [l](${BLOB}LICENSE)\n`), '--ref', REF)
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/integrity sha512-[A-Za-z0-9+/]+=*\n/)
  })

  it.each([
    ['relative image', '<img src="docs/a.png">', /relative src "docs\/a\.png"/],
    ['relative srcset', `<img src="${RAW}a.png"><source srcset="docs/d.png">`, /relative srcset/],
    ['relative href', `<img src="${RAW}a.png"> <a href="./README.en.md">en</a>`, /relative href/],
    ['relative Markdown link', `<img src="${RAW}a.png"> [MIT](LICENSE)`, /relative markdown-link "LICENSE"/],
    ['another ref', `<img src="${rawBase(SLUG, 'main')}a.png">`, /not pinned to v0\.2\.1/],
  ])('exits 1 (not a warning) on a %s', (label, readme, message) => {
    const r = run('--verify', tgz(label.replace(/\W/g, '-'), `${readme}\n`), '--ref', REF)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(message)
    expect(r.stdout).toBe('')
  })

  it('exits 1 on bad arguments', () => {
    expect(run('--verify', 'x.tgz').status).toBe(1)
    expect(run('--ref', REF, '--bogus', '1').stderr).toMatch(/unknown argument --bogus/)
    expect(run('--ref', REF, '--commit', 'HEAD').stderr).toMatch(/--commit only goes with --verify/)
  })
})

// H-1: a real pack of HEAD (in a throwaway clone, so the check does not depend on a
// clean working tree here), then tampered copies of it. Each must fail --verify --commit.
describe.skipIf(!tsImports)('pack-npm.mjs --verify --commit (whole tarball)', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  let dir = ''
  let clone = ''
  let good = ''
  const cli = (...args: string[]) => spawnSync(process.execPath, [resolve(ROOT, 'scripts/pack-npm.mjs'), ...args], { cwd: clone, encoding: 'utf8' })
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'npm-verify-test-'))
    clone = join(dir, 'clone')
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', ROOT, clone])
    execFileSync('git', ['-C', clone, 'checkout', '--quiet', '--detach', head])
    const r = cli('--ref', head, '--out', join(dir, 'out'))
    if (r.status !== 0) throw new Error(`pack failed: ${r.stderr}`)
    const { version } = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')) as { version: string }
    good = join(dir, 'out', `dsh-pindou-${version}.tgz`)
  }, 120_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  /** The good tarball unpacked, changed by `edit`, packed again. */
  const tampered = (label: string, edit: (pkg: string) => void) => {
    const root = join(dir, label)
    mkdirSync(root)
    execFileSync('tar', ['-xzf', good, '-C', root])
    edit(join(root, 'package'))
    const file = join(dir, `${label}.tgz`)
    execFileSync('tar', ['-czf', file, '-C', root, 'package'])
    return file
  }

  it('the real pack verifies: file list and bytes match the commit', () => {
    const r = cli('--verify', good, '--ref', head, '--commit', head)
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\d+ files: list and bytes match commit [0-9a-f]{40}/)
  }, 60_000)

  it.each([
    ['a changed lib file', (p: string) => appendFileSync(join(p, 'lib/index.js'), '\n// x\n'), /content differs[\s\S]*lib\/index\.js/],
    ['an extra file', (p: string) => writeFileSync(join(p, 'lib/extra.js'), 'export {}\n'), /extra: {3}lib\/extra\.js/],
    ['a removed file', (p: string) => unlinkSync(join(p, 'CHANGELOG.md')), /missing: CHANGELOG\.md/],
    ['a changed package.json', (p: string) => {
      const f = join(p, 'package.json')
      writeFileSync(f, readFileSync(f, 'utf8').replace('"sideEffects": false', '"sideEffects": true'))
    }, /content differs[\s\S]*package\.json/],
    ['a changed README (still pinned)', (p: string) => appendFileSync(join(p, 'README.en.md'), '\nextra line\n'), /content differs[\s\S]*README\.en\.md/],
    ['a file swapped for a symlink', (p: string) => {
      cpSync(join(p, 'LICENSE'), join(p, 'LICENSE.bak'))
      unlinkSync(join(p, 'LICENSE'))
      execFileSync('ln', ['-s', 'LICENSE.bak', join(p, 'LICENSE')])
      unlinkSync(join(p, 'LICENSE.bak'))
    }, /LICENSE is not a regular file|content differs/],
  ])('exits 1 on %s', (label, edit, message) => {
    const r = cli('--verify', tampered(label.replace(/\W+/g, '-'), edit), '--ref', head, '--commit', head)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(message)
    expect(r.stdout).toBe('')
  }, 60_000)
})
