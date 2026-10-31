// "Perler" is a trademark: the repo says "bead" instead (PR #8 changed the READMEs; this keeps it that way).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const TEXT = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|snap)$|^[^.]+$/
const self = 'tests/wording.test.ts'
const brand = new RegExp(['per', 'ler'].join(''), 'i')

describe('trademark wording', () => {
  it('no tracked text file uses the brand name', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
      .filter(f => f && f !== self && TEXT.test(f.split('/').pop()!))
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter(f => brand.test(readFileSync(new URL(f, root), 'utf8')))).toEqual([])
  })
})
