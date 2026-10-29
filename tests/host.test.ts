import { describe, expect, it, vi } from 'vitest'
import { decode, encodeRows, GENERATE_PATH, STATUS_PATH, TEMPLATES } from '../src/core/index.ts'
import { apply, inject, profileKeyRef, resolveConfig } from '../src/host/index.ts'
import { deriveKeyRef, Generator, scrubMessage, type GeneratorDeps } from '../src/host/generate.ts'
import type { FetchRoute, HostContext, LlmRuntimeLike, StreamChunk } from '../src/host/types.ts'

const heartRows = encodeRows(TEMPLATES[0]!.board)

function deps(over: Partial<GeneratorDeps> = {}): GeneratorDeps {
  let t = 0
  return {
    config: resolveConfig({ minIntervalMs: 0 }),
    llm: () => undefined,
    defaultModel: () => undefined,
    env: () => undefined,
    fetch: vi.fn() as unknown as typeof fetch,
    now: () => (t += 10_000),
    lifetime: new AbortController().signal,
    mockDelayMs: 1,
    ...over,
  }
}

function fakeLlm(chunks: StreamChunk[], seen: Record<string, unknown>[] = []): LlmRuntimeLike {
  return {
    listProviders: () => [{ id: 'p', name: 'P' }],
    prepareCall: async (config, _signal, configure) => {
      const controls = configure ? configure({ maxTokens: config.maxTokens }, { reasoning: { efforts: [{ id: 'none' }, { id: 'high' }] } }) : {}
      return {
        config: { ...config, ...controls },
        async *stream(options) { seen.push(options); for (const c of chunks) yield c },
      }
    },
  }
}

