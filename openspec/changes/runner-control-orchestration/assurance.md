# Assurance Plan: runner-control-orchestration

## Purpose

This artifact defines how the accepted specification and design will be
proven before the change is considered complete. It does not create new
product requirements.

Identifier convention: inherited identifiers keep their canonical names;
identifiers minted by this change are prefixed `RO-`.

---

## Risk Classification

**Risk:** `trust-critical`

### Rationale

- **Authorization.** The spend transition gates model/provider spend on
  consent AND eligibility; a transition bypass is an authorization bypass.
- **Judge protection, code side.** This landing owns INV-008's
  orchestration-provenance clause — the donor's recorded gap. A defect
  here lets a run alter the logic that judges it.
- **Acquire-once.** INV-007's L4 half lands here; a silent re-read
  reopens the mid-run mutation attack L3 can only defend against
  snapshot-side.
- **Evidence ordering.** Seal-last is owned here; wrong ordering produces
  evidence that half-describes a run.
- **Public port surface.** The ports are what L7/L9 implement; a weak port
  signature would let an implementer smuggle authority.

Not merely `high`: the failure modes are silent permission, silent
protection lapse, and silent history distortion.

Per the ratified review plan, a trust-critical child change carries an
**Authority Chain** table and a **before × after transition matrix**. Both
are below.

## Critical Invariants

### Inherited from the ratified `runner-adoption` contract

| ID | What L4 specifically must hold |
|---|---|
| INV-004 | the run lifecycle is a typed, total state machine; undeclared transitions rejected loudly; terminal states final |
| INV-005 | authority only from a versioned execution profile; consent is never authority |
| INV-007 | *(L4 half)* each source physically acquired AT MOST once per epoch — production (for every run, before `PROFILE_RESOLVED`) and verification (only for runs that reach it) — never twice within an epoch, epochs never cross-fed; an incomplete production epoch terminates fail-closed |
| INV-008 | *(code side)* decision-bearing orchestration executes only from trusted platform-controlled code, never the writable workspace |
| INV-009 | *(scheduling side)* only declared gates; exactly the registry's argv; caller cannot widen |
| INV-011 | *(ordering half)* evidence sealed last, after the core's eligibility |
| INV-016 | one terminal disposition per gate identity; `SKIP_ENV` never normalized; truncation is FAIL-with-reason |

### Minted by this change

