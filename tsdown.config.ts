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
 */
import { builtinModules } from 'node:module'
import { defineConfig, type UserConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }
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
  // roomy; review the readable source in src/, not lib/.
  minify: { compress: true, mangle: true, codegen: { removeWhitespace: true } },
  deps: {
    neverBundle: PLATFORM_MODULES,
    alwaysBundle: (id: string) => !PLATFORM_MODULES.includes(id),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
  plugins: [{
    // Comments and whitespace in the stylesheet stay in the source only (scripts/minify-css.ts).
    name: 'dsh-client-css-minify',
    transform(code: string, id: string) {
      return id.replaceAll('\\', '/').endsWith('/src/client/styles.ts') ? { code: minifyCssModule(code), map: null } : null
    },
  }, {
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
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
    codeSplitting: false,
  },
}

export default defineConfig([host, client])
