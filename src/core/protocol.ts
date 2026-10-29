import type { BoardSize } from './board.ts'
import type { RepairIssue } from './repair.ts'

/** Route served by the Host half inside the Connection auth fence. */
export const GENERATE_PATH = '/api/pindou.generate'
/** Document-relative form for the browser (keeps working under a mount path). */
export const GENERATE_ROUTE = GENERATE_PATH.slice(1)
export const STATUS_PATH = '/api/pindou.status'
export const STATUS_ROUTE = STATUS_PATH.slice(1)

export interface StatusResponse {
  readonly configured: boolean
  readonly route: 'mock' | 'host' | 'direct' | 'none'
  readonly model?: string | undefined
}

export interface GenerateRequest {
  readonly prompt: string
  readonly size: BoardSize
}

export interface TokenUsageInfo {
  readonly input: number
  readonly output: number
  readonly reasoning?: number | undefined
}

export type GenerateErrorCode =
  | 'not-configured'
  | 'bad-request'
  | 'busy'
  | 'rate-limited'
  | 'parse'
  | 'upstream'
  | 'timeout'

export type GenerateResponse =
  | {
    readonly ok: true
    readonly size: BoardSize
    /** Flat compact encoding of the validated (and possibly repaired) board. */
    readonly flat: string
    readonly issues: readonly RepairIssue[]
    readonly repaired: boolean
    readonly usage?: TokenUsageInfo | undefined
    readonly model: string
    readonly finish: 'stop' | 'max-tokens'
  }
  | {
    readonly ok: false
    readonly error: GenerateErrorCode
    readonly message?: string | undefined
    readonly usage?: TokenUsageInfo | undefined
  }
