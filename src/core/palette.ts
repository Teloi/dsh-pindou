/**
 * The 16 bead colours. Index = position in the compact encoding (`0`–`9`, `a`–`f`).
 * Hex values follow the designer's tokens (bead-break/tokens.css, `--bb-bead-*`):
 * they are physical bead colours and do not change with the host theme.
 */
export interface BeadColor {
  readonly code: string
  readonly hex: string
  readonly zh: string
  readonly en: string
}

export const PALETTE: readonly BeadColor[] = Object.freeze([
  { code: '0', hex: '#F6F4EE', zh: '白', en: 'White' },
  { code: '1', hex: '#F2DFA7', zh: '奶油', en: 'Cream' },
  { code: '2', hex: '#F7C531', zh: '黄', en: 'Yellow' },
  { code: '3', hex: '#F08A24', zh: '橙', en: 'Orange' },
  { code: '4', hex: '#D7333B', zh: '红', en: 'Red' },
  { code: '5', hex: '#F39DC1', zh: '粉', en: 'Pink' },
  { code: '6', hex: '#8A5BB5', zh: '紫', en: 'Purple' },
  { code: '7', hex: '#2D4FA0', zh: '藏青', en: 'Navy' },
  { code: '8', hex: '#62B6E9', zh: '天蓝', en: 'Sky' },
  { code: '9', hex: '#24A79A', zh: '青绿', en: 'Teal' },
  { code: 'a', hex: '#3E9C4A', zh: '绿', en: 'Green' },
  { code: 'b', hex: '#A9D46A', zh: '草绿', en: 'Lime' },
  { code: 'c', hex: '#87573A', zh: '棕', en: 'Brown' },
  { code: 'd', hex: '#D7A473', zh: '浅棕', en: 'Tan' },
  { code: 'e', hex: '#9DA1A8', zh: '灰', en: 'Gray' },
  { code: 'f', hex: '#26272B', zh: '黑', en: 'Black' },
])

export const COLOR_COUNT = PALETTE.length

/** Cell value for "no bead". */
export const EMPTY = -1

/** Convert a colour index to its encoding character ('.' for empty). */
export function codeOf(index: number): string {
  return index >= 0 && index < COLOR_COUNT ? PALETTE[index]!.code : '.'
}

/** Strict decode of one encoding character; undefined when not part of the alphabet. */
export function indexOfCode(ch: string): number | undefined {
  if (ch === '.') return EMPTY
  const n = Number.parseInt(ch, 16)
  return ch.length === 1 && /^[0-9a-f]$/.test(ch) ? n : undefined
}

export function isColorIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < COLOR_COUNT
}
