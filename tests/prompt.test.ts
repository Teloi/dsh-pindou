import { describe, expect, it } from 'vitest'
import { MAX_PROMPT_CHARS, promptKey, sanitizePrompt, systemPrompt, translate, userPrompt, zh, en } from '../src/core/index.ts'

describe('prompt', () => {
  it('keeps the system prompt minimal and complete', () => {
    const s = systemPrompt(16)
    expect(s).toContain('16x16')
    expect(s).toContain('f=black')
    expect(s.length).toBeLessThan(420)
  })

  it('sanitizes subjects', () => {
    expect(sanitizePrompt('  一只\u0000小猫\u202e  ')).toBe('一只 小猫')
    expect([...sanitizePrompt('猫'.repeat(500))]).toHaveLength(MAX_PROMPT_CHARS)
    expect(sanitizePrompt(42)).toBe('')
    expect(userPrompt('a "cat"')).toBe('Subject: "a "cat""')
  })

  it('builds stable cache keys', () => {
    expect(promptKey(' A  Cat ', 16)).toBe(promptKey('a cat', 16))
    expect(promptKey('a cat', 12)).not.toBe(promptKey('a cat', 16))
  })
})

describe('i18n', () => {
  it('has the same keys in zh and en', () => {
    expect(Object.keys(en).toSorted()).toEqual(Object.keys(zh).toSorted())
  })

  it('substitutes parameters', () => {
    expect(translate('zh', 'templateProgress', { percent: 42 })).toBe('完成 42%')
    expect(translate('en', 'boardLabel', { size: 16 })).toBe('16×16 bead board')
  })
})
