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
import type { HostContext } from './types.ts'

export { resolveConfig, DEFAULT_CONFIG, type PindouConfig } from './config.ts'
export { Generator } from './generate.ts'

export const name = 'dsh-pindou'

/** `connection` is required (web only); `llm` and the default-model service are read live when present. */
export const inject = {
  connection: { required: true },
  llm: { required: false },
  agentDefaultModel: { required: false },
}

export function apply(ctx: HostContext, rawConfig?: unknown): void {
  const config = resolveConfig(rawConfig)
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'dsh-pindou: abort generations')
  const generator = new Generator({
    config,
    llm: () => ctx.get('llm'),
    defaultModel: () => ctx.get('agentDefaultModel'),
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
    fetch: () => Promise.resolve(Response.json(generator.status(), { headers: { 'cache-control': 'no-store' } })),
  })
}
