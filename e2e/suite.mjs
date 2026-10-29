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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { auditPanel, guideRings, resumePlugin, settlePlugin, toastCovers, toastLongLine } from './audit.mjs'
import { startFakeLlm } from './fake-llm.mjs'
import { decodePng, diffPng } from './compare-shots.mjs'
import { longNames } from './classes-hook.mjs'
import CSS_VARS from '../scripts/css-vars.json' with { type: 'json' }
import { DAILY_DEFS } from '../src/core/daily.ts'
import { contrast, dropFile, HEART, hostFileCards, NO_ASYNC_REQUIRE, pasteFile, png, sliderLook, storedFootprint } from './picture.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_SRC = process.env.DSH_SRC ?? '/home/box/src/deepseek-harness'
const DSH_BIN = join(DSH_SRC, 'apps/cli/lib/bin.js')
/** A custom property as it ships (the one short-name table, scripts/css-vars.ts). */
const cssVar = (name) => { const v = CSS_VARS[name]; if (!v) throw new Error(`${name} is not in scripts/css-vars.json`); return v }
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
// The DSH server's clock starts at the same instant (e2e/server-clock.mjs): the host stamps chat
// messages with it. Before a session whose stamp is shot, serverClock() moves it on to the fixed time of
// day on a later day and that page's clock starts there too, so the stamp reads the fixed time however
// long the run took to get there.
// E2E_CLOCK=real turns both off.
const FIXED_NOW = process.env.E2E_CLOCK === 'real' ? null : new Date('2026-06-01T10:00:00+08:00')

const log = (...a) => { process.stdout.write(`${a.join(' ')}\n`) }
const checks = []
function check(name, ok, detail = '') {
  // this file's `pd-…` names were shortened as it loaded (e2e/classes-hook.mjs): log the source's names
  name = longNames(name); detail = longNames(String(detail))
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
// the default home is shared by every checkout on this machine: never test another checkout's build
const linked = existsSync(profilePkg) ? /"dsh-pindou":\s*"link:([^"]+)"/.exec(readFileSync(profilePkg, 'utf8'))?.[1] : undefined
if (linked && resolve(linked) !== REPO) throw new Error(`${DSH_HOME} runs the plugin from ${linked}, not ${REPO}: set E2E_DSH_HOME (or TMPDIR) to a home of this checkout's own`)
if (!existsSync(profilePkg) || !readFileSync(profilePkg, 'utf8').includes('"dsh-pindou"')) {
  log('installing plugin into', DSH_HOME)
  const r = spawnSync(process.execPath, [DSH_BIN, 'plugin', '--profile', 'web', 'add', `link:${REPO}`],
    { cwd: WS, env: { ...process.env, DSH_HOME }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  writeFileSync(join(OUT, 'install.log'), `${r.stdout}\n${r.stderr}`)
  if (r.status !== 0) throw new Error(`plugin install failed, see ${join(OUT, 'install.log')}`)
}

// 2. fake LLM + DSH Web
const llm = await startFakeLlm({ chatMs: Number(process.env.FAKE_LLM_CHAT_MS ?? 30000) })
const CLOCK_FILE = join(tmpdir(), `pindou-e2e-clock-${process.pid}`)
const serverClockEnv = FIXED_NOW ? {
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(join(REPO, 'e2e/server-clock.mjs')).href}`.trim(),
  E2E_FIXED_NOW: String(FIXED_NOW.getTime()),
  E2E_CLOCK_FILE: CLOCK_FILE,
} : {}
const dsh = spawn(process.execPath, [DSH_BIN, '--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
  cwd: WS,
  env: { ...process.env, DSH_HOME, DEEPSEEK_BASE_URL: llm.url, DEEPSEEK_API_KEY: 'e2e-placeholder', ...serverClockEnv },
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
/** Move the server's clock on to the fixed time of day on the next later day, plus `offset` ms
 * (e2e/server-clock.mjs). Returns that instant (for the page's clock) and the HH:MM its stamps show. */
let clockDays = 0
async function serverClock(offset = 0) {
  if (!FIXED_NOW) return { at: null, hhmm: null }
  writeFileSync(CLOCK_FILE, String(offset))
  dsh.kill('SIGUSR2')
  await new Promise((r) => { setTimeout(r, 200) })
  const at = new Date(FIXED_NOW.getTime() + ++clockDays * 86_400_000 + offset)
  return { at, hhmm: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` }
}
/** The host's stamps on chat messages (leaf text like 「6月1日 10:00」 outside the plugin), with their boxes. */
const hostStamps = p => p.evaluate(() => [...document.querySelectorAll('body *')]
  .filter(e => !e.children.length && /\b\d{1,2}:\d{2}\b/.test(e.textContent ?? '') && !e.closest('.pd-root, .pd-portal'))
  .map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), x: r.left, y: r.top, right: r.right, bottom: r.bottom } })
  .filter(r => r.right > r.x))

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const pageErrors = []

// Host UI labels the harness clicks (DSH locale files: ui-conversation hero.chooseWorkspace,
// ui-workspace menu.addWorkspace, ui-directory-picker-browse browser.*, ui-sidebar-right chrome.*).
const HOST = {
  zh: { choose: '选择工作区', add: '添加工作区…', edit: '编辑路径', open: '打开', full: '全屏' },
  en: { choose: 'Choose workspace', add: 'Add workspace…', edit: 'Edit path', open: 'Open', full: 'Fullscreen' },
}

async function newPage(opts, lang = 'zh', init, at = FIXED_NOW) {
  const ctx = await browser.newContext({ locale: lang === 'zh' ? 'zh-CN' : 'en-US', deviceScaleFactor: 2, ...opts })
  if (init) await ctx.addInitScript(init)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const p = await ctx.newPage()
  if (at) { await p.clock.install({ time: at }); await p.clock.resume() }
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
  const known = p.getByRole('button', { name: basename(WS), exact: true }).or(p.getByRole('menuitem', { name: basename(WS), exact: true }))
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
  // the entry's dot must be off while the panel is on screen (spec §15.1-3); say why when it is not
  const dot = await p.evaluate(() => {
    const entry = document.querySelector('.pd-entry'), roots = [...document.querySelectorAll('.pd-root')]
    // busy is lit on purpose while the model runs; the warm progress dot only when no panel is on screen
    if (!entry || !roots.length || (!entry.classList.contains('pd-has-progress') && roots.length < 2)) return null
    return {
      entry: entry.className, vis: document.visibilityState, focus: document.hasFocus(), view: [innerWidth, innerHeight],
      roots: roots.map((root) => {
        const r = root.getBoundingClientRect(), hid = root.closest('[hidden],[inert],[aria-hidden="true"]')
        return { hid: hid ? `${hid.tagName}.${String(hid.className).slice(0, 40)} ${['hidden', 'inert', 'aria-hidden'].filter(a => hid.hasAttribute(a))}` : null, check: root.checkVisibility?.({ visibilityProperty: true }), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) }
      }),
    }
  })
  if (dot) {
    const shown = dot.roots.filter(r => !r.hid && r.check && r.rect[2] > 0 && r.rect[0] < dot.view[0])
    if (dot.entry.includes('pd-has-progress') && shown.length) check(`[${name}] the entry's progress dot is off while the panel is on screen (spec §15.1-3)`, false, JSON.stringify(dot))
    else log(`    entry: ${dot.roots.length} panel roots (${name})`, JSON.stringify(dot))
  }
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
/**
 * b2 D-I1: after a picture loads from a drop or paste, where focus is and what the page's status
 * line said (it is emptied, then written ~60 ms later).
 */
async function loadedState(p, want) {
  const said = await p.waitForFunction(w => document.querySelector('.pd-pic > [role=status]')?.textContent === w, want, { timeout: 3000 }).then(() => true, () => false)
  return {
    said,
    ...await p.evaluate(() => {
      const a = document.activeElement
      const st = document.querySelector('.pd-pic > [role=status]')
      return { crop: a?.classList.contains('pd-pic-crop') ?? false, file: a?.classList.contains('pd-pic-file') ?? false, on: a ? `${a.tagName}.${a.className}` : null, live: st?.getAttribute('role') === 'status' && st.classList.contains('pd-sr') }
    }),
  }
}
const loadedOk = st => st.said && st.crop && !st.file && st.live
/** How many rendered lines an element's text takes (evaluated in the page). */
function lines(el) { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size }
/** The words of an element's text that are split over two lines (evaluated in the page): wrapping only at spaces leaves none (C1). */
function splitWords(el) {
  const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    for (const m of n.data.matchAll(/\S+/g)) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length)
      if (new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) out.push(m[0])
    }
  }
  return out
}
/** The four start cards as laid out now (`lineCount` is `lines`, `split` is `splitWords`, passed in: all run in the page): size, title and description lines, what is cut (design I1/C1). */
const startCards = (lineCount, split) => [...document.querySelectorAll('.pd-start .pd-big')].map((c) => {
  const b = c.querySelector('b'), d = c.querySelector('b + span'), box = c.getBoundingClientRect()
  const lh = d.getClientRects()[0] ? d.scrollHeight / Math.max(1, lineCount(d)) : 16
  return {
    w: Math.round(box.width), h: Math.round(box.height), top: Math.round(box.top), title: b.textContent, sub: d.textContent, status: d.classList.contains('pd-st'),
    titleLines: lineCount(b), titleSplit: split(b), titleCut: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1,
    subLines: lineCount(d), subShown: Math.round(d.clientHeight / lh), subCut: d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1,
    clamp: getComputedStyle(d).webkitLineClamp,
  }
})
/**
 * I1/C1 at each panel width: titles never cut (Chinese on one line; English may wrap at a space, to
 * at most two lines, at any width), descriptions and status lines (需要新版 DSH / 加载失败) never cut
 * either: at most two whole lines, no ellipsis (b3 一: a clamped line's scrollHeight is past its
 * clientHeight). Four equal cards at least 64 px (72 px icon-on-top below 480): two rows of two below
 * 560, one row from 560 (spec §18.4). The widths include 320, 340, 361, 400 and 480, where the
 * earlier English subtitles were clamped (b3 一).
 */
