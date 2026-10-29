/**
 * The game's single source of truth: a tiny external store (useSyncExternalStore
 * friendly) over the pure core. No React, no DOM: everything environmental
 * (storage, network, clock, motion preference) is injected so tests drive it.
 */
import {
  type Board, type BoardSize, begin, canRedo, canUndo, clearBoard, commit, completion, createBoard, createHistory,
  decode, EMPTY, encode, findTemplate, floodFill, GenerationCache, type GenerateResponse, getCell, type History,
  inBounds, isColorIndex, type Mode, paintLine, type Prefs, preview, promptKey, push, redo,
  remainingByColor, resizeBoard, SafeStore, type SavedState, sanitizePrompt, setCell, type StatusResponse,
  type StorageStatus, templateIdOf, templateKey, type Tool, type TokenUsageInfo, undo,
  MAX_WORKS, type StoredWork, WORKS_KEY,
} from '../core/index.ts'

export type AiSize = 12 | 16
export const AI_SIZES: readonly AiSize[] = [12, 16]

export type AiErrorKind = 'empty' | 'parse' | 'network' | 'busy' | 'rate' | 'not-configured' | 'timeout'

export interface AiResult {
  readonly board: Board
  readonly prompt: string
  readonly usage?: TokenUsageInfo | undefined
  readonly cached: boolean
  readonly repaired: boolean
  readonly truncated: boolean
  readonly model?: string | undefined
}

export interface AiState {
  readonly phase: 'idle' | 'loading' | 'done' | 'error'
  readonly prompt: string
  readonly size: AiSize
  readonly result?: AiResult | undefined
  readonly error?: AiErrorKind | undefined
  /** Host route status; `undefined` until probed (or when the probe failed). */
  readonly status?: StatusResponse | undefined
}

/** Source ids of picture patterns start with this (AI ones never contain a `-`). */
export const PICTURE_PREFIX = 'p-'
export const isPictureSource = (target: string | null): boolean => target?.startsWith(`board:${PICTURE_PREFIX}`) ?? false

/** What the panel shows; `picture` (spec §18.2) and `works` (§18.4) are pages of home and are saved as `home`. */
export type ViewMode = Mode | 'picture' | 'works'

export type Overlay = 'coach' | 'done' | 'result' | null
export type ToastKey = 'cleared' | 'newGame' | 'locked' | 'exported' | 'exportFailed' | 'copied' | 'copyFailed' | 'storageUnavailable' | 'storageRecovered' | 'say'

export interface GameState {
  readonly history: History
  readonly color: number
  readonly tool: Tool
  readonly mode: ViewMode
  readonly target: string | null
  readonly targetBoard: Board | null
  readonly ironed: boolean
  /** This game's piece on the works wall (its id) while ironed (spec §18.4). */
  readonly work: number | null
  /** Iron animation start time, while it runs. */
  readonly ironingSince: number | null
  /** The followed pattern is complete (every target bead in place). */
  readonly complete: boolean
  /** Set when ironing finishes; drives the confetti (spec §4.6). */
  readonly celebrateAt: number | null
  /** Set when the colour changes on a pattern; pulses that colour's remaining cells (spec §4.5). */
  readonly pulseAt: number | null
  readonly overlay: Overlay
  readonly toast: { readonly key: ToastKey; readonly undo: boolean; readonly at: number; readonly params?: Readonly<Record<string, string>> } | null
  /** Fallback when downloads are unavailable: the PNG shown in the panel for manual saving. */
  readonly preview: { readonly url: string; readonly name: string } | null
  readonly prefs: Prefs
  readonly done: readonly string[]
  readonly coached: boolean
  readonly storage: StorageStatus
  readonly ai: AiState
  /** Whether the panel is on screen (reported by the mounted panel). */
  readonly panelVisible: boolean
  /** An AI pattern finished while the panel was hidden; cleared when it is shown. */
  readonly fresh: boolean
}

/**
 * One game: the board with its own undo history and what it follows. The
 * source key is `target` (spec v1.6 §4.3): `template:<id>`, `board:<id>` with
 * a fresh id for every generated pattern (generating the same picture again is
 * a new game), or null for free play. Only `template:<id>` can match a
 * template card, so generated boards are reached through 继续上次 only.
 */
