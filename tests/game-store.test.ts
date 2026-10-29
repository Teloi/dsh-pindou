import { describe, expect, it, vi } from 'vitest'
import { createBoard, EMPTY, encode, findTemplate, getCell, SafeStore, setCell, STORAGE_KEY, type GenerateResponse, type StorageLike } from '../src/core/index.ts'
import { AI_COOLDOWN_MS, DONE_DELAY_MS, entryDot, GameStore, IRON_MS, resolveTarget, type GameApi } from '../src/client/game-store.ts'

function mem(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

function make(opts: { api?: GameApi; reduced?: boolean; backend?: StorageLike } = {}) {
  let now = 1_000_000
  const timers: Array<{ fn: () => void; at: number }> = []
  const backend = opts.backend ?? mem()
  const store = new GameStore({
    store: new SafeStore(backend),
    api: opts.api,
    now: () => now,
    reducedMotion: () => opts.reduced ?? false,
    setTimeout: (fn, ms) => { const t = { fn, at: now + ms }; timers.push(t); return t },
    clearTimeout: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1) },
  })
  const advance = (ms: number): void => {
    now += ms
    for (const t of [...timers].filter(x => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn() }
  }
  return { store, advance, backend }
}

describe('GameStore', () => {
  it('paints a dragged line as one undo step and erases with right-click override', () => {
    const { store } = make()
    store.startFree()
    store.setColor(4)
    store.strokeStart(0, 0)
    store.strokeMove(3, 0)
    store.strokeEnd()
    expect([0, 1, 2, 3].map(x => getCell(store.board, x, 0))).toEqual([4, 4, 4, 4])
    store.strokeStart(1, 0, 'erase')
    store.strokeEnd()
    expect(getCell(store.board, 1, 0)).toBe(EMPTY)
    store.undo()
    expect(getCell(store.board, 1, 0)).toBe(4)
    store.undo()
    expect(getCell(store.board, 0, 0)).toBe(EMPTY)
    store.redo()
    expect(getCell(store.board, 2, 0)).toBe(4)
  })

  it('picks and fills', () => {
    const { store } = make()
    store.startFree()
    store.setColor(7)
    store.applyAt(2, 2)
    store.setColor(1)
    store.applyAt(2, 2, 'pick')
    expect(store.getSnapshot().color).toBe(7)
    store.setTool('fill')
    store.setColor(9)
    store.applyAt(0, 0)
    expect(getCell(store.board, 15, 15)).toBe(9)
    expect(getCell(store.board, 2, 2)).toBe(7)
  })

  it('clears with an undo toast', () => {
    const { store } = make()
    store.startFree()
    store.applyAt(1, 1)
    store.clear()
    expect(store.getSnapshot().toast).toMatchObject({ key: 'cleared', undo: true })
    store.undo()
    expect(getCell(store.board, 1, 1)).not.toBe(EMPTY)
  })

  it('follows a template to completion, irons, records done and unirons', () => {
    const { store, advance } = make()
    store.follow('heart')
    const tpl = findTemplate('heart')!
    expect(store.getSnapshot()).toMatchObject({ mode: 'play', target: 'heart', overlay: 'coach' })
    store.dismissOverlay()
    expect(store.getSnapshot().coached).toBe(true)
    store.fillTarget()
    expect(encode(store.board)).toBe(encode(tpl.board))
    expect(store.getSnapshot()).toMatchObject({ complete: true, overlay: null, celebrateAt: null })
    advance(DONE_DELAY_MS)
    expect(store.getSnapshot().overlay).toBe('done')
    expect(store.getSnapshot().celebrateAt).toBeNull()
    store.iron()
    expect(store.locked).toBe(true)
    store.strokeStart(0, 0)
    expect(store.getSnapshot().toast?.key).toBe('locked')
    advance(IRON_MS)
    expect(store.getSnapshot()).toMatchObject({ ironed: true, overlay: 'result', done: ['heart'] })
    expect(store.getSnapshot().celebrateAt).not.toBeNull()
    store.unIron()
    expect(store.getSnapshot()).toMatchObject({ ironed: false, celebrateAt: null })
  })

  it('design I5: done card 260 ms after the last bead, confetti only after ironing (also free play)', () => {
    const { store, advance } = make()
    store.follow('heart')
    store.dismissOverlay()
    store.fillTarget()
    advance(DONE_DELAY_MS - 1)
    expect(store.getSnapshot().overlay).toBeNull()
    advance(1)
    expect(store.getSnapshot().overlay).toBe('done')
    // breaking the pattern before the delay cancels the card
    store.dismissOverlay()
    store.strokeStart(0, 0, 'erase'); store.strokeEnd()
    const t = findTemplate('heart')!
    const firstFilled = t.board.cells.findIndex(c => c !== EMPTY)
    const x = firstFilled % t.board.size, y = Math.floor(firstFilled / t.board.size)
    store.strokeStart(x, y, 'erase'); store.strokeEnd()
    expect(store.getSnapshot().complete).toBe(false)
    store.setColor(t.board.cells[firstFilled]!)
    store.strokeStart(x, y); store.strokeEnd()
    expect(store.getSnapshot().complete).toBe(true)
    store.strokeStart(x, y, 'erase'); store.strokeEnd()
    advance(DONE_DELAY_MS)
    expect(store.getSnapshot().overlay).toBeNull()

    const free = make()
    free.store.startFree()
    free.store.applyAt(0, 0)
    free.store.iron()
    expect(free.store.getSnapshot().celebrateAt).toBeNull()
    free.advance(IRON_MS)
    expect(free.store.getSnapshot().celebrateAt).not.toBeNull()
  })

  it('design I6: switching colour on a pattern stamps a pulse; same colour or free play does not', () => {
    const { store } = make()
    store.startFree()
    store.setColor(3)
    expect(store.getSnapshot().pulseAt).toBeNull()
    store.follow('heart')
    const before = store.getSnapshot().pulseAt
    store.setColor(store.getSnapshot().color === 4 ? 2 : 4)
    expect(store.getSnapshot().pulseAt).not.toBe(before)
    const stamp = store.getSnapshot().pulseAt
    store.setColor(store.getSnapshot().color)
    expect(store.getSnapshot().pulseAt).toBe(stamp)
  })

  it('irons immediately under reduced motion', () => {
    const { store } = make({ reduced: true })
    store.startFree()
    store.applyAt(0, 0)
    store.iron()
    expect(store.getSnapshot()).toMatchObject({ ironed: true, ironingSince: null, overlay: 'result' })
  })

  it('ignores out-of-bounds and rapid repeated input without corrupting history', () => {
    const { store } = make()
    store.startFree()
    store.strokeStart(-1, 99)
    store.strokeMove(5, 5)
    store.strokeEnd()
    expect(store.board.cells.every(c => c === EMPTY)).toBe(true)
    for (let i = 0; i < 500; i++) { store.strokeStart(i % 16, (i * 7) % 16); store.strokeMove((i * 3) % 40 - 10, i % 16); store.strokeEnd() }
    for (let i = 0; i < 500; i++) store.undo()
    expect(store.canUndo).toBe(false)
  })

  it('persists after the debounce and survives corrupt storage', () => {
    const backend = mem()
    const { store, advance } = make({ backend })
    store.startFree()
    store.applyAt(3, 3)
    expect(backend.data.has(STORAGE_KEY)).toBe(false)
    advance(400)
    expect(JSON.parse(backend.data.get(STORAGE_KEY)!).board).toContain('4')
    backend.data.set(STORAGE_KEY, '{"board":"<img src=x onerror=alert(1)>"')
    const again = make({ backend })
    expect(again.store.getSnapshot()).toMatchObject({ storage: 'recovered', toast: { key: 'storageRecovered' } })
  })

  it('resolves AI targets strictly', () => {
    const b = setCell(createBoard(12), 0, 0, 3)
    expect(resolveTarget(`ai:12:${encode(b)}`)?.size).toBe(12)
    expect(resolveTarget('ai:12:zz')).toBeNull()
    expect(resolveTarget('ai:13:...')).toBeNull()
    expect(resolveTarget('nope')).toBeNull()
  })
})

