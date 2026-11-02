/**
 * The big page's saves and share codes (plan §4.3), split out of lib/client.big.js into
 * lib/client.big-store.js: the save store (IndexedDB, localStorage fallback) and the pd2 codec
 * it writes. big.tsx fetches it as the page opens, alongside the setup page (which shows at
 * once); a board only waits for it to save, never to draw. If it can't load, the page works
 * without saves and says so (big.tsx).
 */
import { encodeV4, parseShareCode, shareCodeFits } from '../core/codec-v4.ts'
import { SaveStore, UNSAVED_SLOW, UNSAVED_TOO_BIG } from '../core/save-store.ts'

export { encodeV4, parseShareCode, SaveStore, shareCodeFits, UNSAVED_SLOW, UNSAVED_TOO_BIG }
/** The ⋯ menu's shortcut list rides here, off the first screen (keys.ts). */
export { KEYS } from './keys.ts'

/** `localStorage` itself throws where storage is blocked (sandboxed frames, some private modes). */
function localOrNone(): Storage | undefined {
  try { return globalThis.localStorage } catch { return undefined }
}

/** Open the store; saves made while IDB was down move over once it works again (plan §4.3). */
export const openStore = (): Promise<SaveStore> => SaveStore.open({ idb: globalThis.indexedDB, local: localOrNone(), storageManager: globalThis.navigator?.storage })
  .then(async (s) => { await s.migrate().catch(() => {}); return s })