export interface GameSnap {
  readonly history: History
  readonly target: string | null
  readonly targetBoard: Board | null
  readonly ironed: boolean
  readonly work: number | null
  readonly complete: boolean
  readonly color: number
  readonly tool: Tool
}

/** How many replaced games stay reachable with undo (memory only, not persisted). */
export const MAX_KEPT_GAMES = 5

export interface GameApi {
  generate(body: { prompt: string; size: AiSize }, signal: AbortSignal): Promise<GenerateResponse>
  status(signal: AbortSignal): Promise<StatusResponse>
}

export interface GameDeps {
  readonly store: SafeStore
  readonly api?: GameApi | undefined
  readonly now?: () => number
  readonly reducedMotion?: () => boolean
  readonly setTimeout?: (fn: () => void, ms: number) => unknown
  readonly clearTimeout?: (handle: unknown) => void
  readonly saveDelayMs?: number
}

/** Matches the designer's --pd-t-iron-total (the sweep and the staggered melt). */
export const IRON_MS = 1200
/** Spec §4.6: the "done" card waits a beat after the last bead lands. */
export const DONE_DELAY_MS = 260
/** Front-end spacing between real generations (spec §10: 5 s); cache hits are free. */
export const AI_COOLDOWN_MS = 1500

/** The pattern a saved source key follows: the template's, or the saved `board:` pattern. */
export function resolveTarget(target: string | null, pattern: string | null, size: BoardSize): Board | null {
  const id = templateIdOf(target)
  if (id !== null) return findTemplate(id)?.board ?? null
  if (!target?.startsWith('board:') || pattern === null) return null
  const decoded = decode(pattern, size)
  return decoded.ok ? decoded.board : null
}

/** The colour with the most beads still missing, so a fresh pattern starts on something useful. */
function firstColor(board: Board, target: Board, fallback: number): number {
  let best = fallback
  let most = 0
  for (const [c, n] of remainingByColor(board, target)) if (n > most) { most = n; best = c }
  return best
}

export class GameStore {
  private state: GameState
  private readonly listeners = new Set<() => void>()
  private readonly cache: GenerationCache
  private readonly now: () => number
  private readonly st: (fn: () => void, ms: number) => unknown
  private readonly ct: (handle: unknown) => void
  private saveHandle: unknown = null
  private ironHandle: unknown = null
  private doneHandle: unknown = null
  /** A generation said "not configured": keep showing that until the user re-checks. */
  private notConfiguredSticky = false
  private aiAbort: AbortController | null = null
  private last: { x: number; y: number; value: number } | null = null
  private disposed = false
  private lastGenAt = Number.NEGATIVE_INFINITY
  /** Games replaced by a new one, newest last: undo past a game's first step brings them back. */
  private prevGames: GameSnap[] = []
  private boardSeq = 0
  /** The works wall as stored, oldest first; a new array on every change. */
  private wall: StoredWork[]
  /** Games left by undoing a switch, for redo; any edit drops them. */
  private nextGames: GameSnap[] = []
  /** Live visibility of the panel (set by the mounted panel), read when a result lands. */
  /** Each mounted panel's probe → its last "on screen" report. */
  private readonly panels = new Map<() => boolean, boolean>()

