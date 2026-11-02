#!/usr/bin/env node
/**
 * Control for the strict tile judgement (not part of the default e2e): it must FAIL on a44692b, the last commit
 * that built tiles at a power-of-two px per cell and scaled them nearest-neighbour (1.5×: 32 → 24 device px).
 *
 * Usage (from this repo, on a quiet machine — it drives Chrome for about a minute):
 *   git worktree add --detach /tmp/wt-a44692b a44692b
 *   ln -s "$PWD/node_modules" /tmp/wt-a44692b/node_modules
 *   (cd /tmp/wt-a44692b && pnpm run build)            # lib/ is tracked; the build only refreshes it
 *   CHROME=/usr/bin/google-chrome node e2e/repro/strict-judge-a44692b.mjs /tmp/wt-a44692b [shots-dir]
 *   git worktree remove --force /tmp/wt-a44692b
 *
 * It copies this checkout's e2e/suite.mjs and compare-shots.mjs into the a44692b worktree, runs E2E_ONLY=tg there
 * (screenshots to shots-dir, default ../dsh-pindou-selfcheck/v03-phase2-shots/a44692b), puts the worktree's own
 * files back and exits 0 only when the control reproduces:
 *   - 1.5×: the bead symmetry check fails (board gap 2 px left/top, 1 px right/bottom; row/column 1 dropped,
 *     rows like 001111112222222211111110) and the tile-boundary block check fails;
 *   - 1.25×: the bead symmetry check fails (rows 2 and 7 not mirrored);
 *   - 2× and 1×: those two pass (whole multiples there already).
 * Recorded run (2026-11-01 PST, before the earlier mid half was removed): dsh-pindou-selfcheck/v03-phase2/
 * tg-a44692b-strict.log (13 checks failed). Fixed reference pictures (written by the first run of this script):
 * v03-phase2-shots/a44692b/tile-gap-full-dpr1.5.png and tile-gap-mid-dpr1.5.png; compare with the new head's
 * v03-phase2-shots/tile-gap-full-dpr1.5.png (board gap 1 px each side, bead mirror-symmetric).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wt = process.argv[2]
if (!wt) { console.error('usage: node e2e/repro/strict-judge-a44692b.mjs <a44692b worktree> [shots-dir]'); process.exit(2) }
const head = spawnSync('git', ['-C', wt, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
if (!head.startsWith('a44692b')) { console.error(`expected a worktree at a44692b, found ${head || 'none'}`); process.exit(2) }
const shots = resolve(process.argv[3] ?? join(here, '..', '..', 'dsh-pindou-selfcheck', 'v03-phase2-shots', 'a44692b'))
mkdirSync(shots, { recursive: true })
for (const f of ['suite.mjs', 'compare-shots.mjs']) copyFileSync(join(here, f), join(wt, 'e2e', f))
let out = ''
try {
  const r = spawnSync(process.execPath, ['e2e/run.mjs'], { cwd: wt, encoding: 'utf8', env: { ...process.env, E2E_ONLY: 'tg', E2E_BIG_SHOTS: shots }, maxBuffer: 1 << 28 })
  out = `${r.stdout}${r.stderr}`
} finally {
  spawnSync('git', ['-C', wt, 'checkout', '--', 'e2e/suite.mjs', 'e2e/compare-shots.mjs'])
}
writeFileSync(join(shots, 'tg-a44692b-strict.log'), out)
const failed = re => out.split('\n').some(l => l.startsWith('  ✗') && re.test(l))
const passed = re => out.split('\n').some(l => l.startsWith('  ✓') && re.test(l))
const want = [
  ['1.5× bead symmetry fails', failed(/BIG tiles @1\.5×: filled at 16 px\/cell/)],
  ['1.5× tile-boundary blocks fail', failed(/BIG tiles @1\.5×: strict filled frame — at tile boundaries/)],
  ['1.25× bead symmetry fails', failed(/BIG tiles @1\.25×: filled at 16 px\/cell/)],
  ['2× bead symmetry passes', passed(/BIG tiles @2×: filled at 16 px\/cell/)],
  ['1× bead symmetry passes', passed(/BIG tiles @1×: filled at 16 px\/cell/)],
]
for (const [name, ok] of want) process.stdout.write(`${ok ? '✓' : '✗'} ${name}\n`)
process.stdout.write(`log: ${join(shots, 'tg-a44692b-strict.log')}\n`)
process.exit(want.every(([, ok]) => ok) ? 0 : 1)
