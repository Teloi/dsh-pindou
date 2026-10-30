// Fixture: the entry and its lazy module share ./shared.ts, which the DSH loader cannot serve.
import { shared } from './shared.ts'
export const now = shared('entry')
export const load = async (): Promise<string> => (await import('./lazy-shared.ts')).lazyShared()
