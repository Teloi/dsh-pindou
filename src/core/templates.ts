import type { Board } from './board.ts'
import { decode } from './codec.ts'

/**
 * Built-in 16×16 templates. Rows use the compact encoding (`.` empty, `0`–`f` palette index).
 * heart … terminal are adapted from the designer's working set (bead-break/_work/tpl.json);
 * star, flower, cherry, sun and ghost are original to this package.
 */
export interface TemplateDef {
  readonly id: string
  readonly zh: string
  readonly en: string
  readonly rows: readonly string[]
}

export const TEMPLATE_DEFS: readonly TemplateDef[] = Object.freeze([
  { id: 'heart', zh: '爱心', en: 'Heart', rows: [
    '................',
    '................',
    '..4444....4444..',
    '.444444..444444.',
    '.40044444444444.',
    '.40444444444444.',
    '.44444444444444.',
    '.44444444444444.',
    '..444444444444..',
    '...4444444444...',
    '....44444444....',
    '.....444444.....',
    '......4444......',
    '.......44.......',
    '................',
    '................',
  ] },
  { id: 'whale', zh: '小鲸鱼', en: 'Little Whale', rows: [
    '................',
    '.....8.8........',
    '......8.........',
    '....77777.......',
    '..777777777..77.',
    '.77777777777.77.',
    '.77f77777777777.',
    '777777777777777.',
    '755777777777777.',
    '788888777777777.',
    '.8888888877777..',
    '..88888888777...',
    '....8888777.....',
    '................',
    '.99..99..99..99.',
    '9..99..99..99..9',
  ] },
  { id: 'coffee', zh: '咖啡杯', en: 'Coffee Cup', rows: [
    '................',
    '.....e...e......',
    '....e...e.......',
    '.....e...e......',
    '....e...e.......',
    '................',
    '..eeeeeeeeee....',
    '..ecccccccce....',
    '..e00000000eee..',
    '..e00040400e.e..',
    '..e00044400e.e..',
    '..e00004000eee..',
    '...e000000e.....',
    '....eeeeee......',
    '.eeeeeeeeeeee...',
    '................',
  ] },
  { id: 'cat', zh: '橘猫', en: 'Orange Cat', rows: [
    '................',
    '................',
    '..33........33..',
    '..333......333..',
    '..353333333353..',
    '..333333333333..',
    '.33333333333333.',
    '.333f333333f333.',
    '.333f333333f333.',
    '.35333355333353.',
    '.333333ff333333.',
    '..333333333333..',
    '...3333333333...',
    '....33333333....',
    '................',
    '................',
  ] },
  { id: 'mushroom', zh: '蘑菇', en: 'Mushroom', rows: [
    '................',
    '.....444444.....',
    '...4444444444...',
    '..440044444004..',
    '.44400444444004.',
    '.44444440044444.',
    '.44444444444444.',
    '..444444444444..',
    '....11111111....',
    '...1111111111...',
    '...11f1111f11...',
    '...1511111151...',
    '...1111ff1111...',
    '....11111111....',
    '................',
    '................',
  ] },
  { id: 'star', zh: '星星', en: 'Star', rows: [
    '................',
    '.......22.......',
    '.......22.......',
    '......2222......',
    '......2222......',
    '.22222222222222.',
    '..222222222222..',
    '...222f22f222...',
    '....22522522....',
    '....22222222....',
    '...2222222222...',
    '...2222..2222...',
    '..2222....2222..',
    '..222......222..',
    '.22..........22.',
    '................',
  ] },
  { id: 'flower', zh: '小花', en: 'Flower', rows: [
    '................',
    '......5555......',
    '....55555555....',
    '...5555555555...',
    '..555552255555..',
    '..555522225555..',
    '..555522225555..',
    '..555552255555..',
    '...5555555555...',
    '....55555555....',
    '.......aa.......',
    '..bbb..aa.......',
    '..bbbb.aa..bbb..',
    '...bbbbaabbbb...',
    '.......aa.......',
    '....cccccccc....',
  ] },
  { id: 'cherry', zh: '樱桃', en: 'Cherry', rows: [
    '................',
    '..........aa....',
    '.........abb....',
    '........a.bbb...',
    '.......a...b....',
    '......a.a.......',
    '.....a...a......',
    '....a.....a.....',
    '..4444...4444...',
    '.444404.444404..',
    '.444444.444444..',
    '.444444.444444..',
    '.444444.444444..',
    '..4444...4444...',
    '................',
    '................',
  ] },
  { id: 'sun', zh: '太阳', en: 'Sun', rows: [
    '................',
    '.......33.......',
    '..3....33....3..',
    '...3........3...',
    '.....222222.....',
    '....22222222....',
    '...2222222222...',
    '33.22f2222f22.33',
    '33.2222222222.33',
    '...2252222522...',
    '...2222ff2222...',
    '....22222222....',
    '.....222222.....',
    '...3........3...',
    '..3....33....3..',
    '.......33.......',
  ] },
  { id: 'ghost', zh: '小幽灵', en: 'Ghost', rows: [
    '................',
    '.....000000.....',
    '...0000000000...',
    '..000000000000..',
    '..00ff0000ff00..',
    '..00ff0000ff00..',
    '.00000000000000.',
    '.05500000000550.',
    '.00000000000000.',
    '.00000000000000.',
    '.00000000000000.',
    '.00000000000000.',
    '.00000000000000.',
    '.00.000..000.00.',
    '.0...0....0...0.',
    '................',
  ] },
  { id: 'invader', zh: '像素小怪', en: 'Pixel Alien', rows: [
    '................',
    '................',
    '................',
    '................',
    '....6.....6.....',
    '.....6...6......',
    '....6666666.....',
    '...66.666.66....',
    '..66666666666...',
    '..6.6666666.6...',
    '..6.6.....6.6...',
    '.....66.66......',
    '................',
    '................',
    '................',
    '................',
  ] },
  { id: 'terminal', zh: '终端 >_', en: 'Terminal', rows: [
    '................',
    '................',
    '.ee4e2eaeeeeeee.',
    '.ffffffffffffff.',
    '.ffffffffffffff.',
    '.ffafffffffffff.',
    '.fffaffffffffff.',
    '.ffffafffffffff.',
    '.fffaffffffffff.',
    '.ffafff0000ffff.',
    '.ffffffffffffff.',
    '.ffffffffffffff.',
    '.ffffffffffffff.',
    '.ffffffffffffff.',
    '................',
    '................',
  ] },
])

export interface Template extends TemplateDef {
  readonly board: Board
  /** Distinct colours used. */
  readonly colors: number
  /** Number of beads. */
  readonly beads: number
  /** 1–3 per the design spec: ≤2 colours and ≤120 beads is 1; ≥6 colours or 24×24 is 3; otherwise 2. */
  readonly difficulty: 1 | 2 | 3
}

/** Display order: the designer's list first, then the extra patterns. */
const ORDER = ['heart', 'invader', 'whale', 'coffee', 'mushroom', 'terminal', 'cat', 'star', 'cherry', 'flower', 'sun', 'ghost']

function build(def: TemplateDef): Template {
  const result = decode(def.rows.join(''), 16)
  if (!result.ok) throw new Error(`pindou: template ${def.id} is malformed (${result.error})`)
  const board = result.board
  const used = board.cells.filter(c => c >= 0)
  const colors = new Set(used).size
  const beads = used.length
  const difficulty = colors <= 2 && beads <= 120 ? 1 : colors >= 6 || board.size === 24 ? 3 : 2
  return { ...def, board, colors, beads, difficulty }
}

export const TEMPLATES: readonly Template[] = Object.freeze(
  TEMPLATE_DEFS.map(build).toSorted((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)),
)

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}
