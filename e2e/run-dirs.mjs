// Where one e2e run keeps its files, and how it starts clean (audit R-2, R-8).
//
// Every path follows TMPDIR unless set on its own, so two runs with their own TMPDIR share nothing,
// even from one checkout (before, screenshots went to <checkout>/e2e/.out: two runs of one
// worktree overwrote each other's shots between writing and copying them).
//   E2E_OUT       screenshots, audits, logs   (default $TMPDIR/pindou-e2e-out)
//   E2E_DSH_HOME  the DSH home                (default $TMPDIR/pindou-e2e-home)
//   E2E_WS        the DSH workspace           (default $TMPDIR/pindou-e2e-ws)
//   E2E_DSH_PORT, E2E_LLM_PORT                (default 0: a free port each)
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const port = (v, name) => {
  const n = Number(v ?? 0)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${name}=${v} is not a port`)
  return n
}

export function runDirs(env = process.env, tmp = tmpdir()) {
  const at = (key, name) => (env[key] ? resolve(env[key]) : join(tmp, name))
  return {
    out: at('E2E_OUT', 'pindou-e2e-out'),
    home: at('E2E_DSH_HOME', 'pindou-e2e-home'),
    ws: at('E2E_WS', 'pindou-e2e-ws'),
    dshPort: port(env.E2E_DSH_PORT, 'E2E_DSH_PORT'),
    llmPort: port(env.E2E_LLM_PORT, 'E2E_LLM_PORT'),
  }
}

const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

/** One run per output dir: a second run on it (same TMPDIR or E2E_OUT) stops before writing anything. */
export function claimOut(out, pid = process.pid) {
  mkdirSync(out, { recursive: true })
  const lock = join(out, '.run.lock')
  for (let tries = 0; ; tries++) {
    try {
      writeFileSync(lock, String(pid), { flag: 'wx' })
      return () => { try { if (readFileSync(lock, 'utf8') === String(pid)) rmSync(lock) } catch { /* already gone */ } }
    } catch (e) {
      if (e.code !== 'EEXIST' || tries) throw e
      const holder = Number(readFileSync(lock, 'utf8'))
      if (holder && holder !== pid && alive(holder)) throw new Error(`another e2e run (pid ${holder}) is writing to ${out}: give each run its own TMPDIR or E2E_OUT`, { cause: e })
      rmSync(lock, { force: true }) // left by a run that was killed
    }
  }
}

/** The DSH servers (by their bin) running on exactly this home, with the command line of each one's parent. */
export function dshOnHome(home, bin) {
  const found = []
  for (const pid of existsSync('/proc') ? readdirSync('/proc').filter(d => /^\d+$/.test(d)) : []) {
    try {
      const env = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (!cmd.includes(bin) || !env.includes(`DSH_HOME=${home}`)) continue
      const parent = readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) \S+ /, '').split(' ')[0]
      let owner = ''
      try { owner = readFileSync(`/proc/${parent}/cmdline`, 'utf8').replaceAll('\0', ' ') } catch { /* parent gone: an orphan */ }
      found.push({ pid: Number(pid), owner })
    } catch { /* gone, or not ours to read */ }
  }
  return found
}

/**
 * A fresh DSH home and workspace for this run. A reused home failed the next run at its first
 * session: after a passed run (audit R-2, runs run2 and run3: the host clock starts again at the
 * fixed instant, so this run's workspace pick is older than the last run's and the host ignores it)
 * and after a run killed mid-session (k9-rerun, k9b-rerun, k9c-rerun 06:25–06:34, 3 of 3: a draft
 * with no workspace). The previous home is kept as <home>.prev.
 * A DSH still serving this home: if its e2e run is alive, refuse (never stop another run's server);
 * an orphan (its run was SIGKILLed or crashed) is stopped, and waited for.
 */
export async function freshHome({ home, ws, bin, log = () => {} }) {
  for (const { pid, owner } of dshOnHome(home, bin)) {
    if (/e2e\/(run|suite)\.mjs/.test(owner)) throw new Error(`another e2e run (${owner.trim()}) is using ${home}: give each run its own TMPDIR`)
    log('stopping a leftover DSH server on this home, pid', pid)
    process.kill(pid, 'SIGTERM')
    for (let i = 0; existsSync(`/proc/${pid}`); i++) {
      if (i === 100) throw new Error(`leftover DSH server ${pid} on ${home} did not exit in 10 s`)
      await new Promise(r => { setTimeout(r, 100) })
    }
  }
  if (existsSync(home)) {
    rmSync(`${home}.prev`, { recursive: true, force: true })
    renameSync(home, `${home}.prev`)
    log('previous run\'s DSH home kept as', `${home}.prev`)
  }
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'README.md'), '# e2e workspace\n')
}
