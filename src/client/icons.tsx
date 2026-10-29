/** Inline 16px-grid line icons (stroke = currentColor), so the bundle ships no icon font. */
import type { ReactElement } from 'react'

type P = { readonly className?: string }
const base = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

export const IconBead = (p: P): ReactElement => (
  <svg {...base} {...p}><circle cx="7" cy="7" r="3.6" /><circle cx="13" cy="7" r="3.6" /><circle cx="7" cy="13" r="3.6" /><circle cx="13" cy="13" r="3.6" fill="currentColor" stroke="none" /></svg>
)
export const IconLogo = (p: P): ReactElement => (
  <svg viewBox="0 0 20 20" aria-hidden focusable={false} {...p}>
    <circle cx="6.5" cy="6.5" r="4" fill="#D7333B" /><circle cx="13.5" cy="6.5" r="4" fill="#F7C531" />
    <circle cx="6.5" cy="13.5" r="4" fill="#62B6E9" /><circle cx="13.5" cy="13.5" r="4" fill="#3E9C4A" />
    {[6.5, 13.5].flatMap(x => [6.5, 13.5].map(y => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="rgba(0,0,0,.28)" />))}
  </svg>
)
export const IconBack = (p: P): ReactElement => <svg {...base} {...p}><path d="M12 4.5 6.5 10l5.5 5.5" /></svg>
export const IconMore = (p: P): ReactElement => (
  <svg {...base} {...p}><circle cx="5" cy="10" r="1" fill="currentColor" /><circle cx="10" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /></svg>
)
export const IconBrush = (p: P): ReactElement => <svg {...base} {...p}><path d="M13.5 3.5 16.5 6.5 9 14l-3.5.5.5-3.5z" /><path d="M11.5 5.5l3 3" /></svg>
export const IconEraser = (p: P): ReactElement => <svg {...base} {...p}><path d="M8 16h8" /><path d="M3.8 11.8 11 4.6a1.4 1.4 0 0 1 2 0l2.4 2.4a1.4 1.4 0 0 1 0 2L9 15.4H6.6L3.8 12.6a.6.6 0 0 1 0-.8z" /><path d="M7.5 8.2l4.3 4.3" /></svg>
export const IconPicker = (p: P): ReactElement => <svg {...base} {...p}><path d="M12.5 4.5l3 3" /><path d="M14.2 3.2a1.8 1.8 0 0 1 2.6 2.6l-1.6 1.6-2.6-2.6z" /><path d="M12.4 6.2 5 13.6V16h2.4l7.4-7.4" /></svg>
export const IconFill = (p: P): ReactElement => <svg {...base} {...p}><path d="M4 9.5 9.5 4l6 6-5.5 5.5a1.4 1.4 0 0 1-2 0L4 11.5a1.4 1.4 0 0 1 0-2z" /><path d="M4 10.5h11.5" /><path d="M16.5 13.5s1.2 1.6 1.2 2.4a1.2 1.2 0 0 1-2.4 0c0-.8 1.2-2.4 1.2-2.4z" /></svg>
export const IconUndo = (p: P): ReactElement => <svg {...base} {...p}><path d="M7.5 5 4 8.5 7.5 12" /><path d="M4.5 8.5h7a4 4 0 0 1 0 8H9" /></svg>
export const IconRedo = (p: P): ReactElement => <svg {...base} {...p}><path d="M12.5 5 16 8.5 12.5 12" /><path d="M15.5 8.5h-7a4 4 0 0 0 0 8H11" /></svg>
export const IconTrash = (p: P): ReactElement => <svg {...base} {...p}><path d="M4 6h12" /><path d="M8 6V4.5h4V6" /><path d="M5.5 6l.8 9.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L14.5 6" /></svg>
export const IconSparkle = (p: P): ReactElement => <svg {...base} {...p}><path d="M10 3v3M10 14v3M3 10h3M14 10h3" /><path d="M10 6.5 11 9l2.5 1L11 11l-1 2.5L9 11l-2.5-1L9 9z" fill="currentColor" /></svg>
export const IconGrid = (p: P): ReactElement => <svg {...base} {...p}><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M3.5 10h13M10 3.5v13" /></svg>
export const IconCopy = (p: P): ReactElement => <svg {...base} {...p}><rect x="7" y="7" width="9.5" height="9.5" rx="2" /><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6a1.5 1.5 0 0 0 1.5 1.5H7" /></svg>
export const IconDownload = (p: P): ReactElement => <svg {...base} {...p}><path d="M10 3.5v9M6 9l4 4 4-4" /><path d="M4 16.5h12" /></svg>
export const IconIron = (p: P): ReactElement => <svg {...base} {...p}><path d="M3 14.5h13.5V12a5 5 0 0 0-5-5H6" /><path d="M6 7v-2h6" /><path d="M3 14.5 5 9.5" /></svg>
export const IconCheck = (p: P): ReactElement => <svg {...base} strokeWidth={2.4} {...p}><path d="M4.5 10.5 8.5 14.5 15.5 6" /></svg>
export const IconClose = (p: P): ReactElement => <svg {...base} {...p}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
export const IconAlert = (p: P): ReactElement => <svg {...base} {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6.5v4.2M10 13.4v.1" /></svg>
