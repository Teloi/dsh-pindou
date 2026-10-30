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
// verify (also run on every fresh pack) unpacks the tarball and requires, against
// --commit: exactly the file list `npm pack` makes from that commit's `git archive`
// (no file more, none missing, only regular files under package/), every file other
// than the READMEs byte-for-byte equal to the commit (package.json included; npm pack
// does not rewrite it), and each README byte-for-byte equal to the commit's README
// pinned to --ref. Without --commit only the README pinning check runs.
//
// Usage (Node >= 22.18, it imports a .ts module; older Node gets a plain error):
//   pnpm pack:npm --ref v0.2.1 --out DIR        # final pack; the tag is v<version>, at HEAD or not created yet
//   pnpm pack:npm --ref <commit sha> --out DIR  # preview; the sha must be HEAD
//   pnpm pack:npm --verify DIR/dsh-pindou-x.y.z.tgz --ref v0.2.1 --commit <sha>   # audit a tarball
// Then publish exactly that file: `npm publish DIR/dsh-pindou-x.y.z.tgz --ignore-scripts --access public`.
// (A plain `npm publish` from the directory is refused by the prepublishOnly guard in package.json.)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { nodeVersionProblem } from './node-version.mjs'

// Before any .ts import: on an older Node that import fails with an unhelpful error.
const tooOld = nodeVersionProblem(process.versions.node)
if (tooOld) {
  console.error(tooOld)
  process.exit(1)
}
const { githubSlug, packedReadmeProblems, pinReadme, rawBase } = await import('./npm-readme.ts')

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
    if (kind === 'embedded') objectType(path)
  }
  return text
}

/** `git archive` of `commit` unpacked into a new staging directory. */
function stageCommit(commit) {
  const stage = mkdtempSync(join(tmpdir(), 'pack-npm-'))
  const tree = join(stage, 'tree')
  mkdirSync(tree)
  execFileSync('git', ['archive', '--format=tar', '-o', join(stage, 'tree.tar'), commit])
  execFileSync('tar', ['-xf', join(stage, 'tree.tar'), '-C', tree])
  return { stage, tree }
}

/** Sorted file list `npm pack` makes from the commit's tree (package.json `files`, npm's always-included files). */
function expectedFiles(commit) {
  const { stage, tree } = stageCommit(commit)
  try {
    const [info] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: tree, encoding: 'utf8' }))
    return info.files.map((f) => f.path).toSorted()
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/** Fails unless the tarball holds exactly the commit's packed files with the commit's bytes (READMEs: pinned to ref). */
function verifyContents(tgz, slug, ref, commit) {
  const entries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const files = []
  for (const entry of entries) {
    if (entry.endsWith('/')) continue
    if (!entry.startsWith('package/') || entry.split('/').some((p) => p === '..' || p === '')) throw new Fail(`${tgz}: unexpected entry "${entry}"`)
    files.push(entry.slice('package/'.length))
  }
  const dupes = files.filter((f, i) => files.indexOf(f) !== i)
  if (dupes.length) throw new Fail(`${tgz}: duplicate entries ${dupes.join(', ')}`)
  const want = expectedFiles(commit)
  const extra = files.filter((f) => !want.includes(f))
  const missing = want.filter((f) => !files.includes(f))
  if (extra.length || missing.length) {
    throw new Fail(`${tgz}: file list differs from npm pack of ${commit}${extra.length ? `\n  extra:   ${extra.join(', ')}` : ''}${missing.length ? `\n  missing: ${missing.join(', ')}` : ''}`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'pack-npm-verify-'))
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', dir, '--no-same-owner', '--no-same-permissions'])
    const differ = []
    for (const file of files.toSorted()) {
      const abs = join(dir, 'package', file)
      if (!lstatSync(abs).isFile()) throw new Fail(`${tgz}: ${file} is not a regular file`)
      const packed = readFileSync(abs)
      const committed = execFileSync('git', ['show', `${commit}:${file}`], { maxBuffer: 256 * 1024 * 1024 })
      const expected = READMES.includes(file) ? Buffer.from(pinAt(committed.toString('utf8'), file, slug, ref, commit)) : committed
      if (!packed.equals(expected)) differ.push(READMES.includes(file) ? `${file} (vs. the commit's README pinned to ${ref})` : file)
    }
    if (differ.length) throw new Fail(`${tgz}: content differs from commit ${commit}:\n  ${differ.join('\n  ')}`)
    return files.length
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Fails unless the packed READMEs pass the check (and, with a commit, equal its pinned READMEs). */
function verify(tgz, slug, ref, commit) {
  for (const name of READMES) {
    const packed = execFileSync('tar', ['-xOzf', tgz, `package/${name}`], { encoding: 'utf8' })
    const problems = packedReadmeProblems(packed, slug, ref)
    if (problems.length) throw new Fail(`${tgz} ${name}:\n  ${problems.join('\n  ')}`)
    if (!packed.includes(rawBase(slug, ref))) throw new Fail(`${tgz} ${name}: no image pinned to ${ref}`)
  }
  const count = commit ? verifyContents(tgz, slug, ref, commit) : 0
  const sha512 = createHash('sha512').update(readFileSync(tgz)).digest('base64')
  const scope = commit
    ? `     ${count} files: list and bytes match commit ${commit} (READMEs pinned)\n`
    : '     file list and contents NOT checked (no --commit)\n'
  process.stdout.write(`ok   ${tgz}\n     README images and links pinned to ${ref}\n${scope}     integrity sha512-${sha512}\n`)
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

  const { stage, tree } = stageCommit(head)
  try {
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
