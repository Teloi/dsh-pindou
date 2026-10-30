/** Browser side of the Host route: relative URLs (works under a mount path), same-origin credentials. */
import { GENERATE_ROUTE, STATUS_ROUTE, type GenerateResponse, type StatusResponse } from '../core/index.ts'
import type { GameApi } from './game-store.ts'

const MAX_BODY = 64 * 1024

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text.length > MAX_BODY) throw new Error('response too large')
  return JSON.parse(text) as unknown
}

export function fetchApi(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): GameApi {
  return {
    async generate(body, signal) {
      const res = await fetchImpl(GENERATE_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      const data = await readJson(res).catch(() => null)
      if (data && typeof data === 'object' && 'ok' in data) return data as GenerateResponse
      // Auth fence or proxy errors arrive without our envelope.
      return { ok: false, error: 'upstream', message: `HTTP ${res.status}` } as GenerateResponse
    },
    async status(signal) {
      const res = await fetchImpl(STATUS_ROUTE, { credentials: 'same-origin', signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await readJson(res) as Partial<StatusResponse>
      const routes = ['mock', 'host', 'direct', 'none'] as const
      return {
        configured: data.configured === true,
        route: routes.includes(data.route as never) ? data.route! : 'none',
        model: typeof data.model === 'string' ? data.model.slice(0, 80) : undefined,
        // older hosts send no flag: treat as verified (no hint) rather than nag
        verified: data.verified !== false,
      }
    },
  }
}
