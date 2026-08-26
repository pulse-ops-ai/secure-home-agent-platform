# Assurance Plan: runner-adapter-conformance-seed

## Purpose

Defines how the execution-port conformance property will be proven before
this change is considered complete. It creates no product requirements;
it derives from `specs/platform-adapters/spec.md` and `design.md`.

## Risk Classification

**Risk:** `high`

### Rationale

- **Runner/review machinery.** The artifact is a governance proof: if it
  is wrong, it certifies neutrality the platform does not have.
- **Evidence binding.** It asserts which evidence fields may and may not
  depend on a provider dialect — the audit contract's core claim
  (`runner-evidence/spec.md:11-53`).
- **Public cross-package composition.** It composes runner-control from
  outside the package for the first time, and the composition is not
  currently expressible on the public surface: two ports are unreachable
  and finalization's correct wiring — the shared `CommitVisibility`
  ledger — is not publicly provided. A wrong composition fails silently
  (nothing terminal to compare), so the request is a supported factory
  rather than raw symbols.
- **A live falsification already exists.** The composition is currently
  wrong (`design.md`, "Finding"). The landing is therefore sequenced
  behind the adapter-normalization predecessor and must never be tuned
  into agreement — a comparison relaxed to pass is the primary failure
  mode this plan guards against.

Not `trust-critical`: it grants no authority, provisions no credential,
launches nothing, and changes no accepted contract.

## Critical Invariants

