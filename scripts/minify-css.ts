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
 *   values like `calc(a + b)` cannot change meaning — except the one space after
 *   the colon of a declaration or media feature (`--pd-x: v`, `syntax: '…'`,
 *   `(max-width: 359px)`): there the name sits right after `{` `;` or `(`, which a
 *   selector never does as `name: `, and a custom property's leading space is
 *   not part of its value (css-variables §2);
 * - numbers lose a leading `0` and trailing zeros after the point, and six-digit
 *   colours with doubled digits become three-digit (the same values).
 */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/,\s+/g, ',')
    .replace(/;\}/g, '}')
    .replace(/([{;(])(-{0,2}[a-z][\w-]*): /g, '$1$2:')
    // numbers and colours in their shortest equal form: 0.6 → .6, .10 → .1, #FFFFFF → #FFF
    .replace(/([^\w.-])0\.(\d)/g, '$1.$2')
    .replace(/(\.\d*[1-9])0+(?!\d)/g, '$1')
    .replace(/#([\da-f])\1([\da-f])\2([\da-f])\3(?![\da-f])/gi, '#$1$2$3')
    .trim()
}

/** Minify every template literal in a module that holds only CSS strings. */
export function minifyCssModule(code: string): string {
  if (code.includes('${')) throw new Error('minifyCssModule: interpolated template literals are not supported')
  return code.replace(/`([^`]*)`/g, (_m, css: string) => `\`${minifyCss(css)}\``)
}
