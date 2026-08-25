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

Authorization is withheld deliberately, on three grounds, each of which
must be resolved by the owner before any task starts:

1. **The owner has not authorized apply.** The standing instruction for
   this change is planning only, pending review of these artifacts.
2. **A scope decision is open** (T0.2): the landing needs either two
   symbols re-exported from `services/runner-control/src/index.ts` or two
   in-test port re-implementations. The first exceeds #56's declared
   scope of `tests/framework-conformance/**`.
3. **A contract finding is escalated** (T0.1): the composition is
   currently falsified, and the fix belongs to one of three ownerships,
   none of them this change's. Its resolution determines whether this
   suite can land green at all.

Assurance completeness is necessary but not sufficient; none of the
above is created by these artifacts.

## Landing Plan

One PR. T0 is decision-only and blocks everything after it. The
verification net ships with each component (see `assurance.md`).

---

## T0 — Decisions that block implementation (no code)

- [ ] **T0.1** Escalate the `transcript_terminal` finding and obtain a
      disposition.
      *Proves:* assurance "unresolved state-model questions".
      *Evidence:* `design.md` "Finding"; reproduced offline at `5403a85`.
      *Decision required:* which ownership fixes it — adapters
      (`agents/adapters/**`), runner-core
      (`packages/runner-core/src/outcome/terminal.ts:86`), or the frozen
      SPI (`services/runner-control/src/ports/values.ts`) — and whether
      this suite lands red-and-named or after the fix.
      *Constraint:* this change must not implement any of the three.
- [ ] **T0.2** Obtain the scope decision.
      *Options:* (a) re-export `InMemoryExecutionSession` and
      `InMemoryWorkspaceLifecycle` from
      `services/runner-control/src/index.ts` — two symbols, no behavior,
      exceeds #56's declared scope; (b) re-implement both in-memory ports
      inside `tests/framework-conformance/` — in scope, duplicates
      substrate behavior in a test.
      *Recommendation:* (a), per `design.md` "Scope assessment".
- [ ] **T0.3** Confirm the completion-intent reading: a suite that fails
      on a named, escalated divergence satisfies "divergences are named
      findings, never averaged away", even though #56 also says "suite
      green".
      *Blocks:* the definition of done for T7.

## T1 — Harness skeleton (no assertions)

- [ ] **T1.1** Add the node driver under
      `tests/framework-conformance/` that composes `Ports`, constructs
      `new Runner(...)`, and runs one request, emitting
      `{events, evidence, conclusion}` as JSON.
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

## T2 — Both runs execute end to end

- [ ] **T2.1** Drive the same logical run through both adapters, holding
      the platform-built request identical by construction.
      *Blocked by:* T0.2.
      *Proves:* the same-run comparison model in `design.md`.
      *Verification:* two documents produced from one request fixture.
- [ ] **T2.2** Record, as committed evidence, the platform outcome each
      adapter currently produces — including the live
      `transcript_contradicts_exit` result if T0.1 has not landed a fix.
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
      partition for the same logical operation.
      *Proves:* XP-INV-05. *Evidence:* XP-EX-02.
- [ ] **T4.3** Compare lifecycle classification and terminal outcome
      across adapters **and** against the contract-required outcome.
      *Proves:* XP-INV-06, XP-INV-10. *Kills:* XP-MUT-07.
- [ ] **T4.4** Implement named-divergence reporting (field, both values,
      classification, position) with no normalization step.
      *Proves:* XP-INV-09. *Evidence:* XP-PROP-02. *Kills:* XP-MUT-03/04.
- [ ] **T4.5** Land XP-ADV-01, XP-ADV-04, XP-ADV-05 with this component.

## T5 — Authority binding and structural-position scans

- [ ] **T5.1** Byte-compare the authority-derived identities (`run_id`,
      fence generation, profile identity + digest, principal,
      `image_digest`, provider route) across adapters.
      *Proves:* XP-INV-07. *Evidence:* XP-EX-04. *Kills:* XP-MUT-08.
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
- [ ] **T6.6** Execute XP-MUT-01…09; record each with the killing output
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
- `transcript_terminal` vocabulary — escalated at T0.1; separate
  authorized change.
- Effective cancellation, isolation, and enforcement — L9 (#57), behind
  U4 (#9).
- The deterministic-loop adapter that converts this seed into framework
  conformance — L10 (#58).

## Completion Gate

- [ ] every ladder check green in CI at the completion head, or its local
      status disclosed with CI as authority
- [ ] `git diff <base>..HEAD -- services/runner-control/src/ports/` empty
- [ ] the landed L7 suite still green, unmodified except where T7.1
      documents the boundary split
- [ ] the divergence report present and readable
- [ ] owner review verdict on the draft PR