  constructor(private readonly deps: GameDeps) {
    this.now = deps.now ?? Date.now
    this.st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this.ct = deps.clearTimeout ?? (h => { clearTimeout(h as ReturnType<typeof setTimeout>) })
    this.cache = new GenerationCache(deps.store)
    const saved = deps.store.loadState()
    let targetBoard = resolveTarget(saved.target, saved.pattern, saved.board.size)
    let target = targetBoard ? saved.target : null
    if (targetBoard && targetBoard.size !== saved.board.size) { target = null; targetBoard = null }
    const storage = deps.store.status
    // the works wall lives under its own key; before v0.2 there is none (an empty wall).
    // Only the ids are checked here; the wall page validates every work (core/works.ts, in its chunk).
    // Anything but an array (or broken JSON) is an empty wall: `filter` throws on it.
    try {
      this.wall = (JSON.parse(deps.store.get(WORKS_KEY) ?? '[]') as (StoredWork | null)[]).filter(w => Number.isSafeInteger(w?.i)) as StoredWork[]
    } catch { this.wall = [] }
    this.state = {
      history: createHistory(saved.board),
      color: saved.color,
      tool: saved.tool,
      mode: saved.mode,
      target,
      targetBoard,
      ironed: saved.ironed,
      work: saved.work,
      ironingSince: null,
      complete: targetBoard !== null && completion(saved.board, targetBoard).done,
      celebrateAt: null,
      pulseAt: null,
      overlay: saved.ironed ? 'result' : null,
      toast: storage === 'ok' ? null : { key: storage === 'recovered' ? 'storageRecovered' : 'storageUnavailable', undo: false, at: this.now() },
      prefs: saved.prefs,
      done: saved.done,
      coached: saved.coached,
      storage,
      ai: { phase: 'idle', prompt: '', size: 16 },
      preview: null,
      panelVisible: false,
      fresh: false,
    }
    // ironed but not on the wall: closed mid-iron, or a piece ironed before v0.2 (never a blank
    // board: a damaged save falls back to one, and iron() refuses it too)
    if (saved.ironed && saved.work === null && saved.board.cells.some(c => c !== EMPTY)) this.collect()
  }

