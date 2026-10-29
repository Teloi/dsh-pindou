/**
 * Styles of the works wall (spec §18.4). They ship in the lazy chunk
 * (lib/client.works.js) and are added on first use; the home row's fixed box
 * (.pd-works, .pd-wrow) and the shared controls (.pd-btn, .pd-sec, .pd-toast)
 * come from styles.ts. Minified at build time like styles.ts.
 */
export const WORKS_CSS = `
/* home row: as many 56px thumbnails as fit on one line */
.pd-wt{flex:none;width:56px;height:56px;padding:0;border:1px solid var(--pd-border-subtle);border-radius:8px;background:var(--pd-surface);cursor:pointer;display:grid;place-items:center;transition:background var(--pd-t-fast)}
@media (hover:hover){.pd-wt:hover{background:var(--pd-hover)}}
.pd-wt canvas,.pd-wc canvas{width:100%;height:100%;display:block}
.pd-wrow.pd-fade .pd-wt{animation:pd-w-in 150ms var(--pd-ease)}
@keyframes pd-w-in{from{opacity:0}}
/* the wall: 3 columns below 360 wide, 4 up to 560, 6 above; newest first, a heading per month */
.pd-wall{display:flex;flex-direction:column;gap:4px}
.pd-wall .pd-sec{margin:8px 0 4px}
.pd-wcols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@container pd (min-width: 360px){.pd-wcols{grid-template-columns:repeat(4,minmax(0,1fr))}}
@container pd (min-width: 561px){.pd-wcols{grid-template-columns:repeat(6,minmax(0,1fr))}}
.pd-wc{aspect-ratio:1;padding:4px;border:1px solid var(--pd-border-subtle);border-radius:var(--pd-radius-card);background:var(--pd-surface);cursor:pointer;transition:background var(--pd-t-fast)}
@media (hover:hover){.pd-wc:hover{background:var(--pd-hover)}}
/* the detail card covers the page inside the panel (not a modal) */
.pd-wdet{position:absolute;inset:var(--pd-header-h) 0 0;z-index:35;background:var(--pd-bg);overflow:auto;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px var(--pd-pad);text-align:center}
.pd-wdet .pd-wbig{width:100%;max-width:320px;aspect-ratio:1;border-radius:var(--pd-radius-card);background:var(--pd-surface);padding:8px}
.pd-wdet .pd-wbig canvas{width:100%;height:100%;display:block}
.pd-wmeta{margin:0;font-size:12.5px;color:var(--pd-text-2)}
.pd-wacts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:320px}
.pd-wacts .pd-wdel{color:var(--pd-danger)}
.pd-wclose{align-self:flex-end}
/* empty wall */
.pd-wempty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 16px;text-align:center;color:var(--pd-text-2);font-size:13px}
.pd-wempty>span{width:40px;height:40px;margin:8px;border-radius:14px;background:var(--pd-accent);opacity:.85;display:grid;place-items:center}
.pd-wempty>span::after{content:"";width:14px;height:14px;border-radius:50%;background:var(--pd-bg)}
`
