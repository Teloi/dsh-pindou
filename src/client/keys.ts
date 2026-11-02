/**
 * The keyboard shortcut list of the ⋯ menu, moved out of the first screen into lib/client.big-store.js
 * (designer, recheck round: the first screen stays within its 35282 B gzip cap). The entry preloads that
 * chunk when idle; until it is here the menu shows skeleton lines under 「快捷键」 and fills them in place,
 * and if it can't load the menu says so with a retry (never blank). Same lines as before, zh and en.
 */
export const KEYS = {
  zh: [
    'B 画笔 · E 橡皮 · I 取色 · G 填充',
    '1–9、0 选色，[ ] 切换颜色',
    '⌘/Ctrl+Z 撤销 · ⇧⌘/Ctrl+Z 重做',
    '方向键移动 · 空格/回车放豆 · Delete 擦除 · 右键擦除 · Alt+点按取色',
    'Esc 关闭菜单或卡片',
  ],
  en: [
    'B brush · E eraser · I picker · G fill',
    '1–9, 0 pick a color; [ ] cycle',
    '⌘/Ctrl+Z undo · ⇧⌘/Ctrl+Z redo',
    'Arrows move · Space/Enter place · Delete erase · right-click erase · Alt+tap pick',
    'Esc closes menus and cards',
  ],
} as const
