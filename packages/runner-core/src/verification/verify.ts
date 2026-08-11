/**
 * INDEPENDENT verification (requirement "Independent verification
 * re-derives rather than re-reads the producer"; INV-011). The verifier
 * derives its expectation from authority bytes and artifact observations
 * supplied as immutable values DISTINCT from those given to the producer
 * (that they were independently acquired is L4's obligation), recomputes
 * every artifact digest itself, revalidates the claimed evidence against
 * its declared contract, and compares. It never imports the
 * evidence-construction module (design D6, mechanically guarded) and
 * never accepts the producer's serialized output as the source of its
 * expectation — the claimed bundle is exactly the thing under test.
 *
 * Fail-closed: absent, malformed, or self-contradictory evidence, a
 * digest divergence, a missing artifact, and an EXTRA unaccounted
 * artifact all fail, naming the condition. An unreadable surface is an
 * operational failure — not verified, and not a contract decision.
 */
import {
  ExecutionProfile,
  GateRegistry,
  PathPolicy,
  GATE_REGISTRY_ID,
  PATH_POLICY_ID,
  EXECUTION_PROFILE_ID,
} from '@secure-home/contracts'
import { EvidenceBundle } from '@secure-home/events'
import { operationalFailure, type OperationalFailure } from '../decision/index.js'
import { digestOf, normalizePath } from '../primitives/index.js'
import { captureAuthority } from '../authority/index.js'
import type { AuthorityBytes } from '../authority/index.js'
import type { ArtifactObservation } from '../workspace/index.js'

export interface IndependentInputs {
  readonly profile: AuthorityBytes
  readonly path_policy: AuthorityBytes
  readonly gate_registry: AuthorityBytes
  readonly artifacts: ArtifactObservation
}

export interface ConsumedArtifact {
  readonly path: string
  readonly digest: string
}

export type VerificationResult =
  | { readonly verified: true; readonly artifacts_consumed: readonly ConsumedArtifact[] }
  | { readonly verified: false; readonly failures: readonly string[] }
  | OperationalFailure

export const verifyEvidence = (
  claimedBundle: unknown,
  independent: IndependentInputs,
): VerificationResult => {
  if (!independent.artifacts.ok) {
    return operationalFailure(
      'artifact surface',
      `observation reported failed: ${independent.artifacts.failure} — not verified, and no contract decision is claimed`,
    )
  }

  const failures: string[] = []

  if (claimedBundle === undefined || claimedBundle === null) {
    return { verified: false, failures: ['evidence bundle is absent'] }
  }
  const parsed = EvidenceBundle.safeParse(claimedBundle)
  if (!parsed.success) {
    return {
      verified: false,
      failures: [
        `evidence bundle fails contract validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      ],
    }
  }
  const bundle = parsed.data

  // Self-contradiction (RC-ADV-08): two irreconcilable statements about
  // one artifact within the bundle itself.
  const byPath = new Map<string, string>()
  for (const artifact of bundle.artifacts) {
    const previous = byPath.get(artifact.path)
    if (previous !== undefined && previous !== artifact.digest) {
      return {
        verified: false,
        failures: [
          `bundle carries two irreconcilable digests for "${artifact.path}": ${previous} and ${artifact.digest}`,
        ],
      }
    }
    byPath.set(artifact.path, artifact.digest)
  }

  // Re-derive authority identities from the independently supplied
  // bytes and compare them FIELD-COMPLETE (review P1 on d749da7): a
  // bundle that lies about a name or contract version while keeping the
  // original digest must fail, not merely one with divergent bytes.
  const identityDiverges = (
    name: string,
    recorded: Record<string, string>,
    derived: Record<string, string>,
  ): void => {
    for (const [field, expected] of Object.entries(derived)) {
      if (recorded[field] !== expected) {
        failures.push(
          `${name} identity diverges on ${field}: bundle records ${JSON.stringify(recorded[field])}, independent capture derives ${JSON.stringify(expected)}`,
        )
      }
    }
  }
  let acquisitionFault: OperationalFailure | null = null

  const profileCapture = captureAuthority(independent.profile, {
    contract_id: EXECUTION_PROFILE_ID,
    schema: ExecutionProfile,
  })
  if ('kind' in profileCapture) {
    acquisitionFault = profileCapture
  } else if (!profileCapture.ok) {
    failures.push(
      `independent capture of profile refused: ${profileCapture.refusal.detail} — expectation cannot be derived`,
    )
  } else {
    identityDiverges('profile', bundle.identities.profile, {
      name: profileCapture.value.identity.name,
      version: profileCapture.value.identity.version,
      digest: profileCapture.digest,
    })
  }

  const recaptureContract = <T extends { contract_id: string; contract_version: string }>(
    name: string,
    input: AuthorityBytes,
    contractId: string,
    schema: Parameters<typeof captureAuthority<T>>[1]['schema'],
    recorded: Record<string, string>,
  ): void => {
    if (acquisitionFault !== null) return
    const captured = captureAuthority<T>(input, { contract_id: contractId, schema })
    if ('kind' in captured) {
      acquisitionFault = captured // operational failure acquiring the verifier's own inputs
      return
    }
    if (!captured.ok) {
      failures.push(
        `independent capture of ${name} refused: ${captured.refusal.detail} — expectation cannot be derived`,
      )
      return
    }
    identityDiverges(name, recorded, {
      contract_id: captured.contract.contract_id,
      contract_version: captured.contract.contract_version,
      digest: captured.contract.digest,
    })
  }
  recaptureContract(
    'path-policy',
    independent.path_policy,
    PATH_POLICY_ID,
    PathPolicy,
    bundle.identities.path_policy,
  )
  recaptureContract(
    'gate-registry',
    independent.gate_registry,
    GATE_REGISTRY_ID,
    GateRegistry,
    bundle.identities.gate_registry,
  )
  if (acquisitionFault !== null) return acquisitionFault
  if (failures.length > 0) return { verified: false, failures }

  // Artifact surface: recompute digests; membership must be EXACT.
  const consumed: ConsumedArtifact[] = []
  const observedPaths = new Set<string>()
  for (const artifact of independent.artifacts.artifacts) {
    const path = normalizePath(artifact.path)
    if (!path.ok) {
      failures.push(
        `observed artifact path cannot be normalized: "${artifact.path}" (${path.reason})`,
      )
      continue
    }
    observedPaths.add(path.normalized)
    const recomputed = digestOf(artifact.content)
    const recorded = byPath.get(path.normalized)
    if (recorded === undefined) {
      failures.push(
        `unaccounted artifact on the observed surface: "${path.normalized}" is absent from the bundle — never ignored as immaterial`,
      )
      continue
    }
    if (recorded !== recomputed) {
      failures.push(
        `artifact digest diverges for "${path.normalized}": bundle records ${recorded}, recomputation derives ${recomputed}`,
      )
      continue
    }
    consumed.push({ path: path.normalized, digest: recomputed })
  }
  for (const path of byPath.keys()) {
    if (!observedPaths.has(path)) {
      failures.push(`bundle names artifact "${path}" but it is missing from the observed surface`)
    }
  }

  if (failures.length > 0) return { verified: false, failures }
  return { verified: true, artifacts_consumed: consumed }
}
