/**
 * All plugin CSS in one place. The host renders plugin React inline with no
 * CSS isolation, so every class and custom property carries the `pd-` prefix
 * and every rule is scoped under `.pd-root` (or a `pd-` class for portals).
 *
 * TOKENS is the designer's tokens.css (spec v1.3 §12.2) pasted verbatim.
 * Only `--dsw-alias-*` host aliases are read, each with a fallback (danger /
 * success use the host status colours, §15.2); bead colours never change with
 * theme. Anything rendered into document.body carries `.pd-portal`.
 */
export const STYLE_ID = 'dsh-pindou-styles'

const TOKENS = `
@property --pd-hole { syntax: '<percentage>'; inherits: true; initial-value: 20%; }
@property --pd-hl   { syntax: '<number>';     inherits: true; initial-value: 0.6; }
@property --pd-lt   { syntax: '<percentage>'; inherits: true; initial-value: 20%; } /* 受光面提亮 */
@property --pd-dk   { syntax: '<percentage>'; inherits: true; initial-value: 28%; } /* 背光面压暗 */

.pd-root, .pd-portal {
  /* —— 表面与文字（映射 DSH） —— */
  --pd-bg:            var(--dsw-alias-bg-base, #FFFFFF);
  --pd-surface:       var(--dsw-alias-bg-module-platform, #F5F6F7);
  --pd-surface-raised:var(--dsw-alias-bg-layer-1, #FFFFFF);
  --pd-border:        var(--dsw-alias-border-l2, rgba(0,0,0,.10));
  --pd-border-subtle: var(--dsw-alias-border-l1, rgba(0,0,0,.04));
  --pd-text:          var(--dsw-alias-label-primary, #0F1115);
  --pd-text-2:        var(--dsw-alias-label-secondary, #61666B);
  --pd-text-3:        #6B6F76;          /* 4.5:1 on white; the host tertiary (#81858C) is 3.6:1 */
  --pd-hover:         var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06));
  --pd-active:        var(--dsw-alias-interactive-bg-active, rgba(38,49,72,.10));
  --pd-accent:        var(--dsw-alias-state-business-primary, #4176E6);
  --pd-accent-soft:   var(--dsw-alias-state-business-tertiary, #E4EDFD);
  --pd-link:          #4868B2;          /* text links: the host link blue (#4176E6) is 4.2:1 on white */
  --pd-primary-fill:  var(--dsw-alias-button-primary-fill, #0F1115);
  --pd-primary-label: var(--dsw-alias-label-primary-inverted, #FFFFFF);
  --pd-toast-bg:      var(--dsw-alias-toast-bg, #0F1115);
  --pd-toast-label:   var(--dsw-alias-toast-label, #FFFFFF);
  --pd-danger:        var(--dsw-alias-state-error-primary, #E5484D);
  --pd-success:       var(--dsw-alias-state-success-primary, #2BA24C);
  --pd-shadow-pop:    var(--dsw-elevation-soft, 0 4px 14px rgba(0,0,0,.08));
  --pd-warm:          #F5A524;          /* 熨烫热光 */

  /* —— 豆板 —— */
  --pd-board:         #EEF0F3;          /* 豆板底 */
  --pd-board-edge:    rgba(0,0,0,.06);  /* 豆板描边 */
  --pd-peg:           #D3D8DF;          /* 空格钉 */
  --pd-ghost-alpha:   .30;              /* 模板淡色引导不透明度 */
  --pd-ghost-hot:     .62;              /* 选中色剩余格 */
  --pd-cursor:        var(--pd-accent);

  /* —— 尺寸 —— */
  --pd-panel-min: 300px;            /* 宿主右栏最小宽度；面板宽度由宿主决定 */
  --pd-board-max: 480px;            /* 豆板最大边长，宽面板时居中 */
  --pd-pad: 16px; --pd-gap: 12px;
  --pd-header-h: 44px; --pd-status-h: 36px; --pd-toolbar-h: 36px; --pd-footer-h: 40px;
  --pd-swatch: 28px; --pd-swatch-gap: 8px;
  --pd-board-pad: 6px;              /* 豆板内边距 */
  --pd-bead-inset: 6%;              /* 未熨烫豆与格子边距 */
  --pd-radius-board: var(--dsw-radius-md, 12px);
  --pd-radius-card:  var(--dsw-radius-md, 12px);
  --pd-radius-ctl:   var(--dsw-radius-sm, 8px);
  --pd-font-code: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  --pd-hit: 32px;                   /* 工具按钮热区；触屏 36 */
  --pd-entry: 32px;                 /* 标题栏入口按钮 */
  --pd-hint-h: 28px;                /* 输入框上沿忙碌胶囊 */

  /* —— 动效 —— */
  --pd-ease: cubic-bezier(.4,0,.2,1);           /* = DSH --ds-ease-in-out */
  --pd-ease-spring: cubic-bezier(.34,1.56,.64,1);
  --pd-ease-out: cubic-bezier(.22,1,.36,1);
  --pd-t-fast: 100ms; --pd-t: 200ms; --pd-t-slow: 300ms;
  --pd-t-place: 120ms; --pd-t-erase: 90ms;
  --pd-t-iron-cell: 420ms; --pd-t-iron-total: 1200ms;
  --pd-t-celebrate: 1400ms; --pd-t-hint: 8000ms;

  /* —— 16 色豆（编码 0-9a-f，主题无关） —— */
  --pd-bead-0:#F6F4EE; --pd-bead-1:#F2DFA7; --pd-bead-2:#F7C531; --pd-bead-3:#F08A24;
  --pd-bead-4:#D7333B; --pd-bead-5:#F39DC1; --pd-bead-6:#8A5BB5; --pd-bead-7:#2D4FA0;
  --pd-bead-8:#62B6E9; --pd-bead-9:#24A79A; --pd-bead-a:#3E9C4A; --pd-bead-b:#A9D46A;
  --pd-bead-c:#87573A; --pd-bead-d:#D7A473; --pd-bead-e:#9DA1A8; --pd-bead-f:#26272B;
}
body[data-ds-dark-theme] .pd-root, body[data-ds-dark-theme] .pd-portal {
  --pd-text-3:     var(--dsw-alias-label-tertiary, #81858C);
  --pd-link:       var(--pd-accent);
  /* danger / success 由宿主变量自动切换，这里只覆盖插件私有的豆板色 */
  --pd-board:      #1C1D20;
  --pd-board-edge: rgba(255,255,255,.08);
  --pd-peg:        #34373D;
  --pd-ghost-alpha: .34;
  --pd-ghost-hot:   .70;
}
@media (pointer: coarse) { .pd-root { --pd-hit: 36px; } }
`