describe('GameStore AI', () => {
  const board = setCell(setCell(createBoard(12), 1, 1, 2), 2, 2, 4)
  const ok: GenerateResponse = { ok: true, size: 12, flat: encode(board), issues: [], repaired: true, usage: { input: 10, output: 20 }, model: 'm', finish: 'stop' } as GenerateResponse

  it('entry dot: busy while running, warm for unfinished work or a fresh AI result left unseen', async () => {
    const generate = vi.fn(async () => ok)
    const { store } = make({ api: { generate, status: async () => ({ configured: true, route: 'host' }) } })
    expect(entryDot(store.getSnapshot(), true)).toBe('busy')
    store.setPrefs({ busyHint: false })
    expect(entryDot(store.getSnapshot(), true)).toBe('busy')
    expect(entryDot(store.getSnapshot(), false)).toBeNull()
    // tab closed during generation: the result lands as fresh
    store.setAiSize(12); store.setAiPrompt('猫')
    await store.generate()
    expect(store.getSnapshot().fresh).toBe(true)
    expect(entryDot(store.getSnapshot(), false)).toBe('progress')
    store.setPanelVisible(true)
    expect(store.getSnapshot().fresh).toBe(false)
    expect(entryDot(store.getSnapshot(), false)).toBeNull()
    store.setPanelVisible(false)
    // free play with beads on the board counts as unfinished
    store.startFree(); store.applyAt(0, 0)
    expect(entryDot(store.getSnapshot(), false)).toBe('progress')
  })

  it('shows toasts with parameters and replaces the manual-save preview', () => {
    const { store } = make()
    store.showToast('exported', false, { name: 'a.png' })
    expect(store.getSnapshot().toast).toMatchObject({ key: 'exported', params: { name: 'a.png' } })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    store.setPreview({ url: 'blob:1', name: 'a.png' })
    store.setPreview(null)
    expect(revoke).toHaveBeenCalledWith('blob:1')
    expect(store.getSnapshot().preview).toBeNull()
    revoke.mockRestore()
  })

  it('generates, caches, and enforces the front-end cooldown', async () => {
    const generate = vi.fn(async () => ok)
    const { store, advance } = make({ api: { generate, status: async () => ({ configured: true, route: 'host' }) } })
    store.setAiSize(12)
    store.setAiPrompt('猫')
    await store.generate()
    expect(store.getSnapshot()).toMatchObject({ mode: 'play', ai: { phase: 'done', result: { repaired: true, cached: false } } })
    expect(store.getSnapshot().target).toMatch(/^ai:12:/)
    store.setAiPrompt('猫')
    await store.generate()
    expect(generate).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().ai.result?.cached).toBe(true)
    store.setAiPrompt('狗')
    await store.generate()
    expect(store.getSnapshot().ai).toMatchObject({ phase: 'error', error: 'rate' })
    advance(AI_COOLDOWN_MS)
    await store.generate()
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('rejects hostile or mismatched replies and maps errors', async () => {
    const replies: GenerateResponse[] = [
      { ...ok, flat: '<script>alert(1)</script>' } as GenerateResponse,
      { ...ok, size: 16 } as GenerateResponse,
      { ...ok, flat: '.'.repeat(144) } as GenerateResponse,
      { ok: false, error: 'not-configured' },
    ]
    const { store, advance } = make({ api: { generate: async () => replies.shift()!, status: async () => ({ configured: true, route: 'host' }) } })
    store.setAiSize(12)
    for (const want of ['parse', 'parse', 'parse', 'not-configured']) {
      store.setAiPrompt(`x${want}${replies.length}`)
      await store.generate()
      expect(store.getSnapshot().ai.error).toBe(want)
      advance(AI_COOLDOWN_MS)
    }
    expect(store.getSnapshot().mode).toBe('home')
  })

  it('design I3: a not-configured generation sticks until the user re-checks', async () => {
    const status = vi.fn(async () => ({ configured: true, route: 'host' as const, verified: false }))
    const generate = vi.fn(async (): Promise<GenerateResponse> => ({ ok: false, error: 'not-configured' }))
    const { store } = make({ api: { generate, status } })
    store.go('ai')
    await store.probeStatus()
    expect(store.getSnapshot().ai.status).toMatchObject({ configured: true, verified: false })
    store.setAiPrompt('a cat')
    await store.generate()
    expect(store.getSnapshot().ai).toMatchObject({ error: 'not-configured', status: { configured: false } })
    // re-entering the AI page probes again, but the cached answer wins
    await store.probeStatus()
    expect(status).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().ai.status?.configured).toBe(false)
    // 「重新检测」 forces a fresh probe
    await store.probeStatus(true)
    expect(status).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().ai.status?.configured).toBe(true)
  })

  it('reports not-configured without an API and empty prompts', async () => {
    const { store } = make()
    await store.generate()
    expect(store.getSnapshot().ai.error).toBe('empty')
    store.setAiPrompt('hi')
    await store.generate()
    expect(store.getSnapshot().ai.error).toBe('not-configured')
  })

  it('cancels an in-flight generation', async () => {
    let seen: AbortSignal | undefined
    const { store } = make({ api: { generate: (_b, signal) => { seen = signal; return new Promise(() => {}) }, status: async () => ({ configured: true, route: 'host' }) } })
    store.setAiPrompt('cat')
    void store.generate()
    expect(store.getSnapshot().ai.phase).toBe('loading')
    store.cancelGenerate()
    expect(seen?.aborted).toBe(true)
    expect(store.getSnapshot().ai.phase).toBe('idle')
  })
})
