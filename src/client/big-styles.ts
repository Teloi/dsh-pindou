/**
 * Styles of the big-board page (plan §3, §4.4). They ship in the lazy chunk
 * (lib/client.big.js) and are added on first use; toolbar, palette, buttons and
 * the toast reuse styles.ts. Minified at build time like styles.ts.
 */
export const BIG_CSS = `
/* the page may use the panel's full width: the canvas is the point (plan §3.1) */
.pd-view.pd-bk{max-width:none}
.pd-bk-play{display:flex;flex-direction:column;min-width:0}
.pd-bk-top,.pd-bk-st,.pd-bk-share{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--pd-text-2);font-variant-numeric:tabular-nums}
.pd-bk-top strong{color:var(--pd-text)}
.pd-bk .pd-spacer{flex:1}
.pd-bk-st{margin-top:6px}
.pd-bk-st .pd-btn,.pd-bk-share .pd-btn{min-height:28px;padding:0 9px;font-size:12px}
.pd-bk-share{margin-top:6px;padding:8px;border-radius:var(--pd-radius-ctl);background:var(--pd-surface)}
.pd-bk-note{margin:6px 0 0;padding:8px 10px;border-radius:var(--pd-radius-ctl);background:var(--pd-surface);color:var(--pd-text-2);font-size:12.5px;line-height:1.5}
.pd-bk-bar{display:flex;align-items:center;gap:6px;margin:0 0 6px}
.pd-bk-bar span{flex:1}
.pd-bk-bar .pd-ib{width:28px;height:28px;flex:none}
/* waiting on IndexedDB: a still bead grid, no motion (shown only past 300 ms) */
.pd-bk-load{color:var(--pd-text-2);font-size:12.5px;text-align:center}
.pd-bk-skel{height:240px;margin-bottom:8px;border-radius:var(--pd-radius-board);background:radial-gradient(circle,var(--pd-border) 34%,transparent 38%) 0 0/14px 14px,var(--pd-surface)}
.pd-bk-err{margin:6px 0 0;color:var(--pd-danger);font-size:12.5px}
.pd-bk-wide{width:100%;margin:8px 0 4px}
/* the setup page's visible heading, for screen-reader navigation (plan 修订 20:25) */
.pd-bk h2{margin:0 0 8px;font-size:15px;font-weight:600;color:var(--pd-text)}
/* setup: presets two up on a narrow panel, four up from 360 */
.pd-bk-sizes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
@container pd (min-width: 360px){.pd-bk-sizes{grid-template-columns:repeat(4,minmax(0,1fr))}}
.pd-bk-sizes .pd-btn{flex-direction:column;gap:0;padding:6px 4px;white-space:normal;line-height:1.3}
.pd-bk-sizes span{font-size:11px;font-weight:400;color:var(--pd-text-3)}
.pd-bk .pd-tokens{margin:6px 0 4px;font-size:11.5px}
.pd-bk-form{display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--pd-text-2)}
.pd-bk-form label:not(.pd-btn){display:flex;flex-direction:column;gap:2px}
.pd-bk-form input,.pd-bk-form select,.pd-bk-form textarea{font:inherit;font-size:13px;color:var(--pd-text);background:var(--pd-surface-raised);border:1px solid var(--pd-border);border-radius:var(--pd-radius-ctl);min-height:var(--pd-hit);padding:0 8px;box-sizing:border-box}
.pd-bk-form input{width:64px}
.pd-bk-form textarea{flex:1 1 180px;padding:6px 8px;resize:vertical;font-family:var(--pd-font-code)}
/* the canvas: fills the height React measures; the browser never scrolls or zooms it (plan §3.2) */
.pd-bk-cv{position:relative;margin-top:var(--pd-gap);border-radius:var(--pd-radius-board);overflow:hidden;background:var(--pd-surface);min-height:240px}
.pd-bk-app{position:absolute;inset:0;touch-action:none;user-select:none;outline:none}
.pd-bk-app:focus-visible{box-shadow:inset 0 0 0 2px var(--pd-accent)}
.pd-bk-app canvas{display:block}
.pd-bk-zoom{position:absolute;left:6px;bottom:6px;display:flex;gap:2px;padding:2px;border-radius:var(--pd-radius-ctl);box-shadow:0 1px 3px rgba(0,0,0,.15)}
.pd-bk-zoom,.pd-bk-mm{background:color-mix(in srgb,var(--pd-surface-raised) 88%,transparent)}
.pd-bk-zoom .pd-ib{font-size:16px;color:var(--pd-text)}
.pd-bk-mini{position:absolute;right:6px;bottom:6px;width:96px;height:96px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25);background:var(--pd-surface-raised);touch-action:none}
@container pd (min-width: 561px){.pd-bk-mini{width:120px;height:120px}}
.pd-bk-mini.pd-off{display:none}
.pd-bk-mm{position:absolute;right:6px;top:6px;width:32px;height:32px}
/* the palette's 8 columns share the width, never wider than the panel (review I4) */
.pd-bk-play .pd-palette{grid-template-columns:repeat(8,minmax(0,1fr))}
.pd-bk-play .pd-sw{width:auto}
/* clear and export sit in the toolbar; a narrow panel folds them under 「更多」 for one row (plan §3.1 fig. 3) */
.pd-bk-play .pd-tools{position:relative}
.pd-bk-play .pd-bk-more{display:none}
.pd-bk-x{display:contents}
@container pd (max-width: 340px){
  .pd-bk-play .pd-tools{flex-wrap:nowrap}
  .pd-bk-play .pd-palette{--pd-swatch:28px}
  .pd-bk-play .pd-bk-more{display:grid}
  .pd-bk-x{display:none}
  .pd-bk-x.pd-on{display:flex;position:absolute;right:0;top:100%;z-index:5;padding:2px;border-radius:var(--pd-radius-ctl);background:var(--pd-surface-raised);box-shadow:0 2px 8px rgba(0,0,0,.18)}
}
/* below 360 the minimap starts folded into its button (plan §3.4) */
.pd-bk-blocks{margin-top:var(--pd-gap);font-size:12.5px;color:var(--pd-text-2)}
.pd-bk-blocks summary{cursor:pointer;min-height:28px;display:flex;align-items:center}
.pd-bk-blocks [role=listbox]{display:flex;flex-wrap:wrap;gap:4px;outline:none;padding:2px;border-radius:var(--pd-radius-ctl)}
.pd-bk-blocks [role=option]{padding:4px 8px;border-radius:6px;background:var(--pd-surface);cursor:pointer;font-variant-numeric:tabular-nums}
.pd-bk-blocks [role=option][aria-selected=true]{background:var(--pd-surface-raised);color:var(--pd-text);box-shadow:0 0 0 1.5px var(--pd-text)}
`
