/**
 * The works wall (spec §18.4, U1). This module is the lazy chunk
 * lib/client.works.js: the wall page, the home row's thumbnails, the detail
 * card and the delete-with-undo toast. Collecting on iron and withdrawing on
 * un-iron are the store's job (game-store.ts), so they never wait for this chunk.
 *
 * It may not import the entry's modules (scripts/async-chunks.ts): the store,
 * the bead renderer, the decoder and the export/copy actions come in through
 * `kit` (types only are imported), and it carries its own strings and styles.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { StoredWork, Template } from '../core/index.ts'
import { DAILY_DEFS, dailyDate, dailyDay, dailyDayOf, dailyIndex, dailyStreak } from '../core/daily.ts'
import { addWork, cleanWorks, removeWork, type Work } from '../core/works.ts'
import type { Env } from './ui/context.tsx'
import type { WorksKit } from './ui/Works.tsx'
import { WORKS_CSS } from './works-styles.ts'

const STRINGS = {
  zh: {
    wall: '我的作品', empty: '熨烫过的作品会住在这里', go: '去拼一个', tpl: '模板', free: '自由拼', ai: 'AI 生成', picture: '图片转图纸',
    export: '导出 PNG', copy: '复制图片', again: '再拼一次', del: '删除', close: '关闭', deleted: '已删除作品', undo: '撤销', all: '全部 ›', resumed: '接着上次没拼完的',
    daily: '今日一拼', start: '开始', goOn: '继续', redo: '再拼一次', streak: '连续 {n} 天', note: '删除后连续天数会重新计算',
  },
  en: {
    wall: 'My works', empty: 'Your ironed pieces will live here', go: 'Make one', tpl: 'Pattern', free: 'Free play', ai: 'AI pattern', picture: 'Picture',
    export: 'Export PNG', copy: 'Copy image', again: 'Bead it again', del: 'Delete', close: 'Close', deleted: 'Work deleted', undo: 'Undo', all: 'All ›', resumed: 'Picked up where you left off.',
    daily: 'Daily', start: 'Start', goOn: 'Continue', redo: 'Again', streak: '{n}-day streak', note: 'Your streak will be recalculated.',
  },
} as const
export const WORKS_STRINGS = STRINGS

const STYLE_ID = 'dsh-pindou-works-styles'
/** Spec §18.4: the delete toast stays 5 s (paused while hovered or focused), like 清空. */
export const UNDO_MS = 5000
/** Home row: 56px thumbnails, 8px apart. */
const THUMB = 56
const GAP = 8

/** What every part of the chunk gets from the entry. */
export interface WorksProps {
  readonly env: Env
  readonly kit: WorksKit
  /** The wall as the entry holds it (ids checked only). */
  readonly wall: readonly StoredWork[]
}

/**
 * The valid works, oldest first. A wall with broken entries is written back
 * cleaned (only the broken ones go), once, from an effect.
 */
function useWorks({ env, wall }: WorksProps): readonly Work[] {
  const clean = useMemo(() => cleanWorks(wall), [wall])
  useEffect(() => { if (clean.dropped) env.store.setWall(clean.works) }, [clean, env])
  return clean.works
}

/**
 * 再拼一次: a new game from the work's source (spec §18.4); see game-store.ts §4.3 for how a source
 * resumes. An unfinished game of the same template (or free play) goes on, and a top toast says so
 * (spec 03:30); a picture's source is a new board every time.
 */
export function replay(env: Env, kit: WorksKit, w: Work): void {
  const s = w.s
  const g = env.store.getSnapshot()
  const resumes = (s === null || s.startsWith('template:')) && g.target === s && !g.ironed && g.ironingSince === null && !g.complete
  if (s === null) env.store.startFree()
  else if (s.startsWith('template:')) env.store.follow(s.slice(9))
  else {
    const d = kit.decode(w.p ?? w.b, w.n)
    // a daily keeps its own key, so the wall still knows its date (no new board per replay)
    if (d.ok && dailyOf(s) !== null) env.store.startPattern(s, d.board)
    else if (d.ok) env.store.startPicture(d.board, s.startsWith('board:p-') ? 'p-' : '')
  }
  if (resumes) env.store.showToast('say', false, { s: STRINGS[env.lang].resumed })
}

