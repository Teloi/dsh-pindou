// Module hook for the e2e suite (registered by e2e/run.mjs): class names, ids and keyframes ship
// under short names (scripts/css-classes.ts, the one table css-classes.json), so every `pd-…`
// token in the suite's own source (selectors, page.evaluate bodies, expected names) is rewritten
// to its short name as the module loads. The suite keeps readable names; tests/css-classes.test.ts
// fails on a name the table does not know. check() maps short names back for its log (longNames).
import { readFileSync } from 'node:fs'

const TABLE = JSON.parse(readFileSync(new URL('../scripts/css-classes.json', import.meta.url), 'utf8'))
const TOKEN = /(?<![\w$-])pd-[\w-]*\w/g
const SUITE = /\/e2e\/(?:suite|audit|picture)\.mjs$/

export const shortClasses = (code) => code.replace(TOKEN, n => TABLE[n] ?? n)

const LONG = Object.fromEntries(Object.entries(TABLE).map(([long, short]) => [short, long]))
/** Short names back to the source's names, for log lines (no short name is a word: `pdf` is never one). */
export const longNames = (text) => text.replace(/(?<![\w$-])pd[a-z]{1,2}(?![\w-])/g, s => LONG[s] ?? s)

export async function load(url, context, next) {
  const r = await next(url, context)
  if (!SUITE.test(url)) return r
  return { ...r, source: shortClasses(String(r.source)) }
}