function post(body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }): Request {
  return new Request('http://127.0.0.1/api/pindou.generate', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('config', () => {
  it('defaults and validates loudly', () => {
    expect(resolveConfig(undefined).apiKeyEnv).toBe('DEEPSEEK_API_KEY')
    expect(() => resolveConfig({ bogus: 1 })).toThrow(/unknown config key/)
    expect(() => resolveConfig({ provider: 'x' })).toThrow(/together/)
    expect(() => resolveConfig({ maxTokens: 10 })).toThrow(/maxTokens/)
    expect(() => resolveConfig({ baseUrl: 'http://evil.example' })).toThrow(/https/)
    expect(() => resolveConfig({ apiKeyEnv: 'sk-123' })).toThrow(/environment variable/)
    expect(resolveConfig({ mock: true }).mock).toBe('ok')
    expect(() => resolveConfig({ mock: 'yes' })).toThrow(/mock/)
  })
})

describe('generator routes', () => {
  it('reports not-configured without llm or key', async () => {
    const g = new Generator(deps())
    expect(await g.status()).toEqual({ configured: false, route: 'none', model: undefined, verified: true })
    expect(await g.generate('cat', 16)).toEqual({ ok: false, error: 'not-configured' })
  })

  it('uses the DSH default model with a token cap and least reasoning', async () => {
    const seen: Record<string, unknown>[] = []
    const llm = fakeLlm([
      { type: 'text-delta', index: 0, text: heartRows.slice(0, 100) },
      { type: 'text-delta', index: 0, text: heartRows.slice(100) },
      { type: 'usage', usage: { inputTokens: 90, outputTokens: 140 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], seen)
    const g = new Generator(deps({ llm: () => llm, defaultModel: () => ({ currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) }) }))
    const r = await g.generate('heart', 16)
    expect(r).toMatchObject({ ok: true, model: 'deepseek-official/deepseek-v4-flash', usage: { input: 90, output: 140 }, repaired: false })
    expect(seen[0]).toMatchObject({ maxTokens: 1024, reasoningEffort: 'none', system: expect.stringContaining('16x16') })
    if (r.ok) expect(decode(r.flat, 16).ok).toBe(true)
  })

  it('prefers a pinned provider/model', () => {
    const g = new Generator(deps({ config: resolveConfig({ provider: 'a', model: 'b' }), llm: () => fakeLlm([]) }))
    expect(g.route()).toEqual({ kind: 'host', provider: 'a', model: 'b' })
  })

  it('maps host failures and falls back to the direct key on credential errors', async () => {
    const llm = fakeLlm([{ type: 'finish', reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'no key sk-abcdefghijklmnop' } } }])
    const noKey = new Generator(deps({ llm: () => llm, defaultModel: () => ({ currentSelection: () => ({ provider: 'p', model: 'm' }) }) }))
    const r = await noKey.generate('cat', 16)
    expect(r).toMatchObject({ ok: false, error: 'not-configured' })
    expect(JSON.stringify(r)).not.toContain('abcdefghijklmnop')

    const fetchFn = vi.fn(async () => Response.json({ choices: [{ message: { content: heartRows }, finish_reason: 'stop' }], usage: { prompt_tokens: 80, completion_tokens: 120 } }))
    const withKey = new Generator(deps({
      llm: () => llm, defaultModel: () => ({ currentSelection: () => ({ provider: 'p', model: 'm' }) }),
      env: n => (n === 'DEEPSEEK_API_KEY' ? 'sk-test' : undefined), fetch: fetchFn as unknown as typeof fetch,
    }))
    expect(await withKey.generate('cat', 16)).toMatchObject({ ok: true, model: 'deepseek/deepseek-chat', usage: { input: 80, output: 120 } })
  })

  it('direct route sends a capped request and handles HTTP errors', async () => {
    const calls: RequestInit[] = []
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => { calls.push(init); return new Response('nope', { status: 401 }) })
    const g = new Generator(deps({ env: () => 'sk-test', fetch: fetchFn as unknown as typeof fetch }))
    expect(g.route().kind).toBe('direct')
    expect(await g.generate('cat', 12)).toMatchObject({ ok: false, error: 'not-configured' })
    const body = JSON.parse(String(calls[0]!.body))
    expect(body).toMatchObject({ max_tokens: 1024, stream: false, model: 'deepseek-chat' })
    expect(body.messages).toHaveLength(2)

    const rate = new Generator(deps({ env: () => 'sk-test', fetch: (async () => new Response('', { status: 429 })) as unknown as typeof fetch }))
    expect(await rate.generate('cat', 12)).toMatchObject({ ok: false, error: 'rate-limited' })
    const junk = new Generator(deps({ env: () => 'sk-test', fetch: (async () => new Response('<html>')) as unknown as typeof fetch }))
    expect(await junk.generate('cat', 12)).toMatchObject({ ok: false, error: 'upstream' })
  })

  it('marks truncated (max-tokens) replies and repairs them', async () => {
    const llm = fakeLlm([
      { type: 'text-delta', index: 0, text: heartRows.split('\n').slice(0, 10).join('\n') },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ])
    const g = new Generator(deps({ llm: () => llm, config: resolveConfig({ provider: 'p', model: 'm', minIntervalMs: 0 }) }))
    expect(await g.generate('heart', 16)).toMatchObject({ ok: true, finish: 'max-tokens', repaired: true })
  })
})

describe('generator mock modes', () => {
  const run = (mock: string) => new Generator(deps({ config: resolveConfig({ mock, minIntervalMs: 0 }) })).generate('一只猫', 16)
  it('ok / malformed / truncated produce valid boards', async () => {
    expect(await run('ok')).toMatchObject({ ok: true, repaired: false })
    expect(await run('malformed')).toMatchObject({ ok: true, repaired: true })
    expect(await run('truncated')).toMatchObject({ ok: true, finish: 'max-tokens' })
  })
  it('hostile output is rejected, errors are mapped', async () => {
    expect(await run('hostile')).toMatchObject({ ok: false, error: 'parse' })
    expect(await run('error')).toMatchObject({ ok: false, error: 'upstream' })
    expect(await run('not-configured')).toMatchObject({ ok: false, error: 'not-configured' })
  })
  it('unknown subjects get a deterministic sprite at every size', async () => {
    for (const size of [12, 16, 24] as const) {
      const g = new Generator(deps({ config: resolveConfig({ mock: 'ok', minIntervalMs: 0 }) }))
      const a = await g.generate('a tiny robot', size)
      const b = await g.generate('a tiny robot', size)
      expect(a.ok && b.ok && a.flat === b.flat).toBe(true)
    }
  })
})

