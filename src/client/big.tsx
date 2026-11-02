/**
 * Big boards (plan §2–§4): the lazy chunk lib/client.big.js behind 「更多尺寸」.
 * A setup page (presets 29–116, w × h, a share code or pattern file, continue)
 * and the canvas page: toolbar, the canvas (big-canvas.ts) with zoom buttons and
 * minimap, status line, palette, block list and sharing. Progress autosaves to
 * IndexedDB (save-store.ts: when a block is done and 2 s after the last edit);
 * where a board cannot be saved the page says so up front.
 *
 * It may not import the entry's modules (scripts/async-chunks.ts): the palette
 * and the PNG export come in through `kit`, and it carries its own strings,
 * icons and styles.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { blank, EMPTY } from '../core/big-board.ts'
import type { Board } from '../core/board.ts'
import type { SaveStore } from '../core/save-store.ts'
import { BigCanvas, pxShown, type View } from './big-canvas.ts'
import { BigGame, type BigTool } from './big-game.ts'
import { BIG_CSS } from './big-styles.ts'
import type { Env } from './ui/context.tsx'
import type { BigKit } from './ui/Big.tsx'

const STRINGS = {
  zh: {
    title: '更多尺寸', presets: '实体钉板', custom: '自定义', w: '宽', h: '高', unit: '分块', none: '不分块', start: '开始',
    range: '宽和高都在 8–116 之间', long: '58 及以上要拼 20 分钟以上，会自动存档。',
    code: '分享码', codeHint: '粘贴 pd2: 开头的分享码', open: '导入', file: '从文件导入', bad: '读不出这个分享码',
    resume: '继续上次', newGame: '新建', share: '分享', copy: '复制分享码', copied: '已复制分享码', exportFile: '导出图纸文件',
    tooLong: '图案太大，分享码放不下，请改用文件分享', making: '生成中…', png: '导出 PNG', saveFailed: '保存失败，进度只在内存里',
    tools: '工具', paint: '画笔', erase: '橡皮', pick: '吸管', fill: '填充', undo: '撤销', redo: '重做', clear: '清空', cleared: '已清空',
    zoomIn: '放大', zoomOut: '缩小', fit: '适合大小', map: '小地图', colors: '颜色', blocks: '块列表', next: '下一块',
    whole: '全图', px: '{n} px/格', at: '第 {y} 行第 {x} 列', empty: '空', want: '图纸要 {c}', wrong: '放错了，图纸要 {c}', done: '{b} 完成！按 N 去下一块', allDone: '全部完成',
    cell: '{b} 板，{at}，{v}', board: '{w}×{h} 画布。方向键移动，空格或回车放豆，Delete 擦除，Shift+方向键跳一块，N 下一块，+ − 0 缩放，M 小地图，L 块列表',
    libFail: '这部分没加载出来，请稍后再试', only: '只看本色', loading: '正在读取存档…', noStore: '浏览器存储不可用，进度不会保存', held: '本次进度不会保存', close: '关闭', pos: '列 {x} 行 {y}', more: '更多', wide: '拖宽侧栏体验更好', noLib: '这部分没加载出来，这次的进度不会保存', retry: '重试',
  },
  en: {
    title: 'More sizes', presets: 'Pegboards', custom: 'Custom', w: 'Width', h: 'Height', unit: 'Blocks', none: 'One block', start: 'Start',
    range: 'Width and height: 8–116', long: 'Boards of 58 and up take 20+ minutes; progress saves itself.',
    code: 'Share code', codeHint: 'Paste a code starting with pd2:', open: 'Import', file: 'Import a file', bad: 'Can’t read that share code',
    resume: 'Continue', newGame: 'New', share: 'Share', copy: 'Copy share code', copied: 'Share code copied', exportFile: 'Export pattern file',
    tooLong: 'This pattern is too big for a share code. Share it as a file instead.', making: 'Making…', png: 'Export PNG', saveFailed: 'Couldn’t save; progress is only in memory.',
    tools: 'Tools', paint: 'Brush', erase: 'Eraser', pick: 'Picker', fill: 'Fill', undo: 'Undo', redo: 'Redo', clear: 'Clear', cleared: 'Board cleared',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', map: 'Minimap', colors: 'Colours', blocks: 'Blocks', next: 'Next block',
    whole: 'Whole', px: '{n} px/cell', at: 'row {y}, column {x}', empty: 'empty', want: 'pattern wants {c}', wrong: 'Wrong bead: the pattern wants {c}', done: '{b} done! Press N for the next block', allDone: 'All done',
    cell: 'Block {b}, {at}, {v}', board: '{w}×{h} board. Arrows move, Space or Enter places, Delete erases, Shift+arrows jump a block, N next block, + − 0 zoom, M minimap, L block list',
    libFail: 'This part didn’t load. Try again later.', only: 'This colour only', loading: 'Reading saves…', noStore: 'Browser storage unavailable — progress will not be saved', held: 'Progress this session will not be saved', close: 'Close', pos: 'col {x} row {y}', more: 'More', wide: 'Drag the sidebar wider for a better view', noLib: 'This part didn’t load — progress this time will not be saved', retry: 'Retry',
  },
} as const
type Key = keyof (typeof STRINGS)['zh']

const STYLE_ID = 'dsh-pindou-big-styles'
const SAVE_ID = 'big'
const TARGET_ID = 'big-t'
/** Preset side → the board it is built from (plan §2.2): one board, or n × n of a smaller one. */
const PRESETS: ReadonlyArray<[number, number]> = [[29, 29], [52, 52], [57, 57], [58, 29], [78, 78], [87, 29], [104, 52], [116, 29]]
const presetLabel = (n: number, u: number, zh: boolean): string => {
  const k = n / u
  return k > 1 ? (zh ? `${u} 板 ${k}×${k}` : `${k}×${k} of ${u}`) : `${n === 29 ? 5 : 2.6} mm ${zh ? '钉板' : 'board'}`
}
const UNITS = [29, 52, 57, 78, 104, 14, 16, 50, 0]
export const UI_MAX = 116

