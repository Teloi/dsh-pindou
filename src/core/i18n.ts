/**
 * UI copy, Chinese first (wording follows the designer's prototype). Keys are
 * shared by both dictionaries; the host's locale service substitutes `{name}`
 * parameters, and `translate` below does the same outside the host.
 */
/**
 * Product names, single source for the UI copy (package.json `displayName` /
 * `description` carry the same names for the plugin manager and listings).
 */
export const APP_NAME_ZH = '拼豆小憩'
export const APP_NAME_EN = 'Bead Break'

/**
 * Every key holds its [中文, English] pair side by side, so a key can't exist in
 * one language only (a missing half is a type error) and the bundle carries each
 * key name once. `zh` / `en` are the two dictionaries the host's locale service gets.
 */
const COPY = {
  appName: [APP_NAME_ZH, APP_NAME_EN],
  entryLabel: [`打开${APP_NAME_ZH}`, `Open ${APP_NAME_EN}`],
  entryBusyLabel: ['模型正在思考 — 来拼一会儿豆子？', 'The model is thinking — place a few beads?'],
  hintText: ['趁现在拼一个？', 'Quick bead break?'],
  hintGo: [`打开${APP_NAME_ZH}`, `Open ${APP_NAME_EN}`],
  hintClose: ['关闭提示', 'Dismiss hint'],
  shortcutToggle: [`打开或收起${APP_NAME_ZH}`, `Toggle ${APP_NAME_EN}`],
  guideDesc: ['模型忙的时候，拼几颗豆子', 'Place a few beads while the model works'],
  back: ['返回', 'Back'],
  settings: ['设置', 'Settings'],
  menuBusyHint: ['忙时轻提示', 'Hint while busy'],
  menuCodes: ['显示色号', 'Show color codes'],
  menuGuide: ['显示淡色引导', 'Show faint guide'],
  menuCoach: ['重看新手引导', 'Show the intro again'],
  menuKeys: ['快捷键', 'Keyboard shortcuts'],
  homeFree: ['自由拼', 'Free play'],
  homeFreeDesc: ['空白豆板，随手拼', 'Blank board, anything goes'],
  homeAi: ['AI 生成', 'AI pattern'],
  homeAiDesc: ['一句话变图纸', 'One sentence to a pattern'],
  homePicture: ['图片转图纸', 'Picture to pattern'],
  homePictureDesc: ['照片变成图纸', 'A photo becomes a pattern'],
  needNewerDsh: ['需要新版 DSH', 'Requires a newer DSH'],
  loadRetry: ['加载失败，点此重试', 'Couldn’t load · Retry'],
  myPattern: ['我的图纸', 'My pattern'],
  homeTemplates: ['模板', 'Patterns'],
  homeCount: ['{n} 个', '{n}'],
  homeContinue: ['继续上次', 'Continue'],
  tplMeta: ['{n} 色', '{n} col'],
  tplSr: ['，{size}×{size}，难度 {diff}/3', ', {size}×{size}, difficulty {diff}/3'],
  tplSrDone: ['，已完成', ', done'],
  playFree: ['自由拼', 'Free play'],
  playBeads: ['{n} 颗', '{n} beads'],
  playEmpty: ['点按或拖动放豆子', 'Tap or drag to place beads'],
  playWrong: ['{n} 颗放错', '{n} misplaced'],
  playOneStep: ['还差一步：擦掉 {n} 颗放错的豆', 'One step left: erase the misplaced beads ({n})'],
  playProgress: ['{ok}/{total} · {pct}%', '{ok}/{total} · {pct}%'],
  progressLabel: ['完成度', 'Progress'],
  aiTokens: ['消耗 {n} tokens', '{n} tokens'],
  aiTokensCached: ['来自缓存 · 0 tokens', 'cached · 0 tokens'],
  boardLabel: ['{size}×{size} 豆板', '{size}×{size} bead board'],
  boardHelp: ['方向键移动，空格或回车放豆，Delete 擦除', 'Arrow keys move, Space or Enter places, Delete erases'],
  cellLabel: ['第 {row} 行第 {col} 列，{color}', 'Row {row}, column {col}, {color}'],
  cellGuide: ['，图纸：{color}', ', pattern: {color}'],
  emptyCell: ['空', 'empty'],
  paletteLabel: ['调色盘', 'Palette'],
  colorTip: ['{name} · {code}', '{name} · {code}'],
  toolsLabel: ['工具', 'Tools'],
  toolPaint: ['画笔', 'Brush'],
  toolErase: ['橡皮', 'Eraser'],
  toolPick: ['取色', 'Picker'],
  toolFill: ['填充', 'Fill'],
  undo: ['撤销', 'Undo'],
  redo: ['重做', 'Redo'],
  clear: ['清空', 'Clear'],
  size: ['尺寸', 'Size'],
  coachTitle: ['30 秒上手', '30-second intro'],
  coachBody: ['选一个颜色，在豆板上点按或拖动放豆；右键或橡皮拿掉。拼完点「熨烫」让豆子融在一起。', 'Pick a color, then tap or drag on the board to place beads; right-click or the eraser removes them. When done, Iron to fuse the beads.'],
  coachOk: ['开始拼', 'Start'],
  doneTitle: ['拼好啦！', 'All done!'],
  doneBody: ['要熨烫一下让它定型吗？', 'Iron it to fuse the beads?'],
  doneLater: ['再改改', 'Keep editing'],
  iron: ['熨烫', 'Iron'],
  ironing: ['熨烫中…', 'Ironing…'],
  resultTitle: ['定型完成', 'Fused!'],
  resultCount: ['{n} 颗 · {c} 色', '{n} beads · {c} colors'],
  unIron: ['撤销熨烫', 'Un-iron'],
  again: ['再拼一个', 'New one'],
  exportPng: ['导出 PNG', 'Export PNG'],
  fillBoard: ['一键铺满', 'Fill board'],
  toastCleared: ['已清空', 'Board cleared'],
  toastNewGame: ['已开始新的一局', 'Started a new board'],
  toastUndo: ['撤销', 'Undo'],
  toastLocked: ['已熨烫，撤销后可继续修改', 'Ironed — undo to keep editing'],
  toastExported: ['已导出 {name}', 'Saved {name}'],
  toastCopied: ['图片已复制，可以直接粘贴到对话里', 'Image copied — paste it into the chat'],
  toastCopyFailed: ['复制失败，可以改用导出', 'Copy failed — try Export instead'],
  copyImage: ['复制图片', 'Copy image'],
  previewTitle: ['右键或长按图片另存为', 'Right-click or long-press the image to save it'],
  previewClose: ['关闭', 'Close'],
  toastExportFailed: ['导出失败', 'Export failed'],
  storageUnavailable: ['浏览器存储不可用，进度不会保存', 'Browser storage unavailable — progress will not be saved'],
  storageRecovered: ['本地存档损坏，已重置', 'Saved data was corrupt and has been reset'],
  dismiss: ['关闭', 'Dismiss'],
  aiPlaceholder: ['描述你想拼的东西，比如：戴墨镜的柴犬', 'Describe what to make, e.g. a shiba wearing sunglasses'],
  aiLabel: ['描述', 'Description'],
  aiGenerate: ['生成', 'Generate'],
  aiGenerating: ['正在构思图纸…', 'Sketching a pattern…'],
  aiCancel: ['取消', 'Cancel'],
  aiChars: ['{n}/{max}', '{n}/{max}'],
  aiTipsTitle: ['小贴士', 'Tips'],
  aiTips: ['越具体、越简单越好：一个主体 + 一两个特征。生成结果会作为图纸，你照着拼；也可以一键铺满。', 'Specific and simple works best: one subject plus a feature or two. The result becomes a pattern to follow — or fill it in one go.'],
  aiExamples: ['橘猫|西瓜|小火箭|恐龙|彩虹|仙人掌', 'orange cat|watermelon|rocket|dinosaur|rainbow|cactus'],
  aiRepaired: ['模型输出有瑕疵，已自动修复', 'The model output had flaws and was repaired'],
  aiTruncated: ['输出被截断，缺的部分留空', 'The output was cut off; missing cells are left empty'],
  aiModel: ['模型：{model}', 'Model: {model}'],
  aiMock: ['演示模式：未调用真实模型', 'Demo mode: no real model was called'],
  aiNotConfigured: ['还没有可用的模型', 'No model available yet'],
  aiNotConfiguredBody: ['AI 生成会调用你在 DSH 中配置的模型。配置好后回来即可使用，其他玩法不受影响。', 'AI patterns use the model you configured in DSH. Come back once it is set up — everything else works without it.'],
  aiStep1: ['打开 DSH 设置 → 模型', 'Open DSH Settings → Models'],
  aiStep1Keys: ['按 {keys} 打开 DSH 设置 → 模型', 'Press {keys} to open DSH Settings → Models'],
  aiStep2: ['添加 DeepSeek API Key 并选择默认模型（或设置环境变量 DEEPSEEK_API_KEY 后重启 DSH）', 'Add a DeepSeek API key and pick a default model (or set DEEPSEEK_API_KEY and restart DSH)'],
  aiStep3: ['回到这里点「重新检测」', 'Come back and press “Check again”'],
  aiOpenSettings: ['打开 DSH 设置', 'Open DSH Settings'],
  aiSettingsHome: ['会打开设置首页，请在其中选择「模型」。', 'This opens the Settings home; choose “Models” there.'],
  aiSettingsManual: ['插件没法直接帮你打开模型设置，请按上面的步骤手动打开。', 'The plugin can’t open model settings for you; follow the steps above.'],
  aiMeta: ['约 300–900 tokens', 'About 300–900 tokens'],
  aiVerifyHint: ['首次生成会检测模型配置', 'The first generation checks the model setup'],
  aiRecheck: ['重新检测', 'Check again'],
  aiPlayTemplates: ['先玩模板', 'Play patterns'],
  aiErrTitle: ['生成失败', 'Generation failed'],
  aiErrParse: ['模型返回的内容拼不成图纸，换个说法再试试', 'The reply could not be turned into a pattern — try rephrasing'],
  aiErrNetwork: ['网络或服务暂时不可用', 'Network or service unavailable'],
  aiErrBusy: ['上一次生成还没结束', 'The previous generation is still running'],
  aiErrRate: ['太快啦，稍等几秒再试', 'Too fast — wait a few seconds'],
  aiErrEmpty: ['先写一句描述', 'Write a short description first'],
  aiErrTimeout: ['模型响应超时，再试一次', 'The model took too long — try again'],
  aiRetry: ['重试', 'Retry'],
  keysTitle: ['快捷键', 'Keyboard shortcuts'],
  keysTools: ['B 画笔 · E 橡皮 · I 取色 · G 填充', 'B brush · E eraser · I picker · G fill'],
  keysColors: ['1–9、0 选色，[ ] 切换颜色', '1–9, 0 pick a color; [ ] cycle'],
  keysHistory: ['⌘/Ctrl+Z 撤销 · ⇧⌘/Ctrl+Z 重做', '⌘/Ctrl+Z undo · ⇧⌘/Ctrl+Z redo'],
  keysBoard: ['方向键移动 · 空格/回车放豆 · Delete 擦除 · 右键擦除 · Alt+点按取色', 'Arrows move · Space/Enter place · Delete erase · right-click erase · Alt+tap pick'],
  keysEsc: ['Esc 关闭菜单或卡片', 'Esc closes menus and cards'],
  celebrate: ['完成！', 'Done!'],
} as const satisfies Record<string, readonly [string, string]>

export type MessageKey = keyof typeof COPY

function dictionary(lang: 0 | 1): Readonly<Record<MessageKey, string>> {
  const out = {} as Record<MessageKey, string>
  for (const key of Object.keys(COPY) as MessageKey[]) out[key] = COPY[key][lang]
  return out
}

export const zh = dictionary(0)
export const en = dictionary(1)

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function translate(lang: 'zh' | 'en', key: MessageKey, params?: Record<string, string | number>): string {
  const template: string = (lang === 'en' ? en : zh)[key] ?? zh[key] ?? key
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (params && name in params ? String(params[name]) : m))
}

export function makeTranslate(lang: 'zh' | 'en'): Translate {
  return (key, params) => translate(lang, key, params)
}
