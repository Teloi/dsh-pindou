import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { githubSlug, isRelative, packedReadmeProblems, pinReadme, rawBase, readmeRefs, repoPath, webBase } from '../scripts/npm-readme.ts'

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
    expect(packedReadmeProblems(md, SLUG, REF).length).toBe(relative.length)
    const objectType = (p: string): 'blob' | 'tree' => {
      const abs = resolve(ROOT, p)
      if (!existsSync(abs)) throw new Error(`${name}: "${p}" does not exist`)
      return statSync(abs).isDirectory() ? 'tree' : 'blob'
    }
    const { text, paths } = pin(md, objectType)
    expect(paths.length).toBe(relative.length)
    expect(packedReadmeProblems(text, SLUG, REF)).toEqual([])
    expect(text.split('\n').length).toBe(md.split('\n').length)
    const unpinned = text.replaceAll(RAW, '').replaceAll(BLOB, '').replaceAll(TREE, '')
    expect(unpinned).toBe(md.replace(/((?:src|srcset|href)="|\]\()\.\//g, '$1'))
  })

  it('package.json: pack:npm runs the script, prepublishOnly refuses a directory publish', () => {
    expect(pkg.scripts['pack:npm']).toBe('node scripts/pack-npm.mjs')
    expect(pkg.scripts.prepublishOnly).toMatch(/process\.exit\(1\)/)
    expect(pkg.scripts.prepublishOnly).toContain('npm publish <tgz> --ignore-scripts')
    expect(pkg.scripts.prepare).toBeUndefined()
  })
})

// The CLI imports a .ts module, which needs Node >= 22.18 (CI's Node 20 job skips this).
const [major, minor] = process.versions.node.split('.').map(Number) as [number, number]
const tsImports = major > 22 || (major === 22 && minor >= 18)

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
