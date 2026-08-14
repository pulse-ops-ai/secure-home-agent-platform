/**
 * EVERY PORT CALL IS BOUNDED, BY BINDING THE PORTS.
 *
 * The previous answer to "is every port bounded?" was to race the WALK
 * against the deadline and abandon it when the race was lost. That
 * bounds the caller's wait and nothing else: a JavaScript continuation
 * cannot be cancelled, so the abandoned walk kept running — reading
 * authority for a run that had already concluded, emitting
 * `capability.granted` after the abort, and mutating the very conclusion
 * the caller was holding. And because the abandoning path had the scope
 * but neither an `Authority` nor `Observations`, a terminal it reached
 * wrote no governed record at all: which record a run got came down to
 * whether the hung port answered inside a grace window.
 *
 * The bound belongs at the PORT, not at the walk and not at the call
 * site. A call site can forget; a port cannot, because nothing reaches a
 * port except through this. That is the same argument the fence makes
 * about the resource, applied to time.
 *
 * Two properties, both structural:
 *
 *   an aborted run does not START a call — the thunk is not invoked
 *   a call outstanding when the abort arrives RAISES, so the walk
 *   returns through its own terminal path and seals its own record
 *
 * The raise is what makes the difference from `until()`'s `undefined`:
 * a value has to be checked by whoever received it, and an exception
 * unwinds to the one handler that knows what the run had established.
 */
import type { Ports } from '../ports/index.js'
import type { InterruptReason, RunDeadline } from './deadline.js'
import { CLEANUP_BUDGET_MS } from './controls.js'

/**
 * Thrown when the run's budget or cancellation reaches an outstanding
 * call. Caught by the walk, which knows what the run had established and
 * therefore which governed record the terminal owes.
 */
export class RunAborted extends Error {
  readonly reason: InterruptReason

  constructor(reason: InterruptReason) {
    super(`the run was ${reason === 'cancel' ? 'cancelled' : 'timed out'}`)
    this.name = 'RunAborted'
    this.reason = reason
  }
}

/**
 * The ports that are NOT bounded, and why each is safe.
 *
 * `clock` is synchronous — there is nothing to wait for, and wrapping it
 * would turn a timestamp into a promise. Everything else is bounded,
 * including the ports nobody currently thinks can hang, because the
 * point is that a port added later inherits the bound without anyone
 * remembering to give it one.
 */
const UNBOUNDED = new Set<string>(['clock'])

const bindPort = <T extends object>(port: T, deadline: RunDeadline): T =>
  new Proxy(port, {
    get(target, property, receiver): unknown {
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== 'function') return value
      const method = value.bind(target) as (...args: readonly unknown[]) => unknown
      return (...args: readonly unknown[]): unknown => {
        // NOT STARTED once the run is aborted, and THE RAISED REASON
        // rather than a fresh poll. Consulting the caller's
        // interrupt here too would re-ask it on every port call, which
        // changes WHERE a poll-driven cancellation lands — the poll
        // belongs inside `until()`, where it runs while a call is
        // outstanding, and raising there sets the reason this reads.
        const raised = deadline.settling ? undefined : deadline.reason
        if (raised !== undefined) throw new RunAborted(raised)
        const result: unknown = method(...args)
        // A synchronous method on an otherwise asynchronous port: there
        // is no wait to bound, so it passes through rather than becoming
        // a promise the call site does not expect.
        if (!(result instanceof Promise)) return result
        // WRITING THE ENDING is bounded by the cleanup budget rather
        // than by the abort being recorded — see `RunDeadline.settle`.
        if (deadline.settling) {
          return withinBudget(CLEANUP_BUDGET_MS, () => result as Promise<unknown>).then(
            (settled) => {
              if (!settled.ok) throw new RunAborted(deadline.reason ?? 'timeout')
              return settled.value
            },
          )
        }
        const pending: Promise<unknown> = result
        return deadline
          .until(() => pending)
          .then((settled: unknown) => {
            if (settled === undefined) throw new RunAborted(deadline.reason ?? 'cancel')
            return settled
          })
      }
    },
  })

/**
 * Bind every port to the run's deadline.
 *
 * The returned object is the ONLY one the walk sees. `RunEnvironment.ports`
 * is this, so there is no unbound path to a port from inside a run.
 */
export const boundPorts = (ports: Ports, deadline: RunDeadline): Ports => {
  const bound: Record<string, unknown> = {}
  for (const [name, port] of Object.entries(ports)) {
    bound[name] =
      UNBOUNDED.has(name) || typeof port !== 'object' || port === null
        ? port
        : bindPort(port as object, deadline)
  }
  return bound as unknown as Ports
}

/**
 * Bound a call that happens OUTSIDE a run's deadline.
 *
 * Two of them exist: the lease claim, which precedes the scope the
 * deadline is built from, and the cleanup, which follows the disarm. A
 * run hung in either never resolved at all — `run()` is what every
 * caller relies on to know the run is over, and it was unbounded at both
 * ends of the very mechanism that exists to bound it.
 */
export const withinBudget = async <T>(
  budgetMs: number,
  work: () => Promise<T>,
): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false }> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work().then((value) => ({ ok: true as const, value })),
      new Promise<{ readonly ok: false }>((resolve) => {
        timer = setTimeout(() => {
          resolve({ ok: false })
        }, budgetMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
