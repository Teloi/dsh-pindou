#!/usr/bin/env node
// Release pack: the npm tarball, with README images and links pinned to the release ref.
//
// The repository keeps relative paths (GitHub resolves them per branch/tag). npmjs.com
// rewrites relative <img src> and links to the default branch (HEAD) and leaves
// <source srcset> relative, so the packed README.md / README.en.md get absolute URLs
// at --ref instead (scripts/npm-readme.ts): images on raw.githubusercontent.com,
// links on github.com/<slug>/blob|tree/<ref>/. Every pinned path must exist in the
// commit; anything relative left in a packed README fails the run (exit 1).
//
// Nothing in the working tree is touched: the committed tree at HEAD is exported with
// `git archive` into a staging directory, rewritten there and packed with
// `npm pack --ignore-scripts`. The result depends only on the commit and --ref.
//
// Usage (Node >= 22.18, it imports a .ts module):
//   pnpm pack:npm --ref v0.2.1 --out DIR        # final pack; the tag is v<version>, at HEAD or not created yet
//   pnpm pack:npm --ref <commit sha> --out DIR  # preview; the sha must be HEAD
//   pnpm pack:npm --verify DIR/dsh-pindou-x.y.z.tgz --ref v0.2.1 --commit <sha>   # audit a tarball
// Then publish exactly that file: `npm publish DIR/dsh-pindou-x.y.z.tgz --ignore-scripts --access public`.
// (A plain `npm publish` from the directory is refused by the prepublishOnly guard in package.json.)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { githubSlug, packedReadmeProblems, pinReadme, rawBase } from './npm-readme.ts'

const READMES = ['README.md', 'README.en.md']
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
class Fail extends Error {}

function parseArgs(argv) {
  const known = new Set(['--ref', '--out', '--verify', '--commit'])
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    const value = argv[i + 1]
    if (!known.has(name)) throw new Fail(`unknown argument ${name}`)
    if (value === undefined || value.startsWith('--')) throw new Fail(`${name} needs a value`)
    out[name.slice(2)] = value
  }
  if (!out.ref) throw new Fail('--ref <tag or commit> is required')
  if (out.commit && !out.verify) throw new Fail('--commit only goes with --verify')
  return out
}

function resolveCommit(rev) {
  try { return git('rev-parse', '--verify', '--quiet', `${rev}^{commit}`) } catch { return '' }
}

/** blob/tree of `path` in `commit`; throws when it is not there. */
function objectTypeAt(commit, name) {
  return (path) => {
    let type = ''
    try { type = git('cat-file', '-t', `${commit}:${path}`) } catch { /* missing */ }
    if (type !== 'blob' && type !== 'tree') throw new Fail(`${name}: "${path || '.'}" is not in commit ${commit}`)
    return type
  }
}

/** pinReadme() plus an existence check of every pinned path in `commit`. */
function pinAt(md, name, slug, ref, commit) {
  const objectType = objectTypeAt(commit, name)
  const { text, paths } = pinReadme(md, { slug, ref, objectType })
  for (const { path, kind } of paths) {
    if (kind === 'image' && objectType(path) !== 'blob') throw new Fail(`${name}: image "${path}" is not a file in commit ${commit}`)
  }
  return text
}

/** Fails unless the packed READMEs pass the check (and, with a commit, equal its pinned READMEs). */
function verify(tgz, slug, ref, commit) {
  for (const name of READMES) {
    const packed = execFileSync('tar', ['-xOzf', tgz, `package/${name}`], { encoding: 'utf8' })
    const problems = packedReadmeProblems(packed, slug, ref)
    if (problems.length) throw new Fail(`${tgz} ${name}:\n  ${problems.join('\n  ')}`)
    if (!packed.includes(rawBase(slug, ref))) throw new Fail(`${tgz} ${name}: no image pinned to ${ref}`)
    if (commit) {
      const committed = execFileSync('git', ['show', `${commit}:${name}`], { encoding: 'utf8' })
      if (packed !== pinAt(committed, name, slug, ref, commit)) throw new Fail(`${tgz} ${name} differs from the pinned README of ${commit}`)
    }
  }
  const sha512 = createHash('sha512').update(readFileSync(tgz)).digest('base64')
  process.stdout.write(`ok   ${tgz}\n     README images and links pinned to ${ref}${commit ? ` (commit ${commit})` : ''}\n     integrity sha512-${sha512}\n`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const slug = githubSlug(pkg.repository)
  rawBase(slug, args.ref) // rejects an unsafe ref early

  if (args.verify) {
    let commit = ''
    if (args.commit) {
      commit = resolveCommit(args.commit)
      if (!commit) throw new Fail(`--commit ${args.commit} is not a commit here`)
      const tagged = resolveCommit(args.ref)
      if (tagged && tagged !== commit) throw new Fail(`--ref ${args.ref} is ${tagged} here, not --commit ${commit}`)
    }
    verify(resolve(args.verify), slug, args.ref, commit)
    return
  }

  if (git('status', '--porcelain')) throw new Fail('working tree is not clean; commit or stash first')
  const head = git('rev-parse', 'HEAD')
  const resolved = resolveCommit(args.ref)
  if (resolved && resolved !== head) throw new Fail(`--ref ${args.ref} is ${resolved}, but HEAD is ${head}`)
  if (!resolved && args.ref !== `v${pkg.version}`) throw new Fail(`--ref ${args.ref} does not resolve; only the release tag v${pkg.version} may be created after packing`)
  if (!resolved) console.warn(`note: tag ${args.ref} does not exist yet; create it at ${head} and push it before publishing`)

  const stage = mkdtempSync(join(tmpdir(), 'pack-npm-'))
  try {
    const tree = join(stage, 'tree')
    mkdirSync(tree)
    execFileSync('git', ['archive', '--format=tar', '-o', join(stage, 'tree.tar'), head])
    execFileSync('tar', ['-xf', join(stage, 'tree.tar'), '-C', tree])
    for (const name of READMES) {
      writeFileSync(join(tree, name), pinAt(readFileSync(join(tree, name), 'utf8'), name, slug, args.ref, head))
    }
    const out = resolve(args.out ?? '.')
    mkdirSync(out, { recursive: true })
    const [info] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: tree, encoding: 'utf8' }))
    verify(join(out, info.filename), slug, args.ref, head)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

try {
  main()
} catch (err) {
  console.error(`pack-npm: ${err instanceof Fail ? err.message : err?.stack ?? err}`)
  process.exitCode = 1
}
