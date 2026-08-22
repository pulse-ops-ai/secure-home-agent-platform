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
/**
 * `query` is the ONLY repository-consumer read seam exported here.
 *
 * `readForeign` is deliberately NOT re-exported. It takes a `CompiledBundle`,
 * which carries no provenance saying the bytes are foreign — so a public
 * export of it would let consumer code compile repository-candidate bytes that
 * admission refuses and read them anyway. Tolerant foreign conformance is still
 * tested, from inside this package, against `./query.js` directly.
 *
 * A public foreign ingress would need its own governed provenance boundary.
 * That architecture is not invented here.
 */
export { query } from './query.js'
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
export {
  SET_RELEASE_FORMAT,
  TASK_DELTA_FORMAT,
  RESOLVED_KNOWLEDGE_FORMAT,
  RELEASE_REVIEW_POLICY,
  RELEASE_VERSION,
  RELEASE_STATES,
  COMPOSABLE_MODULE_STATES,
  canonicalSetReleaseManifest,
  digestSetReleaseManifest,
  parseSetReleaseManifest,
  isCanonicalSetReleaseManifest,
  buildSetReleaseCandidate,
  validateSetReleaseRecord,
  releaseManifestPath,
  lookupSetRelease,
  releaseAdoptionDecision,
  releaseRunDecision,
  canonicalTaskDelta,
  digestTaskDelta,
  canonicalResolvedSelection,
  digestResolvedSelection,
  applyTaskDelta,
} from './set-release.js'
export type {
  ReleaseState,
  ReleaseMember,
  LogicalRelease,
  ReleaseRefusal,
  ReleaseResult,
  MemberCandidate,
  SetFamily,
  SetReleaseCandidate,
  ReleaseReview,
  SetReleaseRecord,
  ReleaseDecision,
  TaskDelta,
  ResolvedSelection,
} from './set-release.js'
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
