// "Perler" is a trademark: the repo says "bead" instead (PR #8 changed the READMEs; this keeps it that way).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
// Every tracked file that is not a known binary is read as text, so new text types (html, css, svg, txt…) are covered too.
const BINARY = /\.(?:png|gif|jpe?g|webp|ico|woff2?|ttf|zip|gz|tgz|pdf)$/i
const self = 'tests/wording.test.ts'
const brand = new RegExp(['per', 'ler'].join(''), 'i')

describe('trademark wording', () => {
  it('no tracked text file uses the brand name', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
      .filter(f => f && f !== self && !BINARY.test(f))
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter(f => brand.test(readFileSync(new URL(f, root), 'utf8')))).toEqual([])
  })
})
