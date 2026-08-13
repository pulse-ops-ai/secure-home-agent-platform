/**
 * The walk engine: the machine is AUTHORITATIVE over effects.
 *
 * The shape this replaces was a second, procedural state machine running
 * alongside the declarative one. `runner.ts` called `machine.advance()`,
 * ignored the answer, and performed the next effect regardless — so the
 * machine could correctly reject a transition, record the rejection, and
 * the adapter would run anyway. The state machine right, the
 * orchestration wrong, and nothing failing.
 *
 * Here a phase is DATA: the effects performed in one state, plus the
 * transition those effects EARN. The engine runs a phase, applies the
 * transition it earned, and only then permits the next phase to run at
 * all. A rejected transition halts the walk, so narrowing the transition
 * table narrows what actually executes — which is what makes the claim
 * "the walk is driven by the table" checkable rather than asserted.
 *
 * The ordering falls out rather than being maintained: a phase's
 * transition cannot precede the effects that earn it, because the engine
 * applies it afterwards. `EVIDENCE_SEALED` therefore cannot be recorded
 * before the seal, and no conditional is needed to keep it that way.
 */
import type { RejectionEntry, RunMachine } from './machine.js'
import type { TransitionKind } from './transitions.js'

/**
 * What a phase's effects concluded.
 *
 *  - `earned`      the effects succeeded; apply the phase's transition
 *  - `terminate`   the run ends here; the phase already wrote its record
 *  - `hold`        a precondition is unmet; the run stays where it is
 */
export type PhaseCommand<T> =
  | { readonly kind: 'earned'; readonly cause: string }
  | { readonly kind: 'terminate'; readonly value: T }
  | { readonly kind: 'hold'; readonly detail: string }

export interface Phase<T> {
  readonly name: string
  /** The transition these effects earn on success. */
  readonly earns: TransitionKind
  run(): Promise<PhaseCommand<T>>
}

export type WalkOutcome<T> =
  /** Every phase earned its transition; the walk reached its end. */
  | { readonly kind: 'walked' }
  /** A phase terminated the run and produced its own conclusion. */
  | { readonly kind: 'terminated'; readonly value: T }
  /** A phase held: the state is unchanged and the hold is recorded. */
  | { readonly kind: 'held'; readonly detail: string }
  /**
   * A phase earned a transition the machine REFUSED. The walk stops
   * here and no later phase runs — this is the case the engine exists
   * for, and the one the previous shape could not represent.
   */
  | { readonly kind: 'halted'; readonly phase: string; readonly rejection: RejectionEntry }

export const walk = async <T>(
  machine: RunMachine,
  phases: readonly Phase<T>[],
): Promise<WalkOutcome<T>> => {
  for (const phase of phases) {
    const command = await phase.run()

    if (command.kind === 'terminate') return { kind: 'terminated', value: command.value }

    if (command.kind === 'hold') {
      machine.hold(phase.earns, command.detail)
      return { kind: 'held', detail: command.detail }
    }

    const applied = machine.advance(phase.earns, command.cause)
    if (applied.kind === 'rejected') {
      // The single point where a refused transition stops the run.
      // Returning here — rather than continuing the loop — is the whole
      // property: the next phase's effects never execute.
      return { kind: 'halted', phase: phase.name, rejection: applied.entry }
    }
  }
  return { kind: 'walked' }
}
