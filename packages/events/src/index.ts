/**
 * Run event and evidence contracts (ADR-0003, ADR-0012 §14).
 *
 * Runner domain vocabulary (L2/#51, `runner-domain-contracts`): the run
 * record with its enumerated terminal vocabulary, the closed platform
 * event vocabulary, and the evidence bundle. Shared runner primitives are
 * imported from `@secure-home/contracts` — one definition, never a
 * semantically equivalent second one here.
 */
export {
  EarlyTerminationOutcome,
  RUN_RECORD_ID,
  RUN_RECORD_VERSION,
  RunId,
  RunOutcome,
  RunRecord,
  TERMINAL_SUCCESS,
  TerminalState,
} from './run-record.js'
export type {
  EarlyTerminationOutcomeT,
  RunIdT,
  RunOutcomeT,
  RunRecordT,
  TerminalStateT,
} from './run-record.js'
export {
  EARLY_TERMINATION_RECORD_ID,
  EARLY_TERMINATION_RECORD_VERSION,
  EarlyTerminationRecord,
} from './early-termination-record.js'
export type { EarlyTerminationRecordT } from './early-termination-record.js'
export {
  CallId,
  EVENT_TYPES,
  EventType,
  OperationRecord,
  RUN_EVENT_ID,
  RUN_EVENT_VERSION,
  RunEvent,
} from './run-events.js'
export type { EventTypeT, RunEventT } from './run-events.js'
export {
  ArtifactEntry,
  ChangeSets,
  EVIDENCE_BUNDLE_ID,
  EVIDENCE_BUNDLE_VERSION,
  EvidenceBundle,
  EvidenceIdentities,
  EvidenceOperation,
  EvidenceTiming,
  FileChange,
  Principal,
} from './evidence.js'
export type { EvidenceBundleT } from './evidence.js'
