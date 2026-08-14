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
  type Refusal,
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

/**
 * A capture that the CORE refused: the bytes were acquired but are not
 * valid authority. Distinct from an operational failure, because the two
 * classify differently and terminate the run differently (INV-003).
 */
export interface CaptureRefusal {
  readonly kind: 'capture_refused'
  readonly source: string
  readonly refusal: Refusal
}

export type EpochFailure = OperationalFailure | AcquisitionError | CaptureRefusal

export type EpochResult<E extends AcquisitionEpoch> =
  | {
      readonly ok: true
      readonly snapshots: AuthoritySnapshots
      readonly values: readonly EpochValue<E>[]
    }
  | { readonly ok: false; readonly failure: EpochFailure }

const isAcquisitionError = (value: EpochFailure): value is AcquisitionError => 'epoch' in value

/** Whether an epoch failed because the CORE refused the authority. */
export const isCaptureRefusal = (failure: EpochFailure): failure is CaptureRefusal =>
  'kind' in failure && failure.kind === 'capture_refused'

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
  /**
   * Journal each consumption as it happens. An epoch that reported only
   * its final verdict would hide WHICH source failed and in what order —
   * the two facts an operator needs first.
   */
  journal: (entry: {
    readonly epoch: AcquisitionEpoch
    readonly source: string
    readonly outcome: 'acquired' | 'failed' | 'refused_token'
    readonly detail?: string
  }) => Promise<unknown> = () => Promise.resolve(),
  /**
   * Consulted before each source. Returning a reason STOPS the epoch.
   *
   * An epoch acquires; it does not decide who owns the run. But once the
   * caller knows ownership has moved — a journal refusing this
   * generation is proof of it — reading the next source is an authority
   * read by an orchestrator that does not hold the run, which the
   * ownership requirement forbids outright. Halting the NEXT PHASE is
   * not enough while the current one is still reading.
   */
  shouldStop: () => string | undefined = () => undefined,
): Promise<EpochResult<E>> => {
  const values: EpochValue<E>[] = []
  const captured: {
    profile?: CapturedAuthority<ExecutionProfileT>
    path_policy?: CapturedAuthority<PathPolicyT>
    gate_registry?: CapturedAuthority<GateRegistryT>
  } = {}

  for (const name of required) {
    const stop = shouldStop()
    if (stop !== undefined) {
      // Reported as an operational failure carrying the caller's reason.
      // A run that stopped because it lost the run has refused no
      // contract; the caller tells the two apart by the fence it already
      // knows it lost.
      return { ok: false, failure: { kind: 'operational_failure', source: name, detail: stop } }
    }
    const outcome = await set.consume(name)
    if (!outcome.ok) {
      await journal({
        epoch: set.epoch,
        source: name,
        outcome: 'refused_token',
        detail: outcome.error.detail,
      })
      return { ok: false, failure: outcome.error }
    }
    await journal({
      epoch: set.epoch,
      source: name,
      outcome: outcome.value.bytes.ok ? 'acquired' : 'failed',
      ...(outcome.value.bytes.ok ? {} : { detail: outcome.value.bytes.failure }),
    })
    values.push(outcome.value)

    const expected = AUTHORITY_SOURCES[name] as ExpectedContract<ContractDocument>
    const result = captureAuthority(outcome.value.bytes, expected)
    if (isCaptureFault(result)) return { ok: false, failure: result }
    // A REFUSED capture is not a snapshot. Letting it through as one
    // meant an epoch could report success while carrying invalid
    // authority: only the profile was checked downstream, so a refused
    // path policy or gate registry travelled onward, and a run with no
    // requested gates could reach adapter invocation on an invalid
    // registry. The epoch fails, and it fails naming the core's refusal
    // rather than one of its own.
    if (!result.ok) {
      return {
        ok: false,
        failure: { kind: 'capture_refused', source: name, refusal: result.refusal },
      }
    }
    // The cast is over the source NAME, not the contract: each name's
    // expected contract is fixed above, so the capture's document type is
    // the one this key declares.
    ;(captured as Record<string, unknown>)[name] = result
  }

  return { ok: true, snapshots: captured, values }
}

export const describeEpochFailure = (failure: EpochFailure): string =>
  isCaptureRefusal(failure)
    ? `${failure.source} is not valid authority: ${failure.refusal.code} — ${failure.refusal.detail}`
    : isAcquisitionError(failure)
      ? `${failure.kind} for ${failure.source} in the ${failure.epoch} epoch: ${failure.detail}`
      : `acquisition failed for ${failure.source}: ${failure.detail}`
