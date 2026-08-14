/**
 * THE EFFECT-SEMANTICS TABLE — every asynchronous port method, classified.
 *
 * Owner decision (PR #82, 2026-08-14): every asynchronous method in the
 * complete L4 Ports surface is exactly one of five classes, the
 * classification is recorded in the governed design, and it is enforced
 * STRUCTURALLY at the composition boundary — never by naming convention,
 * comments, or call-site discipline.
 *
 * The type below is that enforcement. `PortEffectTable` is computed from
 * `Ports` itself: every port, every asynchronous method. Adding a port
 * or a method without classifying it fails to COMPILE; the boundary
 * proxy additionally refuses to run a method the table does not name, so
 * an unclassified method cannot cross even under type erasure.
 *
 * What each class means at the boundary:
 *
 *  - `discardable_read` — a late result can be thrown away without
 *    leaving meaningful external state. Guarded by the ordinary call
 *    boundary: expiry checked on entry AND when the result returns.
 *  - `acknowledged_effect` — execution can create durable, externally
 *    observable, authoritative, or resource state BEFORE the
 *    acknowledgement arrives. The boundary still unwinds promptly (the
 *    call is raced), because the class's safety comes from its
 *    obligations, not from waiting: the fact is accounted before or
 *    independently of the acknowledgement, the operation carries a
 *    stable caller-known identity where it can be replayed (journal
 *    entries), and a maybe-performed effect is resolved by teardown
 *    (session interrupt/close, workspace discard). A lost
 *    acknowledgement never makes orchestration assume the effect did
 *    not occur.
 *  - `acquisition` — creates ownership or resource state whose outcome
 *    may be unknowable to the caller; resolved AT THE RESOURCE by an
 *    explicit protocol (lease `abandon`, session `close`, workspace
 *    `discard`) rather than compensated at the caller.
 *  - `finalization` — the irreversible atomic commit and its staging.
 *    Crosses the boundary through `CallGuard.commit`: entry-checked,
 *    raced for boundedness, and its acknowledgement is ACCEPTED — the
 *    expiry that binds it is enforced synchronously at the publication
 *    point inside the commit, under a caller-known commit identity.
 *  - `cleanup` — best-effort teardown; late results are discardable and
 *    the operations are idempotent at the resource.
 */
import type { Ports } from '../ports/index.js'

export type EffectClass =
  | 'discardable_read'
  | 'acknowledged_effect'
  | 'acquisition'
  | 'finalization'
  | 'cleanup'

/** The asynchronous methods of one port — everything returning a Promise. */
type AsyncMethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => Promise<unknown> ? K : never
}[keyof T]

/**
 * One class per asynchronous method per port, exhaustively. `clock` is
 * excluded because `now()` is synchronous — it cannot outlive a boundary.
 */
export type PortEffectTable = {
  readonly [P in Exclude<keyof Ports, 'clock'>]: {
    readonly [M in AsyncMethodNames<Ports[P]>]: EffectClass
  }
}

export const PORT_EFFECTS: PortEffectTable = {
  authority: {
    // A late snapshot is discarded; the consumed acquisition TOKEN is
    // per-epoch state the epoch itself accounts for.
    read: 'discardable_read',
  },
  journal: {
    // Durable facts with stable caller-known entry identity: a replay of
    // the same identity must not create a second durable fact, which is
    // what lets a landed-but-unacknowledged append be resolved by retry.
    appendTransition: 'acknowledged_effect',
    appendRejection: 'acknowledged_effect',
    appendAcquisition: 'acknowledged_effect',
    appendHold: 'acknowledged_effect',
    // Staged invisibly under the commit identity; abandoned or published
    // only by the finalization commit.
    stageTransitions: 'finalization',
    readCurrentState: 'discardable_read',
  },
  lease: {
    // Resolution protocol: `abandon`, unique per-attempt identity, and
    // idempotent same-attempt replay (RO-INV-82).
    claim: 'acquisition',
    abandon: 'cleanup',
    // The renew answer is a fencing read; a late answer is discarded and
    // the next boundary asks again.
    renew: 'discardable_read',
    release: 'cleanup',
  },
  finalization: {
    commit: 'finalization',
  },
  session: {
    // The session ref is deterministic per run, so a prepared session
    // whose acknowledgement was lost is still reachable by teardown.
    prepare: 'acquisition',
    // A sandbox may have started although the acknowledgement was
    // rejected; interrupt/close on every exit is the resolution, and a
    // late `ok` is never consumed to earn SANDBOX_STARTED (RO-EX-151).
    start: 'acknowledged_effect',
    interrupt: 'cleanup',
    close: 'cleanup',
  },
  workspace: {
    provision: 'acquisition',
    // Applies changes to the host repository — the acknowledgement being
    // lost never implies the changes were not applied; the conclusion
    // reports an unconfirmed apply, and the workspace is discarded.
    applyBack: 'acknowledged_effect',
    discard: 'cleanup',
  },
  observer: {
    observeBase: 'discardable_read',
    observe: 'discardable_read',
  },
  artifacts: {
    observe: 'discardable_read',
  },
  execution: {
    // The gate RESULT is a decision input; the gate's side effects are
    // contained in the session/workspace, which observation and teardown
    // govern — not the acknowledgement.
    runGate: 'discardable_read',
  },
  adapter: {
    // The provider ran regardless of what the acknowledgement says. The
    // resolution is the execution session: interrupt and close bound
    // whatever the invocation started, and partial facts are accounted
    // through TerminalEvidence, never through the lost result.
    invoke: 'acknowledged_effect',
  },
  events: {
    // The event may land in the stream before its acknowledgement is
    // rejected. The FACT the event projects is recorded into terminal
    // accounting before the acknowledgement is awaited, so an
    // interrupted acknowledgement cannot erase it; identity is the
    // emitter-owned (run_id, sequence) envelope.
    emit: 'acknowledged_effect',
    stageEmit: 'finalization',
  },
  evidence: {
    // Governed records: the early-terminal record and (staged) bundle.
    // One record per (run, kind); a write whose acknowledgement is lost
    // is never assumed unwritten — the conclusion reports settlement
    // failure rather than claiming or denying durability it cannot see.
    write: 'acknowledged_effect',
    stageWrite: 'finalization',
  },
}
