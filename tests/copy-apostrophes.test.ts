// English copy uses the curly apostrophe ’ everywhere (b3 S6: the SVG refusal said "isn't").
import { describe, expect, it } from 'vitest'
import { en } from '../src/core/i18n.ts'
import { PICTURE_STRINGS } from '../src/client/picture.tsx'
import { WORKS_STRINGS } from '../src/client/works.tsx'

const straight = (copy: Record<string, unknown>): string[] =>
  Object.entries(copy).filter(([, v]) => typeof v === 'string' && /\p{L}'\p{L}/u.test(v)).map(([k, v]) => `${k}: ${String(v)}`)

describe('b3 S6: no straight apostrophe inside an English word', () => {
  it('the entry copy', () => { expect(straight(en as Record<string, unknown>)).toEqual([]) })
  it('the picture chunk copy', () => { expect(straight(PICTURE_STRINGS.en)).toEqual([]) })
  it('the works chunk copy', () => { expect(straight(WORKS_STRINGS.en)).toEqual([]) })
})