/**
 * F1 每日一拼 (spec §18.3), all in this chunk: a daily game's source key is `daily:<YYYY-MM-DD>`
 * (spec). The entry only keeps it: any non-template key with a pattern is restored and
 * collected like a picture pattern. Its date names the pattern and counts for the streak.
 */
const DAILY = 'daily:'
/** 「2026-10-30」 of a daily source key, or null. */
export function dailyOf(s: string | null): string | null {
  const date = s?.startsWith(DAILY) ? s.slice(DAILY.length) : ''
  return Number.isFinite(dailyDayOf(date)) ? date : null
}
/** The pattern of a daily date. */
const dailyDef = (date: string): typeof DAILY_DEFS[number] | undefined => DAILY_DEFS[dailyIndex(dailyDayOf(date))]

/** Top of the wall page: today's pattern, the streak, and start / continue / again. */
function Daily({ env, kit, wall }: { readonly env: Env; readonly kit: WorksKit; readonly wall: readonly Work[] }): ReactElement | null {
  const t = STRINGS[env.lang]
  const [today] = useState(() => dailyDay(Date.now()))
  const date = dailyDate(today)
  const def = DAILY_DEFS[dailyIndex(today)]!
  const preview = useMemo<Work>(() => ({ i: 0, n: 16, b: def.rows.join(''), s: null }), [def])
  const days = wall.flatMap((w) => { const d = dailyOf(w.s); return d ? [dailyDayOf(d)] : [] })
  const streak = dailyStreak(days, today)
  const g = env.store.getSnapshot()
  const going = dailyOf(g.target) === date && !g.ironed && g.ironingSince === null
  const start = (): void => {
    if (going) { env.store.go('play'); return }
    const d = kit.decode(preview.b, 16)
    if (d.ok) env.store.startPattern(`${DAILY}${date}`, d.board)
  }
  return (
    <section className="pd-wday">
      <button type="button" className="pd-wdaily" onClick={start}>
        <Piece kit={kit} w={preview} css={56} />
        <span>
          <b>{t.daily} · {def[env.lang]}</b>
          {streak ? <span>{t.streak.replace('{n}', String(streak))}</span> : null}
        </span>
        <span className="pd-wgo">{going ? t.goOn : days.includes(today) ? t.redo : t.start}</span>
      </button>
    </section>
  )
}

function useStyles(): void {
  useLayoutEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = WORKS_CSS
    document.head.append(el)
  }, [])
}

/** 「模板 · 爱心 · 10 月 29 日」 */
export function workLabel(w: Work, lang: 'zh' | 'en', template: (id: string) => Template | undefined): string {
  const t = STRINGS[lang]
  const d = new Date(w.i)
  const date = lang === 'zh' ? `${d.getMonth() + 1} 月 ${d.getDate()} 日` : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  const s = w.s
  const tpl = s?.startsWith('template:') ? template(s.slice(9)) : undefined
  const day = dailyOf(s)
  const src = day ? `${t.daily} · ${dailyDef(day)?.[lang] ?? day}` : s === null ? t.free : s.startsWith('template:') ? `${t.tpl} · ${tpl ? tpl[lang] : s.slice(9)}` : s.startsWith('board:p-') ? t.picture : t.ai
  return `${src} · ${date}`
}

/** Month heading: 「2026 年 10 月」 / "October 2026". */
export function monthLabel(at: number, lang: 'zh' | 'en'): string {
  const d = new Date(at)
  return lang === 'zh' ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : d.toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

/** Newest first, one group per calendar month. */
export function byMonth(wall: readonly Work[]): Array<{ key: string; at: number; works: Work[] }> {
  const groups: Array<{ key: string; at: number; works: Work[] }> = []
  for (const w of wall.toReversed()) {
    const d = new Date(w.i)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = groups.at(-1)
    if (last?.key === key) last.works.push(w)
    else groups.push({ key, at: w.i, works: [w] })
  }
  return groups
}

/**
 * Where a piece of n×n cells goes in a canvas `css` px wide (b4 重要 1/2): the bitmap is the
 * canvas's own device pixels, every cell a whole number `k` of them, the pattern centred on
 * whole pixels with the rest left empty. Nothing is scaled, so nothing blurs.
 */
export function pieceFit(css: number, dpr: number, n: number): { readonly px: number, readonly k: number, readonly at: number } {
  const px = Math.round(css * dpr)
  const k = Math.max(1, Math.floor(px / n))
  return { px, k, at: Math.floor((px - n * k) / 2) }
}

/** The piece drawn ironed (no PNG made), at whole device pixels per cell; redrawn when its box resizes. */
function Piece({ kit, w, css }: { readonly kit: WorksKit; readonly w: Work; readonly css: number }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const d = kit.decode(w.b, w.n)
    const ctx = c?.getContext('2d')
    if (!c || !d.ok || !ctx) return
    const draw = (): void => {
      const { px, k, at } = pieceFit(c.clientWidth || css, globalThis.devicePixelRatio || 1, w.n)
      c.width = px
      c.height = px
      ctx.drawImage(kit.render(document, d.board, true, false, k, 0), at, at)
    }
    draw()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : undefined
    ro?.observe(c)
    return () => { ro?.disconnect() }
  }, [kit, w, css])
  return <canvas ref={ref} width={css} height={css} aria-hidden />
}

