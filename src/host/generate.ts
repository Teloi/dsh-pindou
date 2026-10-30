import {
  type BoardSize, encode, type GenerateErrorCode, type GenerateResponse, isBoardSize, MAX_RAW_CHARS, repairGrid,
  sanitizePrompt, systemPrompt, type TokenUsageInfo, userPrompt,
} from '../core/index.ts'
import type { PindouConfig } from './config.ts'
import { mockReply } from './mock.ts'
import type { ConfigurableProviderLike, CredentialsLike, DefaultModelLike, LlmFailure, LlmRuntimeLike } from './types.ts'

/** Everything the generator reads from the outside world, injectable for tests. */
export interface GeneratorDeps {
  readonly config: PindouConfig
  readonly llm: () => LlmRuntimeLike | undefined
  readonly defaultModel: () => DefaultModelLike | undefined
  readonly env: (name: string) => string | undefined
  readonly fetch: typeof fetch
  readonly now: () => number
  /** Aborted when the plugin is disposed. */
  readonly lifetime: AbortSignal
  /** DSH credential metadata (`describe` only); absent on hosts without the service. */
  readonly credentials?: () => CredentialsLike | undefined
  /** A provider profile's custom `apiKeyEnv`, when the host exposes it. */
  readonly profileKeyRef?: (entry: ConfigurableProviderLike) => string | undefined
  /** Simulated latency of mock replies (default 700 ms, so the UI's busy state is visible). */
  readonly mockDelayMs?: number
}

interface RawReply {
  readonly text: string
  readonly finish: 'stop' | 'max-tokens'
  readonly usage?: TokenUsageInfo | undefined
  readonly model: string
}

class GenerationError extends Error {
  constructor(readonly code: GenerateErrorCode, message: string, readonly usage?: TokenUsageInfo) {
    super(message)
  }
}

export const MAX_BODY_BYTES = 2048

const DEEPSEEK_API_HOST = 'api.deepseek.com'

/**
 * Whether the direct request should carry DeepSeek's `thinking` switch: always
 * on DeepSeek's own API, and for DeepSeek's own model ids (`deepseek-…` with no
 * `/`, e.g. `deepseek-flash`) behind another OpenAI-compatible host. Namespaced
 * ids such as `deepseek-ai/DeepSeek-V3` and other models on other hosts never
 * get the field, so a strict server cannot reject it as unknown.
 */