const ENTRY = `
.pd-entry{width:var(--pd-entry);height:var(--pd-entry);border-radius:var(--pd-radius-ctl);border:0;background:transparent;display:inline-grid;place-items:center;cursor:pointer;color:var(--pd-text-2);position:relative;padding:0;transition:background var(--pd-t-fast),color var(--pd-t-fast)}
@media (hover:hover){.pd-entry:hover{background:var(--pd-hover);color:var(--pd-text)}}
.pd-entry[aria-expanded=true]{background:var(--pd-accent-soft);color:var(--pd-accent)}
.pd-entry:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
.pd-entry{--pd-i:18px}
.pd-entry .pd-dot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--pd-warm);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#fff);opacity:0;transform:scale(.4);transition:opacity var(--pd-t),transform var(--pd-t)}
.pd-entry.pd-has-progress .pd-dot{background:var(--pd-warm);opacity:1;transform:none;animation:none}
.pd-entry.pd-busy .pd-dot{background:var(--pd-accent);opacity:1;transform:none;animation:pd-breathe 1.6s var(--pd-ease) infinite}
@keyframes pd-breathe{0%,100%{opacity:1}50%{opacity:.35}}
/* Busy pill: rendered in conversation.input.overlay, a zero-height strip on the
   composer card's top edge, so bottom:8px floats it just above the card. */
.pd-pill{position:absolute;bottom:8px;right:12px;z-index:5;height:var(--pd-hint-h);display:flex;align-items:center;white-space:nowrap;background:var(--pd-surface-raised);color:var(--pd-text);border:1px solid var(--pd-border);border-radius:14px;box-shadow:var(--dsw-elevation-soft,0 4px 14px rgba(0,0,0,.08));font-size:12.5px;line-height:1;font-family:inherit;animation:pd-pill-in var(--pd-t) var(--pd-ease)}
.pd-pill.pd-out{opacity:0;transform:translateY(4px);transition:opacity var(--pd-t) var(--pd-ease),transform var(--pd-t) var(--pd-ease);pointer-events:none}
@keyframes pd-pill-in{from{opacity:0;transform:translateY(4px)}}
/* both buttons hit 32 high (design N6, R3-6): a ::after 3px above and below the 26px pill row */
.pd-pill button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;margin:0;position:relative}
.pd-pill button::after{content:"";position:absolute;inset:-3px 0}
.pd-pill .pd-pill-go{height:26px;display:flex;align-items:center;gap:6px;padding:0 4px 0 10px;border-radius:13px 0 0 13px}
.pd-pill .pd-pill-bead{width:12px;height:12px;border-radius:50%;flex:none;background:radial-gradient(circle,color-mix(in srgb,var(--pd-bead-3) 50%,#000) 0 22%,transparent 26%),radial-gradient(circle at 38% 34%,color-mix(in srgb,var(--pd-bead-3) 80%,#fff),var(--pd-bead-3) 55%,color-mix(in srgb,var(--pd-bead-3) 75%,#000))}
.pd-pill .pd-pill-x{width:24px;height:26px;display:grid;place-items:center;padding:0;border-radius:0 13px 13px 0;color:var(--pd-text-3)}
.pd-pill .pd-pill-x{--pd-i:12px}
/* 24×26 drawn, 32×32 to hit (design N6): the extra lies above, below and right, never over 「去看看」 */
.pd-pill .pd-pill-x::after{inset:-3px -8px -3px 0}
@media (hover:hover){.pd-pill .pd-pill-go:hover,.pd-pill .pd-pill-x:hover{background:var(--pd-hover)}}
@media (prefers-reduced-motion: reduce){.pd-entry.pd-busy .pd-dot{animation:none}@keyframes pd-pill-in{from{opacity:0}}.pd-pill.pd-out{transform:none}}
`

