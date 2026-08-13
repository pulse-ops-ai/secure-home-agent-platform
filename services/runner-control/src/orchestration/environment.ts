/**
 * THE IMMUTABLE EXECUTION ENVIRONMENT.
 *
 * Everything a phase needs that is the same for the whole run: what was
 * asked for, what may interrupt it, the ports it acts through, the
 * machine and fence it acts under, and the two records it keeps.
 *
 * Nothing here is a run's DATA — that is the typestate. The split is the
 * point: a phase is handed one environment and one state, and the state
 * is the only thing that differs between phases. When both lived in a
 * single closure, "what does this phase have?" had no answer short of
 * reading the whole procedure.
 */
import type { FinalizationLedger } from '../finalization/index.js'
import type { AcquisitionEpoch, Ports } from '../ports/index.js'
import type { RunScope } from '../run/scope.js'
import type { RunDeadline } from './deadline.js'
import type { RunRequest, RunSignals } from './result.js'

/** One acquisition, as the epoch reports it. */
export interface JournaledAcquisitionEntry {
  readonly epoch: AcquisitionEpoch
  readonly source: string
  readonly outcome: 'acquired' | 'failed' | 'refused_token'
  readonly detail?: string
}

export interface RunEnvironment {
  readonly request: RunRequest
  readonly signals: RunSignals
  readonly ports: Ports
  /** Machine, fence, held resources, and the terminal owner. */
  readonly scope: RunScope
  /** Seal order and seal eligibility, decided before any commit. */
  readonly ledger: FinalizationLedger
  /** Cancellation, the wall clock, and the race that makes both real. */
  readonly deadline: RunDeadline
  /** Append what the machine has recorded since the last tick. */
  readonly journalTick: () => Promise<void>
  /**
   * Journal one acquisition, noticing a refusal.
   *
   * `runEpoch` takes this as a callback and does not inspect what it
   * returns — an epoch's job is to acquire, not to police ownership. So
   * a fence refusal is recognised here, where the fence is known, rather
   * than dropped by a callback whose result nobody reads.
   */
  readonly journalAcquisition: (entry: JournaledAcquisitionEntry) => Promise<void>
}
