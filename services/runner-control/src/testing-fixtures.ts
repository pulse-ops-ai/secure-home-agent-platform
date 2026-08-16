/**
 * Shared deterministic fixtures for the runner-control proof net. Test
 * support only — imported exclusively by `*.test.ts` files, never
 * exported from the service index, and excluded from the source scans
 * that assert what production code may contain.
 */
import type {
  AuthorityBytes,
  AuthorityReadRequest,
  AuthoritySourcePort,
  Ports,
} from './ports/index.js'
import {
  DeterministicAdapterInvocation,
  DeterministicExecution,
  RecordingEventSink,
  RecordingEvidenceSink,
  InMemoryExecutionSession,
  InMemoryWorkspaceLifecycle,
  InMemoryRunJournal,
  InMemoryRunLease,
  SteppingClock,
  TransactionalFinalization,
  type RecordedWrite,
} from './adapters/index.js'
import type { ArtifactObservation, BaseObservation, WorkspaceObservation } from './ports/index.js'
import type { PrincipalT } from './ports/contract-types.js'
import type {
  AdapterInvocation,
  AdapterObservation,
  AdapterReport,
  FenceOutcome,
  GateExecutionRequest,
  GateReport,
  SessionClosure,
  SessionHandle,
  SessionPreparation,
  SessionPrepareRequest,
  SessionStart,
  ApplyBackOutcome,
  ApplyBackRequest,
  WorkspaceProvision,
} from './ports/index.js'
import { CommitLedger } from './run-state/visibility.js'
import { SEIZE } from './run-state/seize.js'
import type { RunRequest } from './runner.js'

export const digestHex = (letter: string): string => `sha256:${letter.repeat(64)}`

export const profileDocument = (): Record<string, unknown> => ({
  contract_id: 'execution-profile',
  contract_version: '1.0.0',
  identity: { name: 'home-status-read', version: '1.0.0' },
  runtime: { image_digest: digestHex('a'), adapter: 'copilot-cli' },
  capability: {
    tools: ['household.read'],
    mounts: [{ path: '/workspace', posture: 'read_write' }],
    network: { default: 'deny', granted_destinations: [] },
    credentials: [{ env_var: 'RUN_TOKEN' }],
  },
  execution: { routing_class: 'R1', model_route: 'local-default', fallback: 'refuse' },
  limits: {
    wall_clock_seconds: 600,
    cpu_cores: 1,
    memory_bytes: 536870912,
    pids: 128,
    output_bytes: 1048576,
  },
  principal: { sub: 'agent:home-status', actor_required: false },
  knowledge: { selection: 'household-baseline' },
  evidence: { contract: 'evidence-bundle@2.0.0' },
})

export const policyDocument = (): Record<string, unknown> => ({
  contract_id: 'path-policy',
  contract_version: '2.0.0',
  allowed_write_roots: ['packages', 'docs'],
  prohibited_rules: [{ kind: 'path_prefix', prefix: '.git' }],
  max_files: 8,
  max_total_bytes: 4096,
  max_file_bytes: 1024,
})

export const registryDocument = (): Record<string, unknown> => ({
  contract_id: 'gate-registry',
  contract_version: '1.0.0',
  gates: {
    lint: {
      executable: 'pnpm',
      args: ['lint'],
      timeout_seconds: 600,
      max_output_bytes: 262144,
      environment_names: ['PATH'],
      network: 'none',
    },
    'unit-tests': {
      executable: 'pnpm',
      args: ['test'],
      timeout_seconds: 900,
      max_output_bytes: 262144,
      environment_names: ['PATH'],
      network: 'none',
    },
  },
})

export const DOCUMENTS: Readonly<Record<string, () => Record<string, unknown>>> = {
  profile: profileDocument,
  path_policy: policyDocument,
  gate_registry: registryDocument,
}

/**
 * An authority source that serves the fixture documents and COUNTS the
 * host reads it performed, per run and per epoch. The count is what makes
 * acquire-once observable: a proof asserts the number of reads that
 * actually happened, not that the code intended to read once.
 */
export class CountingAuthoritySource implements AuthoritySourcePort {
  readonly reads: AuthorityReadRequest[] = []
  readonly #overrides: Map<string, AuthorityBytes>

  constructor(overrides: Readonly<Record<string, AuthorityBytes>> = {}) {
    this.#overrides = new Map(Object.entries(overrides))
  }

