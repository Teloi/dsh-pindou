/**
 * The game's single source of truth: a tiny external store (useSyncExternalStore
 * friendly) over the pure core. No React, no DOM: everything environmental
 * (storage, network, clock, motion preference) is injected so tests drive it.
 */
import {
  type Board, type BoardSize, begin, canRedo, canUndo, clearBoard, commit, completion, createBoard, createHistory,
  decode, EMPTY, encode, findTemplate, floodFill, GenerationCache, type GenerateResponse, getCell, type History,
  inBounds, isBoardSize, isColorIndex, type Mode, paintLine, type Prefs, preview, promptKey, push, redo,
  remainingByColor, resizeBoard, SafeStore, type SavedState, sanitizePrompt, setCell, type StatusResponse,
  type StorageStatus, type Tool, type TokenUsageInfo, undo,
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

export type Overlay = 'coach' | 'done' | 'result' | null
export type ToastKey = 'cleared' | 'locked' | 'exported' | 'exportFailed' | 'copied' | 'copyFailed' | 'storageUnavailable' | 'storageRecovered'

export interface GameState {
  readonly history: History
  readonly color: number
  readonly tool: Tool
  readonly mode: Mode
  readonly target: string | null
  readonly targetBoard: Board | null
  readonly ironed: boolean
  /** Iron animation start time, while it runs. */
  readonly ironingSince: number | null
  /** Set when a pattern is completed; drives the celebration. */
  readonly celebrateAt: number | null
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
/** Front-end spacing between real generations (spec §10: 5 s); cache hits are free. */
export const AI_COOLDOWN_MS = 1500

export function resolveTarget(target: string | null): Board | null {
  if (target === null) return null
  const template = findTemplate(target)
  if (template) return template.board
  const m = /^ai:(\d+):([.0-9a-f]+)$/.exec(target)
  if (!m) return null
  const size = Number(m[1])
  if (!isBoardSize(size)) return null
  const decoded = decode(m[2]!, size)
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
  private aiAbort: AbortController | null = null
  private last: { x: number; y: number; value: number } | null = null
  private disposed = false
  private lastGenAt = Number.NEGATIVE_INFINITY

  constructor(private readonly deps: GameDeps) {
    this.now = deps.now ?? Date.now
    this.st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this.ct = deps.clearTimeout ?? (h => { clearTimeout(h as ReturnType<typeof setTimeout>) })
    this.cache = new GenerationCache(deps.store)
    const saved = deps.store.loadState()
    let targetBoard = resolveTarget(saved.target)
    let target = targetBoard ? saved.target : null
    if (targetBoard && targetBoard.size !== saved.board.size) { target = null; targetBoard = null }
    const storage = deps.store.status
    this.state = {
      history: createHistory(saved.board),
      color: saved.color,
      tool: saved.tool,
      mode: saved.mode,
      target,
      targetBoard,
      ironed: saved.ironed,
      ironingSince: null,
      celebrateAt: null,
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

  /** The panel reports its visibility; showing it clears the "fresh result" dot. */
  setPanelVisible(visible: boolean): void {
    if (visible === this.state.panelVisible) return
    this.set({ panelVisible: visible, ...(visible ? { fresh: false } : {}) }, false)
  }

  // ── derived ───────────────────────────────────────────────────────
  get board(): Board { return this.state.history.present }
  get locked(): boolean { return this.state.ironed || this.state.ironingSince !== null }
  get canUndo(): boolean { return !this.locked && canUndo(this.state.history) }
  get canRedo(): boolean { return !this.locked && canRedo(this.state.history) }

  // ── persistence ───────────────────────────────────────────────────
  private saved(): SavedState {
    const s = this.state
    return {
      board: s.history.present, color: s.color, tool: s.tool, mode: s.mode, target: s.target,
      ironed: s.ironed || s.ironingSince !== null, prefs: s.prefs, done: s.done, coached: s.coached,
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
    this.disposed = true
    this.listeners.clear()
  }

  // ── navigation & prefs ────────────────────────────────────────────
  go(mode: Mode): void {
    if (mode === this.state.mode) return
    this.last = null
    this.set({ mode, overlay: mode === 'play' ? this.state.overlay : null })
  }

  /** Free play: a blank board unless a free board is already in progress. */
  startFree(): void {
    const s = this.state
    const fresh = s.target !== null || s.ironed
    this.set({
      mode: 'play',
      ...(fresh ? { history: push(commit(s.history), createBoard(s.history.present.size)) } : {}),
      target: null, targetBoard: null, ironed: false, celebrateAt: null,
      overlay: s.coached ? null : 'coach',
    })
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
    this.set({ color, tool: this.state.tool === 'erase' || this.state.tool === 'pick' ? 'paint' : this.state.tool })
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
      if (next !== this.board) { this.set({ history: push(commit(this.state.history), next) }); this.afterChange() }
      return
    }
    const value = tool === 'erase' ? EMPTY : this.state.color
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
    if (!this.canUndo) return
    this.last = null
    this.set({ history: undo(this.state.history) })
    this.afterChange()
  }

  redo(): void {
    if (!this.canRedo) return
    this.last = null
    this.set({ history: redo(this.state.history) })
    this.afterChange()
  }

  clear(): void {
    if (this.locked || this.board.cells.every(c => c === EMPTY)) return
    this.set({ history: push(commit(this.state.history), clearBoard(this.board)), celebrateAt: null, overlay: null })
    this.showToast('cleared', true)
  }

  resize(size: BoardSize): void {
    if (this.locked || size === this.board.size) return
    const keepTarget = this.state.targetBoard?.size === size
    this.set({
      history: push(commit(this.state.history), resizeBoard(this.board, size)),
      ...(keepTarget ? {} : { target: null, targetBoard: null }),
    })
  }

  /** Completion bookkeeping after any committed change. */
  private afterChange(): void {
    const target = this.state.targetBoard
    if (!target) return
    const done = completion(this.board, target).done
    if (done && this.state.celebrateAt === null) this.set({ celebrateAt: this.now(), overlay: 'done' }, false)
    else if (!done && this.state.celebrateAt !== null) this.set({ celebrateAt: null, overlay: this.state.overlay === 'done' ? null : this.state.overlay }, false)
  }

  // ── patterns ──────────────────────────────────────────────────────
  /** Start following a pattern on a fresh board of its size (undoable). */
  follow(target: string): void {
    const board = resolveTarget(target)
    if (!board) return
    const fresh = createBoard(board.size)
    this.last = null
    this.set({
      mode: 'play',
      history: push(commit(this.state.history), fresh),
      target, targetBoard: board, ironed: false, ironingSince: null, celebrateAt: null,
      color: firstColor(fresh, board, this.state.color),
      tool: 'paint',
      overlay: this.state.coached ? null : 'coach',
    })
  }

  leaveTarget(): void { this.set({ target: null, targetBoard: null, celebrateAt: null }) }

  /** Put every pattern bead in place (AI patterns: "fill board"). Undoable. */
  fillTarget(): void {
    const target = this.state.targetBoard
    if (!target || this.locked) return
    const cells = this.board.cells.map((c, i) => (target.cells[i] === EMPTY ? c : target.cells[i]!))
    this.set({ history: push(commit(this.state.history), { size: this.board.size, cells: Object.freeze(cells) }) })
    this.afterChange()
  }

  // ── ironing ───────────────────────────────────────────────────────
  iron(): void {
    if (this.locked || this.board.cells.every(c => c === EMPTY)) return
    const finish = (): void => {
      this.ironHandle = null
      const t = this.state.target
      const done = t !== null && findTemplate(t) !== undefined && this.state.celebrateAt !== null && !this.state.done.includes(t)
        ? [...this.state.done, t] : this.state.done
      this.set({ ironed: true, ironingSince: null, overlay: 'result', done })
    }
    this.last = null
    this.set({ history: commit(this.state.history), overlay: null })
    if (this.deps.reducedMotion?.() ?? false) { finish(); return }
    this.set({ ironingSince: this.now() }, false)
    this.ironHandle = this.st(finish, IRON_MS)
  }

  unIron(): void {
    if (this.state.ironingSince !== null || !this.state.ironed) return
    this.set({ ironed: false, overlay: null })
  }

  /** "Make another": back to the start page with the ironed piece kept for undo. */
  again(): void {
    this.set({ mode: 'home', overlay: null })
  }

  // ── AI ────────────────────────────────────────────────────────────
  setAiPrompt(prompt: string): void { this.setAi({ prompt: prompt.slice(0, 120), ...(this.state.ai.phase === 'error' ? { phase: 'idle', error: undefined } : {}) }) }
  setAiSize(size: AiSize): void { this.setAi({ size }) }

  async probeStatus(): Promise<void> {
    if (!this.deps.api) { this.setAi({ status: { configured: false, route: 'none' } }); return }
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
      this.setAi({
        phase: 'error', error,
        ...(error === 'not-configured' ? { status: { configured: false, route: 'none' as const } } : {}),
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

  /** A generated pattern becomes the faint guide on a fresh board, like a template. */
  private finishAi(result: AiResult): void {
    this.set({ ai: { ...this.state.ai, phase: 'done', error: undefined, result }, fresh: !this.state.panelVisible }, false)
    this.follow(`ai:${result.board.size}:${encode(result.board)}`)
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
    && !(s.target !== null && s.done.includes(s.target))
  return unfinished ? 'progress' : null
}
