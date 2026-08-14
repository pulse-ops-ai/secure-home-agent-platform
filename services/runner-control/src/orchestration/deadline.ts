/**
 * CANCELLATION THAT CAN REACH WORK IN FLIGHT.
 *
 * Polling between phases cannot interrupt a hung `invoke()` or
 * `runGate()` — the two calls most likely to hang. So the run owns an
 * abort signal, hands it to those calls, AND races them against it.
 * Handing it over lets an implementation stop immediately; racing it
 * means an implementation that ignores the signal still cannot hold the
 * run open. Effective, rather than advisory.
 *
 * It lives here rather than in the walk because it is a MECHANISM with
 * one owner: the signal, the timers that raise it, the race that gives
 * up on it, and the disarm that stops it are one concern. Spread across
 * a procedure they were four, and the timers outlived every exception
 * because nothing owned clearing them.
 */
import type { RunScope } from '../run/scope.js'

export type InterruptReason = 'cancel' | 'timeout'

/**
 * How often an in-flight call re-consults the caller's interrupt.
 *
 * Short enough that cancellation is effective rather than eventual, and
 * the poll is cleared the moment the call settles.
 */
const POLL_INTERVAL_MS = 5

/** The terminal each interrupt reason maps to. */
export const INTERRUPT_TERMINAL = { cancel: 'CANCELLED', timeout: 'TIMED_OUT' } as const

export class RunDeadline {
  readonly #aborter = new AbortController()
  readonly #scope: RunScope
  readonly #poll: (() => InterruptReason | undefined) | undefined
  #reason: InterruptReason | undefined

  constructor(scope: RunScope, poll?: () => InterruptReason | undefined) {
    this.#scope = scope
    this.#poll = poll
  }

  /** Handed to the calls that may hang, so they can stop themselves. */
  get signal(): AbortSignal {
    return this.#aborter.signal
  }

  /** The reason this run was interrupted, if it was. */
  get reason(): InterruptReason | undefined {
    return this.#reason
  }

  /**
   * Whether the run should stop now.
   *
   * Consults the raised reason first and the caller's poll second, so a
   * deadline that has already fired is not overridden by a poll that
   * says nothing.
   */
  interrupted(): InterruptReason | undefined {
    return this.#reason ?? this.#poll?.()
  }

  /** Raise the abort. The first reason wins; later ones are ignored. */
  raise(reason: InterruptReason): void {
    if (this.#reason !== undefined) return
    this.#reason = reason
    this.#aborter.abort()
  }

  /**
   * Arm the wall clock, and optionally a mid-flight cancellation.
   *
   * The timers are registered with the scope, which is what clears them
   * — including on the exception path, where nothing used to.
   */
  arm(deadlineMs: number, cancelAfterMs?: number): void {
    // REPLACES rather than adds. A run has ONE wall clock; arming twice —
    // once for acquisition, once from the captured profile — must not
    // leave the first still ticking, or the earlier bound would cut the
    // run short regardless of what the profile granted.
    this.#scope.disarm()
    this.#scope.timers.push(
      setTimeout(() => {
        this.raise('timeout')
      }, deadlineMs),
    )
    if (cancelAfterMs !== undefined) {
      this.#scope.timers.push(
        setTimeout(() => {
          this.raise('cancel')
        }, cancelAfterMs),
      )
    }
  }

  /**
   * A promise that settles when the run is aborted, and never otherwise.
   *
   * The walk is raced against this, which is what makes the budget cover
   * EVERY port rather than the handful whose call sites remembered to
   * ask. A port added later cannot forget to be bounded, because nothing
   * at the call site is what bounds it.
   */
  expired(): Promise<InterruptReason> {
    return new Promise<InterruptReason>((resolve) => {
      if (this.#aborter.signal.aborted) {
        resolve(this.#reason ?? 'timeout')
        return
      }
      this.#aborter.signal.addEventListener('abort', () => {
        resolve(this.#reason ?? 'timeout')
      })
    })
  }

  /**
   * Await `work`, or give up when the run is aborted.
   *
   * Returns `undefined` on abort. The abandoned call may still be
   * running — which is exactly why the session is INTERRUPTED rather
   * than merely abandoned: stopping it is the session's job, and proving
   * the stop worked is L9's.
   */
  async until<T>(work: Promise<T>): Promise<T | undefined> {
    if (this.#aborter.signal.aborted) return undefined
    // THE CALLER'S INTERRUPT IS POLLED WHILE WAITING, not only between
    // phases. `interrupt` is the ONLY cancellation input a submitted run
    // has — the constructor-time affordances belong to composition — and
    // polling it only at boundaries meant it could never reach a call
    // already in flight, which is the one case cancellation exists for.
    const ticking =
      this.#poll === undefined
        ? undefined
        : setInterval(() => {
            const signal = this.#poll?.()
            if (signal !== undefined) this.raise(signal)
          }, POLL_INTERVAL_MS)
    // Unref'd so a poll can never be the reason a process stays alive,
    // and cleared the moment the call settles. The blanket ban on
    // intervals exists for timers that do neither.
    ticking?.unref?.()
    try {
      return await Promise.race([
        work,
        new Promise<undefined>((resolve) => {
          this.#aborter.signal.addEventListener('abort', () => {
            resolve(undefined)
          })
        }),
      ])
    } finally {
      if (ticking !== undefined) clearInterval(ticking)
    }
  }
}
