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
  /** When the run started. Every budget is measured from here. */
  readonly #origin = Date.now()
  #reason: InterruptReason | undefined
  #settling = false

  constructor(scope: RunScope, poll?: () => 'cancel' | undefined) {
    this.#scope = scope
    // COERCED, NOT TRUSTED. `RunSignals.interrupt` is declared to return
    // cancellation only, and a type is erased at runtime — a caller can
    // cast and return `'timeout'`. TIMED_OUT is what the governed wall
    // clock produces; whatever a caller says it wants, what it can
    // obtain is a cancellation. The narrowing lives HERE because this is
    // the one place a caller's answer becomes a run's interrupt reason.
    this.#poll =
      poll === undefined ? undefined : () => (poll() === undefined ? undefined : 'cancel')
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

  /**
   * The run is now writing its ending, and its ports stop being bound by
   * the abort they are recording.
   *
   * Without this the fix eats itself: once the deadline fires, every
   * bound port refuses, INCLUDING the ones the terminal path uses to
   * write the governed record — so a run interrupted at any point could
   * not write down that it had been interrupted. Concluding is bounded
   * too, by the cleanup budget, because an unbounded seal is the hole
   * this round is closing. It is simply not bounded by the interruption
   * it exists to record.
   */
  settle(): void {
    this.#settling = true
  }

  /** Whether the run has begun writing its ending. */
  get settling(): boolean {
    return this.#settling
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
    // AN ABSOLUTE EXPIRY, MEASURED FROM THE RUN'S START.
    //
    // This started a fresh DURATION from now, and `eligible` arms the
    // profile's budget twice — once before `session.prepare` and again
    // after `session.start` returns. A profile granting one second
    // therefore bought one second PLUS however long prepare and start
    // took, which is a wall clock the profile did not declare. The
    // budget is now what the profile granted minus what the run has
    // already spent, so re-arming can only ever move the expiry EARLIER.
    //
    // Still REPLACES rather than adds: a run has one wall clock, and
    // leaving the acquisition ceiling ticking would cut short a run the
    // profile granted longer.
    this.#scope.disarm()
    const spent = Date.now() - this.#origin
    const remaining = Math.max(0, deadlineMs - spent)
    this.#scope.timers.push(
      setTimeout(() => {
        this.raise('timeout')
      }, remaining),
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
  async until<T>(work: () => Promise<T>): Promise<T | undefined> {
    // A THUNK, NOT A PROMISE. This took an already-created promise, and
    // JavaScript evaluates an argument before entering the function it
    // is passed to — so `until(ports.adapter.invoke({…}))` STARTED the
    // invocation, and only then checked whether the run was already
    // aborted. A deadline that fired while the preceding event was being
    // emitted therefore reported a timeout for work it had just set
    // running, against a provider the contract says may ignore its
    // signal. The type is what fixes it: an effect that has not been
    // called cannot have started.
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
      // RE-CHECKED IMMEDIATELY BEFORE STARTING IT. Arming the poll above
      // can raise the abort, and a thunk that is called anyway would
      // reintroduce the very gap the thunk exists to close.
      if (this.#aborter.signal.aborted) return undefined
      return await Promise.race([
        work(),
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
