// End-to-end run against DSH Web started from source.
//
//   node e2e/run.mjs            # screenshots + GIF into docs/assets, logs into e2e/.out
//
// Needs a DeepSeek Harness checkout (DSH_SRC, default /home/box/src/deepseek-harness,
// built with `pnpm build`) and a Chrome/Chromium (CHROME, default /usr/bin/google-chrome).
// Everything runs in throwaway dirs under the OS temp dir: DSH_HOME, the workspace,
// and a fake Messages-API LLM (e2e/fake-llm.mjs). No real API key is used.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { startFakeLlm } from './fake-llm.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_SRC = process.env.DSH_SRC ?? '/home/box/src/deepseek-harness'
const DSH_BIN = join(DSH_SRC, 'apps/cli/lib/bin.js')
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome'
const DSH_HOME = process.env.E2E_DSH_HOME ?? join(tmpdir(), 'pindou-e2e-home')
const WS = join(tmpdir(), 'pindou-e2e-ws')
const OUT = join(REPO, 'e2e/.out')
const ASSETS = join(REPO, 'docs/assets')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'

const log = (...a) => { process.stdout.write(`${a.join(' ')}\n`) }
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  log(ok ? '  ✓' : '  ✗', name, detail)
}

mkdirSync(OUT, { recursive: true })
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

async function newPage(opts) {
  const ctx = await browser.newContext({ locale: 'zh-CN', deviceScaleFactor: 2, ...opts })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { pageErrors.push(String(e)) })
  p.on('console', (m) => { if (m.type() === 'error' && /pindou/i.test(m.text())) pageErrors.push(m.text()) })
  await p.goto(url)
  await p.getByRole('button', { name: '选择工作区' }).waitFor({ timeout: 30000 })
  await p.waitForTimeout(600)
  const notice = p.locator('button', { hasText: /^(继续|Continue)$/ })
  if (await notice.count()) await notice.first().click()
  return p
}

async function startSession(p, text) {
  await p.getByRole('button', { name: '选择工作区' }).click()
  await p.waitForTimeout(500)
  // first run: directory picker; later runs: a menu of known workspaces
  const known = p.getByRole('button', { name: basename(WS), exact: true })
  if (await known.count()) {
    await known.last().click()
  } else {
    const add = p.locator('button', { hasText: '添加工作区…' })
    if (await add.count()) await add.last().click()
    await p.getByRole('button', { name: '编辑路径' }).click()
    const input = p.locator('input:focus')
    await input.fill(WS)
    await input.press('Enter')
    await p.waitForTimeout(500)
    await p.getByRole('button', { name: '打开', exact: true }).click()
  }
  await p.waitForTimeout(800)
  const editor = p.locator('[contenteditable=true]').first()
  await editor.click()
  await p.keyboard.type(text)
  await p.keyboard.press('Enter')
  await p.locator('.pd-entry').waitFor({ timeout: 15000 })
}

const shot = async (p, name, opts) => {
  await p.screenshot({ path: join(ASSETS, `${name}.png`), ...opts })
  log('  📷', `docs/assets/${name}.png`)
}
const panelBox = p => p.locator('.pd-root').boundingBox()

try {
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
    await shot(p, 'coach-light')
    await coach.first().click()
    await p.waitForTimeout(300)
  }
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
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(300); await frame() }
  await shot(p, 'complete-light')
  const iron = p.locator('button.pd-warm[data-primary], .pd-foot button.pd-warm').first()
  await iron.click()
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(250); await frame() }
  await p.waitForTimeout(1200)
  for (let i = 0; i < 6; i++) await frame()
  await shot(p, 'ironed-light')
  check('ironing reaches the result card', await p.locator('button.pd-primary[data-primary]').count() === 1)
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
  await shot(p, 'home-dark')

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

  // ── E. wide panel (split view) ──
  log('E. wide')
  await p.locator('.pd-head .pd-ib').first().click()
  const full = p.getByRole('button', { name: '全屏' })
  if (await full.count()) {
    await full.first().click()
    await p.waitForTimeout(800)
    const w = (await panelBox(p))?.width ?? 0
    const cols = await p.evaluate(() => getComputedStyle(document.querySelector('.pd-tpls')).gridTemplateColumns.split(' ').length)
    check('≥560px panel shows 4 template columns', w >= 560 && cols === 4, `width=${Math.round(w)} cols=${cols}`)
    await shot(p, 'home-wide-light')
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

  check('no page errors from the plugin', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} finally {
  writeFileSync(join(OUT, 'dsh.log'), dshLog.replace(/token=[^&\s]+/g, 'token=…'))
  writeFileSync(join(OUT, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
  dsh.kill('SIGTERM')
  await llm.close()
}
const failed = checks.filter(c => !c.ok)
log(failed.length ? `\n${failed.length} check(s) failed` : `\nall ${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
