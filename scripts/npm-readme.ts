// The npm package page renders the packed README.md, not the GitHub one. npmjs.com
// (checked 2026-10-29 on execa / chalk / @stackone/defender) rewrites a relative
// `<img src>` to raw.githubusercontent.com/<owner>/<repo>/HEAD/<path> and a relative
// link to github.com/<owner>/<repo>/blob/HEAD/<path>, i.e. the default branch at
// view time, and leaves a relative `<source srcset>` untouched, so it resolves
// against npmjs.com and 404s. The repository keeps relative paths (GitHub resolves
// them per ref); only the packed copy is pinned to the release ref here:
//   images (img src, source srcset, ![](…))  -> raw.githubusercontent.com/<slug>/<ref>/<path>
//   links  (a href, [](…), [id]: …)          -> github.com/<slug>/blob|tree/<ref>/<path>
// Absolute URLs of this repository at `main` / `HEAD` (raw, blob, tree; also when
// URL-encoded inside another URL, e.g. the shields.io dynamic version / engines
// badges' `?url=https%3A%2F%2Fraw.githubusercontent.com%2F<slug>%2Fmain%2F…`) get
// the same ref, so the npm page shows what the release commit says. The CI status
// badge is the one deliberate exception (CI_BADGES): it keeps following `main`.
// Anchors (#…), other absolute URLs (any scheme, //host) and fenced or inline code
// are left alone. See scripts/pack-npm.mjs.

/** Fenced code is shown as text on both sites: never rewrite or flag inside it. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/
/** Inline code span (same-length backtick run on one line). */
const CODE_SPAN = /(`+)[\s\S]*?(?<!`)\1(?!`)/g

/** An HTML <img>, <source> or <a> start tag. */
const TAG = /<(img|source|a)\b[^>]*>/gi
/** src / srcset / href attribute inside such a tag, double- or single-quoted. */
const ATTR = /(\s)(src|srcset|href)\s*=\s*(["'])(.*?)\3/gi
/**
 * Inline Markdown image or link: `![alt](url "title")`, `[text](<url>)`. The text may
 * hold one level of brackets, so `[![badge](img)](link)` is one link whose text is
 * scanned again for the image.
 */
const MD_INLINE = /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\](\(\s*)(<[^>]*>|[^\s)]+)/g
/** Link reference definition: `[id]: url "title"` at the start of a line. */
const MD_DEFINITION = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>]*>|\S+)/
/** Extensions treated as images when only a reference definition says what a URL is. */
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif)$/i

export type RefKind = 'src' | 'srcset' | 'markdown-image' | 'href' | 'markdown-link' | 'definition'

export interface ReadmeRef {
  line: number
  kind: RefKind
  url: string
}

/** Not a URL with a scheme, protocol-relative URL, fragment or data URI. */
export function isRelative(url: string): boolean {
  return url !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//') && !url.startsWith('#')
}

/** Whether a reference of this kind is shown as an image (raw URL) rather than followed as a link. */
export function isImageRef(kind: RefKind, url: string): boolean {
  if (kind === 'src' || kind === 'srcset' || kind === 'markdown-image') return true
  return kind === 'definition' && IMAGE_EXT.test(splitPath(url).path)
}

/** `git+https://github.com/Owner/repo.git` (or the string form) -> `Owner/repo`. */
export function githubSlug(repository: unknown): string {
  const url = typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url
  const m = typeof url === 'string' ? /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url) : null
  if (!m) throw new Error(`package.json repository is not a GitHub repository: ${JSON.stringify(repository)}`)
  return `${m[1]}/${m[2]}`
}

function checkRef(ref: string): string {
  if (!/^[\w.-]+$/.test(ref) || ref.includes('..')) throw new Error(`unsafe ref: ${ref}`)
  return ref
}

/** Base for pinned images. */
export function rawBase(slug: string, ref: string): string {
  return `https://raw.githubusercontent.com/${slug}/${checkRef(ref)}/`
}

/** Base for pinned links; `tree` for directories, `blob` for files. */
export function webBase(slug: string, ref: string, type: 'blob' | 'tree'): string {
  return `https://github.com/${slug}/${type}/${checkRef(ref)}/`
}