| ID | Invariant | Class |
|---|---|---|
| XP-INV-01 | The proof observes only what the platform produced after `invoke()` returned; no assertion reads adapter internals or re-derives the transform | review/governance |
| XP-INV-02 | Both runs are driven through the real `Runner` and the real interpretation path — no test-side re-implementation of `classifyTerminalObservations` or `recordCalls` | behavior |
| XP-INV-03 | Every compared fact carries an explicit MUST-agree or MAY-differ classification; an unclassified compared fact fails | review/governance |
| XP-INV-04 | The emitted `event_type` sequence is drawn from the closed platform vocabulary and is identical across adapters | compatibility |
| XP-INV-05 | Call dispositions and the permitted/denied evidence partition agree across adapters for the same logical operation | behavior |
| XP-INV-06 | Lifecycle classification and terminal outcome agree across adapters, AND equal the outcome the contract requires for the case | behavior |
| XP-INV-07a | Run-scoped authority — `run_id`, fence generation, principal, routing class and route, limits — is identical across adapters and unreachable from anything an adapter reports | trust |
| XP-INV-07b | Provider-bound identity — evidence `adapter`, image digest, profile identity + digest — differs between runs and each value equals the corresponding field of the profile actually captured for that run | trust |
| XP-INV-07c | The two profile fixtures differ ONLY in the provider-bound fields; any other difference is a fixture defect the harness detects | review/governance |
| XP-INV-08 | No provider-native token occupies a platform-structural position or a platform classification detail | trust (ADR-0003:88-92) |
| XP-INV-09 | A MUST-agree divergence fails and is NAMED (field, both values, classification, position); no normalization step may precede comparison | trust |
| XP-INV-10 | Agreement alone never passes a case whose required platform outcome is wrong for both adapters | behavior |
| XP-INV-11 | The harness launches nothing: no container, no real provider, no port implementation capable of starting a process; it runs offline and deterministically | trust |
| XP-INV-12 | L7's landed inertness invariant still holds — no workspace member outside `agents/adapters/` declares or imports an adapter package | compatibility |
| XP-INV-13 | The suite remains ONE suite: shared assertions are parameterized over the adapter registry, never copied per adapter | review/governance |
| XP-INV-14 | `AdapterInvocationPort` and the frozen SPI are unchanged by this landing | compatibility |
| XP-INV-15 | The journal, event sink, and evidence sink share ONE `CommitVisibility` with finalization; the harness never composes them on private ledgers, and never defines its own visibility semantics | trust |
| XP-INV-16 | The comparison model has recorded external authority (an amended #56 or a recorded owner acceptance) before it is implemented | review/governance |
| XP-INV-17 | Operations are aligned by platform-assigned ordinal, never by provider name; an aligned case with mismatched counts is a divergence, never a silent fallback to shared-property comparison | behavior |

## Authority Chain

| Object | Authority source | Captured when | Agent-mutable after capture? | Transformation | Final verifier |
|---|---|---|---|---|---|
| L8 mandate | GitHub issue #56 (+ ADR-0003:187-190) | recorded in `tasks.md` | no | none | owner review |
| The neutrality requirement | `runner-execution/spec.md:61-68` ("Event shapes SHALL be identical across adapters") | canonical spec, archived | no | none | this suite |
| Evidence identity obligations | `runner-evidence/spec.md:11-53` | canonical spec | no | none | this suite |
| The port under test | frozen SPI, `services/runner-control/src/ports/values.ts` (L4) | read as source text by the L7 tether | **no — this change must not edit it** | none | `test_spi_tether` (landed) |
| Adapter reports compared | the L7 adapters' built `dist/bin.js`, driven against committed stubs | at suite run time | no — produced fresh each run | plan/observe | this suite |
| Platform events + evidence | the real `Runner` composition | at suite run time | no | `running.ts` → classify/recordCalls → sinks | this suite |
| The `INDETERMINATE` finding | reproduced offline from built artifacts at `5403a85` | recorded in `design.md` | no | none | fixed by the adapters (ADR-0013 §3/§5) as a required predecessor; only the vocabulary's home is an owner decision |
| Provider binding of each run | the captured execution profile (`runtime.adapter`, `runtime.image_digest`) | at profile capture, per run | no — the report cannot move it | `requested.ts:96` derives the adapter from the profile | XP-EX-04b |

## Producer → Transform → Final Consumer

The proof follows each adapter-derived channel to its terminal consumer,
and each authority-derived field to the same, to show the second set
cannot be influenced by the first.

| Producer | Transform | Intermediate | Final consumer | Neutrality obligation |
|---|---|---|---|---|
| adapter `observation.terminal` | `classifyTerminalObservations` (runner-core) | `TerminalClassification` | `finish(... 'indeterminate' ...)` → run terminal outcome → `outcomeFor()` → evidence outcome | classification kind and outcome MUST agree across adapters and match the contract-required outcome (XP-INV-06, XP-INV-10) |
| adapter `observation.calls[].tool` | `recordCalls` | `operation.name` | `call.attempted` event data + evidence `operations.*[].operation.name` | name MAY differ (provider-native); its *position* must be a data field, never structure (XP-INV-08) |
| adapter `observation.calls[].disposition` | `recordCalls` | `call_id` partition | `call.disposition` event + evidence `operations.{permitted,denied}` | MUST agree (XP-INV-05) |
| adapter identity (platform-supplied) | passthrough | `inputs.adapter` | evidence `adapter` field | opaque value only (`runner-evidence/spec.md:21`) |
| captured profile (`runtime.adapter`, `runtime.image_digest`, identity) | authority capture | `authority.profile`, `authority.adapter` | evidence `adapter`, `image_digest`, profile identity + digest | MAY differ between runs; each MUST bind to its own captured profile (XP-INV-07b) |
| captured profile (`execution`, `limits`, `principal`) | authority capture | `authority.profile` | evidence route, limits, principal | MUST be identical across adapters (XP-INV-07a) |
| lease claim | `RunMachine` walk | `scope.fence.generation` | evidence/run identity | MUST be identical and adapter-independent (XP-INV-07a) |
| `observation.{claims,events,usage,transcript}` | **none today** | — | — | no obligation provable at this boundary; recorded as deferred (L9/L10) rather than asserted |

The proof does **not** stop at `AdapterReport`: every row above is
asserted at the *final consumer* column — the emitted event stream and
the assembled evidence — which is what #56 requires.

## State-Space Model

Dimensions that materially change behavior:

1. **Adapter** — claude-code | copilot-cli.
2. **Provider dialect of the same logical outcome** — reactive (denial
   recorded) | preventive (call absent).
3. **Terminal observation set** — agreeing | `clean_exit_with_signal` |
   `success_claim_with_failure_exit` | `transcript_contradicts_exit` |
   absent exit code.
4. **Report outcome** — `observed` | `environmental_fault` |
   `stale_fence`.
5. **Grant** — non-empty | empty.
6. **Comparison classification** — MUST-agree | MAY-differ |
   unclassified.
7. **Divergence source** — genuine platform-semantic divergence |
   provider-native-only difference.

Meaningful interactions (not the Cartesian product):

- 2 × 5 — preventive dialect with an empty grant produces *no* calls at
  all in both adapters; the permitted-partition assertion must still be
  meaningful rather than vacuously true.
- 3 × 6 — a terminal conflict must classify identically across adapters
  *and* land in the MUST-agree class; this is where the live finding sits.
- 4 × 1 — `environmental_fault` and `stale_fence` take different platform
  paths (`OPERATIONAL_FAILURE`; fence loss with no spend) and both must be
  adapter-independent.
- 7 × 6 — the discriminating case: a native-only difference must NOT fail,
  a semantic difference MUST fail. Testing only one side proves nothing.

## Decision Tables

Comparison outcome:

| Compared fact | Classification | Values | Required outcome | Failure class |
|---|---|---|---|---|
| `event_type` sequence | MUST-agree | equal | pass | — |
| `event_type` sequence | MUST-agree | differ | **fail, named** | change-attributable |
| disposition for same logical op | MUST-agree | differ | **fail, named** | change-attributable |
| `operation.name` | MAY-differ | differ | pass | — |
| usage unit/amount | MAY-differ | differ | pass | — |
| terminal classification | MUST-agree | equal but contract-wrong | **fail** (XP-INV-10) | change-attributable |
| `run_id` / generation / principal / route / limits | MUST-agree | differ | **fail, named** | change-attributable |
| evidence `adapter` / image digest / profile digest | provider-bound | differ **and** each binds to its own profile | pass | — |
| evidence `adapter` / image digest / profile digest | provider-bound | value does not match its captured profile | **fail, named** | change-attributable |
| any compared field | unclassified | — | **fail** | review defect |
| adapter build missing | — | — | **fail** with build command | operational |
| stub or driver faults | — | — | fail, reported as operational | operational |

Out-of-grant dialect:

| Adapter | Observable form | Shared property asserted | Dialect assertion |
|---|---|---|---|
| claude-code | denied call recorded | no permitted operation for it | denial present in evidence `denied` |
| copilot-cli | call absent entirely | no permitted operation for it | no operation recorded |
| either | **permitted** | — | **fail** — the shared property is violated |

## Cross-Requirement Interactions

- **"Identical events" × "provider names are data"** — a naive identity
  assertion over whole event payloads would fail on `operation.name` and
  invite someone to normalize the names, destroying XP-INV-08's evidence.
  Resolved by classifying per field, not per event.
- **"Divergences are named" × "suite green"** (#56's completion intent) —
  not in tension once read correctly: naming a divergence is the gate's
  required *failure behavior*, and "green" is the required *result*.
  Resolved by sequencing in `tasks.md`: the adapter-normalization
  predecessor lands first and this gate lands green. It may never land
  green by weakening a classification, and it may not merge red.
- **"One suite" × "per-dialect assertions"** — dialect-specific
  expectations must stay inside one parameterized test, not a per-adapter
  copy (XP-INV-13, guarded by the landed `test_the_suite_is_one_suite`).
- **XP-INV-02 (real path) × XP-INV-11 (launch nothing)** — satisfied
  together only because `DeterministicAdapterInvocation` carries a
  value; an `invoke()` that spawned would satisfy the first and break the
  second.

## Proof Obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| XP-EX-01 | XP-INV-02, XP-INV-04 | deterministic example | one golden logical run per adapter through the real `Runner`; event-type sequences compared |
| XP-EX-02 | XP-INV-05 | deterministic example | dispositions + evidence partition compared for the same logical operation |
| XP-EX-03 | XP-INV-06 | deterministic example | classification and outcome compared *and* checked against the contract-required outcome |
| XP-EX-04a | XP-INV-07a | deterministic example | run-scoped identities byte-compared across adapters |
| XP-EX-04b | XP-INV-07b | deterministic example | each provider-bound identity compared against its own captured profile |
| XP-EX-04c | XP-INV-07c | deterministic example | the two profile fixtures differ only in the provider-bound fields |
| XP-EX-05 | XP-INV-08 | scan | emitted events + evidence scanned for provider tokens in structural positions and classification details |
| XP-EX-06 | XP-INV-01, XP-INV-11 | structural | harness composes only value-returning ports; no spawn inside any port; PATH isolation reused from L7 |
| XP-EX-07 | XP-INV-12, XP-INV-14 | mechanical | landed L7 inertness tests still pass; `git diff` over the frozen SPI is empty |
| XP-EX-08 | XP-INV-15 | deterministic example | after commit, the staged terminal event and evidence are VISIBLE through the sinks — the assertion that fails when the ledgers are not shared |
| XP-EX-09 | XP-INV-16 | manual evidence | the recorded owner decision (amended #56, or a written acceptance) is cited in `tasks.md` before T2.1 begins |
| XP-PROP-01 | XP-INV-03 | property | for every compared field, a classification exists; unclassified ⇒ failure |
| XP-PROP-02 | XP-INV-09 | property | for any injected MUST-agree difference, the failure message names field + both values |
| XP-EX-10 | XP-INV-17 | deterministic example | aligned cases compare by ordinal with names free; a length mismatch in an aligned case fails |
| XP-ADV-01…16 | see Hostile Corpus | hostile fixture | below |
| XP-MUT-01…12 | see Mutation Targets | mutation | below |

No obligation claims proof of behavior the harness does not exercise:
`claims`, `events`, `usage`, and `transcript` neutrality are explicitly
**not** claimed (no consumer exists).

## Property Tests

- **Classification totality** — every field the comparator visits is in
  exactly one class; the union covers the compared surface and the
  intersection is empty.
- **Named-divergence completeness** — for any single injected difference
  in a MUST-agree field, the failure text contains the field path and
  both values.
- **Authority independence** — for any mutation of the *report* (calls,
  terminal, or unconsumed fields), the authority-derived evidence fields
  are unchanged.
- **Dialect symmetry** — swapping which adapter plays "reactive" and
  which plays "preventive" in the out-of-grant case does not change the
  verdict.

## Hostile Corpus

| ID | Case | Required outcome |
|---|---|---|
| XP-ADV-01 | Claude reports an operation permitted; Copilot reports the same logically-granted operation not permitted | fail, naming operation + both dispositions + positions |
| XP-ADV-02 | One adapter's run carries a different `run_id` / fence generation / principal / route | fail, naming the identity field |
| XP-ADV-02b | Evidence `adapter` or image digest does not match that run's captured profile | fail, naming the field and both values |
| XP-ADV-02c | The two profile fixtures differ in a field outside the provider-bound set | fail as a fixture defect |
| XP-ADV-03 | A provider-specific token is placed into a platform-structural position or the classification detail | fail, naming token and position |
| XP-ADV-04 | Equivalent terminal observations classified differently between adapters | fail |
| XP-ADV-05 | One adapter drops a denied/absent operation and the platform records it permitted | fail |
| XP-ADV-06 | Provider-native usage units differ, nothing else | **pass** (native stays native) |
| XP-ADV-07 | Provider event payload data differs, nothing else | **pass** |
| XP-ADV-08 | A test bypasses the port and asserts on adapter internals | not admissible as execution-port evidence; suite structure check fails it |
| XP-ADV-09 | A "common normalization" rewrites contradictory provider facts to equal values before comparison | fail (guard) |
| XP-ADV-10 | Per-adapter copies of a shared assertion appear | fail (one-suite property) |
| XP-ADV-11 | Both adapters agree on a *wrong* platform outcome (the live `transcript_contradicts_exit` case) | fail — agreement is not sufficiency |
| XP-ADV-12 | An adapter's or runner-control's `dist/` is absent | fail loudly with the build command; never skip |
| XP-ADV-13 | The node driver writes a diagnostic to stdout alongside the result document | fail — stdout carries exactly one document |
| XP-ADV-14 | The driver exits non-zero after faulting | reported as an operational harness failure, never as a conformance finding |
| XP-ADV-15 | Sinks composed on separate visibility ledgers | fail: the terminal event/evidence are not visible after commit (guards XP-INV-15) |
| XP-ADV-16 | An aligned case whose two runs record different operation counts | fail naming the mismatch; no fallback to shared-property comparison |

## Mutation Targets

| ID | Mutation | Killed by |
|---|---|---|
| XP-MUT-01 | Comparator defaults an unclassified field to MAY-differ | XP-PROP-01 |
| XP-MUT-02 | Comparator compares whole event payloads instead of per-field classes | XP-ADV-06/07 (native differences would wrongly fail) |
| XP-MUT-03 | Comparator lowercases/canonicalizes both values before equality | XP-ADV-09 |
| XP-MUT-04 | Divergence message drops one of the two values | XP-PROP-02 |
| XP-MUT-05 | Harness re-implements `classifyTerminalObservations` instead of running the real path | XP-EX-03 + a source guard forbidding the re-derivation |
| XP-MUT-06 | Harness swaps `DeterministicAdapterInvocation` for a spawning port | XP-EX-06 structural check |
| XP-MUT-07 | Contract-required-outcome assertion removed, leaving only cross-adapter equality | XP-ADV-11 |
| XP-MUT-08 | Authority identities read from the report rather than the run | XP-EX-04 / property "authority independence" |
| XP-MUT-09 | Adapter registry reduced to one adapter (making every comparison vacuous) | a guard asserting ≥2 adapters participate in each comparison |
| XP-MUT-10 | Harness composes the sinks on private `CommitLedger`s instead of the shared one | a terminal-visibility assertion: the staged terminal event and evidence must be visible after commit — the failure is otherwise silent (run completes, nothing terminal to compare) |
| XP-MUT-11 | Aligned comparison silently falls back to shared-property comparison when counts differ | XP-ADV-16 |
| XP-MUT-12 | Operations aligned by provider tool name instead of ordinal | XP-EX-10 — alignment must survive `Read` vs `bash` |

## Traceability Plan

| Requirement (specs/platform-adapters) | Landing | Task group | Proving evidence |
|---|---|---|---|
| Same logical run proven adapter-neutral at the execution port | this | T3, T4 | XP-EX-01…04 |
| Offline, launches nothing | this | T3 | XP-EX-06 |
| Bypass not admissible | this | T6 | XP-ADV-08 |
| Neutral vs native separated explicitly | this | T4 | XP-PROP-01, XP-ADV-06/07 |
| Divergence named, never averaged | this | T4, T6 | XP-PROP-02, XP-ADV-09, XP-MUT-03 |
| No provider vocabulary in structural positions | this | T5 | XP-EX-05, XP-ADV-03 |
| Authority remains adapter-independent | this | T5 | XP-EX-04, XP-ADV-02 |
| Shared commit visibility across journal/events/evidence | this | T1.1, T0.2, T6.7 | XP-EX-08, XP-MUT-10, XP-ADV-15 |
| Operation alignment by ordinal | this | T4.2 | XP-EX-10, XP-ADV-16, XP-MUT-11, XP-MUT-12 |
| External authority for the two-binding model | **blocking** | T0.4 | XP-EX-09 |
| Neutrality of `claims`/`events`/`usage`/`transcript` | **deferred** | — | no consumer exists; due at L9/L10 when one does |
| `transcript_terminal` vocabulary resolution | **deferred/escalated** | T0 (blocking question) | owner decision, separate authorized change |

## Landing Plan

**A required predecessor, then one PR.**

The adapter normalization fix (ADR-0013 §3/§5) must land **before** this
gate, because the gate cannot pass while it is outstanding. It is not
part of this change's declared scope; it lands either as its own
authorized change or as an explicitly authorized extension of this one.
This plan does not assume either, and does not implement it.

Then, one PR, ordered so the proof cannot be tuned into agreement:

1. **T0 — decisions** (no code): the vocabulary decision, the scope
   request (now including the finalization participants), the predecessor
   authorization, and the #56 authority reconciliation. All block T1+.
2. **T1** — harness skeleton, the node driver, and the Python↔Node
   handoff contract; no assertions yet.
3. **T2** — the two runs execute end to end.
4. **T3–T5** — classification, comparison, binding, and the scans, each
   landing with its own adversarial cases.
5. **T6** — structural guards (one-suite, no-bypass, no-normalization)
   and the mutation round.
6. **T7** — docs/README reconciliation and the full ladder.

The verification net ships with each component, not at the end: T3–T5
each carry their own hostile cases, because a comparison landed without
its falsification is a comparison nobody can trust.

Nothing in this landing is activated by anything: the suite is a gate,
not a runtime.

## Review Plan

- **Evidence review** — the recorded falsification and the divergence
  report, read against the classification tables.
- **Repository-aware semantic review** — that the harness composes the
  real path, and that no assertion re-derives a platform transform.
- **Contract-conformance obligations** — the landed L7 suite, the
  runner-control conformance suite, and the workspace/import gates must
  all remain green; the frozen SPI diff must be empty.
- **Scope review** — the composition-factory / export decision (T0.2)
  and the #56 authority reconciliation (T0.4) are explicit reviewer
  gates, not implementation details.
- No repeated full review at construction checkpoints; one review at the
  complete seam, plus the T0 decision up front.

## Rollout and Rollback

`not_applicable` for runtime rollout: this landing adds a test suite and,
pending the T0.2 decision, one public composition factory (or the
equivalent four piecemeal exports) on `services/runner-control`. There is
no activation, no shadow phase, and no measurement gate. Rollback is
reverting the PR; nothing downstream depends on it.

The one non-trivial rollout question — whether a conformance gate may
merge red against a known finding — is answered **no**. #56 requires
"suite green across both adapters"; a named divergence is the gate's
correct failure behavior, not a successful conformance result. The
adapter fix therefore lands first, and this suite lands green. It may
never land green by weakening a classification, and if the owner wants
the falsification captured before the fix exists, that is a separate,
explicitly non-gating piece of work.

## Assurance Completeness

**Unresolved state-model questions**

- The `transcript_terminal` **vocabulary** — which value means "the
  transcript terminated successfully", and where that vocabulary is
  stated (SPI doc comment, a contracts primitive, or a spec requirement)
  so three layers share one definition. *Ownership* of normalization is
  NOT open: ADR-0013 §3/§5 assign it to the adapter.
- Whether the platform intends `provider_event_name` to be populated at
  all, given `observation.events` currently has no consumer.

**Requirements lacking proof in this landing**

- Neutrality of the four unconsumed observation fields. Deliberately
  unproven; naming them is the honest alternative to a vacuous assertion.

**Scenarios intentionally deferred**

- Effective cancellation and enforcement (L9 / #57, behind U4 / #9).
- The third, deterministic-loop adapter that converts this seed into
  framework conformance (L10 / #58).

**Blocking authority question**

- #56's "same profile" wording versus the two-provider-binding model the
  contracts make necessary. `openspec/AGENTS.md` ranks the external task
  contract above OpenSpec artifacts, so this cannot be settled inside
  this change: the issue must be amended, or an explicit owner acceptance
  recorded (T0.4). Documenting the reinterpretation is insufficient.

**Design assumptions requiring human confirmation**

1. A public composition factory (or the equivalent piecemeal exports) is
   the accepted way to compose the real `Runner` from `tests/`, including
   the shared `CommitVisibility` that finalization requires — rather than
   re-implementing the ports and the ledger in the test.
2. The adapter normalization fix is authorized as a predecessor (its own
   change, or an explicit scope extension of this one) so this gate can
   land green — rather than this suite merging red.
3. Reaching runner-control's *public* surface from `tests/` is the
   intended direction for a cross-cutting platform proof — consistent
   with `tests/README.md` ("tests that span more than one component") and
   with the landed precedent of reading `values.ts` as source text.

`tasks.md` does not begin implementation of any of the above: its
authorization state is NOT_AUTHORIZED.
