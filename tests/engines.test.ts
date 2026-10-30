// engines.dsh must admit the DSH builds people actually run. DSH 0.2.1-rc.3 ships inside the
// desktop app and 0.2.1-rc.5 was npm `latest` when this was written; an `>=0.2.1` range refused both.
// DSH compares with semver.satisfies(version, range, { includePrerelease: true })
// (packages/boot/app-boot/src/plugin-compatibility.ts:51-52 at tag dsh-v0.2.1-rc.3), so the
// same call is made here with the same library.
import { readFileSync } from 'node:fs'
import semver from 'semver'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { engines: { dsh: string } }
const range = pkg.engines.dsh
const admits = (version: string): boolean => semver.satisfies(version, range, { includePrerelease: true })

describe('engines.dsh, compared the way DSH compares it', () => {
  it.each(['0.2.1-rc.3', '0.2.1-rc.5', '0.2.1', '0.2.2-alpha.2', '0.3.0'])('admits DSH %s', (version) => {
    expect(admits(version), `${range} should admit ${version}`).toBe(true)
  })

  it.each(['0.2.1-rc.2', '0.2.1-rc.0', '0.2.0', '0.1.9'])('refuses DSH %s', (version) => {
    expect(admits(version), `${range} should refuse ${version}`).toBe(false)
  })
})
