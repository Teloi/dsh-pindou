// End-to-end run against DSH Web started from source: e2e/suite.mjs (usage and setup there).
//
//   node e2e/run.mjs                   # everything into e2e/.out (screenshots in e2e/.out/assets)
//   node e2e/run.mjs --update-assets   # also refresh the README screenshots + GIF in docs/assets
//
// The plugin ships short class names (scripts/css-classes.ts); e2e/classes-hook.mjs rewrites the
// suite's readable `pd-…` names to them as it loads, so this entry registers it first.
import { register } from 'node:module'

register('./classes-hook.mjs', import.meta.url)
await import('./suite.mjs')
