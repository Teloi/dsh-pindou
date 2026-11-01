/**
 * A minimal in-memory IndexedDB for tests: just the slice save-store.ts uses
 * (open + upgrade, one keyPath store, get / getAll / put / delete, transaction
 * completion), asynchronous like the real thing, with fault switches.
 */
interface Faults {
  /** `open` fails (private mode, blocked, …); `late` succeeds only after 150 ms. */
  open?: 'error' | 'hang' | 'throw' | 'late'
  /** `put` transactions abort. */
  put?: boolean
  /** Reads return a damaged copy (to prove read-back verification). */
  readBack?: boolean
}

class Req<T> extends EventTarget {
  result!: T
  error: Error | null = null
  fire(type: string): void { this.dispatchEvent(new Event(type)) }
}

const later = (fn: () => void): void => { setTimeout(fn, 0) }

class Tx extends EventTarget {
  error: Error | null = null
  constructor(readonly store: unknown) { super() }
  objectStore(): unknown { return this.store }
  finish(fail: boolean): void {
    later(() => {
      if (fail) { this.error = new Error('AbortError'); this.dispatchEvent(new Event('abort')) } else this.dispatchEvent(new Event('complete'))
    })
  }
}

export class FakeIdb {
  readonly data = new Map<string, Map<string, unknown>>()
  faults: Faults = {}
  /** Connections closed by the code under test. */
  closed = 0

  open(_name: string, _version?: number): IDBOpenDBRequest {
    if (this.faults.open === 'throw') throw new Error('SecurityError')
    const r = new Req<unknown>()
    if (this.faults.open === 'hang') return r as unknown as IDBOpenDBRequest
    const go = this.faults.open === 'late' ? (fn: () => void): void => { setTimeout(fn, 150) } : later
    go(() => {
      if (this.faults.open === 'error') { r.error = new Error('InvalidStateError'); r.fire('error'); return }
      r.result = this.db()
      if (this.data.size === 0) r.fire('upgradeneeded')
      r.fire('success')
    })
    return r as unknown as IDBOpenDBRequest
  }

  private db(): IDBDatabase {
    const data = this.data
    const faults = (): Faults => this.faults
    return {
      close: () => { this.closed++ },
      objectStoreNames: { contains: (n: string) => data.has(n) },
      createObjectStore: (n: string) => { data.set(n, new Map()) },
      transaction: (n: string, mode: string) => {
        const rows = data.get(n)!
        const store = {
          get: (id: string) => {
            const r = new Req<unknown>()
            later(() => {
              const v = rows.get(id)
              r.result = v === undefined ? undefined : structuredClone(v)
              if (faults().readBack && r.result) (r.result as { code: string }).code += '!'
              r.fire('success')
            })
            tx.finish(false)
            return r
          },
          getAll: () => {
            const r = new Req<unknown[]>()
            later(() => { r.result = [...rows.values()].map(v => structuredClone(v)); r.fire('success') })
            tx.finish(false)
            return r
          },
          put: (v: { id: string }) => {
            if (mode !== 'readwrite') throw new Error('ReadOnlyError')
            if (!faults().put) rows.set(v.id, structuredClone(v))
            tx.finish(faults().put === true)
            return new Req()
          },
          delete: (id: string) => {
            rows.delete(id)
            tx.finish(false)
            return new Req()
          },
        }
        const tx = new Tx(store)
        return tx
      },
    } as unknown as IDBDatabase
  }
}

/** localStorage with `length` / `key(i)`, a quota and failure switches. */
export function fakeLocal(quota = 5 * 1024 * 1024): Storage & { data: Map<string, string>; failRemove: boolean; broken: boolean } {
  const data = new Map<string, string>()
  const self = {
    data,
    failRemove: false,
    broken: false,
    get length() { return data.size },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => { if (self.broken) throw new Error('SecurityError'); return data.get(k) ?? null },
    setItem: (k: string, v: string) => {
      if (self.broken) throw new Error('SecurityError')
      const used = [...data].reduce((n, [a, b]) => n + a.length + b.length, 0) - (data.get(k)?.length ?? 0)
      if (used + k.length + v.length > quota) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => { if (self.failRemove || self.broken) throw new Error('SecurityError'); data.delete(k) },
    clear: () => { data.clear() },
  }
  return self
}
