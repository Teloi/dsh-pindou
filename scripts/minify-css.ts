/**
 * Build-time CSS minifier for the template literals in src/client/styles.ts
 * (wired up in tsdown.config.ts). The source keeps its comments for review —
 * why each isolation reset exists, the designer's token notes — but none of it
 * needs to reach the browser, and it was ~6 KB of the gzip budget.
 *
 * Deliberately conservative:
 * - comments go; runs of whitespace become one space (descendant combinators
 *   such as `.pd-root :focus-visible` keep their space);
 * - spaces next to `{ } ;` and after `,` are dropped (none of these is ever
 *   significant in this stylesheet: no string contains them);
 * - spaces around `:` `>` `+` `(` `)` are kept, so selectors like `.a :b` and
 *   values like `calc(a + b)` cannot change meaning.
 */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/,\s+/g, ',')
    .replace(/;\}/g, '}')
    .trim()
}

/** Minify every template literal in a module that holds only CSS strings. */
export function minifyCssModule(code: string): string {
  if (code.includes('${')) throw new Error('minifyCssModule: interpolated template literals are not supported')
  return code.replace(/`([^`]*)`/g, (_m, css: string) => `\`${minifyCss(css)}\``)
}