const CARD_WIDTHS = [300, 320, 340, 360, 361, 400, 420, 480, 640, 900]
async function cardsFit(p, label, widths = CARD_WIDTHS, shots = []) {
  const all = []
  for (const px of widths) {
    await p.evaluate(v => { document.querySelector('.pd-root').style.width = `${v}px` }, px)
    await p.waitForTimeout(350)
    const cards = await p.evaluate(`(${startCards})(${lines}, ${splitWords})`)
    const hs = cards.map(c => c.h), ws = cards.map(c => c.w)
    const min = px < 480 ? 72 : 64
    const cut = cards.filter(c => c.titleCut || c.titleSplit.length > 0 || (label.startsWith('zh') && c.titleLines !== 1) || c.titleLines > 2
      || c.subCut || c.subLines > 2)
    const rows = px >= 560 ? 1 : 2
    const ok = cards.length === 4 && cut.length === 0 && Math.max(...hs) - Math.min(...hs) <= 1 && Math.max(...ws) - Math.min(...ws) <= 1
      && Math.min(...hs) >= min && new Set(cards.map(c => c.top)).size === rows
    check(`I1/C1 (${label}) panel ${px}px: card titles whole (wrapped only at spaces), descriptions and status lines whole (≤ 2 lines, no ellipsis), four equal cards ≥ ${min}px in ${rows} row${rows > 1 ? 's' : ''}`, ok, JSON.stringify(cut.length ? cut : cards.map(c => [c.w, c.h, c.titleLines, c.subLines, c.subShown])))
    all.push({ px, cards })
    if (shots.includes(px)) await outShot(p, `c1-home-${label}-${px}`, { clip: await p.locator('.pd-start').boundingBox() })
  }
  await p.evaluate(() => { document.querySelector('.pd-root').style.width = '' })
  await p.waitForTimeout(350)
  if (SELFCHECK) writeFileSync(join(SELFCHECK, `c1-cards-${label}.json`), `${JSON.stringify(all, null, 2)}\n`)
}
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

/**
 * Design I6: at device scale 1 a ring is what antialiasing leaves of it. Per colour (a cell not
 * of the selected colour), 72 rays from the dot's centre: on each, the strongest pixel within a
 * pixel of the ring (what the eye follows), as contrast on the board; the median ray must be ≥ 3:1.
 */
async function ringPixels(k, codes) {
  const at = await k.evaluate((list) => {
    const b = document.querySelector('.pd-board').getBoundingClientRect()
    return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, board: getComputedStyle(document.querySelector('.pd-board')).backgroundColor,
      cells: [...list].map((code) => {
        const c = document.querySelector(`.pd-board .pd-cell.pd-g:not(.pd-hot)[data-code="${code}"]`)
        const r = c?.getBoundingClientRect()
        return r ? { code, x: r.x - b.x, y: r.y - b.y, s: r.width, width: Number.parseFloat(getComputedStyle(c, '::after').boxShadow.match(/[\d.]+px/g)?.[3] ?? '0') } : { code, missing: true }
      }) }
  }, codes)
  const img = decodePng(await k.screenshot({ clip: at.box, animations: 'disabled' }))
  const board = (/rgba?\(([^)]+)\)/.exec(at.board)?.[1] ?? '').split(',').map(Number)
  const px = (x, y) => { const o = (Math.floor(y) * img.width + Math.floor(x)) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]] }
  return at.cells.map((c) => {
    if (c.missing) return { code: c.code, missing: true, median: 0 }
    const cx = c.x + c.s / 2, cy = c.y + c.s / 2, r = c.s * 0.36, rays = []
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 2 * Math.PI
      let best = 1
      for (let d = r - c.width - 1; d <= r + 1; d += 0.25) best = Math.max(best, contrast(px(cx + d * Math.cos(a), cy + d * Math.sin(a)), board))
      rays.push(best)
    }
    rays.sort((m, n) => m - n)
    return { code: c.code, width: c.width, median: Number(rays[36].toFixed(2)), p10: Number(rays[7].toFixed(2)), min: Number(rays[0].toFixed(2)) }
  })
}

/** Both I6 runs (all colours but the selected one, then that one with another selected): every median ray ≥ 3:1, at 1.5px. */
async function ringPixelCheck(k, scheme, pick) {
  const rows = await ringPixels(k, '0123456789abcdef'.replace('4', ''))
  await pick(5)
  rows.splice(4, 0, ...await ringPixels(k, '4'))
  await pick(4)
  const low = Math.min(...rows.map(x => x.median))
  // I6 is the light board (its ring was 1px); the dark one has been 1.5px since N10 and is recorded for reference
  if (scheme === 'light') check(`I6/C3 light board at device scale 1: 1.5px rings, the median ray of every colour ≥ 3:1 (lowest ${low})`, rows.length === 16 && rows.every(x => x.width === 1.5 && x.median >= 3), JSON.stringify(rows.filter(x => x.width !== 1.5 || x.median < 3).slice(0, 6)))
  else log(`    I6 reference: dark board at device scale 1, 1.5px rings, lowest median ray ${low}`, JSON.stringify(rows.filter(x => x.median < 3)))
  writeFileSync(join(OUT, 'audit', `o3-ring-pixels-1x-${scheme}.json`), `${JSON.stringify(rows, null, 2)}\n`)
  if (SELFCHECK) copyFileSync(join(OUT, 'audit', `o3-ring-pixels-1x-${scheme}.json`), join(SELFCHECK, `o3-ring-pixels-1x-${scheme}.json`))
}

// O3 / §18.5: every colour's guide ring measured on the real page, light and dark (computed
// style), at device scale 2; then at device scale 1 (common Windows / Linux screens), where a
// ring is what antialiasing leaves of it, also in pixels (design I6/C3: the median ring pixel of
// every colour ≥ 3:1 on the board, light and dark).
async function guideRingSection() {
  for (const dpr of [2, 1]) {
    const tag = dpr === 2 ? '' : '@1x'
    const CODES = '0123456789abcdef'
    // a followed pattern with all 16 colours (one column each, rows 2–13) on an empty board
    const pattern = Array.from({ length: 16 }, (_, y) => (y >= 2 && y <= 13 ? CODES : '.'.repeat(16))).join('')
    const seed = JSON.stringify({ v: 2, size: 16, board: '.'.repeat(256), color: 4, tool: 'paint', mode: 'play', target: 'board:o3', pattern, ironed: false, prefs: { busyHint: true, showGuide: true, showCodes: false }, done: [], coached: true })
    const k = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', deviceScaleFactor: dpr }, 'zh',
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
    check(`O3${tag} setup: 16 palette swatches and a ghost for every colour`, await swk.count() === 16 && await k.locator('.pd-board .pd-cell.pd-g').count() === 16 * 12)
    const light = await measure()
    check(`O3/R3-1${tag} light: 16 guide rings ≥ 3:1 on the real board, normal and selected (min ${minOf(light)})`, allOk(light), bad(light))
    if (dpr === 1) await ringPixelCheck(k, 'light', pick)
    await outShot(k, `o3-rings-light${tag}`, { clip: await k.locator('.pd-board').boundingBox() }, { text: false })
    await k.emulateMedia({ colorScheme: 'dark' })
    await k.waitForTimeout(600)
    const dark = await measure()
    check(`O3/N10${tag} dark: 16 guide rings ≥ 3:1 on the real board, normal and selected (min ${minOf(dark)})`, allOk(dark) && await k.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), bad(dark))
    if (dpr === 1) await ringPixelCheck(k, 'dark', pick)
    await outShot(k, `o3-rings-dark${tag}`, { clip: await k.locator('.pd-board').boundingBox() }, { text: false })
    writeFileSync(join(OUT, 'audit', `o3-rings${tag}.json`), `${JSON.stringify({ light, dark }, null, 2)}\n`)
    if (SELFCHECK) copyFileSync(join(OUT, 'audit', `o3-rings${tag}.json`), join(SELFCHECK, `o3-rings${tag}.json`))
    await k.context().close()
  }
}

// ── W. my works (spec §18.4) and its lazy chunk on the start page (design decision 01:37, an exception to §18.6) ──
const WORK_CHUNK = /\/dsh-pindou\/client\.works\.js\?/
/** `n` valid works, oldest first, one a day up to 2026-06-01 (sources cycle free / pattern / picture / AI). */
function seedWorks(n) {
  const end = Date.parse('2026-06-01T09:00:00+08:00'), hex = '0123456789abcdef', srcs = [null, 'template:heart', 'board:p-1', 'board:w-1', 'template:cat']
  return Array.from({ length: n }, (_w, k) => ({
    i: end - (n - 1 - k) * 86_400_000, n: 16, s: srcs[k % 5],
    b: Array.from({ length: 256 }, (_, c) => { const x = c % 16, y = c >> 4; return Math.abs(x - 7.5) + Math.abs(y - 7.5) < 7 ? hex[(k + ((x + y) >> 2)) % 16] : '.' }).join(''),
  }))
}
/** Init script: the wall (raw JSON string) written once per tab, before the plugin reads it. */
const seedInit = (json, extra = '') => `if (!sessionStorage.getItem('w')) { sessionStorage.setItem('w', '1'); localStorage.setItem('dsh-pindou:works', ${JSON.stringify(json)}); ${extra} }`
/** The home section as laid out now (evaluated in the page). */
const worksRow = () => {
  const s = document.querySelector('.pd-v-home .pd-works')
  if (!s) return null
  const r = s.getBoundingClientRect(), row = s.querySelector('.pd-wrow'), h = s.querySelector('h3')
  const thumbs = [...s.querySelectorAll('.pd-wt')]
  return {
    h: Math.round(r.height * 4) / 4, head: Math.round(h.getBoundingClientRect().height * 4) / 4, rowH: Math.round(row.getBoundingClientRect().height * 4) / 4,
    title: (h.querySelector('span') ?? h).textContent, btn: row.querySelector('button:not(.pd-wt)')?.textContent ?? null, text: row.textContent, thumbs: thumbs.length,
    first: thumbs[0]?.getAttribute('aria-label') ?? null, fits: Math.floor((row.clientWidth + 8) / 64),
    anim: thumbs[0] ? `${getComputedStyle(thumbs[0]).animationName}/${getComputedStyle(thumbs[0]).animationDuration}` : null,
    toast: document.querySelectorAll('.pd-toast').length,
  }
}
const wallCount = p => p.evaluate(() => JSON.parse(localStorage.getItem('dsh-pindou:works') ?? '[]').length)
const backHome = async (p) => { await p.locator('.pd-head .pd-ib').first().click(); await p.locator('.pd-v-home').waitFor(); await p.waitForTimeout(200) }
const worksCard = p => p.locator('.pd-start .pd-big').nth(3)
/** A shot of the home section, scrolled into the panel's view first. */
const rowShot = async (p, name, auditOpts) => { const s = p.locator('.pd-v-home .pd-works'); await s.scrollIntoViewIfNeeded(); await outShot(p, name, { clip: await s.boundingBox() }, auditOpts) }
const setWidth = async (p, px) => { await p.evaluate(v => { document.querySelector('.pd-root').style.width = v ? `${v}px` : '' }, px); await p.waitForTimeout(300) }