const PANEL = `
.pd-root{--pd-header-h:36px;container:pd/inline-size;position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--pd-bg);color:var(--pd-text);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);box-sizing:border-box}
/* —— Isolation (design I1/B1). The host has no CSS isolation, so everything that
   reaches us from host or UA sheets is reset here once, for the panel and for every
   portal. What leaks is measured, not guessed: e2e/audit.mjs lists every host rule
   that matches a plugin element and run.mjs fails on any property not accounted for.
   - ui-theme corner-shape.css: *,::before,::after{corner-shape:superellipse(1.5)}
     turns circles into squircles → round everywhere (pseudo-elements included).
   - box-sizing differs between host surfaces → border-box everywhere.
   - UA sheets pin form-control fonts (Chrome buttons: Arial/13.33px, textarea:
     monospace) and the host only resets font-family → controls inherit all of font,
     colour, letter-spacing, line-height; native appearance is dropped.
   - base.css text-autospace:normal adds CJK/Latin gaps → off in codes and numbers.
   - an <svg> without a size is 300×150 → icons are .pd-i, sized only by --pd-i. */
.pd-root *,.pd-root *::before,.pd-root *::after,.pd-portal *,.pd-portal *::before,.pd-portal *::after{box-sizing:border-box;corner-shape:round}
.pd-root,.pd-portal{corner-shape:round;letter-spacing:normal;word-spacing:normal;text-transform:none;font-style:normal;text-align:start}
:where(.pd-root,.pd-portal) :where(button,input,textarea,select){font:inherit;color:inherit;letter-spacing:inherit;text-transform:none;margin:0;-webkit-appearance:none;appearance:none}
:where(.pd-root,.pd-portal) :where(button){line-height:inherit}
:where(.pd-root,.pd-portal) :where(img){max-width:100%;height:auto;display:block}
.pd-root .pd-cell::after,.pd-root .pd-k,.pd-root .pd-cnt,.pd-root .pd-r,.pd-root .pd-tokens,.pd-root .pd-seg{text-autospace:no-autospace}
:where(.pd-root,.pd-portal) .pd-i{width:var(--pd-i,16px);height:var(--pd-i,16px);flex:none;display:inline-block;vertical-align:middle}
.pd-root [hidden]{display:none}
.pd-root :focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
.pd-root .pd-sr,.pd-portal .pd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:-1px}
.pd-head{height:var(--pd-header-h);flex:none;display:flex;align-items:center;gap:4px;padding:0 8px 0 12px;border-bottom:1px solid var(--pd-border-subtle)}
.pd-head .pd-spacer{flex:1}
.pd-head h2{margin:0 0 0 4px;font-size:13px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-ib{width:var(--pd-hit);height:var(--pd-hit);border-radius:var(--pd-radius-ctl);border:0;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--pd-text-2);flex:none;padding:0;transition:background var(--pd-t-fast)}
@media (hover:hover){.pd-ib:hover{background:var(--pd-hover);color:var(--pd-text)}}
.pd-ib:disabled{opacity:.35;cursor:default;background:transparent}
.pd-ib{--pd-i:16px}
.pd-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.pd-view{max-width:calc(var(--pd-board-max) + 2 * var(--pd-pad));margin:0 auto;padding:12px var(--pd-pad) var(--pd-pad);display:flex;flex-direction:column;animation:pd-view-in var(--pd-t) var(--pd-ease)}
@keyframes pd-view-in{from{opacity:0;transform:translateX(8px)}}
/* start page: four equal entry cards (§18.1 + the works wall), 2×2, one row from 560 wide; 64 high, icon left; narrow: icon on top, 72 high */
.pd-start{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:1fr;gap:8px;margin-bottom:16px}
.pd-big{border:1px solid var(--pd-border);background:var(--pd-surface-raised);border-radius:var(--pd-radius-card);padding:8px 10px;text-align:left;cursor:pointer;display:grid;grid:auto auto/28px minmax(0,1fr);align-content:center;gap:1px 8px;min-height:64px;transition:background var(--pd-t-fast),transform var(--pd-t-fast)}
@media (hover:hover){.pd-big:hover{background:var(--pd-hover)}}
.pd-big:active{transform:scale(.98)}
.pd-big .pd-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--pd-surface);grid-row:span 2;--pd-i:16px}
/* entry cards (design C1): a title is never cut (CJK keeps whole, Latin may wrap at spaces); a description
   shows up to two lines; a status line (需要新版 DSH / 加载失败) always shows in full; the row grows to fit */
.pd-big b{word-break:keep-all}
.pd-big b+span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.pd-big .pd-st{display:block}
.pd-big b{font-size:13.5px;font-weight:600}
.pd-big span{font-size:12px;color:var(--pd-text-3)}
@container pd (max-width: 479px){.pd-big{grid:auto/minmax(0,1fr);min-height:72px;padding:6px 8px;align-content:start}.pd-big .pd-ic{grid-row:auto;width:24px;height:24px}.pd-big b{font-size:13px}}
/* lazy modules (spec §18.6): no require.async → shown, focusable, inert; loading > 150 ms → a --pd-surface block */
.pd-big.pd-off{opacity:.5;cursor:default;background:var(--pd-surface-raised);transform:none}
.pd-lazy{display:grid;justify-items:center}
.pd-skel{width:100%;max-width:var(--pd-board-max);aspect-ratio:1;border-radius:var(--pd-radius-board);background:var(--pd-surface)}
.pd-sec{font-size:12px;color:var(--pd-text-3);margin:0 0 8px;font-weight:500;display:flex;justify-content:space-between}
/* my works (spec §18.4): title + one row of 56px thumbnails; the row keeps its height while the chunk loads, fails or is unsupported */
.pd-works{margin-top:16px}
.pd-works .pd-sec{min-height:var(--pd-hit);align-items:center;margin:0 0 4px}
.pd-wrow{height:56px;display:flex;gap:8px;align-items:center;overflow:hidden;font-size:12px;color:var(--pd-text-3)}
.pd-tpls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;list-style:none;margin:0;padding:0}
.pd-tpl{width:100%;border:1px solid var(--pd-border-subtle);background:var(--pd-surface);border-radius:var(--pd-radius-card);padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;transition:background var(--pd-t-fast),transform var(--pd-t-fast),box-shadow var(--pd-t-fast)}
@media (hover:hover){.pd-tpl:hover{background:var(--pd-hover);box-shadow:0 0 0 1px var(--pd-border)}}
.pd-tpl:active{transform:scale(.97)}
.pd-tpl canvas{width:56px;height:56px;border-radius:6px}
body[data-ds-dark-theme] .pd-tpl canvas{background:#2a2b2f}
.pd-tpl .pd-nm{font-size:12px;font-weight:500}
.pd-tpl .pd-meta{font-size:10.5px;color:var(--pd-text-3);display:flex;gap:4px;align-items:center}
.pd-diff{display:inline-flex;gap:2px}.pd-diff i{width:4px;height:4px;border-radius:50%;background:var(--pd-border)}.pd-diff i.pd-on{background:var(--pd-text-2)}
.pd-tpl .pd-done{position:absolute;top:6px;right:6px;width:14px;height:14px;border-radius:50%;background:var(--pd-success);color:#fff;display:grid;place-items:center}
.pd-tpl .pd-done{--pd-i:9px}
/* status line */
.pd-status{min-height:var(--pd-status-h);flex:none;display:flex;flex-direction:column;justify-content:center;gap:6px;margin-top:-4px}
.pd-status .pd-line{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--pd-text-2);min-height:20px;flex-wrap:wrap}
.pd-status .pd-line strong{color:var(--pd-text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%}
.pd-status .pd-r{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--pd-text-3)}
.pd-status .pd-warn{color:var(--pd-danger)}
.pd-prog{height:4px;border-radius:2px;background:var(--pd-surface);overflow:hidden}
.pd-prog i{display:block;height:100%;border-radius:2px;background:var(--pd-accent);transition:width var(--pd-t-slow) var(--pd-ease-out),background var(--pd-t)}
.pd-prog.pd-full i{background:var(--pd-success)}
.pd-seg{display:inline-flex;background:var(--pd-surface);border-radius:7px;padding:2px;gap:2px}
.pd-seg button{border:0;background:transparent;font-size:11.5px;min-width:32px;height:24px;padding:0 7px;border-radius:5px;cursor:pointer;color:var(--pd-text-2);font-variant-numeric:tabular-nums}
.pd-seg button[aria-pressed=true]{background:var(--pd-surface-raised);color:var(--pd-text);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.pd-seg button:disabled{opacity:.4;cursor:default}
.pd-tokens{font-size:11.5px;color:var(--pd-text-3);display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
.pd-shimmer{background:linear-gradient(90deg,var(--pd-text-3) 0%,var(--pd-text) 45%,var(--pd-text-3) 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pd-shim 1.6s linear infinite}
@keyframes pd-shim{from{background-position:100% 0}to{background-position:-100% 0}}
.pd-link{border:0;background:transparent;color:var(--pd-link);cursor:pointer;font-size:12.5px;padding:0 4px;min-height:var(--pd-hit)}
`

