/**
 * Two faces, one package:
 *
 * - `lib/index.js` — the Host half (ESM, Node): the `/api/pindou.generate`
 *   route inside the Connection authentication fence.
 * - `lib/client.js` — the browser half, a CJS factory registered through
 *   `window.__ModuleLoader__.load({ id, factory })`, which is the shape the
 *   DSH web module table expects. Only the platform modules the shell shares
 *   (`PLATFORM_MODULES` in packages/client/web/src/platform.ts) stay external;
 *   every other import is inlined, and any value import of another
 *   `@deepseek-ai/*` package or a Node builtin fails the build.
 * - `lib/client.<name>.js` — optional lazy chunks, one per `import()`ed module,
 *   loaded by the host through `require.async` (scripts/async-chunks.ts).
 */
import { builtinModules } from 'node:module'
import { defineConfig, type UserConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
import { asyncChunksPlugin, registrationBanner } from './scripts/async-chunks.ts'
import { shortenCssVars } from './scripts/css-vars.ts'
import { minifyCssModule } from './scripts/minify-css.ts'

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map(id => `node:${id}`)])

/** Mirrors PLATFORM_MODULES of @deepseek-ai/dsh-client-web. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const mode = process.env['NODE_ENV'] ?? 'production'

const host: UserConfig = {
  entry: { index: 'src/host/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  dts: false,
  clean: true,
  fixedExtension: false,
}

const client: UserConfig = {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  sourcemap: false,
  // Local identifiers are mangled (property names, exports and the CSS class names
  // stay as written), which is what keeps the gzip budget (scripts/check-bundle.mjs)
  // roomy; review the readable source in src/, not lib/. The factory's `require`
  // parameter keeps its name: check:bundle audits every `require(...)` and
  // `require.async(...)` in the shipped text, which a mangled `e(...)` would hide.
  minify: { compress: true, mangle: { reserved: ['require'] }, codegen: { removeWhitespace: true } },
  deps: {
    neverBundle: PLATFORM_MODULES,
    alwaysBundle: (id: string) => !PLATFORM_MODULES.includes(id),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
  plugins: [{
    // Comments and whitespace in the stylesheet stay in the source only (scripts/minify-css.ts).
    name: 'dsh-client-css-minify',
    transform(code: string, id: string) {
      return id.replaceAll('\\', '/').match(/\/src\/client\/(?:picture-)?styles\.ts$/) ? { code: minifyCssModule(code), map: null } : null
    },
  }, {
    // The stylesheet's custom properties ship under their short names (scripts/css-vars.ts),
    // in the CSS and in inline `style` keys of every client module, entry and chunks alike.
    name: 'dsh-client-css-vars',
    transform(code: string, id: string) {
      if (!/\/src\/client\/[^?]*\.tsx?$/.test(id.replaceAll('\\', '/'))) return null
      const out = shortenCssVars(code)
      return out === code ? null : { code: out, map: null }
    },
  }, asyncChunksPlugin(), {
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(`client bundle purity: Node builtin "${source}" cannot run in the browser`)
      }
      if (source.startsWith('@deepseek-ai/') && !PLATFORM_MODULES.includes(source)) {
        throw new Error(`client bundle purity: "${source}" is not a platform module; import it as a type only`)
      }
      return null
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    // `import()` of a module makes it lazy: lib/client.<name>.js, fetched by the host's
    // module loader on first use (scripts/async-chunks.ts). The first-screen budget
    // counts lib/client.js only; the async chunks have their own (scripts/check-bundle.mjs).
    chunkFileNames: 'client.[name].js',
    banner: chunk => registrationBanner(pkg.name, chunk),
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
    // lib/client.js is the end of the line: the host runs it as a classic script and
    // no later bundler reads its /* @__PURE__ */ hints, so ship none. Legal comments stay.
    comments: { legal: true, annotation: false, jsdoc: false },
  },
}

export default defineConfig([host, client])