/** A thumbnail tapped on the home row opens its detail card on the wall page. */
let openOnArrival: number | null = null

/** Home section (spec §18.4): 「我的作品 · N」, 全部 ›, and as many thumbnails as fit on one line, newest first. */
export function WorksRow(props: WorksProps & { readonly fade: boolean, readonly focus?: boolean }): ReactElement {
  const { env, kit, fade } = props
  useStyles()
  const wall = useWorks(props)
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => { setFit(Math.max(1, Math.floor((el.clientWidth + GAP) / (THUMB + GAP)))) }
    measure()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    ro?.observe(el)
    return () => { ro?.disconnect() }
  }, [])
  const shown = wall.slice(-fit).toReversed()
  // one Tab stop for the row, arrows move it, like the wall (b4 suggestion)
  const [at, setAt] = useState(0)
  const stop = Math.min(at, shown.length - 1)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const last = shown.length - 1
    const to = e.key === 'ArrowRight' ? Math.min(last, stop + 1) : e.key === 'ArrowLeft' ? Math.max(0, stop - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (to < 0) return
    e.preventDefault()
    setAt(to)
    ref.current?.querySelectorAll<HTMLElement>('.pd-wt')[to]?.focus()
  }
  // arrived after the retry button had the focus (b4 重要 3): the first thumbnail takes it, or
  // the heading when there is none; once, and only while focus is in the panel or was lost
  const title = useRef<HTMLHeadingElement>(null)
  const focused = useRef(!props.focus)
  useEffect(() => {
    const h = title.current
    const a = h?.ownerDocument.activeElement
    if (focused.current || !fit || !h || (a && a !== h.ownerDocument.body && !h.closest('.pd-root')?.contains(a))) return
    focused.current = true
    ;(ref.current?.querySelector<HTMLElement>('.pd-wt') ?? h).focus({ preventScroll: true })
  }, [fit])
  return (
    <section className="pd-works">
      <h3 ref={title} className="pd-sec" tabIndex={-1}>
        <span>{env.t('homeWorks')} · {wall.length}</span>
        <button type="button" className="pd-link" onClick={() => { env.store.go('works') }}>{STRINGS[env.lang].all}</button>
      </h3>
    <div ref={ref} className={fade && !env.reducedMotion() ? 'pd-wrow pd-fade' : 'pd-wrow'} onKeyDown={onKeyDown}>
      {fit === 0
        ? null
        : shown.map((w, i) => (
          <button key={w.i} type="button" className="pd-wt" aria-label={workLabel(w, env.lang, kit.template)} tabIndex={i === stop ? 0 : -1}
            onFocus={() => { setAt(i) }}
            onClick={() => { openOnArrival = w.i; env.store.go('works') }}>
            <Piece kit={kit} w={w} css={THUMB - 10} />
          </button>
        ))}
    </div>
    </section>
  )
}

const FOCUSABLE = 'button:not([disabled]),[tabindex="0"]'

/**
 * Detail card (spec §18.4): over the page inside the panel, not a modal; Tab
 * stays inside the card, Esc closes it and focus goes back to the work.
 */
