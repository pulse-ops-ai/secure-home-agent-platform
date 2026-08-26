# Implementation Tasks: runner-adapter-conformance-seed

## Contract

This file records execution state for the `runner-adapter-conformance-seed`
change. Planning artifacts under `openspec/` confer no implementation
authority; the authority is external and recorded below
(`openspec/AGENTS.md`). A checked box asserts work actually performed,
with evidence in the PR — a box is never checked in advance.

**No task below may begin while the status is NOT_AUTHORIZED.**

## Implementation Authorization

### External authority

- **GitHub issue #56** — "Runner L8: Coding-adapter conformance seed",
  the external authority anchor for this landing. Verbatim:
  - *Ships:* "the conformance harness — same profile, same run → same
    events and evidence across the Claude and Copilot adapters at the
    execution-port level. Explicitly a **seed**, not framework
    conformance (that completes at L10 with a deterministic-loop
    adapter)."
  - *Expected scope:* `tests/framework-conformance/**`.
  - *Completion intent:* "suite green across both adapters; divergences
    are named findings, never averaged away. Prerequisites: L7."
  - State at planning time: **OPEN**, no labels, no milestone, no
    assignee. Parent: #19.
- **Supporting mandate:** ADR-0003 lines 187–190 require
  framework-conformance tests "asserting that every adapter emits the
  same event and evidence contract for the same logical run".
- **Base commit:** main `5403a8525f0e45f99ae7631a9c6f9741092e7f75`
  (PR #96 / L7 merge commit), clean tree.

### Prerequisite status (verified, not assumed)

| Prerequisite | Issue text says | Repository proves | Verdict |
|---|---|---|---|
| L7 | "Prerequisites: L7." | PR #96 MERGED 2026-08-25, merge commit `5403a85` = current main; both adapters, images, and the L7 suite present | **satisfied** |
| L5 (transitive) | #19 row: "next runner landing" | PR #94 MERGED, merge commit `f9ebace` | **satisfied**; the #19 row is stale |

Program metadata that is stale but does NOT block (housekeeping listed
in the report, not rewritten here): issue #53 and issue #55 are both
still **OPEN** — neither PR #94 nor PR #96 used a closing keyword, so
GitHub linked no closing reference; #19's landing tree still shows L5 as
"next runner landing", L7 as "waits on L5", and L8 as "waits on L7", all
under a "current 2026-08-18" date stamp that predates both merges.

### Status

**NOT_AUTHORIZED.**

Authorization is withheld deliberately, on four grounds, each of which
must be resolved by the owner before any task starts:

1. **The owner has not authorized apply.** The standing instruction for
   this change is planning only, pending review of these artifacts.
2. **A scope decision is open** (T0.2): a real `Runner` cannot be
   composed from outside the package today. Two ports are unreachable
   (`session`, `workspace`), and finalization has no publicly provided
   correct wiring — `CommitParticipants` and the only `CommitVisibility`
   implementation, `CommitLedger`, are unexported, while the three sinks
   each default to a PRIVATE ledger. The recommended remedy is a public
   composition factory; every option exceeds or strains #56's declared
   scope of `tests/framework-conformance/**`.
3. **The external authority's wording is unreconciled** (T0.4): #56 says
   "same profile", which cannot express two adapters. OpenSpec artifacts
   rank BELOW the external task contract, so this change may not resolve
   that by reinterpretation — the issue must be amended or an explicit
   owner acceptance recorded.
4. **A required predecessor is unauthorized** (T0.1): the composition is
   currently falsified because the adapters leak provider frame names
   into `transcript_terminal`. ADR-0013 §3/§5 assign normalization to the
   adapters, so the fix lands in `agents/adapters/**` — outside this
   change's declared scope — and must land BEFORE this gate, which
   cannot pass until it does.

Assurance completeness is necessary but not sufficient; none of the
above is created by these artifacts.

## Landing Plan

One PR. T0 is decision-only and blocks everything after it. The
verification net ships with each component (see `assurance.md`).

---

## T0 — Decisions that block implementation (no code)

- [ ] **T0.1** Authorize the required predecessor: adapter normalization
      of `transcript_terminal`.
      *Ownership is already assigned, not open.* ADR-0013 decision 3
      (lines 92–95): "The provider's exit code, its self-reported
      outcome, and its transcript's terminal event are all
      **observations**. The adapter normalizes them; the lifecycle
      decides." Decision 5 (line 122): provider shapes "never leak
      upward". The leaks are at
      `agents/adapters/coding/claude-code/src/observe.ts:163` and
      `agents/adapters/coding/copilot-cli/src/observe.ts:195`.
      *Decisions actually required:*
      (a) the **vocabulary** — which value means "the transcript
      terminated successfully", and where it is stated (SPI doc comment,
      a contracts primitive, or a spec requirement) so runner-core's
      literal `'success'` at
      `packages/runner-core/src/outcome/terminal.ts:86` stops being an
      undocumented coupling;
      (b) **where the fix lands** — its own authorized change, or an
      explicitly authorized scope extension of this one.
      *Constraint:* this change does not implement it under either
      answer without that authorization.
      *Blocks:* T1 onward — the gate cannot pass until the fix exists.
