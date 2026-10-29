// End-to-end run against DSH Web started from source.
//
//   node e2e/run.mjs                   # everything into e2e/.out (screenshots in e2e/.out/assets)
//   node e2e/run.mjs --update-assets   # also refresh the README screenshots + GIF in docs/assets
//                                      # (same as E2E_UPDATE_ASSETS=1)
//
// Needs a DeepSeek Harness checkout (DSH_SRC, default /home/box/src/deepseek-harness,
// built with `pnpm build`) and a Chrome/Chromium (CHROME, default /usr/bin/google-chrome).
// Everything runs in throwaway dirs under the OS temp dir: DSH_HOME, the workspace,
// and a fake Messages-API LLM (e2e/fake-llm.mjs). No real API key is used.
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { auditPanel, guideRings, resumePlugin, settlePlugin, toastCovers, toastLongLine } from './audit.mjs'
import { startFakeLlm } from './fake-llm.mjs'
import { dropFile, HEART, NO_ASYNC_REQUIRE, pasteFile, png, storedFootprint } from './picture.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_SRC = process.env.DSH_SRC ?? '/home/box/src/deepseek-harness'
const DSH_BIN = join(DSH_SRC, 'apps/cli/lib/bin.js')
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome'
const DSH_HOME = process.env.E2E_DSH_HOME ?? join(tmpdir(), 'pindou-e2e-home')
const WS = join(tmpdir(), 'pindou-e2e-ws')
const OUT = join(REPO, 'e2e/.out')
const UPDATE_ASSETS = process.argv.includes('--update-assets') || process.env.E2E_UPDATE_ASSETS === '1'
const ASSETS = UPDATE_ASSETS ? join(REPO, 'docs/assets') : join(OUT, 'assets')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
// Optional archive of every screenshot (and its audit) for a manual self-check, outside the repo.
const SELFCHECK = process.env.E2E_SELFCHECK_DIR ? resolve(process.env.E2E_SELFCHECK_DIR) : null
// Chrome serialises `corner-shape: round` as superellipse(1)
const ROUND = new Set(['round', 'superellipse(1)'])
// Every page's clock starts at one fixed instant and then runs in real time, so nothing on screen
// depends on when the run happens. Not a frozen clock (clock.setFixedTime): elapsed-time logic
// such as the 1.5 s AI cooldown would never see time pass and refuse every second request.
// E2E_CLOCK=real turns it off.
const FIXED_NOW = process.env.E2E_CLOCK === 'real' ? null : new Date('2026-06-01T10:00:00+08:00')

const log = (...a) => { process.stdout.write(`${a.join(' ')}\n`) }
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  log(ok ? '  ✓' : '  ✗', name, detail)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'audit'), { recursive: true })
mkdirSync(ASSETS, { recursive: true })
mkdirSync(WS, { recursive: true })
if (!existsSync(join(WS, 'README.md'))) writeFileSync(join(WS, 'README.md'), '# e2e workspace\n')

// 1. install the plugin into an isolated Web profile from this checkout
const profilePkg = join(DSH_HOME, 'profiles/web/package.json')
if (!existsSync(profilePkg) || !readFileSync(profilePkg, 'utf8').includes('"dsh-pindou"')) {
  log('installing plugin into', DSH_HOME)
  const r = spawnSync(process.execPath, [DSH_BIN, 'plugin', '--profile', 'web', 'add', `link:${REPO}`],
    { cwd: WS, env: { ...process.env, DSH_HOME }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  writeFileSync(join(OUT, 'install.log'), `${r.stdout}\n${r.stderr}`)
  if (r.status !== 0) throw new Error(`plugin install failed, see ${join(OUT, 'install.log')}`)
}

// 2. fake LLM + DSH Web
const llm = await startFakeLlm({ chatMs: Number(process.env.FAKE_LLM_CHAT_MS ?? 30000) })
const dsh = spawn(process.execPath, [DSH_BIN, '--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
  cwd: WS,
  env: { ...process.env, DSH_HOME, DEEPSEEK_BASE_URL: llm.url, DEEPSEEK_API_KEY: 'e2e-placeholder' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let dshLog = ''
const url = await new Promise((ok, fail) => {
  const t = setTimeout(() => { fail(new Error('DSH did not print a URL in 60s')) }, 60000)
  const on = (d) => {
    dshLog += d
    const m = /(http:\/\/127\.0\.0\.1:\d+\/\S*)/.exec(dshLog)
    if (m) { clearTimeout(t); ok(m[1]) }
  }
  dsh.stdout.on('data', on)
  dsh.stderr.on('data', on)
  dsh.on('exit', (code) => { fail(new Error(`DSH exited early (${code})`)) })
})
log('DSH Web up on', new URL(url).origin)

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const pageErrors = []

// Host UI labels the harness clicks (DSH locale files: ui-conversation hero.chooseWorkspace,
// ui-workspace menu.addWorkspace, ui-directory-picker-browse browser.*, ui-sidebar-right chrome.*).
const HOST = {
  zh: { choose: '选择工作区', add: '添加工作区…', edit: '编辑路径', open: '打开', full: '全屏' },
  en: { choose: 'Choose workspace', add: 'Add workspace…', edit: 'Edit path', open: 'Open', full: 'Fullscreen' },
}

async function newPage(opts, lang = 'zh', init) {
  const ctx = await browser.newContext({ locale: lang === 'zh' ? 'zh-CN' : 'en-US', deviceScaleFactor: 2, ...opts })
  if (init) await ctx.addInitScript(init)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const p = await ctx.newPage()
  if (FIXED_NOW) { await p.clock.install({ time: FIXED_NOW }); await p.clock.resume() }
  p.on('pageerror', (e) => { pageErrors.push(String(e)) })
  p.on('console', (m) => { if (m.type() === 'error' && /pindou/i.test(m.text())) pageErrors.push(m.text()) })
  await p.goto(url)
  await p.getByRole('button', { name: HOST[lang].choose }).waitFor({ timeout: 30000 })
  await p.waitForTimeout(600)
  const notice = p.locator('button', { hasText: /^(继续|Continue)$/ })
  if (await notice.count()) await notice.first().click()
  return p
}

async function startSession(p, text, lang = 'zh') {
  const L = HOST[lang]
  await p.getByRole('button', { name: L.choose }).click()
  await p.waitForTimeout(500)
  // first run: directory picker; later runs: a menu of known workspaces
  const known = p.getByRole('button', { name: basename(WS), exact: true })
  if (await known.count()) {
    await known.last().click()
  } else {
    const add = p.locator('button', { hasText: L.add })
    if (await add.count()) await add.last().click()
    await p.getByRole('button', { name: L.edit }).click()
    const input = p.locator('input:focus')
    await input.fill(WS)
    await input.press('Enter')
    await p.waitForTimeout(500)
    await p.getByRole('button', { name: L.open, exact: true }).click()
  }
  await p.waitForTimeout(800)
  const editor = p.locator('[contenteditable=true]').first()
  await editor.click()
  await p.keyboard.type(text)
  await p.keyboard.press('Enter')
  await p.locator('.pd-entry').waitFor({ timeout: 15000 })
}

// Host rules that reach our elements and why each property is harmless (design I1).
// Anything not listed fails the leak check; a new host release that adds a global
// rule shows up here first.
const ACCEPTED_LEAKS = {
  'corner-shape': 'reset to round on every .pd-root/.pd-portal element and pseudo-element',
  ...Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(c => [`corner-${c}-shape`, 'longhand of corner-shape, reset the same way'])),
  'app-region': '-webkit-app-region as Chrome reports it',
  'outline-color': 'host focus ring colour; our :focus-visible sets its own colour and the host hides rings for pointer focus on purpose',
  'outline-width': 'same width as ours (2px)',
  '--dsw-focus-ring-color': 'custom property, unused by plugin rules',
  '-webkit-app-region': 'macOS desktop drag regions; no-drag on controls is what we want',
  'outline-style': 'host [data-dsh-automatic-focus]: no ring when focus was moved by code, the host convention for dialogs',
  'font-family': 'button/input inherit the app font; we want the host font',
  'text-autospace': 'host CJK/Latin spacing for prose; reset to no-autospace for bead codes, counts and token numbers',
  'scrollbar-color': 'host scrollbar theme for .pd-scroll, intended',
  'scrollbar-width': 'host scrollbar theme for .pd-scroll, intended',
}
const leaksSeen = new Map()
const audits = []
/** `text: false` only for scenes with no plugin text by design (icon-only entry); their text is audited where it appears. */
async function audit(p, label, { text = true } = {}) {
  if (!await p.locator('.pd-root, .pd-portal').count()) return
  const a = await p.evaluate(auditPanel)
  mkdirSync(join(OUT, 'audit'), { recursive: true })
  writeFileSync(join(OUT, 'audit', `${label}.json`), `${JSON.stringify(a, null, 2)}\n`)
  for (const l of a.leaks) {
    const prev = leaksSeen.get(l.selector) ?? { ...l, props: new Set() }
    for (const x of l.props) prev.props.add(x)
    leaksSeen.set(l.selector, prev)
  }
  const badIcons = a.icons.filter(i => !i.pdI || i.w > 24 || i.h > 24 || i.w < 8 || i.h < 8)
  const badRound = a.round.filter(r => !ROUND.has(r.shape))
  const badContrast = a.contrast.filter(c => !c.ok)
  audits.push({ label, icons: a.icons.length, round: a.round.length, contrast: a.contrast.length, badIcons, badRound, wraps: a.wraps, badContrast })
  check(`[${label}] icons carry .pd-i and stay within 8–24 px (${a.icons.length})`, badIcons.length === 0, JSON.stringify(badIcons.slice(0, 3)))
  check(`[${label}] circles keep corner-shape round (${a.round.length})`, badRound.length === 0, JSON.stringify(badRound.slice(0, 3)))
  check(`[${label}] no text squeezed to one character per line, no wrapped button labels`, a.wraps.length === 0, JSON.stringify(a.wraps.slice(0, 3)))
  // a pass needs at least one measured text: 0 texts means the audit looked at nothing
  if (text) check(`[${label}] text contrast ≥ 4.5:1 (3:1 large) (${a.contrast.length} texts, min ${Math.min(...a.contrast.map(c => c.ratio))})`, a.contrast.length > 0 && badContrast.length === 0, a.contrast.length ? JSON.stringify(badContrast.slice(0, 4)) : 'no text measured')
}
const shot = async (p, name, opts, dir = ASSETS, auditOpts = {}) => {
  await p.screenshot({ path: join(dir, `${name}.png`), ...opts })
  log('  📷', relative(REPO, join(dir, `${name}.png`)))
  if (SELFCHECK) { mkdirSync(SELFCHECK, { recursive: true }); copyFileSync(join(dir, `${name}.png`), join(SELFCHECK, `${name}.png`)) }
  await audit(p, name, auditOpts)
  await pluginShot(p, name)
}
/**
 * Settled crops of just the plugin, one per .pd-root / top-level .pd-portal (name.png, name.1.png…), in e2e/.out/plugin/, for
 * run-to-run comparison with `node e2e/compare-shots.mjs <runA> <runB>`. The full-page shots
 * above also carry host clocks and streamed text, and can catch a bead mid-animation, so they
 * differ between two runs of the same build; these crops wait for the plugin's finite
 * animations first and leave the host out.
 */
async function pluginShot(p, name) {
  const boxes = await p.evaluate(settlePlugin)
  const dir = join(OUT, 'plugin')
  mkdirSync(dir, { recursive: true })
  for (const [i, box] of boxes.entries()) {
    const file = `${name}${i ? `.${i}` : ''}.png`
    await p.screenshot({ path: join(dir, file), clip: box })
    if (SELFCHECK) { mkdirSync(join(SELFCHECK, 'plugin'), { recursive: true }); copyFileSync(join(dir, file), join(SELFCHECK, 'plugin', file)) }
  }
  await p.evaluate(resumePlugin)
}
const outShot = (p, name, opts, auditOpts) => shot(p, name, opts, OUT, auditOpts)
/** Is focus somewhere real (not <body>) — design I2 */
const focusDesc = p => p.evaluate(() => {
  const a = document.activeElement
  return !a || a === document.body ? 'body' : `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}${a.hasAttribute('data-pd-menu-btn') ? '[menu-btn]' : ''} ${(a.textContent ?? '').slice(0, 12)}`
})
async function openPanel(p) {
  await p.locator('.pd-entry').click()
  await p.locator('.pd-root').waitFor()
  await p.waitForTimeout(500)
}
async function playFirstTemplate(p) {
  await p.locator('.pd-tpl').first().click()
  await p.locator('.pd-board').waitFor()
  await p.waitForTimeout(300)
  const c = p.locator('.pd-overlay.pd-coach button')
  if (await c.count()) { await c.first().click(); await p.waitForTimeout(250) }
}
const fakeStatus = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false, route: 'host', model: 'deepseek-v4-flash', verified: true }) })
const panelBox = p => p.locator('.pd-root').boundingBox()
/** N8: the done/result card sits under the board in the flow, swapped for tools + palette + footer. */
const cardFlowInfo = () => {
  const card = document.querySelector('.pd-under > .pd-overlay')
  const board = document.querySelector('.pd-board')
  const root = document.querySelector('.pd-root')
  if (!card || !board) return null
  const c = card.getBoundingClientRect(), b = board.getBoundingClientRect(), r = root.getBoundingClientRect()
  const visible = [...document.querySelectorAll('.pd-tools, .pd-palette, .pd-foot')].filter(e => getComputedStyle(e).visibility !== 'hidden').map(e => e.className)
  const btns = [...card.querySelectorAll('button')].map((x) => { const q = x.getBoundingClientRect(); return { h: Math.round(q.height), w: Math.round(q.width), lines: Math.round(q.height / parseFloat(getComputedStyle(x).lineHeight || '16')), right: q.right, left: q.left } })
  return {
    swapped: !!document.querySelector('.pd-under.pd-swapped'),
    belowBoard: c.top >= b.bottom - 1, inRoot: c.left >= r.left - 1 && c.right <= r.right + 1,
    visible, minBtn: Math.min(...btns.map(x => x.h)), btnsInCard: btns.every(x => x.left >= c.left - 1 && x.right <= c.right + 1),
    card: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)],
  }
}
const cardFlow = () => {
  const card = document.querySelector('.pd-under > .pd-overlay')
  const board = document.querySelector('.pd-board')
  const root = document.querySelector('.pd-root')
  if (!card || !board || !document.querySelector('.pd-under.pd-swapped')) return false
  const c = card.getBoundingClientRect(), b = board.getBoundingClientRect(), r = root.getBoundingClientRect()
  const hiddenTools = [...document.querySelectorAll('.pd-tools, .pd-palette, .pd-foot')].every(e => getComputedStyle(e).visibility === 'hidden')
  const btns = [...card.querySelectorAll('button')].map(x => x.getBoundingClientRect())
  return hiddenTools && c.top >= b.bottom - 1 && c.left >= r.left - 1 && c.right <= r.right + 1
    && btns.every(q => q.height >= 32 && q.left >= c.left - 1 && q.right <= c.right + 1)
}
/** N6: the real hit box of a control (probe elementFromPoint around it, pseudo-element extensions included). */
const hitBox = (p, sel) => p.evaluate((q) => {
  const el = document.querySelector(q)
  if (!el) return null
  const r = el.getBoundingClientRect()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let y = Math.floor(r.top - 20); y <= r.bottom + 20; y++) {
    for (let x = Math.floor(r.left - 20); x <= r.right + 20; x++) {
      const h = document.elementFromPoint(x + 0.5, y + 0.5)
      if (h && (h === el || el.contains(h))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 }
}, sel)
const big = b => !!b && b.w >= 32 && b.h >= 32
const progressText = p => p.locator('.pd-status .pd-r').first().textContent()
/** O3 ring measurements ({ normal, hot } from guideRings): lowest ratio, all ≥ 3:1, the failures. */
const minOf = r => Math.min(...[...r.normal, ...r.hot].map(x => x.ratio ?? 0))
const allOk = r => r.normal.length === 16 && r.hot.length === 16 && [...r.normal, ...r.hot].every(x => x.ok)
const bad = r => JSON.stringify([...r.normal, ...r.hot].filter(x => !x.ok).slice(0, 4))
/** The third start card: picture to pattern (spec §18.1). */
const pictureCard = p => p.locator('.pd-start .pd-big').nth(2)
const b64 = buf => Buffer.from(buf).toString('base64')
/** Place `n` correct beads by following the ghost guide. */
async function placeBeads(p, n) {
  let placed = 0
  const swatches = p.locator('.pd-sw:not(.pd-dim)')
  for (let k = 0; k < await swatches.count() && placed < n; k++) {
    await swatches.nth(k).click()
    const spots = await p.evaluate(() => [...document.querySelectorAll('.pd-cell.pd-hot')].map((c) => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }))
    for (const [x, y] of spots) { if (placed >= n) break; await p.mouse.click(x, y); placed++ }
  }
  await p.waitForTimeout(200)
}

