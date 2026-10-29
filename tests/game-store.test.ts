import { describe, expect, it, vi } from 'vitest'
import { createBoard, EMPTY, encode, findTemplate, getCell, SafeStore, setCell, STORAGE_KEY, TEMPLATES, type GenerateResponse, type StorageLike } from '../src/core/index.ts'
import { AI_COOLDOWN_MS, DONE_DELAY_MS, entryDot, GameStore, IRON_MS, MAX_KEPT_GAMES, resolveTarget, type GameApi } from '../src/client/game-store.ts'

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
    expect(store.getSnapshot()).toMatchObject({ mode: 'play', target: 'template:heart', overlay: 'coach' })
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

  it('resolves saved sources strictly', () => {
    const b = setCell(createBoard(12), 0, 0, 3)
    expect(resolveTarget('board:x1', encode(b), 12)?.size).toBe(12)
    expect(resolveTarget('board:x1', 'zz', 12)).toBeNull()
    expect(resolveTarget('board:x1', encode(b), 16)).toBeNull()
    expect(resolveTarget('board:x1', null, 12)).toBeNull()
    expect(resolveTarget('template:heart', null, 16)).toBe(findTemplate('heart')!.board)
    expect(resolveTarget('heart', null, 24)).toBeNull()
    expect(resolveTarget('template:nope', null, 24)).toBeNull()
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
    const tab = store.addPanel(() => true)
    tab.check()
    expect(store.getSnapshot().fresh).toBe(false)
    expect(entryDot(store.getSnapshot(), false)).toBeNull()
    tab.remove()
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
    expect(store.getSnapshot().target).toMatch(/^board:[a-z0-9]+$/)
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

/** Place the first `n` correct beads of the pattern being followed. */
function placeCorrect(store: GameStore, n: number): void {
  const target = store.getSnapshot().targetBoard!
  let placed = 0
  for (let i = 0; i < target.cells.length && placed < n; i++) {
    const c = target.cells[i]!
    if (c === EMPTY) continue
    store.setColor(c)
    store.applyAt(i % target.size, Math.floor(i / target.size))
    placed++
  }
}
const progress = (store: GameStore): number => {
  const s = store.getSnapshot()
  return s.targetBoard!.cells.filter((c, i) => c !== EMPTY && s.history.present.cells[i] === c).length
}

describe('N1 games (spec §4.3): picking a pattern never loses work', () => {
  it('same template again, not ironed: back to the same board, history and progress (10/118)', () => {
    const { store } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 10)
    expect(progress(store)).toBe(10)
    expect(store.getSnapshot().targetBoard!.cells.filter(c => c !== EMPTY)).toHaveLength(118)
    const before = store.board
    store.go('home')
    store.follow('heart')
    expect(store.getSnapshot()).toMatchObject({ mode: 'play', target: 'template:heart', toast: null })
    expect(store.board).toBe(before)
    expect(progress(store)).toBe(10)
    // the undo history is the game's own and still intact
    for (let i = 0; i < 10; i++) store.undo()
    expect(progress(store)).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('same template after ironing: a new game; undo brings the ironed piece back', () => {
    const { store, advance } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 10)
    store.iron(); advance(IRON_MS)
    expect(store.getSnapshot().ironed).toBe(true)
    const ironed = store.board
    store.go('home')
    store.follow('heart')
    expect(store.getSnapshot()).toMatchObject({ mode: 'play', target: 'template:heart', ironed: false, toast: null })
    expect(progress(store)).toBe(0)
    expect(store.canUndo).toBe(true)
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', ironed: true, overlay: 'result' })
    expect(store.board).toBe(ironed)
    store.redo()
    expect(store.getSnapshot()).toMatchObject({ ironed: false })
    expect(progress(store)).toBe(0)
  })

  it('a different template replaces unfinished work with an undo toast that restores it', () => {
    const { store } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 10)
    store.go('home')
    store.follow('whale')
    expect(store.getSnapshot()).toMatchObject({ target: 'template:whale', toast: { key: 'newGame', undo: true } })
    store.undoToast()
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', mode: 'play', toast: null })
    expect(progress(store)).toBe(10)
    // the same through plain undo (Ctrl+Z), and redo goes forward again
    store.follow('whale')
    store.undo()
    expect(store.getSnapshot().target).toBe('template:heart')
    store.redo()
    expect(store.getSnapshot().target).toBe('template:whale')
    // a new edit drops the redo branch, never the kept games
    store.undo(); placeCorrect(store, 11)
    expect(store.canRedo).toBe(false)
    expect(progress(store)).toBe(11)
  })

  it('(a) free boards: a template click is a new game; 自由拼 resumes the free board, never a template one', () => {
    const { store } = make()
    store.startFree(); store.dismissOverlay(); store.applyAt(0, 0)
    store.follow('heart')
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', toast: { key: 'newGame' } })
    expect(store.board.cells.every(c => c === EMPTY)).toBe(true)
    store.undo()
    expect(store.getSnapshot().target).toBeNull()
    const free = store.board
    expect(getCell(free, 0, 0)).not.toBe(EMPTY)
    store.go('home'); store.startFree()
    expect(store.board).toBe(free)
    store.follow('heart'); store.go('home'); store.startFree()
    expect(store.getSnapshot().target).toBeNull()
    expect(store.board).not.toBe(free)
  })

  it('(b) cleared board with history: same template resumes and undo restores the beads; ironed with history: new game, nothing lost', () => {
    const { store, advance } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 10)
    store.clear()
    store.go('home')
    store.follow('heart')
    expect(progress(store)).toBe(0)
    store.undo()
    expect(progress(store)).toBe(10)
    // clear again, then a different template: the cleared game and its history stay one undo away
    store.clear()
    store.follow('whale')
    expect(store.getSnapshot().toast).toBeNull() // nothing visible replaced; the stale 已清空 toast retires
    store.undo()
    expect(store.getSnapshot().target).toBe('template:heart')
    store.undo()
    expect(progress(store)).toBe(10)
    // ironed, with history below it: same template is a new game; undo → the ironed piece → un-iron → its history
    store.iron(); advance(IRON_MS)
    store.follow('heart')
    expect(store.getSnapshot()).toMatchObject({ ironed: false })
    expect(progress(store)).toBe(0)
    store.undo(); expect(store.getSnapshot().ironed).toBe(true)
    store.undo(); expect(store.getSnapshot().ironed).toBe(false)
    store.undo(); expect(progress(store)).toBe(9)
  })

  it('switching mid-iron finishes the ironing on the old game, never on the new one', () => {
    const { store, advance } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 3)
    store.iron()
    expect(store.getSnapshot().ironingSince).not.toBeNull()
    store.follow('whale')
    expect(store.getSnapshot()).toMatchObject({ target: 'template:whale', ironed: false, ironingSince: null })
    advance(IRON_MS * 2)
    expect(store.getSnapshot()).toMatchObject({ target: 'template:whale', ironed: false })
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', ironed: true })
  })

  it('after a reload the same template still resumes (saved board, target, ironed)', () => {
    const backend = mem()
    const first = make({ backend })
    first.store.follow('heart'); first.store.dismissOverlay()
    placeCorrect(first.store, 10)
    first.advance(400)
    const again = make({ backend })
    again.store.follow('heart')
    expect(progress(again.store)).toBe(10)
    expect(again.store.getSnapshot().target).toBe('template:heart')
  })

  it('free play resumes a free board in progress and starts fresh after ironing', () => {
    const { store, advance } = make()
    store.startFree(); store.dismissOverlay(); store.applyAt(2, 2)
    const b = store.board
    store.go('home'); store.startFree()
    expect(store.board).toBe(b)
    store.iron(); advance(IRON_MS)
    store.startFree()
    expect(store.board.cells.every(c => c === EMPTY)).toBe(true)
    store.undo()
    expect(store.board).toBe(b)
  })

  it('keeps at most MAX_KEPT_GAMES replaced games', () => {
    const { store } = make()
    const ids = TEMPLATES.slice(0, MAX_KEPT_GAMES + 2).map(t => t.id)
    for (const id of ids) { store.follow(id); store.dismissOverlay(); placeCorrect(store, 1) }
    let steps = 0
    while (store.canUndo && steps < 100) { store.undo(); steps++ }
    // the current bead, then for each kept game: the switch back plus its one bead
    expect(steps).toBe(1 + MAX_KEPT_GAMES * 2)
  })
})