const BOARD = `
.pd-boardwrap{position:relative;margin-top:4px;display:flex;justify-content:center}
.pd-board{--pd-cell:17px;position:relative;display:grid;grid-template-columns:repeat(var(--pd-n),var(--pd-cell));grid-auto-rows:var(--pd-cell);padding:var(--pd-board-pad);background:var(--pd-board);border-radius:var(--pd-radius-board);box-shadow:inset 0 0 0 1px var(--pd-board-edge);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none;cursor:default;transition:background var(--pd-t-slow),box-shadow var(--pd-t-slow)}
.pd-board:focus-visible{box-shadow:inset 0 0 0 1px var(--pd-board-edge),0 0 0 2px var(--pd-accent)}
.pd-board.pd-tool-pick{cursor:crosshair}
.pd-board.pd-tool-erase{cursor:cell}
.pd-row{display:contents}
.pd-cell{position:relative}
.pd-cell::before{content:"";position:absolute;left:50%;top:50%;width:22%;height:22%;margin:-11% 0 0 -11%;border-radius:50%;background:var(--pd-peg);transition:opacity var(--pd-t-slow)}
.pd-cell.pd-g{--pd-ga:var(--pd-ghost-alpha)}
.pd-cell.pd-g.pd-hot{--pd-ga:var(--pd-ghost-hot)}
/* the faintness lives in the fill (not in opacity), so the per-colour ring stays at full strength: ≥3:1 on the light board (spec §18.5) and the dark one (N10), see core/contrast.ts.
   Ring width --pd-rw: 1px on the light board at 2×; 1.5px on 1× screens, where a 1px ring is blended by antialiasing to ~2.5:1 (design I6/C3), and on the dark board. A hot cell adds a halo. */
.pd-cell.pd-g::after{content:attr(data-code);position:absolute;inset:14%;border-radius:50%;background:color-mix(in srgb,var(--pd-gc) calc(var(--pd-ga) * 100%),transparent);box-shadow:inset 0 0 0 var(--pd-rw,1px) var(--pd-rc,var(--pd-grl));display:grid;place-items:center;font:600 calc(var(--pd-cell)*.42)/1 var(--pd-font-code);color:transparent;transition:opacity var(--pd-t),background-color var(--pd-t)}
.pd-root.pd-codes .pd-cell.pd-g::after{color:color-mix(in srgb,var(--pd-gl) calc(var(--pd-ga) * 100%),transparent)}
@media (max-resolution:1.99dppx){.pd-g{--pd-rw:1.5px}}
.pd-g.pd-hot::after{box-shadow:inset 0 0 0 var(--pd-rw,1px) var(--pd-rc,var(--pd-grl)),0 0 0 1px color-mix(in srgb,var(--pd-text) 25%,transparent)}
/* dark board: its own ring table, so grey, black, navy and brown guides stay visible (design N10) */
body[data-ds-dark-theme] .pd-g{--pd-rw:1.5px;--pd-rc:var(--pd-gr)}
.pd-board.pd-pulse .pd-cell.pd-g.pd-hot::after{animation:pd-hot 520ms var(--pd-ease) 2}
.pd-bead.pd-out{animation:pd-erase var(--pd-t-erase) var(--pd-ease) forwards;pointer-events:none}
@keyframes pd-erase{to{transform:scale(.6);opacity:0}}
@keyframes pd-hot{0%,100%{transform:scale(1)}50%{transform:scale(.72)}}
.pd-board.pd-noguide .pd-cell.pd-g::after{opacity:0}
.pd-bead{position:absolute;inset:var(--pd-bead-inset);border-radius:50%;z-index:1;
  background:
    radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--pd-c) 52%,#000) 0 var(--pd-hole),transparent calc(var(--pd-hole) + 3%)),
    radial-gradient(circle at 34% 28%,rgb(255 255 255 / calc(var(--pd-hl) * .9)) 0 9%,rgb(255 255 255 / 0) 30%),
    radial-gradient(circle at 42% 38%,color-mix(in srgb,var(--pd-c) calc(100% - var(--pd-lt)),#fff) 0%,var(--pd-c) 46%,color-mix(in srgb,var(--pd-c) calc(100% - var(--pd-dk)),#000) 100%);
  box-shadow:0 1px 1.5px rgba(0,0,0,.28),inset 0 0 0 .5px rgba(0,0,0,.14);
  animation:pd-place var(--pd-t-place) var(--pd-ease-spring);
  transition:inset var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),border-radius var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),--pd-hole var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),--pd-hl var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),--pd-lt var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),--pd-dk var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),box-shadow var(--pd-t-iron-cell) var(--pd-d,0ms),filter var(--pd-t-iron-cell) var(--pd-d,0ms)}
@keyframes pd-place{0%{transform:scale(.6)}100%{transform:scale(1)}}
body[data-ds-dark-theme] .pd-root .pd-bead{box-shadow:0 1px 1.5px rgba(0,0,0,.5),inset 0 0 0 .5px rgba(255,255,255,.18)}
body[data-ds-dark-theme] .pd-root .pd-board.pd-ironed .pd-bead{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08),inset 0 0 calc(var(--pd-cell) * .22) rgb(0 0 0 / .08)}
.pd-cell.pd-wrong .pd-bead{outline:1.5px dashed var(--pd-danger);outline-offset:-1px}
.pd-board.pd-kbd:focus-visible .pd-cell.pd-cur{outline:2px solid var(--pd-cursor);outline-offset:0;border-radius:30%;z-index:3}
.pd-board.pd-ironed{background:transparent;box-shadow:none;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.22))}
.pd-board.pd-ironed .pd-cell::before,.pd-board.pd-ironed .pd-cell.pd-g::after{opacity:0}
.pd-board.pd-ironed .pd-bead{inset:-.5px;border-radius:var(--pd-rtl,0) var(--pd-rtr,0) var(--pd-rbr,0) var(--pd-rbl,0);--pd-hole:0%;--pd-hl:.16;--pd-lt:6%;--pd-dk:8%;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.05),inset 0 0 calc(var(--pd-cell) * .22) rgb(0 0 0 / .07);filter:saturate(.94)}
/* ↑ the soft inner shade keeps each fused bead readable on white and cream too (design N13) */
.pd-sweep{position:absolute;inset:0;pointer-events:none;border-radius:var(--pd-radius-board);overflow:hidden;z-index:4}
.pd-sweep::before{content:"";position:absolute;width:60%;height:300%;left:-80%;top:-100%;transform:rotate(35deg);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--pd-warm) 38%,transparent) 45%,rgb(255 255 255 / .35) 50%,color-mix(in srgb,var(--pd-warm) 38%,transparent) 55%,transparent);animation:pd-sweep var(--pd-t-iron-total) var(--pd-ease) forwards}
@keyframes pd-sweep{to{left:130%}}
.pd-confetti{position:absolute;width:8px;height:8px;border-radius:50%;pointer-events:none;z-index:6;box-shadow:inset 0 0 0 2px rgba(0,0,0,.12)}
.pd-confetti::after{content:"";position:absolute;inset:33%;border-radius:50%;background:rgba(0,0,0,.25)}
.pd-empty{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:var(--pd-text-3);font-size:12.5px;text-align:center;z-index:2}
.pd-empty span{background:color-mix(in srgb,var(--pd-board) 80%,transparent);padding:4px 10px;border-radius:999px}
`

