export type MockMode = 'ok' | 'malformed' | 'truncated' | 'hostile' | 'error' | 'not-configured'

export interface PindouConfig {
  /** Pin a route registered with ctx.llm; must be given together with `model`. */
  readonly provider?: string | undefined
  readonly model?: string | undefined
  /** Environment variable holding a DeepSeek API key for the direct fallback. */
  readonly apiKeyEnv: string
  readonly baseUrl: string
  /**
   * Model used by the direct fallback. DeepSeek retired `deepseek-chat` on
   * 2026-07-24; `deepseek-flash` is the current name (thinking on by default,
   * so the direct call turns it off).
   */
  readonly fallbackModel: string
  /** Hard output cap per generation (reasoning included on reasoning models). */
  readonly maxTokens: number
  readonly timeoutMs: number
  /** Minimum gap between two generations. */
  readonly minIntervalMs: number
  /** Deterministic offline replies for tests and demos; never set in normal use. */
  readonly mock: false | MockMode
}

export const DEFAULT_CONFIG: PindouConfig = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseUrl: 'https://api.deepseek.com',
  fallbackModel: 'deepseek-flash',
  maxTokens: 1024,
  timeoutMs: 30_000,
  minIntervalMs: 1500,
  mock: false,
}

const KEYS = new Set(['provider', 'model', 'apiKeyEnv', 'baseUrl', 'fallbackModel', 'maxTokens', 'timeoutMs', 'minIntervalMs', 'mock'])
const MOCKS: readonly MockMode[] = ['ok', 'malformed', 'truncated', 'hostile', 'error', 'not-configured']

function fail(message: string): never {
  throw new Error(`dsh-pindou: ${message}`)
}

function int(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer in [${min}, ${max}]`)
  }
  return value
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} must be a non-empty string`)
  return value
}

/** Validate plugin config loudly: unknown keys and bad values fail plugin load. */
export function resolveConfig(input: unknown): PindouConfig {
  if (input === undefined || input === null) return DEFAULT_CONFIG
  if (typeof input !== 'object' || Array.isArray(input)) fail('config must be an object')
  const raw = input as Record<string, unknown>
  for (const key of Object.keys(raw)) if (!KEYS.has(key)) fail(`unknown config key "${key}"`)
  const c: { -readonly [K in keyof PindouConfig]: PindouConfig[K] } = { ...DEFAULT_CONFIG }
  if ((raw['provider'] === undefined) !== (raw['model'] === undefined)) fail('provider and model must be given together')
  if (raw['provider'] !== undefined) {
    c.provider = str('provider', raw['provider'])
    c.model = str('model', raw['model'])
  }
  if (raw['apiKeyEnv'] !== undefined) {
    c.apiKeyEnv = str('apiKeyEnv', raw['apiKeyEnv'])
    if (!/^[A-Z_][A-Z0-9_]*$/.test(c.apiKeyEnv)) fail('apiKeyEnv must name an environment variable (A-Z, 0-9, _)')
  }
  if (raw['baseUrl'] !== undefined) {
    c.baseUrl = str('baseUrl', raw['baseUrl']).replace(/\/+$/, '')
    if (!c.baseUrl.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(c.baseUrl)) {
      fail('baseUrl must be https:// (or http://localhost for testing)')
    }
  }
  if (raw['fallbackModel'] !== undefined) c.fallbackModel = str('fallbackModel', raw['fallbackModel'])
  if (raw['maxTokens'] !== undefined) c.maxTokens = int('maxTokens', raw['maxTokens'], 64, 8192)
  if (raw['timeoutMs'] !== undefined) c.timeoutMs = int('timeoutMs', raw['timeoutMs'], 1000, 120_000)
  if (raw['minIntervalMs'] !== undefined) c.minIntervalMs = int('minIntervalMs', raw['minIntervalMs'], 0, 60_000)
  if (raw['mock'] !== undefined) {
    const m = raw['mock']
    if (m === false) c.mock = false
    else if (m === true) c.mock = 'ok'
    else if (MOCKS.includes(m as MockMode)) c.mock = m as MockMode
    else fail(`mock must be false, true or one of ${MOCKS.join(', ')}`)
  }
  return Object.freeze(c)
}
