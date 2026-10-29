// The works wall's own styles (lazy chunk). Real widths are measured in e2e (walkthrough).
import { describe, expect, it } from 'vitest'
import { WORKS_CSS } from '../src/client/works-styles.ts'

describe('the wall page on a wide panel (b4 suggestion)', () => {
  it('from 560 wide the view holding the wall gets the home page\'s 640, not the play column\'s 480 + padding', () => {
    expect(WORKS_CSS).toMatch(/@container pd \(min-width: 560px\)\{\.pd-view:has\(>\.pd-wall\)\{max-width:640px\}\}/)
  })
})
