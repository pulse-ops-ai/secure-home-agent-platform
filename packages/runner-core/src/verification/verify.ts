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

  // Re-derive authority identities from the independently supplied bytes.
  const digests = new Map<string, { digest: string; version: string }>()
  let acquisitionFault: OperationalFailure | null = null
  const recapture = <T extends { contract_id: string; contract_version: string }>(
    name: string,
    input: AuthorityBytes,
    contractId: string,
    schema: Parameters<typeof captureAuthority<T>>[1]['schema'],
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
    digests.set(name, { digest: captured.digest, version: captured.value.contract_version })
  }
  recapture('profile', independent.profile, EXECUTION_PROFILE_ID, ExecutionProfile)
  recapture('path_policy', independent.path_policy, PATH_POLICY_ID, PathPolicy)
  recapture('gate_registry', independent.gate_registry, GATE_REGISTRY_ID, GateRegistry)
  if (acquisitionFault !== null) return acquisitionFault
  if (failures.length > 0) return { verified: false, failures }

  const profileCapture = digests.get('profile')
  if (profileCapture !== undefined && bundle.identities.profile.digest !== profileCapture.digest) {
    failures.push(
      `profile identity diverges: bundle records ${bundle.identities.profile.digest}, independent capture derives ${profileCapture.digest}`,
    )
  }
  const policyCapture = digests.get('path_policy')
  if (
    policyCapture !== undefined &&
    bundle.identities.path_policy.digest !== policyCapture.digest
  ) {
    failures.push(
      `path-policy identity diverges: bundle records ${bundle.identities.path_policy.digest}, independent capture derives ${policyCapture.digest}`,
    )
  }
  const registryCapture = digests.get('gate_registry')
  if (
    registryCapture !== undefined &&
    bundle.identities.gate_registry.digest !== registryCapture.digest
  ) {
    failures.push(
      `gate-registry identity diverges: bundle records ${bundle.identities.gate_registry.digest}, independent capture derives ${registryCapture.digest}`,
    )
  }

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
