// Loaded into the DSH Web server (NODE_OPTIONS=--import) by e2e/suite.mjs. The host stamps each chat
// message with the server's clock, and a docked panel's screenshot takes in that stamp, so the server
// clock starts at the suite's fixed instant (E2E_FIXED_NOW, ms), like every page's clock.
//
// It runs at the real rate and only ever moves forward: Date-based deadlines keep their length (a stopped
// or slowed clock makes them wait forever), and the server's newest-write-wins records keep their order
// (a clock set back makes a workspace pick older than the last one, and the host ignores it). On SIGUSR2
// it jumps to the fixed time of day on a later day (the fixed instant plus whole days) plus the offset in
// E2E_CLOCK_FILE (ms): the suite does that before a session whose stamp is shot, and starts that page's
// clock at the same instant, so the stamp shows the fixed time (a minute past it for the counter-proof)
// however long the run took to get there.
import { readFileSync } from 'node:fs'

const fixed = Number(process.env.E2E_FIXED_NOW)
if (Number.isSafeInteger(fixed) && fixed > 0) {
  const Real = globalThis.Date
  const DAY = 86_400_000
  let base = fixed, t0 = performance.now()
  const now = () => base + Math.floor(performance.now() - t0)
  class FixedDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(now()) }
    static now() { return now() }
  }
  // Date() without new returns the current time as a string
  globalThis.Date = new Proxy(FixedDate, { apply: () => new FixedDate().toString() })
  process.on('SIGUSR2', () => {
    let offset = 0
    try { offset = Number(readFileSync(process.env.E2E_CLOCK_FILE ?? '', 'utf8')) || 0 } catch { /* no file: the fixed time of day */ }
    const at = now()
    base = fixed + (Math.floor((at - fixed) / DAY) + 1) * DAY + offset; t0 = performance.now()
  })
}