  readsFor(run_id: string, source?: string): readonly AuthorityReadRequest[] {
    return this.reads.filter(
      (read) => read.run_id === run_id && (source === undefined || read.source === source),
    )
  }

  read(request: AuthorityReadRequest): Promise<AuthorityBytes> {
    this.reads.push(request)
    const override = this.#overrides.get(request.source)
    if (override !== undefined) return Promise.resolve(override)
    const document = DOCUMENTS[request.source]
    if (document === undefined) {
      return Promise.resolve({
        ok: false,
        source: { source: request.source },
        failure: `no fixture document for ${request.source}`,
      })
    }
    return Promise.resolve({
      ok: true,
      source: { source: request.source },
      bytes: JSON.stringify(document()),
    })
  }
}

export const PINNED_BASE = `sha256:${'b'.repeat(64)}`

export class StaticWorkspaceObserver {
  readonly #observation: WorkspaceObservation
  readonly #base: BaseObservation
  constructor(
    observation: WorkspaceObservation = { ok: true, changes: [] },
    base: BaseObservation = { ok: true, digest: PINNED_BASE },
  ) {
    this.#observation = observation
    this.#base = base
  }
  observe(): Promise<WorkspaceObservation> {
    return Promise.resolve(this.#observation)
  }
  observeBase(): Promise<BaseObservation> {
    return Promise.resolve(this.#base)
  }
}

export class StaticArtifactObserver {
  readonly #observation: ArtifactObservation
  constructor(observation: ArtifactObservation = { ok: true, artifacts: [] }) {
    this.#observation = observation
  }
  observe(): Promise<ArtifactObservation> {
    return Promise.resolve(this.#observation)
  }
}

export interface TestPorts extends Ports {
  readonly journal: InMemoryRunJournal
  readonly lease: InMemoryRunLease
  readonly authority: CountingAuthoritySource
  readonly execution: DeterministicExecution
  readonly adapter: DeterministicAdapterInvocation
  readonly events: RecordingEventSink
  readonly evidence: RecordingEvidenceSink
}

/**
 * One visibility authority per port set, shared by the three commit
 * participants. It is created here rather than defaulted inside each
 * store because a store holding its OWN ledger would never see a commit
 * published through another — three transactions wearing one commit id.
 *
 * A test that supplies its own journal/events/evidence must build them
 * from `visibility` too; `sharedPorts()` below does exactly that, and is
 * what every commit-marker proof uses.
 */
export const sharedPorts = (): {
  readonly visibility: CommitLedger
  readonly journal: InMemoryRunJournal
  readonly events: RecordingEventSink
  readonly evidence: RecordingEvidenceSink
} => {
  const visibility = new CommitLedger()
  return {
    visibility,
    journal: new InMemoryRunJournal(visibility),
    events: new RecordingEventSink(visibility),
    evidence: new RecordingEvidenceSink(visibility),
  }
}

export const testPorts = (
  overrides: Partial<Ports> & { readonly visibility?: CommitLedger } = {},
): TestPorts => {
  const shared = sharedPorts()
  const visibility = overrides.visibility ?? shared.visibility
  const base = {
    authority: new CountingAuthoritySource(),
    observer: new StaticWorkspaceObserver(),
    workspace: new InMemoryWorkspaceLifecycle(),
    artifacts: new StaticArtifactObserver(),
    execution: new DeterministicExecution(),
    adapter: new DeterministicAdapterInvocation(),
    events: shared.events,
    evidence: shared.evidence,
    clock: new SteppingClock(),
    journal: shared.journal,
    lease: new InMemoryRunLease(),
    session: new InMemoryExecutionSession(),
    ...overrides,
  } as TestPorts
  // The commit participates over whatever ports this test actually
  // uses — including the failing doubles, which is the point.
  return {
    ...base,
    finalization:
      overrides.finalization ??
      new TransactionalFinalization({
        journal: base.journal,
        events: base.events,
        evidence: base.evidence,
        visibility,
        lease: base.lease,
      }),
  }
}

/**
 * The GOVERNED durable records — the sealed bundle or the early-terminal
 * refusal record.
 *
 * No filtering any more. This used to exclude the transition record,
 * which the evidence sink could once express; the sink now has exactly
 * two shapes and both are governed, so a filter here would only hide a
 * write a proof should see. That filter is also how the seal-last
 * violation stayed invisible once before.
 */
export const governedWrites = (ports: TestPorts, run_id?: string): readonly RecordedWrite[] =>
  run_id === undefined ? ports.evidence.all : ports.evidence.writesOf(run_id)

/**
 * A sink that fails selected writes but is otherwise real — crucially
 * including STAGING, which is where a finalization participant fails
 * now. A double that only failed the direct write would leave the commit
 * path untouched and prove nothing about it.
 *
 * There is deliberately no "it landed and then failed" mode any more.
 * That mode existed to exercise retraction, and it described a state the
 * staged design cannot enter: nothing lands until every participant has
 * agreed, so a failure never has anything to undo.
 */
export const evidenceSinkFailing = (
  shouldFail: (request: { readonly kind: string }) => boolean,
  base: RecordingEvidenceSink = new RecordingEvidenceSink(),
): RecordingEvidenceSink =>
  ({
    write: (request: { readonly kind: string }) =>
      shouldFail(request)
        ? Promise.reject(new Error('evidence sink down'))
        : base.write(request as never),
    stageWrite: (request: { readonly kind: string }) =>
      shouldFail(request)
        ? Promise.reject(new Error('evidence sink down'))
        : base.stageWrite(request as never),
    writesOf: base.writesOf.bind(base),
    get all() {
      return base.all
    },
  }) as unknown as RecordingEvidenceSink

export const eventSinkFailing = (
  shouldFail: (event: { readonly event_type: string }) => boolean,
  base: RecordingEventSink = new RecordingEventSink(),
): RecordingEventSink =>
  ({
    emit: (request: {
      readonly run_id: string
      readonly generation: number
      readonly sequence: number
      readonly event: { event_type: string }
    }) =>
      shouldFail(request.event) ? Promise.reject(new Error('event sink down')) : base.emit(request),
    stageEmit: (request: {
      readonly run_id: string
      readonly generation: number
      readonly commit_id: string
      readonly event: { event_type: string; sequence: number }
    }) =>
      shouldFail(request.event)
        ? Promise.reject(new Error('event sink down'))
        : base.stageEmit(request),
    eventsOf: base.eventsOf.bind(base),
    get runs() {
      return base.runs
    },
  }) as unknown as RecordingEventSink

export const journalFailing = (
  shouldFail: (transition: { readonly to: string }) => boolean,
  base: InMemoryRunJournal = new InMemoryRunJournal(),
): InMemoryRunJournal =>
  ({
    appendTransition: (request: { readonly transition: { to: string } }) =>
      shouldFail(request.transition)
        ? Promise.reject(new Error('journal down'))
        : base.appendTransition(request as never),
    stageTransitions: (request: { readonly transitions: readonly { to: string }[] }) =>
      request.transitions.some((entry) => shouldFail(entry))
        ? Promise.reject(new Error('journal down'))
        : base.stageTransitions(request as never),
    appendRejection: base.appendRejection.bind(base),
    appendAcquisition: base.appendAcquisition.bind(base),
    appendHold: base.appendHold.bind(base),
    readCurrentState: base.readCurrentState.bind(base),
  }) as unknown as InMemoryRunJournal

/**
 * An adapter that records the invocations it received and returns a
 * chosen observation. The recording is the point: the SPI's value is in
 * what the platform HANDS an adapter, and a fake that discarded it would
 * prove nothing about that half.
 */
export class ObservingAdapter {
  readonly invocations: AdapterInvocation[] = []
  readonly observation: AdapterObservation

  constructor(
    observation: AdapterObservation = {
      calls: [],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    },
  ) {
    this.observation = observation
  }

  invoke(request: AdapterInvocation): Promise<AdapterReport> {
    this.invocations.push(request)
    return Promise.resolve({ outcome: 'observed', observation: this.observation })
  }
}

/** Records the session lifecycle it was driven through. */
export class RecordingSession {
  readonly calls: string[] = []
  prepared: SessionPrepareRequest | undefined
  readonly handle: SessionHandle = {
    session_ref: 'session:run-20260812-0001',
    deadline: { wall_clock_seconds: 600 },
  }
  readonly #failures: { prepare?: string; start?: string }

  constructor(failures: { prepare?: string; start?: string } = {}) {
    this.#failures = failures
  }

  prepare(request: SessionPrepareRequest): Promise<SessionPreparation> {
    this.calls.push('prepare')
    this.prepared = request
    const failure = this.#failures.prepare
    return Promise.resolve(
      failure === undefined
        ? { ok: true, handle: { ...this.handle, session_ref: `session:${request.run_id}` } }
        : { ok: false, detail: failure },
    )
  }

  start(): Promise<SessionStart> {
    this.calls.push('start')
    const failure = this.#failures.start
    return Promise.resolve(failure === undefined ? { ok: true } : { ok: false, detail: failure })
  }

  interrupt(): Promise<FenceOutcome> {
    this.calls.push('interrupt')
    return Promise.resolve({ ok: true })
  }

  close(): Promise<SessionClosure> {
    this.calls.push('close')
    return Promise.resolve({ torn_down: true })
  }
}

/** An adapter that never returns, and records whether it saw the abort. */
export class HangingAdapter {
  aborted = false
  readonly requests: AdapterInvocation[] = []

  invoke(request: AdapterInvocation): Promise<AdapterReport> {
    this.requests.push(request)
    request.signal.addEventListener('abort', () => {
      this.aborted = true
    })
    return new Promise<AdapterReport>(() => {
      // Deliberately never settles: the orchestrator must not depend on
      // a provider being well behaved.
    })
  }
}

/** A gate that never returns. */
export class HangingExecution {
  readonly requests: GateExecutionRequest[] = []

  runGate(request: GateExecutionRequest): Promise<GateReport> {
    this.requests.push(request)
    return new Promise<GateReport>(() => {})
  }
}

/** Records the workspace lifecycle it was driven through. */
export class RecordingWorkspaceLifecycle {
  readonly calls: string[] = []
  applied: ApplyBackRequest | undefined
  readonly #failures: { provision?: string; applyBack?: string }

  constructor(failures: { provision?: string; applyBack?: string } = {}) {
    this.#failures = failures
  }

  provision(request: { run_id: string; source_ref: string }): Promise<WorkspaceProvision> {
    this.calls.push('provision')
    const failure = this.#failures.provision
    return Promise.resolve(
      failure === undefined
        ? {
            ok: true,
            handle: { workspace_ref: `workspace:${request.run_id}`, root: request.source_ref },
          }
        : { ok: false, detail: failure },
    )
  }

  applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
    this.calls.push('applyBack')
    const failure = this.#failures.applyBack
    if (failure !== undefined) return Promise.resolve({ ok: false, detail: failure })
    this.applied = request
    return Promise.resolve({ ok: true, applied: request.changes.length })
  }

  discard(): Promise<FenceOutcome> {
    this.calls.push('discard')
    return Promise.resolve({ ok: true })
  }
}

export const requester = (): PrincipalT => ({
  sub: 'human:mike',
  acting: { kind: 'autonomous' },
})

/** A request with no consent record at all — the HOLD case. */
export const withoutConsent = (request: RunRequest): RunRequest => {
  const { consent: _consent, ...rest } = request
  return rest
}

export { DeterministicExecution } from './adapters/index.js'

export const runRequest = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  run_id: 'run-20260812-0001',
  requester: requester(),
  profile_ref: { name: 'home-status-read', version: '1.0.0' },
  gates: ['lint'],
  input: { kind: 'task', task: 'observe the household', parameters: {} },
  workspace_root: '/workspace',
  pinned_base: PINNED_BASE,
  artifact_paths: [],
  consent: {
    run_id: 'run-20260812-0001',
    granted: true,
    by: 'human:mike',
    recorded_at: '2026-08-12T12:00:00.000Z',
  },
  ...overrides,
})

/**
 * Move a lease on, as a competing holder would.
 *
 * This was `InMemoryRunLease.steal()` — a public method on production
 * source, exported at the package root, that seized any run by id with
 * no claim and no fence. It is a PROOF affordance, so it lives here,
 * where the package's exports cannot reach it.
 */
export const seizeLease = (lease: InMemoryRunLease, run_id: string): number => {
  const seize = (lease as unknown as Record<symbol, ((id: string) => number) | undefined>)[SEIZE]
  if (seize === undefined) throw new Error('this lease exposes no seize affordance')
  return seize.call(lease, run_id)
}
