/**
 * The bead board: a DOM grid (role=grid) so every cell is reachable by
 * keyboard and screen readers, with pointer capture for drag painting.
 * Right button erases, Alt picks (spec §6). Ironing is pure CSS driven by
 * per-bead delay (--pd-d) and per-corner radius variables.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import { codeOf, EMPTY, PALETTE, type Board as BoardData, type Tool } from '../../core/index.ts'
import { cornerRadii } from '../render.ts'
import { cx, useEnv, useGame } from './context.tsx'

const MAX_BOARD = 480
const PAD = 6

interface CellProps {
  readonly id: string
  readonly value: number
  readonly ghost: number
  readonly hot: boolean
  readonly wrong: boolean
  readonly cur: boolean
  readonly label: string
  readonly delay: number
  readonly corners: string
}

const Cell = memo(function Cell({ id, value, ghost, hot, wrong, cur, label, delay, corners }: CellProps): ReactElement {
  const g = value === EMPTY && ghost !== EMPTY
  const style = g ? ({ '--pd-gc': PALETTE[ghost]!.hex, '--pd-gl': lightLabel(ghost) } as CSSProperties) : undefined
  let bead: ReactElement | null = null
  if (value !== EMPTY) {
    const [tl, tr, br, bl] = corners
    const bs = {
      '--pd-c': PALETTE[value]!.hex,
      '--pd-d': `${delay}ms`,
      '--pd-rtl': tl === '1' ? '42%' : '0',
      '--pd-rtr': tr === '1' ? '42%' : '0',
      '--pd-rbr': br === '1' ? '42%' : '0',
      '--pd-rbl': bl === '1' ? '42%' : '0',
    } as CSSProperties
    bead = <span className="pd-bead" style={bs} />
  }
  return (
    <div
      id={id}
      role="gridcell"
      aria-label={label}
      aria-selected={cur}
      className={cx('pd-cell', g && 'pd-g', g && hot && 'pd-hot', wrong && 'pd-wrong', cur && 'pd-cur')}
      data-code={g ? codeOf(ghost) : undefined}
      style={style}
    >
      {bead}
    </div>
  )
})

/** Readable code colour on top of a ghost of colour `c`. */
function lightLabel(c: number): string {
  const v = Number.parseInt(PALETTE[c]!.hex.slice(1), 16)
  const l = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
  return l > 150 ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.9)'
}

