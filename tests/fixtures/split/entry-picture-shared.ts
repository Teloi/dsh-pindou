// Counterexample (audit T1): the real picture chunk plus an entry that also imports
// one of its local modules (src/core/quantize.ts). The DSH loader cannot serve a
// module shared by the entry and a chunk, so this build must fail.
import { MIN_BEADS } from '../../../src/core/quantize.ts'
export const min = MIN_BEADS
export const load = async (): Promise<unknown> => import('../../../src/client/picture.tsx')