function Detail({ env, kit, w, onClose, onDelete }: { readonly env: Env; readonly kit: WorksKit; readonly w: Work; readonly onClose: () => void; readonly onDelete: () => void }): ReactElement {
  const t = STRINGS[env.lang]
  const ref = useRef<HTMLDivElement>(null)
  const d = kit.decode(w.b, w.n)
  const board = d.ok ? d.board : undefined
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[data-primary]')?.focus() }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab') return
    const list = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? list.at(-1) : list[i - 1]) : (i === list.length - 1 ? list[0] : list[i + 1])
    e.preventDefault()
    next?.focus()
  }
  const label = workLabel(w, env.lang, kit.template)
  const note = useId()
  const daily = dailyOf(w.s) !== null
  return (
    <div ref={ref} className="pd-wdet" role="dialog" aria-modal="false" aria-label={label} onKeyDown={onKeyDown}>
      <button type="button" className="pd-btn pd-wclose" onClick={onClose}>{t.close}</button>
      <div className="pd-wbig"><Piece kit={kit} w={w} css={304} /></div>
      <p className="pd-wmeta">{label}</p>
      <div className="pd-wacts">
        {board ? <button type="button" className="pd-btn pd-primary" data-primary onClick={() => { kit.exportBoard(env, { board, target: w.s }) }}>{t.export}</button> : null}
        {board && kit.copySupported() ? <button type="button" className="pd-btn" onClick={() => { kit.copyBoard(env, board) }}>{t.copy}</button> : null}
        <button type="button" className="pd-btn" onClick={() => { replay(env, kit, w) }}>{t.again}</button>
        <button type="button" className="pd-btn pd-wdel" aria-describedby={daily ? note : undefined} onClick={onDelete}>{t.del}</button>
      </div>
      {daily ? <p className="pd-wmeta" id={note}>{t.note}</p> : null}
    </div>
  )
}

/** The delete toast: 撤销 for 5 s; hovering or focusing it holds the clock (like the panel's toast). */
function UndoToast({ lang, onUndo, onDone }: { readonly lang: 'zh' | 'en'; readonly onUndo: () => void; readonly onDone: () => void }): ReactElement {
  const t = STRINGS[lang]
  const [held, setHeld] = useState(0)
  const left = useRef(UNDO_MS)
  useEffect(() => {
    if (held > 0) return
    const started = Date.now()
    const id = setTimeout(onDone, left.current)
    return () => { clearTimeout(id); left.current = Math.max(0, left.current - (Date.now() - started)) }
  }, [held, onDone])
  const hold = (on: boolean) => (): void => { setHeld(h => Math.max(0, h + (on ? 1 : -1))) }
  return (
    <div className="pd-toast" role="status" data-held={held > 0 || undefined}
      onPointerEnter={hold(true)} onPointerLeave={hold(false)} onFocus={hold(true)} onBlur={hold(false)}>
      <span>{t.deleted}</span>
      <button type="button" onClick={onUndo}>{t.undo}</button>
    </div>
  )
}

/** The nearest work one row up or down (by position on screen, across month groups). */
function verticalNeighbour(items: readonly HTMLElement[], from: HTMLElement, down: boolean): HTMLElement | undefined {
  const r = from.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const rows = items.filter((el) => {
    const b = el.getBoundingClientRect()
    return down ? b.top > r.top + 4 : b.top < r.top - 4
  })
  if (rows.length === 0) return undefined
  const tops = rows.map(el => el.getBoundingClientRect().top)
  const rowTop = down ? Math.min(...tops) : Math.max(...tops)
  const row = rows.filter(el => Math.abs(el.getBoundingClientRect().top - rowTop) < 4)
  return row.reduce((best, el) => {
    const b = el.getBoundingClientRect(), bb = best.getBoundingClientRect()
    return Math.abs(b.left + b.width / 2 - cx) < Math.abs(bb.left + bb.width / 2 - cx) ? el : best
  })
}

/**
 * The wall page (spec §18.4). The grid is one Tab stop (roving tabindex): arrow
 * keys move, Enter opens the detail card, Delete deletes (with the undo toast).
 */