type T = (k: Key, p?: Record<string, string | number>) => string
const tr = (lang: 'zh' | 'en'): T => (k, p) => STRINGS[lang][k].replaceAll(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? ''))

/** lib/client.big-store.js (saves and share codes); fetched once, again after a failure. */
type Lib = typeof import('./big-store.ts')
let lib: Lib | undefined
let libP: Promise<Lib> | undefined
const loadLib = (): Promise<Lib> => (libP ??= import('./big-store.ts').then((m) => { lib = m; return m }, (e: unknown) => { libP = undefined; throw e }))
// preloaded once the big chunk is idle (the setup asks for it on mount anyway; until it lands it shows its skeleton)
;(globalThis.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 50)))(() => { loadLib().catch(() => {}) })
let store: Promise<SaveStore> | undefined
/** One save store per session, opened on first use; null when its chunk can't load (no saves this time). */
const openStore = (): Promise<SaveStore | null> => (store ??= loadLib().then(m => m.openStore())).catch(() => { store = undefined; return null })

/** The store: undefined while it opens, null when its chunk didn't load; and a retry (that chunk again). */
function useStore(): [SaveStore | null | undefined, () => Promise<SaveStore | null>] {
  const [s, set] = useState<SaveStore | null>()
  const open = (): Promise<SaveStore | null> => openStore().then((r) => { set(r); return r })
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  useEffect(() => { void open() }, [])
  return [s, open]
}

// tool order: paint, erase, pick, fill (kit.icons follows it, then undo, redo, clear, png)
const TOOLS: ReadonlyArray<[BigTool, string, Key]> = [['paint', 'B', 'paint'], ['erase', 'E', 'erase'], ['pick', 'I', 'pick'], ['fill', 'G', 'fill']]

/** Save the game with what resumes it: blocks, colour, whether there is a pattern. */
const saveGame = (st: SaveStore, g: BigGame): ReturnType<SaveStore['save']> => { const { unit, color, target } = g.get(); return st.save(SAVE_ID, g.board, { u: unit, c: color, t: target ? 1 : 0 }) }
/** Arrow keys in a palette or list: right and down go forward, left and up back. */
const arrow = (k: string): number => (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0)
/** The 「拖宽侧栏体验更好」 hint was shown. */
const HINT_KEY = 'dsh-pindou:big-hint'

const isTyping = (el: EventTarget | null): boolean => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

function download(name: string, blob: Blob): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href) }, 1000)
}

