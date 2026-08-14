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
import { RunInterrupted, RunSettlementExpired } from '../run/interruption.js'
import type { RunScope } from '../run/scope.js'
import { ABANDON_GRACE_MS } from './controls.js'

export type InterruptReason = 'cancel' | 'timeout'

/** A boundary that can reject an awaited call without abandoning its continuation. */
export interface CallGuard {
  call<T>(work: () => Promise<T>): Promise<T>
}

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
  #poll: (() => InterruptReason | undefined) | undefined
  readonly #startedAt = Date.now()
  #armedUntil: number | undefined
  #wallClock: ReturnType<typeof setTimeout> | undefined
  #cancelClock: ReturnType<typeof setTimeout> | undefined
  #reason: InterruptReason | undefined

  constructor(scope?: RunScope, poll?: () => 'cancel' | undefined) {
    if (scope !== undefined) scope.deadline = this
    // COERCED, NOT TRUSTED. `RunSignals.interrupt` is declared to return
    // cancellation only, and a type is erased at runtime — a caller can
    // cast and return `'timeout'`. TIMED_OUT is what the governed wall
    // clock produces; whatever a caller says it wants, what it can
    // obtain is a cancellation. The narrowing lives HERE because this is
    // the one place a caller's answer becomes a run's interrupt reason.
    this.#poll =
      poll === undefined
        ? undefined
        : () => {
            try {
              return poll() === undefined ? undefined : 'cancel'
            } catch {
              // A caller-owned cancellation probe must never be able to
              // crash the timer callback. Treat a broken probe as the
              // caller withdrawing its run: fail closed as cancellation.
              return 'cancel'
            }
          }
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
    if (this.#reason !== undefined) return this.#reason
    const polled = this.#poll?.()
    if (polled !== undefined) this.raise(polled)
    return this.#reason
  }

  /** Raise the abort. The first reason wins; later ones are ignored. */
  raise(reason: InterruptReason): void {
    if (this.#reason !== undefined) return
    this.#reason = reason
    this.#aborter.abort()
  }

  /** Bound ownership and acquisition before a profile can be captured. */
  armAcquisition(deadlineMs: number): void {
    this.#setWallClock(this.#startedAt + Math.max(0, deadlineMs))
  }

  /**
   * Establish the profile-authorized wall clock once.
   *
   * This replaces the standing acquisition ceiling: that ceiling exists
   * only because no profile is available yet. Once authority is captured,
   * the profile owns the budget. Every later narrowing is anchored to this
   * same instant, so prepare/start time cannot be bought twice.
   */
  armProfile(deadlineMs: number, cancelAfterMs?: number): void {
    this.#setWallClock(this.#startedAt + Math.max(0, deadlineMs))
    if (cancelAfterMs !== undefined && this.#cancelClock === undefined) {
      const cancelAt = this.#startedAt + Math.max(0, cancelAfterMs)
      if (cancelAt <= Date.now()) {
        this.raise('cancel')
        return
      }
      this.#cancelClock = setTimeout(
        () => {
          this.raise('cancel')
        },
        Math.max(0, cancelAt - Date.now()),
      )
      this.#cancelClock.unref?.()
    }
  }

  /** Narrow the established profile clock without restarting it. */
  narrowProfile(deadlineMs: number): void {
    const proposed = this.#startedAt + Math.max(0, deadlineMs)
    this.#setWallClock(
      this.#armedUntil === undefined ? proposed : Math.min(this.#armedUntil, proposed),
    )
  }

  #setWallClock(expiresAt: number): void {
    // Do not clear and recreate an identical timer. A very short proof
    // override may already be armed from run start; recreating it at the
    // profile boundary moves the timer callback ahead of continuations
    // that were already queued and changes observable boundary semantics.
    if (this.#armedUntil === expiresAt && this.#wallClock !== undefined) return
    this.#armedUntil = expiresAt
    if (this.#wallClock !== undefined) clearTimeout(this.#wallClock)
    if (expiresAt <= Date.now()) {
      this.#wallClock = undefined
      this.raise('timeout')
      return
    }
    this.#wallClock = setTimeout(
      () => {
        this.raise('timeout')
      },
      Math.max(0, this.#armedUntil - Date.now()),
    )
    this.#wallClock.unref?.()
  }

  /**
   * Await one port call, or reject its awaiting continuation on abort.
   *
   * The port's own promise may settle later. No orchestration continuation
   * remains attached to it, so no later effect in the phase can start.
   */
  async call<T>(work: () => Promise<T>): Promise<T> {
    // Do not POLL here. Explicit lifecycle boundaries consult the
    // submitted interrupt, while the call-local interval raises it
    // during an outstanding call. Polling synchronously before every
    // port would turn implementation detail (how many ports a phase
    // uses) into cancellation semantics and move named boundaries.
    if (this.#aborter.signal.aborted) {
      throw new RunInterrupted(this.#reason ?? 'timeout')
    }
    let rejectAbort: ((error: RunInterrupted) => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    const listener = (): void => {
      rejectAbort?.(new RunInterrupted(this.#reason ?? 'timeout'))
    }
    this.#aborter.signal.addEventListener('abort', listener, { once: true })
    const ticking =
      this.#poll === undefined
        ? undefined
        : setInterval(() => {
            const signal = this.#poll?.()
            if (signal !== undefined) this.raise(signal)
          }, POLL_INTERVAL_MS)
    ticking?.unref?.()
    try {
      return await Promise.race([work(), aborted])
    } finally {
      this.#aborter.signal.removeEventListener('abort', listener)
      if (ticking !== undefined) clearInterval(ticking)
    }
  }

  /**
   * A fresh, short boundary for governed terminal settlement.
   *
   * The run deadline is already aborted at this point. Cleanup and
   * evidence still need to run, but no broken sink may make `run()`
   * unbounded. Each awaited call is rejected at the SAME absolute
   * settlement expiry, so the continuation unwinds at that call rather
   * than a whole terminal procedure being abandoned.
   */
  settlement(): RunSettlement {
    return new RunSettlement()
  }

  /** Stop every timer and poll owned by this run. Safe to call twice. */
  disarm(): void {
    if (this.#wallClock !== undefined) clearTimeout(this.#wallClock)
    if (this.#cancelClock !== undefined) clearTimeout(this.#cancelClock)
    this.#wallClock = undefined
    this.#cancelClock = undefined
    this.#armedUntil = undefined
  }
}

export class RunSettlement implements CallGuard {
  readonly #aborter = new AbortController()
  readonly #timer: ReturnType<typeof setTimeout>
  readonly #expiresAt = Date.now() + ABANDON_GRACE_MS

  constructor() {
    this.#timer = setTimeout(() => {
      this.#aborter.abort()
    }, ABANDON_GRACE_MS)
    this.#timer.unref?.()
  }

  /** Passed to fallible terminal work that must stop before publication. */
  get signal(): AbortSignal {
    return this.#aborter.signal
  }

  async call<T>(work: () => Promise<T>): Promise<T> {
    this.#raiseIfElapsed()
    let rejectAbort: ((error: RunSettlementExpired) => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    const listener = (): void => {
      rejectAbort?.(new RunSettlementExpired())
    }
    this.#aborter.signal.addEventListener('abort', listener, { once: true })
    try {
      const value = await Promise.race([work(), aborted])
      this.#raiseIfElapsed()
      return value
    } finally {
      this.#aborter.signal.removeEventListener('abort', listener)
    }
  }

  disarm(): void {
    clearTimeout(this.#timer)
  }

  #raiseIfElapsed(): void {
    if (this.#aborter.signal.aborted || Date.now() >= this.#expiresAt) {
      throw new RunSettlementExpired()
    }
  }
}