export function WorksPage(props: WorksProps): ReactElement {
  const { env, kit } = props
  useStyles()
  const wall = useWorks(props)
  const t = STRINGS[env.lang]
  const [open, setOpen] = useState<number | null>(() => { const id = openOnArrival; openOnArrival = null; return id })
  const [active, setActive] = useState<number | null>(null)
  const [undo, setUndo] = useState<{ readonly w: Work; readonly seq: number } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const refocus = useRef<number | null>(null)
  const groups = byMonth(wall)
  const order = groups.flatMap(g => g.works)
  const current = order.find(w => w.i === active) ?? order[0]
  const detail = wall.find(w => w.i === open)

  // focus follows the roving tab stop after a move, a close or a delete
  useEffect(() => {
    if (refocus.current === null) return
    const id = refocus.current
    refocus.current = null
    const el = grid.current?.querySelector<HTMLElement>(`[data-work="${id}"]`) ?? grid.current?.querySelector<HTMLElement>('[data-work]')
    el?.focus()
  })

  // one toast at a time: the newest wins (a panel toast retires the undo toast, a delete the panel's)
  const panelToast = env.store.getSnapshot().toast
  const [seenToast, setSeenToast] = useState(panelToast)
  if (panelToast !== seenToast) { setSeenToast(panelToast); if (panelToast) setUndo(null) }

  const remove = (w: Work): void => {
    env.store.hideToast()
    const i = order.indexOf(w)
    const next = order[i + 1] ?? order[i - 1]
    env.store.setWall(removeWork(wall, w.i))
    setOpen(null)
    setActive(next?.i ?? null)
    refocus.current = next?.i ?? null
    setUndo(u => ({ w, seq: (u?.seq ?? 0) + 1 }))
  }

  const restore = (w: Work): void => { env.store.setWall(addWork(env.store.works() as Work[], w)); refocus.current = w.i; setActive(w.i); setUndo(null) }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Ctrl+Z / ⌘Z while the delete toast is up does what its 撤销 does (b4 suggestion)
    if (undo && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(undo.w); return }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-work]')
    if (!el || !current) return
    const items = [...(grid.current?.querySelectorAll<HTMLElement>('[data-work]') ?? [])]
    const i = items.indexOf(el)
    let to: HTMLElement | undefined
    if (e.key === 'ArrowRight') to = items[i + 1]
    else if (e.key === 'ArrowLeft') to = items[i - 1]
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') to = verticalNeighbour(items, el, e.key === 'ArrowDown')
    else if (e.key === 'Home') to = items[0]
    else if (e.key === 'End') to = items.at(-1)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const w = order.find(x => String(x.i) === el.dataset['work'])
      if (w) remove(w)
      return
    } else return
    e.preventDefault()
    if (to) { setActive(Number(to.dataset['work'])); to.focus() }
  }

  return (
    <>
      <Daily env={env} kit={kit} wall={wall} />
      {wall.length === 0
        ? (
          <div className="pd-wempty">
            <span aria-hidden />
            <p>{t.empty}</p>
            <button type="button" className="pd-btn pd-primary" onClick={() => { env.store.go('home') }}>{t.go}</button>
          </div>
        )
        : (
          // while the detail card is open the grid behind it is inert: out of the screen-reader
          // tree and of Tab (b4 suggestion); React 18 has no `inert` prop, so the attribute as is
          <div ref={grid} className="pd-wall" role="group" aria-label={t.wall} onKeyDown={onKeyDown} {...(detail ? { inert: '' } : {})}>
            {groups.map(g => (
              <section key={g.key}>
                <h3 className="pd-sec">{monthLabel(g.at, env.lang)}</h3>
                <div className="pd-wcols">
                  {g.works.map(w => (
                    <button key={w.i} type="button" className="pd-wc" data-work={w.i} tabIndex={w === current ? 0 : -1}
                      aria-label={workLabel(w, env.lang, kit.template)}
                      onFocus={() => { setActive(w.i) }}
                      onClick={() => { setActive(w.i); setOpen(w.i) }}>
                      <Piece kit={kit} w={w} css={112} />
                      {dailyOf(w.s) ? <span className="pd-wtag" aria-hidden>{t.daily}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      {detail
        ? <Detail env={env} kit={kit} w={detail} onClose={() => { refocus.current = detail.i; setOpen(null) }} onDelete={() => { remove(detail) }} />
        : null}
      {undo
        ? (
          <UndoToast key={undo.seq} lang={env.lang}
            onUndo={() => { restore(undo.w) }}
            onDone={() => { setUndo(null) }} />
        )
        : null}
    </>
  )
}