export function BoardView(): ReactElement {
  const { store, t, lang, reducedMotion } = useEnv()
  const s = useGame()
  const board = s.history.present
  const target = s.targetBoard
  const n = board.size
  const uid = useId().replaceAll(':', '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(17)
  const [cursorState, setCursor] = useState({ x: Math.floor(n / 2), y: Math.floor(n / 2) })
  const [kbd, setKbd] = useState(false)

  // Square board scales with the container up to ~480 px: cell = floor((A − 12) / N).
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      const a = Math.min(el.clientWidth || 300, MAX_BOARD)
      setCell(Math.max(8, Math.floor((a - PAD * 2) / n)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { ro.disconnect() }
  }, [n])

  // Clamp during render (a board resize can leave the cursor outside).
  const cur = { x: Math.min(cursorState.x, n - 1), y: Math.min(cursorState.y, n - 1) }

  const ironing = s.ironingSince !== null
  const ironed = s.ironed || ironing
  const celebrateAt = s.celebrateAt

  // Celebration: 18 confetti beads (WAAPI), skipped under reduced motion.
  // Fires once per completion stamp; the colours are read at that moment.
  const latest = useRef({ board, target })
  useEffect(() => { latest.current = { board, target } })
  useEffect(() => {
    if (celebrateAt === null || reducedMotion()) return
    const host = boardRef.current
    if (!host || typeof host.animate !== 'function') return
    const nodes: HTMLElement[] = []
    const colors = [...new Set((latest.current.target ?? latest.current.board).cells.filter(c => c !== EMPTY))]
    const w = host.clientWidth
    for (let i = 0; i < 18; i++) {
      const el = host.ownerDocument.createElement('i')
      el.className = 'pd-confetti'
      el.setAttribute('aria-hidden', 'true')
      el.style.left = `${w / 2 - 4}px`
      el.style.top = `${w / 2 - 4}px`
      el.style.background = PALETTE[colors[i % Math.max(1, colors.length)] ?? 2]!.hex
      host.append(el)
      nodes.push(el)
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.4
      const dist = w * (0.28 + Math.random() * 0.25)
      el.animate([
        { transform: 'translate(0,0) scale(.4)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist - 20}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 30}px) scale(.8)`, opacity: 0 },
      ], { duration: 1400, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
    }
    const timer = setTimeout(() => { for (const el of nodes) el.remove() }, 1500)
    return () => { clearTimeout(timer); for (const el of nodes) el.remove() }
  }, [celebrateAt, reducedMotion])

  const cellAt = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = boardRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = Math.floor((e.clientX - r.left - PAD) / cell)
    const y = Math.floor((e.clientY - r.top - PAD) / cell)
    return { x, y }
  }, [cell])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 && e.button !== 2) return
    const p = cellAt(e)
    if (!p || p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return
    e.preventDefault()
    boardRef.current?.focus({ preventScroll: true })
    setKbd(false)
    setCursor(p)
    const override: Tool | undefined = e.button === 2 ? 'erase' : e.altKey ? 'pick' : undefined
    store.strokeStart(p.x, p.y, override)
    if (store.stroking) {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!store.stroking) return
    const p = cellAt(e)
    if (p) store.strokeMove(p.x, p.y)
  }
  const onPointerUp = (): void => { store.strokeEnd() }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      setKbd(true)
      const next = { x: Math.max(0, Math.min(n - 1, cur.x + m[0])), y: Math.max(0, Math.min(n - 1, cur.y + m[1])) }
      setCursor(next)
      if (e.shiftKey) store.applyAt(next.x, next.y)
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setKbd(true)
      setCursor({ x: e.key === 'Home' ? 0 : n - 1, y: e.ctrlKey ? (e.key === 'Home' ? 0 : n - 1) : cur.y })
      return
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setKbd(true)
      store.applyAt(cur.x, cur.y)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setKbd(true)
      store.applyAt(cur.x, cur.y, 'erase')
    }
  }

  const colorName = (c: number): string => (c === EMPTY ? t('emptyCell') : lang === 'zh' ? PALETTE[c]!.zh : PALETTE[c]!.en)
  const rows: ReactElement[] = []
  const showGuide = s.prefs.showGuide
  for (let y = 0; y < n; y++) {
    const cells: ReactElement[] = []
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      const v = board.cells[i]!
      const want = target && showGuide ? target.cells[i]! : EMPTY
      const wrong = target !== null && v !== EMPTY && target.cells[i] !== v
      const corners = ironed && v !== EMPTY ? cornerRadii(board, x, y).map(b => (b ? '1' : '0')).join('') : '0000'
      let label = t('cellLabel', { row: y + 1, col: x + 1, color: colorName(v) })
      if (target && target.cells[i] !== EMPTY && target.cells[i] !== v) label += t('cellGuide', { color: colorName(target.cells[i]!) })
      cells.push(
        <Cell
          key={x}
          id={`${uid}-c${i}`}
          value={v}
          ghost={want}
          hot={want === s.color}
          wrong={wrong && !ironed}
          cur={kbd && cur.x === x && cur.y === y}
          label={label}
          delay={Math.round(((x + y) * 780) / (2 * n - 2))}
          corners={corners}
        />,
      )
    }
    rows.push(<div role="row" className="pd-row" key={y}>{cells}</div>)
  }

  const empty = target === null && board.cells.every(c => c === EMPTY)
  const style = { '--pd-n': n, '--pd-cell': `${cell}px` } as CSSProperties
  return (
    <div className="pd-boardwrap" ref={wrapRef}>
      <div
        ref={boardRef}
        role="grid"
        tabIndex={0}
        aria-label={t('boardLabel', { size: n })}
        aria-describedby={`${uid}-help`}
        aria-activedescendant={`${uid}-c${cur.y * n + cur.x}`}
        aria-readonly={ironed}
        aria-rowcount={n}
        aria-colcount={n}
        className={cx('pd-board', `pd-tool-${s.tool}`, kbd && 'pd-kbd', ironed && 'pd-ironed', !showGuide && 'pd-noguide')}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onContextMenu={(e) => { e.preventDefault() }}
        onKeyDown={onKeyDown}
        onFocus={(e) => { if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) setKbd(true) }}
        onBlur={() => { setKbd(false) }}
      >
        {rows}
        {ironing ? <div className="pd-sweep" aria-hidden /> : null}
        {empty ? <div className="pd-empty" aria-hidden><span>{t('playEmpty')}</span></div> : null}
      </div>
      <span id={`${uid}-help`} className="pd-sr">{t('boardHelp')}</span>
    </div>
  )
}

export type { BoardData }
