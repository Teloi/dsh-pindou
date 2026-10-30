// Fixture for tests/bundle-split.test.ts: an entry with one lazy, self-contained module.
export const load = async (): Promise<string> => (await import('./lazy.ts')).lazy(2)