interface Start { readonly board: Board; readonly target: Board | null; readonly unit: number; readonly color?: number }

export function BigPage({ env, kit }: { readonly env: Env; readonly kit: BigKit }): ReactElement {
  useLayoutEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = BIG_CSS
    document.head.append(el)
  }, [])
  const [st, retry] = useStore()
  const [game, setGame] = useState<BigGame | null>(null)
  // the saves usually open at once; a slow IndexedDB gets a skeleton after 300 ms (and gives up at 2 s, openDb)
  const [slow, setSlow] = useState(false)
  // 浏览器存储不可用: once per open of this page, dismissible, never in the way
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => { setSlow(true) }, 300)
    return () => { clearTimeout(id) }
  }, [])
  const t = tr(env.lang)
  const start = (s: Start, fresh: boolean): void => {
    const g = new BigGame(s.board, s.target, s.unit, s.color)
    setGame(g)
    if (!fresh || !st) return
    void saveGame(st, g)
    if (s.target) void st.save(TARGET_ID, s.target)
    else void st.remove(TARGET_ID)
  }
  return (
    <div className="pd-view pd-bk">
      {(st === null || st?.status().backend === 'memory') && !closed
        ? (
          <p className="pd-bk-note pd-bk-bar" role="status">
            {/* the store chunk didn't load (storage itself is fine): say so, and 重试 fetches it again; once it is
                here the board in play is saved at once and from then on (designer recheck R5) */}
            <span>{t(st ? 'noStore' : 'noLib')}</span>
            {st ? null : <button type="button" className="pd-btn" onClick={() => { void retry().then((r) => { if (r && game && r.canSave(game.board.w, game.board.h)) void saveGame(r, game) }) }}>{t('retry')}</button>}
            <button type="button" className="pd-ib" aria-label={t('close')} title={t('close')} onClick={() => { setClosed(true) }}>×</button>
          </p>
        )
        : null}
      {/* the store chunk not here yet: the skeleton at once, never a blank page; IDB only slow: after 300 ms */}
      {st === undefined
        ? (slow || !lib ? <div className="pd-bk-load" role="status"><div className="pd-bk-skel" aria-hidden />{t('loading')}</div> : null)
        : game
          ? <Play env={env} kit={kit} t={t} game={game} st={st} onNew={() => { setGame(null) }} />
          : <Setup t={t} env={env} st={st} onStart={start} />}
    </div>
  )
}