const CONTROLS = `
.pd-tools{min-height:var(--pd-toolbar-h);flex:none;display:flex;align-items:center;gap:2px;margin-top:var(--pd-gap);flex-wrap:wrap}
.pd-tools .pd-sep{width:1px;height:16px;background:var(--pd-border);margin:0 4px}
.pd-tool{width:var(--pd-hit);height:var(--pd-hit);border:0;border-radius:var(--pd-radius-ctl);background:transparent;color:var(--pd-text-2);display:grid;place-items:center;cursor:pointer;position:relative;padding:0;transition:background var(--pd-t-fast),color var(--pd-t-fast)}
@media (hover:hover){.pd-tool:hover{background:var(--pd-hover);color:var(--pd-text)}}
.pd-tool[aria-pressed=true]{background:var(--pd-accent-soft);color:var(--pd-accent)}
.pd-tool:disabled{opacity:.35;cursor:default;background:transparent}
.pd-tool{--pd-i:17px}
.pd-tool .pd-cur-swatch{position:absolute;right:5px;bottom:5px;width:7px;height:7px;border-radius:50%;background:var(--pd-c);box-shadow:0 0 0 1.5px var(--pd-bg)}
.pd-palette{flex:none;display:grid;grid-template-columns:repeat(8,var(--pd-hit));gap:var(--pd-swatch-gap) 0;justify-content:space-between;margin-top:var(--pd-gap)}
.pd-sw{width:var(--pd-hit);height:var(--pd-hit);border:0;padding:0;background:transparent;cursor:pointer;position:relative;display:grid;place-items:center;border-radius:50%}
.pd-sw .pd-swb{width:var(--pd-swatch);height:var(--pd-swatch);border-radius:50%;display:block;position:relative;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--pd-c) 55%,#000) 0 17%,transparent 20%),radial-gradient(circle at 35% 30%,rgba(255,255,255,.55) 0 8%,transparent 30%),radial-gradient(circle at 42% 38%,color-mix(in srgb,var(--pd-c) 82%,#fff),var(--pd-c) 48%,color-mix(in srgb,var(--pd-c) 75%,#000));box-shadow:0 1px 2px rgba(0,0,0,.2),inset 0 0 0 .5px rgba(0,0,0,.15);transition:transform var(--pd-t-fast) var(--pd-ease-spring),opacity var(--pd-t)}
@media (hover:hover){.pd-sw:hover .pd-swb{transform:scale(1.08)}}
.pd-sw[aria-checked=true] .pd-swb{box-shadow:0 0 0 2px var(--pd-bg),0 0 0 4px var(--pd-text)}
.pd-sw .pd-k{position:absolute;inset:0;display:grid;place-items:center;font:600 10.5px/1 var(--pd-font-code);color:var(--pd-l);opacity:0}
.pd-root.pd-codes .pd-sw .pd-k{opacity:1}
.pd-root.pd-codes .pd-sw .pd-swb{background:var(--pd-c)}
.pd-sw .pd-cnt{position:absolute;top:-3px;right:-4px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:var(--pd-surface-raised);color:var(--pd-text-2);font-size:9.5px;font-weight:600;line-height:15px;text-align:center;box-shadow:0 0 0 1px var(--pd-border);font-variant-numeric:tabular-nums;z-index:1}
.pd-sw .pd-cnt.pd-ok{background:var(--pd-success);color:#fff;box-shadow:none}
.pd-sw.pd-dim .pd-swb{opacity:.32}
@media (hover:hover){.pd-sw.pd-dim:hover .pd-swb,.pd-sw.pd-dim[aria-checked=true] .pd-swb{opacity:1}}
.pd-foot{min-height:var(--pd-footer-h);flex:none;display:flex;gap:8px;align-items:flex-end;margin-top:var(--pd-gap);flex-wrap:wrap}
.pd-btn{min-height:var(--pd-hit);border-radius:var(--pd-radius-ctl);border:1px solid var(--pd-border);background:var(--pd-surface-raised);padding:0 12px;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;color:var(--pd-text);white-space:nowrap;transition:background var(--pd-t-fast),transform var(--pd-t-fast),opacity var(--pd-t)}
@media (hover:hover){.pd-btn:hover{background:var(--pd-hover)}}
.pd-btn:active{transform:scale(.97)}
.pd-btn:disabled{opacity:.4;cursor:default;transform:none}
.pd-btn{--pd-i:15px}
.pd-btn.pd-primary{background:var(--pd-primary-fill);color:var(--pd-primary-label);border-color:transparent}
@media (hover:hover){.pd-btn.pd-primary:hover{opacity:.88;background:var(--pd-primary-fill)}}
.pd-btn.pd-warm{background:linear-gradient(180deg,#F7B23B,#EE8A1F);color:#3a2400;border-color:transparent;box-shadow:0 1px 0 rgba(255,255,255,.3) inset}
@media (hover:hover){.pd-btn.pd-warm:hover{filter:brightness(1.05);background:linear-gradient(180deg,#F7B23B,#EE8A1F)}}
.pd-btn.pd-ghost{border-color:transparent;background:transparent;color:var(--pd-text-2)}
@media (hover:hover){.pd-btn.pd-ghost:hover{background:var(--pd-hover);color:var(--pd-text)}}
.pd-btn.pd-grow{flex:1}
/* under the board: the done / result card swaps in for tools + palette + footer, in flow (design N8) */
.pd-under{display:grid;grid-template-columns:minmax(0,1fr)}
.pd-under>*{grid-row:1;grid-column:1;min-width:0}
.pd-tp{display:flex;flex-direction:column}
.pd-under.pd-swapped>.pd-tp{visibility:hidden}
.pd-under>.pd-overlay{align-self:start;margin-top:var(--pd-gap)}
.pd-overlay{position:relative;z-index:7;background:var(--pd-surface-raised);border:1px solid var(--pd-border);border-radius:var(--pd-radius-card);box-shadow:0 8px 24px rgba(0,0,0,.12);padding:12px;display:flex;flex-direction:column;gap:10px;animation:pd-card-in var(--pd-t) var(--pd-ease)}
@keyframes pd-card-in{from{opacity:0;transform:translateY(8px)}}
.pd-overlay .pd-t{font-weight:600;font-size:13.5px;display:flex;gap:8px;align-items:center;margin:0}
.pd-overlay .pd-d{font-size:12.5px;color:var(--pd-text-2);line-height:1.55;margin:0}
.pd-overlay .pd-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.pd-overlay .pd-acts .pd-btn{min-height:var(--pd-hit)}
.pd-overlay.pd-result{animation-delay:80ms;animation-fill-mode:backwards}
/* the coach card sits on the board's lower half (spec §4.1): compact, title and button on one row */
.pd-boardbox{position:relative}
.pd-overlay.pd-coach{position:absolute;top:auto;bottom:8px;left:8px;right:8px;max-height:calc(50% - 8px);overflow:auto;padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:6px 8px;align-items:center}
.pd-overlay.pd-coach .pd-t{grid-row:1;grid-column:1}
.pd-overlay.pd-coach .pd-acts{grid-row:1;grid-column:2}
.pd-overlay.pd-coach .pd-d{grid-row:2;grid-column:1 / -1;font-size:12px;line-height:1.5}
.pd-overlay.pd-coach .pd-btn{min-height:var(--pd-hit)}
/* AI view */
.pd-ai-box{border:1px solid var(--pd-border);border-radius:var(--pd-radius-card);background:var(--pd-surface-raised);padding:10px;display:flex;flex-direction:column;gap:8px;transition:border-color var(--pd-t),box-shadow var(--pd-t)}
.pd-ai-box:focus-within{border-color:var(--pd-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--pd-accent) 18%,transparent)}
.pd-ai-box textarea{border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:13.5px;color:var(--pd-text);height:60px;line-height:1.5;padding:0}
.pd-ai-box textarea::placeholder{color:var(--pd-text-3)}
.pd-ai-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pd-ai-row .pd-muted{font-size:11.5px;color:var(--pd-text-3);flex:1}
.pd-chip:disabled{opacity:.4;cursor:default}
.pd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 16px}
.pd-chip{border:1px solid var(--pd-border);background:transparent;border-radius:999px;padding:0 12px;min-height:32px;font-size:12px;cursor:pointer;color:var(--pd-text-2);transition:background var(--pd-t-fast)}
@media (hover:hover){.pd-chip:not(:disabled):hover{background:var(--pd-hover);color:var(--pd-text)}}
.pd-card{border-radius:var(--pd-radius-card);padding:12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;line-height:1.6;color:var(--pd-text-2);background:var(--pd-surface);margin-bottom:12px}
.pd-card .pd-t{font-weight:600;color:var(--pd-text);font-size:13.5px;display:flex;gap:8px;align-items:center;margin:0}
.pd-card .pd-t{--pd-i:16px}
.pd-card .pd-muted{font-size:11.5px;color:var(--pd-text-3)}
.pd-card.pd-err{background:color-mix(in srgb,var(--pd-danger) 9%,var(--pd-bg))}
.pd-card.pd-err .pd-t{color:var(--pd-danger)}
.pd-card .pd-acts{display:flex;gap:8px;flex-wrap:wrap}
.pd-card ol{margin:0;padding-left:18px}
.pd-card p{margin:0}
/* menu & toast */
.pd-menu{position:absolute;top:calc(var(--pd-header-h) + 4px);right:8px;z-index:30;min-width:220px;background:var(--pd-surface-raised);border:1px solid var(--pd-border);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);padding:6px;animation:pd-pop .14s var(--pd-ease)}
@keyframes pd-pop{from{opacity:0;transform:translateY(-4px)}}
.pd-mi{display:flex;align-items:center;gap:10px;padding:0 8px;min-height:var(--pd-hit);border-radius:8px;font-size:13px;cursor:pointer;width:100%;border:0;background:transparent;text-align:left}
.pd-mi:focus-visible{background:var(--pd-hover)}
@media (hover:hover){.pd-mi:hover{background:var(--pd-hover)}}
.pd-mi .pd-sw2{margin-left:auto;width:28px;height:16px;border-radius:8px;background:var(--pd-border);position:relative;transition:background var(--pd-t-fast);flex:none}
.pd-mi .pd-sw2::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform var(--pd-t-fast) var(--pd-ease)}
.pd-mi[aria-checked=true] .pd-sw2{background:var(--pd-accent)}
.pd-mi[aria-checked=true] .pd-sw2::after{transform:translateX(12px)}
.pd-menu hr{border:0;border-top:1px solid var(--pd-border-subtle);margin:4px 0}
.pd-keys{margin:4px 8px 6px;padding:0;list-style:none;font-size:11.5px;color:var(--pd-text-2);display:flex;flex-direction:column;gap:3px}
/* toast (design R3-2, spec v2.0): at most panel width − 32, drops from the top over the (read-only) status row. The play view stacks board → tools → palette → footer to the bottom edge at every height, so any bottom anchor lands on swatches or Iron/Export (seen at 1280×800 too, not only below 700 px) */
.pd-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + var(--pd-header-h) + 4px);transform:translateX(-50%);background:var(--pd-toast-bg);color:var(--pd-toast-label);font-size:12.5px;border-radius:10px;padding:5px 6px 5px 12px;display:flex;gap:10px;align-items:center;z-index:40;width:max-content;max-width:calc(100% - 32px);box-shadow:0 6px 20px rgba(0,0,0,.18);animation:pd-toast-in var(--pd-t) var(--pd-ease)}
@keyframes pd-toast-in{from{opacity:0;transform:translate(-50%,-8px)}}
/* one line, never wraps: a long message ends in … rather than growing over the title/progress row (spec v2.0, 22:15) */
.pd-toast>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-toast button{flex:none;white-space:nowrap;border:0;background:rgb(255 255 255 / .14);color:inherit;border-radius:6px;padding:0 10px;min-height:var(--pd-hit);font-size:12px;cursor:pointer;font-weight:600}
body[data-ds-dark-theme] .pd-toast button{background:rgb(0 0 0 / .08)}
.pd-preview{position:absolute;inset:var(--pd-header-h) 0 0;z-index:35;background:var(--pd-bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:var(--pd-pad);text-align:center}
.pd-preview img{max-width:min(100%,480px);max-height:70%;object-fit:contain;image-rendering:pixelated;border-radius:var(--pd-radius-card);border:1px solid var(--pd-border-subtle)}
.pd-root .pd-icon-only{padding:0;width:var(--pd-hit);justify-content:center}
`

