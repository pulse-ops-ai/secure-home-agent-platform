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
