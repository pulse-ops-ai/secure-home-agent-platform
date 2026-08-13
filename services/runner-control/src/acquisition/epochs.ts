/**
 * Running an acquisition epoch: consume each declared token exactly once
 * and hand the resulting bytes to the trusted core's `captureAuthority`
 * (design D4).
 *
 * The orchestrator never inspects, parses, or repairs authority bytes —
 * it acquires them and passes them through. Every judgement about what
 * the bytes mean, including "this failed to acquire", belongs to the
 * core; this module's only decisions are which token to spend and when to
 * stop.
 *
 * A production epoch that cannot complete terminates the run fail-closed
 * from `REQUESTED`. There is deliberately no partial-trust path and no
 * retry: the token is gone, and a run that could not establish its
 * authority has no business proceeding on some of it.
 */
import {
  ExecutionProfile,
  GateRegistry,
  PathPolicy,
  EXECUTION_PROFILE_ID,
  GATE_REGISTRY_ID,
  PATH_POLICY_ID,
  type ExecutionProfileT,
  type GateRegistryT,
  type PathPolicyT,
} from '@secure-home/contracts'
import {
  captureAuthority,
  isOperationalFailure,
  type AuthoritySnapshots,
  type CapturedAuthority,
  type ContractDocument,
  type ExpectedContract,
  type OperationalFailure,
} from '@secure-home/runner-core'
import type { AcquisitionEpoch } from '../ports/index.js'
import type { AcquisitionError, AcquisitionSet, EpochValue } from './tokens.js'

/** The declared authority sources, each bound to the contract it must satisfy. */
export const AUTHORITY_SOURCES = {
  profile: {
    contract_id: EXECUTION_PROFILE_ID,
    schema: ExecutionProfile,
  } satisfies ExpectedContract<ExecutionProfileT>,
  path_policy: {
    contract_id: PATH_POLICY_ID,
    schema: PathPolicy,
  } satisfies ExpectedContract<PathPolicyT>,
  gate_registry: {
    contract_id: GATE_REGISTRY_ID,
    schema: GateRegistry,
  } satisfies ExpectedContract<GateRegistryT>,
} as const

export type AuthoritySourceName = keyof typeof AUTHORITY_SOURCES

export const AUTHORITY_SOURCE_NAMES = Object.keys(
  AUTHORITY_SOURCES,
) as readonly AuthoritySourceName[]

export type EpochResult<E extends AcquisitionEpoch> =
  | {
      readonly ok: true
      readonly snapshots: AuthoritySnapshots
      readonly values: readonly EpochValue<E>[]
    }
  | { readonly ok: false; readonly failure: OperationalFailure | AcquisitionError }

const isAcquisitionError = (
  value: OperationalFailure | AcquisitionError,
): value is AcquisitionError => 'epoch' in value

/**
 * A capture that reported an environmental fault rather than a captured
 * snapshot or a contract refusal. Narrowed on the discriminant the core
 * already publishes: `CapturedAuthority` has no `kind`, so this cannot
 * confuse a refusal with a fault — the distinction INV-003 depends on.
 */
const isCaptureFault = (
  value: CapturedAuthority<ContractDocument> | OperationalFailure,
): value is OperationalFailure => 'kind' in value && isOperationalFailure(value)

/**
 * Consume every declared token of `set` once and capture the results.
 *
 * `required` names which sources this epoch must establish. A gate
 * registry is optional authority — a run declaring no gates has none —
 * so it is captured when present and simply absent otherwise, which
 * eligibility already treats as "no gates", never as permission.
 */
export const runEpoch = async <E extends AcquisitionEpoch>(
  set: AcquisitionSet<E>,
  required: readonly AuthoritySourceName[],
): Promise<EpochResult<E>> => {
  const values: EpochValue<E>[] = []
  const captured: {
    profile?: CapturedAuthority<ExecutionProfileT>
    path_policy?: CapturedAuthority<PathPolicyT>
    gate_registry?: CapturedAuthority<GateRegistryT>
  } = {}

  for (const name of required) {
    const outcome = await set.consume(name)
    if (!outcome.ok) return { ok: false, failure: outcome.error }
    values.push(outcome.value)

    const expected = AUTHORITY_SOURCES[name] as ExpectedContract<ContractDocument>
    const result = captureAuthority(outcome.value.bytes, expected)
    if (isCaptureFault(result)) return { ok: false, failure: result }
    // The cast is over the source NAME, not the contract: each name's
    // expected contract is fixed above, so the capture's document type is
    // the one this key declares.
    ;(captured as Record<string, unknown>)[name] = result
  }

  return { ok: true, snapshots: captured, values }
}

export const describeEpochFailure = (failure: OperationalFailure | AcquisitionError): string =>
  isAcquisitionError(failure)
    ? `${failure.kind} for ${failure.source} in the ${failure.epoch} epoch: ${failure.detail}`
    : `acquisition failed for ${failure.source}: ${failure.detail}`
