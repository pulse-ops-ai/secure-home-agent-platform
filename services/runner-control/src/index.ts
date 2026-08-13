/**
 * The runner substrate's typed surface.
 *
 * Framework-free by construction: this module does not export, or
 * transitively import, the NestJS application shell. The shell lives at
 * `./app` and is imported only by something that intends to start an
 * application — which nothing in this repository does (design D2).
 *
 * Importing this module has no side effect. It defines types, classes,
 * and pure functions; it opens no socket, spawns no process, reads no
 * file, and starts no timer.
 */
export {
  AcquisitionSet,
  AUTHORITY_SOURCE_NAMES,
  AUTHORITY_SOURCES,
  runEpoch,
  type AcquisitionError,
  type AcquisitionOutcome,
  type AuthoritySourceName,
  type EpochResult,
  type EpochValue,
} from './acquisition/index.js'
export {
  DeterministicAdapterInvocation,
  DeterministicExecution,
  FilesystemArtifactObserver,
  FilesystemAuthoritySource,
  FilesystemWorkspaceObserver,
  InMemoryRunJournal,
  InMemoryRunLease,
  RecordingEventSink,
  RecordingEvidenceSink,
  SteppingClock,
  type RecordedWrite,
} from './adapters/index.js'
export { decideSpendGate, type ConsentRecord, type SpendGate } from './consent/index.js'
export { RunEventEmitter, type EmitOutcome, type EventIdentity } from './events/index.js'
export {
  FinalizationLedger,
  WRITE_KINDS,
  type SealResult,
  type WriteEntry,
  type WriteKind,
} from './finalization/index.js'
export {
  assembleEvidence,
  buildEarlyTerminationRecord,
  outcomeFor,
  type AssemblyResult,
  type EarlyTerminationInputs,
  type EvidenceAssemblyInputs,
} from './finalization/records.js'
export {
  canConstructEvidence,
  declaredNext,
  isTerminal,
  PROGRESS_STATES,
  REJECTION_REASONS,
  RunMachine,
  TERMINAL_STATES,
  TRANSITIONS,
  TRANSITIONS_KINDS,
  type LifecycleState,
  type ProgressState,
  type RejectionEntry,
  type RejectionReason,
  type TerminalState,
  type TransitionEntry,
  type TransitionKind,
  type TransitionResult,
  type WriteClaim,
} from './lifecycle/index.js'
export { observeArtifacts, observeWorkspace } from './observation/index.js'
export * from './ports/index.js'
export type { PrincipalT, ProfileRefT } from './ports/contract-types.js'
export {
  buildPlan,
  DISPOSITION_ERRORS,
  DispositionRecorder,
  toDisposition,
  type DispositionError,
  type PlanResult,
  type PlannedGate,
  type RecordOutcome,
} from './scheduling/index.js'
export { Runner, type RunConclusion, type RunRequest, type RunSignals } from './runner.js'
