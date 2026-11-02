// Designer recheck P3: the 208² cold-cache fill is written down as a known limitation of 0.3.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

describe('docs for v0.3 (designer recheck P3)', () => {
  it('the unreleased known limitations name the 208² first zoom-in fill, in both languages', () => {
    const unreleased = changelog.slice(changelog.indexOf('## [Unreleased]'), changelog.search(/^## \[\d/m))
    expect(unreleased).toContain('### Known limitations (0.3, big boards)')
    expect(unreleased).toContain('208² 首次放大冷缓存补齐约 228–385 ms，补齐前每格显示正确纯色，没有空白和接缝')
    expect(unreleased).toMatch(/about 228–385 ms .* never a blank area and never a seam/s)
  })
})
