/**
 * The vocabulary the whole toolchain shares.
 *
 * Two ideas dominate, and both come from accepted architecture rather than
 * from convenience:
 *
 *  - **Parsed representation and raw bytes are different things.** Reasoning
 *    happens over the parse; IDENTITY happens over the bytes (ADR-0015 §6).
 *    Collapsing them would make a bundle's identity a function of a YAML
 *    library's dump settings.
 *
 *  - **Admission, publication, and authoring eligibility are three stages**
 *    (ADR-0016 §9a), so there is no single `valid` boolean anywhere in here.
 *    A module can be admitted and unpublishable, and that is a normal outcome
 *    rather than a failure.
 */

/** One source file, with its bytes kept apart from its parse. */
export interface SourceFile {
  /** Bundle-relative, POSIX-separated, NFC-normalized. */
  readonly path: string
  /** EXACT bytes as read. Identity is computed from these and nothing else. */
  readonly bytes: Uint8Array
}

/** A parsed OKF concept. `frontmatter` is for reasoning, never for identity. */
export interface CompiledDocument {
  readonly path: string
  readonly bytes: Uint8Array
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
  /** Line of the frontmatter block's opening delimiter, for precise failures. */
  readonly frontmatterLine: number
}

export interface CompiledBundle {
  readonly documents: readonly CompiledDocument[]
  /** Every member, including non-`.md` ones — an admission concern, not a parse one. */
  readonly members: readonly SourceFile[]
  readonly okfVersion: string | undefined
}

/** Why something was refused. Typed so a caller can branch, not just print. */
export type RefusalKind =
  | 'malformed_source'
  | 'okf_version'
  | 'okf_baseline'
  | 'metadata_missing'
  | 'metadata_shape'
  | 'catalog_mirror'
  | 'execution_bearing'
  | 'prohibited_indicator'
  | 'reference_integrity'
  | 'envelope'
  | 'attestation'

export interface Refusal {
  readonly kind: RefusalKind
  /** The path the refusal is about, where one applies. */
  readonly path?: string
  /** Stable identifier of the rule or indicator that fired. */
  readonly rule: string
  readonly detail: string
}

export type Compiled = { readonly ok: true; readonly bundle: CompiledBundle } | CompileFailure

export interface CompileFailure {
  readonly ok: false
  readonly refusals: readonly Refusal[]
}

/** The registry entry admission treats as authoritative (ADR-0015 §5a). */
export interface CatalogEntry {
  readonly id: string
  readonly owner: string
  readonly asOf: string
  readonly limitations: string
  readonly governingSources: readonly string[]
  readonly contentReview?: ContentReview
}

/** The repository content-review attestation (ADR-0016 §5). */
export interface ContentReview {
  readonly policy: string
  readonly by: string
  readonly at: string
  readonly sourceDigest: string
}

/**
 * Governed human-review evidence — Proof B (ADR-0016 §5a).
 *
 * An INPUT to the toolchain, never something it produces. No governed
 * machine-consumable producer exists in this repository, which is why
 * publication is unreachable today and why this type has no constructor here.
 */
export interface ReviewEvidence {
  /** The human the governed mechanism says actually reviewed. */
  readonly reviewer: string
  readonly policy: string
  readonly sourceDigest: string
  /** Identity of the exact attestation revision approved. */
  readonly attestationRevision: string
}

export type PublicationBlockReason =
  | 'proof_b_unavailable'
  | 'proof_b_actor_mismatch'
  | 'proof_b_policy_mismatch'
  | 'proof_b_stale_digest'
  | 'proof_b_stale_attestation'

/** The outcome of admission. `admitted` and `publishable` are separate facts. */
export interface AdmissionOutcome {
  readonly admitted: boolean
  readonly publishable: boolean
  readonly refusals: readonly Refusal[]
  readonly publicationBlockReason?: PublicationBlockReason
}