async function worksSection() {
  const errorsBefore = pageErrors.length
  // 1. a slow chunk: the row holds its height while loading, thumbnails fade in (150 ms), loaded once per session
  {
    const w = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit(JSON.stringify(seedWorks(60))))
    let asked = 0
    await w.route(WORK_CHUNK, async (route) => { asked++; await new Promise(r => { setTimeout(r, 4000) }); await route.continue() })
    await startSession(w, '看看 README')
    await w.locator('.pd-entry').click()
    await w.locator('.pd-v-home .pd-works').waitFor()
    const loading = await w.evaluate(worksRow)
    await rowShot(w, 'w-row-loading', { text: false })
    await w.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    const loaded = await w.evaluate(worksRow)
    check('W §18.4 home row while the chunk loads: 「我的作品 · 60」 over an empty 56 px row, no toast', loading.title === '我的作品 · 60' && loading.rowH === 56 && loading.thumbs === 0 && loading.btn === null && loading.toast === 0, JSON.stringify(loading))
    check('W placeholder height = loaded height (nothing below moves when the thumbnails arrive)', loading.h === loaded.h && loading.head === loaded.head && loaded.rowH === 56, JSON.stringify({ loading, loaded }))
    check('W loaded: as many thumbnails as fit on one line, newest first (6 月 1 日), 全部 ›', loaded.thumbs === loaded.fits && loaded.first?.endsWith('6 月 1 日') && loaded.btn === null && await w.locator('.pd-v-home .pd-works h3 .pd-link').textContent() === '全部 ›', JSON.stringify(loaded))
    check('W thumbnails that arrive on screen fade in over 150 ms', /^\S+\/0\.15s$/.test(loaded.anim ?? '') && !loaded.anim.startsWith('none'), loaded.anim)
    await rowShot(w, 'w-row-loaded')
    // to the wall and back, to a game and back: no new request, no fade, no placeholder
    await w.locator('.pd-v-home .pd-works h3 .pd-link').click()
    await w.locator('.pd-wall .pd-wc').first().waitFor()
    await backHome(w)
    const again1 = await w.evaluate(worksRow)
    await w.locator('.pd-tpl').first().click()
    await w.locator('.pd-board').waitFor()
    await backHome(w)
    const again2 = await w.evaluate(worksRow)
    check('W back on the start page (twice): the chunk is not requested again, thumbnails at once, no fade', asked === 1 && again1.thumbs === loaded.thumbs && again2.thumbs === loaded.thumbs && again1.anim.startsWith('none') && again2.anim.startsWith('none') && again2.h === loaded.h, JSON.stringify({ asked, again1, again2 }))
    // reduced motion: a fresh session, the chunk arrives on screen without the fade
    await w.context().close()
    const r = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', reducedMotion: 'reduce' }, 'zh', seedInit(JSON.stringify(seedWorks(5))))
    await r.route(WORK_CHUNK, async (route) => { await new Promise(res => { setTimeout(res, 800) }); await route.continue() })
    await startSession(r, '看看 README')
    await r.locator('.pd-entry').click()
    await r.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    const still = await r.evaluate(worksRow)
    check('W reduced motion: thumbnails appear without the fade', still.anim?.startsWith('none') && still.thumbs === 5, JSON.stringify(still))
    await r.context().close()
  }
  // 2. the chunk fails: title + the retry line at the same height, no toast; Space and Enter retry
  {
    let mode = 'fail', fetches = 0
    const f = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit(JSON.stringify(seedWorks(3))))
    await f.route(WORK_CHUNK, (route) => { fetches++; return mode === 'fail' ? route.abort('internetdisconnected') : route.continue() })
    await startSession(f, '看看 README')
    await openPanel(f)
    await f.locator('.pd-v-home .pd-works .pd-wrow button').waitFor({ timeout: 10000 })
    const failed = await f.evaluate(worksRow)
    check('W chunk failed: 「我的作品 · 3」 and 「加载失败，点此重试」 in the same 56 px row, no toast', failed.title === '我的作品 · 3' && failed.btn === '加载失败，点此重试' && failed.rowH === 56 && failed.toast === 0 && failed.thumbs === 0, JSON.stringify(failed))
    await rowShot(f, 'w-row-failed')
    await f.locator('.pd-v-home .pd-works .pd-wrow button').focus()
    await f.keyboard.press('Space')
    await f.waitForTimeout(500)
    const failed2 = await f.evaluate(worksRow)
    check('W Space on the retry fetches again (still offline: same row, still no toast)', fetches === 2 && failed2.btn === '加载失败，点此重试' && failed2.h === failed.h && failed2.toast === 0, JSON.stringify({ fetches, failed2 }))
    mode = 'ok'
    await f.locator('.pd-v-home .pd-works .pd-wrow button').focus()
    await f.keyboard.press('Enter')
    await f.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    const back = await f.evaluate(worksRow)
    check('W Enter on the retry loads the row (same height, 3 thumbnails)', fetches === 3 && back.thumbs === 3 && back.h === failed.h, JSON.stringify({ fetches, back }))
    const landed = await f.evaluate(() => { const a = document.activeElement; return { first: a === document.querySelector('.pd-v-home .pd-wt'), label: a?.getAttribute('aria-label') ?? a?.textContent ?? null } })
    check('b4 重要 3 after the retry loads the row, focus is on the first thumbnail (not 自由拼)', landed.first, JSON.stringify(landed))
    await f.context().close()
    const caused = pageErrors.splice(errorsBefore)
    check('W the only errors during the failure run are the aborted chunk loads', caused.every(e => /client\.works\.js|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/i.test(e)), caused.slice(0, 3).join(' | '))
  }
  // b4 重要 1/2 (spec 03:30): every bead whole device pixels, nothing scaled, centred; thumbnails 4 px inside their corner. At 2× and 1×.
  for (const dpr of [2, 1]) {
    const tag = dpr === 2 ? '' : '@1x', hex = '0123456789abcdef'
    // the newest work is a full 12×12 board, so its opaque box is exactly the pattern
    const full = { i: Date.parse('2026-06-01T09:30:00+08:00'), n: 12, s: null, b: Array.from({ length: 144 }, (_, c) => hex[(c % 12 + (c >> 2)) % 16]).join('') }
    const g = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', deviceScaleFactor: dpr }, 'zh', seedInit(JSON.stringify([...seedWorks(3), full])))
    await startSession(g, '看看 README')
    await openPanel(g)
    await g.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    await g.waitForTimeout(300)
    /**
     * A piece's canvas: bitmap = its own device pixels, the opaque box a whole multiple of n, centred.
     * Then the screen itself: every opaque bitmap pixel shows unchanged at one whole-pixel offset in a
     * screenshot, i.e. the canvas is painted 1:1 and nothing resampled it (its layout box may sit at a
     * fractional css position; Chrome snaps a replaced element's paint to device pixels).
     */
    const piece = async (sel, n) => {
      const at = await g.evaluate(([q, m]) => {
        const c = document.querySelector(q), r = c.getBoundingClientRect(), d = devicePixelRatio
        const px = c.width, data = c.getContext('2d').getImageData(0, 0, px, px).data
        let x0 = px, x1 = -1, y0 = px, y1 = -1
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) if (data[(y * px + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
        const k = Math.floor(px / m), side = x1 - x0 + 1
        const b = c.parentElement.getBoundingClientRect()
        return {
          css: c.clientWidth, px, dpr: d, k, side, x0, y0, rows: y1 - y0 + 1,
          ok: px === Math.round(c.clientWidth * d) && side === m * k && y1 - y0 + 1 === m * k && x0 === Math.floor((px - m * k) / 2) && y0 === x0,
          inset: Math.min(r.left - b.left, r.top - b.top, b.right - r.right, b.bottom - r.bottom),
          left: r.left, top: r.top, rgba: [...data].join(','),
        }
      }, [sel, n])
      const { left, top, rgba, ...out } = at
      const bits = rgba.split(',').map(Number), px = out.px, d = out.dpr
      const clip = { x: Math.floor(left) - 1, y: Math.floor(top) - 1, width: out.css + 3, height: out.css + 3 }
      const seen = decodePng(await g.screenshot({ clip, animations: 'disabled' }))
      const base = { x: Math.round((left - clip.x) * d), y: Math.round((top - clip.y) * d) }
      const fits = (ox, oy) => {
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
          const o = (y * px + x) * 4
          if (bits[o + 3] !== 255) continue
          const sx = x + ox, sy = y + oy
          if (sx < 0 || sy < 0 || sx >= seen.width || sy >= seen.height) return false
          const t = (sy * seen.width + sx) * 4
          if (Math.abs(seen.data[t] - bits[o]) > 2 || Math.abs(seen.data[t + 1] - bits[o + 1]) > 2 || Math.abs(seen.data[t + 2] - bits[o + 2]) > 2) return false
        }
        return true
      }
      let shown = null
      for (const dy of [0, -1, 1]) for (const dx of [0, -1, 1]) if (!shown && fits(base.x + dx, base.y + dy)) shown = { dx, dy }
      return { ...out, at: { left, top }, onScreen1to1: shown !== null, ok: out.ok && shown !== null }
    }
    const thumb = await piece('.pd-v-home .pd-wt canvas', 12)
    check(`b4 重要 1 (${dpr}×) home thumbnail 12×12: ${46 * dpr} device px, ${Math.floor(46 * dpr / 12)} a bead, centred on whole pixels, 5 css (1 border + 4 padding) inside the round corner`, thumb.ok && thumb.css === 46 && thumb.inset === 5, JSON.stringify(thumb))
    await rowShot(g, `b4-thumbs${tag}`)
    await g.locator('.pd-v-home .pd-wt').first().click()
    await g.locator('.pd-wdet .pd-wbig canvas').waitFor({ timeout: 10000 })
    await g.waitForTimeout(300)
    const det = await piece('.pd-wdet .pd-wbig canvas', 12)
    check(`b4 重要 2 (${dpr}×) 12×12 detail image: ${304 * dpr} device px, ${Math.floor(304 * dpr / 12)} a bead (a whole multiple, not the 448 px export stretched), centred with the rest left empty`, det.ok && det.css === 304, JSON.stringify(det))
    await outShot(g, `b4-detail-12${tag}`, { clip: await g.locator('.pd-wdet .pd-wbig').boundingBox() })
    await g.context().close()
  }
  // 3. a host without require.async: title + 「需要新版 DSH」, same height, nothing to press; the card is off
  for (const lang of ['zh', 'en']) {
    const u = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, lang, `${NO_ASYNC_REQUIRE};${seedInit(JSON.stringify(seedWorks(3)))}`)
    await startSession(u, lang === 'zh' ? '看看 README' : 'Hello', lang)
    await openPanel(u)
    const off = await u.evaluate(worksRow)
    const want = lang === 'zh' ? '需要新版 DSH' : 'Requires a newer DSH'
    const card = await worksCard(u).evaluate(b => ({ lazy: b.dataset.lazy, aria: b.getAttribute('aria-disabled'), text: b.textContent }))
    check(`W (${lang}) no require.async: the row says 「${want}」 at the same height, not interactive; the works card is off`, off.text === want && off.btn === null && off.rowH === 56 && off.title === (lang === 'zh' ? '我的作品 · 3' : 'My works · 3') && card.lazy === 'unsupported' && card.aria === 'true' && card.text.endsWith(want), JSON.stringify({ off, card }))
    await rowShot(u, `w-row-unsupported-${lang}`)
    await u.context().close()
  }
  // 4. the wall page: keyboard, detail card, delete + undo, export, 再拼一次; from a home thumbnail
  {
    const k = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit(JSON.stringify(seedWorks(60))))
    await startSession(k, '看看 README')
    await openPanel(k)
    await worksCard(k).click()
    await k.locator('.pd-wall .pd-wc').first().waitFor({ timeout: 10000 })
    const page = await k.evaluate(() => ({ title: document.querySelector('.pd-head h2')?.textContent, months: [...document.querySelectorAll('.pd-wall h3')].map(h => h.textContent), n: document.querySelectorAll('.pd-wall .pd-wc').length, tabbable: document.querySelectorAll('.pd-wall .pd-wc[tabindex="0"]').length }))
    check('W wall page: 「我的作品」, 60 works, newest month first (6 月, 5 月, 4 月), one Tab stop', page.title === '我的作品' && page.n === 60 && page.months.join('|') === '2026 年 6 月|2026 年 5 月|2026 年 4 月' && page.tabbable === 1, JSON.stringify(page))
    const focused = () => k.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent)
    await k.locator('.pd-wall .pd-wc').first().focus()
    await k.keyboard.press('ArrowRight')
    const right = await focused()
    await k.keyboard.press('ArrowDown')
    const down = await focused()
    await k.keyboard.press('End')
    const end = await focused()
    await k.keyboard.press('Home')
    const home = await focused()
    check('W wall keys: → next, ↓ next row, End last (oldest), Home first (newest)', right?.endsWith('5 月 31 日') && down !== right && end?.endsWith('4 月 3 日') && home?.endsWith('6 月 1 日'), JSON.stringify({ right, down, end, home }))
    await k.keyboard.press('Enter')
    await k.locator('.pd-wdet').waitFor()
    const det = await k.evaluate(() => ({ role: document.querySelector('.pd-wdet')?.getAttribute('role'), label: document.querySelector('.pd-wdet')?.getAttribute('aria-label'), focus: document.activeElement?.textContent, btns: [...document.querySelectorAll('.pd-wdet button')].map(b => b.textContent) }))
    check('W Enter opens the detail card: a dialog named after the work, focus on 导出 PNG; 关闭, 导出 PNG, 复制图片, 再拼一次, 删除', det.role === 'dialog' && det.label?.endsWith('6 月 1 日') && det.focus === '导出 PNG' && det.btns.join('|') === '关闭|导出 PNG|复制图片|再拼一次|删除', JSON.stringify(det))
    await outShot(k, 'w-detail-keyboard')
    const trap = []
    for (let i = 0; i < 6; i++) { await k.keyboard.press('Tab'); trap.push(await k.evaluate(() => !!document.activeElement?.closest('.pd-wdet'))) }
    check('W Tab stays inside the detail card', trap.every(Boolean), JSON.stringify(trap))
    const behind = () => k.evaluate(() => ({ inert: document.querySelector('.pd-wall')?.inert, cardInert: !!document.querySelector('.pd-wdet')?.closest('[inert]') }))
    const behindOpen = await behind()
    await k.keyboard.press('Escape')
    await k.waitForTimeout(150)
    check('W Esc closes the card and focus goes back to the work', await k.locator('.pd-wdet').count() === 0 && (await focused())?.endsWith('6 月 1 日'))
    const behindClosed = await behind()
    check('b4 suggestion: the wall behind the open card is inert (not the card), and not once it closes', behindOpen.inert === true && !behindOpen.cardInert && behindClosed.inert === false, JSON.stringify({ behindOpen, behindClosed }))
    await k.keyboard.press('Enter')
    await k.locator('.pd-wdet').waitFor()
    await k.locator('.pd-wdet .pd-primary').click()
    const exported = await k.waitForFunction(() => !!document.querySelector('.pd-toast, .pd-preview'), undefined, { timeout: 5000 }).then(() => true, () => false)
    check('W 导出 PNG from the card: the piece is saved (toast) or offered (preview)', exported)
    await k.keyboard.press('Escape')
    await k.waitForTimeout(150)
    if (await k.locator('.pd-preview').count()) { await k.keyboard.press('Escape'); await k.waitForTimeout(150) }
    if (await k.locator('.pd-wdet').count()) { await k.keyboard.press('Escape'); await k.waitForTimeout(150) }
    await k.locator('.pd-wall .pd-wc').first().focus()
    await k.keyboard.press('Delete')
    await k.waitForTimeout(200)
    const del = { stored: await wallCount(k), shown: await k.locator('.pd-wall .pd-wc').count(), toast: (await k.locator('.pd-toast').allTextContents()).join('|'), focus: await focused() }
    check('W Delete removes the work at once (stored 59), 「已删除作品 撤销」, focus on the next work', del.stored === 59 && del.shown === 59 && del.toast === '已删除作品撤销' && del.focus?.endsWith('5 月 31 日'), JSON.stringify(del))
    await outShot(k, 'w-deleted-toast')
    await k.locator('.pd-toast button', { hasText: '撤销' }).click()
    await k.waitForTimeout(200)
    check('W 撤销 brings it back (stored 60) and focus returns to it', await wallCount(k) === 60 && (await focused())?.endsWith('6 月 1 日'))
    // Ctrl+Z does the same while the toast is up (b4 suggestion)
    await k.keyboard.press('Delete')
    await k.waitForTimeout(200)
    const zBefore = await wallCount(k)
    await k.keyboard.press('Control+z')
    await k.waitForTimeout(200)
    check('b4 suggestion: Ctrl+Z right after Delete brings the work back (59 → 60), focus on it, the toast gone', zBefore === 59 && await wallCount(k) === 60 && (await focused())?.endsWith('6 月 1 日') && await k.locator('.pd-toast').count() === 0, JSON.stringify({ zBefore, after: await wallCount(k), focus: await focused() }))
    // 再拼一次 on a pattern work (6 月 1 日 is index 59: template:cat)
    await k.keyboard.press('Enter')
    await k.locator('.pd-wdet').waitFor()
    await k.locator('.pd-wdet button', { hasText: '再拼一次' }).click()
    await k.locator('.pd-board').waitFor()
    await k.waitForTimeout(300)
    const replayed = await k.evaluate(() => JSON.parse(localStorage.getItem('dsh-pindou:v1') ?? '{}'))
    check('W 再拼一次 follows the work\'s pattern again (template:cat, an empty board)', replayed.target === 'template:cat' && replayed.mode === 'play' && !replayed.ironed, JSON.stringify({ target: replayed.target, mode: replayed.mode }))
    await backHome(k)
    // the home row is one Tab stop; arrows move along it (b4 suggestion)
    await k.locator('.pd-v-home .pd-wt').first().focus()
    const stops = () => k.evaluate(() => [...document.querySelectorAll('.pd-v-home .pd-wt')].map(b => b.tabIndex))
    const rowBefore = await stops()
    await k.keyboard.press('ArrowRight')
    const rowAfter = await stops()
    const rowFocus = await k.evaluate(() => document.activeElement === document.querySelectorAll('.pd-v-home .pd-wt')[1])
    await k.keyboard.press('End')
    const rowEnd = await k.evaluate(() => { const t = [...document.querySelectorAll('.pd-v-home .pd-wt')]; return document.activeElement === t.at(-1) })
    check('b4 suggestion: the home row is one Tab stop, → moves the stop and the focus, End goes to the last', rowBefore.length > 1 && rowBefore.filter(x => x === 0).length === 1 && rowBefore[0] === 0 && rowAfter.filter(x => x === 0).length === 1 && rowAfter[1] === 0 && rowFocus && rowEnd, JSON.stringify({ rowBefore, rowAfter, rowFocus, rowEnd }))
    // a home thumbnail opens its card on the wall page
    await k.locator('.pd-v-home .pd-wt').nth(1).click()
    await k.locator('.pd-wdet').waitFor({ timeout: 5000 })
    check('W a home thumbnail opens that work\'s card on the wall page', (await k.locator('.pd-wdet').getAttribute('aria-label'))?.endsWith('5 月 31 日'))
    await k.context().close()
  }
  // F1 每日一拼, all in the works chunk: 2026-06-01 is day 151 → pattern 31 (小猪); yesterday's daily on the wall
  {
    const pig = DAILY_DEFS[31].rows.join(''), prev = DAILY_DEFS[30].rows.join('')
    const yesterday = { i: Date.parse('2026-05-31T12:00:00+08:00'), n: 16, b: prev, s: 'board:p-daily-2026-05-31-a1', p: prev }
    const y = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit(JSON.stringify([...seedWorks(2), yesterday])))
    await startSession(y, '看看 README')
    await openPanel(y)
    await worksCard(y).click()
    await y.locator('.pd-wdaily').waitFor({ timeout: 10000 })
    const before = await y.evaluate(() => ({ text: document.querySelector('.pd-wdaily')?.textContent, first: document.querySelector('.pd-view > .pd-wday + .pd-wall') !== null, tags: [...document.querySelectorAll('.pd-wc')].filter(c => c.querySelector('.pd-wtag')).map(c => c.getAttribute('aria-label')) }))
    check('F1 the wall page opens with today\'s pattern (day 151 → 31, 小猪), yesterday\'s daily makes a 1-day streak, then 开始; the wall below; yesterday\'s work carries the badge',
      before.text === '今日一拼 · 小猪连续 1 天开始' && before.first && before.tags.join() === `今日一拼 · ${DAILY_DEFS[30].zh} · 5 月 31 日`, JSON.stringify(before))
    // shoot once the page has slid in (the plugin's own finite animations are done)
    await y.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.target?.closest?.('.pd-root') && a.effect.getTiming().iterations !== Infinity).map(a => a.finished)))
    const shown = await y.evaluate(() => getComputedStyle(document.querySelector('.pd-view:has(> .pd-wday)')).opacity)
    check('F1 the wall page has slid in before its screenshot (opacity 1)', shown === '1', shown)
    await outShot(y, 'f1-daily-zh-light')
    await y.locator('.pd-wdaily').click()
    await y.locator('.pd-board').waitFor()
    await y.waitForTimeout(300)
    const game = await y.evaluate(() => JSON.parse(localStorage.getItem('dsh-pindou:v1') ?? '{}'))
    check('F1 开始 opens a game following today\'s pattern, keyed board:p-daily-2026-06-01-…', /^board:p-daily-2026-06-01-[0-9a-z]+$/.test(game.target ?? '') && game.pattern === pig && game.mode === 'play', JSON.stringify({ target: game.target, mode: game.mode, same: game.pattern === pig }))
    for (let i = 0; i < 3; i++) await y.locator('.pd-board .pd-cell').nth(i * 17).click()
    await y.locator('.pd-foot .pd-warm').click()
    await y.locator('.pd-overlay.pd-result').waitFor({ timeout: 8000 })
    await backHome(y)
    await worksCard(y).click()
    await y.locator('.pd-wdaily').waitFor({ timeout: 10000 })
    const after = await y.evaluate(() => ({ text: document.querySelector('.pd-wdaily')?.textContent, tags: document.querySelectorAll('.pd-wc .pd-wtag').length, newest: document.querySelector('.pd-wc')?.getAttribute('aria-label') }))
    check('F1 ironed: on the wall with the badge (今日一拼 · 小猪 · 6 月 1 日), the streak is 2 days, the card offers 再拼一次', after.text === '今日一拼 · 小猪连续 2 天再拼一次' && after.tags === 2 && after.newest === '今日一拼 · 小猪 · 6 月 1 日', JSON.stringify(after))
    await y.locator('.pd-wc').first().click()
    await y.locator('.pd-wdet').waitFor()
    const note = await y.evaluate(() => { const d = document.querySelector('.pd-wdet .pd-wdel'); return document.getElementById(d?.getAttribute('aria-describedby') ?? '')?.textContent ?? null })
    check('F1 a daily work\'s detail card says 「删除后连续天数会重新计算」 and 删除 is described by it', note === '删除后连续天数会重新计算', JSON.stringify(note))
    await y.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.target?.closest?.('.pd-root') && a.effect.getTiming().iterations !== Infinity).map(a => a.finished)))
    await outShot(y, 'f1-detail-zh-light')
    await y.locator('.pd-wdet .pd-wdel').click()
    await y.waitForTimeout(200)
    const gone = await y.evaluate(() => document.querySelector('.pd-wdaily')?.textContent)
    check('F1 deleting today\'s daily recalculates the streak at once (1 day, 开始 again)', gone === '今日一拼 · 小猪连续 1 天开始', JSON.stringify(gone))
    await y.context().close()
  }
  // 5. ironing collects, 取消熨烫 withdraws, the empty wall, and a broken wall
  {
    const c = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })
    await startSession(c, '看看 README')
    await openPanel(c)
    check('W no works: no row on the start page', await c.locator('.pd-v-home .pd-works').count() === 0)
    await worksCard(c).click()
    await c.locator('.pd-wempty').waitFor({ timeout: 10000 })
    check('W empty wall: 「熨烫过的作品会住在这里」 and 去拼一个', (await c.locator('.pd-wempty').textContent()) === '熨烫过的作品会住在这里去拼一个')
    await outShot(c, 'w-empty-zh-light')
    await c.locator('.pd-wempty button').click()
    await c.locator('.pd-v-home').waitFor()
    await c.locator('.pd-start .pd-big').first().click()
    await c.locator('.pd-board').waitFor()
    for (let i = 0; i < 3; i++) await c.locator('.pd-board .pd-cell').nth(i * 17).click()
    await c.locator('.pd-foot .pd-warm').click()
    await c.locator('.pd-overlay.pd-result').waitFor({ timeout: 8000 })
    const ironed = await wallCount(c)
    await c.locator('.pd-overlay.pd-result .pd-ghost').click()
    await c.waitForTimeout(200)
    const withdrawn = await wallCount(c)
    await c.locator('.pd-foot .pd-warm').click()
    await c.locator('.pd-overlay.pd-result').waitFor({ timeout: 8000 })
    await backHome(c)
    const row = await c.evaluate(worksRow)
    check('W ironing puts the piece on the wall at once, 取消熨烫 takes it off, ironing again puts it back; home shows 「我的作品 · 1」', ironed === 1 && withdrawn === 0 && await wallCount(c) === 1 && row?.title === '我的作品 · 1', JSON.stringify({ ironed, withdrawn, row }))
    await c.context().close()
    // broken entries: only those go (written back cleaned); unreadable JSON is an empty wall and the game still saves
    const good = seedWorks(3)
    const broken = JSON.stringify([good[0], { i: 'x' }, good[1], { i: 5, n: 16, b: 'zz', s: null }, null, good[2]])
    const b = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit(broken))
    await startSession(b, '看看 README')
    await openPanel(b)
    await b.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    await b.waitForTimeout(200)
    const cleaned = await b.evaluate(() => JSON.parse(localStorage.getItem('dsh-pindou:works')).map(x => x.i))
    const brow = await b.evaluate(worksRow)
    check('W broken entries in storage: only they are dropped (3 of 6 kept, written back), 「我的作品 · 3」', cleaned.join() === good.map(x => x.i).join() && brow.title === '我的作品 · 3' && brow.thumbs === 3, JSON.stringify({ cleaned, brow }))
    await b.context().close()
    const j = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, 'zh', seedInit('{oops'))
    await startSession(j, '看看 README')
    await openPanel(j)
    const none = await j.locator('.pd-v-home .pd-works').count()
    await j.locator('.pd-start .pd-big').first().click()
    await j.locator('.pd-board').waitFor()
    await j.locator('.pd-board .pd-cell').first().click()
    await j.locator('.pd-foot .pd-warm').click()
    await j.locator('.pd-overlay.pd-result').waitFor({ timeout: 8000 })
    const saved = await j.evaluate(() => ({ game: JSON.parse(localStorage.getItem('dsh-pindou:v1') ?? '{}').ironed, wall: JSON.parse(localStorage.getItem('dsh-pindou:works') ?? 'null')?.length }))
    check('W unreadable wall JSON: no row; ironing saves the game and starts a fresh wall of 1', none === 0 && saved.game === true && saved.wall === 1, JSON.stringify({ none, saved }))
    await j.context().close()
  }
  // 6. walkthrough: light/dark × zh/en, 300–900 wide, home row and wall page (60 works), fade settled before each shot
  const walkPage = async (scheme, lang, at) => {
    const v = await newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme }, lang, seedInit(JSON.stringify(seedWorks(60))), at ?? FIXED_NOW)
    await startSession(v, lang === 'zh' ? '看看 README' : 'Hello', lang)
    await openPanel(v)
    await v.locator('.pd-v-home .pd-wt').first().waitFor({ timeout: 10000 })
    return v
  }
  // The walkthrough's original crops, docked: the panel's root at 300–900 px. Docked, a root wider than the
  // sidebar runs past the window's right edge, so its crop stops there (575 of 900 px at 1280 wide) and
  // never reaches the host chat. Next to it, a crop of the host's stamp on the message just sent: the
  // host clock on screen, for the determinism check and its counter-proof.
  const dockedShot = async (v, name) => {
    const roots = []
    for (const px of [300, 420, 640, 900]) {
      await setWidth(v, px)
      await pluginShot(v, `${name}-${px}`)
      roots.push([px, Math.round((await v.locator('.pd-root').first().boundingBox())?.width ?? 0)])
    }
    await setWidth(v, null)
    const [stamp] = await hostStamps(v)
    if (!stamp) return { roots }
    const clip = { x: Math.floor(stamp.x) - 12, y: Math.floor(stamp.y) - 8, width: Math.ceil(stamp.right - stamp.x) + 24, height: Math.ceil(stamp.bottom - stamp.y) + 16 }
    const file = join(OUT, 'plugin', `${name}-host-clock.png`)
    await v.evaluate(settlePlugin)
    await v.screenshot({ path: file, clip })
    await v.evaluate(resumePlugin)
    if (SELFCHECK) copyFileSync(file, join(SELFCHECK, 'plugin', `${name}-host-clock.png`))
    return { roots, stamp, clip, file }
  }
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['zh', 'en']) {
      // the stamp shows the fixed time however long the run took to get here
      const clk = await serverClock(0), at = clk.hhmm
      const v = await walkPage(scheme, lang, clk.at)
      const docked = await dockedShot(v, `w-docked-${lang}-${scheme}`)
      check(`W (${lang} ${scheme}) docked at 300–900 px: the host's stamp on the message (its own crop) shows the fixed clock (${at ?? 'E2E_CLOCK=real'})`,
        !!docked.stamp && (!at || docked.stamp.text.includes(at)), JSON.stringify({ stamp: docked.stamp?.text, roots: docked.roots }))
      // permanent counter-proof, on the host-clock crop: the same page again a day on with both clocks at
      // the fixed time compares pixel-equal; with both clocks a minute ahead it must not, and the
      // difference must lie inside the stamp
      if (FIXED_NOW && lang === 'zh' && scheme === 'light' && docked.stamp) {
        const c1 = await serverClock(0)
        const w = await walkPage(scheme, lang, c1.at)
        const same = await dockedShot(w, 'clock-proof-same')
        await w.context().close()
        const c2 = await serverClock(60_000)
        const x = await walkPage(scheme, lang, c2.at)
        const ahead = await dockedShot(x, 'clock-proof-plus-1min')
        await x.context().close()
        const eq = same.file ? diffPng(readFileSync(docked.file), readFileSync(same.file)) : 'no stamp'
        check('screenshot determinism: the same page again a day on, both clocks at the fixed time: the host-clock crop compares pixel-equal',
          !!same.stamp?.text.includes(c1.hhmm) && eq === null, JSON.stringify({ stamps: [docked.stamp.text, same.stamp?.text], diff: eq }))
        const d = same.file && ahead.file ? diffPng(readFileSync(same.file), readFileSync(ahead.file)) : null
        const st = same.stamp, c = same.clip, S = 2
        const inStamp = !!d?.box && d.box.x >= Math.floor((st.x - c.x) * S) - 1 && d.box.y >= Math.floor((st.y - c.y) * S) - 1
          && d.box.x + d.box.width <= Math.ceil((st.right - c.x) * S) + 1 && d.box.y + d.box.height <= Math.ceil((st.bottom - c.y) * S) + 1
        check('screenshot determinism counter-proof: both clocks one minute ahead show in the stamp, and the comparison finds it there and only there',
          !!ahead.stamp?.text.includes(c2.hhmm) && !!d && inStamp, JSON.stringify({ stamps: [st?.text, ahead.stamp?.text], diff: d, clip: c }))
      }
      // the host's full-screen sidebar, so the 300–900 px row and wall shots show the whole panel (docked,
      // a root wider than the sidebar is cut off at the window's edge: 575 of 900 px)
      await v.getByRole('button', { name: HOST[lang].full }).first().click()
      await v.waitForTimeout(800)
      const room = Math.round((await panelBox(v))?.width ?? 0)
      check(`W (${lang} ${scheme}) walkthrough: the full-screen sidebar has room for a 900 px panel`, room >= 900, `width ${room}`)
      const fits = []
      for (const px of [300, 360, 420, 480, 560, 640, 900]) {
        await setWidth(v, px)
        const row = await v.evaluate(worksRow)
        fits.push([px, row.thumbs, row.fits, row.rowH])
        if ([300, 420, 640, 900].includes(px)) await rowShot(v, `w-home-${lang}-${scheme}-${px}`)
      }
      check(`W (${lang} ${scheme}) home row 300–900: one line of whole thumbnails at every width`, fits.every(([, n, fit, h]) => n === fit && n >= 3 && h === 56), JSON.stringify(fits))
      await setWidth(v, null)
      await v.locator('.pd-v-home .pd-works h3 .pd-link').click()
      await v.locator('.pd-wall .pd-wc').first().waitFor()
      const cols = []
      for (const px of [300, 359, 360, 420, 560, 561, 640, 900]) {
        await setWidth(v, px)
        cols.push([px, await v.evaluate(() => getComputedStyle(document.querySelector('.pd-wcols')).gridTemplateColumns.split(' ').length), await v.evaluate(() => Math.round(document.querySelector('.pd-wall').closest('.pd-view').getBoundingClientRect().width))])
        if ([300, 420, 640, 900].includes(px)) await outShot(v, `w-wall-${lang}-${scheme}-${px}`, { clip: await v.locator('.pd-root').boundingBox() })
      }
      check(`W (${lang} ${scheme}) wall columns: 3 below 360, 4 to 560, 6 above`, cols.map(c => c[1]).join() === '3,3,4,4,4,6,6,6', JSON.stringify(cols))
      check(`W (${lang} ${scheme}) b4 suggestion: the wall page is as wide as the home page on a wide panel (640), the panel's width below that`, cols.map(c => c[2]).join() === '300,359,360,420,560,561,640,640', JSON.stringify(cols))
      await setWidth(v, null)
      await v.locator('.pd-wall .pd-wc').first().click()
      await v.locator('.pd-wdet').waitFor()
      await outShot(v, `w-detail-${lang}-${scheme}`, { clip: await v.locator('.pd-root').boundingBox() })
      await v.context().close()
    }
  }
}

