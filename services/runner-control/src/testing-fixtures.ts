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
  SteppingClock,
  type RecordedWrite,
} from './adapters/index.js'
import type { ArtifactObservation, BaseObservation, WorkspaceObservation } from './ports/index.js'
import type { PrincipalT } from './ports/contract-types.js'
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
  readonly authority: CountingAuthoritySource
  readonly execution: DeterministicExecution
  readonly adapter: DeterministicAdapterInvocation
  readonly events: RecordingEventSink
  readonly evidence: RecordingEvidenceSink
}

export const testPorts = (overrides: Partial<Ports> = {}): TestPorts =>
  ({
    authority: new CountingAuthoritySource(),
    workspace: new StaticWorkspaceObserver(),
    artifacts: new StaticArtifactObserver(),
    execution: new DeterministicExecution(),
    adapter: new DeterministicAdapterInvocation(),
    events: new RecordingEventSink(),
    evidence: new RecordingEvidenceSink(),
    clock: new SteppingClock(),
    ...overrides,
  }) as TestPorts

/**
 * The GOVERNED durable records — the sealed bundle or the early-terminal
 * refusal record. Excludes the transition record, which every run writes
 * as diagnostics: a proof about "what governed record did this run
 * produce" must not count the walk itself as one.
 */
export const governedWrites = (ports: TestPorts, run_id?: string): readonly RecordedWrite[] =>
  (run_id === undefined ? ports.evidence.all : ports.evidence.writesOf(run_id)).filter(
    (write) => write.kind !== 'transition_record',
  )

export const requester = (): PrincipalT => ({
  sub: 'human:mike',
  acting: { kind: 'autonomous' },
})

/** A request with no consent record at all — the HOLD case. */
export const withoutConsent = (request: RunRequest): RunRequest => {
  const { consent: _consent, ...rest } = request
  return rest
}

export const runRequest = (overrides: Partial<RunRequest> = {}): RunRequest => ({
  run_id: 'run-20260812-0001',
  requester: requester(),
  profile_ref: { name: 'home-status-read', version: '1.0.0' },
  gates: ['lint'],
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