- [ ] **T0.2** Obtain the scope decision for composing a real `Runner`
      from outside the package.
      *Verified against the built declarations:* **two** of thirteen
      ports are unreachable (`session`, `workspace`), and a third,
      `finalization`, has no publicly provided **correct wiring**.
      `TransactionalFinalization` and the `CommitVisibility` type are
      BOTH public (`index.d.ts:14`; `index.d.ts:21` →
      `ports/index.d.ts:151` → `ports/finalization.d.ts:227`), but
      `CommitParticipants` (`adapters/finalization.d.ts:46`) and the only
      `CommitVisibility` implementation, `CommitLedger`, are not — so a
      consumer would have to hand-roll the ledger and define the
      platform's visibility semantics inside the test. The missing named
      pieces are exactly four: `CommitLedger`, `CommitParticipants`,
      `InMemoryExecutionSession`, `InMemoryWorkspaceLifecycle`.
      *And a silent-correctness hazard:* `CommitParticipants.visibility`
      is "the visibility authority the three participants SHARE"
      (`adapters/finalization.ts:57-64`), while `RecordingEventSink` and
      `RecordingEvidenceSink` each default to a PRIVATE `CommitLedger`
      (`adapters/deterministic.ts:127`, `:381`). Composed without one
      shared ledger, finalization publishes where the sinks cannot see —
      the staged terminal event and evidence never become visible, the
      run still completes, and the comparison quietly has nothing
      terminal to compare.
      *Options:*
      (b) **a public composition factory** returning a **complete
      thirteen-field `Ports`** — `testPorts`-shaped
      (`testing-fixtures.ts:218`), NOT `sharedPorts`-shaped
      (`:203` returns only four shared-visibility components) — via
      the existing `src/index.ts` barrel — **no `package.json` change**,
      because the factory rides the already-declared `"."` export;
      **recommended**, because it makes correct wiring the contract
      rather than a consumer obligation. Its required contract (complete
      `Ports`, one shared `CommitVisibility` across
      journal/events/evidence/finalization, readback of the sinks and the
      ledger, `adapter`/`authority` overrides, determinism, launches
      nothing, and NOT `testing-fixtures` wholesale) is specified in
      `design.md` "Scope assessment";
      (a) piecemeal exports — the four missing named pieces
      (`CommitLedger`, `CommitParticipants`, `InMemoryExecutionSession`,
      `InMemoryWorkspaceLifecycle`) — four additions, and the
      shared-ledger hazard remains the consumer's to get right;
      *Ruled out, and recorded so it is not silently reopened:* a
      `./testing` subpath export. It would additionally require
      `services/runner-control/package.json` (today declaring only
      `"."`) and a new source entry, i.e. a larger scope request than
      declared. The barrel already carries ten sibling doubles, every
      service in this workspace exports only `"."`, and no gate asserts
      export maps. Selecting the subpath at T0.2 re-opens the scope
      request and must be re-declared.
      (c) re-implement the ports **and** a `CommitLedger` inside
      `tests/` — literally in scope, but the harness would define its own
      visibility semantics and prove nothing about the platform's.
      *Affected path under (b):* exactly one source file,
      `services/runner-control/src/index.ts`. No manifest change; the
      completion gate asserts `package.json` is untouched.
      *Note:* the earlier "two symbols" framing was wrong — it missed the
      finalization participants entirely.