describe('generator guards', () => {
  it('rejects concurrent and too-rapid requests', async () => {
    let t = 0
    const g = new Generator(deps({ config: resolveConfig({ mock: 'ok', minIntervalMs: 5000 }), now: () => t }))
    const first = g.generate('cat', 16)
    expect(await g.generate('cat', 16)).toEqual({ ok: false, error: 'busy' })
    await first
    t = 1000
    expect(await g.generate('cat', 16)).toEqual({ ok: false, error: 'rate-limited' })
    t = 10_000
    expect((await g.generate('cat', 16)).ok).toBe(true)
  })

  it('validates HTTP requests', async () => {
    const g = new Generator(deps({ config: resolveConfig({ mock: 'ok', minIntervalMs: 0 }) }))
    expect((await g.handle(post({ prompt: 'cat', size: 16 }))).status).toBe(200)
    expect((await g.handle(post({ prompt: 'cat', size: 16 }, { 'content-type': 'text/plain' }))).status).toBe(400)
    expect((await g.handle(post('{oops'))).status).toBe(400)
    expect((await g.handle(post({ prompt: '   ', size: 16 }))).status).toBe(400)
    expect((await g.handle(post({ prompt: 'cat', size: 15 }))).status).toBe(400)
    expect((await g.handle(post({ prompt: 'x'.repeat(5000), size: 16 }))).status).toBe(400)
    const parse = await new Generator(deps({ config: resolveConfig({ mock: 'hostile', minIntervalMs: 0 }) })).handle(post({ prompt: 'cat', size: 16 }))
    expect(parse.status).toBe(422)
    expect(await parse.text()).not.toContain('<script>')
  })

  it('times out slow models', async () => {
    const slow: LlmRuntimeLike = {
      listProviders: () => [],
      prepareCall: async (config, signal) => ({
        config,
        async *stream() {
          await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)))
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }),
    }
    const g = new Generator(deps({ llm: () => slow, config: resolveConfig({ provider: 'p', model: 'm', timeoutMs: 1000, minIntervalMs: 0 }) }))
    expect(await g.generate('cat', 16)).toEqual({ ok: false, error: 'timeout' })
  })

  it('scrubs credentials from messages', () => {
    expect(scrubMessage('bad key sk-1234567890abcdef here')).toBe('bad key [redacted] here')
    expect(scrubMessage('Authorization: Bearer abc.def')).toContain('[redacted]')
  })
})

function loaderCtx(cfg: unknown): HostContext {
  return {
    connection: { fetch: { register: () => () => {} } },
    get: ((n: string) => (n === 'loader' ? { entries: () => [{ options: { id: 'ns' }, fiber: { effectiveConfig: cfg } }] } : undefined)) as HostContext['get'],
    effect: () => undefined,
  }
}

