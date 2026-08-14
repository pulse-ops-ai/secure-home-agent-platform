/**
 * CONTROL-FLOW FAILURES, distinct from port failures.
 *
 * A port may throw because its implementation failed. The run coordinator
 * also rejects an awaited port call when the run's governed wall clock or
 * caller cancellation fires. Those are not environmental faults to be
 * translated by a lower-level adapter: they are declared lifecycle inputs
 * that must reach the one terminal owner unchanged.
 *
 * The brand is a symbol rather than `instanceof` alone so the distinction
 * survives wrappers and test doubles that preserve the object but not a
 * particular prototype chain.
 */

export type RunInterruptReason = 'cancel' | 'timeout'

const RUN_CONTROL_ERROR = Symbol('runner-control.run-control-error')

interface BrandedControlError extends Error {
  readonly [RUN_CONTROL_ERROR]?: true
}

export class RunInterrupted extends Error implements BrandedControlError {
  readonly [RUN_CONTROL_ERROR] = true as const
  readonly reason: RunInterruptReason

  constructor(reason: RunInterruptReason) {
    super(`the run was ${reason === 'cancel' ? 'cancelled' : 'timed out'}`)
    this.name = 'RunInterrupted'
    this.reason = reason
  }
}

export class RunSettlementExpired extends Error implements BrandedControlError {
  readonly [RUN_CONTROL_ERROR] = true as const

  constructor() {
    super('the bounded terminal-settlement window elapsed')
    this.name = 'RunSettlementExpired'
  }
}

export const isRunControlError = (value: unknown): value is BrandedControlError =>
  typeof value === 'object' &&
  value !== null &&
  RUN_CONTROL_ERROR in value &&
  (value as BrandedControlError)[RUN_CONTROL_ERROR] === true

export const isRunInterrupted = (value: unknown): value is RunInterrupted =>
  isRunControlError(value) &&
  value instanceof Error &&
  value.name === 'RunInterrupted' &&
  'reason' in value
