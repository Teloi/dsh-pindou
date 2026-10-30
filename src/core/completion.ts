import type { Board } from './board.ts'
import { EMPTY } from './palette.ts'

export interface Completion {
  /** Template cells that hold the right colour. */
  readonly matched: number
  /** Non-empty cells in the template. */
  readonly total: number
  /** Board cells that disagree with the template (wrong colour, or a bead where none belongs). */
  readonly wrong: number
  /** 0–100, floor of matched/total; 100 only when everything matches and nothing is wrong. */
  readonly percent: number
  readonly done: boolean
}

export function completion(board: Board, target: Board): Completion {
  if (board.size !== target.size) return { matched: 0, total: 0, wrong: 0, percent: 0, done: false }
  let matched = 0
  let total = 0
  let wrong = 0
  for (let i = 0; i < target.cells.length; i++) {
    const want = target.cells[i]!
    const have = board.cells[i]!
    if (want !== EMPTY) {
      total++
      if (have === want) matched++
      else if (have !== EMPTY) wrong++
    } else if (have !== EMPTY) {
      wrong++
    }
  }
  const done = total > 0 && matched === total && wrong === 0
  const raw = total === 0 ? 0 : Math.floor((matched / total) * 100)
  const percent = done ? 100 : Math.min(raw, 99)
  return { matched, total, wrong, percent, done }
}

/** Colours a template uses, most frequent first. */
export function templateColors(target: Board): number[] {
  const counts = new Map<number, number>()
  for (const c of target.cells) if (c !== EMPTY) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c)
}

/** Remaining cells per colour, for "what's left" hints. */
export function remainingByColor(board: Board, target: Board): Map<number, number> {
  const out = new Map<number, number>()
  if (board.size !== target.size) return out
  target.cells.forEach((want, i) => {
    if (want !== EMPTY && board.cells[i] !== want) out.set(want, (out.get(want) ?? 0) + 1)
  })
  return out
}
