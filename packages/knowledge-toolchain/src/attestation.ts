/**
 * PROOF A AND PROOF B — two proofs, and neither substitutes for the other.
 *
 * **Proof A (toolchain).** Offline and deterministic. It establishes that an
 * attestation record exists, is shaped correctly, names a recognized immutable
 * policy version, carries a syntactically valid actor, and binds to the exact
 * current bytes. Any byte change invalidates it.
 *
 * **Proof B (repository governance).** That an *eligible human actually
 * performed or approved* the review. `by: human:<id>` is a string a producer
 * writes — never, by itself, evidence that the human acted. The toolchain
 * validates the artifact and its binding; it does not and cannot validate who
 * reviewed.
 *
 * **There is no Proof B producer in this repository.** This module has no
 * constructor for `ReviewEvidence` and no way to mint one: evidence arrives
 * from outside, or publication stays blocked. That is ADR-0016 §5a's stated
 * position, expressed as code rather than as a comment — and it is why nothing
 * here makes a network call or consults a model.
 */
import type { ContentReview, PublicationBlockReason, Refusal, ReviewEvidence } from './types.js'

/**
 * The one policy this repository recognizes.
 *
 * It denotes ADR-0016 §1 and §2 as accepted, which are immutable — exactly the
 * property the identifier needs. A change in review meaning requires a new
 * version here, and attestations naming the old one stop satisfying admission
 * rather than being migrated silently.
 */
export const POLICY_V1 = 'portable-knowledge-prohibited-content-v1'
export const RECOGNIZED_POLICIES: ReadonlySet<string> = new Set([POLICY_V1])

const ACTOR = /^human:[A-Za-z0-9._-]+$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

/**
 * Identity of an exact attestation revision.
 *
 * Proof B binds to THIS, not merely to the content: changing `by`, `policy`,
 * or `sourceDigest` after review must invalidate the review, or a reviewed
 * attestation could have its actor swapped afterwards and carry the original
 * approval forward.
 */
export const attestationRevision = (review: ContentReview): string =>
  `${review.policy}|${review.by}|${review.at}|${review.sourceDigest}`

/** Proof A. Returns refusals; empty means the attestation binds. */
export const checkProofA = (
  review: ContentReview | undefined,
  currentDigest: string,
): readonly Refusal[] => {
  const bad = (rule: string, detail: string): Refusal => ({ kind: 'attestation', rule, detail })

  if (review === undefined)
    return [
      bad(
        'attestation.present',
        'no content-review attestation; the semantically undecidable classes are unestablished',
      ),
    ]

  const refusals: Refusal[] = []
  if (!RECOGNIZED_POLICIES.has(review.policy))
    refusals.push(
      bad('attestation.policy', `policy "${review.policy}" is not a recognized policy version`),
    )
  if (!ACTOR.test(review.by))
    refusals.push(bad('attestation.actor', `"by" is not a valid human actor: ${review.by}`))
  if (!ISO_INSTANT.test(review.at))
    refusals.push(bad('attestation.at', '"at" is not an ISO-8601 instant'))
  if (!DIGEST.test(review.sourceDigest))
    refusals.push(bad('attestation.digest.shape', '"sourceDigest" is not a sha256:<hex> digest'))
  else if (review.sourceDigest !== `sha256:${currentDigest}`)
    refusals.push(
      bad(
        'attestation.digest.binding',
        `attestation binds ${review.sourceDigest}; current source is sha256:${currentDigest}. Any byte change invalidates the review`,
      ),
    )
  return refusals
}

/**
 * Proof B. Returns a typed block reason, or `undefined` when it holds.
 *
 * Note what a valid Proof A does NOT do here: it does not make anything
 * publishable. The `evidence === undefined` branch is the state this repository
 * is permanently in until a governed producer exists.
 */
export const checkProofB = (
  review: ContentReview | undefined,
  evidence: ReviewEvidence | undefined,
  currentDigest: string,
): PublicationBlockReason | undefined => {
  if (review === undefined || evidence === undefined) return 'proof_b_unavailable'
  // A self-asserted `by` is not evidence of action: the governed mechanism must
  // independently name the reviewer, and it must be the same human.
  if (evidence.reviewer !== review.by) return 'proof_b_actor_mismatch'
  if (evidence.policy !== review.policy) return 'proof_b_policy_mismatch'
  if (evidence.sourceDigest !== `sha256:${currentDigest}`) return 'proof_b_stale_digest'
  // Bound to the exact attestation revision, so an attestation edited after
  // review cannot inherit the approval.
  if (evidence.attestationRevision !== attestationRevision(review))
    return 'proof_b_stale_attestation'
  return undefined
}
