/**
 * WCAG contrast helpers, used for the target ghost dots on both boards
 * (design N10 for dark, spec §18.5 / O3 for light): every one of the 16
 * colours must stand out at least 3:1 (WCAG 1.4.11, non-text) from the board
 * behind it. Only the two ring tables ship in the panel; the helpers are for
 * tests and for recomputing the tables.
 */
/** The dark board colour (`--pd-board` under the host dark theme; styles.test keeps them equal). */
export const DARK_BOARD = '#1c1d20'
/** The light board colour (`--pd-board` under the light theme; styles.test keeps them equal). */
export const LIGHT_BOARD = '#eef0f3'
/** Ink a light-board ring darkens toward (the `--pd-ink` fallback in spec §18.5). */
export const INK = '#0f1115'
/** What the ghost ring aims for: 3:1 is the floor, a little headroom against rounding and antialiasing. */
export const GHOST_RING_TARGET = 3.2

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1, 7), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const toHex = (c: readonly number[]): string => `#${c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`

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
 * The ring drawn round a ghost dot, as quiet as the rule allows. The colour
 * is first pushed away from the board until even the full colour reaches the
 * target: toward white on a dark board (black becomes a mid grey, navy a
 * lighter blue), toward ink on a light one (white becomes a grey, cream a
 * warm grey, yellow an olive). Then it is faded into the board just to the
 * target, so every ring ends up near 3.2:1, no colour's guide shouts louder
 * than another's and the hue still reads.
 */
export function ghostRing(hex: string, board = DARK_BOARD, target = GHOST_RING_TARGET): string {
  const away = contrast('#ffffff', board) >= contrast(INK, board) ? '#ffffff' : INK
  let lifted = away
  for (let i = 0; i <= 100; i++) {
    const c = mix(hex, away, i / 100)
    if (contrast(c, board) >= target) { lifted = c; break }
  }
  for (let i = 0; i <= 100; i++) {
    const c = mix(board, lifted, i / 100)
    if (contrast(c, board) >= target) return c
  }
  return lifted
}

/**
 * Ring colour per palette index on the dark board: `ghostRing(PALETTE[i].hex)`,
 * written out so the panel bundle carries 16 strings rather than the solver
 * (styles.test recomputes it and checks every ring against the board).
 */
export const GHOST_RINGS: readonly string[] = Object.freeze([
  '#6d6d6c', '#746d57', '#816a28', '#9b5e22', '#ca3139', '#8c6074', '#8558ae', '#4e6aae',
  '#43718f', '#217871', '#357a3f', '#5e7343', '#8e6248', '#83674e', '#696c72', '#6b6c6f',
])

/** The same on the light board: `ghostRing(PALETTE[i].hex, LIGHT_BOARD)`. */
export const GHOST_RINGS_LIGHT: readonly string[] = Object.freeze([
  '#858584', '#8f8568', '#a18227', '#c17223', '#dc5b62', '#b0748e', '#9b74c0', '#6d84bb',
  '#4e8cb3', '#21958a', '#3e974a', '#728e4b', '#a17d68', '#a37e5b', '#82868c', '#848589',
])