| ID | Invariant | Class |
|---|---|---|
| RO-INV-01 | The runtime dependency set is exactly the three platform packages plus the pinned ADR-0012 framework set for the inert shell — no zod, no client SDK, no container runtime | trust |
| RO-INV-02 | No source file contains a container-runtime client, Docker socket path, or real process spawn; the execution/adapter ports have only deterministic test implementations in-repo | trust |
| RO-INV-03 | No dynamic import/require with a non-literal specifier and no eval-family primitive anywhere in `src/` | trust |
| RO-INV-04 | An acquisition token is single-use within its epoch: a second consumption attempt is a structural error naming source and epoch, and performs no host read; production and verification sets are never cross-fed | trust |
| RO-INV-05 | The scheduling interface accepts gate identities only — argv for a declared gate is not expressible by a caller | trust |
| RO-INV-06 | Every trust decision recorded for a run is attributable to a trusted-core operation invocation (no re-implementation) | trust |
| RO-INV-07 | The shell is inert: importing the service (including the NestJS module tree) starts nothing, binds no listener, spawns nothing | behavior |
| RO-INV-08 | One run has one writer: concurrent transition attempts serialize; a lost race is a recorded rejection | behavior |
| RO-INV-09 | Requester attribution written into an early-termination record (normative in `runner-lifecycle`) comes from the `REQUESTED` run-request input — never fabricated, inferred, or taken from a captured profile | trust |
| RO-INV-10 | Runs are isolated across the shared ports (normative in `runner-execution-boundary`): the core holds no unkeyed mutable per-run state, every run-scoped port call carries its `run_id`, and no ordering claim this landing makes is global | behavior |
| RO-INV-11 | A run executes only under the profile its request named: a captured profile whose identity differs from the requested reference refuses before `PROFILE_RESOLVED` | trust |
| RO-INV-12 | Consent authorizes exactly one run: a record whose `run_id` is not this run's does not open the spend gate | trust |
| RO-INV-13 | The pinned workspace base is compared by the trusted core BEFORE any adapter invocation; a mismatch refuses with nothing invoked | trust |
| RO-INV-14 | Independent verification decides a run's success: the second epoch's values and a fresh artifact observation reach the core's verifier, and a negative or operational verdict prevents `COMPLETED` | trust |
| RO-INV-15 | The success terminal is entered only after the bundle seals, and the seal is the run's last write — every event, the terminal event included, is submitted first | behavior |
| RO-INV-16 | Every call an adapter reports is recorded as a `call.attempted`/`call.disposition` pair and as an evidence operation under its reported disposition | trust |
| RO-INV-17 | A transition is recorded only for something that happened: `EVIDENCE_SEALED` after the write succeeds, never before | behavior |
| RO-INV-18 | A capture the core REFUSED never travels onward as a snapshot — every required source must capture cleanly to leave `REQUESTED` | trust |
| RO-INV-19 | A contract refusal terminates `REFUSED` and an environmental fault `OPERATIONAL_FAILURE`; neither is relabelled as the other at any layer (INV-003 at the evidence boundary) | trust |
| RO-INV-20 | The observed workspace base is content-bound, and path containment is decided on link-resolved paths | trust |
| RO-INV-21 | A port implementation that throws cannot end a run in no state: `run()` always resolves with a terminal state and its record | behavior |
| RO-INV-22 | Cancellation and timeout are honoured at every non-terminal boundary, verification included | behavior |
| RO-INV-23 | Evidence records the EXECUTION principal — the profile's agent identity acting for the requester; a profile requiring an actor refuses a requester that supplies none | trust |
| RO-INV-24 | The transition record is durable: every run writes its walk, refusals and holds included | behavior |
| RO-INV-25 | A write claim minted for another run cannot advance this run's machine | behavior |
| RO-INV-26 | Event envelope fields are the emitter's: no caller body may replace `run_id`, `sequence`, `adapter`, or the contract identity | trust |
| RO-INV-27 | The machine is authoritative over effects: a phase's effects run only after the previous phase's transition was ACCEPTED, so narrowing the transition table narrows what executes | trust |
| RO-INV-28 | The transition record is a JOURNAL: every transition, rejection, hold, and acquisition is appended as it happens, so a run that dies mid-walk is still reconstructable from what was written | behavior |
| RO-INV-29 | A held run has a durable pending identity naming the state it is held at — recorded, never dropped | behavior |
| RO-INV-30 | One run has one owner across processes: a run whose lease is held elsewhere performs no effect, and a run that loses its lease mid-walk stops before the next phase's effects | trust |
| RO-INV-31 | Finalization is ONE transition: the journal tail, the terminal event, and the sealed bundle commit together or none of them is observable | trust |
| RO-INV-32 | The terminal event's outcome is the COMMITTED outcome — never an intended one; no event announces a terminal the run did not reach | trust |
| RO-INV-33 | The machine authorizes the WHOLE terminal sequence before the commit, and adopts the committed entries verbatim afterwards | trust |
| RO-INV-34 | The adapter invocation is platform-built and carries no launch capability: no image, mount, socket, argv, or command is expressible in it | trust |
| RO-INV-35 | An adapter receives credential REFERENCES only — the invocation has no field a value could occupy | trust |
| RO-INV-36 | An adapter cannot report a terminal state: its observations are separate fields that may disagree, and the lifecycle classifies them — a disagreement is `INDETERMINATE`, a failure class | trust |
| RO-INV-37 | Model output enters as an untrusted claim and never reaches the authoritative change set; usage is recorded in native units and money is not modeled | trust |
| RO-INV-38 | `SANDBOX_STARTED` is CAUSED, not asserted: the transition into it is earned by preparing and starting an execution session, and a session that will not open never reaches the state | trust |
| RO-INV-39 | Every run that opens a session closes it, on every exit; a run that opened none closes nothing | behavior |
| RO-INV-40 | Cancellation reaches work in flight: the abort signal is handed to the adapter and gate calls AND raced against them, so a call that ignores it cannot hold the run open, and the session is interrupted rather than merely abandoned | trust |
| RO-INV-41 | Every run has a deadline, taken from the profile's declared wall clock; there is no unbounded run | behavior |
| RO-INV-42 | The authoritative change set is DERIVED from a baseline manifest captured at the run's base observation; a run with no baseline gets a refusal, never a fabricated change set | trust |
| RO-INV-43 | Observation digests are taken over RAW BYTES, so a binary substitution cannot hash identically to what it replaced | trust |
| RO-INV-44 | Entries are observed with `lstat`: a symlink is recorded AS a symlink with its resolved `link_target`, and an artifact read is of the named path or is refused | trust |
| RO-INV-45 | Artifact observation is bounded by file count and file size, and refuses content it cannot carry faithfully rather than corrupting it | trust |
| RO-INV-46 | The seal is the run's last write of ANY kind — nothing, including the transition record, follows it | trust |
| RO-INV-47 | Finalization performs no compensating publication. All fallible participant preparation stays invisible; exactly ONE commit-visibility operation makes the journal tail, terminal event, and sealed evidence observable together; abandoning an uncommitted preparation changes no observable run state | trust |
| RO-INV-48 | FENCING, stated to what the mechanism delivers. Once a resource has served generation N+1, generation N can never write there again — the resource itself refuses, without consulting the lease. The run additionally renews at every phase boundary, and re-establishes ownership directly before the two writes that escape: the commit marker and apply-back. What this does NOT claim is that a dispossessed holder writes nothing anywhere: a fencing token cannot be checked against a generation the resource has not yet seen, so a stale write to a resource the new owner has not touched is admitted. Terminating the dispossessed worker itself is L9's, where process and container teardown become real | trust |
| RO-INV-49 | A journal append that fails leaves its entry PENDING for retry; the cursor advances only for what landed | behavior |
| RO-INV-50 | Every terminal transition is checked, on the failure paths too, and they go through ONE owner rather than several local helpers. A terminal the machine refuses is not recorded as having happened; the run falls back to INDETERMINATE, and if the table grants no terminal at all the conclusion reports the run as unterminated rather than claiming a state the machine never granted | trust |
| RO-INV-51 | A session or lease port that THROWS cannot leak a session or replace the run's conclusion; `run()` always resolves | behavior |
| RO-INV-52 | A run writes into an isolated workspace provisioned before execution, and discarded on every exit | trust |
| RO-INV-53 | Changes leave the workspace only on the trusted core's materialization decision; a refusal applies nothing, and what is applied back is exactly the AUTHORITATIVE observation | trust |
| RO-INV-54 | Apply-back precedes the seal, and a run whose changes did not land does not seal as `COMPLETED` | trust |
| RO-INV-56 | Provider terminal-observation classification is the CORE's: orchestration passes the observations to `classifyTerminalObservations` and obeys, and no orchestration module reads `exit_code`, `signalled` or `reported_outcome` to reach a verdict | trust |
| RO-INV-57 | The transition record has ONE authority. `RunJournalPort` owns it; `EvidenceSinkPort` expresses exactly two shapes — the sealed bundle and the early-terminal record — and cannot express a transition record at all | trust |
| RO-INV-58 | Orchestration is decomposed by PHASE and typed by what each phase has established. A phase receives only the state it earned, so reading state it has not is a compile error; no definite-assignment assertion re-enters the tree; and the module sizes are held by a ratchet that may only decrease | behavior |
| RO-INV-59 | Proof affordances are not runtime authority: `RunSignals` carries only the interrupt, transition tables are validated as NARROWINGS of the canonical lifecycle, and the armed wall clock is bounded by the captured profile — never by what the session port reports | trust |
| RO-INV-60 | Cancellation is honoured at EVERY declared boundary, REQUESTED and pre-spend included, and a cancelled run holding an open session interrupts it rather than merely closing it | behavior |
| RO-INV-61 | Ownership is lost two ways — a lease that moved and a resource that refused the fence — and BOTH halt the walk before the next phase's effects. A dispossessed run performs no effect and writes no governed record, its own conclusion and the sinks agreeing | trust |
| RO-INV-62 | A conclusion states what it IS — terminal, held, ownership_lost, or not_started — distinctly from the state it reports. An attempt that lost ownership declares its own end, never the logical run's: manufacturing a lifecycle terminal is the one verdict a stale holder may not give | trust |
| RO-INV-63 | The seal requires a COMPLETE durable record: a journal append still pending is an outstanding write of the run, so the walk is flushed before anything is staged and a run whose walk cannot be made durable does not seal | trust |
| RO-INV-64 | Every port that can hang is bounded by the run's wall clock, not only the provider and the gates; the deadline is armed BEFORE the first such call rather than after the last | behavior |
| RO-INV-65 | A commit capability is frozen at mint, one-shot, and bound to the machine VERSION it was projected from — so it cannot be edited between authorization and use, and a stale projection cannot advance a machine that has since moved | trust |
| RO-INV-66 | The canonical transition table is deep-frozen at its source, so the default path retains immutable lifecycle authority — `RunMachine` is exported and defaults to it directly, which freezing inside `Runner` would not reach | trust |
| RO-INV-67 | The run's budget is enforced at ONE complete asynchronous port boundary, not by abandoning the walk: every awaited port from lease claim through cleanup is guarded, so an interrupt unwinds the continuation at that call and a delayed answer cannot start the next effect. The pre-profile acquisition ceiling is replaced before session preparation by one absolute profile expiry; later narrowing preserves elapsed profile time | behavior |
| RO-INV-68 | The submitted run's one cancellation input is effective, not advisory: `interrupt` is polled while a call is OUTSTANDING rather than only between phases, and a source enumeration re-consults it after draining as well as before each source | behavior |
| RO-INV-69 | A structural guard is proven by EXERCISING it against a planted counterexample, never by reading its own text. A guard that names a property lexically is a proxy for it, and a suite that only greps the guard tests the proxy — so each such guard is run against something it must catch and something it must not | behavior |
| RO-INV-70 | An effect is not STARTED once the run is aborted. Every async port method is invoked through a thunk-owning guard, so the call cannot be evaluated after the abort check; rejection unwinds the phase at that await and prevents any later phase effect from starting | trust |
| RO-INV-71 | A projection has ONE representation. The entries handed to finalization ARE the entries the capability owns and the machine later adopts, frozen, so a port that edits what it was given cannot leave durable history and machine state disagreeing about what the run did | trust |
| RO-INV-72 | TIMED_OUT's provenance is the GOVERNED wall clock. A caller's interrupt expresses cancellation only — narrowed in the type and coerced at the boundary, because a type is erased at runtime — so a requester cannot author a terminal cause the lifecycle contract assigns to the deadline mechanism | trust |
| RO-INV-73 | An interrupted run's RECORD does not depend on scheduler latency or which interrupt arrived. After the ordinary port guard unwinds the phase, a fresh bounded settlement guard writes the state-appropriate early record or full bundle and releases resources; a conclusion's arrays are snapshots and cannot mutate after return | behavior |
| RO-INV-74 | The complete run boundary is bounded: lease claim, authority reads, phase effects, terminal settlement, resource cleanup, and lease release. A shortening-only override is capped by the standing acquisition ceiling; after capture, the profile establishes one expiry before session preparation and the session may only narrow it, never restart it | behavior |
| RO-INV-75 | A concluded attempt performs no later orchestration effect. A delayed underlying port promise may settle, but no run continuation remains attached to its value; terminal conclusions expose snapshot arrays, so reading one twice yields the same transition and rejection record | trust |
| RO-INV-76 | Terminal settlement has its own failure identity and capability. Its expiry can make settlement incomplete, but can never manufacture `TIMED_OUT`; while the run remains non-terminal, cancellation and the governed profile expiry still interrupt finalization before publication | trust |
| RO-INV-77 | Transition and rejection entries are immutable at mint and cross the journal boundary as frozen copies. No return value, public snapshot, pending-journal value, or defective port can rewrite the machine's private history by reference | trust |
| RO-INV-78 | Ownership acquisition cannot succeed invisibly after the caller has concluded `not_started`: if the bounded wait ends first, a late successful claim is released under a finite cleanup boundary before it can become an orphaned owner | behavior |
| RO-INV-79 | Every terminal at or after `PROFILE_RESOLVED`, including last-resort recovery from an escaping port fault, seals the full evidence bundle with truthful empty sets for state not produced; only a `REQUESTED` terminal may use the early-terminal record | trust |
| RO-INV-55 | The exception path reports the run's REAL state — the machine it actually walked and the transitions it actually took — releases the resources it actually held, and chooses the governed record from what the run established: early-terminal before authority, full bundle afterwards. It fabricates no machine or identity | trust |

## State-Space Model

| Dimension | Values |
|---|---|
| Lifecycle state | the 8 progress states × 5 terminal states |
| Transition attempted | declared / undeclared for the current state |
| Profile resolution | resolves / missing / invalid |
| Consent | recorded / absent |
| Core eligibility | proceed / refusal / (operational input) |
| Acquisition token | fresh / consumed, per epoch (production / verification) |
| Gate report | pass / fail / toolchain-unavailable / declared-skip / truncated / duplicate / environmental fault |
| Cancellation & timeout | none / cancel at each non-terminal state / budget elapsed |
| Seal ordering | all writes submitted / seal attempted early / sink fault |
| Workspace content | clean / contains modified orchestration bytes |

Interactions that require proof:

- **consent × missing profile** — refusal names the profile, never treats
  consent as authority (ADV-001+).
- **eligibility proceed × consent absent** — held, not spent; not refused.
- **acquire-once × mid-run source mutation** — production decisions
  unchanged; no second production read (token consumed); the
  verification epoch's read is a DIFFERENT declared read whose divergence
  from the production digest is exactly what verification detects.
- **cancellation × every cancellable state** — declared transition from
  `PROFILE_RESOLVED` onward with a full sealed bundle (empty sets
  legitimate); terminals in `REQUESTED` produce the early-terminal
  refusal record, never a fabricated bundle.
- **duplicate gate report × recorded disposition** — fail closed; first
  disposition preserved.
- **SKIP_ENV × aggregation and evidence** — never renormalized at any
  layer.
- **seal × outstanding writes** — early seal refused and recorded.
- **modified orchestration bytes × decision execution** — only trusted
  code ran; workspace bytes are data (ADV-018).
- **verification × producer inputs** — the verifier's acquisition set is
  fresh; supplying producer values is unexpressible.

## Cross-Requirement Interactions

