/**
 * Contract family: verification — the gate registry, gate outcomes, and
 * the verification packs (capability `runner-verification`).
 */
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
export {
  PackId,
  PackSpec,
  VERIFICATION_PACKS_ID,
  VERIFICATION_PACKS_VERSION,
  VerificationPacks,
} from './verification-packs.js'
export type { PackSpecT, VerificationPacksT } from './verification-packs.js'
