// Designer recheck P3: the 208² cold-cache fill is written down as a known limitation of 0.3.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

describe('docs for v0.3 (designer recheck P3)', () => {
  it('the 0.3.0 known limitations name the 208² first zoom-in fill, in both languages', () => {
    const v03 = changelog.slice(changelog.indexOf('## [0.3.0]'), changelog.indexOf('## [0.2.1]'))
    expect(v03).toContain('### Known limitations (0.3, big boards)')
    expect(v03).toContain('208² 首次放大冷缓存补齐约 228–385 ms，补齐前每格显示正确纯色，没有空白和接缝')
    expect(v03).toMatch(/about 228–385 ms .* never a blank area and never a seam/s)
  })
})
