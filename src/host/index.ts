/**
 * Host half of dsh-pindou: one authenticated route for AI pattern generation.
 *
 * The route is registered through `ctx.connection.fetch`, i.e. inside the
 * Connection fence (Host/Origin checks + browser token cookie, owner only), so
 * nothing outside the logged-in DSH page can spend tokens through it.
 */
import { GENERATE_PATH, STATUS_PATH } from '../core/protocol.ts'
import { resolveConfig } from './config.ts'
import { Generator } from './generate.ts'
import type { ConfigurableProviderLike, HostContext } from './types.ts'

export { resolveConfig, DEFAULT_CONFIG, type PindouConfig } from './config.ts'
export { Generator } from './generate.ts'

export const name = 'dsh-pindou'

/** `connection` is required (web only); `llm` and the default-model service are read live when present. */
export const inject = {
  connection: { required: true },
  llm: { required: false },
  agentDefaultModel: { required: false },
  credentials: { required: false },
  loader: { required: false },
}

/**
 * Best effort: a provider profile's custom `apiKeyEnv`, read from the owning
 * package's effective config (the same lookup the bundled translator does).
 * `undefined` falls back to the Models page's default credential name.
 */
export function profileKeyRef(ctx: HostContext, entry: ConfigurableProviderLike): string | undefined {
  const loader = ctx.get('loader')
  if (loader === undefined || entry.settingsNs === undefined) return undefined
  for (const row of loader.entries()) {
    if (row.options.id !== entry.settingsNs) continue
    let node: unknown = row.fiber?.effectiveConfig
    for (const key of entry.settingsPath ?? []) node = (node as Record<string, unknown> | undefined)?.[key]
    const raw = (node as { apiKeyEnv?: unknown } | undefined)?.apiKeyEnv
    const value = typeof raw === 'string' ? raw : typeof (raw as { get?: unknown } | undefined)?.get === 'function' ? (raw as { get(): unknown }).get() : undefined
    return typeof value === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(value) ? value : undefined
  }
  return undefined
}

export function apply(ctx: HostContext, rawConfig?: unknown): void {
  const config = resolveConfig(rawConfig)
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'dsh-pindou: abort generations')
  const generator = new Generator({
    config,
    llm: () => ctx.get('llm'),
    defaultModel: () => ctx.get('agentDefaultModel'),
    credentials: () => ctx.get('credentials'),
    profileKeyRef: entry => profileKeyRef(ctx, entry),
    env: n => process.env[n],
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    lifetime: lifetime.signal,
  })
  ctx.connection.fetch.register({
    path: GENERATE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => generator.handle(request),
  })
  ctx.connection.fetch.register({
    path: STATUS_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => Response.json(await generator.status(), { headers: { 'cache-control': 'no-store' } }),
  })
}