/** `docs/a.md?x#y` -> path `docs/a.md`, suffix `?x#y`. */
function splitPath(url: string): { path: string, suffix: string } {
  const i = url.search(/[?#]/)
  return i < 0 ? { path: url, suffix: '' } : { path: url.slice(0, i), suffix: url.slice(i) }
}

/** Repository path of a relative README reference (the READMEs sit at the repo root). */
export function repoPath(url: string): string {
  const path = url.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '')
  if (splitPath(path).path.split('/').includes('..')) throw new Error(`path leaves the repository: ${url}`)
  return path
}

/** Calls fn on every image/link URL outside fenced and inline code; fn may return a replacement. */
function mapRefs(md: string, fn: (ref: ReadmeRef) => string | undefined): string {
  let fence: string | null = null
  const inline = (text: string, line: number): string => text.replace(MD_INLINE, (all, bang: string, label: string, open: string, raw: string) => {
    const kind: RefKind = bang ? 'markdown-image' : 'markdown-link'
    const inner = bang ? label : inline(label, line)
    const url = raw.startsWith('<') ? raw.slice(1, -1) : raw
    const next = fn({ line, kind, url })
    const target = next === undefined ? raw : raw.startsWith('<') ? `<${next}>` : next
    return next === undefined && inner === label ? all : `${bang}[${inner}]${open}${target}`
  })
  const outsideCode = (text: string, line: number): string => text
    .replace(TAG, (tag) => tag.replace(ATTR, (all, sp: string, name: string, q: string, value: string) => {
      const attr = name.toLowerCase() as 'src' | 'srcset' | 'href'
      // srcset is a comma-separated candidate list: "a.png 1x, b.png 2x"
      const parts = attr === 'srcset' ? value.split(',') : [value]
      let changed = false
      const out = parts.map((part) => {
        const m = /^(\s*)(\S+)(.*)$/s.exec(part)
        if (!m) return part
        const next = fn({ line, kind: attr, url: m[2]! })
        if (next === undefined) return part
        changed = true
        return m[1]! + next + m[3]!
      })
      return changed ? `${sp}${name}=${q}${out.join(',')}${q}` : all
    }))
    .replace(MD_DEFINITION, (all, head: string, raw: string) => {
      const url = raw.startsWith('<') ? raw.slice(1, -1) : raw
      const next = fn({ line, kind: 'definition', url })
      return next === undefined ? all : head + (raw.startsWith('<') ? `<${next}>` : next)
    })
  return md.split('\n').map((text, i) => {
    const f = FENCE.exec(text)
    if (f) {
      if (fence === null) fence = f[1]!
      else if (f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length) fence = null
      return text
    }
    if (fence !== null) return text
    const line = i + 1
    // Rewrite only between inline code spans.
    let out = ''
    let last = 0
    for (const m of text.matchAll(CODE_SPAN)) {
      out += inline(outsideCode(text.slice(last, m.index), line), line) + m[0]
      last = m.index + m[0].length
    }
    return out + inline(outsideCode(text.slice(last), line), line)
  }).join('\n')
}

export function readmeRefs(md: string): ReadmeRef[] {
  const refs: ReadmeRef[] = []
  mapRefs(md, (ref) => { refs.push(ref); return undefined })
  return refs
}

export interface PinnedPath {
  /** Repository path without query or fragment, decoded, no trailing slash. */
  path: string
  /** `embedded`: a file of this repository named by an absolute (possibly encoded) URL, e.g. a badge's package.json. */
  kind: 'image' | 'link' | 'embedded'
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `/` as written in a URL, or percent-encoded once or more (`%2F`, `%252F`, …). */
const SEP = '(?:/|%(?:25)*2F)'

/** raw / blob / tree / raw-on-github URL of `slug`, plain or encoded; group 2 is the ref. */
function ownRefPattern(slug: string): RegExp {
  const [owner, repo] = slug.split('/').map(escape) as [string, string]
  return new RegExp(`((?:raw\\.githubusercontent\\.com${SEP}${owner}${SEP}${repo}|github\\.com${SEP}${owner}${SEP}${repo}${SEP}(?:blob|tree|raw))${SEP})([^/?#&%\\s"'<>]+)(?=${SEP}|$|[?#&])`, 'gi')
}

/** Every decoding of `url` up to a fixed point (nested `?url=` parameters may be encoded several times). */
export function decodings(url: string): string[] {
  const out = [url]
  for (let s = url, i = 0; i < 8; i++) {
    let d: string
    try { d = decodeURIComponent(s) } catch { break }
    if (d === s) break
    out.push(d)
    s = d
  }
  return out
}

/**
 * The CI status badge follows `main` on purpose (it reports the branch, not the
 * release). Only these exact image URLs may name `main` in a packed README.
 */
export function isCiBadge(kind: RefKind, url: string, slug: string): boolean {
  if (kind !== 'src' && kind !== 'markdown-image') return false
  const s = escape(slug)
  const query = '(?:&[\\w.%=-]*)*'
  return new RegExp(`^https://img\\.shields\\.io/github/actions/workflow/status/${s}/ci\\.yml\\?branch=main${query}$`, 'i').test(url)
    || new RegExp(`^https://github\\.com/${s}/actions/workflows/ci\\.yml/badge\\.svg\\?branch=main${query}$`, 'i').test(url)
}

/** `main` / `HEAD` of this repository in an absolute URL -> `ref`; plain and encoded alike. */
function pinAbsolute(url: string, slug: string, ref: string): string {
  return url.replace(ownRefPattern(slug), (all, head: string, at: string) => (at === 'main' || at === 'HEAD' ? head + ref : all))
}

/** Repository paths that an absolute URL names at `ref` (after full decoding). */
function embeddedPaths(url: string, slug: string, ref: string): string[] {
  const decoded = decodings(url).at(-1)!
  const re = new RegExp(`(?:raw\\.githubusercontent\\.com/${escape(slug)}|github\\.com/${escape(slug)}/(?:blob|tree|raw))/${escape(ref)}/([^?#&\\s"'<>]+)`, 'gi')
  return [...decoded.matchAll(re)].map((m) => m[1]!.replace(/\/+$/, ''))
}

export interface PinOptions {
  slug: string
  ref: string
  /**
   * What a link target is at the release commit; throws if it does not exist.
   * Defaults to `blob`, or `tree` for a path ending in `/`.
   */
  objectType?: (path: string) => 'blob' | 'tree'
}

/**
 * Pins every relative image to raw.githubusercontent.com and every relative link to
 * github.com blob/tree, both at `ref`. Returns the text and the paths it pinned.
 */
export function pinReadme(md: string, { slug, ref, objectType }: PinOptions): { text: string, paths: PinnedPath[] } {
  const raw = rawBase(slug, ref)
  const paths: PinnedPath[] = []
  const text = mapRefs(md, ({ kind, url }) => {
    if (!isRelative(url)) {
      if (isCiBadge(kind, url, slug)) return undefined
      const next = pinAbsolute(url, slug, ref)
      if (next === url) return undefined
      for (const path of embeddedPaths(next, slug, ref)) paths.push({ path, kind: 'embedded' })
      return next
    }
    const rel = repoPath(url)
    const { path, suffix } = splitPath(rel)
    const clean = decodeURIComponent(path).replace(/\/+$/, '')
    if (isImageRef(kind, url)) {
      paths.push({ path: clean, kind: 'image' })
      return raw + rel
    }
    const type = objectType ? objectType(clean) : path.endsWith('/') ? 'tree' : 'blob'
    paths.push({ path: clean, kind: 'link' })
    // tree/<ref>/ with an empty path is the repository root at ref.
    return webBase(slug, ref, type) + path.replace(/\/+$/, '') + suffix
  })
  return { text, paths }
}

/**
 * Problems that make a packed README unfit for npm: any relative image, srcset or
 * link left over; a raw/blob/tree URL of this repository at another ref, also when
 * it is URL-encoded inside another URL (every level of decoding is checked); and any
 * other URL of this repository that names `main` or `HEAD` (a path segment, `@main`
 * or a `=main` query value), except the CI status badge (isCiBadge).
 */
export function packedReadmeProblems(md: string, slug: string, ref: string): string[] {
  const own = ownRefPattern(slug)
  const mentions = new RegExp(escape(slug), 'i')
  const atMain = /[/=@](?:main|HEAD)(?=$|[/?#&])/
  return readmeRefs(md).flatMap(({ line, kind, url }) => {
    if (isRelative(url)) return [`line ${line}: relative ${kind} "${url}"`]
    const levels = decodings(url)
    if (levels.some((d) => [...d.matchAll(own)].some((m) => m[2] !== ref))) return [`line ${line}: ${kind} "${url}" is not pinned to ${ref}`]
    if (isCiBadge(kind, url, slug)) return []
    if (levels.some((d) => mentions.test(d) && atMain.test(d))) return [`line ${line}: ${kind} "${url}" points at main/HEAD of ${slug}`]
    return []
  })
}
