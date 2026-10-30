/**
 * Short names for the stylesheet's own custom properties (wired up in tsdown.config.ts).
 *
 * The source keeps the designer's token names (`--pd-surface`, `--pd-t-fast` …) for
 * review; the build writes each as its short name from the one table, css-vars.json
 * (`--pd-surface` → `--q…`), in the entry, the lazy chunks, the CSS and the inline
 * `style` keys alike. That table is the only copy: e2e reads computed values through
 * it, and scripts/check-bundle.mjs fails the build output on a long name left over or
 * a short name used but never defined. It was ~400 B of the first-screen gzip.
 *
 * A new `--pd-*` name needs its row in css-vars.json (tests/css-vars.test.ts lists
 * the missing ones). Short names are `--q` and one or two letters, ordered by use.
 */
import TABLE from './css-vars.json' with { type: 'json' }

export const CSS_VARS: Readonly<Record<string, string>> = TABLE

/** A whole `--pd-…` token (not a prefix of a longer one: `--pd-t` vs `--pd-t-fast`). */
const TOKEN = /--pd-[\w-]*\w/g

/** Every known long name in `code` becomes its short name; unknown tokens (comments such as `--pd-bead-*`) stay. */
export function shortenCssVars(code: string): string {
  return code.replace(TOKEN, name => CSS_VARS[name] ?? name)
}