const RESPONSIVE = `
/* container queries: the panel is 300px up to ~900px wide */
@container pd (max-width: 340px){
  .pd-root{--pd-pad:12px;--pd-swatch:26px}
  /* count badges stay inside their own 32px hit box, clear of the neighbour (design N12) */
  .pd-sw .pd-cnt{top:-2px;right:-1px;min-width:14px;height:14px;line-height:14px;padding:0 2px;font-size:9px}
  .pd-tools .pd-sep{margin:0 1px}
  .pd-tpls{gap:6px}
}
/* wide sidebar (spec §3.1): 4 template columns, home max 640, play column max 480 */
@container pd (min-width: 560px){
  .pd-tpls{grid-template-columns:repeat(4,1fr)}
  .pd-start{grid-template-columns:repeat(4,minmax(0,1fr))}
  .pd-view.pd-v-home{max-width:640px}
}
/* host full-screen sidebar below 768px (spec §3.2): bigger swatches, iron/export move into the toolbar */
@media (max-width: 767px){
  .pd-root .pd-view{padding-bottom:max(16px,env(safe-area-inset-bottom,0px))}
  .pd-root .pd-palette{--pd-swatch-gap:6px;--pd-swatch:32px}
  .pd-root .pd-foot .pd-io{display:none}
  .pd-root .pd-foot:not(:has(> :not(.pd-io))){display:none}
  /* ten toolbar buttons on one row at 360–390px: shrink width (never below 32), keep height */
  .pd-root .pd-tools{flex-wrap:nowrap;gap:0;justify-content:space-between}
  .pd-root .pd-tools .pd-tool{flex:1 1 0;min-width:32px;max-width:var(--pd-hit)}
  .pd-root .pd-tools .pd-sep{margin:0;flex:none}
}
@media (min-width: 768px){ .pd-root .pd-m-only{display:none} }
@media (prefers-reduced-motion: reduce){
  .pd-root *,.pd-portal *,.pd-root *::before,.pd-root *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0ms!important}
  .pd-confetti{display:none}
}
@media (forced-colors: active){
  .pd-bead{forced-color-adjust:none}
  .pd-sw[aria-checked=true] .pd-swb{outline:2px solid CanvasText}
}
`

export const CSS = TOKENS + ENTRY + PANEL + BOARD + CONTROLS + RESPONSIVE

let refs = 0

/** Add the shared stylesheet once; returns a release function (removed with the last user). */
export function ensureStyles(doc: Document = document): () => void {
  refs++
  if (!doc.getElementById(STYLE_ID)) {
    const el = doc.createElement('style')
    el.id = STYLE_ID
    el.textContent = CSS
    doc.head.append(el)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    refs--
    if (refs <= 0) { refs = 0; doc.getElementById(STYLE_ID)?.remove() }
  }
}