- [ ] **T0.4** Reconcile the external authority's "same profile" wording
      **before** implementation.
      *Why this is blocking:* `openspec/AGENTS.md` puts the external
      authorizing task contract ABOVE OpenSpec artifacts, so this change
      cannot reinterpret #56 by documenting a different model. #56 says
      "same profile, same run"; `design.md` establishes that a single
      profile cannot express two adapters, because `runtime.adapter` and
      `runtime.image_digest` are profile fields
      (`execution-profile.ts:22-25`) and the runner derives the adapter
      from the captured profile (`requested.ts:96`).
      *Resolution required — one of:*
      (a) the owner amends #56 to say "same logical run, two provider
      bindings" (or equivalent); or
      (b) the owner records an explicit scope/acceptance decision
      accepting the two-profile model under the existing wording.
      *Constraint:* I do not amend #56 or any GitHub issue; this is the
      owner's act. Until it is recorded, the two-profile model has no
      external authority and T2.1 must not start.
      *Proves:* XP-INV-16. *Evidence:* XP-EX-09 — the recorded decision
      is cited here before T2.1 begins.
- [ ] **T0.3** Confirm the completion definition: this gate lands
      **green**, after the T0.1 predecessor.
      *Rationale:* #56 requires "suite green across both adapters". A
      named divergence is the gate's correct FAILURE behavior, not a
      successful conformance result, so a red merge is not an acceptable
      reading of the completion intent.
      *Alternative, if the owner wants the falsification captured before
      the fix exists:* that is a different, explicitly **non-gating**
      falsification-only change with its own name — not this one.
      *Blocks:* the definition of done for T7.

## T1 — Harness skeleton (no assertions)

