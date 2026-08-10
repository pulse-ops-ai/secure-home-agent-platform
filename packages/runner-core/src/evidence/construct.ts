/**
 * Evidence construction (requirement "Evidence is constructed only from
 * authoritative inputs"). Every field derives from captured snapshots,
 * host observations, gate results, and outcome inputs; claims reach ONLY
 * the claim fields. Construction refuses — returning no partial bundle —
 * when a required authoritative input is missing, and, for a
 * success-classified outcome, when the observed change set fails the
 * captured policy's bounds (RC-ADV-02: the bound refusal precedes
 * construction; success evidence over a refused change set is a
 * contradiction). Failure-classified runs still construct evidence: a
 * refusal must be able to write refusal evidence (INV-003).
 *
 * The identities group records the digest-bound authority identities of
 * the governing path policy and gate registry (the amended
 * `runner-evidence` contract; task 5.1) — populated from the captured
 * snapshots, never from claims.
 */
import { EvidenceBundle, TERMINAL_SUCCESS, type EvidenceBundleT } from '@secure-home/events'
import { type Decision, proceed, refuse } from '../decision/index.js'
import { canonicalSort, digestOf, normalizePath } from '../primitives/index.js'
import type { AuthoritySnapshots } from '../authority/index.js'
import { decideMaterialization } from '../policy/index.js'
import type { Reconciliation } from '../reconciliation/index.js'
import type { ArtifactObservation, AuthoritativeChangeSet } from '../workspace/index.js'

export interface EvidenceInputs {
  readonly snapshots: AuthoritySnapshots
  readonly run: {
    readonly run_id: string
    readonly image_digest: string
    readonly argv_digest: string
    readonly runtime: string
    readonly provider: string
    readonly adapter: string
  }
  readonly principal: EvidenceBundleT['principal']
  readonly operations: EvidenceBundleT['operations']
  readonly gate_results: EvidenceBundleT['gate_results']
  readonly artifacts: ArtifactObservation
  readonly observed: AuthoritativeChangeSet
  readonly reconciliation: Reconciliation
  readonly outcome: EvidenceBundleT['outcome']
  readonly timing: EvidenceBundleT['timing']
}

export const constructEvidence = (inputs: EvidenceInputs): Decision<EvidenceBundleT> => {
  const { snapshots } = inputs
  const missing = (element: string): Decision<EvidenceBundleT> =>
    refuse(
      'missing_authority',
      { element },
      `evidence construction requires the captured ${element}; no partial bundle is returned`,
    )
  if (snapshots.profile === undefined) return missing('execution-profile')
  if (!snapshots.profile.ok) return snapshots.profile.refusal
  if (snapshots.path_policy === undefined) return missing('path-policy')
  if (!snapshots.path_policy.ok) return snapshots.path_policy.refusal
  if (snapshots.gate_registry === undefined) return missing('gate-registry')
  if (!snapshots.gate_registry.ok) return snapshots.gate_registry.refusal

  if (!inputs.artifacts.ok) {
    return refuse(
      'incomplete_evidence',
      { element: 'artifact surface' },
      `artifact observation reported failed: ${inputs.artifacts.failure} — evidence cannot claim an artifact set it could not observe`,
    )
  }

  // RC-ADV-02: for a success-classified outcome, the bound refusal
  // precedes construction. (TERMINAL_SUCCESS is the shared authority on
  // which terminal states classify as success.)
  if (TERMINAL_SUCCESS[inputs.outcome.terminal_state]) {
    const materialization = decideMaterialization(snapshots.path_policy, inputs.observed, [
      snapshots.profile.source.source,
      snapshots.path_policy.source.source,
      snapshots.gate_registry.source.source,
    ])
    if (materialization.kind === 'refusal') {
      return materialization
    }
  }

  const artifacts: { path: string; digest: string; bytes: number }[] = []
  for (const artifact of inputs.artifacts.artifacts) {
    const path = normalizePath(artifact.path)
    if (!path.ok) {
      return refuse(
        'path_undecidable',
        { element: artifact.path },
        `artifact path cannot be normalized: ${path.reason}`,
      )
    }
    artifacts.push({
      path: path.normalized,
      digest: digestOf(artifact.content),
      bytes: new TextEncoder().encode(artifact.content).length,
    })
  }

  const bundle = {
    contract_id: 'evidence-bundle',
    contract_version: '2.0.0',
    identities: {
      run_id: inputs.run.run_id,
      profile: {
        name: snapshots.profile.value.identity.name,
        version: snapshots.profile.value.identity.version,
        digest: snapshots.profile.digest,
      },
      image_digest: inputs.run.image_digest,
      argv_digest: inputs.run.argv_digest,
      path_policy: snapshots.path_policy.contract,
      gate_registry: snapshots.gate_registry.contract,
      runtime: inputs.run.runtime,
      provider: inputs.run.provider,
      adapter: inputs.run.adapter,
    },
    principal: inputs.principal,
    granted_capabilities: snapshots.profile.value.capability,
    operations: inputs.operations,
    gate_results: inputs.gate_results,
    artifacts: canonicalSort(artifacts, (artifact) => artifact.path),
    change_sets: {
      authoritative: 'observed',
      observed: inputs.observed.changes.map((change) => ({ path: change.path, kind: change.kind })),
      claimed: inputs.reconciliation.claimed.map((change) => ({
        path: change.path,
        kind: change.kind,
      })),
      reconciliation: {
        agreement: inputs.reconciliation.agreement,
        disagreements: inputs.reconciliation.disagreements.map((entry) => ({
          path: entry.path,
          detail: entry.detail,
        })),
      },
    },
    outcome: inputs.outcome,
    timing: inputs.timing,
  }

  const validated = EvidenceBundle.safeParse(bundle)
  if (!validated.success) {
    return refuse(
      'incomplete_evidence',
      { element: 'evidence-bundle' },
      `constructed evidence fails its own contract: ${validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')} — no partial bundle is returned`,
    )
  }
  return proceed(validated.data)
}
