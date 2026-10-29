// Audit R-2 and R-8: every e2e run gets its own output dir, DSH home and workspace (all under its
// TMPDIR unless set), a second run on the same dirs is refused before it writes anything, and a
// home left by an earlier run never reaches the next one.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { claimOut, freshHome, runDirs } from '../e2e/run-dirs.mjs'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'run-dirs-'))
const suite = readFileSync(new URL('../e2e/suite.mjs', import.meta.url), 'utf8')

describe('e2e run dirs (audit R-8: two runs of one checkout share nothing)', () => {
  it('output, home and workspace follow TMPDIR; two TMPDIRs give disjoint dirs; ports default to 0 (free)', () => {
    const a = runDirs({}, '/t/a')
    const b = runDirs({}, '/t/b')
    expect(a).toEqual({ out: '/t/a/pindou-e2e-out', home: '/t/a/pindou-e2e-home', ws: '/t/a/pindou-e2e-ws', dshPort: 0, llmPort: 0 })
    for (const k of ['out', 'home', 'ws'] as const) expect(a[k]).not.toBe(b[k])
    expect(runDirs({ E2E_OUT: '/o', E2E_DSH_HOME: '/h', E2E_WS: '/w', E2E_DSH_PORT: '4790', E2E_LLM_PORT: '4791' }, '/t/a'))
      .toEqual({ out: '/o', home: '/h', ws: '/w', dshPort: 4790, llmPort: 4791 })
    expect(() => runDirs({ E2E_DSH_PORT: 'x' })).toThrow(/not a port/)
  })

  it('the suite takes its dirs and ports from runDirs, not from the checkout', () => {
    expect(suite).not.toMatch(/join\(REPO, 'e2e\/\.out'\)/)
    expect(suite).toMatch(/const DIRS = runDirs\(\)/)
    expect(suite).toMatch(/'--port', String\(DIRS\.dshPort\)/)
    expect(suite).toMatch(/startFakeLlm\(\{ port: DIRS\.llmPort/)
    expect(suite).toMatch(/claimOut\(OUT\)/)
    expect(suite).toMatch(/await freshHome\(/)
  })

  it('a second run on the same output dir is refused while the first lives; a dead run\'s lock is taken over', async () => {
    const out = join(tmp(), 'out')
    const release = claimOut(out)
    expect(() => claimOut(out, process.pid + 1)).toThrow(/another e2e run/)
    release()
    expect(existsSync(join(out, '.run.lock'))).toBe(false)
    // a lock left by a process that is gone
    const dead = spawn(process.execPath, ['-e', ''])
    await new Promise(r => { dead.on('exit', r) })
    writeFileSync(join(out, '.run.lock'), String(dead.pid))
    const mine = claimOut(out)
    expect(readFileSync(join(out, '.run.lock'), 'utf8')).toBe(String(process.pid))
    mine()
  })
})

describe('fresh home per run (audit R-2: a reused home failed the next run at its first session)', () => {
  it('the previous home is set aside as .prev, the workspace starts empty, an older .prev is replaced', async () => {
    const t = tmp()
    const home = join(t, 'home')
    const ws = join(t, 'ws')
    mkdirSync(join(home, 'sessions'), { recursive: true })
    writeFileSync(join(home, 'sessions', 'old.json'), '{}')
    mkdirSync(`${home}.prev`)
    writeFileSync(join(`${home}.prev`, 'older'), '')
    mkdirSync(ws)
    writeFileSync(join(ws, 'left-over.txt'), '')
    await freshHome({ home, ws, bin: '/no/such/dsh-bin.js' })
    expect(existsSync(home)).toBe(false)
    expect(readdirSync(join(`${home}.prev`, 'sessions'))).toEqual(['old.json'])
    expect(existsSync(join(`${home}.prev`, 'older'))).toBe(false)
    expect(readdirSync(ws)).toEqual(['README.md'])
  })
})
