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
  GateDefinition,
  GateDisposition,
  GateRegistry,
  GateRegistryBase,
  GateResult,
  GateResultSet,
  GateResultSetBase,
} from './gate-registry.js'
export type {
  GateDefinitionT,
  GateDispositionT,
  GateRegistryT,
  GateResultT,
} from './gate-registry.js'
export { PATH_POLICY_ID, PATH_POLICY_VERSION, PathPolicy } from './path-policy.js'
export type { PathPolicyT } from './path-policy.js'
export {
  VERIFICATION_PACKS_ID,
  VERIFICATION_PACKS_VERSION,
  VerificationPack,
  VerificationPacks,
  VerificationPacksBase,
} from './verification-packs.js'
export type { VerificationPackT, VerificationPacksT } from './verification-packs.js'
