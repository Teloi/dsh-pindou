/**
 * The slice of the DSH Host API this package uses, declared structurally so
 * the package builds and tests without the (unpublished) harness workspace.
 * Shapes mirror @deepseek-ai/dsh-llm, @deepseek-ai/dsh-client-connection and
 * @deepseek-ai/dsh-agent-default-model as of dsh 0.2.x.
 */

export interface LlmFailure {
  readonly message: string
  readonly code: string
  readonly status?: number
}

export type StreamChunk =
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number } }
  | { type: 'finish'; reason: { kind: string; failure?: LlmFailure } }
  | { type: string; [key: string]: unknown }

export interface ResolvedModelInfo {
  readonly id?: string
  readonly reasoning?: { readonly efforts: readonly { readonly id: string }[] }
}

export interface CallConfig {
  provider: string
  model: string
  maxTokens?: number
  reasoningEffort?: string
  [key: string]: unknown
}

export interface PreparedCall {
  readonly config: CallConfig
  stream(options: Record<string, unknown>): AsyncIterable<StreamChunk>
}

/** One row of `llm.listConfigurableProviders()` (the Models page directory). */
export interface ConfigurableProviderLike {
  readonly provider: string
  readonly settingsNs?: string
  readonly settingsPath?: readonly string[]
  readonly nativeAuth?: { readonly env?: readonly string[]; readonly oauth?: boolean }
}

export interface LlmRuntimeLike {
  listProviders(): { id: string; name: string }[]
  listConfigurableProviders?(): ConfigurableProviderLike[]
  prepareCall(
    config: CallConfig,
    signal?: AbortSignal,
    configure?: (controls: Record<string, unknown>, model: ResolvedModelInfo) => Record<string, unknown>,
  ): Promise<PreparedCall>
}

export interface DefaultModelLike {
  currentSelection(): { provider: string; model: string }
}

/** `@deepseek-ai/dsh-credentials`: metadata only, never the secret. */
export interface CredentialsLike {
  describe(ref: string): Promise<{ readonly configured: boolean }> | { readonly configured: boolean }
}

/** `loader` rows, read only to find a provider profile's custom `apiKeyEnv`. */
export interface LoaderLike {
  entries(): Iterable<{ readonly options: { readonly id?: string }; readonly fiber?: { readonly effectiveConfig?: unknown } }>
}

export interface FetchRoute {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

export interface ConnectionLike {
  readonly fetch: { register(route: FetchRoute): () => Promise<void> | void }
}

/** The Cordis context members this plugin touches. */
export interface HostContext {
  readonly connection: ConnectionLike
  get(name: 'llm'): LlmRuntimeLike | undefined
  get(name: 'agentDefaultModel'): DefaultModelLike | undefined
  get(name: 'credentials'): CredentialsLike | undefined
  get(name: 'loader'): LoaderLike | undefined
  get(name: string): unknown
  effect(fn: () => (() => void | Promise<void>) | void, label?: string): unknown
  logger?(name: string): { info(...args: unknown[]): void; warn(...args: unknown[]): void }
}
