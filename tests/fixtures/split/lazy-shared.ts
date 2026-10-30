import { shared } from './shared.ts'
export const lazyShared = (): string => shared('lazy')
