/**
 * Acquire-once, as a consumed token in a declared epoch role (design D4;
 * `runner-authority-acquisition`).
 *
 * The honest claim this mechanism supports: a source is read AT MOST
 * ONCE PER EPOCH and therefore at most twice per run. It is not a
 * convention or a review rule — the token IS the permission to perform
 * the read, and consuming it destroys it. A second consumption returns a
 * structural error naming source and epoch and performs no host read at
 * all, which is why "no second read happened" is observable rather than
 * asserted.
 *
 * Values are branded with their epoch. That is what makes "the verifier
 * was fed producer values" unexpressible rather than merely forbidden: a
 * `production` value does not type-check where a `verification` value is
 * required, so laundering verification cannot be written in the first
 * place (RO-ADV-05).
 */
import type { AuthoritySourcePort, AcquisitionEpoch, AuthorityBytes } from '../ports/index.js'
import { isRunControlError } from '../run/interruption.js'

/** Authority bytes that remember which epoch acquired them. */
export interface EpochValue<E extends AcquisitionEpoch> {
  readonly epoch: E
  readonly source: string
  readonly bytes: AuthorityBytes
}

export const ACQUISITION_ERRORS = ['token_already_consumed', 'source_not_declared'] as const
export type AcquisitionErrorKind = (typeof ACQUISITION_ERRORS)[number]

export interface AcquisitionError {
  readonly kind: AcquisitionErrorKind
  readonly source: string
  readonly epoch: AcquisitionEpoch
  readonly detail: string
}

export type AcquisitionOutcome<E extends AcquisitionEpoch> =
  | { readonly ok: true; readonly value: EpochValue<E> }
  | { readonly ok: false; readonly error: AcquisitionError }

/**
 * One epoch's single-use tokens. A set belongs to exactly one run and one
 * epoch role; the production set exists for every run, the verification
 * set only for a run that reaches independent verification.
 */
export class AcquisitionSet<E extends AcquisitionEpoch> {
  readonly #runId: string
  readonly #epoch: E
  readonly #port: AuthoritySourcePort
  readonly #remaining: Set<string>
  readonly #consumed = new Set<string>()

  constructor(runId: string, epoch: E, port: AuthoritySourcePort, sources: readonly string[]) {
    this.#runId = runId
    this.#epoch = epoch
    this.#port = port
    this.#remaining = new Set(sources)
  }

  get epoch(): E {
    return this.#epoch
  }

  /** Sources whose token is still unconsumed. */
  get outstanding(): readonly string[] {
    return [...this.#remaining]
  }

  get consumed(): readonly string[] {
    return [...this.#consumed]
  }

  async consume(source: string): Promise<AcquisitionOutcome<E>> {
    if (this.#consumed.has(source)) {
      return {
        ok: false,
        error: {
          kind: 'token_already_consumed',
          source,
          epoch: this.#epoch,
          detail: `the ${this.#epoch} token for ${source} was already consumed; no host read is performed`,
        },
      }
    }
    if (!this.#remaining.has(source)) {
      return {
        ok: false,
        error: {
          kind: 'source_not_declared',
          source,
          epoch: this.#epoch,
          detail: `${source} is not a declared source of this run's ${this.#epoch} epoch`,
        },
      }
    }
    // Consume BEFORE the read. A read that throws must not leave the
    // token spendable again — "at most once" has to survive failure, and
    // an acquisition fault is a run outcome, never a retry loop.
    this.#remaining.delete(source)
    this.#consumed.add(source)
    // A port that THROWS reports a failed acquisition, not an escaping
    // exception. The token is already spent either way, and the core is
    // entitled to see "we could not read it" as data rather than have
    // the run vanish mid-walk.
    try {
      const bytes = await this.#port.read({ run_id: this.#runId, epoch: this.#epoch, source })
      return { ok: true, value: { epoch: this.#epoch, source, bytes } }
    } catch (error) {
      // Cancellation and timeout are lifecycle control flow, not an
      // authority-source failure. Let the run's terminal owner classify
      // them; translating them here would turn TIMED_OUT into an
      // operational acquisition fault.
      if (isRunControlError(error)) throw error
      return {
        ok: true,
        value: {
          epoch: this.#epoch,
          source,
          bytes: {
            ok: false,
            source: { source },
            failure: `the authority source threw: ${error instanceof Error ? error.message : String(error)}`,
          },
        },
      }
    }
  }
}
