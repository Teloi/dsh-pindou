// Audit R-5: the v0.2 features, their storage key and the picture privacy note are documented,
// and the version in package.json is the newest released one in the changelog.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WORKS_KEY } from '../src/core/works.ts'
import { STORAGE_KEY } from '../src/core/storage.ts'

const read = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const changelog = read('CHANGELOG.md')
const pkg = JSON.parse(read('package.json')) as { version: string }

describe('docs for v0.2 (audit R-5)', () => {
  it('package.json is 0.2.1 and the changelog has its section, newest release first', () => {
    expect(pkg.version).toBe('0.2.1')
    const released = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(m => m[1])
    expect(released[0]).toBe(pkg.version)
  })

  it('the 0.2.0 section names the features, the new key, the chunks and the privacy rule; F1 is listed as moved', () => {
    const v02 = changelog.slice(changelog.indexOf('## [0.2.0]'), changelog.indexOf('## [0.1.0]'))
    for (const s of ['Picture to pattern', 'My works', `\`${WORKS_KEY}\``, 'never kept', 'no network request', 'require.async', 'client.picture.js', 'client.works.js']) expect(v02).toContain(s)
    expect(changelog.slice(0, changelog.indexOf('## [0.2.0]'))).toMatch(/Daily pattern[\s\S]*`f1` branch/)
  })

  it.each([
    ['README.md', ['图片转图纸', '我的作品', '图片只在本机处理，不会上传', '原图不保存']],
    ['README.en.md', ['Picture to pattern', 'My works', 'never uploaded', 'original picture is not kept']],
  ])('%s describes both features, both storage keys and the privacy note', (f, words) => {
    const text = read(f)
    for (const w of [...words, `\`${WORKS_KEY}\``, `\`${STORAGE_KEY}\``]) expect(text).toContain(w)
    expect(text).not.toContain('e2e/.out')
  })
})
