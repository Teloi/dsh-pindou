/**
 * Package-local async chunks for the DSH web module loader (wired up in tsdown.config.ts).
 *
 * The host (packages/client/modules, verified on DSH 0.2.2-alpha.2, see
 * /workspace/dsh-pindou-selfcheck/v0.2/dynamic-import.md) loads a chunk only through
 * `require.async("./client.<name>.js")` and registers it with
 * `__ModuleLoader__.load({ id, chunk: "<file>", factory })`. Its synchronous `require`
 * knows platform modules only, so a chunk that the entry needs synchronously (a
 * rolldown "common" chunk, made when a lazy module shares code with the entry) makes
 * the whole plugin fail to activate. This mirrors the host's own preset
 * (asyncChunkRequirePlugin in packages/client/tsdown.client.ts) and turns the shared
 * chunk case into a build error instead of a runtime one.
 */

/** File names the host serves and accepts as package-local chunks. */
export const CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

interface ChunkInfo {
  fileName: string
  isEntry: boolean
  isDynamicEntry: boolean
  dynamicImports: string[]
}

/** The `__ModuleLoader__.load` opening for one output chunk (the footer closes it). */
export function registrationBanner(id: string, chunk: Pick<ChunkInfo, 'isEntry' | 'fileName'>): string {
  const part = chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${part}factory: (require) => {`
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Rewrite rolldown's CJS `import()` of a sibling chunk to the loader's `require.async`. */
export function rewriteDynamicImports(code: string, chunk: Pick<ChunkInfo, 'fileName' | 'dynamicImports'>): string {
  let out = code
  for (const dynamicImport of chunk.dynamicImports) {
    const fileName = dynamicImport.replace(/^\.\//, '')
    if (!CLIENT_CHUNK.test(fileName)) throw new Error(`async chunks: "${fileName}" is not a client.<name>.js chunk name`)
    const specifier = `./${fileName}`
    const call = new RegExp(`Promise\\.resolve\\(\\)\\.then\\(\\(\\)\\s*=>\\s*require\\((['"\`])${escape(specifier)}\\1\\)\\)`, 'g')
    const next = out.replace(call, `require.async(${JSON.stringify(specifier)})`)
    if (next === out) throw new Error(`async chunks: no import() expression for ${specifier} in ${chunk.fileName}`)
    out = next
  }
  return out
}

/** Every non-entry chunk must be a dynamic entry: the host has no way to load a shared chunk synchronously. */
export function assertOnlyDynamicChunks(chunks: readonly ChunkInfo[]): void {
  for (const chunk of chunks) {
    if (chunk.isEntry) continue
    if (!chunk.isDynamicEntry) {
      throw new Error(`async chunks: ${chunk.fileName} is shared between the entry and a lazy module; the DSH loader cannot require it synchronously. Pass shared values into the lazy module as arguments (or import them as types only).`)
    }
    if (!CLIENT_CHUNK.test(chunk.fileName)) throw new Error(`async chunks: ${chunk.fileName} must be named client.<name>.js`)
  }
}

/** The rolldown plugin: rewrite before minification, check the chunk graph once it is final. */
export function asyncChunksPlugin() {
  return {
    name: 'dsh-client-async-chunks',
    renderChunk(code: string, chunk: ChunkInfo) {
      if (chunk.dynamicImports.length === 0) return null
      return { code: rewriteDynamicImports(code, chunk), map: null }
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string } & Partial<ChunkInfo>>) {
      assertOnlyDynamicChunks(Object.values(bundle).filter((o): o is { type: string } & ChunkInfo => o.type === 'chunk'))
    },
  }
}