// E2E_ONLY=t1 runs just the picture section, E2E_ONLY=k just the guide rings, E2E_ONLY=w just my works (the rest of the suite is unchanged)
const ONLY = process.env.E2E_ONLY ?? ''
try {
  sections: {
  if (ONLY === 'k') { log('K. guide rings (spec §18.5)'); await guideRingSection(); break sections }
  if (ONLY === 'w') { log('W. my works (spec §18.4)'); await worksSection(); break sections }
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
    // the plugin is installed but its panel was never opened: a file dropped on the chat input is DSH's attachment
    const dot = png(48, 48, () => [98, 182, 233, 255])
    const closedDrop = await q.evaluate(dropFile, ['[contenteditable=true]', b64(dot), 'chat-closed.png', 'image/png'])
    const closedCard = await q.waitForFunction(hostFileCards, 'chat-closed.png', { timeout: 8000 }).then(() => true, () => false)
    check('T1 panel never opened: a file dropped on the chat input becomes a DSH attachment', closedCard && closedDrop.dropPrevented && closedDrop.hostSaw.includes('drop'), JSON.stringify({ closedCard, ...closedDrop }))
    await openPanel(q)
    const live = await pictureCard(q).evaluate(b => ({ lazy: b.dataset.lazy, off: b.getAttribute('aria-disabled'), text: b.textContent, h: Math.round(b.getBoundingClientRect().height) }))
    check('T1 a host with require.async: the third card is live (「图片转图纸 · 照片变成图纸」, ≥ 64 tall; sizes checked by cardsFit), nothing fetched before opening',
      live.lazy === 'idle' && live.off === null && live.text === '图片转图纸照片变成图纸' && live.h >= 64 && chunkResponses.length === 0, JSON.stringify(live))
    await outShot(q, 't1-home-cards')
    await pictureCard(q).click()
    await q.locator('.pd-pic-drop').waitFor({ timeout: 10000 })
    check('T1 opening the page fetches lib/client.picture.js from DSH once (200) and it runs', chunkResponses.join() === '200', chunkResponses.join())
    // measure once the page has slid in
    await q.evaluate(() => Promise.all(document.getAnimations().filter(a => a.animationName === 'pd-view-in').map(a => a.finished)))
    const empty = await q.evaluate(v => ({
      title: document.querySelector('.pd-head h2')?.textContent,
      back: !!document.querySelector('.pd-head .pd-ib'),
      zone: document.querySelector('.pd-pic-drop')?.textContent,
      accept: document.querySelector('.pd-pic-file')?.accept,
      note: document.querySelector('.pd-pic-note')?.textContent,
      square: (() => { const r = document.querySelector('.pd-pic-drop').getBoundingClientRect(); return Math.abs(r.width - r.height) < 1 && r.width <= 480 })(),
      zoneBox: (() => { const r = document.querySelector('.pd-pic-drop').getBoundingClientRect(); const s = document.querySelector('.pd-root').getBoundingClientRect(); return [r.width, r.height, s.width, s.height] })(),
      dashed: getComputedStyle(document.querySelector('.pd-pic-drop')).borderTopStyle,
      noteColor: getComputedStyle(document.querySelector('.pd-pic-note')).color,
      text3: getComputedStyle(document.querySelector('.pd-root')).getPropertyValue(v).trim(),
    }), cssVar('--pd-text-3'))
    check('T1 empty state: header 「图片转图纸」 with back, square dashed zone ≤ 480, 「拖入、粘贴或选择一张图片」/「选择图片」, accept image/*, the privacy note',
      empty.title === '图片转图纸' && empty.back && empty.square && empty.dashed === 'dashed' && empty.zone === '拖入、粘贴或选择一张图片选择图片' && empty.accept === 'image/*' && empty.note === '图片只在本机处理，不会上传', JSON.stringify(empty))
    await outShot(q, 't1-empty')
    // design I4: opened from the keyboard, focus is on the drop zone (with a visible ring), not the 1 px file input
    const pointerFocus = await focusDesc(q)
    await q.locator('.pd-head .pd-ib').first().click()
    await q.locator('.pd-v-home').waitFor()
    await pictureCard(q).focus()
    await q.keyboard.press('Enter')
    await q.locator('.pd-pic-drop').waitFor()
    await q.waitForFunction(() => document.activeElement?.closest('.pd-pic-drop, .pd-pic-file') || null, null, { timeout: 2000 }).catch(() => null)
    const keyFocus = await q.evaluate(() => { const a = document.activeElement; return { zone: a?.classList.contains('pd-pic-drop'), visible: a?.matches(':focus-visible'), tab: a?.tabIndex, hidden: !!a?.closest('[aria-hidden=true]'), ring: a ? getComputedStyle(a).outlineStyle : '' } })
    check('T1 I4 opened with Enter: focus on the drop zone (Tab-reachable, focus-visible), not the hidden file input', keyFocus.zone && keyFocus.visible && keyFocus.tab === 0 && !keyFocus.hidden, JSON.stringify({ keyFocus, pointerFocus }))
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
    // the alert is emptied, then written ~60 ms later (so a repeated error is read again)
    const says = want => q.waitForFunction(w => document.querySelector('#pd-pic-err')?.textContent === w, want, { timeout: 3000 }).then(() => true, () => false)
    await q.locator('.pd-pic-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello, not a picture') })
    await q.waitForTimeout(60)
    const shaking = await q.locator('.pd-pic-drop.pd-shake').count()
    await q.waitForTimeout(250)
    const err1 = { text: await alertText(), shook: shaking, after: await q.locator('.pd-pic-drop.pd-shake').count(), border: await q.locator('.pd-pic-drop').evaluate(e => getComputedStyle(e).borderTopColor) }
    check('T1 a text file: 「这个文件不是图片」, red border, a shake that ends', err1.text === '这个文件不是图片' && err1.shook === 1 && err1.after === 0, JSON.stringify(err1))
    await outShot(q, 't1-error-not-image')
    await q.locator('.pd-pic-file').setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>window.pdSvgRan=1</script><rect width="9" height="9"/></svg>') })
    await q.waitForTimeout(100)
    check('T1 C4 an SVG is never decoded: 「暂不支持 SVG，换成 PNG 或 JPG 试试」', await says('暂不支持 SVG，换成 PNG 或 JPG 试试') && await q.evaluate(() => !window.pdSvgRan), await alertText())
    // C4 / S5: the same error again is announced again — the live region is emptied, then rewritten
    await q.evaluate(() => {
      const a = document.querySelector('#pd-pic-err')
      window.pdSaid = []
      new MutationObserver(() => { window.pdSaid.push(a.textContent) }).observe(a, { childList: true, characterData: true, subtree: true })
    })
    await q.locator('.pd-pic-file').setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer: Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>') })
    await says('暂不支持 SVG，换成 PNG 或 JPG 试试')
    await q.waitForTimeout(100)
    const said = await q.evaluate(() => window.pdSaid)
    check('T1 C4 the same error twice (an SVG renamed .png): the alert is emptied, then says it again', JSON.stringify(said) === JSON.stringify(['', '暂不支持 SVG，换成 PNG 或 JPG 试试']), JSON.stringify(said))
    await q.locator('.pd-pic-file').setInputFiles({ name: 'clear.png', mimeType: 'image/png', buffer: png(64, 64, () => [0, 0, 0, 0]) })
    check('T1 C4 a fully transparent PNG: 「这张图几乎是透明的，换一张试试」, not loaded', await says('这张图几乎是透明的，换一张试试') && await q.locator('.pd-pic-crop').count() === 0, await alertText())
    await q.locator('.pd-pic-file').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: png(9000, 2, () => [0, 0, 0, 255]) })
    await q.waitForTimeout(100)
    check('T1 a 9000 px wide PNG: 「图片太大了，换一张小点的」 (from the header)', await says('图片太大了，换一张小点的'), await alertText())
    await q.locator('.pd-pic-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.concat([HEART.subarray(0, 40), Buffer.alloc(200)]) })
    await q.waitForTimeout(200)
    check('T1 a broken PNG: 「这张图打不开」', await says('这张图打不开'), await alertText())
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
    // b1 S9/S10/S6: one column under the crop frame, the alert centred, the slider says a percentage
    const column = await q.evaluate(() => {
      const c = document.querySelector('.pd-pic-crop').getBoundingClientRect()
      const off = [...document.querySelectorAll('.pd-pic > :not(.pd-sr)')].map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, l: r.left - c.left, r: r.right - c.right } }).filter(o => Math.abs(o.l) > 0.5 || Math.abs(o.r) > 0.5)
      const range = document.querySelector('.pd-pic input[type=range]')
      return { crop: c.width, panel: document.querySelector('.pd-pic').getBoundingClientRect().width, off, align: getComputedStyle(document.querySelector('#pd-pic-err')).textAlign, valuetext: range.getAttribute('aria-valuetext'), step: range.step }
    })
    check('b1 S9 the adjust column lines up with the crop frame (every row starts and ends where it does); S10 the alert is centred; S6 the slider reads a percentage, 5 % steps', column.off.length === 0 && column.align === 'center' && column.valuetext === '100%' && column.step === '0.05', JSON.stringify(column))
    // keyboard on the crop: + zooms, arrows pan
    await q.locator('.pd-pic-crop').focus()
    await q.keyboard.press('+')
    await q.keyboard.press('ArrowLeft')
    const zoom = Number(await q.locator('.pd-pic input[type=range]').inputValue())
    check('T1 + on the crop zooms in (1.25), arrows pan', Math.abs(zoom - 1.25) < 0.01, String(zoom))
    // I2: the zoom slider has a visible track in both themes: 4px, ≥3:1 on the page; the zoomed share in accent; a 16px thumb
    const range = q.locator('.pd-pic input[type=range]')
    await range.evaluate(e => { e.closest('.pd-pic')?.querySelector('.pd-pic-crop')?.focus() })
    for (const scheme of ['light', 'dark']) {
      await q.emulateMedia({ colorScheme: scheme })
      await q.waitForTimeout(350)
      const geo = await range.evaluate((e, v) => { const r = e.getBoundingClientRect(); return { w: r.width, accent: getComputedStyle(e).getPropertyValue(v).trim() } }, cssVar('--pd-accent'))
      const thumbX = 8 + (geo.w - 16) * (0.25 / 3)
      const look = sliderLook(decodePng(await range.screenshot({ animations: 'disabled' })), 2, thumbX)
      check(`T1 I2 zoom slider (${scheme}): track ≥3:1 on the page, the zoomed share in accent, a 16px thumb`, look.trackContrast >= 3 && contrast(look.filled, look.bg) >= 3 && Math.abs(look.thumbCss - 16) <= 1.5, JSON.stringify({ ...look, ...geo }))
      if (scheme === 'dark') await outShot(q, 't1-zoom-slider-dark')
    }
    await q.emulateMedia({ colorScheme: 'light' })
    await q.waitForTimeout(350)
    await q.keyboard.press('-')
    // I3: switching size keeps the old preview until the new cells exist; the label never pairs the new size with the old count
    await q.waitForTimeout(400)
    const label16 = await prev.getAttribute('aria-label')
    await prev.evaluate(c => { window.pdLabels = []; new MutationObserver(() => { window.pdLabels.push(c.getAttribute('aria-label')) }).observe(c, { attributes: true, attributeFilter: ['aria-label'] }) })
    await q.locator('.pd-pic [aria-pressed]', { hasText: '24×24' }).click()
    await q.waitForFunction(() => (document.querySelector('.pd-pic-prev canvas')?.getAttribute('aria-label') ?? '').startsWith('24×24'), null, { timeout: 3000 })
    await q.waitForTimeout(200)
    const labels = await q.evaluate(() => window.pdLabels)
    check('T1 I3 a new size: the 16×16 preview label stays until the 24×24 cells are ready, then changes once', labels.length === 1 && /^24×24 预览，共 \d+ 颗豆$/.test(labels[0] ?? '') && labels[0] !== label16?.replace('16×16', '24×24'), JSON.stringify({ label16, labels }))
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
    await q.locator('.pd-root [role=grid]').first().focus()
    const dropped = await q.evaluate(dropFile, ['.pd-board', b64(small), 'ball.png', 'image/png'])
    await q.locator('.pd-pic-crop').waitFor({ timeout: 5000 })
    const dropLoaded = await loadedState(q, '已载入图片')
    check('b2 D-I1 (zh) dropped while playing: focus on the crop frame (not the hidden file input), 「已载入图片」 in the status line', loadedOk(dropLoaded), JSON.stringify(dropLoaded))
    await outShot(q, 'b2-drop-loaded-zh')
    await q.waitForTimeout(800) // DSH adds a dropped file's card within a frame or two; give it far longer
    const panelCards = await q.evaluate(hostFileCards, 'ball.png')
    check('T1 a picture dropped on the panel (on the board) opens the page with it; the host never sees the drop (no DSH attachment)', dropped.dropPrevented && dropped.overPrevented && dropped.hostSaw.length === 0 && panelCards === 0, JSON.stringify({ ...dropped, panelCards }))
    // spec 00:58 rule 1: a picture is loaded, a non-image dropped on the panel is refused, the picture stays, the alert says why
    const errBox = () => q.evaluate(() => {
      const e = document.querySelector('#pd-pic-err')
      return e ? { h: Math.round(e.getBoundingClientRect().height), text: e.textContent } : null
    })
    const quiet = await errBox()
    await q.locator('.pd-pic-crop').evaluate(e => { e.dataset.e2eMark = '1' })
    const refused = await q.evaluate(dropFile, ['.pd-root', Buffer.from('hello, not a picture').toString('base64'), 'notes.txt', 'text/plain'])
    const refusedSaid = await q.waitForFunction(() => document.querySelector('#pd-pic-err')?.textContent === '这个文件不是图片', undefined, { timeout: 3000 }).then(() => true, () => false)
    const loud = await errBox()
    const kept = await q.evaluate(() => ({ crop: document.querySelectorAll('.pd-pic-crop[data-e2e-mark]').length, zone: document.querySelectorAll('.pd-pic-drop').length, prev: document.querySelectorAll('.pd-pic-prev canvas[role=img]').length }))
    // spec 03:30: the alert's row keeps one line all the time, so the slider below never moves (b4: it jumped 30 px)
    check('spec 00:58 一 / 03:30 a picture loaded, a text file dropped on the panel: the same picture stays, 「这个文件不是图片」 shows under it in the row kept for it (one line, the same height before and after)', refused.dropPrevented && refusedSaid && quiet?.h > 0 && quiet.text === '' && loud?.h === quiet.h && kept.crop === 1 && kept.zone === 0 && kept.prev === 1, JSON.stringify({ quiet, loud, kept, prevented: refused.dropPrevented }))
    await outShot(q, 'spec0058-refused-kept')
    // spec 03:30: moving the crop frame puts the refusal away; nothing below moves either way
    const sliderTop = () => q.evaluate(() => Math.round(document.querySelector('.pd-pic input[type=range]').getBoundingClientRect().top * 4) / 4)
    const topLoud = await sliderTop()
    await q.locator('.pd-pic-crop').focus()
    await q.keyboard.press('ArrowLeft')
    const cleared = await q.waitForFunction(() => document.querySelector('#pd-pic-err')?.textContent === '', undefined, { timeout: 2000 }).then(() => true, () => false)
    const afterPan = { box: await errBox(), top: await sliderTop() }
    check('spec 03:30 the refusal clears when the crop frame moves (arrow key); its row and the slider stay put', cleared && afterPan.box?.h === quiet.h && afterPan.top === topLoud, JSON.stringify({ topLoud, afterPan, quiet }))
    await q.locator('.pd-head .pd-ib').first().click()
    await q.locator('.pd-v-home').waitFor()
    await pictureCard(q).focus()
    const pasted = await q.evaluate(pasteFile, [':focus', b64(small), 'ball.png', 'image/png'])
    await q.locator('.pd-pic-crop').waitFor({ timeout: 5000 })
    check('T1 a picture pasted on the start page opens the page with it', pasted)
    const pasteLoaded = await loadedState(q, '已载入图片')
    check('b2 D-I1 (zh) pasted on the start page: focus on the crop frame, 「已载入图片」 said', loadedOk(pasteLoaded), JSON.stringify(pasteLoaded))
    // a second picture replacing the first, focus on 换一张's neighbour: back on the crop frame, said again
    await q.locator('.pd-pic-acts .pd-btn').first().focus()
    // record every text the status line shows (the image decodes asynchronously, so poll-free)
    await q.evaluate(() => {
      const el = document.querySelector('.pd-pic > [role=status]')
      const seen = (window.pdSaid = [])
      new MutationObserver(() => { seen.push(el?.textContent ?? null) }).observe(el, { childList: true, characterData: true, subtree: true })
    })
    await q.evaluate(pasteFile, [':focus', b64(png(200, 120, () => [215, 51, 59, 255])), 'red.png', 'image/png'])
    await q.waitForFunction(() => window.pdSaid.at(-1) === '已载入图片', null, { timeout: 5000 }).catch(() => {})
    const texts = await q.evaluate(() => window.pdSaid)
    const again = await loadedState(q, '已载入图片')
    check('b2 D-I1 (zh) a pasted replacement: status emptied then said again, focus on the crop frame', texts.indexOf('') >= 0 && texts.lastIndexOf('已载入图片') > texts.indexOf('') && loadedOk(again), JSON.stringify({ texts, ...again }))
    // paste in the chat input is DSH's, untouched
    await q.locator('.pd-head .pd-ib').first().click()
    const editor = q.locator('[contenteditable=true]').first()
    await editor.click()
    const chatPaste = await q.evaluate(pasteFile, ['[contenteditable=true]', b64(small), 'chat-paste.png', 'image/png'])
    await q.waitForTimeout(300)
    check('T1 a picture pasted into the chat input is left to DSH (the panel stays on the start page)', await q.locator('.pd-v-home').count() === 1 && await q.locator('.pd-pic').count() === 0, `defaultPrevented by host: ${chatPaste}`)
    // panel open: a file dropped on the chat input is still DSH's attachment, and the panel ignores it
    const openDrop = await q.evaluate(dropFile, ['[contenteditable=true]', b64(dot), 'chat-open.png', 'image/png'])
    const openCard = await q.waitForFunction(hostFileCards, 'chat-open.png', { timeout: 8000 }).then(() => true, () => false)
    check('T1 panel open: a file dropped on the chat input becomes a DSH attachment; the panel stays on the start page', openCard && openDrop.hostSaw.includes('drop') && await q.locator('.pd-v-home').count() === 1 && await q.locator('.pd-pic').count() === 0, JSON.stringify({ openCard, ...openDrop }))
    // (the chat paste above used another name, so a ball.png attachment could only come from the panel drop)
    check('T1 the file dropped on the panel never became a DSH attachment, then or later', await q.evaluate(hostFileCards, 'ball.png') === 0)
    // panel closed (its tab closed: the plugin unmounts and must leave nothing bound): DSH attaches as before
    const tabClose = await q.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role=tab], [role=tablist] > *, div, li')].filter(e => !e.closest('.pd-root, .pd-portal') && e.textContent?.trim() === '拼豆小憩' && e.querySelector('button'))
      const btn = tabs.at(-1)?.querySelector('button')
      btn?.setAttribute('data-e2e-close', '')
      return btn ? btn.getAttribute('aria-label') ?? btn.title : null
    })
    if (tabClose !== null) await q.locator('[data-e2e-close]').click()
    await q.waitForTimeout(500)
    const goneRoots = await q.locator('.pd-root').count()
    const closedAfter = await q.evaluate(dropFile, ['[contenteditable=true]', b64(dot), 'chat-after-close.png', 'image/png'])
    const afterCard = await q.waitForFunction(hostFileCards, 'chat-after-close.png', { timeout: 8000 }).then(() => true, () => false)
    check('T1 panel closed (tab closed, plugin unmounted): a file dropped on the chat input becomes a DSH attachment', tabClose !== null && goneRoots === 0 && afterCard && closedAfter.hostSaw.includes('drop'), JSON.stringify({ tabClose, goneRoots, afterCard, ...closedAfter }))
    await q.context().close()

    // ── b2 D-I1 in English (dark): drop on the start page, paste on the start page ──
    const qe = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' }, 'en')
    await startSession(qe, 'Hello', 'en')
    await openPanel(qe)
    const ball = b64(png(320, 320, (x, y) => ((x - 160) ** 2 + (y - 160) ** 2 < 110 ** 2 ? [98, 182, 233, 255] : [30, 32, 36, 255])))
    await pictureCard(qe).focus()
    await qe.evaluate(dropFile, ['.pd-v-home', ball, 'ball.png', 'image/png'])
    await qe.locator('.pd-pic-crop').waitFor({ timeout: 10000 })
    const enDrop = await loadedState(qe, 'Image loaded')
    check('b2 D-I1 (en) dropped on the start page: focus on the crop frame, “Image loaded” said', loadedOk(enDrop), JSON.stringify(enDrop))
    await outShot(qe, 'b2-drop-loaded-en-dark')
    await qe.locator('.pd-head .pd-ib').first().click()
    await qe.locator('.pd-v-home').waitFor()
    await pictureCard(qe).focus()
    const enPasted = await qe.evaluate(pasteFile, [':focus', ball, 'ball.png', 'image/png'])
    await qe.locator('.pd-pic-crop').waitFor({ timeout: 5000 })
    const enPaste = await loadedState(qe, 'Image loaded')
    check('b2 D-I1 (en) pasted on the start page: focus on the crop frame, “Image loaded” said', enPasted && loadedOk(enPaste), JSON.stringify(enPaste))
    await qe.context().close()

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
    // spec §18.6 / C6: after a failed load a picture dropped on the panel is swallowed and ignored (no reload)
    const failDrop = await f.evaluate(dropFile, ['.pd-root', b64(png(40, 40, () => [0, 0, 0, 255])), 'failed-panel.png', 'image/png'])
    await f.waitForTimeout(800)
    const failCards = await f.evaluate(hostFileCards, 'failed-panel.png')
    check('T1 load failed: a picture dropped on the panel is swallowed (no DSH attachment), nothing opens or reloads', failDrop.dropPrevented && failDrop.hostSaw.length === 0 && failCards === 0 && fetches === 2 && await f.locator('.pd-v-home').count() === 1, JSON.stringify({ ...failDrop, failCards, fetches }))
    // design D-C1: a pasted picture is ignored the same way (was: opened the page and fetched again)
    await pictureCard(f).focus()
    const failPaste = await f.evaluate(pasteFile, [':focus', b64(png(40, 40, () => [0, 0, 0, 255])), 'failed-paste.png', 'image/png'])
    await f.waitForTimeout(800)
    check('b2 D-C1 load failed: a picture pasted on the start page is ignored: nothing opens, no reload, no toast', !failPaste && fetches === 2 && await f.locator('.pd-v-home').count() === 1 && await f.locator('.pd-toast').count() === 0, JSON.stringify({ failPaste, fetches }))
    await outShot(f, 't1-card-failed')
    await cardsFit(f, 'zh-load-failed', undefined, [300, 420])
    await pictureCard(f).click()
    await f.locator('.pd-lazy[data-lazy=failed] button').waitFor({ timeout: 10000 })
    const fetchesOnPage = fetches
    await f.locator('.pd-lazy button').focus()
    const pagePaste = await f.evaluate(pasteFile, [':focus', b64(png(40, 40, () => [0, 0, 0, 255])), 'failed-page-paste.png', 'image/png'])
    await f.waitForTimeout(800)
    check('b2 D-C1 load failed: a picture pasted on the failed page is ignored too (only the retry button loads)', !pagePaste && fetches === fetchesOnPage && await f.locator('.pd-lazy[data-lazy=failed]').count() === 1 && await f.locator('.pd-toast').count() === 0, JSON.stringify({ pagePaste, fetches, fetchesOnPage }))
    mode = 'slow'
    await f.locator('.pd-lazy button').focus()
    await f.keyboard.press('Enter')
    await f.waitForTimeout(80)
    const early = await f.locator('.pd-skel').count()
    await f.waitForTimeout(220)
    const skel = await f.evaluate((v) => {
      const s = document.querySelector('.pd-skel')
      if (!s) return null
      const r = s.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(s).backgroundColor, surface: getComputedStyle(s).getPropertyValue(v).trim() }
    }, cssVar('--pd-surface'))
    check('T1 a slow chunk: no block before 150 ms, then a square --pd-surface skeleton (no spinner)', early === 0 && !!skel && skel.w === skel.h && skel.w > 100, JSON.stringify({ early, skel }))
    await outShot(f, 't1-skeleton', undefined, { text: false })
    await f.locator('.pd-pic-drop').waitFor({ timeout: 10000 })
    check('T1 Enter on the retry loads the page once the chunk is reachable', await f.locator('.pd-pic-drop').count() === 1 && await f.locator('.pd-toast').count() === 0, `fetches ${fetches}`)
    await f.context().close()
    // spec 00:58 rule 2: a picture dropped while the chunk loads, then the load fails: the retry opens an empty page
    const g = await newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' })
    let gMode = 'fail'
    await g.route(CHUNK, async (route) => {
      if (gMode === 'fail') { await new Promise((r) => { setTimeout(r, 600) }); return route.abort('internetdisconnected') }
      return route.continue()
    })
    await startSession(g, '看看 README')
    await openPanel(g)
    const gDrop = await g.evaluate(dropFile, ['.pd-root', b64(png(40, 40, () => [0, 0, 0, 255])), 'before-fail.png', 'image/png'])
    const loadingSeen = await g.locator('.pd-lazy[data-lazy=loading]').count()
    await g.locator('.pd-lazy[data-lazy=failed] button').waitFor({ timeout: 10000 })
    gMode = 'ok'
    await g.locator('.pd-lazy button').click()
    await g.locator('.pd-pic-drop, .pd-pic-crop').first().waitFor({ timeout: 10000 })
    await g.waitForTimeout(400)
    const afterRetry = await g.evaluate(() => ({ crop: document.querySelectorAll('.pd-pic-crop').length, zone: document.querySelectorAll('.pd-pic-drop').length, alert: document.querySelector('#pd-pic-err')?.textContent }))
    check('spec 00:58 二 a picture dropped while the chunk loads, the load fails: after the retry the page is empty (the picture does not come back)', gDrop.dropPrevented && loadingSeen === 1 && afterRetry.crop === 0 && afterRetry.zone === 1 && afterRetry.alert === '', JSON.stringify({ prevented: gDrop.dropPrevented, loadingSeen, afterRetry }))
    await outShot(g, 'spec0058-retry-empty')
    await g.context().close()
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
        // spec §18.6 / C6: a picture dropped on the panel is still the panel's (never a chat attachment), and ignored
        const pic = b64(png(40, 40, () => [0, 0, 0, 255]))
        const offDrop = await u.evaluate(dropFile, ['.pd-root', pic, 'off-panel.png', 'image/png'])
        await u.waitForTimeout(800)
        const offCards = await u.evaluate(hostFileCards, 'off-panel.png')
        check('T1 no require.async: a picture dropped on the panel is swallowed (no DSH attachment) and nothing opens', offDrop.dropPrevented && offDrop.hostSaw.length === 0 && offCards === 0 && await u.locator('.pd-v-home').count() === 1 && await u.locator('.pd-lazy, .pd-pic').count() === 0 && asked === 0, JSON.stringify({ ...offDrop, offCards }))
        const offChat = await u.evaluate(dropFile, ['[contenteditable=true]', pic, 'off-chat.png', 'image/png'])
        const offChatCard = await u.waitForFunction(hostFileCards, 'off-chat.png', { timeout: 8000 }).then(() => true, () => false)
        check('T1 no require.async: a picture dropped on the chat input is still a DSH attachment', offChatCard && offChat.hostSaw.includes('drop'), JSON.stringify({ offChatCard, ...offChat }))
      }
      await outShot(u, `t1-unsupported-${lang}`)
      await cardsFit(u, `${lang}-unsupported`, undefined, [300, 420])
      await u.locator('.pd-start .pd-big').first().click()
      await u.locator('.pd-board').waitFor({ timeout: 5000 })
      for (let i = 0; i < 3; i++) await u.locator('.pd-board .pd-cell').nth(i * 17).click()
      check(`T1 (${lang}) no require.async: free play still works`, await u.locator('.pd-board .pd-cell .pd-bead').count() >= 3)
      await u.context().close()
    }
  }

  if (ONLY === 't1') break sections
  log('W. my works (spec §18.4)')
  await worksSection()
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
  const pillGo = await hitBox(p, '.pd-pill .pd-pill-go')
  check('R3-6 pill main button 「打开拼豆小憩」 hit area ≥ 32 high (and still ends where the × begins)', !!pillGo && pillGo.h >= 32 && pillGo.w >= 32, JSON.stringify({ pillGo, pillX }))
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
  const t3 = await p.evaluate(v => getComputedStyle(document.querySelector('.pd-root')).getPropertyValue(v).trim(), cssVar('--pd-text-3'))
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
  // The section-A chat turn streams for FAKE_LLM_CHAT_MS and then ends on the host's clock, which
  // turns the entry's busy dot off. Left alone that happens somewhere in C/D, depending on machine
  // speed, so two runs of the same build crop a different entry (det. run m-1/m-2: ai-filled-light).
  // Pin it instead: every B shot is taken while the turn still runs (asserted), and C starts once
  // it has ended (waited for), so each crop's entry state is the same in every run.
  check('B shots all show the busy entry: the section-A turn is still running at the end of B', await p.locator('.pd-entry.pd-busy').count() === 1)
  await p.locator('.pd-entry.pd-busy').waitFor({ state: 'detached', timeout: 60000 })
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
    const bw = await p.evaluate(([cellVar, nVar]) => {
      const b = document.querySelector('.pd-board')
      return { w: Math.round(b.getBoundingClientRect().width), cell: getComputedStyle(b).getPropertyValue(cellVar), n: Number(getComputedStyle(b).getPropertyValue(nVar)) }
    }, [cssVar('--pd-cell'), cssVar('--pd-n')])
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
    await cardsFit(p, 'zh', undefined, [300, 360])
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
  await cardsFit(e1, 'en', undefined, [300, 360, 640])
  // counter-proof (b3 一): the cut rule sees a clamped subtitle (a long one put in for a moment at 300 px)
  await e1.evaluate(() => { document.querySelector('.pd-root').style.width = '300px'; const d = document.querySelector('.pd-start .pd-big b + span'); d.dataset.was = d.textContent; d.textContent = 'Blank board, anything goes, every bead wherever you like' })
  await e1.waitForTimeout(300)
  const clamped = (await e1.evaluate(`(${startCards})(${lines}, ${splitWords})`))[0]
  await e1.evaluate(() => { const d = document.querySelector('.pd-start .pd-big b + span'); d.textContent = d.dataset.was; delete d.dataset.was; document.querySelector('.pd-root').style.width = '' })
  check('b3 一 counter-proof: a subtitle past two lines is caught as cut (scrollHeight > clientHeight)', clamped.subCut && clamped.subShown === 2, JSON.stringify(clamped))
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
    ringsChecked.push(...await j.evaluate((gcVar) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside the page, no outer scope there
      const lum = (c) => { const ch = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] }
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
      const board = getComputedStyle(document.querySelector('.pd-board')).backgroundColor
      const seen = new Map()
      for (const cell of document.querySelectorAll('.pd-cell.pd-g')) {
        const shadow = getComputedStyle(cell, '::after').boxShadow
        const ring = /rgba?\([^)]*\)/.exec(shadow)?.[0]
        const gc = cell.style.getPropertyValue(gcVar)
        if (!seen.has(gc)) seen.set(gc, { gc, ring, board, ratio: ring ? Math.round(ratio(ring, board) * 100) / 100 : 0 })
      }
      return [...seen.values()]
    }, cssVar('--pd-gc')))
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

  // ── K. O3 / §18.5: every colour's guide ring measured on the real page, light and dark, at 2× and 1× ──
  log('K. guide rings (spec §18.5)')
  await guideRingSection()
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
  rmSync(CLOCK_FILE, { force: true })
  await llm.close()
}
const failed = checks.filter(c => !c.ok)
log(failed.length ? `\n${failed.length} check(s) failed` : `\nall ${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
