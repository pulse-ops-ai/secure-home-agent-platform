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
  the external authority anchor for this landing. **Current text, as
  amended 2026-08-26 under T0.4:**
  - *Ships:* "the conformance harness — **same logical run semantics
    under provider-bound profiles** → same events and evidence across the
    Claude and Copilot adapters at the execution-port level. Explicitly a
    **seed**, not framework conformance (that completes at L10 with a
    deterministic-loop adapter)."
  - *Expected scope:* `tests/framework-conformance/**`.
  - *Completion intent:* "suite green across both adapters; divergences
    are named findings, never averaged away. Prerequisites: L7."
  - State: **OPEN**, no labels, no milestone, no assignee. Parent: #19.
  - **Pre-amendment wording, recorded as history — not the governing
    text:** the *Ships* line previously read "same profile, same run →
    same events and evidence…". It was amended because `runtime.adapter`
    and `runtime.image_digest` are execution-profile fields, so one
    profile cannot pin two adapters/images; the amendment and its
    rationale are recorded on the issue itself.
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

The four T0 decisions are now **RESOLVED** (owner, 2026-08-26; recorded
verbatim in T0.1–T0.4 below). Authorization is nonetheless withheld, on
one remaining ground:

- **The required predecessor has not landed.** T0.1 is *decided* — the
  terminal-normalization fix is a separate predecessor change — but it
  does not yet exist. The conformance gate cannot pass until it does
  (`design.md`, "Finding"), and T0.3 forbids merging a known-red gate.
  L8 implementation therefore may not begin.

Sequence recorded with the decisions: (1) record T0.1–T0.4 and merge this
reconciliation; (2) author the terminal-normalization predecessor
OpenSpec change; (3) review, authorize, implement, and merge the
predecessor; (4) flip L8 implementation authorization; (5) implement #56.

Assurance completeness is necessary but not sufficient; none of the
above is created by these artifacts.

## Landing Plan

One PR. T0 is decision-only and blocks everything after it. The
verification net ships with each component (see `assurance.md`).

---

## T0 — Decisions that block implementation (no code)

- [x] **T0.1 — RESOLVED** (owner, 2026-08-26). Terminal normalization is
      a **separate predecessor change**. The platform semantic vocabulary
      for `transcript_terminal` must be defined, and both adapters must
      normalize their provider terminal frames into it. Adapter changes
      are **not** smuggled into #56.
      *Ownership was never open:* ADR-0013 decision 3 (lines 92–95) —
      "The adapter normalizes them; the lifecycle decides" — and decision
      5 (line 122), provider shapes "never leak upward". The leaks are at
      `agents/adapters/coding/claude-code/src/observe.ts:163` and
      `agents/adapters/coding/copilot-cli/src/observe.ts:195`; the
      classifier's expectation is
      `packages/runner-core/src/outcome/terminal.ts:86`.
      *Still blocks L8:* decided ≠ landed. The predecessor change does
      not exist yet.
- [x] **T0.2 — RESOLVED** (owner, 2026-08-26). The narrow
      runner-control scope expansion is **approved**: **one curated
      composition factory exported from the existing top-level barrel**
      (`services/runner-control/src/index.ts`). Explicitly **no
      `./testing` subpath and no `package.json` change**. Preferred over
      exposing the four low-level ledger/session internals, because the
      existing internal fixture (`testing-fixtures.ts:203` `sharedPorts()`
      / `:218` `testPorts()`) demonstrates that shared `CommitVisibility`
      wiring is load-bearing and must not become a consumer obligation.
      *Contract:* the factory returns a complete thirteen-field `Ports`
      (`testPorts`-shaped, not `sharedPorts`-shaped) — see `design.md`
      "Scope assessment" for the full required contract.
      *Guarded:* XP-INV-18 / XP-EX-11 and the completion gate assert
      `services/runner-control/package.json` is untouched.
- [x] **T0.3 — RESOLVED** (owner, 2026-08-26). **L8 lands green.**
      Injected divergences must make the conformance suite fail — that is
      the gate working — but a known-red gate is not merged. The
      falsification-only alternative is not taken.
- [x] **T0.4 — RESOLVED** (owner, 2026-08-26). **#56 was amended** to
      authorize the model: its *Ships* line now reads "same logical run
      semantics under provider-bound profiles" in place of "same profile,
      same run"; nothing else in the issue changed. Amendment made
      2026-08-26T12:56:23Z with the rationale recorded as an issue
      comment.
      *Why it was required:* `openspec/AGENTS.md` ranks the external task
      contract above OpenSpec artifacts, so the delta could not adopt the
      model by reinterpretation. It now has external authority, and the
      normative delta states the model directly.
      *Proves:* XP-INV-16. *Evidence:* XP-EX-09 — this record.

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
      *Proves:* XP-INV-01, XP-INV-02b, XP-INV-11 (nothing spawns inside a
      port).
      *Verification:* structural — no `spawn` inside any port
      implementation the harness constructs; the adapters run to
      completion first and the port double only carries their reports.
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
      *Satisfied by:* T0.4 — the model now has external authority (amended #56).
      *Proves:* XP-INV-07c. *Evidence:* XP-EX-04c.
      *Verification:* a fixture-diff assertion — any difference outside
      the provider-bound set fails as a fixture defect (XP-ADV-02c).
- [ ] **T2.2** Drive the logical run through both adapters, holding the
      run-scoped inputs identical by construction.
      *Satisfied by:* T0.2 — the composition factory is approved.
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
      tokens in **structural positions only** — event types, dispositions,
      lifecycle states, terminal outcomes, evidence field names. The scan
      MUST NOT flag a diagnostic detail string: ADR-0003:88-92 permits a
      provider name "only as an opaque value", and a detail is data.
      *Proves:* XP-INV-08. *Evidence:* XP-EX-05.
      *Cases:* XP-ADV-03 (structural ⇒ fail), XP-ADV-03b (detail-only ⇒
      pass). *Kills:* XP-MUT-13.

## T6 — Structural guards and the mutation round

- [ ] **T6.1** Guard: no assertion may re-derive a platform transform in
      the test; and no artifact or test name may claim an adapter is an
      `AdapterInvocationPort` implementation — the proof covers the port
      CONSUMER path, with the adapters running before `invoke()`.
      *Proves:* XP-INV-02b. *Evidence:* XP-EX-12. *Kills:* XP-MUT-05.
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
- [ ] **T6.6** Execute XP-MUT-01…13; record each with the killing output
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
- `transcript_terminal` **vocabulary and normalization** — **not deferred
  work**: T0.1 selected a separate predecessor change, owned by the
  adapters (ADR-0013 §3/§5), which defines the vocabulary and normalizes
  into it. It is the one landing this change waits on.
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