// E2E_ONLY=t1 runs just the picture section (the rest of the suite is unchanged)
const ONLY = process.env.E2E_ONLY ?? ''
try {
  sections: {
  // ── T1. picture to pattern (spec §18.2) + lazy modules (spec §18.6), in the real product ──
  log('T1. picture to pattern')
  {
    const CHUNK = /\/dsh-pindou\/client\.picture\.js\?/
    const q = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })
    const net = []
    q.on('request', (r) => { net.push({ url: r.url(), method: r.method(), body: r.postDataBuffer() }) })
    const chunkResponses = []
    q.on('response', (r) => { if (CHUNK.test(r.url())) chunkResponses.push(r.status()) })
    await startSession(q, '看看 README')
    await openPanel(q)
    const live = await pictureCard(q).evaluate(b => ({ lazy: b.dataset.lazy, off: b.getAttribute('aria-disabled'), text: b.textContent, h: Math.round(b.getBoundingClientRect().height) }))
    check('T1 a host with require.async: the third card is live (「图片转图纸 · 照片变成图纸」, 64 tall), nothing fetched before opening',
      live.lazy === 'idle' && live.off === null && live.text === '图片转图纸照片变成图纸' && live.h === 64 && chunkResponses.length === 0, JSON.stringify(live))
    await outShot(q, 't1-home-cards')
    await pictureCard(q).click()
    await q.locator('.pd-pic-drop').waitFor({ timeout: 10000 })
    check('T1 opening the page fetches lib/client.picture.js from DSH once (200) and it runs', chunkResponses.join() === '200', chunkResponses.join())
    // measure once the page has slid in
    await q.evaluate(() => Promise.all(document.getAnimations().filter(a => a.animationName === 'pd-view-in').map(a => a.finished)))
    const empty = await q.evaluate(() => ({
      title: document.querySelector('.pd-head h2')?.textContent,
      back: !!document.querySelector('.pd-head .pd-ib'),
      zone: document.querySelector('.pd-pic-drop')?.textContent,
      accept: document.querySelector('.pd-pic-file')?.accept,
      note: document.querySelector('.pd-pic-note')?.textContent,
      square: (() => { const r = document.querySelector('.pd-pic-drop').getBoundingClientRect(); return Math.abs(r.width - r.height) < 1 && r.width <= 480 })(),
      zoneBox: (() => { const r = document.querySelector('.pd-pic-drop').getBoundingClientRect(); const s = document.querySelector('.pd-root').getBoundingClientRect(); return [r.width, r.height, s.width, s.height] })(),
      dashed: getComputedStyle(document.querySelector('.pd-pic-drop')).borderTopStyle,
      noteColor: getComputedStyle(document.querySelector('.pd-pic-note')).color,
      text3: getComputedStyle(document.querySelector('.pd-root')).getPropertyValue('--pd-text-3').trim(),
    }))
    check('T1 empty state: header 「图片转图纸」 with back, square dashed zone ≤ 480, 「拖入、粘贴或选择一张图片」/「选择图片」, accept image/*, the privacy note',
      empty.title === '图片转图纸' && empty.back && empty.square && empty.dashed === 'dashed' && empty.zone === '拖入、粘贴或选择一张图片选择图片' && empty.accept === 'image/*' && empty.note === '图片只在本机处理，不会上传', JSON.stringify(empty))
    await outShot(q, 't1-empty')
    // keyboard: Enter on the zone opens the system picker
    // Playwright turns file-chooser interception on asynchronously when the first 'filechooser'
    // listener is added; a key press sent in the same tick (Promise.all with waitForEvent) can
    // reach Chrome first, and the picker then opens natively, with no event (≈1 in 4 in a bare
    // page). So the listener is installed and a round trip made before the key is pressed.
    const choosers = []
    q.on('filechooser', (c) => { choosers.push(c) })
    await q.evaluate(() => 0)
    await q.locator('.pd-pic-drop').focus()
    const zoneFocus = await focusDesc(q)
    await q.keyboard.press('Enter')
    await q.waitForFunction(() => true)
    for (let i = 0; i < 50 && !choosers.length; i++) await q.waitForTimeout(20)
    check('T1 Enter on the drop zone opens the file picker', choosers.length === 1, `${zoneFocus}; choosers ${choosers.length}`)
    // errors: refused before any decode
    const alertText = () => q.locator('#pd-pic-err').textContent()
    await q.locator('.pd-pic-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') })
    await q.waitForTimeout(60)
    const shaking = await q.locator('.pd-pic-drop.pd-shake').count()
    await q.waitForTimeout(250)
    const err1 = { text: await alertText(), shook: shaking, after: await q.locator('.pd-pic-drop.pd-shake').count(), border: await q.locator('.pd-pic-drop').evaluate(e => getComputedStyle(e).borderTopColor) }
    check('T1 a text file: 「这不是图片」, red border, a shake that ends', err1.text === '这不是图片' && err1.shook === 1 && err1.after === 0, JSON.stringify(err1))
    await outShot(q, 't1-error-not-image')
    await q.locator('.pd-pic-file').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>window.pdSvgRan=1</script><rect width="9" height="9"/></svg>') })
    await q.waitForTimeout(100)
    check('T1 an SVG is never decoded: 「这张图打不开」', await alertText() === '这张图打不开' && await q.evaluate(() => !window.pdSvgRan))
    await q.locator('.pd-pic-file').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: png(9000, 2, () => [0, 0, 0, 255]) })
    await q.waitForTimeout(100)
    check('T1 a 9000 px wide PNG: 「图片太大了，换一张小点的」 (from the header)', await alertText() === '图片太大了，换一张小点的')
    await q.locator('.pd-pic-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.concat([HEART.subarray(0, 40), Buffer.alloc(200)]) })
    await q.waitForTimeout(200)
    check('T1 a broken PNG: 「这张图打不开」', await alertText() === '这张图打不开')
    // a real picture
    const before = net.length
    const t0 = Date.now()
    await q.locator('.pd-pic-file').setInputFiles({ name: 'heart.png', mimeType: 'image/png', buffer: HEART })
    const prev = q.locator('.pd-pic-prev canvas[role=img]')
    await prev.waitFor({ timeout: 5000 })
    // the first preview: 120 ms after the picture, then a frame (aria-busy until then)
    await q.locator('.pd-pic-prev canvas[aria-busy=false]').waitFor({ timeout: 5000 })
    const firstPreviewMs = Date.now() - t0
    const label = await prev.getAttribute('aria-label')
    const beads16 = Number(/共 (\d+) 颗豆/.exec(label)?.[1])
    check(`T1 a 1200×900 PNG previews as 16×16 with the background removed (${label}, ${firstPreviewMs} ms)`, /^16×16 预览，共 \d+ 颗豆$/.test(label ?? '') && beads16 > 40 && beads16 < 256, label)
    const adjust = await q.evaluate(() => ({
      pressed: [...document.querySelectorAll('.pd-pic [aria-pressed=true]')].map(b => b.textContent),
      switches: [...document.querySelectorAll('.pd-pic [role=switch]')].map(b => `${b.textContent}:${b.getAttribute('aria-checked')}`),
      start: document.querySelector('.pd-pic-acts .pd-primary')?.disabled === false,
    }))
    check('T1 adjust defaults: 16×16, 全部 16 色, 抖动 off, 去掉背景 on, 开始拼 enabled', adjust.pressed.join() === '16×16,全部 16 色' && adjust.switches.join() === '抖动:false,去掉背景:true' && adjust.start, JSON.stringify(adjust))
    await outShot(q, 't1-adjust')
    // keyboard on the crop: + zooms, arrows pan
    await q.locator('.pd-pic-crop').focus()
    await q.keyboard.press('+')
    await q.keyboard.press('ArrowLeft')
    const zoom = Number(await q.locator('.pd-pic input[type=range]').inputValue())
    check('T1 + on the crop zooms in (1.25), arrows pan', Math.abs(zoom - 1.25) < 0.01, String(zoom))
    await q.keyboard.press('-')
    await q.locator('.pd-pic [aria-pressed]', { hasText: '24×24' }).click()
    await q.locator('.pd-pic [aria-pressed]', { hasText: '8 色' }).click()
    await q.locator('.pd-pic [role=switch]', { hasText: '抖动' }).click()
    await q.waitForFunction(() => (document.querySelector('.pd-pic-prev canvas[aria-busy=false]')?.getAttribute('aria-label') ?? '').startsWith('24×24 预览'), null, { timeout: 3000 })
    await q.waitForTimeout(200)
    await outShot(q, 't1-adjust-24-8-dither')
    await q.locator('.pd-pic [role=switch]', { hasText: '抖动' }).click()
    await q.locator('.pd-pic-acts .pd-primary').click()
    await q.locator('.pd-board').waitFor({ timeout: 5000 })
    await q.waitForTimeout(300)
    const coach = q.locator('.pd-overlay.pd-coach button')
    if (await coach.count()) { await coach.first().click(); await q.waitForTimeout(250) }
    const play = await q.evaluate(() => ({
      status: document.querySelector('.pd-status')?.textContent ?? '',
      guides: document.querySelectorAll('.pd-board .pd-cell.pd-g').length,
      size: document.querySelectorAll('.pd-board .pd-row').length,
      target: JSON.parse(localStorage.getItem('dsh-pindou:v1') ?? '{}').target,
    }))
    check('T1 开始拼: a 24×24 game from the picture titled 「我的图纸」, no AI prompt or tokens, a board:p- source', play.status.includes('我的图纸') && !/token|tokens/i.test(play.status) && play.size === 24 && play.guides > 40 && (play.target ?? '').startsWith('board:p-'), JSON.stringify(play))
    await outShot(q, 't1-play')
    // privacy: nothing uploaded, nothing stored but the pattern
    const sent = net.slice(before).filter(r => r.body && (r.body.includes(HEART.subarray(0, 64)) || r.body.toString('latin1').includes('iVBORw0')))
    const external = net.filter(r => !r.url.startsWith(new URL(url).origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'))
    const posted = net.slice(before).filter(r => r.method !== 'GET').map(r => `${r.method} ${new URL(r.url).pathname} ${r.body?.length ?? 0}`)
    check('T1 the picture is never sent: no request carries it, nothing goes to another origin', sent.length === 0 && external.length === 0, JSON.stringify({ sent: sent.map(r => r.url), external: external.map(r => r.url).slice(0, 3), posted: posted.slice(0, 6) }))
    const foot = await q.evaluate(storedFootprint)
    check('T1 storage holds only the pattern: no picture in localStorage, no IndexedDB or Cache Storage from the plugin', !foot.picture && foot.bytes < 8 * 1024 && !foot.dbs.some(n => /pindou/i.test(n ?? '')) && !foot.caches.some(n => /pindou/i.test(n)), JSON.stringify(foot))
    // drop anywhere on the panel (here: on the board) and paste on the start page
    const small = png(320, 320, (x, y) => ((x - 160) ** 2 + (y - 160) ** 2 < 110 ** 2 ? [98, 182, 233, 255] : [250, 249, 245, 255]))
    const dropped = await q.evaluate(dropFile, ['.pd-board', b64(small), 'ball.png', 'image/png'])
    await q.locator('.pd-pic-crop').waitFor({ timeout: 5000 })
    check('T1 a picture dropped on the panel (on the board) opens the page with it; the host never sees the drop (no chat attachment)', dropped.dropPrevented && dropped.overPrevented && dropped.hostSaw.length === 0 && await q.locator('[data-composer-card] img, [data-attachment]').count() === 0, JSON.stringify(dropped))
    await q.locator('.pd-head .pd-ib').first().click()
    await q.locator('.pd-v-home').waitFor()
    const pasted = await q.evaluate(pasteFile, ['.pd-root', b64(small), 'ball.png', 'image/png'])
    await q.locator('.pd-pic-crop').waitFor({ timeout: 5000 })
    check('T1 a picture pasted on the start page opens the page with it', pasted)
    // paste in the chat input is DSH's, untouched
    await q.locator('.pd-head .pd-ib').first().click()
    const editor = q.locator('[contenteditable=true]').first()
    await editor.click()
    const chatPaste = await q.evaluate(pasteFile, ['[contenteditable=true]', b64(small), 'ball.png', 'image/png'])
    await q.waitForTimeout(300)
    check('T1 a picture pasted into the chat input is left to DSH (the panel stays on the start page)', await q.locator('.pd-v-home').count() === 1 && await q.locator('.pd-pic').count() === 0, `defaultPrevented by host: ${chatPaste}`)
    await q.context().close()

    // ── load failure: in-page retry, Enter and Space, no toast; skeleton after 150 ms ──
    const f = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })
    const errorsBefore = pageErrors.length
    let fetches = 0
    let mode = 'abort'
    await f.route(CHUNK, async (route) => {
      fetches++
      if (mode === 'abort') return route.abort('internetdisconnected')
      if (mode === 'slow') await new Promise((r) => { setTimeout(r, 700) })
      return route.continue()
    })
    await startSession(f, '看看 README')
    await openPanel(f)
    await pictureCard(f).click()
    await f.locator('.pd-lazy[data-lazy=failed] button').waitFor({ timeout: 10000 })
    const failedState = await f.evaluate(() => ({
      text: document.querySelector('.pd-lazy button')?.textContent,
      toast: document.querySelectorAll('.pd-toast').length,
      spinner: document.querySelectorAll('.pd-lazy [class*=spin], .pd-lazy svg').length,
    }))
    check('T1 chunk load failure: in-page 「加载失败，点此重试」 button, no toast, no spinner', failedState.text === '加载失败，点此重试' && failedState.toast === 0 && failedState.spinner === 0, JSON.stringify(failedState))
    await outShot(f, 't1-load-failed')
    await f.locator('.pd-lazy button').focus()
    await f.keyboard.press('Space')
    await f.waitForTimeout(400)
    check('T1 Space on the retry fetches the chunk again (still offline: failed again, still no toast)', fetches === 2 && await f.locator('.pd-lazy[data-lazy=failed]').count() === 1 && await f.locator('.pd-toast').count() === 0, `fetches ${fetches}`)
    await f.locator('.pd-head .pd-ib').first().click()
    const cardFailed = await pictureCard(f).evaluate(b => ({ lazy: b.dataset.lazy, text: b.textContent }))
    check('T1 after a failure the home card says 「加载失败，点此重试」', cardFailed.lazy === 'failed' && cardFailed.text.includes('加载失败，点此重试'), JSON.stringify(cardFailed))
    await outShot(f, 't1-card-failed')
    await pictureCard(f).click()
    await f.locator('.pd-lazy[data-lazy=failed] button').waitFor({ timeout: 10000 })
    mode = 'slow'
    await f.locator('.pd-lazy button').focus()
    await f.keyboard.press('Enter')
    await f.waitForTimeout(80)
    const early = await f.locator('.pd-skel').count()
    await f.waitForTimeout(220)
    const skel = await f.evaluate(() => {
      const s = document.querySelector('.pd-skel')
      if (!s) return null
      const r = s.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(s).backgroundColor, surface: getComputedStyle(s).getPropertyValue('--pd-surface').trim() }
    })
    check('T1 a slow chunk: no block before 150 ms, then a square --pd-surface skeleton (no spinner)', early === 0 && !!skel && skel.w === skel.h && skel.w > 100, JSON.stringify({ early, skel }))
    await outShot(f, 't1-skeleton', undefined, { text: false })
    await f.locator('.pd-pic-drop').waitFor({ timeout: 10000 })
    check('T1 Enter on the retry loads the page once the chunk is reachable', await f.locator('.pd-pic-drop').count() === 1 && await f.locator('.pd-toast').count() === 0, `fetches ${fetches}`)
    await f.context().close()
    // the host logs the failed chunk; those are the failures we caused, nothing else
    const caused = pageErrors.splice(errorsBefore)
    check('T1 the only errors during the failure run are the aborted chunk loads', caused.every(e => /client\.picture\.js|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/i.test(e)), caused.slice(0, 3).join(' | '))

    // ── a host without require.async: card off but focusable, nothing loads, core play works ──
    for (const lang of ['zh', 'en']) {
      const u = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, lang, NO_ASYNC_REQUIRE)
      let asked = 0
      u.on('request', (r) => { if (CHUNK.test(r.url())) asked++ })
      await startSession(u, lang === 'zh' ? '看看 README' : 'Hello', lang)
      await openPanel(u)
      const off = await pictureCard(u).evaluate(b => ({ lazy: b.dataset.lazy, aria: b.getAttribute('aria-disabled'), disabled: b.disabled, tab: b.tabIndex, opacity: getComputedStyle(b).opacity, text: b.textContent }))
      const want = lang === 'zh' ? '需要新版 DSH' : 'Requires a newer DSH'
      check(`T1 (${lang}) no require.async: card at 50% opacity, aria-disabled, still focusable, 「${want}」`, off.lazy === 'unsupported' && off.aria === 'true' && !off.disabled && off.tab === 0 && off.opacity === '0.5' && off.text.endsWith(want), JSON.stringify(off))
      await pictureCard(u).focus()
      const focused = await u.evaluate(() => document.activeElement?.classList.contains('pd-off'))
      await u.keyboard.press('Enter')
      await u.keyboard.press('Space')
      await pictureCard(u).click({ force: true }) // a real click on an aria-disabled button
      await u.waitForTimeout(300)
      check(`T1 (${lang}) the off card takes focus; Enter, Space and click do nothing; the chunk is never requested`, focused && await u.locator('.pd-v-home').count() === 1 && await u.locator('.pd-lazy, .pd-pic').count() === 0 && asked === 0, `asked ${asked}`)
      if (lang === 'zh') {
        const taken = await u.evaluate(pasteFile, ['.pd-root', b64(png(40, 40, () => [0, 0, 0, 255])), 'p.png', 'image/png'])
        check('T1 no require.async: a pasted picture is not taken', !taken && await u.locator('.pd-v-home').count() === 1)
      }
      await outShot(u, `t1-unsupported-${lang}`)
      await u.locator('.pd-start .pd-big').first().click()
      await u.locator('.pd-board').waitFor({ timeout: 5000 })
      for (let i = 0; i < 3; i++) await u.locator('.pd-board .pd-cell').nth(i * 17).click()
      check(`T1 (${lang}) no require.async: free play still works`, await u.locator('.pd-board .pd-cell .pd-bead').count() >= 3)
      await u.context().close()
    }
  }

  if (ONLY === 't1') break sections
  // ── A. desktop light: busy pill above the composer, entry busy dot ──
  log('A. busy pill (1280×800, light)')
  const p = await newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  await startSession(p, '帮我梳理一下这个仓库的结构')
  check('entry button rendered in the session header', await p.locator('.pd-entry').isVisible())
  check('entry shows the busy dot while the model runs', await p.locator('.pd-entry.pd-busy').count() === 1)
  const pill = p.locator('.pd-pill')
  await pill.waitFor({ timeout: 8000 })
  const geo = await p.evaluate(() => {
    const el = document.querySelector('.pd-pill')
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    let card = el.parentElement
    while (card && card.getBoundingClientRect().height < 40) card = card.parentElement
    const c = card.getBoundingClientRect()
    let clipped = false
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (/(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) {
        const ar = a.getBoundingClientRect()
        if (r.top < ar.top || r.bottom > ar.bottom || r.left < ar.left || r.right > ar.right) clipped = true
      }
    }
    return { pill: [r.left, r.top, r.right, r.bottom].map(Math.round), card: [c.left, c.top, c.right, c.bottom].map(Math.round), hitInside: el.contains(hit), clipped, vw: innerWidth, vh: innerHeight }
  })
  check('pill sits above the composer card', geo.pill[3] <= geo.card[1], JSON.stringify(geo))
  check('pill is right-aligned within the composer', geo.pill[2] <= geo.card[2] && geo.pill[0] >= geo.card[0])
  check('pill is not clipped by any ancestor', !geo.clipped && geo.hitInside)
  check('pill is announced politely', await pill.getAttribute('aria-live') === 'polite')
  const pillX = await hitBox(p, '.pd-pill .pd-pill-x')
  check('N6 pill × hit area ≥ 32 × 32', big(pillX), JSON.stringify(pillX))
  await shot(p, 'pill-light', { clip: { x: Math.max(0, geo.card[0] - 40), y: Math.max(0, geo.pill[1] - 40), width: Math.min(geo.vw, geo.card[2] - geo.card[0] + 80), height: geo.card[3] - geo.pill[1] + 60 } })
  await shot(p, 'busy-overview-light')

  // ── B. open from the pill, home + play + GIF ──
  log('B. panel (light)')
  await p.locator('.pd-pill-go').click()
  await p.locator('.pd-root').waitFor()
  await p.waitForTimeout(500)
  check('pill hides once the panel is open', await p.locator('.pd-pill').count() === 0)
  check('panel root is a labelled region', await p.locator('.pd-root[role=region]').getAttribute('aria-label') === '拼豆小憩')
  await shot(p, 'home-light')
  await p.locator('.pd-tpl').first().click()
  await p.locator('.pd-board, [role=grid]').first().waitFor()
  await p.waitForTimeout(300)
  const coach = p.locator('.pd-overlay button')
  if (await coach.count()) {
    check('first play shows the coach card', true)
    const cg = await p.evaluate(() => {
      const card = document.querySelector('.pd-overlay.pd-coach')
      const board = document.querySelector('.pd-board')
      if (!card || !board) return null
      const c = card.getBoundingClientRect(), b = board.getBoundingClientRect()
      return { inBox: !!card.closest('.pd-boardbox'), top: Math.round(c.top), bottom: Math.round(c.bottom), boardTop: Math.round(b.top), boardBottom: Math.round(b.bottom), focus: document.activeElement?.textContent }
    })
    check('I8 coach card sits in the lower half of the board', !!cg && cg.inBox && cg.top >= (cg.boardTop + cg.boardBottom) / 2 - 1 && cg.bottom <= cg.boardBottom, JSON.stringify(cg))
    check('I8 coach card takes focus on its primary button', cg?.focus === '开始拼', cg?.focus)
    const coachHit = await hitBox(p, '.pd-overlay.pd-coach button')
    check('N6 coach 「开始拼」 hit area ≥ 32 × 32', big(coachHit), JSON.stringify(coachHit))
    await shot(p, 'coach-light')
    await coach.first().click()
    await p.waitForTimeout(300)
    const f = await focusDesc(p)
    check('I2 focus after closing the coach card is not <body>', f !== 'body', f)
  }
  // I1: the host's squircle corner-shape must not reach our beads
  const shape = await p.evaluate(() => {
    const cell = document.querySelector('.pd-root .pd-cell')
    const bead = document.createElement('span')
    bead.className = 'pd-bead'
    cell.append(bead)
    const r = { bead: getComputedStyle(bead).cornerShape, peg: getComputedStyle(cell, '::before').cornerShape, host: getComputedStyle(document.querySelector('[data-shortcut-modal], button:not(.pd-root *)') ?? document.body).cornerShape }
    bead.remove()
    return r
  })
  check('I1 computed corner-shape of .pd-bead (and ::before) under .pd-root is round', ROUND.has(shape.bead) && ROUND.has(shape.peg), JSON.stringify(shape))
  // I10: light tertiary text is #6B6F76
  const t3 = await p.evaluate(() => getComputedStyle(document.querySelector('.pd-root')).getPropertyValue('--pd-text-3').trim())
  check('I10 light --pd-text-3 is #6B6F76', t3.toLowerCase() === '#6b6f76', t3)
  // timing probes for I5 (done card +260 ms, confetti only after ironing)
  await p.evaluate(() => {
    const T = { up: 0, done: 0, confetti: 0, ironClick: 0 }
    window.pdT = T
    document.addEventListener('pointerup', (e) => { if (e.target.closest?.('.pd-board')) T.up = performance.now() }, true)
    document.addEventListener('click', (e) => { if (e.target.closest?.('button.pd-warm')) T.ironClick = performance.now() }, true)
    new MutationObserver(() => {
      if (!T.done && document.querySelector('.pd-overlay:not(.pd-coach)')) T.done = performance.now()
      if (!T.confetti && document.querySelector('.pd-confetti')) T.confetti = performance.now()
    }).observe(document.querySelector('.pd-root'), { childList: true, subtree: true })
  })
  // GIF frames: place a few beads following the ghost guide
  const frames = join(OUT, 'frames')
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames, { recursive: true })
  const pb = await panelBox(p)
  let n = 0
  const frame = async () => { await p.screenshot({ path: join(frames, `f${String(n++).padStart(3, '0')}.png`), clip: pb }) }
  await frame()
  // follow the ghost guide colour by colour, a frame every few beads
  const swatches = p.locator('.pd-sw:not(.pd-dim)')
  let placed = 0
  for (let k = 0; k < await swatches.count(); k++) {
    await swatches.nth(k).click()
    if (k === 1) {
      const pulse = await p.evaluate(() => {
        const hot = document.querySelector('.pd-board.pd-pulse .pd-cell.pd-g.pd-hot')
        return { cls: !!hot, anim: hot ? getComputedStyle(hot, '::after').animationName : '', ring: hot ? getComputedStyle(hot, '::after').boxShadow : '' }
      })
      check('I6 switching colour pulses that colour\'s remaining cells', pulse.cls && pulse.anim === 'pd-hot' && pulse.ring !== 'none', JSON.stringify(pulse))
      await p.waitForTimeout(1200)
      check('I6 pulse class is removed after ~1040 ms', await p.locator('.pd-board.pd-pulse').count() === 0)
    }
    const spots = await p.evaluate(() => [...document.querySelectorAll('.pd-cell.pd-hot')].map((c) => {
      const r = c.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2]
    }))
    for (const [x, y] of spots) {
      await p.mouse.click(x, y)
      if (++placed % 6 === 0) await frame()
      if (placed === 40) await shot(p, 'play-light')
    }
  }
  check('template completes by following the guide', await p.locator('.pd-prog.pd-full').count() === 1, `${placed} beads`)
  await p.waitForTimeout(600)
  const tm = await p.evaluate(() => ({ ...window.pdT }))
  check('I5 “done” card appears ~260 ms after the last bead, no confetti yet', tm.done - tm.up >= 200 && tm.done - tm.up < 700 && tm.confetti === 0, `done +${Math.round(tm.done - tm.up)}ms`)
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(300); await frame() }
  await shot(p, 'complete-light')
  check('N8 done card replaces tools + palette in the flow, not over them', await p.evaluate(cardFlow), JSON.stringify(await p.evaluate(cardFlowInfo)))
  const iron = p.locator('.pd-overlay button.pd-warm[data-primary]')
  await iron.click()
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(250); await frame() }
  await p.waitForTimeout(1200)
  for (let i = 0; i < 6; i++) await frame()
  await shot(p, 'ironed-light')
  check('ironing reaches the result card', await p.locator('button.pd-primary[data-primary]').count() === 1)
  const tm2 = await p.evaluate(() => ({ ...window.pdT }))
  check('I5 confetti starts when ironing finishes (~1200 ms after Iron)', tm2.confetti - tm2.ironClick >= 1100 && tm2.confetti - tm2.ironClick < 1800, `confetti +${Math.round(tm2.confetti - tm2.ironClick)}ms`)
  check('S7 footer hides export/copy while the result card shows them', await p.locator('.pd-foot .pd-io:not(.pd-warm)').count() === 0)
  // I2: un-iron closes the result card; focus must land somewhere real, then iron again
  await p.locator('.pd-overlay button', { hasText: '撤销熨烫' }).click()
  await p.waitForTimeout(300)
  const fu = await focusDesc(p)
  check('I2 focus after un-ironing is not <body>', fu !== 'body', fu)
  await p.locator('.pd-foot button.pd-warm').click()
  await p.waitForTimeout(1800)
  // I2: Esc in the menu returns focus to the ⋯ button
  await p.locator('[data-pd-menu-btn]').click()
  await p.waitForTimeout(200)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  const fm = await focusDesc(p)
  check('I2 Esc in the menu returns focus to the menu button', fm.includes('[menu-btn]'), fm)
  const gif = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '4', '-i', join(frames, 'f%03d.png'),
    '-vf', 'scale=420:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', join(ASSETS, 'demo.gif')], { stdio: 'inherit' })
  check('demo GIF written', gif.status === 0)

  // ── C. dark theme follows the host ──
  log('C. dark')
  await p.emulateMedia({ colorScheme: 'dark' })
  await p.waitForTimeout(600)
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.pd-root')).backgroundColor)
  check('panel repaints for dark', !/255, 255, 255/.test(bg), bg)
  await shot(p, 'ironed-dark')
  await p.locator('.pd-head .pd-ib').first().click() // back home
  await p.waitForTimeout(300)
  const fb = await focusDesc(p)
  check('I2 focus after Back (the button is gone) is not <body>', fb !== 'body', fb)
  await shot(p, 'home-dark')

  // keyboard-only play (spec §8.1): Tab to a template, Enter, arrows + digits + Space, E, ⌘/Ctrl+Z
  log('C2. keyboard only (dark)')
  await p.locator('.pd-tpl').nth(1).focus()
  await p.keyboard.press('Enter')
  await p.locator('[role=grid]').waitFor()
  await p.waitForTimeout(400)
  const coachK = p.locator('.pd-overlay.pd-coach button[data-primary]')
  if (await coachK.count()) { await p.keyboard.press('Enter'); await p.waitForTimeout(200) }
  const kf = await p.evaluate(() => document.activeElement?.getAttribute('role'))
  check('keyboard: entering a template puts focus on the board grid', kf === 'grid', String(kf))
  const beadsK0 = await p.locator('.pd-board .pd-bead:not(.pd-out)').count()
  await p.keyboard.press('Digit3')
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await p.keyboard.press(k)
  await p.keyboard.press('Space')
  await p.keyboard.press('ArrowRight')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(300)
  const beadsK1 = await p.locator('.pd-board .pd-bead:not(.pd-out)').count()
  check('keyboard: Space and Enter place beads', beadsK1 === beadsK0 + 2, `${beadsK0} → ${beadsK1}`)
  await p.keyboard.press('e')
  const eraser = await p.locator('.pd-tools button[aria-pressed=true]').getAttribute('aria-label')
  check('keyboard: E selects the eraser', eraser === '橡皮', String(eraser))
  await p.keyboard.press('Space')
  await p.waitForTimeout(250)
  check('keyboard: Space with the eraser removes the bead', await p.locator('.pd-board .pd-bead:not(.pd-out)').count() === beadsK0 + 1)
  await p.keyboard.press('ControlOrMeta+z')
  await p.waitForTimeout(250)
  check('keyboard: Ctrl/⌘+Z undoes', await p.locator('.pd-board .pd-bead:not(.pd-out)').count() === beadsK0 + 2)
  await p.keyboard.press('b')
  const cursorVisible = await p.evaluate(() => { const c = document.querySelector('.pd-board .pd-cur, .pd-board [aria-selected=true], .pd-board .pd-kbd'); return c ? getComputedStyle(c).outlineStyle + '|' + getComputedStyle(c).boxShadow.slice(0, 30) : 'none' })
  log('    cursor style', cursorVisible)
  await shot(p, 'keyboard-dark', undefined, OUT)
  await p.locator('.pd-head .pd-ib').first().click()
  await p.waitForTimeout(300)
  await p.locator('.pd-big', { hasText: 'AI' }).click()
  await p.waitForTimeout(400)
  await shot(p, 'ai-dark', undefined, OUT)
  await p.locator('.pd-head .pd-ib').first().click()
  await p.waitForTimeout(300)

  // ── D. AI generation through the harness LLM (fake server) ──
  log('D. AI')
  await p.emulateMedia({ colorScheme: 'light' })
  await p.locator('.pd-big', { hasText: 'AI' }).click()
  const q = p.locator('.pd-ai-box textarea, .pd-ai-box input').first()
  await q.fill('一只橘猫')
  await p.locator('.pd-view button.pd-primary:not([disabled])').first().click()
  await p.locator('.pd-board').waitFor({ timeout: 30000 })
  await p.waitForTimeout(600)
  const tokens = await p.locator('.pd-tokens').allTextContents()
  check('AI pattern lands on the board with token info', tokens.length > 0, tokens.join(' / '))
  await shot(p, 'ai-light')
  const fillAi = p.locator('.pd-foot button', { hasText: '一键铺满' })
  check('AI board offers “fill board”', await fillAi.count() === 1)
  if (await fillAi.count()) { await fillAi.click(); await p.waitForTimeout(1500); await shot(p, 'ai-filled-light') }
  // the filled board is complete, so the "done" card is up; keep editing to reach the tools
  const keep = p.locator('.pd-overlay button', { hasText: '再改改' })
  if (await keep.count()) { await keep.click(); await p.waitForTimeout(200) }
  // A4: clear → undo from the toast restores every bead; focus stays on the board
  const beadsBefore = await p.locator('.pd-board .pd-bead:not(.pd-out)').count()
  await p.locator('.pd-tools button[aria-label="清空"]').click()
  await p.waitForTimeout(300)
  const fc = await focusDesc(p)
  check('I2 focus after clearing is not <body>', fc !== 'body', fc)
  check('clear empties the board and offers undo', await p.locator('.pd-board .pd-bead:not(.pd-out)').count() === 0 && await p.locator('.pd-toast button').count() === 1)
  const toastBox = await p.locator('.pd-toast').boundingBox()
  const ironBox = await p.locator('.pd-foot button.pd-warm').boundingBox()
  check('S8 undo toast does not overlap the footer', !!toastBox && !!ironBox && toastBox.y + toastBox.height <= ironBox.y, JSON.stringify({ toast: toastBox?.y, iron: ironBox?.y }))
  const tc = await p.evaluate(toastCovers)
  check('R3-2 the undo toast covers no control or bead cell (1280×800)', !!tc && tc.covered.length === 0, JSON.stringify(tc))
  await shot(p, 'clear-undo-toast', undefined, OUT)
  await p.locator('.pd-toast button').click()
  await p.waitForTimeout(300)
  const beadsAfter = await p.locator('.pd-board .pd-bead').count()
  check('A4 undo after clear restores the board', beadsBefore > 0 && beadsAfter === beadsBefore, `${beadsBefore} → ${beadsAfter}`)
  const ft = await focusDesc(p)
  // the restored board is complete, so the done card comes back and, as spec §4.2 says, takes focus on its primary
  const doneBack = await p.locator('.pd-under.pd-swapped [data-primary]').count() === 1
  check('I2/N4 focus after toast undo is on the board, or on the done card it brings back', doneBack ? ft.includes('熨烫') : ft.startsWith('div[role=grid]'), `${ft} done=${doneBack}`)

  // A4: AI failure paths through the real host route (fake LLM misbehaves on purpose)
  const aiAgain = async (prompt) => {
    await p.locator('.pd-head .pd-ib').first().click()
    await p.locator('.pd-big', { hasText: 'AI' }).click()
    await p.waitForTimeout(1600) // client cool-down between generations
    await p.locator('.pd-ai-box textarea').fill(prompt)
    await p.locator('.pd-ai-box button.pd-primary:not([disabled])').click()
    await p.locator('.pd-card.pd-err, .pd-board').first().waitFor({ timeout: 60000 })
    await p.waitForTimeout(300)
  }
  await p.evaluate(() => { delete window.pdXss })
  await aiAgain('e2e-hostile 一只狗')
  const hostile = await p.evaluate(() => ({
    err: document.querySelector('.pd-card.pd-err')?.textContent ?? '',
    img: document.querySelectorAll('.pd-root img, .pd-root script, .pd-root iframe').length,
    xss: window.pdXss ?? null,
    board: !!document.querySelector('.pd-board'),
  }))
  check('A4 hostile model reply (no grid, HTML/script, injection) → parse error card, nothing injected', !hostile.board && /拼不成图纸/.test(hostile.err) && hostile.img === 0 && hostile.xss === null, JSON.stringify(hostile))
  await shot(p, 'ai-hostile-error', undefined, OUT)
  const gen429 = p.waitForResponse(r => r.url().includes('pindou.generate'), { timeout: 90000 })
  await aiAgain('e2e-429 一只兔子')
  const status429 = (await gen429).status()
  const rate = await p.evaluate(() => document.querySelector('.pd-card.pd-err')?.textContent ?? '')
  check('A4 upstream 429 → host answers 429 → rate-limit error card with retry', status429 === 429 && /太快啦/.test(rate) && await p.locator('.pd-card.pd-err button').count() === 1, `HTTP ${status429} · ${rate}`)
  const fr = await focusDesc(p)
  check('N4 an AI failure puts focus on 重试', fr.includes('重试'), fr)
  await shot(p, 'ai-429-error', undefined, OUT)

  // ── E. wide panel (split view) ──
  log('E. wide')
  await p.locator('.pd-head .pd-ib').first().click()
  const full = p.getByRole('button', { name: HOST.zh.full })
  if (await full.count()) {
    await full.first().click()
    await p.waitForTimeout(800)
    const w = (await panelBox(p))?.width ?? 0
    const cols = await p.evaluate(() => getComputedStyle(document.querySelector('.pd-tpls')).gridTemplateColumns.split(' ').length)
    check('≥560px panel shows 4 template columns', w >= 560 && cols === 4, `width=${Math.round(w)} cols=${cols}`)
    await shot(p, 'home-wide-light')
    // I7: at a 640 px panel the board reaches 480 px (cells 39/29/19 for 12/16/24)
    await p.setViewportSize({ width: 1280, height: 1100 })
    await p.evaluate(() => { document.querySelector('.pd-root').style.width = '640px' })
    await p.locator('.pd-tpl').first().click()
    await p.waitForTimeout(400)
    const bw = await p.evaluate(() => {
      const b = document.querySelector('.pd-board')
      return { w: Math.round(b.getBoundingClientRect().width), cell: getComputedStyle(b).getPropertyValue('--pd-cell'), n: Number(getComputedStyle(b).getPropertyValue('--pd-n')) }
    })
    const want = Math.floor(468 / bw.n)
    check('I7 board reaches ~480 px at a 640 px panel', bw.w >= 470 && bw.w <= 480 && bw.cell === `${want}px`, JSON.stringify(bw))
    await outShot(p, 'wide-640-board')
    // Spec §16: at 300 / 320 / 480 / 900 nothing overflows, the board stays square and ≤ 480.
    // Every shot also runs the audit (icons, round beads, wraps, contrast).
    const SWEEP = [300, 320, 480, 900]
    const measure = () => p.evaluate(() => {
      const r = document.querySelector('.pd-root')
      const b = document.querySelector('.pd-board')?.getBoundingClientRect()
      const over = [...r.querySelectorAll('*')].filter(el => {
        const e = el.getBoundingClientRect()
        const o = r.getBoundingClientRect()
        return e.width > 0 && (e.right > o.right + 1 || e.left < o.left - 1)
      }).map(el => el.className).slice(0, 3)
      return { scroll: r.scrollWidth, client: r.clientWidth, over, board: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null }
    })
    const rootClip = async () => {
      const b = await p.locator('.pd-root').boundingBox()
      return b ? { clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 1100 - b.y) } } : undefined
    }
    for (const px of SWEEP) {
      await p.evaluate(v => { document.querySelector('.pd-root').style.width = `${v}px` }, px)
      await p.waitForTimeout(350)
      const mm = await measure()
      check(`panel ${px}px: board is square, ≤ 480, nothing overflows`,
        mm.board !== null && Math.abs(mm.board.w - mm.board.h) <= 1 && mm.board.w <= 480 && mm.scroll <= mm.client + 1 && mm.over.length === 0, JSON.stringify(mm))
      await outShot(p, `width-${px}-board`, await rootClip())
    }
    await p.locator('.pd-head .pd-ib').first().click()
    await p.waitForTimeout(300)
    for (const px of SWEEP) {
      await p.evaluate(v => { document.querySelector('.pd-root').style.width = `${v}px` }, px)
      await p.waitForTimeout(350)
      const mm = await measure()
      const homeCols = await p.evaluate(() => getComputedStyle(document.querySelector('.pd-tpls')).gridTemplateColumns.split(' ').length)
      check(`panel ${px}px: home has ${px >= 560 ? 4 : 3} template columns and nothing overflows`,
        homeCols === (px >= 560 ? 4 : 3) && mm.scroll <= mm.client + 1 && mm.over.length === 0, JSON.stringify({ ...mm, cols: homeCols }))
      await outShot(p, `width-${px}-home`, await rootClip())
    }
    await p.evaluate(() => { document.querySelector('.pd-root').style.width = '' })
    await p.setViewportSize({ width: 1280, height: 800 })
  }
  await p.context().close()

  // ── F. narrow (390×844): full-screen pane ──
  log('F. narrow')
  const m = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true, isMobile: true })
  await startSession(m, '跑一下测试')
  await m.locator('.pd-entry').click()
  await m.locator('.pd-root').waitFor()
  await m.waitForTimeout(600)
  const nb = await panelBox(m)
  check('narrow viewport opens a near full-width pane', (nb?.width ?? 0) >= 360, `width=${Math.round(nb?.width ?? 0)}`)
  await shot(m, 'home-narrow')
  await m.locator('.pd-tpl').nth(6).click()
  await m.waitForTimeout(400)
  const mc = m.locator('.pd-overlay button')
  if (await mc.count()) await mc.first().click()
  await m.waitForTimeout(300)
  await m.locator('.pd-sw:not(.pd-dim)').first().tap()
  const spots = await m.evaluate(() => [...document.querySelectorAll('.pd-cell.pd-hot')].slice(0, 30).map((c) => {
    const r = c.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  }))
  for (const [x, y] of spots) await m.touchscreen.tap(x, y)
  const toolRows = await m.evaluate(() => new Set([...document.querySelectorAll('.pd-tools .pd-tool')].filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().top))).size)
  check('narrow toolbar fits on one row', toolRows === 1, `rows=${toolRows}`)
  const minTool = await m.evaluate(() => Math.min(...[...document.querySelectorAll('.pd-tools .pd-tool')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().width)))
  check('narrow toolbar buttons stay ≥ 32px wide', minTool >= 32, `${minTool}px`)
  const sw = await m.locator('.pd-sw, [role=radio]').first().boundingBox()
  check('touch targets ≥ 32px', (sw?.width ?? 0) >= 32 && (sw?.height ?? 0) >= 32, JSON.stringify(sw))
  await shot(m, 'play-narrow')
  await m.context().close()

  // ── G. short window (1280×620): palette and Iron visible without scrolling (I9) ──
  log('G. short')
  const sh = await newPage({ viewport: { width: 1280, height: 620 }, colorScheme: 'light' })
  await startSession(sh, '看看 README')
  await openPanel(sh)
  await playFirstTemplate(sh)
  const fit = await sh.evaluate(() => {
    const sc = document.querySelector('.pd-root .pd-scroll').getBoundingClientRect()
    const pal = document.querySelector('.pd-palette').getBoundingClientRect()
    const ironEl = document.querySelector('.pd-foot .pd-warm').getBoundingClientRect()
    return { scroll: Math.round(sc.bottom), palette: Math.round(pal.bottom), iron: Math.round(ironEl.bottom), board: Math.round(document.querySelector('.pd-board').getBoundingClientRect().width), vh: innerHeight }
  })
  check('I9 at 620 px tall the palette and Iron are visible without scrolling', fit.palette <= fit.scroll && fit.iron <= fit.scroll && fit.iron <= fit.vh && fit.board >= 140, JSON.stringify(fit))
  await outShot(sh, 'short-620')
  await sh.context().close()

  // ── G2. short window toast (design R3-2): below 700 px tall the clear/undo toast must not
  // cover the palette, Iron/Export or any other control; desktop panel and the 420-wide full-screen pane ──
  log('G2. short toast')
  // spec v2.0 (22:15): a long message stays one line within panel width − 32, cut with …
  const LONG = {
    zh: '浏览器存储暂时不可用，这一局的进度和设置都不会保存，请稍后再试或者导出一张图片留底',
    en: 'Browser storage is unavailable right now, so neither this board nor your settings will be saved — export a picture to keep it',
  }
  for (const [w, h, theme, lang = 'zh'] of [[1280, 620, 'light'], [420, 620, 'light'], [420, 620, 'dark'], [1280, 699, 'light'], [420, 620, 'light', 'en']]) {
    const tp = await newPage({ viewport: { width: w, height: h }, colorScheme: theme }, lang)
    await startSession(tp, lang === 'zh' ? '看看 README' : 'Hello', lang)
    await openPanel(tp)
    await playFirstTemplate(tp)
    await placeBeads(tp, 6)
    await tp.locator(`.pd-tools button[aria-label="${lang === 'zh' ? '清空' : 'Clear'}"]`).click()
    await tp.locator('.pd-toast').waitFor()
    await tp.waitForTimeout(300)
    const cov = await tp.evaluate(toastCovers)
    const pal = await tp.evaluate(() => [...document.querySelectorAll('.pd-palette .pd-sw')].filter(e => e.getBoundingClientRect().height > 0).length)
    check(`R3-2 ${w}×${h} ${theme}: the clear toast covers no swatch, Iron/Export or other control (${pal} swatches visible)`, !!cov && cov.covered.length === 0 && pal === 16, JSON.stringify(cov))
    await outShot(tp, `r3-2-toast-${w}x${h}-${theme}${lang === 'en' ? '-en' : ''}`)
    if (w === 420 && theme === 'light') {
      const tl = await tp.evaluate(toastLongLine, LONG[lang])
      check(`toast ${lang} 420×620: a long message stays one line, ≤ panel − 32 wide, ends in …, status row unchanged`,
        !!tl && tl.lines === 1 && tl.spanH <= tl.lineH * 1.5 && tl.width <= tl.limit && tl.cut && tl.ellipsis && tl.button && tl.statusAfter === tl.statusBefore, JSON.stringify(tl))
      await outShot(tp, `toast-long-420x620-${lang}`)
    }
    await tp.context().close()
  }

  // ── H. not configured: honest card on entry, disabled input, settings shortcut ──
  log('H. not configured')
  for (const [label, init] of [['linux', undefined], ['macos', () => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }) }]]) {
    const nc = await newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, 'zh', init)
    await nc.route('**/pindou.status*', fakeStatus)
    await startSession(nc, '你好')
    await openPanel(nc)
    await nc.locator('.pd-big', { hasText: 'AI' }).click()
    await nc.locator('.pd-nocfg').waitFor({ timeout: 10000 })
    const st = await nc.evaluate(() => ({
      input: document.querySelector('.pd-ai-box textarea').disabled,
      chips: [...document.querySelectorAll('.pd-chip')].every(b => b.disabled && Number(getComputedStyle(b).opacity) < 1),
      buttons: [...document.querySelectorAll('.pd-nocfg button')].map(b => `${b.textContent}${b.classList.contains('pd-primary') ? '*' : ''}`),
      icon: Math.round(document.querySelector('.pd-nocfg .pd-t svg').getBoundingClientRect().width),
    }))
    check(`I3 (${label}) not-configured card on entry, input and chips disabled`, st.input && st.chips, JSON.stringify(st))
    check(`B1 (${label}) card icon is 16 px`, st.icon === 16, `${st.icon}px`)
    if (label === 'linux') {
      check('I4 (web/linux: settings shortcut unbound) no fake button, 「重新检测」 is primary', st.buttons.join() === '重新检测*,先玩模板', st.buttons.join())
    } else {
      const steps = await nc.locator('.pd-nocfg').textContent()
      const keycaps = /按 (\S+) 打开 DSH 设置/.exec(steps ?? '')?.[1] ?? ''
      check('N2 (web/macOS) the settings shortcut reads as one keycap run (e.g. ⌥⌘,), not 「⌥,⌘,,」', /^[⌃⌥⇧⌘]+,$/.test(keycaps), keycaps)
      check('I4 (web/macOS) primary 「打开 DSH 设置」, 「先玩模板」 ghost', st.buttons[0] === '打开 DSH 设置*' && st.buttons.at(-1) === '先玩模板', st.buttons.join())
      await nc.locator('.pd-nocfg button', { hasText: '打开 DSH 设置' }).click()
      const opened = await nc.locator('[data-shortcut-modal=settings]').waitFor({ timeout: 5000 }).then(() => true, () => false)
      check('I4 「打开 DSH 设置」 opens the DSH Settings dialog', opened)
      await outShot(nc, 'not-configured-settings-open')
      await nc.keyboard.press('Escape')
    }
    await outShot(nc, `not-configured-${label}`)
    await nc.context().close()
  }

  // ── I. en-US: the old timeout was the harness waiting for a zh host label ──
  log('I. en-US')
  const en = await browser.newContext({ locale: 'en-US', deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } })
  const ep = await en.newPage()
  ep.on('pageerror', (e) => { pageErrors.push(String(e)) })
  await ep.goto(url)
  const zhLabel = await ep.getByRole('button', { name: HOST.zh.choose }).waitFor({ timeout: 8000 }).then(() => true, () => false)
  const enLabel = await ep.getByRole('button', { name: HOST.en.choose }).waitFor({ timeout: 30000 }).then(() => true, () => false)
  check('en-US repro: host renders “Choose workspace”, not “选择工作区” (the old 30 s wait was a harness bug)', !zhLabel && enLabel, `zh=${zhLabel} en=${enLabel}`)
  await en.close()
  const e1 = await newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' }, 'en')
  await startSession(e1, 'Summarise this repo', 'en')
  await openPanel(e1)
  check('en-US panel is labelled “Bead Break”', await e1.locator('.pd-root').getAttribute('aria-label') === 'Bead Break')
  await outShot(e1, 'en-home')
  await playFirstTemplate(e1)
  await outShot(e1, 'en-play')
  await e1.locator('.pd-head .pd-ib').first().click()
  await e1.locator('.pd-big', { hasText: 'AI' }).click()
  await e1.waitForTimeout(500)
  check('en-US AI page is in English', /About 300–900 tokens|Generate/.test(await e1.locator('.pd-root').textContent()))
  await outShot(e1, 'en-ai')
  await e1.context().close()
  // English + dark + not configured: the longest strings in the tightest card
  const e2 = await newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, 'en')
  await e2.route('**/pindou.status*', fakeStatus)
  await startSession(e2, 'Hello', 'en')
  await openPanel(e2)
  await e2.locator('.pd-big', { hasText: 'AI' }).click()
  await e2.locator('.pd-nocfg').waitFor({ timeout: 10000 })
  await e2.waitForTimeout(300)
  check('en-US not-configured card is in English', /Check again/.test(await e2.locator('.pd-nocfg').textContent()))
  await outShot(e2, 'en-not-configured-dark')
  await e2.context().close()

  // ── J. design round 2 (r3): N1 same pattern resumes, N8 card in the flow, N9 dot, N10 dark rings ──
  log('J. round-3 fixes')
  const j = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
  await startSession(j, '解释一下 package.json')
  await openPanel(j)
  await playFirstTemplate(j)
  await placeBeads(j, 10)
  const p10 = await progressText(j)
  check('N1 setup: 10 correct beads on the first template', (p10 ?? '').startsWith('10/118'), p10)
  await j.locator('.pd-head .pd-ib').first().click()
  await j.waitForTimeout(300)
  const cont = await hitBox(j, '.pd-view .pd-link')
  check('N6 home 「继续上次」 hit area ≥ 32 × 32', big(cont), JSON.stringify(cont))
  await j.locator('.pd-tpl').first().click()
  await j.waitForTimeout(400)
  const back = await progressText(j)
  check('N1 home → same template keeps the board (10/118), no coach, no toast', (back ?? '').startsWith('10/118') && await j.locator('.pd-overlay.pd-coach, .pd-toast').count() === 0, back)
  await outShot(j, 'n1-same-template-resumes')
  await j.locator('.pd-head .pd-ib').first().click()
  await j.waitForTimeout(300)
  await j.locator('.pd-tpl').nth(2).click()
  await j.waitForTimeout(400)
  const c2 = j.locator('.pd-overlay.pd-coach button')
  if (await c2.count()) { await c2.first().click(); await j.waitForTimeout(200) }
  const toastTxt = await j.locator('.pd-toast').textContent().catch(() => '')
  check('N1 a different template starts a new game with an undo toast', /已开始新的一局/.test(toastTxt ?? '') && (await progressText(j) ?? '').startsWith('0/'), toastTxt)
  await outShot(j, 'n1-other-template-toast')
  const jc = await j.evaluate(toastCovers)
  check('R3-2 the other-template toast covers no control or bead cell', !!jc && jc.covered.length === 0, JSON.stringify(jc))
  const undoHit = await hitBox(j, '.pd-toast button')
  check('N6 toast 「撤销」 hit area ≥ 32 × 32', big(undoHit), JSON.stringify(undoHit))
  await j.locator('.pd-toast button').click()
  await j.waitForTimeout(300)
  const restored = await progressText(j)
  const fj = await focusDesc(j)
  check('N1 撤销 in the toast brings the first game back (10/118), focus on the board (N4)', (restored ?? '').startsWith('10/118') && fj.startsWith('div[role=grid]'), `${restored} · ${fj}`)
  // ironed → same template = a new game; Ctrl/⌘+Z brings the ironed piece back
  await j.locator('.pd-foot button.pd-warm').click()
  await j.waitForTimeout(1800)
  check('N1 setup: ironed with the result card', await j.locator('.pd-overlay.pd-result, .pd-under > .pd-overlay').count() === 1)
  // N8 sweep with the result card up: in the flow, no overlap, 32 px actions, no wrapped labels
  for (const px of [300, 320, 480, 900]) {
    await j.evaluate(v => { document.querySelector('.pd-root').style.width = `${v}px` }, px)
    await j.waitForTimeout(350)
    const info = await j.evaluate(cardFlowInfo)
    check(`N8 panel ${px}px: result card in the flow, no overlap, actions ≥ 32 px`, await j.evaluate(cardFlow), JSON.stringify(info))
    const b = await j.locator('.pd-root').boundingBox()
    await outShot(j, `n8-result-${px}`, b ? { clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 900 - b.y) } } : undefined)
  }
  await j.evaluate(() => { document.querySelector('.pd-root').style.width = '' })
  await j.locator('.pd-head .pd-ib').first().click()
  await j.waitForTimeout(300)
  await j.locator('.pd-tpl').first().click()
  await j.waitForTimeout(400)
  const fresh = await progressText(j)
  check('N1 ironed → same template starts a new game (0/118), no toast', (fresh ?? '').startsWith('0/118') && await j.locator('.pd-toast').count() === 0, fresh)
  await outShot(j, 'n1-ironed-same-template-new')
  await j.locator('[role=grid]').focus()
  await j.keyboard.press('ControlOrMeta+z')
  await j.waitForTimeout(400)
  check('N1 Ctrl/⌘+Z after that brings the ironed piece back with its result card', await j.locator('.pd-under.pd-swapped').count() === 1 && (await progressText(j) ?? '').startsWith('10/118'))
  // N10: dark ghost rings ≥ 3:1 against the board
  await j.locator('.pd-head .pd-ib').first().click()
  await j.waitForTimeout(300)
  await j.emulateMedia({ colorScheme: 'dark' })
  await j.waitForTimeout(500)
  const ringsChecked = []
  for (let t = 0; t < await j.locator('.pd-tpl').count(); t++) {
    await j.locator('.pd-tpl').nth(t).click()
    await j.waitForTimeout(300)
    const cc = j.locator('.pd-overlay.pd-coach button')
    if (await cc.count()) { await cc.first().click(); await j.waitForTimeout(150) }
    ringsChecked.push(...await j.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside the page, no outer scope there
      const lum = (c) => { const ch = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] }
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
      const board = getComputedStyle(document.querySelector('.pd-board')).backgroundColor
      const seen = new Map()
      for (const cell of document.querySelectorAll('.pd-cell.pd-g')) {
        const shadow = getComputedStyle(cell, '::after').boxShadow
        const ring = /rgba?\([^)]*\)/.exec(shadow)?.[0]
        const gc = cell.style.getPropertyValue('--pd-gc')
        if (!seen.has(gc)) seen.set(gc, { gc, ring, board, ratio: ring ? Math.round(ratio(ring, board) * 100) / 100 : 0 })
      }
      return [...seen.values()]
    }))
    if (t === 0) await outShot(j, 'n10-dark-ghosts')
    await j.locator('.pd-head .pd-ib').first().click()
    await j.waitForTimeout(200)
  }
  const ringMap = new Map(ringsChecked.map(r => [r.gc, r]))
  const weak = [...ringMap.values()].filter(r => r.ratio < 3)
  check(`N10 dark ghost rings ≥ 3:1 on the board for every colour in the templates (${ringMap.size} colours, min ${Math.min(...[...ringMap.values()].map(r => r.ratio))})`, ringMap.size >= 8 && weak.length === 0, JSON.stringify(weak.slice(0, 4)))
  await j.emulateMedia({ colorScheme: 'light' })
  // N9: close the tab (or collapse the sidebar) while generating → the entry dot lights; opening clears it
  // the busy dot (session still running) wins over the progress dot by design; wait for the turn to end
  await j.locator('.pd-entry.pd-busy').waitFor({ state: 'detached', timeout: 60000 })
  for (const how of ['close', 'collapse']) {
    await j.locator('.pd-big', { hasText: 'AI' }).click()
    await j.waitForTimeout(1700)
    let release
    const gate = new Promise(r => { release = r })
    await j.route('**/api/pindou.generate', async (route) => { await gate; await route.continue() })
    await j.locator('.pd-ai-box textarea').fill(how === 'close' ? '一只小鸭子' : '一朵小花')
    await j.locator('.pd-ai-box button.pd-primary:not([disabled])').click()
    await j.waitForTimeout(300)
    if (how === 'close') await j.locator('[data-dockkit-strip] button[aria-label="关闭"]').first().click()
    else await j.getByRole('button', { name: '收起右侧边栏' }).first().click()
    await j.waitForTimeout(500)
    const done = j.waitForResponse(r => r.url().includes('pindou.generate'), { timeout: 60000 })
    release()
    await done
    await j.unroute('**/api/pindou.generate')
    await j.waitForTimeout(800)
    const lit = await j.locator('.pd-entry.pd-has-progress').count()
    const entryCls = await j.locator('.pd-entry').getAttribute('class')
    check(`N9 (${how}) result lands while the panel is ${how === 'close' ? 'closed' : 'collapsed'} → entry dot lit`, lit === 1, `dot=${lit} ${entryCls}`)
    await outShot(j, `n9-${how}-dot`, { clip: await j.locator('.pd-entry').boundingBox().then(b => ({ x: Math.max(0, b.x - 120), y: Math.max(0, b.y - 20), width: 280, height: b.height + 40 })) }, { text: false })
    await j.locator('.pd-entry').click()
    await j.locator('.pd-root').waitFor()
    await j.waitForTimeout(600)
    // the dot scene is icon-only; the text it leads to is the opened panel with the new board
    await audit(j, `n9-${how}-opened`)
    check(`N9 (${how}) opening the panel clears the dot and shows the new board`, await j.locator('.pd-entry.pd-has-progress').count() === 0 && await j.locator('.pd-board').count() === 1)
    await j.locator('.pd-head .pd-ib').first().click()
    await j.waitForTimeout(300)
  }
  await j.context().close()

  // ── K. O3 / §18.5: every colour's guide ring measured on the real page, light and dark ──
  log('K. guide rings (spec §18.5)')
  {
    const CODES = '0123456789abcdef'
    // a followed pattern with all 16 colours (one column each, rows 2–13) on an empty board
    const pattern = Array.from({ length: 16 }, (_, y) => (y >= 2 && y <= 13 ? CODES : '.'.repeat(16))).join('')
    const seed = JSON.stringify({ v: 2, size: 16, board: '.'.repeat(256), color: 4, tool: 'paint', mode: 'play', target: 'board:o3', pattern, ironed: false, prefs: { busyHint: true, showGuide: true, showCodes: false }, done: [], coached: true })
    const k = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' }, 'zh',
      `if (!sessionStorage.getItem('o3')) { sessionStorage.setItem('o3', '1'); localStorage.setItem('dsh-pindou:v1', ${JSON.stringify(seed)}) }`)
    await startSession(k, '解释一下 package.json')
    await openPanel(k)
    await k.locator('.pd-board .pd-cell.pd-g').first().waitFor()
    // normal state: every colour once while another colour is selected; selected state: pick each colour in turn
    const swk = k.locator('.pd-palette .pd-sw')
    const pick = async (i) => { await swk.nth(i).click(); await k.waitForTimeout(80) }
    const measure = async () => {
      await pick(5)
      const normal = (await k.evaluate(guideRings, [CODES.replace('5', ''), false]))
      await pick(4)
      normal.splice(5, 0, ...await k.evaluate(guideRings, ['5', false]))
      const hot = []
      for (let i = 0; i < 16; i++) { await pick(i); hot.push(...await k.evaluate(guideRings, [CODES[i], true])) }
      await pick(4)
      return { normal, hot }
    }
    check('O3 setup: 16 palette swatches and a ghost for every colour', await swk.count() === 16 && await k.locator('.pd-board .pd-cell.pd-g').count() === 16 * 12)
    const light = await measure()
    check(`O3/R3-1 light: 16 guide rings ≥ 3:1 on the real board, normal and selected (min ${minOf(light)})`, allOk(light), bad(light))
    await outShot(k, 'o3-rings-light', { clip: await k.locator('.pd-board').boundingBox() }, { text: false })
    await k.emulateMedia({ colorScheme: 'dark' })
    await k.waitForTimeout(600)
    const dark = await measure()
    check(`O3/N10 dark: 16 guide rings ≥ 3:1 on the real board, normal and selected (min ${minOf(dark)})`, allOk(dark) && await k.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), bad(dark))
    await outShot(k, 'o3-rings-dark', { clip: await k.locator('.pd-board').boundingBox() }, { text: false })
    writeFileSync(join(OUT, 'audit', 'o3-rings.json'), `${JSON.stringify({ light, dark }, null, 2)}\n`)
    if (SELFCHECK) copyFileSync(join(OUT, 'audit', 'o3-rings.json'), join(SELFCHECK, 'o3-rings.json'))
    await k.context().close()
  }
  }

  check('no page errors from the plugin', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  // ::-webkit-scrollbar parts: the host scrollbar theme is meant to apply to .pd-scroll too
  const unexpected = [...leaksSeen.values()].filter(l => !/::-webkit-scrollbar/.test(l.selector)).map(l => ({ selector: l.selector, props: [...l.props].filter(x => !(x in ACCEPTED_LEAKS)) })).filter(l => l.props.length)
  check(`I1 every host rule that reaches the plugin only sets accepted properties (${leaksSeen.size} rules)`, unexpected.length === 0, JSON.stringify(unexpected.slice(0, 5)))
} finally {
  writeFileSync(join(OUT, 'dsh.log'), dshLog.replace(/token=[^&\s]+/g, 'token=…'))
  writeFileSync(join(OUT, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`)
  writeFileSync(join(OUT, 'audit', 'leaks.json'), `${JSON.stringify([...leaksSeen.values()].map(l => ({ ...l, props: [...l.props] })), null, 2)}\n`)
  writeFileSync(join(OUT, 'audit', 'summary.json'), `${JSON.stringify(audits, null, 2)}\n`)
  if (SELFCHECK) { writeFileSync(join(SELFCHECK, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`); copyFileSync(join(OUT, 'audit', 'leaks.json'), join(SELFCHECK, 'style-leaks.json')) }
  await browser.close()
  dsh.kill('SIGTERM')
  await llm.close()
}
const failed = checks.filter(c => !c.ok)
log(failed.length ? `\n${failed.length} check(s) failed` : `\nall ${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
