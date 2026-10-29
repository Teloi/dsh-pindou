import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aliasJsxRuntime } from '../scripts/jsx-alias.ts'

const ROOT = resolve(import.meta.dirname, '..')
const rendered = 'let react_jsx_runtime = require("react/jsx-runtime");\nfunction A() { return (0, react_jsx_runtime.jsxs)("p", { children: [(0, react_jsx_runtime.jsx)("b", {}), (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {})] }) }'

describe('JSX runtime aliases (scripts/jsx-alias.ts)', () => {
  it('binds jsx/jsxs once and calls them bare; Fragment and the binding stay', () => {
    expect(aliasJsxRuntime(rendered, 'client.js')).toBe('let react_jsx_runtime = require("react/jsx-runtime");\nconst __pd_jsx = react_jsx_runtime.jsx, __pd_jsxs = react_jsx_runtime.jsxs;\nfunction A() { return __pd_jsxs("p", { children: [__pd_jsx("b", {}), __pd_jsx(react_jsx_runtime.Fragment, {})] }) }')
  })

  it('leaves a chunk without the JSX runtime alone', () => {
    expect(aliasJsxRuntime('let x = 1;', 'client.x.js')).toBe('let x = 1;')
  })

  it('fails the build when rolldown output changes shape', () => {
    expect(() => aliasJsxRuntime('var r=require("react/jsx-runtime");(0,r.jsx)("b")', 'client.js')).toThrow(/form this step does not know/)
    expect(() => aliasJsxRuntime('let rt = require("react/jsx-runtime");\nf(rt.jsx)', 'client.js')).toThrow(/has no \(0, rt.jsx\)\( call/)
    expect(() => aliasJsxRuntime('let rt = require("react/jsx-runtime");\n(0, rt.jsx)("a");f(rt.jsxs)', 'client.js')).toThrow(/still reads rt.jsx/)
  })

  it('the committed lib calls the runtime through the aliases only', () => {
    for (const f of ['client.js', 'client.picture.js', 'client.works.js']) {
      const code = readFileSync(join(ROOT, 'lib', f), 'utf8')
      expect(code, f).not.toMatch(/\(0,\s*\w+\.jsxs?\)\(/)
      expect(code, f).toMatch(/require\("react\/jsx-runtime"\),(\w+)=\w+\.jsx,\w+=\w+\.jsxs/)
    }
  })
})
