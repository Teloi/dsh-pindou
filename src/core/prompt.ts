import type { BoardSize } from './board.ts'
import { PALETTE } from './palette.ts'

/** Longest subject we send to the model (characters, after cleaning). */
export const MAX_PROMPT_CHARS = 60

/**
 * Clean a user subject: drop control and formatting characters, collapse
 * whitespace, cap the length. Returns '' when nothing usable is left.
 */
export function sanitizePrompt(input: unknown): string {
  if (typeof input !== 'string') return ''
  const cleaned = input
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...cleaned].slice(0, MAX_PROMPT_CHARS).join('')
}

/** Cache key: case/space-insensitive subject plus board size. */
export function promptKey(prompt: string, size: BoardSize): string {
  return `${size}:${sanitizePrompt(prompt).toLowerCase()}`
}

const PALETTE_LINE = PALETTE.map(c => `${c.code}=${c.en.toLowerCase()}`).join(' ')

/**
 * The whole system prompt. Deliberately tiny: the answer is a fixed-shape grid,
 * so every token of instruction is pure cost.
 */
export function systemPrompt(size: BoardSize): string {
  return [
    `Draw pixel art for a ${size}x${size} bead board.`,
    `Colors: ${PALETTE_LINE}. Use . for empty.`,
    `Reply with exactly ${size} lines of ${size} characters, nothing else.`,
    'Center one bold, simple subject; outline it; keep the background empty.',
  ].join('\n')
}

/** The user turn: only the subject, quoted, so stray instructions read as a subject. */
export function userPrompt(subject: string): string {
  return `Subject: "${sanitizePrompt(subject)}"`
}

/** Output characters the grid needs (with newlines); used to sanity-check token caps. */
export function gridChars(size: BoardSize): number {
  return size * (size + 1)
}