describe('N9 entry dot uses the live panel visibility', () => {
  it('a result landing between two visibility reports is judged on the probe', async () => {
    const board = setCell(createBoard(12), 1, 1, 2)
    const ok = { ok: true, size: 12, flat: encode(board), issues: [], repaired: false, usage: { input: 1, output: 1 }, model: 'm', finish: 'stop' } as GenerateResponse
    const { store, advance } = make({ api: { generate: async () => ok, status: async () => ({ configured: true, route: 'host' }) } })
    let live = true
    const panel = store.addPanel(() => live)
    panel.check()
    live = false
    store.setAiSize(12); store.setAiPrompt('猫')
    await store.generate()
    expect(store.getSnapshot()).toMatchObject({ fresh: true, panelVisible: false })
    expect(entryDot(store.getSnapshot(), false)).toBe('progress')
    live = true
    panel.check()
    expect(entryDot(store.getSnapshot(), false)).toBeNull()
    panel.remove()
    // visible at landing: no dot; a throwing probe keeps the last report
    const gone = store.addPanel(() => { throw new Error('gone') })
    const shown = store.addPanel(() => true)
    shown.check()
    advance(AI_COOLDOWN_MS)
    store.setAiPrompt('狗')
    await store.generate()
    expect(store.getSnapshot().ai.phase).toBe('done')
    expect(store.getSnapshot().fresh).toBe(false)
    gone.remove(); shown.remove()
  })
})

