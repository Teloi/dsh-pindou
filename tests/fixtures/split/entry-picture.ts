// The real picture chunk behind an entry that shares nothing with it: builds.
export const load = async (): Promise<unknown> => import('../../../src/client/picture.tsx')
