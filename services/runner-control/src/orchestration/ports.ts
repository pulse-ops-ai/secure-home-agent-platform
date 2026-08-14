/**
 * THE ASYNC PORT BOUNDARY, guarded once.
 *
 * The earlier implementation raced the whole walk against the deadline.
 * That bounded the caller's wait by abandoning a still-running JavaScript
 * continuation. Once the port eventually answered, that continuation
 * resumed and started the rest of the phase for a run that had already
 * concluded.
 *
 * Here every asynchronous port method is reached through one proxy. The
 * coordinator races the CALL, so an interrupt rejects the awaiting
 * continuation and unwinds the phase. The underlying promise may still
 * settle, but no orchestration continuation remains attached to its value
 * and therefore no next effect can start.
 *
 * `clock.now()` is synchronous and deliberately unwrapped. It cannot hold
 * the run open, and keeping it direct preserves the clock port's contract.
 */
import type { Ports } from '../ports/index.js'
import type { CallGuard } from './deadline.js'

const guarded = <T extends object>(port: T, boundary: CallGuard): T =>
  new Proxy(port, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        boundary.call(() =>
          Promise.resolve(Reflect.apply(value as (...input: unknown[]) => unknown, target, args)),
        )
    },
  })

/**
 * Decorate the complete asynchronous port set.
 *
 * Adding a method to an existing port is covered automatically. Adding a
 * new port to `Ports` makes this object fail to type-check until the new
 * boundary is explicitly admitted here.
 */
export const guardPorts = (ports: Ports, boundary: CallGuard): Ports => ({
  authority: guarded(ports.authority, boundary),
  journal: guarded(ports.journal, boundary),
  lease: guarded(ports.lease, boundary),
  finalization: guarded(ports.finalization, boundary),
  session: guarded(ports.session, boundary),
  workspace: guarded(ports.workspace, boundary),
  observer: guarded(ports.observer, boundary),
  artifacts: guarded(ports.artifacts, boundary),
  execution: guarded(ports.execution, boundary),
  adapter: guarded(ports.adapter, boundary),
  events: guarded(ports.events, boundary),
  evidence: guarded(ports.evidence, boundary),
  clock: ports.clock,
})
