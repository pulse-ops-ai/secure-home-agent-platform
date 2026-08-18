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
 * **OPAQUE ON PURPOSE.** The brand below is an unexported `unique symbol`, so
 * no code outside this package can produce a conforming value: matching the
 * other four fields is not enough, and there is no exported factory. A
 * structurally-typed interface was the original defect — ordinary consumer code
 * could write an object literal and make an admitted module publishable, and
 * "there is no function named `makeReviewEvidence`" is a naming convention
 * rather than a boundary.
 *
 * There is **no producer in this package either**. Proof B arrives from a
 * governed mechanism this repository does not yet have, which is why
 * publication is unreachable today. The threat model is ordinary structural
 * typing; a caller who reaches for an unsafe cast has left the type system, and
 * the runtime check in `checkProofB` still applies to them.
 */
declare const GOVERNED_REVIEW: unique symbol

export interface ReviewEvidence {
  /** Unforgeable outside this package: the symbol is not exported. */
  readonly [GOVERNED_REVIEW]: true
  /** The human the governed mechanism says actually reviewed. */
  readonly reviewer: string
  readonly policy: string
  readonly sourceDigest: string
  /** Identity of the exact attestation revision approved. */
  readonly attestationRevision: string
}

/**
 * Proof that a bundle passed ADMISSION.
 *
 * Also branded, and for the same reason: `packageBundle` used to accept any
 * `CompiledBundle`, so `compile(anything) → packageBundle → query` produced the
 * *same artifact type* that repository knowledge flows through. Admission was
 * advisory — a comment claimed the input had been admitted and nothing enforced
 * it. Only `admit()` mints this, so packaging now requires the proof rather
 * than trusting the caller.
 *
 * Foreign OKF still reads, through the package-internal `readForeign` — a
 * different path with a different input type, so tolerance is preserved without
 * laundering foreign bytes into the admitted artifact. That path is not
 * exported to consumers; see `query.ts`.
 *
 * It carries NO fields. The approved bytes live in a module-private map keyed
 * by this token (`admitted.ts`), because anything reachable from the proof
 * would be editable — `Object.freeze` does not freeze a `Uint8Array`'s
 * contents — and packaging would then describe bytes nobody admitted.
 */
declare const ADMITTED: unique symbol

export interface AdmittedBundle {
  readonly [ADMITTED]: true
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
  /** Present only when admitted. The proof `packageBundle` requires. */
  readonly proof?: AdmittedBundle
}
