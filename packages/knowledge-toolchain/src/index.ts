/**
 * The knowledge toolchain: the four ADR-0010 interfaces, plus the gate and
 * attestation machinery ADR-0015 and ADR-0016 require.
 *
 * `query` is the ONLY read path a consumer may use. Nothing here exports a
 * function that reads a repository file: `compile` and `admit` take supplied
 * bytes, and `query` takes a packaged artifact.
 *
 * There is no Proof B producer in this package, and there is no way to mint
 * `ReviewEvidence` from inside it. That absence is the accepted architecture,
 * not an omission.
 */
export { compile, RESERVED } from './compile.js'
export { admit, checkEnvelope, OKF_VERSION } from './admit.js'
export { packageBundle } from './packaging.js'
export type { PackagedBundle, PackagedDocument, PackagedMember } from './packaging.js'
export { query, readForeign } from './query.js'
export type { Concept, KnowledgeQuery } from './query.js'
export { bundleDigest, fileDigest, manifestBytes, PACKAGE_FORMAT } from './identity.js'
export {
  attestationRevision,
  checkProofA,
  checkProofB,
  POLICY_V1,
  RECOGNIZED_POLICIES,
} from './attestation.js'
export { authoringEligibility, resolveSet } from './gates.js'
export type { AuthoringDecision, GateState, SetResolution } from './gates.js'
export { BLIND_SPOTS, COVERAGE, UNDECIDABLE_CLASSES } from './indicators.js'
export type { EvidenceKind, IndicatorSpec } from './indicators.js'
export type {
  AdmissionOutcome,
  AdmittedBundle,
  CatalogEntry,
  Compiled,
  CompiledBundle,
  CompiledDocument,
  ContentReview,
  PublicationBlockReason,
  Refusal,
  RefusalKind,
  ReviewEvidence,
  SourceFile,
} from './types.js'
