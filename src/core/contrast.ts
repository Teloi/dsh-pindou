/**
 * WCAG contrast helpers, used for the target ghost dots on the dark board
 * (design N10): every one of the 16 colours must stand out at least 3:1
 * (WCAG 1.4.11, non-text) from the board behind it. Only GHOST_RINGS ships
 * in the panel; the helpers are for tests and for recomputing the table.
 */
/** The dark board colour (`--pd-board` under the host dark theme; styles.test keeps them equal). */
export const DARK_BOARD = '#1C1D20'
/** What the ghost ring aims for: 3:1 is the floor, a little headroom against rounding and antialiasing. */
export const GHOST_RING_TARGET = 3.2

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const toHex = (c: readonly number[]): string => `#${c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()}`

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** `a` mixed toward `b` by `t` (0..1) in sRGB, like CSS color-mix(in srgb). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b)
  return toHex(x.map((v, i) => v + (y[i]! - v) * t))
}

/**
 * The ring drawn round a ghost dot on the dark board, as quiet as the rule
 * allows: the colour (lifted toward white when even the full colour is too
 * dark, so black becomes a mid grey and navy a lighter blue) faded into the
 * board just to the target. Every ring ends up near 3.2:1, so no colour's
 * guide shouts louder than another's and the hue still reads.
 */
export function ghostRing(hex: string, board = DARK_BOARD, target = GHOST_RING_TARGET): string {
  let lifted = '#FFFFFF'
  for (let i = 0; i <= 100; i++) {
    const c = mix(hex, '#FFFFFF', i / 100)
    if (contrast(c, board) >= target) { lifted = c; break }
  }
  for (let i = 0; i <= 100; i++) {
    const c = mix(board, lifted, i / 100)
    if (contrast(c, board) >= target) return c
  }
  return lifted
}

/**
 * Ring colour per palette index: `ghostRing(PALETTE[i].hex)`, written out so
 * the panel bundle carries 16 strings rather than the solver (styles.test
 * recomputes it and checks every ring against the board).
 */
export const GHOST_RINGS: readonly string[] = Object.freeze([
  '#6D6D6C', '#746D57', '#816A28', '#9B5E22', '#CA3139', '#8C6074', '#8558AE', '#4E6AAE',
  '#43718F', '#217871', '#357A3F', '#5E7343', '#8E6248', '#83674E', '#696C72', '#6B6C6F',
])