export function wantsThinkingOff(baseUrl: string, model: string): boolean {
  let host = ''
  try { host = new URL(baseUrl).hostname.toLowerCase() } catch { /* validated in resolveConfig */ }
  return host === DEEPSEEK_API_HOST || /^deepseek-[^/]*$/i.test(model)
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

/** Codes from the dsh-llm failure taxonomy that mean "set up a model first". */
const NOT_CONFIGURED_CODES = new Set(['MISSING_CREDENTIAL', 'NO_ADAPTER', 'AUTH', 'UNKNOWN_PROVIDER', 'UNKNOWN_MODEL'])

function failureCode(failure: Partial<LlmFailure> | undefined): GenerateErrorCode {
  const code = failure?.code ?? ''
  if (NOT_CONFIGURED_CODES.has(code) || failure?.status === 401 || failure?.status === 403) return 'not-configured'
  if (code === 'RATE_LIMIT' || failure?.status === 429) return 'rate-limited'
  if (code === 'TIMEOUT' || code === 'ABORTED') return 'timeout'
  return 'upstream'
}

/** Strip anything that looks like a credential before a message leaves the Host. */
export function scrubMessage(message: unknown): string {
  return String(message ?? '')
    .replace(/(sk|key|token)[-_][A-Za-z0-9_-]{8,}/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 200)
}

/** The Models page's fallback credential name for a provider (`ui-settings-models` deriveKeyRef). */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Credential state of a DSH provider, judged from metadata only (no model call). */
export type CredentialState = 'ok' | 'missing' | 'unknown'

const DESCRIBE_TIMEOUT_MS = 3000

export interface StatusResult {
  readonly configured: boolean
  readonly route: RouteKind
  readonly model?: string | undefined
  readonly verified: boolean
}

/** Which route a generation would take right now. */
export type RouteKind = 'mock' | 'host' | 'direct' | 'none'

export class Generator {
  private inFlight = false
  private lastStart = Number.NEGATIVE_INFINITY

  constructor(private readonly deps: GeneratorDeps) {}

  /** Route preference: mock → pinned route → DSH default model → direct DeepSeek key → none. */
  route(): { kind: RouteKind; provider?: string; model?: string } {
    const { config } = this.deps
    if (config.mock !== false) return { kind: 'mock', model: `mock:${config.mock}` }
    const llm = this.deps.llm()
    if (llm !== undefined) {
      if (config.provider !== undefined && config.model !== undefined) {
        return { kind: 'host', provider: config.provider, model: config.model }
      }
      try {
        const selection = this.deps.defaultModel()?.currentSelection()
        if (selection?.provider && selection.model) return { kind: 'host', provider: selection.provider, model: selection.model }
      } catch { /* no default model configured */ }
    }
    if (this.apiKey() !== undefined) return { kind: 'direct', model: config.fallbackModel }
    return { kind: 'none' }
  }

  private apiKey(): string | undefined {
    const value = this.deps.env(this.deps.config.apiKeyEnv)?.trim()
    return value ? value : undefined
  }

  /**
   * Whether a generation can work right now, without spending tokens. For the
   * DSH default-model route this checks the provider's credential the way the
   * Models page does; when a missing credential would fall back to the direct
   * key, that route is reported instead (same order as `call`).
   */
  async status(): Promise<StatusResult> {
    const r = this.route()
    if (r.kind !== 'host') return { configured: r.kind !== 'none', route: r.kind, model: r.model, verified: true }
    const state = await this.credentialState(r.provider!)
    if (state === 'missing') {
      if (this.apiKey() !== undefined) return { configured: true, route: 'direct', model: this.deps.config.fallbackModel, verified: true }
      return { configured: false, route: 'host', model: r.model, verified: true }
    }
    return { configured: true, route: 'host', model: r.model, verified: state === 'ok' }
  }

  /**
   * Credential metadata for one provider. `unknown` whenever the host cannot
   * tell without a model call: account / OAuth logins, providers outside the
   * configurable directory, or a missing / failing credentials service.
   */
  async credentialState(provider: string): Promise<CredentialState> {
    // DeepSeek account login is a session, checked by its model catalog, not a key.
    if (provider === 'deepseek-account') return 'unknown'
    let entry: ConfigurableProviderLike | undefined
    try { entry = this.deps.llm()?.listConfigurableProviders?.().find(row => row.provider === provider) } catch { entry = undefined }
    if (entry === undefined || entry.nativeAuth?.oauth === true) return 'unknown'
    const refs = new Set<string>()
    let custom: string | undefined
    try { custom = this.deps.profileKeyRef?.(entry) } catch { custom = undefined }
    refs.add(custom ?? (provider === 'deepseek-official' ? 'DEEPSEEK_API_KEY' : deriveKeyRef(provider)))
    for (const env of entry.nativeAuth?.env ?? []) refs.add(env)
    const credentials = this.deps.credentials?.()
    for (const ref of refs) {
      if (credentials === undefined) {
        if (this.deps.env(ref)?.trim()) return 'ok'
        continue
      }
      try {
        const described = await Promise.race([
          Promise.resolve(credentials.describe(ref)),
          new Promise<never>((_, reject) => { setTimeout(() => { reject(new Error('timeout')) }, DESCRIBE_TIMEOUT_MS).unref?.() }),
        ])
        if (described.configured) return 'ok'
      } catch { return 'unknown' }
    }
    return 'missing'
  }

  /** HTTP face: POST JSON {prompt, size} → GenerateResponse. */
  async handle(request: Request): Promise<Response> {
    const reply = await this.respond(request)
    const status = reply.ok ? 200 : ({
      'bad-request': 400, 'not-configured': 503, busy: 409, 'rate-limited': 429, parse: 422, upstream: 502, timeout: 504,
    } satisfies Record<GenerateErrorCode, number>)[reply.error]
    return Response.json(reply, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  }

  private async respond(request: Request): Promise<GenerateResponse> {
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return { ok: false, error: 'bad-request', message: 'expected application/json' }
    }
    const body = await request.text().catch(() => '')
    if (body.length > MAX_BODY_BYTES) return { ok: false, error: 'bad-request', message: 'body too large' }
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { return { ok: false, error: 'bad-request', message: 'invalid JSON' } }
    const { prompt, size } = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
    const subject = sanitizePrompt(prompt)
    if (subject === '') return { ok: false, error: 'bad-request', message: 'prompt is empty' }
    if (!isBoardSize(size)) return { ok: false, error: 'bad-request', message: 'size must be 12, 16 or 24' }
    return this.generate(subject, size, request.signal)
  }

  async generate(subject: string, size: BoardSize, signal?: AbortSignal): Promise<GenerateResponse> {
    if (this.inFlight) return { ok: false, error: 'busy' }
    const now = this.deps.now()
    if (now - this.lastStart < this.deps.config.minIntervalMs) return { ok: false, error: 'rate-limited' }
    const route = this.route()
    if (route.kind === 'none') return { ok: false, error: 'not-configured' }
    this.inFlight = true
    this.lastStart = now
    const timeout = AbortSignal.timeout(this.deps.config.timeoutMs)
    const combined = AbortSignal.any([timeout, this.deps.lifetime, ...(signal ? [signal] : [])])
    try {
      const raw = await this.call(route, subject, size, combined)
      const repaired = repairGrid(raw.text, size)
      if (!repaired.ok) return { ok: false, error: 'parse', message: repaired.error, usage: raw.usage }
      return {
        ok: true, size, flat: encode(repaired.board), issues: repaired.issues, repaired: repaired.repaired,
        usage: raw.usage, model: raw.model, finish: raw.finish,
      }
    } catch (error) {
      if (timeout.aborted) return { ok: false, error: 'timeout' }
      if (error instanceof GenerationError) return { ok: false, error: error.code, message: error.message, usage: error.usage }
      return { ok: false, error: 'upstream', message: scrubMessage((error as Error)?.message) }
    } finally {
      this.inFlight = false
    }
  }

  private async call(route: ReturnType<Generator['route']>, subject: string, size: BoardSize, signal: AbortSignal): Promise<RawReply> {
    switch (route.kind) {
      case 'mock': return this.callMock(subject, size, signal)
      case 'host':
        try {
          return await this.callHost(route.provider!, route.model!, subject, size, signal)
        } catch (error) {
          // A DSH route without working credentials falls back to the direct key, when there is one.
          if (error instanceof GenerationError && error.code === 'not-configured' && this.apiKey() !== undefined) {
            return this.callDirect(subject, size, signal)
          }
          throw error
        }
      case 'direct': return this.callDirect(subject, size, signal)
      default: throw new GenerationError('not-configured', 'no model route')
    }
  }

  private async callMock(subject: string, size: BoardSize, signal: AbortSignal): Promise<RawReply> {
    const mode = this.deps.config.mock === false ? 'ok' : this.deps.config.mock
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, this.deps.mockDelayMs ?? 700)
      signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
    })
    const reply = mockReply(mode, subject, size)
    const usage: TokenUsageInfo = {
      input: Math.ceil((systemPrompt(size).length + userPrompt(subject).length) / 4),
      output: Math.ceil(reply.text.length / 3),
    }
    if (reply.finish === 'error') throw new GenerationError(failureCode(reply.failure), reply.failure?.message ?? 'error')
    return { text: reply.text, finish: reply.finish, usage, model: `mock:${mode}` }
  }

  private async callHost(provider: string, model: string, subject: string, size: BoardSize, signal: AbortSignal): Promise<RawReply> {
    const llm = this.deps.llm()
    if (llm === undefined) throw new GenerationError('not-configured', 'llm service unavailable')
    let call
    try {
      call = await llm.prepareCall({ provider, model, maxTokens: this.deps.config.maxTokens }, signal, (controls, info) => {
        // Least supported reasoning effort: the answer is a fixed-shape grid, not a proof.
        const effort = info.reasoning?.efforts[0]?.id
        return { ...controls, maxTokens: this.deps.config.maxTokens, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
      })
    } catch (error) {
      const e = error as Partial<LlmFailure>
      throw new GenerationError(failureCode(e), scrubMessage(e.message))
    }
    let text = ''
    let usage: TokenUsageInfo | undefined
    let finish: RawReply['finish'] = 'stop'
    const options = {
      ...call.config,
      system: systemPrompt(size),
      messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt(subject) }] }],
      signal,
    }
    for await (const chunk of call.stream(options)) {
      if (chunk.type === 'text-delta') {
        text += (chunk as { text: string }).text
        if (text.length > MAX_RAW_CHARS) break
      } else if (chunk.type === 'usage') {
        const u = (chunk as { usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number } }).usage
        usage = { input: u.inputTokens, output: u.outputTokens, reasoning: u.reasoningTokens }
      } else if (chunk.type === 'finish') {
        const reason = (chunk as { reason: { kind: string; failure?: LlmFailure } }).reason
        if (reason.kind === 'max-tokens') finish = 'max-tokens'
        else if (reason.kind === 'error' || reason.kind === 'aborted') {
          throw new GenerationError(reason.kind === 'aborted' ? 'timeout' : failureCode(reason.failure), scrubMessage(reason.failure?.message), usage)
        }
      }
    }
    return { text, finish, usage, model: `${provider}/${model}` }
  }

  private async callDirect(subject: string, size: BoardSize, signal: AbortSignal): Promise<RawReply> {
    const key = this.apiKey()
    if (key === undefined) throw new GenerationError('not-configured', `${this.deps.config.apiKeyEnv} is not set`)
    const { baseUrl, fallbackModel, maxTokens } = this.deps.config
    let response: Response
    try {
      response = await this.deps.fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: fallbackModel,
          max_tokens: maxTokens,
          temperature: 0.7,
          stream: false,
          // DeepSeek models think by default, and reasoning counts against max_tokens:
          // a fixed-shape grid needs none of it (api-docs.deepseek.com/guides/thinking_mode).
          ...(wantsThinkingOff(baseUrl, fallbackModel) ? { thinking: { type: 'disabled' } } : {}),
          messages: [{ role: 'system', content: systemPrompt(size) }, { role: 'user', content: userPrompt(subject) }],
        }),
      })
    } catch (error) {
      if (signal.aborted) throw error
      throw new GenerationError('upstream', 'network error')
    }
    const bodyText = (await response.text()).slice(0, 65_536)
    if (!response.ok) {
      throw new GenerationError(failureCode({ status: response.status, code: '' }), `HTTP ${response.status}`)
    }
    let data: unknown
    try { data = JSON.parse(bodyText) } catch { throw new GenerationError('upstream', 'invalid JSON from provider') }
    const d = data as {
      choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } }
    }
    const choice = d.choices?.[0]
    // Only the answer counts; `reasoning_content` (thinking mode) is never parsed as a grid.
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : ''
    const usage: TokenUsageInfo | undefined = d.usage
      ? { input: num(d.usage.prompt_tokens), output: num(d.usage.completion_tokens), reasoning: num(d.usage.completion_tokens_details?.reasoning_tokens) || undefined }
      : undefined
    return { text, finish: choice?.finish_reason === 'length' ? 'max-tokens' : 'stop', usage, model: `deepseek/${fallbackModel}` }
  }
}