| Interaction | Risk | Required proof |
|---|---|---|
| INV-004 × INV-003 | a rejected transition or abandoned run escaping outcome classification | PROP-002 terminal mapping; every rejection recorded; no non-terminal abandonment fixture |
| INV-005 × consent (D5) | consent mistaken for authority, or authority for consent | ADV-001+ fixture pair (consent-no-profile; eligibility-no-consent) |
| INV-007 × INV-011 | verifier fed producer values, laundering verification | RO-ADV-05: fresh-acquisition mechanism; producer-value injection unexpressible |
| INV-008 × INV-006 | workspace-claimed "orchestration" content treated as executable | ADV-018 fixture: modified bytes observed as data, never loaded |
| INV-009 × INV-016 | a widened argv or renormalized skip surviving into evidence | EX-005A + PROP-007 through to the evidence fixture |
| RO-INV-08 × INV-004 | interleaved transitions corrupting the machine | RO-PROP-03 concurrent-attempt property |
| RO-INV-10 × RO-ADV-03 | "seal last" read as globally last, so a concurrent run's write looks like a post-seal write | RO-PROP-04: per-run filtered sequences; seal-last holds within each run under interleaving |
| RO-INV-10 × INV-013 | one run's evidence absorbing another's operations through a shared sink | RO-EX-09 two-run shared-port fixture; bundles disjoint by `run_id` |
| RO-INV-13 × RO-INV-16 | a provider invocation against a substituted workspace, recorded as if it were legitimate | RO-EX-13: the assertion precedes invocation, so there is nothing to record |
| RO-INV-14 × RO-INV-15 | a run sealing successfully on a verification that never ran | RO-EX-14 divergence fixture; RO-EX-12 seal-before-success |

## Proof Obligations

### Inherited proofs — restated for L4