describe('status reflects usable credentials (no model call)', () => {
  const official = { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) }
  const withDirectory = (rows: unknown[]): LlmRuntimeLike => ({ ...fakeLlm([]), listConfigurableProviders: () => rows as never })
  const officialRow = { provider: 'deepseek-official', settingsNs: 'llm-deepseek-api-key', settingsPath: [] }

  it('default model present but no key anywhere → configured:false', async () => {
    const describeRef = vi.fn(async () => ({ configured: false }))
    const g = new Generator(deps({ llm: () => withDirectory([officialRow]), defaultModel: () => official, credentials: () => ({ describe: describeRef }) }))
    expect(await g.status()).toEqual({ configured: false, route: 'host', model: 'deepseek-v4-flash', verified: true })
    expect(describeRef).toHaveBeenCalledWith('DEEPSEEK_API_KEY')
  })

  it('default model with a stored key → configured and verified', async () => {
    const g = new Generator(deps({ llm: () => withDirectory([officialRow]), defaultModel: () => official, credentials: () => ({ describe: () => ({ configured: true }) }) }))
    expect(await g.status()).toMatchObject({ configured: true, route: 'host', verified: true })
  })

  it('missing DSH credential but a direct key reports the direct fallback (generate order)', async () => {
    const g = new Generator(deps({
      llm: () => withDirectory([officialRow]), defaultModel: () => official,
      credentials: () => ({ describe: () => ({ configured: false }) }),
      env: n => (n === 'DEEPSEEK_API_KEY' ? 'sk-direct' : undefined),
    }))
    expect(await g.status()).toMatchObject({ configured: true, route: 'direct', verified: true })
  })

  it('checks the profile apiKeyEnv, derived names and native env names', async () => {
    const seen: string[] = []
    const g = new Generator(deps({
      llm: () => withDirectory([{ provider: 'open-router', settingsNs: 'pi', settingsPath: ['profiles', 'x'], nativeAuth: { env: ['OPENROUTER_API_KEY'] } }]),
      defaultModel: () => ({ currentSelection: () => ({ provider: 'open-router', model: 'm' }) }),
      credentials: () => ({ describe: (ref: string) => { seen.push(ref); return { configured: ref === 'OPENROUTER_API_KEY' } } }),
    }))
    expect(await g.status()).toMatchObject({ configured: true, verified: true })
    expect(seen).toEqual([deriveKeyRef('open-router'), 'OPENROUTER_API_KEY'])
    expect(deriveKeyRef('open-router')).toBe('OPEN_ROUTER_API_KEY')
    const custom = new Generator(deps({
      llm: () => withDirectory([officialRow]), defaultModel: () => official,
      credentials: () => ({ describe: (ref: string) => ({ configured: ref === 'MY_DS_KEY' }) }),
      profileKeyRef: () => 'MY_DS_KEY',
    }))
    expect(await custom.status()).toMatchObject({ configured: true, verified: true })
  })

  it('falls back to the launch environment without a credentials service', async () => {
    const make = (key?: string) => new Generator(deps({ llm: () => withDirectory([officialRow]), defaultModel: () => official, env: n => (n === 'DEEPSEEK_API_KEY' ? key : undefined), config: resolveConfig({ minIntervalMs: 0, apiKeyEnv: 'OTHER_KEY' }) }))
    expect(await make('sk-x').status()).toMatchObject({ configured: true, route: 'host', verified: true })
    expect(await make().status()).toMatchObject({ configured: false, verified: true })
  })

  it('says "unverified" (not "missing") when only a model call could tell', async () => {
    const account = new Generator(deps({ llm: () => withDirectory([]), defaultModel: () => ({ currentSelection: () => ({ provider: 'deepseek-account', model: 'm' }) }) }))
    expect(await account.status()).toMatchObject({ configured: true, verified: false })
    const oauth = new Generator(deps({ llm: () => withDirectory([{ provider: 'gh', nativeAuth: { oauth: true } }]), defaultModel: () => ({ currentSelection: () => ({ provider: 'gh', model: 'm' }) }) }))
    expect(await oauth.status()).toMatchObject({ configured: true, verified: false })
    const broken = new Generator(deps({ llm: () => withDirectory([officialRow]), defaultModel: () => official, credentials: () => ({ describe: () => Promise.reject(new Error('down')) }) }))
    expect(await broken.status()).toMatchObject({ configured: true, verified: false })
  })

  it('reads a profile apiKeyEnv from the loader (string or volatile)', () => {
    const ctx = loaderCtx
    expect(profileKeyRef(ctx({ apiKeyEnv: { get: () => 'MY_KEY' } }), { provider: 'deepseek-official', settingsNs: 'ns', settingsPath: [] })).toBe('MY_KEY')
    expect(profileKeyRef(ctx({ p: { a: { apiKeyEnv: 'A_KEY' } } }), { provider: 'x', settingsNs: 'ns', settingsPath: ['p', 'a'] })).toBe('A_KEY')
    expect(profileKeyRef(ctx({ apiKeyEnv: 'sk-not-a-name' }), { provider: 'x', settingsNs: 'ns' })).toBeUndefined()
    expect(profileKeyRef(ctx({}), { provider: 'x', settingsNs: 'other' })).toBeUndefined()
  })
})

describe('plugin apply', () => {
  it('registers the generate and status routes in the connection fence', async () => {
    const routes: FetchRoute[] = []
    const ctx: HostContext = {
      connection: { fetch: { register: r => { routes.push(r); return () => {} } } },
      get: (() => undefined) as HostContext['get'],
      effect: () => undefined,
    }
    expect(inject.connection.required).toBe(true)
    expect(inject.credentials.required).toBe(false)
    apply(ctx, { mock: 'ok' })
    expect(routes.map(r => [r.path, r.methods])).toEqual([[GENERATE_PATH, ['POST']], [STATUS_PATH, ['GET']]])
    const status = await routes[1]!.fetch(new Request('http://x/api/pindou.status'))
    expect(await status.json()).toMatchObject({ configured: true, route: 'mock' })
    expect(() => apply(ctx, { nope: 1 })).toThrow()
  })
})