type Panels = Record<'visible' | 'hidden', ReturnType<GameStore['addPanel']>>
/** Register one visible and one hidden panel, in the given order. */
function addPanels(store: GameStore, order: ReadonlyArray<keyof Panels>): Panels {
  const panels = {} as Panels
  for (const k of order) panels[k] = store.addPanel(() => k === 'visible')
  return panels
}
const dot = (store: GameStore): ReturnType<typeof entryDot> => entryDot(store.getSnapshot(), false)

describe('entry dot with several mounted panels (split view, several sessions)', () => {
  const unfinished = (): GameStore => {
    const { store } = make()
    store.startFree(); store.applyAt(0, 0)
    return store
  }

  for (const order of [['visible', 'hidden'], ['hidden', 'visible']] as const) {
    it(`one visible + one hidden panel (mounted ${order.join(' then ')}): no dot until both are gone`, () => {
      const store = unfinished()
      expect(dot(store)).toBe('progress')
      const panels = addPanels(store, order)
      for (const k of order) panels[k].check()
      expect(dot(store)).toBeNull()
      // repeated reports in either order never let the hidden panel win
      for (let i = 0; i < 3; i++) { panels.hidden.check(); expect(dot(store)).toBeNull(); panels.visible.check(); expect(dot(store)).toBeNull() }
      // unmount the hidden one first: the visible one still holds the dot off
      panels.hidden.remove()
      expect(dot(store)).toBeNull()
      panels.visible.check()
      expect(dot(store)).toBeNull()
      panels.visible.remove()
      expect(dot(store)).toBe('progress')
    })

    it(`one visible + one hidden panel (mounted ${order.join(' then ')}): unmounting the visible one first lights the dot`, () => {
      const store = unfinished()
      const panels = addPanels(store, order)
      for (const k of order) panels[k].check()
      expect(dot(store)).toBeNull()
      panels.visible.remove()
      expect(dot(store)).toBe('progress')
      // a stale check from the removed panel does not re-register it
      panels.visible.check()
      expect(dot(store)).toBe('progress')
      panels.hidden.check()
      expect(dot(store)).toBe('progress')
      panels.hidden.remove()
      expect(dot(store)).toBe('progress')
    })
  }

  it('a result that lands while one of two panels is visible is not fresh', async () => {
    const board = setCell(createBoard(12), 1, 1, 2)
    const ok = { ok: true, size: 12, flat: encode(board), issues: [], repaired: false, usage: { input: 1, output: 1 }, model: 'm', finish: 'stop' } as GenerateResponse
    const { store } = make({ api: { generate: async () => ok, status: async () => ({ configured: true, route: 'host' }) } })
    let left = false
    const a = store.addPanel(() => left)
    const b = store.addPanel(() => false)
    a.check(); b.check()
    left = true // shown since the last report: the live probe decides
    store.setAiSize(12); store.setAiPrompt('猫')
    await store.generate()
    expect(store.getSnapshot()).toMatchObject({ fresh: false, panelVisible: true })
    a.remove(); b.remove()
  })
})