- [ ] **T1.1** Add the node driver under
      `tests/framework-conformance/` that composes `Ports`, constructs
      `new Runner(...)`, and runs one request, emitting
      `{events, evidence, conclusion}` as JSON. The journal, event sink,
      and evidence sink MUST share one `CommitVisibility` with
      finalization (per T0.2's outcome); a composition that leaves them
      on private ledgers is a defect, not a configuration choice.
      *Proves:* XP-INV-15. *Evidence:* XP-EX-08.
      *Implements:* spec "same logical run … at the execution port".
      *Proves:* XP-INV-02.
      *Paths:* `tests/framework-conformance/` (+ T0.2's outcome).
      *Verification:* the driver runs offline and produces a parseable
      document for one adapter.
- [ ] **T1.2** Reuse the landed L7 mechanism (`fc_support.run_adapter`)
      to obtain each adapter's real `AdapterReport`; feed it to
      `DeterministicAdapterInvocation`.
      *Proves:* XP-INV-01, XP-INV-11 (nothing spawns inside a port).
      *Verification:* structural — no `spawn` inside any port
      implementation the harness constructs.
- [ ] **T1.3** Implement the Python ↔ Node handoff contract exactly as
      `design.md` specifies it, before any assertion depends on it:
      one `node <driver>` subprocess per run; one JSON document on
      stdin (`{profile, request, report}`); exactly one JSON document on
      stdout (`{events, evidence, conclusion}`) and nothing else there;
      diagnostics on stderr only; exit `0` iff a result document was
      produced (a failure-class conclusion is data, not a driver error);
      non-zero = harness **operational** failure, never a conformance
      finding; missing `dist/` for either adapter or runner-control fails
      loudly with the exact build command and never skips.
      *Implements:* spec "offline, launches nothing"; the determinism and
      isolation rows of the handoff table.
      *Cases:* XP-ADV-12 (absent dist), XP-ADV-13 (stdout purity),
      XP-ADV-14 (driver fault attributed as operational).

## T2 — Both runs execute end to end

- [ ] **T2.1** Author the two profile fixtures under the **one logical
      run, two provider bindings** model: identical in everything except
      `runtime.adapter`, `runtime.image_digest`, profile identity/digest,
      and the provider-native tool identities in `capability.tools`. The
      golden case must drive both stubs to the **same number of logical
      operations in the same order**, so ordinal alignment (T4.2) is
      meaningful; declare any dialect divergence explicitly.
      *Implements:* spec "same logical run … two provider bindings".
      *Blocked by:* T0.4 — the model needs external authority first.
      *Proves:* XP-INV-07c. *Evidence:* XP-EX-04c.
      *Verification:* a fixture-diff assertion — any difference outside
      the provider-bound set fails as a fixture defect (XP-ADV-02c).
- [ ] **T2.2** Drive the logical run through both adapters, holding the
      run-scoped inputs identical by construction.
      *Blocked by:* T0.2.
      *Proves:* the comparison model in `design.md`.
      *Verification:* two result documents produced from one run fixture
      plus the two profiles.
- [ ] **T2.3** Record, as committed evidence, the platform outcome each
      adapter produces, and keep the pre-fix
      `transcript_contradicts_exit` observation as a regression case so
      the predecessor cannot silently regress.
      *Proves:* XP-ADV-11 is a real case, not a hypothetical.

## T3 — Neutral comparison: events

- [ ] **T3.1** Compare the emitted `event_type` sequence against the
      closed vocabulary (`runner-execution/spec.md:61-68`) and across
      adapters.
      *Proves:* XP-INV-04. *Evidence:* XP-EX-01.
- [ ] **T3.2** Compare event shape/field inventory per event type.
      *Proves:* XP-INV-04.
- [ ] **T3.3** Land XP-ADV-06 and XP-ADV-07 with this component (native
      differences must NOT fail).
      *Proves:* XP-INV-03's MAY-differ half is real.

## T4 — Neutral comparison: dispositions, classification, and the classification table

- [ ] **T4.1** Implement the explicit MUST-agree / MAY-differ
      classification with totality checking.
      *Proves:* XP-INV-03. *Evidence:* XP-PROP-01. *Kills:* XP-MUT-01.
- [ ] **T4.2** Compare dispositions and the permitted/denied evidence
      partition for the same logical operation, aligning **by
      platform-assigned ordinal** (`recordCalls` assigns `call-000i` by
      array position at `orchestration/calls.ts:38-40`) and never by
      provider tool name. Declare each case as aligned or as a dialect
      divergence; an aligned case with mismatched counts FAILS rather
      than falling back to shared-property comparison.
      *Proves:* XP-INV-05, XP-INV-17. *Evidence:* XP-EX-02, XP-EX-10.
      *Cases:* XP-ADV-16. *Kills:* XP-MUT-11, XP-MUT-12.
- [ ] **T4.3** Compare lifecycle classification and terminal outcome
      across adapters **and** against the contract-required outcome.
      *Proves:* XP-INV-06, XP-INV-10. *Kills:* XP-MUT-07.
- [ ] **T4.4** Implement named-divergence reporting (field, both values,
      classification, position) with no normalization step.
      *Proves:* XP-INV-09. *Evidence:* XP-PROP-02. *Kills:* XP-MUT-03/04.
- [ ] **T4.5** Land XP-ADV-01, XP-ADV-04, XP-ADV-05 with this component.

## T5 — Authority binding and structural-position scans

- [ ] **T5.1** Byte-compare the run-scoped identities (`run_id`, fence
      generation, principal, routing class and route, limits) across
      adapters.
      *Proves:* XP-INV-07a. *Evidence:* XP-EX-04a. *Kills:* XP-MUT-08.
- [ ] **T5.1b** Assert each provider-bound identity (evidence `adapter`,
      image digest, profile identity + digest) equals the corresponding
      field of the profile actually captured for that run — differing
      between runs, correctly bound within each.
      *Proves:* XP-INV-07b. *Evidence:* XP-EX-04b. *Case:* XP-ADV-02b.
- [ ] **T5.2** Assert authority independence under report mutation.
      *Evidence:* property "authority independence". *Case:* XP-ADV-02.
- [ ] **T5.3** Scan emitted events and assembled evidence for provider
      tokens in structural positions and in classification details.
      *Proves:* XP-INV-08. *Evidence:* XP-EX-05. *Case:* XP-ADV-03.

## T6 — Structural guards and the mutation round

- [ ] **T6.1** Guard: no assertion may re-derive a platform transform in
      the test.
      *Kills:* XP-MUT-05.
- [ ] **T6.2** Guard: the port double must be value-returning; no port
      the harness constructs may spawn.
      *Kills:* XP-MUT-06. *Proves:* XP-INV-11.
- [ ] **T6.3** Guard: ≥2 adapters participate in every comparison.
      *Kills:* XP-MUT-09.
- [ ] **T6.4** Guard: one suite — no per-adapter copies (extend the
      landed `test_the_suite_is_one_suite` coverage).
      *Proves:* XP-INV-13. *Case:* XP-ADV-10.
- [ ] **T6.5** Guard: no normalization precedes comparison.
      *Case:* XP-ADV-09.
- [ ] **T6.7** Execute the visibility-wiring proofs explicitly: XP-EX-08
      (after commit, the staged terminal event and evidence are VISIBLE
      through the sinks) and XP-ADV-15 (sinks composed on separate
      ledgers must FAIL). These are scheduled here because the failure
      they guard is silent — the run completes and the comparison simply
      finds nothing terminal. Apply XP-MUT-10 here too (compose the sinks
      on private ledgers) and confirm it is killed.
      *Proves:* XP-INV-15. *Kills:* XP-MUT-10.
- [ ] **T6.6** Execute XP-MUT-01…12; record each with the killing output
      and verify the tree is restored after each. Mutants must be applied
      against a **committed** baseline and the built artifact verified to
      contain the mutation before any verdict is believed.

## T7 — Reconciliation, validation, and completion

- [ ] **T7.1** Update `tests/framework-conformance/README.md`: the suite
      now spans both boundaries; state which assertions are
      process-boundary (L7) and which are execution-port (L8).
- [ ] **T7.2** Confirm the landed L7 inertness and SPI tests still pass,
      and that `git diff` over the frozen SPI is empty.
      *Proves:* XP-INV-12, XP-INV-14. *Evidence:* XP-EX-07.
- [ ] **T7.3** Full ladder: `validate-scaffold.sh`, `scan-secrets.sh`,
      `check-images.mjs`, workspace + import checks, syncpack, prettier
      (write then check last), lint/typecheck/test/build, ruff + format +
      mypy + pytest (via the 3.13 override; plain-`uv` rows disclosed as
      always), `openspec validate --strict`.
- [ ] **T7.4** Record the divergence report as landing evidence.
- [ ] **T7.5** Draft PR using the template; STOP for owner review.

## Explicitly NOT tasks (subtracted L7 evidence)

The following are already proven at `5403a85` by
`tests/framework-conformance/` (85 tests) and MUST NOT be re-implemented:
identical `AdapterReport` grammar; observation field inventories; granted
call dispositions *at the report boundary*; adapter-owned event
vocabulary; claim kinds; native/moneyless usage; closed wire parsing; SPI
mirror tethering; cannot-widen properties; credential-name handling and
the evidenced secrecy control; environment allowlisting; opaque workspace
refs; delimiter/empty-grant widening refusals; cancellation forwarding
and observation; hostile transcript handling; output byte budgets;
provider version/image-lock agreement; adapter inertness and
unlaunchability.

Any task that would duplicate one of these is out of scope by
construction.

## Deferred, with named owners

- Neutrality of `claims`, `events`, `usage`, `transcript` at the
  recording boundary — **no consumer exists today**; due when one does
  (L9 / #57, L10 / #58).
- `transcript_terminal` **vocabulary and its home** — decided at T0.1.
  The normalization itself is a required predecessor owned by the
  adapters (ADR-0013 §3/§5), not deferred work.
- Effective cancellation, isolation, and enforcement — L9 (#57), behind
  U4 (#9).
- The deterministic-loop adapter that converts this seed into framework
  conformance — L10 (#58).

## Completion Gate

- [ ] every ladder check green in CI at the completion head, or its local
      status disclosed with CI as authority
- [ ] `git diff <base>..HEAD -- services/runner-control/src/ports/` empty
- [ ] `git diff <base>..HEAD -- services/runner-control/package.json` empty
      — the factory rides the existing `"."` export; a manifest change
      would mean the subpath route was taken without re-declaring scope
- [ ] the landed L7 suite still green, unmodified except where T7.1
      documents the boundary split
- [ ] the divergence report present and readable
- [ ] owner review verdict on the draft PR