| ID | What L4 must prove | Authoritative input | Candidate failure | Independent observable evidence | Can L4 prove it? |
|---|---|---|---|---|---|
| EX-004 | a declared-transition walk of the machine reaches each state exactly as declared | the transition table | drift between table and behavior | deterministic walk fixtures over every declared transition | **Yes, fully** |
| EX-005A | executed argv equals the registry's; caller cannot widen; undeclared gate refused | captured registry + recorded execution plans | plan widened or substituted | port-recorder equality fixture; interface shape guard | **Yes, at the port boundary** — the container-level re-proof (EX-005B) is L9 |
| PROP-002 | every undeclared (state, transition) pair is rejected and recorded; terminal states map to outcome classes | generated pairs | a silent illegal transition | property sweep over the full state × transition space | **Yes, fully** |
| PROP-007 | `SKIP_ENV` never normalizes; every identity exactly one disposition | generated gate plans and report sequences | renormalization or duplicate acceptance | property over generated report orders incl. duplicates | **Yes, fully** |
| ADV-001 | run request without profile refuses before spend — with consent present | request + consent fixtures | consent treated as authority | refusal names profile; no port spend call recorded | **Yes, fully** |
| ADV-006 | caller-widened argv refused/unexpressible | scheduling surface | widening path exists | interface guard + recorded-plan equality | **Yes, fully** |
| ADV-007 | undeclared gate id refused at eligibility before spend | captured registry | late or missing refusal | fixture asserting refusal precedes any execution-port call | **Yes, fully** (decision is L3's; sequencing proven here) |
| ADV-012 | INDETERMINATE never success | terminal classification | success-reporting surface accepts it | fixture over every reporting surface | **Yes, fully** |
| ADV-015 | unavailable toolchain → `SKIP_ENV`, never `SKIP_OK`/`PASS` | port unavailable-report | normalization | recording fixture + evidence assertion | **Yes, fully** |
| ADV-016 | truncated output → `FAIL` with reason | port truncation report | passing truncation | recording fixture + evidence assertion | **Yes, fully** |
| ADV-017 | duplicate disposition fails closed, named | report sequences | silent replace/ignore | duplicate-report fixture | **Yes, fully** |
| ADV-018 | modified orchestration bytes in the workspace never execute as decision logic | workspace fixture with "malicious" module bytes | dynamic load from workspace | RO-EX-03 scan + behavioral fixture: bytes observed as data, decisions unchanged | **Yes, fully** |
| MUT-004 | weakening exact-argv enforcement is killed | — | plan built from caller input | EX-005A/ADV-006 must fail under the mutant | **Yes** |
| MUT-005 | weakening indeterminate-is-failure is killed | — | INDETERMINATE mapped to success | ADV-012/PROP-002 must fail under the mutant | **Yes** |
| MUT-009 | weakening SKIP_ENV or duplicate guard is killed | — | renormalization path | PROP-007/ADV-015/ADV-017 must fail under the mutant | **Yes** |
| MUT-010 | allowing decision-bearing load from the workspace is killed | — | dynamic specifier reintroduced | RO-EX-03 + ADV-018 must fail under the mutant | **Yes** |

**Explicitly not claimed by L4**, named so no reader assumes coverage:
EX-005B and MUT-007 (container-level gate execution, L9); EX-008 and
ADV-013 (effective kill and teardown, L9); enforcement of mounts, network,
and resource ceilings (L9); adapter behavior (L7); executing the shell's
bootstrap, triggering, and placement — post-U4 operational acts on the
landed shell, not a landing (D2); credential custody (U2); evidence
persistence (U11).

### Proofs minted by this change

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| RO-EX-01 | RO-INV-01 | conformance | manifest allowlist exact; adding any dependency fails |
| RO-EX-02 | RO-INV-02 | architecture guard | source scan: no container client, socket path, or spawn outside port interfaces; in-repo execution/adapter implementations are the declared fakes |
| RO-EX-03 | RO-INV-03 | architecture guard | scan: no non-literal dynamic import/require, no eval family |
| RO-EX-04 | RO-INV-04 | deterministic example | second consumption within an epoch fails naming source and epoch; host-read recorder shows exactly one read per epoch |
| RO-EX-05 | RO-INV-05 | architecture guard | scheduling surface accepts identities only (signature scan + widening fixture) |
| RO-EX-06 | RO-INV-06 | deterministic example | run record's decision provenance names a core operation for every recorded decision |
| RO-EX-08 | RO-INV-09 | deterministic example | the requester recorded in an early-termination record is the run request's principal, byte-for-byte; a fixture whose production epoch captured a profile BEFORE a later acquisition fault still records the requester, never the profile's agent principal |
| RO-EX-07 | RO-INV-07 | deterministic example | importing the service incl. the Nest module tree has no side effect; no listener, timer, or child process appears |
| RO-ADV-01 | INV-005/D5 | adversarial | eligibility-proceed with consent absent: held at ELIGIBLE, recorded, not spent |
| RO-ADV-02 | INV-004 | adversarial | transition replay after terminal state: rejected, terminal unchanged |
| RO-ADV-03 | INV-011 | adversarial | seal attempted with an outstanding write: refused, recorded; sequence evidence shows seal last on the good path |
| RO-ADV-04 | INV-007 | adversarial | mid-run source mutation: production decisions unchanged; recorder shows one production read (with L3 ADV-003 at the snapshot side) |
| RO-ADV-05 | INV-007 (verification) | adversarial | verifier consumes only the verification epoch; recorder shows the two epochs separately; production-value injection not expressible |
| RO-ADV-06 | lifecycle × cancellation | adversarial | cancellation from each cancellable state (`PROFILE_RESOLVED` onward): declared transition + full sealed bundle with empty sets where nothing ran |
| RO-ADV-07 | D11 early terminals | adversarial | termination in `REQUESTED` (no profile / resolution failure / acquisition fault): early-terminal refusal record written; no bundle with fabricated identities exists |
| RO-ADV-08 | RO-INV-09 | adversarial | a `REQUESTED` terminal caused by a policy or registry acquisition fault that FOLLOWS a successful profile capture: the record's requester is still the request's principal, and the captured profile's agent principal appears nowhere |
| RO-PROP-01 | RO-INV-04 | property | for any generated acquisition order, each source read at most once per epoch and at most twice per run; within-epoch second attempts always structural errors |
| RO-PROP-02 | INV-016 | property | for any generated report sequence with duplicates/skips/truncations, recorded dispositions are one-per-identity with meanings preserved |
| RO-PROP-03 | RO-INV-08 | property | for any interleaving of concurrent transition attempts on one run, the machine serializes; losers are recorded rejections |
| RO-EX-09 | RO-INV-10 | deterministic example | two runs orchestrated through ONE shared set of port instances: every emission and evidence write carries its own `run_id`, the two sealed bundles are disjoint, and each equals the bundle that run produces alone |
| RO-PROP-04 | RO-INV-10 | property | for any generated interleaving of two concurrent runs over shared port instances, each run's `run_id`-filtered recorded sequence is identical to that run executed in isolation — including seal-last, which holds per run |
| RO-EX-10 | RO-INV-11 | adversarial | a source returning a DIFFERENT valid execution profile refuses naming both identities; no adapter or gate runs |
| RO-EX-11 | RO-INV-12 | adversarial | an affirmative consent record carrying another run's id holds the run at `ELIGIBLE` and spends nothing |
| RO-EX-12 | RO-INV-15 | adversarial | an evidence sink that rejects the write, and an assembly failure, both leave the run `OPERATIONAL_FAILURE` — never `COMPLETED` with nothing sealed |
| RO-EX-13 | RO-INV-13 | adversarial | a substituted workspace base refuses and the adapter port received no invocation; an unobservable base is operational, not a pass |
| RO-EX-14 | RO-INV-14 | adversarial | each source is read exactly once per epoch and the verifier receives the verification epoch's values; authority diverging between epochs prevents `COMPLETED` |
| RO-EX-15 | RO-INV-16 | deterministic example | a report carrying one permitted and one denied call yields two event pairs and bundle operation sets that place each call under its reported disposition |
| RO-EX-16 | RO-INV-15 | adversarial | the terminal event precedes the seal in the recorded sequence; a terminal-emission failure seals nothing |
| RO-EX-17 | RO-INV-17 | adversarial | an evidence sink rejecting the bundle write leaves NO transition recording `EVIDENCE_SEALED`; the successful run records it exactly once |
| RO-EX-18 | RO-INV-18 | adversarial | a refused path policy stops the run, and a refused gate registry stops it even with no gates requested — the case with nothing downstream to notice |
| RO-EX-19 | RO-INV-19 | adversarial | a change outside every allowed write root terminates `REFUSED`, not `OPERATIONAL_FAILURE` |
| RO-EX-20 | RO-INV-20 | adversarial | same-size content replacement changes the observed base; an in-root symlink to an outside file is not read |
| RO-EX-21 | RO-INV-21 | adversarial | a throwing authority source, evidence sink, and clock each resolve with a terminal state; the clock case is `INDETERMINATE` |
| RO-EX-22 | RO-INV-22 | adversarial | a cancel raised at the verification boundary terminates `CANCELLED`, never `COMPLETED` |
| RO-EX-23 | RO-INV-23 | deterministic example | the bundle's principal is the profile's agent identity acting for the requester; `actor_required` refuses an autonomous agent requester |
| RO-EX-24 | RO-INV-16 | adversarial | a call-emission failure mid-sequence still carries the already-known operations into the bundle |
| RO-EX-25 | RO-INV-24 | deterministic example | the completed run and the refused run each write exactly one transition record, and the walk is returned to the caller |
| RO-EX-26 | RO-INV-25 | adversarial | a same-version claim minted for another run is rejected `foreign_claim` and the state is unchanged |
| RO-EX-27 | RO-INV-26 | adversarial | a body supplying `run_id`, `sequence`, `adapter`, and `contract_id` overrides none of them |
| RO-EX-28 | RO-INV-27 | adversarial | with `begin_execution` removed from the table the adapter never runs; with `commit_spend` removed no `run.started` is emitted; with `seal_evidence` removed no bundle reaches the sink |
| RO-EX-29 | RO-INV-27 | property | narrowing ANY of the seven phase boundaries prevents `COMPLETED`, never abandons the run in a non-terminal state, and records the rejection naming state and transition |
| RO-EX-30 | RO-INV-17 | adversarial | a sink rejecting the bundle write leaves the machine short of `EVIDENCE_SEALED`; the successful walk enters it exactly once |
| RO-EX-31 | RO-INV-27 | deterministic example | the unmodified table still completes with no rejections — the guard binds the walk without blocking it |
| RO-EX-32 | RO-INV-28 | adversarial | a run faulting at a gate has journaled every transition up to the fault; the journal grows one entry at a time (1…7), never in a batch; acquisitions are journaled per epoch and source, failures included |
| RO-EX-33 | RO-INV-29 | deterministic example | an unconsented run leaves a journal at `ELIGIBLE` carrying the hold, its transition, and its detail; the rejection is journaled too |
| RO-EX-34 | RO-INV-30 | adversarial | two concurrent runs of ONE `run_id`: exactly one produces a bundle; the other reads no authority, invokes no adapter, writes nothing; the lease is released on conclusion and on hold |
| RO-EX-35 | RO-INV-30 | adversarial | a run whose lease is stolen mid-walk does not complete, and names the lost lease |
| RO-EX-36 | RO-INV-30 | adversarial | a stale generation can neither renew nor release the current holder — the fencing token is real |
| RO-EX-37 | RO-INV-10 | deterministic example | two runs through one journal instance stay separate; an unknown run has no journal rather than an empty one |
| RO-EX-38 | RO-INV-31 | adversarial | an evidence sink rejecting the bundle publishes no terminal event and no bundle, and journals no `EVIDENCE_SEALED` |
| RO-EX-39 | RO-INV-32 | property | across seal failure, assembly failure, and success, every emitted `run.terminated` outcome equals the state the run ended in |
| RO-EX-40 | RO-INV-31 | deterministic example | on a committed run the bundle, the terminal event, the journal head, and the machine all report the same terminal |
| RO-EX-41 | RO-INV-33 | adversarial | a table missing `seal_evidence` OR missing `complete` commits nothing — neither half of the sequence may commit alone |
| RO-EX-42 | RO-INV-31 | adversarial | seal ordering and seal eligibility are decided BEFORE the commit; an ineligible bundle never reaches the sink |
| RO-EX-43 | RO-INV-31 | adversarial | an event-sink failure and a journal failure inside the commit each leave neither event nor bundle observable |
| RO-EX-44 | RO-INV-34 | deterministic example | the invocation carries the captured profile identity with digest, the immutable run input, the grant, routing, limits, credential references and workspace refs — and the type has no image, argv, or command property |
| RO-EX-45 | RO-INV-35 | type-level + adversarial | the credential reference type is exactly `{ env_var }`; nothing value-shaped appears anywhere in a serialized invocation |
| RO-EX-46 | RO-INV-36 | adversarial | no terminal-vocabulary state is expressible in an observation; exit 0 alongside `SIGKILL` yields `INDETERMINATE`; agreeing observations complete normally |
| RO-EX-47 | RO-INV-37 | adversarial | a model claiming a file change leaves the authoritative change set empty — the observed set is the host's |
| RO-EX-48 | RO-INV-37 | type-level | usage is `{unit, amount}` pairs, and no cost, currency, or price term is representable |
| RO-EX-49 | RO-INV-34 | deterministic example | the run input's task and parameters reach the adapter verbatim |
| RO-EX-50 | RO-INV-16 | deterministic example | the richer observation still carries reported calls into events and evidence under their dispositions |
| RO-EX-51 | RO-INV-38 | adversarial | the session is prepared and started before the state is entered; a session that cannot be prepared, and one that cannot be started, each reach neither `SANDBOX_STARTED` nor the adapter |
| RO-EX-52 | RO-INV-39 | deterministic example | a completed run and a run refused after opening one both close last; a run that never opened one calls nothing |
| RO-EX-53 | RO-INV-40 | adversarial | a provider invocation that never returns yields `TIMED_OUT`, with the session interrupted and then closed |
| RO-EX-54 | RO-INV-40 | adversarial | a gate that never returns does the same |
| RO-EX-55 | RO-INV-40 | adversarial | a cancellation raised DURING a hung call cancels the run, and the in-flight call observes the abort |
| RO-EX-56 | RO-INV-40 | deterministic example | the adapter and the gates each receive the session reference and the abort signal |
| RO-EX-57 | RO-INV-41 | deterministic example | the prepared session carries the profile's wall clock and the run identity |
| RO-EX-58 | RO-INV-42 | adversarial | created, modified and deleted are distinguished against the captured baseline; an unchanged workspace reports NO changes; observing with no baseline refuses; baselines are keyed by run |
| RO-EX-59 | RO-INV-43 | adversarial | a same-length BINARY replacement changes the base identity — the case a UTF-8 read collapses |
| RO-EX-60 | RO-INV-44 | adversarial | an in-root symlink is reported with its `link_target`; a link escaping the root is never reported as an ordinary in-root file |
| RO-EX-61 | RO-INV-44 / RO-INV-45 | adversarial | a directory, a symlink, an oversize file and an over-count request are each refused rather than read |
| RO-EX-62 | RO-INV-45 | adversarial | a binary artifact is refused by name; a text artifact is read faithfully |
| RO-EX-63 | RO-INV-42 | adversarial | an unwalkable root reports failure, never no-changes |
| RO-EX-64 | RO-INV-46 | adversarial | the last write of any kind to the evidence sink is the sealed bundle — asserted UNFILTERED, because the helper that filtered "the run's writes" is what hid the violation |
| RO-EX-65 | RO-INV-47 | adversarial | a journal failing part way through the tail leaves no tail; a participant that refuses while staging leaves no bundle, because nothing it prepared was ever observable |
| RO-EX-66 | RO-INV-48 | adversarial | a run whose lease is stolen mid-walk stops at the next boundary, makes no further evidence write and journals no terminal — the boundary half of the guarantee, distinct from the per-resource refusal RO-EX-82 proves |
| RO-EX-67 | RO-INV-49 | adversarial | an append that fails once is retried and reaches the journal, rather than vanishing from the record |
| RO-EX-68 | RO-INV-50 | adversarial | a table forbidding `operational_fault`, and one forbidding `refuse` from `REQUESTED`, each write nothing |
| RO-EX-69 | RO-INV-51 | adversarial | a `start()` that throws and an `interrupt()` that throws both still close the session |
| RO-EX-70 | RO-INV-51 | adversarial | a `claim()` that throws resolves with a conclusion and writes nothing; a `release()` that throws does not replace a completed run |
| RO-EX-71 | RO-INV-47 | adversarial | a second attempt that fails at the commit leaves the first attempt's bundle and journal tail intact — structurally, since the failed attempt published no marker and therefore wrote nothing to take back |
| RO-EX-72 | RO-INV-53 | deterministic example | permitted changes are applied back only after the core decided they may be; a policy-refused change set applies nothing |
| RO-EX-73 | RO-INV-53 | adversarial | changes outside the policy never leave the workspace, and the refusal names the offending path |
| RO-EX-74 | RO-INV-54 | adversarial | the apply-back precedes the seal; an apply-back that fails terminates `OPERATIONAL_FAILURE` and the sealed bundle says so rather than `COMPLETED` |
| RO-EX-75 | RO-INV-52 | adversarial | provisioning failure stops the run before anything executes; the workspace is discarded on refusal too; a run that never provisioned discards nothing |
| RO-EX-76 | RO-INV-53 | deterministic example | an empty change set is not an apply-back |
| RO-EX-77 | RO-INV-53 | deterministic example | what is applied back is exactly the observed set — not the model's claims |
| RO-EX-78 | RO-INV-47 | adversarial | a participant observing from inside the commit sees no journal tail and no terminal event while the bundle is still being prepared |
| RO-EX-79 | RO-INV-47 | adversarial | a staged tail, event, and bundle are absent from every reader until the marker publishes; an abandoned preparation changes no observable state |
| RO-EX-80 | RO-INV-47 | structural | a participant has no publication step at all; the commit body contains exactly ONE visibility mutation, with no `await` after it and the ownership check before it |
| RO-EX-81 | RO-INV-47 | structural | no participant exposes `mark` or `retractTo`, and the finalization adapter names no rollback path |
| RO-EX-82 | RO-INV-47 | adversarial | an observer running inside the commit sees all three or none; the terminal tail is present in the journal store yet unreadable until the marker |
| RO-EX-83 | RO-INV-47 | adversarial | a staged write exposes only `commitId` and `abandon`, so publication cannot fail halfway; a staging failure publishes no marker at all |
| RO-EX-84 | RO-INV-48 | adversarial | a lease that moves AFTER the last staging fence check publishes nothing — the commit marker re-establishes ownership |
| RO-EX-85 | RO-INV-55 | adversarial | a port that throws at `RUNNING` still reports `PROFILE_RESOLVED`, `ELIGIBLE`, `SANDBOX_STARTED` and `RUNNING`, ending `INDETERMINATE`; the journal carries the same walk, including the entries pending at the throw |
| RO-EX-86 | RO-INV-55 | adversarial | a run that captured a profile is NOT given the early-terminal shape; a run that captured none still is |
| RO-EX-87 | RO-INV-55 | adversarial | a workspace provisioned before execution is discarded even when a port throws, and the deadline timer is disarmed |
| RO-EX-88 | RO-INV-50 | adversarial | a table without `operational_fault` from `VERIFYING` still ends the run in a TERMINAL state, records the refusal, and writes nothing |
| RO-EX-89 | RO-INV-50 | adversarial | a table granting no terminal at all from `RUNNING` makes the exception handler report the run as unterminated, naming the refusal, rather than reporting a progress state as the outcome |
| RO-EX-90 | RO-INV-56 | structural | no orchestration module names `exit_code`, `signalled` or `reported_outcome` — scanned by FIELD, so renaming a local helper cannot evade it; `ports/values.ts` (declares the SPI) and `adapters/**` (produce observations) are excepted because neither classifies |
| RO-EX-91 | RO-INV-56 | deterministic example (runner-core) | exit 0 with a signal, and a success claim with a non-zero exit, are conflicts; agreeing observations, an absent exit code, and a bare `reported_outcome` are established; the classification names no terminal state |
| RO-EX-92 | RO-INV-57 | structural + deterministic example | no production module declares a `transition_record` sink shape (scanned with comments stripped, so the doc explaining its absence is not the failure); the journal holds the full seven-transition walk while the evidence sink holds only `evidence_bundle` |
| RO-EX-93 | RO-INV-58 | structural | every orchestration module is within its ceiling, every phase handler under 120 code lines, the facade under 200, and no module outside `lifecycle/walk.ts`, `lifecycle/machine.ts` and `run/scope.ts` advances the machine |
| RO-EX-94 | RO-INV-58 | structural | `requested` cannot name an observation or an artifact surface — checked by IMPORT, so a phase that does not import the type cannot construct, read or pass one — and no definite-assignment assertion survives anywhere in the tree |
| RO-EX-95 | RO-INV-55 | adversarial | a throw from OUTSIDE acquisition's catch — a lease renew, a journal append — still writes exactly one early-terminal record; terminalizing twice writes nothing, which is what the decomposition regressed |
| RO-EX-96 | RO-INV-59 | structural + adversarial | `RunSignals` declares only the interrupt; a redirected or added transition is refused and never reaches the provider; the wall clock is `min(profile, session, override)` and the spend phase arms from the bound |
| RO-EX-97 | RO-INV-60 | adversarial | a run cancelled at REQUESTED reads no authority; cancelled after eligibility it provisions nothing and opens no session; cancelled with a session open it is INTERRUPTED, not merely closed |
| RO-EX-98 | RO-INV-60 | adversarial | a run cancelled at the RUNNING and both VERIFYING boundaries interrupts its open session, not merely closes it — the three boundaries the single earlier fixture did not reach |
| RO-EX-99 | RO-INV-61 | adversarial | a journal refusing the fence in REQUESTED halts the walk: no session opened, no provider invoked, no gate run |
| RO-EX-100 | RO-INV-61 | adversarial | a dispossessed run writes no early-terminal record, so its conclusion's "no further write was made" is true of the sinks |
| RO-EX-101 | RO-INV-59 | adversarial | a widening transition table is refused whether carried as an own property or on a PROTOTYPE — the validator reads what `declaredNext` reads |
| RO-EX-102 | RO-INV-55 | adversarial | the lost-lease exit disarms the run's timers; a stolen run leaves nothing armed, measured against a control run that leaves nothing either |
| RO-EX-103 | RO-INV-50 | structural | EVERY machine-mutating entry point is owned — `advance`, `commitProjected` and `hold` — and the escape scans cover bracket access and private-field assertions, the forms this tree actually uses |
| RO-EX-104 | RO-INV-60 | adversarial | a POLLED timeout keeps its own terminal at every boundary, including SANDBOX_STARTED, where the returned signal was discarded and `abortRun` defaulted to cancel |
| RO-EX-105 | RO-INV-61 | adversarial | authority reads stop AT the fence refusal, not at the next phase — the epoch is told to stop rather than reading its two remaining sources |
| RO-EX-106 | RO-INV-59 | adversarial | a validated table is a frozen null-prototype COPY, so it cannot widen after validation; a non-enumerable widening is refused, because the validator reads every key `declaredNext` can |
| RO-EX-107 | RO-INV-50 | adversarial | `commitProjected` accepts only a capability `project()` minted on THAT machine; an unprojected entry list cannot advance it, so the ownership rule is enforced by the class rather than by a scan of this repository |
| RO-EX-108 | RO-INV-62 | deterministic example | a dispossessed attempt concludes `ownership_lost` producing nothing; an ordinary run concludes `terminal`, a consent-held run `held` |
| RO-EX-109 | RO-INV-36 | adversarial (reviewer-authored) | a transcript terminating in error against a clean exit and a success claim is a disagreement: the run is INDETERMINATE, not COMPLETED |
| RO-EX-110 | RO-INV-63 | adversarial (reviewer-authored) | a transient append failure at VERIFYING does not vanish from the durable walk; the journal equals the machine's transitions |
| RO-EX-111 | RO-INV-50 | structural (reviewer-authored) | the ownership scan covers `apply` — the mutator the other three delegate to — matched by receiver so `lease.claim(` is not mistaken for a machine advance |
| RO-EX-112 | RO-INV-22 | adversarial (reviewer-authored) | cancellation during apply-back terminates CANCELLED; the last check precedes the terminal, not merely the verification |
| RO-EX-113 | RO-INV-64 | adversarial (reviewer-authored) | a session port that never settles times out on the profile's budget rather than leaving the run unresolved at ELIGIBLE |
| RO-EX-114 | RO-INV-30 | structural (reviewer-authored) | the exported lease surface is exactly the port; the seize affordance a proof needs is not a method on it |
| RO-EX-115 | RO-INV-65 | adversarial | a minted capability's entries cannot be edited before commit, and a second projection from the same version is refused once the first has moved the machine |
| RO-EX-116 | RO-INV-66 | adversarial | mutating the exported canonical table does not widen a default run |
| RO-EX-117 | RO-INV-62 | structural + adversarial | every conclusion variant constrains the state it may carry; a dispossessed attempt does not terminalize its machine, and a machine granted no terminal reports `unterminated` rather than `terminal` |
| RO-EX-118 | RO-INV-67 | adversarial | a port with no bespoke call-site wrapper that never settles still cannot hold the run open — the complete injected port surface is guarded centrally |
| RO-EX-119 | RO-INV-67 | adversarial | acquisition is bounded before any profile is captured, and the captured profile establishes one absolute wall clock rather than a second timer or a restarted budget |
| RO-EX-120 | RO-INV-68 | adversarial | an `interrupt` raised while a call is in flight reaches it, and an enumeration cancelled after its last source stops rather than proceeding |
| RO-EX-121 | RO-INV-69 | structural + adversarial | RO-EX-94 is arity, not substring: it is exercised against a phase reaching unearned state through another phase's signature, which no substring of the type's name appears in |
| RO-EX-122 | RO-INV-61 | adversarial | a run dispossessed inside VERIFYING applies nothing back to the workspace, and the same run applies back when it is not dispossessed |
| RO-MUT-01 | RO-INV-04 | mutation | removing per-epoch token consumption is killed by RO-EX-04/RO-PROP-01 |
| RO-MUT-05 | D11 | mutation | fabricating authority identities for an early terminal is killed by RO-ADV-07 |
| RO-MUT-06 | RO-INV-09 | mutation | sourcing the requester from a captured profile instead of the run request is killed by RO-EX-08 / RO-ADV-08 |
| RO-MUT-07 | RO-INV-10 | mutation | replacing a `run_id`-keyed structure with a single unkeyed field, or dropping the `run_id` from a port call, is killed by RO-EX-09 / RO-PROP-04 |
| RO-MUT-08 | RO-INV-11 | mutation | accepting a captured profile without comparing its identity to the requested reference is killed by RO-EX-10 |
| RO-MUT-09 | RO-INV-12 | mutation | ignoring the consent record's `run_id` is killed by RO-EX-11 |
| RO-MUT-10 | RO-INV-13 | mutation | moving the base-identity assertion after the adapter invocation, or removing it, is killed by RO-EX-13 |
| RO-MUT-11 | RO-INV-14 | mutation | discarding the verification epoch's values instead of verifying with them is killed by RO-EX-14 |
| RO-MUT-12 | RO-INV-15 | mutation | taking the terminal transition before the seal, or emitting the terminal event after it, is killed by RO-EX-12 / RO-EX-16 |
| RO-MUT-13 | RO-INV-16 | mutation | discarding the adapter's reported calls is killed by RO-EX-15 |
| RO-MUT-14 | RO-INV-17 | mutation | recording `EVIDENCE_SEALED` before the write is killed by RO-EX-17 |
| RO-MUT-15 | RO-INV-18 | mutation | passing a refused capture onward as a snapshot is killed by RO-EX-18 |
| RO-MUT-16 | RO-INV-19 | mutation | collapsing the refusal and operational variants at the evidence boundary is killed by RO-EX-19 |
| RO-MUT-17 | RO-INV-20 | mutation | digesting sizes instead of content, or deciding containment lexically, is killed by RO-EX-20 |
| RO-MUT-18 | RO-INV-21 | mutation | removing the port-exception containment is killed by RO-EX-21 |
| RO-MUT-19 | RO-INV-22 | mutation | dropping the verification-boundary cancellation check is killed by RO-EX-22 |
| RO-MUT-20 | RO-INV-23 | mutation | recording the requester as the evidence principal is killed by RO-EX-23 |
| RO-MUT-21 | RO-INV-24 | mutation | keeping the transition record in memory only is killed by RO-EX-25 |
| RO-MUT-22 | RO-INV-25 | mutation | validating only the claim's version is killed by RO-EX-26 |
| RO-MUT-23 | RO-INV-26 | mutation | spreading the caller body after the envelope is killed by RO-EX-27 |
| RO-MUT-24 | RO-INV-27 | mutation | ignoring a rejected transition and proceeding to the next phase's effects is killed by RO-EX-28/29/31 (verified: the mutant kills four proofs) |
| RO-MUT-25 | RO-INV-28 | mutation | batching the journal to a single write at conclusion is killed by RO-EX-32 (verified: the mutant kills two proofs) |
| RO-MUT-26 | RO-INV-30 | mutation | claiming the lease and not enforcing it is killed by RO-EX-34 (verified: the mutant kills two proofs) |
| RO-MUT-27 | RO-INV-31 | mutation | publishing a staged record before the commit marker is killed by RO-EX-78/79/82 (verified: making staged rows visible immediately kills seven proofs) |
| RO-MUT-28 | RO-INV-32 | mutation | emitting the terminal event before the commit is killed by RO-EX-38/39 (verified: the mutant kills two proofs) |
| RO-MUT-29 | RO-INV-36 | mutation | trusting the provider's self-reported outcome over the disagreement is killed by RO-EX-46 (verified) |
| RO-MUT-30 | RO-INV-35 | mutation | admitting a credential value field on the invocation is killed by RO-EX-45 under `tsc` (verified: survives `vitest run` alone, which is why the aggregate gate runs types AND tests) |
| RO-MUT-31 | RO-INV-38 | mutation | earning `commit_spend` on consent alone, without opening a session, is killed by RO-EX-51 (verified: the mutant kills ten proofs) |
| RO-MUT-32 | RO-INV-40 | mutation | handing the abort signal over without racing it — advisory cancellation — is killed by RO-EX-53/54/55 (verified: the suite hangs and three proofs fail) |
| RO-MUT-33 | RO-INV-42 | mutation | labelling every observed file `modified` instead of diffing the baseline is killed by RO-EX-58 (verified) |
| RO-MUT-34 | RO-INV-43 | mutation | digesting text instead of raw bytes is killed by RO-EX-59 (verified) |
| RO-MUT-35 | RO-INV-44 | mutation | using `stat` instead of `lstat`, so a link reads as a regular file, is killed by RO-EX-60/61 (verified) |
| RO-MUT-36 | RO-INV-47 | mutation | omitting one participant from the commit — staging it under a different id, so the marker publishes only part of the run — is killed by RO-EX-78/82 and by the commit-id agreement check |
| RO-MUT-37 | RO-INV-48 | mutation | terminating a lost-lease run by writing its record is killed by RO-EX-66 (verified) |
| RO-MUT-42 | RO-INV-48 | mutation | dropping the final ownership check at the commit marker, so a lease that moved after the last staging check still publishes, is killed by RO-EX-84 (verified) |
| RO-MUT-43 | RO-INV-55 | mutation | recovering through a FRESH machine, so a run that reached `RUNNING` reports one invented transition from `REQUESTED`, is killed by RO-EX-85 (verified) |
| RO-MUT-44 | RO-INV-55 | mutation | skipping resource release on the exception path, leaking the workspace and the armed deadline, is killed by RO-EX-87 (verified) |
| RO-MUT-45 | RO-INV-55 | mutation | writing the early-terminal record unconditionally, so a run that held authority is described as one that never had any, is killed by RO-EX-86 (verified) |
| RO-MUT-47 | RO-INV-56 | mutation | re-implementing terminal classification locally in orchestration, under any function name, is killed by RO-EX-90 (verified: the mutant fails the field scan) |
| RO-MUT-48 | RO-INV-57 | mutation | restoring the `transition_record` shape to the evidence sink, giving the walk a second declared authority, is killed by RO-EX-92 (verified) |
| RO-MUT-49 | RO-INV-58 | mutation | reintroducing a definite-assignment assertion, or letting a phase reach state it has not earned, is killed by RO-EX-94 |
| RO-MUT-50 | RO-INV-59 | mutation | accepting a caller-supplied transition table unvalidated, or arming the deadline from the session-reported value, is killed by RO-EX-96 |
| RO-MUT-51 | RO-INV-60 | mutation | removing a boundary cancellation check, or terminating a cancelled run with an open session via `finish` rather than `abortRun`, is killed by RO-EX-97 |
| RO-MUT-52 | RO-INV-61 | mutation | halting on a lost lease but not on a fence refusal, so a dispossessed run spends anyway, is killed by RO-EX-99/100 |
| RO-MUT-53 | RO-INV-50 | mutation | mutating the machine through an entry point the owner does not expose, or narrowing an escape scan to one syntactic form, is killed by RO-EX-103 |
| RO-MUT-54 | RO-INV-59 | mutation | returning the caller's table from validation, or validating through a narrower key view than `declaredNext` reads, is killed by RO-EX-106 |
| RO-MUT-55 | RO-INV-50 | mutation | accepting an unprojected entry list in `commitProjected` is killed by RO-EX-107 |
| RO-MUT-56 | RO-INV-65 | mutation | binding a capability by identity alone — unfrozen entries, or no version check — is killed by RO-EX-115 |
| RO-EX-123 | RO-INV-70 | adversarial | a deadline that fires while the preceding event is being emitted leaves the adapter uninvoked, observed after the abandoned continuation has had time to run |
| RO-EX-124 | RO-INV-71 | structural + adversarial | the committed entries and the adopted entries are one frozen identity, and a finalization port that edits its transitions cannot reach the run record |
| RO-EX-125 | RO-INV-72 | adversarial | a caller returning `'timeout'` through a cast obtains CANCELLED, and the wall clock still produces TIMED_OUT |
| RO-EX-126 | RO-INV-61 | adversarial | a run that already knows it lost the fence applies nothing back, even against a lease that renews it |
| RO-EX-127 | RO-INV-73 | adversarial | a wall-clock timeout at a sealing state produces the same declared shape as a cancellation, evidence bundle included |
| RO-EX-128 | RO-INV-58 | structural | the invalid composition DOES NOT COMPILE — a phase demanding unearned state fails the build, asserted by `@ts-expect-error`, which fails if the line beneath it starts compiling |
| RO-EX-129 | RO-INV-75 | adversarial (reviewer-authored) | a timed-out production authority read answering after conclusion causes no remaining source read, and the returned conclusion's transition/rejection counts stay unchanged |
| RO-EX-130 | RO-INV-73 | adversarial (reviewer-authored) | timeout in REQUESTED writes the early-terminal record; timeout after PROFILE_RESOLVED seals the full evidence bundle, independent of whether the delayed port answers inside a grace interval |
| RO-EX-131 | RO-INV-68 | adversarial (reviewer-authored) | public cancellation raised during an otherwise unwrapped observer call concludes promptly rather than waiting for the wall clock |
| RO-EX-132 | RO-INV-70 | adversarial (reviewer-authored) | a deadline firing while `run.started` is outstanding prevents `capability.granted` from starting |
| RO-EX-133 | RO-INV-74 | adversarial (reviewer-authored) | a non-returning lease claim and a non-returning workspace discard each leave `run()` bounded |
| RO-EX-134 | RO-INV-74 | adversarial (reviewer-authored) | slow prepare/start consume the profile's original one-second budget; a large proof override cannot lengthen the standing acquisition ceiling |
| RO-EX-135 | RO-INV-76 | adversarial (reviewer-authored) | settlement expiry while the profile clock is healthy does not become `TIMED_OUT`; cancellation and the governed profile expiry still interrupt a pending `COMPLETED` finalization from `VERIFYING` |
| RO-EX-136 | RO-INV-77 | adversarial (reviewer-authored) | public snapshots, direct transition/rejection results, and journal requests cannot edit the machine's history by reference |
| RO-EX-137 | RO-INV-72 | adversarial (reviewer-authored) | a throwing public cancellation probe during an outstanding port resolves through the governed cancellation path and raises no uncaught timer exception |
| RO-EX-138 | RO-INV-78 | adversarial (reviewer-authored) | a lease claim that succeeds after the caller received `not_started` is released, leaving the run immediately claimable |
| RO-EX-139 | RO-INV-79 | adversarial (reviewer-authored) | an escaping port fault after authority capture seals an `INDETERMINATE` full bundle; a non-returning recovery journal stage remains bounded |
| RO-EX-140 | RO-INV-76 | structural | settlement is a fresh typed capability, not a mutable mode flag, and phase code contains no second local wrapper around the centrally guarded port set |
| RO-EX-141 | RO-INV-77 | structural | `acquisition/**` and `events/**` import the neutral interruption seam and no `orchestration/**` module |
| RO-MUT-57 | RO-INV-66 | mutation | leaving the canonical table mutable while freezing only supplied ones is killed by RO-EX-116 |
| RO-MUT-58 | RO-INV-67 | mutation | guarding only the call sites already known to hang, rather than the complete injected port surface, is killed by RO-EX-118 |
| RO-MUT-59 | RO-INV-67 | mutation | adding or restarting the profile wall clock instead of establishing one absolute expiry is killed by RO-EX-119 |
| RO-MUT-60 | RO-INV-68 | mutation | polling the caller's interrupt only between phases is killed by RO-EX-120 |
| RO-MUT-61 | RO-INV-69 | mutation | proving a structural guard by scanning its own source text is killed by RO-EX-121 |
| RO-MUT-62 | RO-INV-61 | mutation | applying workspace changes back before the fence is consulted, so a dispossessed run still writes, is killed by RO-EX-122 |
| RO-MUT-63 | RO-INV-70 | mutation | taking an already-created promise instead of a thunk, so the effect starts before the abort is checked, is killed by RO-EX-123 |
| RO-MUT-64 | RO-INV-71 | mutation | returning a mutable twin of the frozen projection is killed by RO-EX-124 |
| RO-MUT-65 | RO-INV-72 | mutation | trusting a caller's interrupt reason instead of coercing it to cancellation is killed by RO-EX-125 |
| RO-MUT-66 | RO-INV-73 | mutation | abandoning an aborted walk immediately, so its record depends on which interrupt arrived, is killed by RO-EX-127 |
| RO-MUT-67 | RO-INV-58 | mutation | proving the typestate with a runtime count alone, which a tree that stopped holding it can still satisfy, is killed by RO-EX-128 |
| RO-MUT-68 | RO-INV-75 | mutation | racing and abandoning the whole walk instead of rejecting the awaited call is killed by RO-EX-129 |
| RO-MUT-69 | RO-INV-73 | mutation | omitting bounded terminal settlement, so interrupted runs produce `none` based on port latency, is killed by RO-EX-130 |
| RO-MUT-70 | RO-INV-68 | mutation | guarding only named provider/gate calls rather than the whole port surface is killed by RO-EX-131 |
| RO-MUT-71 | RO-INV-70 | mutation | allowing the next effect in a phase to start after abort is killed by RO-EX-132 |
| RO-MUT-72 | RO-INV-74 | mutation | leaving ownership or cleanup outside every finite boundary is killed by RO-EX-133 |
| RO-MUT-73 | RO-INV-74 | mutation | restarting the profile clock or letting the proof override widen acquisition is killed by RO-EX-134 |
| RO-MUT-74 | RO-INV-76 | mutation | using settlement expiry as timeout provenance, or disabling cancellation/timeout while finalization remains non-terminal, is killed by RO-EX-135 |
| RO-MUT-75 | RO-INV-77 | mutation | retaining mutable transition/rejection entry references at mint or across the journal boundary is killed by RO-EX-136 |
| RO-MUT-76 | RO-INV-72 | mutation | letting a throwing public cancellation probe escape the polling timer is killed by RO-EX-137 |
| RO-MUT-77 | RO-INV-78 | mutation | abandoning a pending lease claim without releasing a late successful answer is killed by RO-EX-138 |
| RO-MUT-78 | RO-INV-79 | mutation | recovering after authority capture without the mandatory full bundle, or bypassing the finite port boundary in recovery, is killed by RO-EX-139 |
| RO-MUT-79 | RO-INV-76 | mutation | replacing the typed settlement capability with a mutable deadline mode flag, or reintroducing local duplicate deadline wrappers, is killed by RO-EX-140 |
| RO-MUT-80 | RO-INV-77 | mutation | making acquisition or event mechanisms depend on an orchestration-owned interruption type is killed by RO-EX-141 |
| RO-MUT-46 | RO-INV-50 | mutation | applying a failure terminal without checking the machine's answer — the `failClosed` and exception-handler shape — so a refused terminal concludes the run in a progress state, is killed by RO-EX-88/89 (verified) |
| RO-MUT-38 | RO-INV-49 | mutation | advancing the journal cursor before the append lands is killed by RO-EX-67 (verified) |
| RO-MUT-39 | RO-INV-47 | mutation | a reader that ignores commit visibility, or a second publication site turning the commit back into a sequence, is killed by RO-EX-79/80/82 (verified: unconditional visibility kills seven proofs) |
| RO-MUT-40 | RO-INV-53 | mutation | applying back without asking the core is killed by RO-EX-72/73 |
| RO-MUT-41 | RO-INV-54 | mutation | sealing `COMPLETED` after a failed apply-back is killed by RO-EX-74 |
| RO-MUT-02 | INV-011 ordering | mutation | reordering the seal is killed by RO-ADV-03 |
| RO-MUT-03 | D5 | mutation | consent-only spend (dropping the eligibility requirement) is killed by the spend-table fixtures |
| RO-MUT-04 | RO-INV-06 | mutation | replacing a core call with a local reimplementation is killed by RO-EX-06 provenance |

## Authority Chain

| Object | Authoritative source | Capture boundary | Digest / identity | Mutable after capture? | Sandbox write reach | Transformation | Final consumer / verifier |
|---|---|---|---|---|---|---|---|
| Run request | caller input | lifecycle creation | run id minted | no — a value | none | none | lifecycle; evidence identities |
| Consent record | human/automation input | spend transition | recorded verbatim | no | none | none | spend gate; evidence principal data — never a capability |
| Profile / policy / registry bytes | repository/profile store | one token consumption per source PER EPOCH (production before `PROFILE_RESOLVED`; verification at verify time) | L3 capture digest per epoch | source yes; tokens consumed; snapshots no | **none** — protected | L3 `captureAuthority` | production: core decisions + evidence identities; verification: the independent verifier |
| Workspace base identity | host observation at creation | creation-time observation | digest compared via core | n/a | n/a (pre-run) | L3 `compareBaseIdentity` | refusal before model invocation (ADV-004 both halves now) |
| Gate plan | captured registry entry | plan construction | identity-keyed | no | none | none — argv copied exactly | execution port; recorded plan equality (EX-005A) |
| Gate reports | execution port | disposition recording | keyed, one per identity | no | none | port report → closed vocabulary (D6) | evidence `gate_results` |
| Run events | representable lifecycle moments | emission (D9) | sequence-numbered | no | none | captured data only | event sink; evidence |
| Transition record | every declared transition | recording (D9) | per-run sequence | no | none | states + cause + timing | orchestration audit; distinct from the L2 event stream |
| Early-terminal refusal record | terminals in `REQUESTED` | D11 | governed L2 amendment shape | no | none | request data + outcome + timing | durable refusal evidence where the full bundle cannot exist |
| Evidence bundle | L3 `constructEvidence` | finalization | L3 contract validation | until sealed | **none** | none here | seal-last write after L3 eligibility; independent verification over a FRESH acquisition |
| Orchestration code | the platform's built artifacts | build time | module graph fixed | **no** — never from workspace | workspace copies are data only | none | ADV-018/MUT-010 |

## Before × After Transition Analysis

| # | Before | After | Required behavior | Proof |
|---|---|---|---|---|
| 1 | run at any state | undeclared transition attempted | rejected, recorded, state unchanged | PROP-002 |
| 2 | ELIGIBLE, eligibility proceed | consent absent | held, recorded, no spend | RO-ADV-01, RO-MUT-03 |
| 3 | request with consent | profile missing | REFUSED naming the profile, before spend | ADV-001 |
| 4 | sources acquired | source files mutate mid-run | decisions unchanged; no re-read | RO-ADV-04, RO-MUT-01 |
| 5 | token consumed | second acquisition attempt | structural error; no host read | RO-EX-04, RO-PROP-01 |
| 6 | gates scheduled | duplicate report arrives | fail closed, duplication named; first preserved | ADV-017, RO-PROP-02 |
| 7 | toolchain present | toolchain unavailable | SKIP_ENV recorded, never renormalized | ADV-015, PROP-007, MUT-009 |
| 8 | output within bound | output truncated | FAIL with reason | ADV-016 |
| 9 | any cancellable state (`PROFILE_RESOLVED`+) | cancellation | CANCELLED with a full sealed bundle (empty sets where nothing ran) | RO-ADV-06 |
| 10 | budget remaining | wall clock elapses | TIMED_OUT with sealed evidence | lifecycle timeout fixture |
| 11 | writes outstanding | seal attempted | refused, recorded; good path seals last | RO-ADV-03, RO-MUT-02 |
| 12 | terminal state reached | any further transition | rejected; terminal unchanged | RO-ADV-02 |
| 13 | clean workspace | workspace gains "orchestration" bytes | bytes are data; only trusted code decides | ADV-018, MUT-010, RO-EX-03 |
| 14 | producer verified inputs | verification begins | fresh acquisition, distinct values | RO-ADV-05 |
| 15 | one writer advancing | concurrent transition attempts | serialized; losers recorded | RO-PROP-03 |
| 15A | one run sealing | a concurrent run writes through the same port instance | the other run's write is not a post-seal write for this run; per-run sequences unaffected | RO-PROP-04, RO-MUT-07 |
| 16 | outcome established | outcome unestablishable | INDETERMINATE, treated as failure everywhere | ADV-012, MUT-005 |
| 17 | request accepted | profile absent / resolution fails / acquisition faults in `REQUESTED` | early-terminal refusal record; never a fabricated bundle | RO-ADV-07, RO-MUT-05 |
| 18 | non-event transition occurs | emissions examined | no invented/overloaded event type; transition present in the transition record | D9 emission fixtures |

No transition in this table may end in an unrecorded state or a success
classification it did not earn.

## Traceability Plan

| Requirement / invariant | Landing | Proving task | Proof |
|---|---|---|---|
| Typed total lifecycle (INV-004) | L4 | 2.1, 2.2 | EX-004, PROP-002, RO-ADV-02 |
| Consent gates spend (INV-005/D5) | L4 | 2.3 | ADV-001, RO-ADV-01, RO-MUT-03 |
| Acquire-once per epoch (INV-007 L4 half) | L4 | 3.1, 3.2 | RO-EX-04, RO-PROP-01, RO-ADV-04, RO-MUT-01 |
| Verification epoch | L4 | 3.3 | RO-ADV-05 |
| Early-terminal refusal record (D11) | L4 (+ the sequenced L2 amendment) | 2.2, 5.3 | RO-ADV-07, RO-MUT-05 |
| **Requester provenance** — attribution comes from the run request, never a captured profile (owner-directed, 2026-08-12) | L4 | 2.2, 3.2 | RO-EX-08, RO-ADV-08, RO-MUT-06 |
| **Cross-run isolation over shared ports** — per-run ordering only; no unkeyed mutable per-run state (owner-confirmed D10, 2026-08-12) | L4 | 5.1, 5.3, 7.2 | RO-EX-09, RO-PROP-04, RO-MUT-07 |
| **Requested-profile binding, consent binding, base-before-invocation, verification decides, seal-before-success, call recording** — the six properties the review on `aa54574` found missing | L4 | 2.1, 3.2, 3.3, 3.4, 5.1, 5.3 | RO-EX-10…16, RO-MUT-08…13 |
| Base identity at creation (ADV-004 assertion half) | L4 | 3.4 | creation-sequenced fixture |
| Gate scheduling (INV-009/INV-016) | L4 | 4.1, 4.2 | EX-005A, ADV-006/007/015/016/017, PROP-007, MUT-004, MUT-009, RO-PROP-02 |
| Ports and no-launch (RO-INV-02) | L4 | 5.1 | RO-EX-02 |
| Orchestration provenance (INV-008 code side) | L4 | 5.2 | ADV-018, MUT-010, RO-EX-03 |
| Seal-last (INV-011 ordering half) | L4 | 5.3 | RO-ADV-03, RO-MUT-02 |
| Event emission at representable moments + transition record (D9) | L4 | 2.4 | emission fixtures; grant-verbatim check; no-invented-type scan |
| Cannot-decide boundary (RO-INV-01/06) | L4 | 6.1 | RO-EX-01, RO-EX-06, RO-MUT-04 |
| Container-level gate execution (EX-005B, MUT-007) | **L9** | — | **deferred, named** |
| Effective kill/teardown (EX-008, ADV-013) | **L9** | — | **deferred, named** |
| Executing the shell's bootstrap / triggering / placement | **post-U4 operational act** (D2 — no landing) | — | **deferred, named** |

## Review Plan

Per the ratified standing model: planning review of this seam (closing
OQ1–OQ3) before task 0.1 flips; targeted review during construction;
complete-seam semantic review plus one falsification review at the frozen
head. This landing is the **first consumer of `packages/runner-core`**:
per the standing first-consumer note, its suite re-validates the L3
surface it consumes rather than trusting L3's passing suite (task 6.2),
and the anticipated runner-core allowlist amendment follows the recorded
L3-arrival precedent with owner authorization.

### Falsification rounds actually run

Eight recorded falsification passes ran against frozen heads, each
returning REQUEST_CHANGES and each supplying failing tests rather than
prose. Their tests live in the package, unmodified except where noted:

| Round | Findings | Where the tests live |
|---|---|---|
| 1–3 | 5 P1 + 1 P2, then 6, then 6 | merged into `conformance/falsification.test.ts` |
| second reviewer | 3 P1 + 1 P2 | merged into `conformance/falsification.test.ts` |
| 4 | 5 | `conformance/falsification-round4.test.ts`, as supplied |
| 5 | 5 | `conformance/falsification-round5.test.ts`, as supplied |
| 6 | 10 findings + 6 controls | `conformance/falsification-round6.test.ts`; assertions and fixtures unchanged, Prettier-only wrapping applied |
| 7 | 7 new findings + carry-forward blockers | `conformance/falsification-round7.test.ts`; settlement provenance/precedence, immutable history, signal containment, neutral dependency direction, proof-net consistency, late ownership, bounded recovery, and full-bundle recovery |

The finding this record exists for: across rounds, the recurring verdict
was that a fix repaired the counterexample without closing the class —
signal preserved at two boundaries of three, the walk halted at the next
phase but not the current one, a prototype closed while the mutable
reference stayed open. Round 6 found the same error at the coordinator
level: the whole-walk race bounded the CALLER'S WAIT and abandoned a live
continuation, so a concluded run kept acting. The resolution replaces
abandonment with a complete guarded-port boundary and a separate bounded
terminal-settlement boundary.

Round 4's last finding is the same shape aimed at the suite itself:
RO-EX-94 was a substring scan standing in for a structural property, and
nothing exercised it against something it had to catch. RO-INV-69 is that
lesson stated as an invariant.

**One reviewer assertion was edited**, and only this one. Round 4's
RO-EX-94 test asserted against a *copy* of the guard's substring
predicate, so it could go green only if the guard stayed lexical — the
defect it reported. The finding is fixed and the edit is annotated in
place; the reviewer's premise assertion is untouched and still passes.

## Rollout and Rollback

`not_applicable` with reason: the service has no bootstrap, no listener,
and no importer; CI builds and proves it. Rollback is non-reference.
Activating the landed shell — a post-U4 operational act with its own
shadow/rollback plan, not a landing — comes later; L9 remains the single
enforcement flip of the program.

## Assurance Completeness

**Unresolved state-model questions:** none. OQ1–OQ3 were resolved by the
planning review and D10 by the owner's confirmation; nothing remains that
gates 0.1.

**Requirements lacking proof:** none; every requirement in the four
capability specs traces to named proofs above.

**The journal's persistence location is deferred, its semantics are
not.** `RunJournalPort` and `RunLeasePort` are defined and proven here;
where they persist is U11's, and this landing ships in-memory
implementations only. A port whose contract waits for its store is a port
whose contract gets written by the store.

**The workspace observer is real for a plain directory, and says so.**
It captures a creation-time manifest — path, entry kind, mode, size, and
a digest over raw bytes — and derives later change sets from it. It is
NOT a Git-native observer: for coding workspaces a base commit plus a
worktree/index diff distinguishes renames, honours repository ignores,
and avoids walking the tree twice. That is a named refinement for a later
landing, not a capability this one claims. Binary artifact content is
refused rather than carried, because the L3 artifact value holds a
string and widening it is an L2 amendment.

**Scenarios intentionally deferred, each with a named landing:** EX-005B,
MUT-007, EX-008, ADV-013, enforcement ceilings (L9); adapter conformance
(L7/L8); bootstrap execution and triggering (post-U4 operational acts on
the landed shell); credential custody (U2);
evidence persistence (U11).

**Design assumptions requiring human confirmation:** OQ1–OQ3 were
resolved by the planning review (2026-08-10/11; OQ1 accepted, OQ2
resolved as the inert-shell direction, OQ3 accepted with the blocker-3
narrowing). **D11's early-terminal model is confirmed** — the delta review approved
it and the L2 refusal-record amendment it required was authored,
reviewed, merged (PR #76), and archived (PR #78), so its shape and
sequencing are now facts rather than assumptions.

**D10's cross-run concurrency posture is confirmed** — by the repository
owner on 2026-08-12, recorded on PR #79. Per run: a single writer with
serialized transitions (RO-INV-08, proven by RO-PROP-03). Across runs:
the core holds no shared state, port implementations may be shared
instances, and consequently every ordering property this landing claims
— seal-last included — is scoped **per run** and must never be read as
global. The confirmation added an obligation this artifact now carries:
a shared port instance must be concurrency-safe and hold **no unkeyed
mutable per-run state**, with every run-scoped operation carrying its
`run_id`. That is RO-INV-10, proven by RO-EX-09 / RO-PROP-04 / RO-MUT-07.
L4 does not impose a concurrent-run or resource ceiling; CPU, memory,
starvation, scheduling, and substrate isolation remain L9's.

**No design assumption awaiting human confirmation remains.**

`tasks.md` must not begin implementation of unresolved trust-critical
behavior merely because this artifact exists. Task 0.1 gates on all four
conditions in its Status table, of which the D10 confirmation was the
last outstanding.