  // ── store protocol ────────────────────────────────────────────────
  getSnapshot = (): GameState => this.state
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private set(patch: Partial<GameState>, persist = true): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    if (persist) this.scheduleSave()
    for (const fn of Array.from(this.listeners)) fn()
  }

  private setAi(patch: Partial<AiState>): void {
    this.set({ ai: { ...this.state.ai, ...patch } }, false)
  }

  /**
   * Every mounted panel (split view, several sessions) registers a synchronous
   * "am I on screen" probe. The panel counts as visible while ANY registered
   * panel is on screen, so a hidden or later-mounted panel never overrides a
   * visible one, and removing one panel never unregisters another. `check`
   * re-samples this panel; `remove` unregisters it (on unmount). A result that
   * lands between two reports is judged on the live probes (spec §15.1-3).
   * Showing a panel clears the "fresh result" dot.
   */
  addPanel(probe: () => boolean): { readonly check: () => void; readonly remove: () => void } {
    this.panels.set(probe, false)
    return {
      check: () => this.seePanels(probe),
      // once deleted, `probe` matches no key: nothing is re-read, the rest are OR'd
      remove: () => { this.panels.delete(probe); this.seePanels(probe) },
    }
  }

  /** Re-read the registered probe `only` (omitted: every probe), then OR the reports. */
  private seePanels(only?: () => boolean): boolean {
    for (const p of this.panels.keys()) {
      // a throwing probe keeps its last report
      if (!only || p === only) try { this.panels.set(p, p()) } catch { /* keep */ }
    }
    const visible = [...this.panels.values()].includes(true)
    if (visible !== this.state.panelVisible) this.set({ panelVisible: visible, fresh: this.state.fresh && !visible }, false)
    return visible
  }

  // ── derived ───────────────────────────────────────────────────────
  get board(): Board { return this.state.history.present }
  get locked(): boolean { return this.state.ironed || this.state.ironingSince !== null }
  get canUndo(): boolean { return !this.locked && (canUndo(this.state.history) || this.prevGames.length > 0) }
  get canRedo(): boolean {
    return (!this.locked && canRedo(this.state.history)) || (this.state.ironingSince === null && this.nextGames.length > 0)
  }

  // ── persistence ───────────────────────────────────────────────────
  private saved(): SavedState {
    const s = this.state
    return {
      board: s.history.present, color: s.color, tool: s.tool, mode: s.mode === 'play' || s.mode === 'ai' ? s.mode : 'home', target: s.target,
      pattern: s.target?.startsWith('board:') && s.targetBoard ? encode(s.targetBoard) : null,
      ironed: s.ironed || s.ironingSince !== null, prefs: s.prefs, done: s.done, coached: s.coached, work: s.work,
    }
  }

  private scheduleSave(): void {
    if (this.saveHandle !== null) return
    this.saveHandle = this.st(() => { this.saveHandle = null; this.flush() }, this.deps.saveDelayMs ?? 300)
  }

  flush(): void {
    if (this.saveHandle !== null) { this.ct(this.saveHandle); this.saveHandle = null }
    const before = this.deps.store.status
    this.deps.store.saveState(this.saved())
    const after = this.deps.store.status
    if (after !== before && !this.disposed) {
      this.set({ storage: after, toast: { key: 'storageUnavailable', undo: false, at: this.now() } }, false)
    }
  }

  dispose(): void {
    this.flush()
    this.aiAbort?.abort()
    if (this.ironHandle !== null) this.ct(this.ironHandle)
    this.cancelDone()
    this.disposed = true
    this.listeners.clear()
  }

  // ── navigation & prefs ────────────────────────────────────────────
  go(mode: ViewMode): void {
    if (mode === this.state.mode) return
    this.last = null
    this.set({ mode, overlay: mode === 'play' ? this.state.overlay : null })
  }

  /** Free play: resume a free board in progress, else a blank one (the old game stays undoable). */
  startFree(): void {
    const s = this.state
    if (this.resumable(null)) {
      this.last = null
      // the toast (and what its 撤销 restores) belongs to this game: keep it (spec v1.6 §4.3)
      this.set({ mode: 'play', overlay: s.coached ? null : 'coach' })
      return
    }
    this.switchGame({
      history: createHistory(createBoard(s.history.present.size)), target: null, targetBoard: null,
      ironed: false, work: null, complete: false, color: s.color, tool: s.tool,
    }, { mode: 'play', overlay: s.coached ? null : 'coach' })
  }

  // ── games (spec §4.3) ────────────────────────────────────────────
  /** Same source, not ironed (nor ironing): picking it again only goes back to it. */
  private resumable(target: string | null): boolean {
    const s = this.state
    return s.target === target && !s.ironed && s.ironingSince === null
  }

  private snap(): GameSnap {
    const s = this.state
    return { history: commit(s.history), target: s.target, targetBoard: s.targetBoard, ironed: s.ironed, work: s.work, complete: s.complete, color: s.color, tool: s.tool }
  }

  private static apply(g: GameSnap): Partial<GameState> {
    return { history: g.history, target: g.target, targetBoard: g.targetBoard, ironed: g.ironed, work: g.work, complete: g.complete, color: g.color, tool: g.tool }
  }

  /** An undo toast speaks about the game on screen; leaving or swapping that game retires it. */
  private dropUndoToast(): Partial<GameState> { return this.state.toast?.undo === true ? { toast: null } : {} }

  /** An edit starts a new future: games left by undoing a switch can't be redone any more. */
  private edited(): void { this.nextGames = [] }

  /**
   * Replace the current game. Nothing is lost: the old game (board, history,
   * pattern, ironed state) is one undo step away, and replacing unfinished
   * work says so with an undo toast.
   */
  private switchGame(next: GameSnap, extra: Partial<GameState>): void {
    this.settleIron()
    this.cancelDone()
    this.last = null
    const s = this.state
    const beads = s.history.present.cells.some(c => c !== EMPTY)
    if (beads || canUndo(s.history)) this.prevGames = [...this.prevGames, this.snap()].slice(-MAX_KEPT_GAMES)
    this.nextGames = []
    this.set({
      ...GameStore.apply(next), ironingSince: null, celebrateAt: null, ...extra,
      ...(beads && !s.ironed ? { toast: { key: 'newGame' as const, undo: true, at: this.now() } } : this.dropUndoToast()),
    })
  }

  /** Bring back the game replaced last (undo past a game's first step, or the toast). */
  restorePreviousGame(): boolean {
    const prev = this.prevGames.pop()
    if (!prev) return false
    this.settleIron()
    this.cancelDone()
    this.last = null
    this.nextGames.push(this.snap())
    this.set({
      ...GameStore.apply(prev), mode: 'play', overlay: prev.ironed ? 'result' : null, ironingSince: null, celebrateAt: null,
      ...this.dropUndoToast(),
    })
    return true
  }

  private redoGame(): boolean {
    const next = this.nextGames.pop()
    if (!next) return false
    this.last = null
    this.prevGames.push(this.snap())
    this.set({ ...GameStore.apply(next), mode: 'play', overlay: next.ironed ? 'result' : null, ironingSince: null, celebrateAt: null })
    return true
  }

  /** The toast's 撤销: what it undoes depends on what the toast reported. */
  undoToast(): void {
    const key = this.state.toast?.key
    this.hideToast()
    if (key === 'newGame') this.restorePreviousGame()
    else this.undo()
  }

  setPrefs(patch: Partial<Prefs>): void { this.set({ prefs: { ...this.state.prefs, ...patch } }) }

  dismissOverlay(): void {
    const coach = this.state.overlay === 'coach'
    this.set({ overlay: null, ...(coach ? { coached: true } : {}) }, coach)
  }

  /** Menu → "show the intro again": opens the coach card on the board. */
  showCoach(): void { this.set({ mode: 'play', overlay: 'coach' }, false) }

  showToast(key: ToastKey, undoable = false, params?: Readonly<Record<string, string>>): void {
    this.set({ toast: params ? { key, undo: undoable, at: this.now(), params } : { key, undo: undoable, at: this.now() } }, false)
  }
  /** Show (or with null, close and release) the manual-save preview. */
  setPreview(next: { readonly url: string; readonly name: string } | null): void {
    const old = this.state.preview
    if (old && old.url !== next?.url) { try { URL.revokeObjectURL(old.url) } catch { /* not a blob URL */ } }
    this.set({ preview: next }, false)
  }
  hideToast(): void { if (this.state.toast) this.set({ toast: null }, false) }

  // ── selection ─────────────────────────────────────────────────────
  setColor(color: number): void {
    if (!isColorIndex(color)) return
    const pulse = color !== this.state.color && this.state.targetBoard !== null && !this.locked
    this.set({
      color, tool: this.state.tool === 'erase' || this.state.tool === 'pick' ? 'paint' : this.state.tool,
      ...(pulse ? { pulseAt: this.now() } : {}),
    })
  }

  setTool(tool: Tool): void { this.set({ tool }) }

  // ── painting ──────────────────────────────────────────────────────
  /** Begin a stroke (pointer down). `override` forces a tool (right button = erase, Alt = pick). */
  strokeStart(x: number, y: number, override?: Tool): void {
    if (this.locked) { this.showToast('locked'); return }
    if (!inBounds(this.board, x, y)) return
    const tool = override ?? this.state.tool
    if (tool === 'pick') { this.pick(x, y); return }
    if (tool === 'fill') {
      const next = floodFill(this.board, x, y, this.state.color)
      if (next !== this.board) { this.edited(); this.set({ history: push(commit(this.state.history), next) }); this.afterChange() }
      return
    }
    const value = tool === 'erase' ? EMPTY : this.state.color
    this.edited()
    this.last = { x, y, value }
    this.set({ history: preview(begin(this.state.history), setCell(this.board, x, y, value)), overlay: null })
  }

  strokeMove(x: number, y: number): void {
    const last = this.last
    if (last === null || this.locked) return
    const cx = Math.max(0, Math.min(this.board.size - 1, x))
    const cy = Math.max(0, Math.min(this.board.size - 1, y))
    if (cx === last.x && cy === last.y) return
    const next = paintLine(this.board, last.x, last.y, cx, cy, last.value)
    this.last = { x: cx, y: cy, value: last.value }
    if (next !== this.board) this.set({ history: preview(this.state.history, next) })
  }

  strokeEnd(): void {
    if (this.last === null) return
    this.last = null
    this.set({ history: commit(this.state.history) })
    this.afterChange()
  }

  get stroking(): boolean { return this.last !== null }

  /** One-shot action at a cell (keyboard). */
  applyAt(x: number, y: number, override?: Tool): void {
    this.strokeStart(x, y, override)
    this.strokeEnd()
  }

  pick(x: number, y: number): void {
    const c = getCell(this.board, x, y)
    if (c !== EMPTY) this.set({ color: c, tool: 'paint' })
  }

  undo(): void {
    if (this.state.ironed && this.state.ironingSince === null) { this.unIron(); return }
    if (this.locked) return
    if (!canUndo(this.state.history)) { this.restorePreviousGame(); return }
    this.last = null
    this.set({ history: undo(this.state.history) })
    this.afterChange()
  }

  redo(): void {
    if (this.state.ironingSince !== null) return
    if (this.locked || !canRedo(this.state.history)) { this.redoGame(); return }
    this.last = null
    this.set({ history: redo(this.state.history) })
    this.afterChange()
  }

  clear(): void {
    if (this.locked || this.board.cells.every(c => c === EMPTY)) return
    this.cancelDone()
    this.edited()
    this.set({ history: push(commit(this.state.history), clearBoard(this.board)), complete: false, celebrateAt: null, overlay: null })
    this.showToast('cleared', true)
  }

  resize(size: BoardSize): void {
    if (this.locked || size === this.board.size) return
    const keepTarget = this.state.targetBoard?.size === size
    this.edited()
    this.set({
      history: push(commit(this.state.history), resizeBoard(this.board, size)),
      ...(keepTarget ? {} : { target: null, targetBoard: null }),
    })
  }

  private cancelDone(): void {
    if (this.doneHandle !== null) { this.ct(this.doneHandle); this.doneHandle = null }
  }

  /**
   * Completion bookkeeping after any committed change. The "done" card follows
   * the last bead after DONE_DELAY_MS (immediately under reduced motion); the
   * confetti waits for ironing (spec §4.6).
   */
  private afterChange(): void {
    const target = this.state.targetBoard
    if (!target) return
    const done = completion(this.board, target).done
    if (done && !this.state.complete) {
      this.set({ complete: true }, false)
      const show = (): void => {
        this.doneHandle = null
        if (this.state.complete && !this.locked && this.state.overlay === null && this.state.mode === 'play') this.set({ overlay: 'done' }, false)
      }
      this.cancelDone()
      if (this.deps.reducedMotion?.() ?? false) show()
      else this.doneHandle = this.st(show, DONE_DELAY_MS)
    } else if (!done && this.state.complete) {
      this.cancelDone()
      this.set({ complete: false, overlay: this.state.overlay === 'done' ? null : this.state.overlay }, false)
    }
  }

  // ── patterns ──────────────────────────────────────────────────────
  /**
   * Pick a pattern (spec §4.3). The same pattern, not ironed: back to it with
   * its board and history untouched. Otherwise a fresh board of its size; the
   * replaced game stays one undo step away.
   */
  follow(templateId: string): void {
    const board = findTemplate(templateId)?.board
    if (!board) return
    const s = this.state
    const key = templateKey(templateId)
    if (this.resumable(key)) {
      this.last = null
      // undo history and the undo toast stay with the game (spec v1.6 §4.3)
      this.set({ mode: 'play', overlay: s.complete ? 'done' : s.coached ? null : 'coach' })
      return
    }
    this.startPattern(key, board)
  }

  /** A new game following `board`; the replaced game stays one undo step away. */
  private startPattern(target: string, board: Board): void {
    const s = this.state
    const fresh = createBoard(board.size)
    this.switchGame({
      history: createHistory(fresh), target, targetBoard: board, ironed: false, work: null, complete: false,
      color: firstColor(fresh, board, s.color), tool: 'paint',
    }, { mode: 'play', overlay: s.coached ? null : 'coach' })
  }

  /** Put every pattern bead in place (AI patterns: "fill board"). Undoable. */
  fillTarget(): void {
    const target = this.state.targetBoard
    if (!target || this.locked) return
    const cells = this.board.cells.map((c, i) => (target.cells[i] === EMPTY ? c : target.cells[i]!))
    this.edited()
    this.set({ history: push(commit(this.state.history), { size: this.board.size, cells: Object.freeze(cells) }) })
    this.afterChange()
  }

  // ── ironing ───────────────────────────────────────────────────────
  iron(): void {
    if (this.locked || this.board.cells.every(c => c === EMPTY)) return
    this.last = null
    this.cancelDone()
    this.set({ history: commit(this.state.history), overlay: null })
    if (this.deps.reducedMotion?.() ?? false) { this.finishIron(); return }
    this.set({ ironingSince: this.now() }, false)
    this.ironHandle = this.st(() => { this.finishIron() }, IRON_MS)
  }

  private finishIron(): void {
    this.ironHandle = null
    const t = this.state.target
    const id = templateIdOf(t)
    const done = id !== null && findTemplate(id) !== undefined && this.state.complete && !this.state.done.includes(id)
      ? [...this.state.done, id] : this.state.done
    this.set({ ironed: true, ironingSince: null, overlay: 'result', done, celebrateAt: this.now() })
    this.collect()
  }

  // ── works wall (spec §18.4) ───────────────────────────────────────
  /** The wall as stored, oldest first; the same array until it changes (a useSyncExternalStore snapshot). */
  works = (): readonly StoredWork[] => this.wall

  /**
   * Replace the wall (the wall page deletes, restores and cleans through this).
   * Written right away under its own key; a refused write (quota) leaves the wall
   * in memory for this session and never touches the game's save (SafeStore.set `side`).
   */
  setWall(next: StoredWork[]): void {
    this.wall = next
    this.deps.store.set(WORKS_KEY, JSON.stringify(next), true)
    this.set({}, false)
  }

  /**
   * The ironed piece goes on the wall, the oldest leaves past 60. Its id is the
   * ironing time, kept past the newest id. A `board:` source up to 16×16 keeps
   * its pattern too (still under 1 KB), so 再拼一次 can follow it again.
   */
  private collect(): void {
    const s = this.state
    const b = s.history.present
    const w: StoredWork = {
      i: Math.max(this.now(), (this.wall.at(-1)?.i ?? 0) + 1), n: b.size, b: encode(b), s: s.target,
      ...(s.target?.startsWith('board:') && s.targetBoard && b.size < 24 ? { p: encode(s.targetBoard) } : {}),
    }
    this.setWall([...this.wall, w].slice(-MAX_WORKS))
    this.set({ work: w.i })
  }

  /** Leaving a game mid-iron: finish it now, so the ironed piece belongs to that game and not the next. */
  private settleIron(): void {
    if (this.ironHandle === null) return
    this.ct(this.ironHandle)
    this.finishIron()
  }

  unIron(): void {
    const s = this.state
    if (s.ironingSince !== null || !s.ironed) return
    // the piece leaves the wall with the ironing
    if (s.work !== null) this.setWall(this.wall.filter(w => w.i !== s.work))
    this.set({ ironed: false, work: null, overlay: null, celebrateAt: null })
  }

  /** "Make another": back to the start page with the ironed piece kept for undo. */
  again(): void {
    this.set({ mode: 'home', overlay: null, celebrateAt: null })
  }

  // ── AI ────────────────────────────────────────────────────────────
  setAiPrompt(prompt: string): void { this.setAi({ prompt: prompt.slice(0, 120), ...(this.state.ai.phase === 'error' ? { phase: 'idle', error: undefined } : {}) }) }
  setAiSize(size: AiSize): void { this.setAi({ size }) }

  /**
   * Ask the Host whether a generation can work. After a generation reported
   * "not configured" the answer is kept until the user re-checks (`force`).
   */
  async probeStatus(force = false): Promise<void> {
    if (!this.deps.api) { this.setAi({ status: { configured: false, route: 'none' } }); return }
    if (this.notConfiguredSticky && !force) return
    this.notConfiguredSticky = false
    try {
      this.setAi({ status: await this.deps.api.status(AbortSignal.timeout(8000)) })
    } catch {
      // Unknown: let the user try; the generate call reports the real state.
      this.setAi({ status: undefined })
    }
  }

  cancelGenerate(): void {
    this.aiAbort?.abort()
    this.aiAbort = null
    if (this.state.ai.phase === 'loading') this.setAi({ phase: 'idle' })
  }

  async generate(): Promise<void> {
    if (this.state.ai.phase === 'loading') return
    const prompt = sanitizePrompt(this.state.ai.prompt)
    const size = this.state.ai.size
    if (prompt === '') { this.setAi({ phase: 'error', error: 'empty' }); return }
    const key = promptKey(prompt, size)
    const hit = this.cache.get(key)
    if (hit) {
      const decoded = decode(hit.flat, hit.size)
      if (decoded.ok) {
        this.finishAi({ board: decoded.board, prompt, cached: true, repaired: false, truncated: false, model: hit.model })
        return
      }
    }
    if (!this.deps.api) { this.setAi({ phase: 'error', error: 'not-configured' }); return }
    if (this.now() - this.lastGenAt < AI_COOLDOWN_MS) { this.setAi({ phase: 'error', error: 'rate' }); return }
    this.lastGenAt = this.now()
    const abort = new AbortController()
    this.aiAbort = abort
    this.setAi({ phase: 'loading', error: undefined })
    let reply: GenerateResponse
    try {
      reply = await this.deps.api.generate({ prompt, size }, abort.signal)
    } catch {
      if (abort.signal.aborted || this.disposed) return
      this.aiAbort = null
      this.setAi({ phase: 'error', error: 'network' })
      return
    }
    if (abort.signal.aborted || this.disposed) return
    this.aiAbort = null
    if (!reply.ok) {
      const map: Partial<Record<string, AiErrorKind>> = {
        'not-configured': 'not-configured', busy: 'busy', 'rate-limited': 'rate', parse: 'parse', timeout: 'timeout',
      }
      const error = map[reply.error] ?? 'network'
      if (error === 'not-configured') this.notConfiguredSticky = true
      this.setAi({
        phase: 'error', error,
        ...(error === 'not-configured' ? { status: { configured: false, route: this.state.ai.status?.route ?? 'none', verified: true } } : {}),
      })
      return
    }
    // Never trust the wire: re-validate strictly before anything touches the board.
    const decoded = reply.size === size && typeof reply.flat === 'string' ? decode(reply.flat, size) : undefined
    if (!decoded?.ok) { this.setAi({ phase: 'error', error: 'parse' }); return }
    if (decoded.board.cells.every(c => c === EMPTY)) { this.setAi({ phase: 'error', error: 'parse' }); return }
    this.cache.put({ key, size, flat: encode(decoded.board), model: reply.model, at: this.now() })
    this.finishAi({
      board: decoded.board, prompt, usage: reply.usage, cached: false, repaired: reply.repaired === true,
      truncated: reply.finish === 'max-tokens', model: typeof reply.model === 'string' ? reply.model.slice(0, 80) : undefined,
    })
  }

  /**
   * Picture to pattern (spec §18.2): the quantised picture becomes the guide of
   * a new `board:p-…` game titled 「我的图纸」; only this pattern is saved.
   */
  /** A new game following a picture pattern; with prefix '' an AI-like `board:` source (再拼一次 of an AI work). */
  startPicture(board: Board, prefix = PICTURE_PREFIX): void {
    this.startPattern(`board:${prefix}${this.now().toString(36)}${(++this.boardSeq).toString(36)}`, board)
  }

  /** A generated pattern becomes the faint guide on a fresh board, like a template. */
  private finishAi(result: AiResult): void {
    this.set({ ai: { ...this.state.ai, phase: 'done', error: undefined, result }, fresh: !this.seePanels() }, false)
    // every generation is its own board, even when the picture is the same (spec v1.6 §4.3)
    this.startPicture(result.board, '')
  }
}

/**
 * Entry-button dot (spec §2.1): `busy` while the model runs (breathing accent),
 * (independent of the pill preference), otherwise `progress` (steady warm) when an AI result arrived while hidden or
 * unfinished work sits in a closed panel; busy wins when both apply.
 */
export function entryDot(s: GameState, running: boolean): 'busy' | 'progress' | null {
  if (running) return 'busy'
  if (s.panelVisible) return null
  if (s.fresh || s.ai.phase === 'loading') return s.fresh ? 'progress' : null
  const board = s.history.present
  const unfinished = s.mode === 'play' && !s.ironed && board.cells.some(c => c !== EMPTY)
    && !s.done.includes(templateIdOf(s.target) ?? '')
  return unfinished ? 'progress' : null
}