function Notice({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="pd-bk-note" role="status">{children}</p>
}

function Setup({ t, env, st, onStart }: { readonly t: T; readonly env: Env; readonly st: SaveStore | null; readonly onStart: (s: Start, fresh: boolean) => void }): ReactElement {
  const [w, setW] = useState('40')
  const [h, setH] = useState('30')
  const [unit, setUnit] = useState(29)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState<{ start: Start; label: string } | null>(null)
  const uid = useId()
  useEffect(() => {
    if (!st) return
    void st.load(SAVE_ID).then(async (r) => {
      if (!r) return
      const m = (r.meta ?? {}) as { u?: number; c?: number; t?: number }
      const tg = m.t ? (await st.load(TARGET_ID))?.board : undefined
      const target = tg && tg.w === r.board.w && tg.h === r.board.h ? tg : null
      setSaved({ start: { board: r.board, target, unit: Number.isInteger(m.u) ? m.u! : 29, color: Number.isInteger(m.c) ? m.c! : 4 }, label: `${r.board.w}×${r.board.h}` })
    })
  }, [st])
  const custom = (): void => {
    const W = Number(w), H = Number(h)
    if (![W, H].every(n => Number.isInteger(n) && n >= 8 && n <= UI_MAX)) { setErr(t('range')); return }
    onStart({ board: blank(W, H), target: null, unit }, true)
  }
  const load = async (text: string): Promise<void> => {
    const m = await loadLib().catch(() => null)
    if (!m) { setErr(t('libFail')); return }
    const b = await m.parseShareCode(text)
    if (!b || Math.max(b.w, b.h) > UI_MAX) { setErr(t('bad')); return }
    onStart({ board: blank(b.w, b.h), target: b, unit: b.w > 29 || b.h > 29 ? 29 : 0 }, true)
  }
  // IDB missing or broken: the full notice up front. IDB only slow this time (2 s timeout): nothing,
  // and one quiet line once a custom size over 58 is typed in (plan 修订 20:25)
  const s0 = st?.status()
  const local = s0?.backend === 'local'
  // a save that could not be backed up: said here for the whole session, till a backup works (designer 22:05),
  // in this chunk's own words, so it never waits for lib/client.notice.js
  const held = env.store.getSnapshot().storage
  return (
    <>
      <h2>{t('title')}</h2>
      {held === 'held' ? <Notice>{t('held')}</Notice> : null}
      {local && !s0.slow ? <Notice>{lib!.UNSAVED_TOO_BIG[env.lang]}</Notice> : null}
      {saved
        ? <button type="button" className="pd-btn pd-primary pd-bk-wide" onClick={() => { onStart(saved.start, false) }}>{t('resume')} · {saved.label}</button>
        : null}
      <h3 className="pd-sec">{t('presets')}</h3>
      <div className="pd-bk-sizes">
        {PRESETS.map(([n, u]) => (
          <button key={n} type="button" className="pd-btn" onClick={() => { onStart({ board: blank(n, n), target: null, unit: u }, true) }}>
            <b>{n}×{n}</b><span>{presetLabel(n, u, env.lang === 'zh')}</span>
          </button>
        ))}
      </div>
      <p className="pd-tokens">{t('long')}</p>
      <h3 className="pd-sec">{t('custom')}</h3>
      <div className="pd-bk-form">
        <label>{t('w')}<input type="number" min={8} max={UI_MAX} value={w} onChange={(e) => { setW(e.target.value) }} /></label>
        <span aria-hidden>×</span>
        <label>{t('h')}<input type="number" min={8} max={UI_MAX} value={h} onChange={(e) => { setH(e.target.value) }} /></label>
        <label>{t('unit')}
          <select value={unit} onChange={(e) => { setUnit(Number(e.target.value)) }}>
            {UNITS.map(u => <option key={u} value={u}>{u || t('none')}</option>)}
          </select>
        </label>
        <button type="button" className="pd-btn" onClick={custom}>{t('start')}</button>
      </div>
      {local && s0.slow && !st!.canSave(Number(w), Number(h)) ? <p className="pd-tokens" role="status">{lib!.UNSAVED_SLOW[env.lang]}</p> : null}
      <h3 className="pd-sec"><label htmlFor={uid}>{t('code')}</label></h3>
      <div className="pd-bk-form">
        <textarea id={uid} rows={2} value={code} placeholder={t('codeHint')} onChange={(e) => { setCode(e.target.value); setErr('') }} />
        <button type="button" className="pd-btn" disabled={!code.trim()} onClick={() => { void load(code) }}>{t('open')}</button>
        <label className="pd-btn">{t('file')}<input type="file" className="pd-sr" accept=".txt,text/plain" onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void f.text().then(load)
        }} /></label>
      </div>
      {err ? <p className="pd-bk-err" role="alert">{err}</p> : null}
    </>
  )
}

interface PlayProps { readonly env: Env; readonly kit: BigKit; readonly t: T; readonly game: BigGame; readonly st: SaveStore | null; readonly onNew: () => void }

