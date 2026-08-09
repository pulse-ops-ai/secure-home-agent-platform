/**
 * Authored source for API and domain-facing contracts (ADR-0012 §7).
 *
 * Runner domain slice (L2/#51, `runner-domain-contracts`): the shared
 * runner primitives, the execution profile, the launch assertion, the path
 * policy, the gate registry, and the verification packs. Household slices
 * arrive under #28.
 */
export {
  AdapterId,
  CapabilityGrant,
  CredentialRef,
  Digest,
  GateId,
  Mount,
  MountPosture,
  NetworkPolicy,
  ProfileIdentity,
  ProfileRef,
  RoutingClass,
  SemVer,
} from './primitives.js'
export type {
  AdapterIdT,
  CapabilityGrantT,
  CredentialRefT,
  DigestT,
  GateIdT,
  ProfileIdentityT,
} from './primitives.js'
export { artifactPath, CONTRACT_ARTIFACTS, contractUrn } from './contract-artifacts.js'
export type { ContractArtifact } from './contract-artifacts.js'
export {
  EXECUTION_PROFILE_ID,
  EXECUTION_PROFILE_VERSION,
  ExecutionProfile,
} from './execution-profile.js'
export type { ExecutionProfileT } from './execution-profile.js'
export {
  LAUNCH_ASSERTION_ID,
  LAUNCH_ASSERTION_VERSION,
  LaunchAssertion,
} from './launch-assertion.js'
export type { LaunchAssertionT } from './launch-assertion.js'
export {
  GATE_REGISTRY_ID,
  GATE_REGISTRY_VERSION,
  GateDisposition,
  GateOutcome,
  GateRegistry,
  GateResults,
  GateSpec,
} from './gate-registry.js'
export type {
  GateDispositionT,
  GateOutcomeT,
  GateRegistryT,
  GateResultsT,
  GateSpecT,
} from './gate-registry.js'
export { PATH_POLICY_ID, PATH_POLICY_VERSION, PathPolicy } from './path-policy.js'
export type { PathPolicyT } from './path-policy.js'
export {
  PackId,
  PackSpec,
  VERIFICATION_PACKS_ID,
  VERIFICATION_PACKS_VERSION,
  VerificationPacks,
} from './verification-packs.js'
export type { PackSpecT, VerificationPacksT } from './verification-packs.js'
