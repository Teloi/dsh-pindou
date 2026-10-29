/**
 * Styles of the picture-to-pattern page (spec §18.2). They ship in the lazy
 * chunk with the page (lib/client.picture.js) and are added on first open;
 * the shared tokens and controls (.pd-seg, .pd-btn) come from styles.ts.
 * Minified at build time like styles.ts (scripts/minify-css.ts).
 */
export const PICTURE_CSS = `
.pd-pic{display:flex;flex-direction:column;gap:12px}
/* the drop zone and the crop frame: square, as wide as the board, at most 480 */
.pd-pic-zone{position:relative;width:100%;max-width:var(--pd-board-max);aspect-ratio:1;margin:0 auto;border-radius:var(--pd-radius-board);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:16px}
.pd-pic-drop{border:1.5px dashed var(--pd-border);background:var(--pd-surface);color:var(--pd-text-2);font-size:13px;cursor:pointer;transition:border-color var(--pd-t-fast),background var(--pd-t-fast)}
.pd-pic-drop .pd-pic-ic{--pd-i:24px;color:var(--pd-text-3)}
.pd-pic-drop[data-over]{border-color:var(--pd-accent);background:var(--pd-hover)}
.pd-pic-drop[data-error]{border-color:var(--pd-danger)}
.pd-pic-drop.pd-shake{animation:pd-pic-shake 160ms linear}
@keyframes pd-pic-shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@media (prefers-reduced-motion: reduce){.pd-pic-drop.pd-shake{animation:none}}
.pd-pic-err{color:var(--pd-danger);font-size:12.5px;font-weight:500;min-height:1em;margin:0}
/* under a loaded picture the alert keeps its one line, so nothing below moves when it speaks or goes (spec 03:30) */
.pd-pic-crop~.pd-pic-err{min-height:1lh}
.pd-pic-note{font-size:11.5px;color:var(--pd-text-3);text-align:center;margin:0}
.pd-pic-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.pd-pic-crop{padding:0;overflow:hidden;background:var(--pd-surface);touch-action:none;cursor:grab;outline-offset:2px}
.pd-pic-crop:active{cursor:grabbing}
.pd-pic-crop canvas{width:100%;height:100%;display:block}
.pd-pic-row{display:flex;align-items:center;gap:8px;min-height:32px;font-size:12.5px;color:var(--pd-text-2)}
.pd-pic-row>span:first-child{flex:1;min-width:0}
/* the zoom slider (design I2): a 4px round track, the zoomed-in part in accent, a 16px thumb.
   The unfilled track mixes the secondary label into the page so it is ≥3:1 on it in both themes
   (--pd-border alone is ~1.3:1); --pd-v is the filled share, set inline. */
.pd-pic-row input[type=range]{--pd-track:color-mix(in srgb,var(--pd-text-2) 72%,var(--pd-bg));flex:1;min-width:0;height:24px;padding:0;background:none;border:0;cursor:pointer;border-radius:var(--pd-radius-ctl)}
.pd-pic-row input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--pd-accent) var(--pd-v,0%),var(--pd-track) 0)}
.pd-pic-row input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--pd-track)}
.pd-pic-row input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--pd-accent)}
.pd-pic-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-6px;border:0;border-radius:50%;background:var(--pd-accent);box-shadow:0 1px 2px rgba(0,0,0,.2)}
.pd-pic-row input[type=range]::-moz-range-thumb{width:16px;height:16px;border:0;border-radius:50%;background:var(--pd-accent);box-shadow:0 1px 2px rgba(0,0,0,.2)}
.pd-pic-prev{display:flex;align-items:center;gap:12px}
.pd-pic-prev canvas{width:min(45%,200px);aspect-ratio:1;border-radius:12px;background:var(--pd-board);flex:none}
.pd-pic-prev p{margin:0;font-size:12px;color:var(--pd-text-3)}
/* a switch is the whole row (a 32-high target), the pill is decoration */
.pd-pic-tg{border:0;background:none;width:100%;padding:0;text-align:left;cursor:pointer;border-radius:var(--pd-radius-ctl)}
.pd-pic-sw{width:32px;height:20px;border-radius:10px;background:var(--pd-border);position:relative;flex:none;transition:background var(--pd-t-fast)}
.pd-pic-sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform var(--pd-t-fast) var(--pd-ease)}
.pd-pic-tg[aria-checked=true] .pd-pic-sw{background:var(--pd-accent)}
.pd-pic-tg[aria-checked=true] .pd-pic-sw::after{transform:translateX(12px)}
.pd-pic-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.pd-pic-acts .pd-btn:disabled{opacity:.4;cursor:default}
`