describe('v1.6 §4.3 source keys', () => {
  const pic = setCell(setCell(createBoard(12), 1, 1, 2), 2, 2, 4)
  const ok = { ok: true, size: 12, flat: encode(pic), issues: [], repaired: false, usage: { input: 1, output: 1 }, model: 'm', finish: 'stop' } as GenerateResponse
  const ai = () => make({ api: { generate: async () => ok, status: async () => ({ configured: true, route: 'host' }) } })

  it('every generation is its own board, even for the same picture; template cards never pick one up', async () => {
    const { store, advance } = ai()
    store.setAiSize(12); store.setAiPrompt('猫')
    await store.generate()
    const first = store.getSnapshot().target!
    expect(first).toMatch(/^board:[a-z0-9]+$/)
    store.dismissOverlay(); store.applyAt(1, 1)
    const drawn = store.board
    advance(AI_COOLDOWN_MS)
    store.setAiPrompt('猫')
    await store.generate() // cache hit: same picture, still a new board
    const second = store.getSnapshot()
    expect(second.ai.result?.cached).toBe(true)
    expect(second.target).toMatch(/^board:/)
    expect(second.target).not.toBe(first)
    expect(second.toast).toMatchObject({ key: 'newGame' })
    expect(store.board.cells.every(c => c === EMPTY)).toBe(true)
    store.undo()
    expect(store.getSnapshot().target).toBe(first)
    expect(store.board).toBe(drawn)
    // a template card never resumes a generated board, only 继续上次 does
    store.go('home'); store.go('play')
    expect(store.board).toBe(drawn)
    store.go('home'); store.follow('heart')
    expect(store.getSnapshot().target).toBe('template:heart')
    expect(store.board).not.toBe(drawn)
  })

  it('a generated board survives a reload with its own pattern', async () => {
    const backend = mem()
    const first = make({ backend, api: { generate: async () => ok, status: async () => ({ configured: true, route: 'host' }) } })
    first.store.setAiSize(12); first.store.setAiPrompt('猫')
    await first.store.generate()
    first.store.applyAt(1, 1)
    first.advance(400)
    const saved = JSON.parse(backend.data.get(STORAGE_KEY)!)
    expect(saved).toMatchObject({ v: 2, target: first.store.getSnapshot().target, pattern: encode(pic) })
    const again = make({ backend })
    expect(again.store.getSnapshot().target).toBe(first.store.getSnapshot().target)
    expect(again.store.getSnapshot().targetBoard?.cells).toEqual(pic.cells)
  })

  it('migrates pre-v1.6 saves: template id → template:<id>, ai:<size>:<flat> → board:<id> with the pattern', () => {
    const tpl = mem()
    tpl.data.set(STORAGE_KEY, JSON.stringify({ v: 1, size: 16, board: encode(createBoard(16)), mode: 'play', target: 'heart', coached: true }))
    const a = make({ backend: tpl })
    expect(a.store.getSnapshot()).toMatchObject({ target: 'template:heart', targetBoard: findTemplate('heart')!.board })
    a.store.go('home'); a.store.applyAt(0, 0)
    a.store.follow('heart')
    expect(a.store.getSnapshot().toast).toBeNull() // resumed, not replaced
    const old = mem()
    old.data.set(STORAGE_KEY, JSON.stringify({ v: 1, size: 12, board: encode(createBoard(12)), mode: 'play', target: `ai:12:${encode(pic)}` }))
    const b = make({ backend: old })
    expect(b.store.getSnapshot().target).toMatch(/^board:[a-z0-9-]+$/)
    expect(b.store.getSnapshot().targetBoard?.cells).toEqual(pic.cells)
    b.advance(400); b.store.applyAt(1, 1); b.advance(400)
    expect(JSON.parse(old.data.get(STORAGE_KEY)!)).toMatchObject({ target: b.store.getSnapshot().target, pattern: encode(pic) })
    const bad = mem()
    bad.data.set(STORAGE_KEY, JSON.stringify({ v: 1, size: 16, board: encode(createBoard(16)), target: `ai:12:${encode(pic)}` }))
    expect(make({ backend: bad }).store.getSnapshot()).toMatchObject({ target: null, targetBoard: null })
  })

  it('resuming the same game keeps the undo toast, and its 撤销 still works', () => {
    const { store } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 4)
    store.clear()
    const toast = store.getSnapshot().toast
    expect(toast).toMatchObject({ key: 'cleared', undo: true })
    store.go('home'); store.follow('heart')
    expect(store.getSnapshot().toast).toBe(toast)
    store.undoToast()
    expect(progress(store)).toBe(4)
    // free play too
    store.startFree(); store.dismissOverlay(); store.applyAt(0, 0); store.clear()
    const freeToast = store.getSnapshot().toast
    store.go('home'); store.startFree()
    expect(store.getSnapshot().toast).toBe(freeToast)
    store.undoToast()
    expect(getCell(store.board, 0, 0)).not.toBe(EMPTY)
  })

  it('a full but unironed board resumes on its card, with the done card back', () => {
    const { store } = make()
    store.follow('heart'); store.dismissOverlay(); store.fillTarget()
    const full = store.board
    store.go('home'); store.follow('heart')
    expect(store.board).toBe(full)
    expect(store.getSnapshot()).toMatchObject({ complete: true, overlay: 'done', ironed: false })
  })

  it('mid-iron the same template is a new game; the ironing finishes on the old one', () => {
    const { store, advance } = make()
    store.follow('heart'); store.dismissOverlay()
    placeCorrect(store, 3)
    store.iron()
    store.go('home'); store.follow('heart')
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', ironed: false, ironingSince: null })
    expect(progress(store)).toBe(0)
    advance(IRON_MS)
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ target: 'template:heart', ironed: true })
    expect(progress(store)).toBe(3)
  })
})
