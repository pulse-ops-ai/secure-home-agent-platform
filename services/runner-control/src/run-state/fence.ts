/**
 * Fence enforcement, at the resource.
 *
 * One rule, implemented once so that eight implementations cannot each
 * get it subtly wrong: a resource remembers the highest generation it
 * has served for a run, and refuses anything lower. The current holder's
 * generation is never below its own high-water mark, so it always
 * passes; a dispossessed holder's is, so it never does.
 *
 * WHY THE RESOURCE AND NOT THE LEASE. A sink that had to ask the lease
 * store "is this caller still the owner?" would be a sink that cannot
 * accept a write while the lease store is unreachable — and, worse, one
 * that is tempted to fail OPEN when it is. Remembering one integer per
 * run needs nobody's cooperation and no availability assumption.
 *
 * WHAT THIS DOES NOT DO, stated rather than implied. A fencing token is
 * only checkable against what the resource has already seen. If a stale
 * holder reaches a resource that the new owner has not yet written to,
 * its generation is the highest that resource knows of, and it is
 * admitted. That is inherent to fencing tokens and not a defect in this
 * implementation: closing it entirely requires the resource to consult
 * the lease on every write, which is exactly the availability coupling
 * the token exists to avoid.
 *
 * What the token DOES guarantee is the property that matters for
 * ordering: once a resource has served the new owner, the old one can
 * never write to it again — so no resource can record the dispossessed
 * holder's work on top of the current holder's. The lease renewal at
 * each phase boundary remains the liveness half; this is the safety
 * half, and neither replaces the other.
 *
 * RO-INV-48 is stated to exactly this, deliberately. It once claimed a
 * dispossessed run "writes nothing further", which this cannot deliver
 * and no amount of care here would. STOPPING the dispossessed worker is
 * a different problem, and it belongs to L9, where process and container
 * teardown become real. A guarantee written larger than its mechanism is
 * worse than a smaller one, because the reader stops checking.
 */
import type { FenceOutcome, RunFence } from '../ports/values.js'

export class FenceLedger {
  readonly #high = new Map<string, number>()

  /**
   * Admit or refuse a fenced request.
   *
   * Returns the refusal detail, or `undefined` when the request may
   * proceed. Deliberately not a boolean: the caller has to be able to
   * say WHY it refused, and a bare `false` gets reported as a generic
   * failure by whoever is in a hurry.
   */
  refuse(fence: RunFence): string | undefined {
    const high = this.#high.get(fence.run_id)
    if (high !== undefined && fence.generation < high) {
      return `run ${fence.run_id} moved on: this caller holds generation ${String(
        fence.generation,
      )} and the run is at ${String(high)}`
    }
    // Only ever forward. An equal generation is the same holder writing
    // again, which is ordinary; a higher one is the new owner arriving,
    // and recording it is what locks the previous holder out.
    if (high === undefined || fence.generation > high) {
      this.#high.set(fence.run_id, fence.generation)
    }
    return undefined
  }

  /** The refusal as the outcome the `Promise<void>` ports now return. */
  outcome(fence: RunFence): FenceOutcome {
    const refused = this.refuse(fence)
    return refused === undefined ? { ok: true } : staleFence(refused)
  }

  /** The generation this resource currently considers current, if any. */
  currentFor(run_id: string): number | undefined {
    return this.#high.get(run_id)
  }
}

export const staleFence = (detail: string): FenceOutcome & { ok: false } => ({
  ok: false,
  reason: 'stale_fence',
  detail,
})

/** Whether an outcome carrying an optional reason was a fence refusal. */
export const isStaleFence = (outcome: {
  readonly ok?: boolean
  readonly reason?: string
  readonly outcome?: string
}): boolean => outcome.reason === 'stale_fence' || outcome.outcome === 'stale_fence'