function Play({ env, kit, t, game, st, onNew }: PlayProps): ReactElement {
  const s = useSyncExternalStore(game.subscribe, game.get)
  const board = s.history.present
  const ic = (n: number): ReactElement => { const C = kit.icons[n]!; return <C /> }
  const target = s.target
  const { w, h } = board
  const lang = env.lang
  const hostRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDetailsElement>(null)
  const ctl = useRef<BigCanvas | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [live, setLive] = useState('')
  const [toast, setToast] = useState(false)
  const [mini, setMini] = useState(true)
  const [share, setShare] = useState<string | null | false>(false)
  const [saveErr, setSaveErr] = useState(false)
  const [active, setActive] = useState(0)
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  // the 「更多」 menu closes back onto its button: Escape and its items never leave focus on a hidden one (recheck R2)
  const fold = (): void => { setMore(false); moreRef.current?.focus() }
  const [hint, setHint] = useState(false)
  const uid = useId().replaceAll(':', '')
  const pal = kit.palette

  // the canvas controller lives as long as this page; React only resizes it
  useLayoutEffect(() => {
    const c = new BigCanvas(hostRef.current!, cvRef.current!, miniRef.current!, game, pal.map(p => p.hex), setView)
    ctl.current = c
    ;(hostRef.current as unknown as { pd?: BigCanvas }).pd = c
    const wrap = wrapRef.current!
    const scroller = wrap.closest<HTMLElement>('.pd-scroll')
    const viewEl = wrap.closest<HTMLElement>('.pd-view')
    const measure = (): void => {
      const box = wrap.getBoundingClientRect().height
      const others = viewEl ? viewEl.getBoundingClientRect().height - box : 0
      const ch = Math.round(Math.max(240, Math.min(1200, (scroller?.clientHeight ?? 600) - others)))
      if (wrap.clientWidth > 0 && (wrap.clientWidth !== c.cw || ch !== c.ch)) {
        wrap.style.height = `${ch}px`
        c.resize(wrap.clientWidth, ch)
      }
    }
    if (wrap.clientWidth < 360) setMini(false)
    // a big board in a narrow panel: once, ever, a quiet line suggests a wider sidebar (review I4); narrow is the
    // panel's own width ≤ 340, the container query that folds the toolbar (recheck R4: a 360 sidebar is not)
    if ((wrap.closest('.pd-root')?.clientWidth ?? 0) <= 340) {
      try { const ls = localStorage; if (Math.max(game.board.w, game.board.h) >= 58 && !ls.getItem(HINT_KEY)) { ls.setItem(HINT_KEY, '1'); setHint(true) } } catch { /* storage blocked */ }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    if (scroller) ro.observe(scroller)
    return () => { ro.disconnect(); c.dispose() }
  }, [game, pal])

  useEffect(() => { if (mini) ctl.current?.paint() }, [mini])

  const blocks = game.blocks()
  const cur = blocks.find(b => s.cx >= b.x0 && s.cx < b.x1 && s.cy >= b.y0 && s.cy < b.y1) ?? blocks[0]!
  const stats = useMemo(() => {
    let all = 0, ok = 0
    const left = new Map<number, number>()
    board.cells.forEach((v, i) => {
      const tg = target ? target.cells[i]! : 0
      if (tg === EMPTY) { if (v !== EMPTY) all++; return }
      all++
      if (target ? v === tg : v !== EMPTY) ok++
      else if (target) left.set(tg, (left.get(tg) ?? 0) + 1)
    })
    return { pct: all ? Math.floor((ok * 100) / all) : 100, left }
  }, [board, target])
  const colorName = (c: number): string => `${c.toString(16)} ${lang === 'zh' ? pal[c]!.zh : pal[c]!.en}`

  // read out the cursor cell after a keyboard move; a wrong bead and a finished block too (plan §3.6)
  const prev = useRef({ board, cx: s.cx, cy: s.cy, done: new Set(blocks.filter(b => b.pct === 100).map(b => b.name)) })
  useEffect(() => {
    const p = prev.current
    const i = s.cy * w + s.cx, v = board.cells[i]!, tg = target?.cells[i] ?? EMPTY
    const done = new Set(blocks.filter(b => b.pct === 100).map(b => b.name))
    const fresh = board !== p.board ? blocks.find(b => b.pct === 100 && !p.done.has(b.name)) : undefined
    let say = ''
    if (fresh && board.cells.some(c => c !== EMPTY)) say = t('done', { b: fresh.name })
    else if (board !== p.board && ctl.current?.kbd && target && v !== EMPTY && v !== tg) say = t('wrong', { c: tg === EMPTY ? t('empty') : colorName(tg) })
    else if ((p.cx !== s.cx || p.cy !== s.cy) && ctl.current?.kbd) {
      say = t('cell', { b: cur.name, at: t('at', { y: s.cy + 1, x: s.cx + 1 }), v: v === EMPTY ? t('empty') : colorName(v) })
      if (tg !== EMPTY && tg !== v) say += `，${t('want', { c: colorName(tg) })}`
    }
    if (say) setLive(say)
    prev.current = { board, cx: s.cx, cy: s.cy, done }
    // autosave: at once when a block is done, else 2 s after the last edit
    if (board === p.board || !st || !st.canSave(w, h)) return
    const save = (): void => { void saveGame(st, game).then((r) => { setSaveErr(!r.ok) }) }
    if (fresh) { save(); return }
    const id = setTimeout(save, 2000)
    return () => { clearTimeout(id) }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs per board or cursor change; the rest is read fresh from this render
  }, [board, s.cx, s.cy])
  // leaving the page saves what the 2 s timer has not
  useEffect(() => () => {
    if (st?.canSave(game.board.w, game.board.h)) void saveGame(st, game)
  }, [game, st])

  const nextBlock = (d: 1 | -1): void => {
    const n = blocks.length, at = blocks.indexOf(cur)
    for (let k = 1; k <= n; k++) {
      const b = blocks[(((at + d * k) % n) + n) % n]!
      if (b.pct < 100) {
        jump(b)
        return
      }
    }
    setLive(t('allDone'))
  }
  const jump = (b: (typeof blocks)[number]): void => {
    const c = ctl.current!
    c.kbd = true
    game.set({ cx: b.x0, cy: b.y0 })
    c.showBlock(b.x0, b.y0, b.x1, b.y1)
    hostRef.current?.focus()
  }
  const clear = (): void => { if (game.clear()) setToast(true) }

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && more) { e.stopPropagation(); fold(); return }
    if (e.key === 'Escape' && share !== false) { e.stopPropagation(); setShare(false); return }
    if (isTyping(e.target)) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) game.redo(); else game.undo(); return }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); game.redo(); return }
    if (e.target === hostRef.current && !e.altKey && ctl.current?.key(e.nativeEvent)) return
    if (mod || e.altKey) return
    const k = e.key.toLowerCase()
    const tool = ({ b: 'paint', e: 'erase', i: 'pick', g: 'fill' } as const)[k as 'b']
    if (tool) game.set({ tool })
    else if (k === 'f') game.applyAt(s.cx, s.cy, 'fill')
    else if (k === 'o') game.set({ only: !s.only })
    else if (k === 'n') nextBlock(e.shiftKey ? -1 : 1)
    else if (k === 'm') setMini(m => !m)
    else if (k === 'l') { listRef.current!.open = true; listRef.current!.querySelector<HTMLElement>('[role=listbox]')?.focus() }
    else if (e.key === '[' || e.key === ']') game.set({ color: (s.color + (e.key === ']' ? 1 : 15)) % 16 })
    else {
      const d = /^Digit([1-9])$/.exec(e.code)
      if (!d) return
      const n = Number(d[1])
      const c = e.shiftKey ? (n <= 6 ? 9 + n : -1) : n - 1
      if (c < 0) return
      game.set({ color: c, tool: s.tool === 'erase' || s.tool === 'pick' ? 'paint' : s.tool })
    }
    e.preventDefault()
  }

  const openShare = (): void => {
    if (share !== false) { setShare(false); return }
    setShare(null)
    // measured up front: the length decides copy vs file before anyone clicks (plan §4.3)
    void loadLib().then(m => m.encodeV4(board), () => '').then(setShare)
  }
  const fileName = `bead-break-${w}x${h}.pd2.txt`
  const sv = st?.status()
  // a board this page cannot save, on the localStorage fallback: IDB missing (card) or only slow (a quiet line)
  const local = st && !st.canSave(w, h) && sv?.backend === 'local', slow = sv?.slow
  // the cell's CSS px, rounded to a whole number at every dpr (designer: no decimals, no 「约」); read aloud the same
  const level = view ? pxShown(view.s) : 0

  return (
    <div className="pd-bk-play" onKeyDown={onKey}>
      <div className="pd-bk-top">
        <strong>{w}×{h}{s.unit ? ` · ${s.unit}` : ''}</strong>
        <span className="pd-spacer" />
        <button type="button" className="pd-btn" aria-expanded={share !== false} onClick={openShare}>{t('share')}</button>
        <button type="button" className="pd-btn" onClick={onNew}>{t('newGame')}</button>
      </div>
      {local && !slow ? <Notice>{lib!.UNSAVED_TOO_BIG[lang]}</Notice> : saveErr ? <Notice>{t('saveFailed')}</Notice> : null}
      {share !== false
        ? (
          <div className="pd-bk-share">
            {share === null
              ? <span className="pd-tokens">{t('making')}</span>
              : !share
                ? <span className="pd-tokens" role="alert">{t('libFail')}</span>
                : lib!.shareCodeFits(share)
                ? <button type="button" className="pd-btn" onClick={() => { void navigator.clipboard?.writeText(share).then(() => { env.store.showToast('say', false, { s: t('copied') }) }, () => {}) }}>{t('copy')}</button>
                : (<>
                  <button type="button" className="pd-btn" onClick={() => { download(fileName, new Blob([share], { type: 'text/plain' })) }}>{t('exportFile')}</button>
                  <span className="pd-tokens">{t('tooLong')}</span>
                </>)}
          </div>
        )
        : null}
      <div className="pd-tools" role="toolbar" aria-label={t('tools')}>
        {TOOLS.map(([tool, key, label], n) => (
          <button key={tool} type="button" className="pd-tool" aria-pressed={s.tool === tool} aria-label={t(label)} aria-keyshortcuts={key} title={`${t(label)} (${key})`}
            onClick={() => { game.set({ tool }) }}>
            {ic(n)}
            {tool === 'paint' ? <span className="pd-cur-swatch" style={{ '--pd-c': pal[s.color]!.hex } as CSSProperties} /> : null}
          </button>
        ))}
        <span className="pd-sep" aria-hidden />
        <button type="button" className="pd-tool" aria-label={t('undo')} title={`${t('undo')} (⌘Z)`}
          disabled={!game.canUndo} onClick={() => { game.undo() }}>{ic(4)}</button>
        <button type="button" className="pd-tool" aria-label={t('redo')} title={`${t('redo')} (⇧⌘Z)`}
          disabled={!game.canRedo} onClick={() => { game.redo() }}>{ic(5)}</button>
        <span className="pd-sep" aria-hidden />
        {/* a narrow panel keeps one row: clear and export fold under 「更多」 (review I4, plan §3.1 fig. 3) */}
        <button ref={moreRef} type="button" className="pd-tool pd-bk-more" aria-label={t('more')} title={t('more')} aria-expanded={more} aria-controls={`${uid}-x`} onClick={() => { setMore(!more) }}>⋯</button>
        {/* the open menu: icon + text (recheck R3); it handles its own Escape */}
        <span id={`${uid}-x`} className={more ? 'pd-bk-x pd-on' : 'pd-bk-x'} onKeyDown={(e) => { if (e.key === 'Escape' && more) { e.stopPropagation(); fold() } }}>
          <button type="button" className="pd-tool" aria-label={t('clear')} title={t('clear')}
            disabled={board.cells.every(c => c === EMPTY)} onClick={() => { fold(); clear() }}>{ic(6)}<span className="pd-bk-l" aria-hidden>{t('clear')}</span></button>
          <button type="button" className="pd-tool" aria-label={t('png')} title={t('png')}
            disabled={board.cells.every(c => c === EMPTY)} onClick={() => { fold(); kit.exportBoard(env, { board, target: null }) }}>{ic(7)}<span className="pd-bk-l" aria-hidden>{t('png')}</span></button>
        </span>
      </div>
      {hint ? <p className="pd-tokens pd-bk-bar" role="status"><span>{t('wide')}</span><button type="button" className="pd-ib" aria-label={t('close')} onClick={() => { setHint(false) }}>×</button></p> : null}
      {/* IDB only slow this time: one line of secondary text under the toolbar, no card (designer S1, plan 修订 21:35) */}
      {local && slow ? <p className="pd-tokens" role="status">{lib!.UNSAVED_SLOW[lang]}</p> : null}
      <div className="pd-bk-cv" ref={wrapRef}>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the canvas widget: focusable for the keys its label lists */}
        <div ref={hostRef} className="pd-bk-app" role="application" tabIndex={0} aria-label={t('board', { w, h })}>
          <canvas ref={cvRef} />
        </div>
        <div className="pd-bk-zoom">
          <button type="button" className="pd-ib" aria-label={t('zoomOut')} title={`${t('zoomOut')} (−)`} onClick={() => { ctl.current?.step(-1) }}>−</button>
          <button type="button" className="pd-ib" aria-label={t('fit')} title={`${t('fit')} (0)`} onClick={() => { const c = ctl.current; c?.setView(c.fitView()) }}>⤢</button>
          <button type="button" className="pd-ib" aria-label={t('zoomIn')} title={`${t('zoomIn')} (+)`} onClick={() => { ctl.current?.step(1) }}>+</button>
        </div>
        <button type="button" className="pd-ib pd-bk-mm" aria-label={t('map')} aria-pressed={mini} title={`${t('map')} (M)`} onClick={() => { setMini(m => !m) }}>▦</button>
        <canvas ref={miniRef} className={mini ? 'pd-bk-mini' : 'pd-bk-mini pd-off'} aria-hidden />
      </div>
      <div className="pd-bk-st">
        <span>{cur.name} · {cur.pct}%</span>
        <span>{t('whole')} {stats.pct}%</span>
        <button type="button" className="pd-btn" onClick={() => { nextBlock(1) }}>{t('next')}</button>
        <span className="pd-spacer" />
        <span>{t('pos', { x: s.cx + 1, y: s.cy + 1 })}</span>
        {level ? <span className="pd-bk-px" aria-label={t('px', { n: level })}>{t('px', { n: level })}</span> : null}
        {target
          ? <button type="button" className="pd-btn" aria-pressed={s.only} onClick={() => { game.set({ only: !s.only }) }}>{t('only')}</button>
          : null}
      </div>
      <div className="pd-palette" role="radiogroup" aria-label={t('colors')}>
        {pal.map((p, i) => {
          const left = stats.left.get(i) ?? 0
          const used = target ? target.cells.includes(i) : false
          return (
            <button key={p.code} type="button" role="radio" aria-checked={s.color === i} tabIndex={s.color === i ? 0 : -1}
              aria-label={colorName(i)} title={colorName(i)}
              className={target && !used ? 'pd-sw pd-dim' : 'pd-sw'} style={{ '--pd-c': p.hex } as CSSProperties}
              onClick={() => { game.set({ color: i }) }}
              onKeyDown={(e) => {
                const d = arrow(e.key)
                if (!d) return
                e.preventDefault()
                e.stopPropagation()
                const n = (i + d * (e.key === 'ArrowDown' || e.key === 'ArrowUp' ? 8 : 1) + 16) % 16
                game.set({ color: n })
                ;((e.currentTarget.parentElement!.children[n]) as HTMLElement).focus()
              }}>
              <span className="pd-swb" aria-hidden />
              <span className="pd-k" aria-hidden>{p.code}</span>
              {used ? <span className={left ? 'pd-cnt' : 'pd-cnt pd-ok'} aria-hidden>{left || '✓'}</span> : null}
            </button>
          )
        })}
      </div>
      <details className="pd-bk-blocks" ref={listRef}>
        <summary>{t('blocks')}</summary>
        <div role="listbox" tabIndex={0} aria-label={t('blocks')} aria-activedescendant={`${uid}-b${active}`}
          onClick={(e) => {
            const i = Number((e.target as HTMLElement).closest<HTMLElement>('[role=option]')?.dataset.i ?? -1)
            if (blocks[i]) { setActive(i); jump(blocks[i]) }
          }}
          onKeyDown={(e) => {
            const d = arrow(e.key)
            if (d) { e.preventDefault(); e.stopPropagation(); setActive(a => Math.max(0, Math.min(blocks.length - 1, a + d))) }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); jump(blocks[active]!) }
          }}>
          {blocks.map((b, i) => (
            <div key={b.name} id={`${uid}-b${i}`} role="option" tabIndex={-1} data-i={i} aria-selected={i === active}>{b.name} · {b.pct}%</div>
          ))}
        </div>
      </details>
      <div className="pd-sr" aria-live="polite">{live}</div>
      {toast ? <Toast t={t} onUndo={() => { game.undo(); hostRef.current?.focus() }} onDone={() => { setToast(false) }} /> : null}
    </div>
  )
}

/** 已清空 with 撤销, like the first screen's toast (5 s; an undo or a new toast closes it). */
function Toast({ t, onUndo, onDone }: { readonly t: T; readonly onUndo: () => void; readonly onDone: () => void }): ReactElement {
  useEffect(() => {
    const id = setTimeout(onDone, 5000)
    return () => { clearTimeout(id) }
  }, [onDone])
  return (
    <div className="pd-toast" role="status">
      <span>{t('cleared')}</span>
      <button type="button" onClick={() => { onDone(); onUndo() }}>{t('undo')}</button>
    </div>
  )
}
