// pack-npm.mjs imports scripts/npm-readme.ts directly, which needs Node's built-in
// type stripping: on by default from 22.18 (22.x) and 23.6 (23.x). Kept in plain
// JavaScript so the check itself runs, and says so, on any older Node.

/** An error message when `version` (process.versions.node) cannot run pack:npm, else ''. */
export function nodeVersionProblem(version) {
  const [major = 0, minor = 0] = String(version).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const ok = major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18)
  return ok ? '' : `pack:npm 需要 Node >= 22.18，当前 ${version} / pack:npm needs Node >= 22.18 (it imports a .ts module); this is ${version}`
}
