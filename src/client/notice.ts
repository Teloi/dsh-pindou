/**
 * The two rare save-failure lines (audit S2-1, designer 22:05). The first screen has no room for
 * them (管家, option 2): they ride in the works chunk (lib/client.works.js re-exports them), so they
 * count toward its budget and the lazy total in check:bundle. While storage is `held` (a save that
 * could not be backed up) the toast says the short 「出错了，已重新开始」 at once (core/i18n.ts `held`
 * and `restart`) and the long line takes its place once the chunk is here; it never waits for it,
 * and when it can't load the short line stays. Keyed by toast: `held` on load, `restart` after a crash.
 */
export const NOTICES = {
  zh: {
    held: '存档读不了，已重新开始。原存档已保留，但这次的进度不会保存',
    restart: '出错了，已重新开始。这次的进度不会保存',
  },
  en: {
    held: 'Could not read the save — started over. It is kept, but progress will not be saved',
    restart: 'Something went wrong — started over. Progress will not be saved',
  },
} as const
