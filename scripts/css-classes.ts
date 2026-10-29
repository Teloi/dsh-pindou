/**
 * Short names for the plugin's own class names, ids and keyframes (wired up in tsdown.config.ts).
 *
 * The source keeps readable `pd-…` names (`pd-board`, `pd-pic-zone` …); the build
 * writes each as its short name from the one table, css-classes.json (`pd-board` →
 * `pd` and one or two letters: `pda`, `pdbc`; never `pdf`, which e2e logs read as a word), in the entry, the lazy
 * chunks and their CSS alike. Short names keep the `pd` prefix (no host class
 * starts that way; e2e/audit.mjs reports any host rule that reaches the panel) and
 * can never be read as a long name (no dash). That table is the only copy: e2e reads
 * the page through it (e2e/run.mjs registers e2e/classes-hook.mjs), and
 * scripts/check-bundle.mjs fails the build output on a long name left over.
 *
 * A new `pd-…` name needs its row in css-classes.json (tests/css-classes.test.ts lists
 * the missing ones). A class name is always written out whole, never built from a
 * template (`pd-tool-${tool}` could not be found, so would ship long and unstyled).
 */
import TABLE from './css-classes.json' with { type: 'json' }

export const CSS_CLASSES: Readonly<Record<string, string>> = TABLE

/** A whole `pd-…` token: not `--pd-…` (a custom property) nor `data-pd-…` (an attribute). */
export const CLASS_TOKEN = /(?<![\w$-])pd-[\w-]*\w/g

/** Every known long name in `code` becomes its short name; unknown tokens stay (check-bundle reports them). */
export function shortenClasses(code: string): string {
  return code.replace(CLASS_TOKEN, name => CSS_CLASSES[name] ?? name)
}
