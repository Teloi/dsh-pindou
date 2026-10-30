/**
 * JSX runtime calls through local aliases (wired up in tsdown.config.ts, renderChunk).
 *
 * react/jsx-runtime is a platform module, so the CJS output calls it as
 * `(0, react_jsx_runtime.jsx)(…)` — ~280 times in the first screen, and the
 * minifier cannot shorten a property read on an external. Binding `jsx` and
 * `jsxs` once to locals (which the minifier then mangles) makes each call a bare
 * `n(…)`; the functions do not use `this`, so the call is the same.
 * It was ~77 B of the first-screen gzip.
 *
 * Runs before minification on rolldown's rendered CJS. If that output ever
 * changes shape (the binding is not found, or a call is left behind) the build
 * fails here instead of silently shipping the long form.
 */
const BINDING = /^(?:let|const|var) (\w+) = require\((["'`])react\/jsx-runtime\2\);$/m

export function aliasJsxRuntime(code: string, file: string): string {
  const m = BINDING.exec(code)
  if (!m) {
    if (/react\/jsx-runtime/.test(code)) throw new Error(`jsx alias: ${file} requires react/jsx-runtime in a form this step does not know`)
    return code
  }
  const ns = m[1]!
  const alias = `const __pd_jsx = ${ns}.jsx, __pd_jsxs = ${ns}.jsxs;`
  let n = 0
  const body = code.replace(new RegExp(`\\(0, ${ns}\\.(jsxs?)\\)\\(`, 'g'), (_, f: string) => { n++; return `__pd_${f}(` })
  if (n === 0) throw new Error(`jsx alias: ${file} binds ${ns} but has no (0, ${ns}.jsx)( call`)
  if (new RegExp(`\\b${ns}\\.jsxs?\\b`).test(body)) throw new Error(`jsx alias: ${file} still reads ${ns}.jsx/jsxs in a form this step does not rewrite`)
  return body.replace(m[0], `${m[0]}\n${alias}`)
}
