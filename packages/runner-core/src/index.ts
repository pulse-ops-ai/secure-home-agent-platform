/**
 * The public trusted-operation surface of the runner decision core.
 *
 * Trusted domain operations and their value types — never modules,
 * classes, or internals. No exported operation accepts a path, file
 * handle, reader, port, or callback that could read one: bytes and
 * observations are values, and their acquisition is L4's (design D3/D4).
 *
 * Importing this module has no side effect: the package is inert until
 * L4 consumes it (RC-INV-07).
 */
export { captureAuthority, compareBaseIdentity } from './authority/index.js'
export type {
  AuthorityBytes,
  BaseIdentityMatch,
  AuthoritySnapshots,
  CapturedAuthority,
  CapturedIdentity,
  ContractDocument,
  ExpectedContract,
  SourceIdentity,
} from './authority/index.js'
export { isOperationalFailure, isProceed, isRefusal, REFUSAL_CODES } from './decision/index.js'
export type {
  Decision,
  ObservedDecision,
  OperationalFailure,
  Proceed,
  Refusal,
  RefusalCode,
  Violated,
} from './decision/index.js'
export { decideEligibility } from './eligibility/index.js'
export type { Eligible } from './eligibility/index.js'
export {
  classifyEvidenceFailure,
  constructEvidence,
  decideSealEligibility,
  indeterminateOutcome,
} from './evidence/index.js'
export type { EvidenceInputs, SealEligible, SealInputs } from './evidence/index.js'
export { decideMaterialization, enforceBound } from './policy/index.js'
export type { InBounds, Materializable } from './policy/index.js'
export { reconcileClaims } from './reconciliation/index.js'
export type { ClaimedChange, Disagreement, Reconciliation } from './reconciliation/index.js'
export { consumeVerified, verifyEvidence } from './verification/index.js'
export type {
  ConsumedArtifact,
  IndependentInputs,
  VerificationResult,
} from './verification/index.js'
export { deriveAuthoritativeChangeSet } from './workspace/index.js'
export type {
  ArtifactObservation,
  AuthoritativeChangeSet,
  ObservedArtifact,
  ObservedChange,
  WorkspaceObservation,
} from './workspace/index.js'
