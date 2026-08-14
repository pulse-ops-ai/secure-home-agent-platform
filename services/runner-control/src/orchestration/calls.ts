/**
 * Recording what the provider did: events AND evidence operations.
 *
 * Every call an adapter reports becomes BOTH a `call.attempted` /
 * `call.disposition` pair and an evidence operation. Discarding either
 * would mean a permitted or denied action left no trace anywhere — and
 * "what was this allowed to do, and what did it do?" is the exact
 * question the evidence bundle exists to answer.
 *
 * A failure part way through keeps what was already recorded. Dropping
 * it would make the failure erase what it interrupted.
 */
import type { AdapterCall } from '../ports/index.js'
import { emissionFailure } from './detail.js'
import type { RunEnvironment } from './environment.js'
import { emptyOperations, type Authority } from './state.js'
import { emit } from './terminate.js'
import type { EvidenceOperations } from '../ports/index.js'

export type CallRecording =
  | { readonly ok: true; readonly operations: EvidenceOperations }
  /** Emission failed. `operations` is what had been recorded by then. */
  | { readonly ok: false; readonly detail: string; readonly operations: EvidenceOperations }

export const recordCalls = async (
  env: RunEnvironment,
  authority: Authority,
  calls: readonly AdapterCall[],
): Promise<CallRecording> => {
  const operations = emptyOperations()
  for (const [index, call] of calls.entries()) {
    const call_id = `call-${String(index + 1).padStart(4, '0')}`
    const operation = { call_id, operation: { name: call.tool } }

    const attempted = await emit(env, authority, {
      event_type: 'call.attempted',
      call_id,
      operation: { name: call.tool },
    })
    if (!attempted.ok) return { ok: false, detail: emissionFailure(attempted), operations }
    operations.attempted.push(operation)
    env.scope.terminalEvidence.operations = {
      attempted: [...operations.attempted],
      permitted: [...operations.permitted],
      denied: [...operations.denied],
    }

    const disposed = await emit(env, authority, {
      event_type: 'call.disposition',
      call_id,
      disposition: call.disposition,
    })
    if (!disposed.ok) {
      // The attempt was recorded before disposition emission began.
      env.scope.terminalEvidence.operations = {
        attempted: [...operations.attempted],
        permitted: [...operations.permitted],
        denied: [...operations.denied],
      }
      return { ok: false, detail: emissionFailure(disposed), operations }
    }

    operations[call.disposition].push(operation)
    env.scope.terminalEvidence.operations = {
      attempted: [...operations.attempted],
      permitted: [...operations.permitted],
      denied: [...operations.denied],
    }
  }
  return { ok: true, operations }
}
