# Implementation Tasks: knowledge-promotion-path

## Contract

Establish where a durable architectural truth lives and how it reaches an agent.
Documentation and governance only. No knowledge module, no toolchain, no
provider artifact, no runtime surface.

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

OpenSpec artifacts are planning documents. The implementation authority is a
GitHub issue, an explicit user task, or another repository-approved task
contract — never this file, and never the assurance artifact.

### External authority

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source id / link | Repository owner's task, 2026-08-15: "formalize how durable architectural lessons become portable agent knowledge" |
| Authorized scope | Establish the promotion rule; determine whether it needs an ADR and author one at the next free number if so; create the smallest coherent OpenSpec/design/architecture change; add one repository rule for future work; validate; one commit |
| Constraints | Do NOT create provider-native skills. Do NOT author real knowledge content. Preserve accepted-ADR immutability. Do not silently resolve any unresolved decision. Do not implement the OKF toolchain. Do not author the L4 knowledge modules. |
| Owner | repository owner (@mikegtech) |
| Recorded at | 2026-08-15 |

### Status

**`AUTHORIZED`**

The authority names the landing exactly and is not narrower than it. The
constraints are honoured: ADR-0014 was authored `Proposed` and no existing status line
changes; no module, set, or catalog entry is added; U7 is untouched and is cited
as the block.

---

## Landing Plan

| Landing | Ships | Authority posture | Completion condition |
|---|---|---|---|
| PR-1 | ADR-0014, the architecture document, both indexes, the root `AGENTS.md` rule, this change | `AUTHORIZED` | scaffold and aggregate checks pass; U7 untouched; no ADR status changed |

---

# PR-1 — The promotion rule

## Completion Definition

The rule is canonically stated, both indexes resolve, the obligation is in the
contract every agent reads, and nothing is authored under it.

## 1. Decide and record

- [x] **1.1 Determine whether an ADR is required**

  **Outcome** — Required. Rules 1–4 and 7 confirm existing practice, but three
  do not: a provider artifact's canonical *scope* (extending an existing
  `AGENTS.md` routing rule to content), the knowledge consequence of ADR-0011,
  and a standing obligation on every future change. Root `AGENTS.md` states that
  the correct output for a rule of that kind is a proposed ADR.

- [x] **1.2 Author ADR-0014 at the next free number, status `Proposed`**

  `docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md`.
  Next free number confirmed against `docs/decisions/` — ADR-0013 is the highest
  on `main` and on the in-flight L4 branch.

- [x] **1.3 Record what follows, without duplicating the ADR**

  `docs/architecture/knowledge-promotion-model.md` — the canonical-home taxonomy
  by KIND of truth, the path, the four-layer table, why not provider skills, and
  what is blocked. Carries the same `Proposed`/non-operative posture.

- [x] **1.4 Update both indexes**

  `docs/decisions/INDEX.md` — the ADR table plus two rows in the "which ADRs
  apply" mapping. `docs/architecture/INDEX.md` — the document table.

## 2. The standing obligation

- [x] **2.1 Add the repository rule to root `AGENTS.md`**

  "When a change or falsification review discovers a durable architectural
  truth, determine whether it must be promoted into canonical architecture and
  portable knowledge rather than leaving it only in the change archive, tests,
  PR discussion, or provider instructions."

  Placed with the knowledge-selection rules it relates to, cross-referencing the
  architecture document rather than restating it, and **explicitly marked
  non-operative** at the time: ADR-0014 was then `Proposed`, and a proposed
  decision must not become binding through a lower-precedence artifact. The
  posture was lifted in §6, on acceptance. The section separates what
  is already true independently of ADR-0014 — provider instruction files are
  adapters, and U7 blocks authoring — from what the proposal would add.

## 3. Verification Net for PR-1

- [x] **3.1 `bash scripts/validate-scaffold.sh`** — index coherence for the new
      ADR and document, and OpenSpec governance structure.
- [x] **3.2 `node scripts/check-knowledge.mjs`** — confirms the knowledge
      specification is untouched: no module, no set, no catalog entry.
- [x] **3.3 `bash scripts/check.sh`** — the aggregate gate.
- [x] **3.4 Confirm U7 is unmodified and no ADR status line changed** — by diff.

## 4. Correction round (post-review)

- [x] **4.1 Proposed does not bind through a lower artifact**

  Root `AGENTS.md` no longer says "two consequences bind now"; the section is
  marked non-operative and states that acceptance is what makes it binding.
  ADR-0014 no longer claims the `AGENTS.md` rule is "the enforcement surface
  today". The architecture document carries an explicit non-operative banner.

- [x] **4.2 Canonical-source model made type-aware**

  Five kinds of durable truth, each with its canonical home: architecture →
  ADRs and `docs/architecture/`; governance, coding-agent obligations and review
  policy → the applicable governed repository contract; human operational
  procedures → `docs/operations/`; normative platform contracts → their
  specification owner; portable agent-facing representation → `knowledge/`, as a
  projection. `knowledge/` is never the sole original for any of them, and every
  module names its governing canonical source. The provider-replacement test is
  restated so it cannot make knowledge an origin.

- [x] **4.3 Unstable PR #82 wording removed**

  No "reached its final state", no round count, and no claim that the identified
  L4 lessons are complete. That landing is cited as evidence the promotion
  problem exists, and its lessons as examples/candidates while it remains under
  falsification.

## 5. Pre-acceptance correction

- [x] **5.1 Projection semantics corrected**

  "Reference, never restate" was too strong: it would have made portable
  knowledge a link index — pointers to documents an agent may not be able to
  open — which defeats the portability the format was chosen for. Replaced by
  the invariant that a projection MAY summarize, subset, transform, reorganize,
  or restate, and MUST name its governing sources, claim no independent
  authority, remain subordinate, and be defective when it materially disagrees.
  The line is authority, not wording. Applied to ADR-0014,
  `knowledge-promotion-model.md`, and this change's spec, design, and assurance.

## 6. Acceptance (C6)

- [x] **6.1 ADR-0014 accepted** — `Proposed` → `Accepted`, 2026-08-15, by the
      repository owner, on explicit authorization. Mechanical: the decision text
      was not rewritten in the acceptance commit.
- [x] **6.2 Index row and acceptance record** — `docs/decisions/INDEX.md`, in the
      format ADR-0012 and ADR-0013 use, recording what was accepted and what was
      NOT: nothing about the knowledge format, and no permission to author.
- [x] **6.3 The obligation made operative** — root `AGENTS.md` drops the
      non-operative posture and keeps the distinction that matters:
      determination is mandatory, promotion is not.
- [x] **6.4 The architecture document made operative** — banner replaced with
      "In force", preserving the separate toolchain block.
- [x] **6.5 OpenSpec artifacts reconciled** — spec, design, assurance, and
      proposal no longer describe ADR-0014 as `Proposed`. The
      proposed-decisions-do-not-bind requirement is generalized rather than
      deleted, because ADR-0015 is `Proposed` under it today.
- [x] **6.6 Immutability range corrected** — `AGENTS.md`, `docs/AGENTS.md`, and
      `CLAUDE.md` said ADR-0001 … ADR-0012 are accepted and immutable. That
      already omitted ADR-0013; accepting ADR-0014 made the gap load-bearing,
      since the ADR-0015 migration turns on ADR-0014 being immutable.
- [x] **6.7 Left alone deliberately** — ADR-0015 stays `Proposed`, U7 stays
      open, no `blockedByU7` migration, no knowledge authored, no toolchain.

## PR-1 Completion Gate

- [x] ADR-0014 exists and carries every section `docs/AGENTS.md` requires. It
      was authored `Proposed`; acceptance came later, in its own commit (§6).
- [x] No accepted ADR is edited; no status line changes.
- [x] *(at the time of this landing)* `unresolved-decisions.md` unmodified; U7 open and cited as
      the block on authoring.
- [x] No knowledge module, set, or catalog entry is added.
- [x] No `skills/` directory and no provider-native skill is created.
- [x] Validation above run, with real output reported.
- [x] No artifact in this change presents a `Proposed` consequence as binding.
- [x] No temporal or finality claim about the in-flight L4 landing remains.

## Promotion determination for this change

Required by the rule this change introduces, and answered for it:

| Truth | Kind | Canonical home | Projection outcome |
|---|---|---|---|
| Canonical homes and the promotion path | architecture | ADR-0014 + `knowledge-promotion-model.md` | **project when the toolchain gate opens**, as a `knowledge/platform/` module naming ADR-0014 as its source |
| The four-layer image/profile/knowledge/task split | architecture | ADR-0011 + `knowledge-promotion-model.md` | **project when the toolchain gate opens**, likely into the existing `runner-model` module rather than a new one |
| The determination obligation itself | governance / coding-agent obligation | root `AGENTS.md` | **project when the toolchain gate opens**, as a `knowledge/runbooks/` procedure naming that contract as its source |

Note the third row: its canonical home is the governed contract, **not**
`docs/architecture/` and not the runbook that would project it. That is the
type-aware taxonomy applied to this change's own content.

All three are blocked on the toolchain and none is authored here. This
determination is recorded, not acted on. It was recorded voluntarily, before the
rule requiring it was operative; the rule is operative since ADR-0014's
acceptance on 2026-08-15.

---

# PR-3 — Promote the durable runner architecture learned in PR #82

Appended, not merged into the record above. The sections before this line are the
PR-1 history and are preserved verbatim: this sequence was not known when they
were written, and editing them to look otherwise would falsify the record they
exist to be.

## Implementation Authorization

| | |
|---|---|
| **Granted by** | the repository owner, in the Prompt-3 task contract issued after approving the `blockedByToolchain` discharge at `ec81ad0` |
| **Scope** | promote PR #82's durable architectural lessons into canonical homes under Accepted ADR-0014, as **Proposed** ADRs only |
| **Explicitly withheld** | accepting either ADR; authoring the operative `docs/architecture/` descriptions; authoring knowledge; the lifecycle-evidence tightening; any production runner-control change |

## Evidence inventory

PR [#82](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82) —
**merged** 2026-08-16, merge commit `1bc56e2`.

| Reference | Commit |
|---|---|
| semantic implementation head | `ea310899e03f2a8cef5ad687ade4433fe42aad86` |
| merged completion head | `95346dee0181382ae4d5951424919f946cdeaffb` |

Read at the merged head:

- `openspec/changes/runner-control-orchestration/design.md` — D1, D7, D10, D12,
  D13, D14 (and D7's superseded seal-last detail, read to confirm it *was*
  superseded rather than still operative)
- `openspec/changes/runner-control-orchestration/assurance.md` — invariant
  families for fencing, lifecycle authority, bounded port calls, terminal
  settlement, acquisition uncertainty, acknowledged effects, stable identities,
  replay and conflicting replay, finalization identity, domain vs transaction
  identity, staged publication, cross-path durable uniqueness, and proof quality
- the merged PR title and its change surface (94 files; the orchestration,
  run-state, and ports trees)

**PR #82 is evidence, not a canonical home.** Its specs live under
`openspec/changes/`, and `openspec/specs/` contains no `runner-lifecycle`,
`runner-execution-boundary`, or `runner-gate-orchestration` — so nothing
canonical owns these decisions today. That is the gap ADR-0014 obliges this
change to close.

## Promotion determination

| # | Lesson | Kind of truth | Already fully owned? | New canonical home | New ADR? | Later knowledge projection | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Fencing is enforced at the resource, never by consulting the lease | architecture — decision | **no** | ADR-0017 §6 | **yes** | `platform/runner-model` | RO-INV-48/61, RO-EX-36/84/99/126 |
| 2 | Interruption is complete at the asynchronous port boundary | architecture — decision | **no** | ADR-0017 §2 | **yes** | `platform/runner-model` | D13; Round-6 falsification |
| 3 | Every asynchronous port method has exactly one effect class | architecture — decision | **no** | ADR-0017 §1 | **yes** | `platform/runner-model` | D14, RO-INV-85 |
| 4 | Unknown acknowledgement has an explicit posture; lost ack ≠ effect absent | architecture — decision | **no** | ADR-0017 §4 | **yes** | `platform/runner-model` | RO-INV-86 |
| 5 | Caller-known stable effect identities exist before the call | architecture — decision | **no** | ADR-0017 §4, ADR-0018 §3 | **yes** | `platform/runner-model` | RO-INV-92 |
| 6 | Exact replay vs conflicting replay, decided on canonical content | architecture — decision | **no** | ADR-0018 §3 | **yes** | `platform/runner-model` | RO-INV-93, Round 13 |
| 7 | Acquisition uncertainty is resolved at the resource | architecture — decision | **no** | ADR-0017 §5 | **yes** | `platform/runner-model` | D10, RO-INV-82, RO-EX-149/155 |
| 8 | Terminal settlement is bounded independently of the run clock | architecture — decision | **no** | ADR-0017 §7 | **yes** | `platform/degraded-operation` | D13, RO-INV-89/90 |
| 9 | Attempt outcome vs logical-run terminal state | architecture — decision | **no** | ADR-0018 §1 | **yes** | `platform/runner-model` | D12, RO-INV-88 |
| 10 | Invisible staging + exactly one publication point | architecture — decision | **no** | ADR-0018 §4 | **yes** | `platform/runner-model` | D7, RO-INV-83 |
| 11 | Transaction identity vs durable-fact identity | architecture — decision | **no** | ADR-0018 §2, §5 | **yes** | `platform/runner-model` | RO-INV-94, Round 16 |
| 12 | Ownership identity vs transaction identity | architecture — decision | **no** | ADR-0018 §2, §8 | **yes** | `platform/runner-model` | RO-INV-94 |
| 13 | Ordinary and staged paths share one domain identity authority | architecture — decision | **no** | ADR-0018 §6, §7 | **yes** | `platform/runner-model` | RO-INV-95/96, Rounds 17–18 |
| 14 | Lifecycle authority gates effect progression | architecture — decision | **no** — ADR-0013 §3 owns only adapter-reported terminal as observational input; nothing owned orchestration-side phase authority | **ADR-0017 §8** | **no new ADR** — it belongs in ADR-0017, not a third one | `platform/runner-model` | D1, RO-EX-28/29 |
| 15 | A claimed proof must reach the mechanism it claims to prove | **governance / engineering-review obligation** | **no** | a provider-neutral governed repository contract — `CONTRIBUTING.md` | **no** | `runbooks/review-conventions` | RO-INV-69, RO-MUT-61 |

### Not promoted as requirements

| Item | Why not |
|---|---|
| `RunAborted`, and throwing rather than returning `undefined` | implementation **pattern**. The durable truth is that interruption unwinds to the single owner that knows what the attempt established — ADR-0017 §2. No exception class or language mechanism is required |
| Commit-marker / in-memory MVCC | the reference **implementation** of ADR-0018 §4's atomic-visibility rule. A database transaction or durable marker satisfies it equally; U11 inherits the contract, not the data structure |
| Typestate decomposition into TypeScript types | the reference implementation **technique** for lesson 14, named as such in ADR-0017 §8: it makes unearned state structurally inaccessible. The durable rule is the decision; typestate, phase class names, file decomposition, and module-size limits are not |
| Module-size ratchets and exact file decomposition | engineering implementation policy, not platform architecture |

### Why two ADRs, and why not one or three

**Two, because they answer different questions.** ADR-0017 answers *what
semantics hold when crossing an asynchronous port*; ADR-0018 answers *what
identities exist and who may conclude or publish*. Effect classification could be
adopted without deciding the three identity planes, and the identity planes could
be decided for a system with a different boundary model. They are **dependent,
not inseparable**: ADR-0017 §9 names finalization a distinct class and stops;
ADR-0018 specifies it.

**Not three.** Lesson 14 is a genuine unowned decision, but it is a decision
*about effect progression* — which is ADR-0017's subject — so it lands there as
§8 rather than in a file of its own. Lesson 15 is a different kind of truth
entirely: a governance obligation whose canonical home is a governed repository
contract, not an ADR.

**A correction made before acceptance.** The first draft of this determination
recorded lesson 14 as "partly owned" and left the durable D1 rule stated nowhere
— the table said nothing owned orchestration-side phase authority, and then no
section supplied it. ADR-0017 §8 now does.

### Acceptance dependency and order

```text
ADR-0017  accept first
    ↓  (defines finalization as a distinct effect class)
ADR-0018  accept second
```

Both are **Proposed** in this landing. Neither is self-accepted.

## Deferred to Prompt 3B, after acceptance

- `docs/architecture/effect-boundary-model.md` and
  `docs/architecture/distributed-effect-lifecycle.md` (names indicative)
- updating `docs/architecture/runner-model.md` without duplicating the ADRs
- placing the proof-quality obligation (lesson 15) in its governed contract
- `docs/decisions/INDEX.md` acceptance records

**Deliberately not written now.** A Proposed ADR must not become binding by being
restated as settled architecture in a lower-precedence document.

## Explicitly out of scope here

Accepting either ADR · knowledge authoring (Prompt 4 owns projection) ·
lifecycle-evidence tightening for `Validated`/`Packaged` · any production
runner-control change · link grammar, knowledge admission, packaging, Proof B, or
rollout gates.

## Human acceptance — ADR-0017

| | |
|---|---|
| **Decision** | the repository owner reviewed and **accepted ADR-0017** as written |
| **Reviewed commit** | `f6746beb0742bd4981acae0cb2a3eb12209ed751` |
| **Accepted** | 2026-08-17 by @mikegtech (repository owner) |
| **Scope** | ADR-0017 in full. **ADR-0018 was explicitly excluded** from this acceptance |

**ADR-0018 remains `Proposed`, with its dependency now satisfied.** ADR-0017
defines finalization as a distinct effect class, which is what ADR-0018 builds
on; the ordering constraint is discharged, and the acceptance is not. That
separation was the point of proposing them as two ADRs, and it survives the
first acceptance rather than being consumed by it.

**Still deferred to Prompt 3B, and now blocked only on ADR-0018:**
`docs/architecture/effect-boundary-model.md`,
`docs/architecture/distributed-effect-lifecycle.md`, the `runner-model.md`
update, and placing the proof-quality obligation (lesson 15) in its governed
contract. None may be written while ADR-0018 is Proposed — a lower-precedence
document restating a Proposed decision would make it binding without a decision.

**CI at the accepted commit**, recorded because it is unusual:

```text
Repository checks workflow: PASS
Exact-head attached checks: 5/5 PASS
CodeQL default-setup checks: NOT DISPATCHED for this SHA
No CodeQL failure exists
```

The absence is a missing GitHub-managed dispatch, not a failed result. No commit
was manufactured to trigger it, because that would have separated the reviewed
bytes from the accepted bytes.

## Human acceptance — ADR-0018

| | |
|---|---|
| **Decision** | the repository owner reviewed and **accepted ADR-0018** as written |
| **Reviewed commit** | `f41fee5e75244765f5b214be7e87b35d83d90814` |
| **Accepted** | 2026-08-17 by @mikegtech (repository owner) |
| **Dependency** | ADR-0017, accepted 2026-08-17 — satisfied **before** this acceptance, in that order |

**Prompt 3's promotion is complete.** Both ADRs are Accepted, so the durable
architecture learned in merged PR #82 now has canonical homes and no longer
survives only as the history of one pull request — which is what
[ADR-0014](../../../docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
required.

The two-ADR structure did its job. ADR-0017 was accepted while ADR-0018 was still
Proposed, and during that window nothing restated ADR-0018's staging, atomicity,
custody, cross-path-identity, or concurrency rules as settled. A satisfied
dependency never became an acceptance.

**Now unblocked, and deliberately not done here — Prompt 3B:**

- `docs/architecture/effect-boundary-model.md`
- `docs/architecture/distributed-effect-lifecycle.md`
- the `docs/architecture/runner-model.md` update, without duplicating the ADRs
- placing the proof-quality obligation (lesson 15) in its governed contract —
  a provider-neutral repository contract such as `CONTRIBUTING.md`, not
  `.github/agents/`, not a provider skill, and not knowledge

**Still open after Prompt 3:**

- the acknowledgement disposition of an exact staged-versus-ordinary replay,
  preserved as a non-decision by ADR-0018 §7;
- lifecycle-evidence tightening for `Validated`/`Packaged`, which sits between
  Prompt 3 and Prompt 4;
- projection of these lessons into `knowledge/platform/**`, which is Prompt 4.

**CI at the accepted commit**, recorded because it is unusual:

```text
Repository checks workflow: PASS - 5/5 repo-owned checks
CodeQL Analyze (actions): PASS
CodeQL Analyze (javascript-typescript): PASS
CodeQL Analyze (python): FAILURE - GitHub infrastructure
CodeQL: neutral - downstream of the above
```

The Python job failed inside `Initialize CodeQL`, before analysing anything, with
`HttpError: No server is currently available`. No security finding exists. A
re-run was attempted and refused by GitHub, and no commit was manufactured to
force a fresh dispatch.

---

# PR-3B — Operative runner architecture and proof-quality governance

Appended. The Prompt-1, -2, and -3 records above are untouched.

## Implementation Authorization

| | |
|---|---|
| **Granted by** | the repository owner, in the Prompt-3B task contract issued after accepting ADR-0018 at `4c3c421` |
| **Preconditions** | ADR-0017 and ADR-0018 both `Accepted` (2026-08-17) **before** this landing. A Proposed decision may not be restated as settled architecture, so this work was not startable earlier |
| **Kind** | documentation and governance only |

## What this completes

The [ADR-0014](../../../docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
path, one step further:

```text
implementation / falsification evidence   PR #82
    -> Accepted ADR                       ADR-0017, ADR-0018   (Prompt 3)
    -> docs/architecture description      THIS LANDING         (Prompt 3B)
    -> portable knowledge projection      Prompt 4, NOT STARTED
```

## Files created

| File | Governed primarily by |
|---|---|
| `docs/architecture/effect-boundary-model.md` | ADR-0017 |
| `docs/architecture/distributed-effect-lifecycle.md` | ADR-0018 |

Both describe **what follows** from the accepted decisions and cross-reference
the ADRs for **why**. Neither reproduces the PR #82 design or assurance
artifacts, and neither is a second source of rationale.

## Files reconciled

| File | Correction |
|---|---|
| `docs/architecture/runner-model.md` | governing ADRs now include 0013/0017/0018; status banner separates landed L2–L4 from absent launcher, L9, deployment, and U11; substrate section separates implemented L4 semantics from unimplemented L9 enforcement; cancellation section no longer implies a real process tree is killed today; evidence section distinguishes reference in-memory ports from durable persistence and replaces the seal-last mental model; Open section keeps only genuinely open items |
| `services/runner-control/README.md` | governed-by adds ADR-0017/0018; `finalization/` described as the reference implementation of invisible staging plus one publication transition; "a run ends in one of two governed shapes" replaced with the attempt-versus-terminal distinction; "a run is never abandoned" replaced with the owned-run / lost-ownership distinction; links the two new documents |
| `CONTRIBUTING.md` | **Proof quality** section added — the canonical home for that governance truth |
| `.github/agents/review.agent.md` | **links** the governed rule; does not restate or own it |
| `docs/architecture/INDEX.md` | two new documents registered and placed in reading order after `runner-model.md`; Status rewritten to distinguish landed from unactivated |
| `docs/AGENTS.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/README.md`, `.github/agents/*.md`, `.github/copilot-instructions.md` | accepted/immutable ADR ranges advanced to ADR-0018; "nothing described exists yet" corrected |

## Proof-quality promotion

[ADR-0014](../../../docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)
classifies *"a claimed proof must reach the mechanism it claims to prove"* as
**governance / engineering-review truth**. Its canonical home is therefore
`CONTRIBUTING.md` — a provider-neutral governed repository contract — and **not**
`.github/agents/review.agent.md` as sole owner, not `CLAUDE.md`, not a provider
skill, and not `knowledge/`. The review agent links to it, which is the
type-aware taxonomy applied rather than described.

## Explicit non-goals

No ADR was created or edited · no production code · no knowledge content ·
no lifecycle-evidence tightening for `Validated`/`Packaged` · no Proof B ·
no change to `blockedByToolchain`, `blockedByRollout`, set rollout, or profile
composition · no unresolved decision resolved, U11 included.

**The deliberate non-decision is preserved.** The acknowledgement disposition of
an exact staged-versus-ordinary replay remains open, and
`distributed-effect-lifecycle.md` says so rather than choosing one in an
example.

## Note on branch state

This branch predates the PR #82 merge, so `services/runner-control/src/` here is
the pre-#82 tree. The README correction targets the same lines #82 touched and
folds in #82's `settlement_failed` refinement rather than reverting it; a small
merge conflict in that one bullet is expected and is resolvable in favour of the
text landed here.

## PR-3B integration — merge of `origin/main`

`origin/main` (`1bc56e2`, containing merged PR #82) was merged into this branch
with a **merge commit**. The branch was **not rebased**: the ADR-0017 and
ADR-0018 acceptance records bind to exact historical SHAs (`f6746be`/`0b2be16`
and `f41fee5`/`4c3c421`), and rewriting them would break the one property an
acceptance record exists to hold.

**One conflict, resolved semantically:** `services/runner-control/README.md`, the
"governed shapes" bullet. Neither side was taken mechanically. The resolution
keeps **main's** concrete `settlement_failed` discriminant *and* **Prompt 3B's**
attempt-versus-terminal distinction, including that an attempt which lost
ownership manufactures no verdict for a run it no longer owns.

The merge also made the README's directory table checkable against a real tree
for the first time: `observation/` no longer exists, and `orchestration/`,
`run/`, `run-state/`, `workspace/`, `execution/`, and `conformance/` were
missing. Corrected to the merged tree.

**ADR blobs verified byte-identical after the merge**, by object hash rather than
by inspection:

```text
ADR-0017  724d0b66fee7af34052fe22605423b4ee425965a  == its blob at 0b2be16
ADR-0018  9111b435c0b8f80c02e7d1f257579cdae84c7075  == its blob at 4c3c421
```

## Out-of-scope follow-up — `workflow_dispatch` and the identity ledger

**Not addressed in this landing, deliberately, and no workflow file was edited.**

`.github/workflows/checks.yml` declares `workflow_dispatch`, but under that
trigger the run cannot satisfy `packages/contracts`' identity-ledger conformance
proof: the proof resolves its trusted base with `git merge-base HEAD origin/main`
and is explicitly fail-closed — *"resolve the trusted base commit or throw —
never a silent skip"* — while the dispatch checkout does not provide
`origin/main`. A dispatched run therefore fails with
`fatal: Not a valid object name origin/main`.

This was observed directly: a `workflow_dispatch` run at `b799d0d` failed for
exactly that reason while its other four jobs passed, and every `pull_request`
run of the same tree passed.

The fix is a choice between two, and it is CI work rather than documentation:
fetch enough history when the workflow is dispatched, or stop advertising a
trigger the gate cannot satisfy. The proof itself is correct and should not be
weakened to accommodate a trigger.

---

# PRE-PROMPT-4 — lifecycle status becomes evidence-backed

Appended. Prompt-1/2/3/3B history above is untouched.

## Implementation Authorization

| | |
|---|---|
| **Granted by** | the repository owner, in the pre-Prompt-4 task contract issued after Prompt 3B landed |
| **Starting head** | `efcb3d2b500817831bc9a38da8204119094be7a9` |
| **Kind** | mechanism only — **not** Prompt 4, and no knowledge authored |

```text
Prompt 3B complete at efcb3d2
    ↓
lifecycle-evidence tightening   ← THIS LANDING
    ↓
independent review
    ↓
Prompt 4 — first real module authoring
```

## The gap this closes

A catalog lifecycle status was a coordinated prose/metadata claim. Two edits in
agreement — the catalog and the module README — were indistinguishable from a
fact. Nothing tied `Validated` to admission having run over the real bytes, or
`Packaged` to a package having been produced.

## The mechanism

`scripts/check-knowledge-content.mjs` now **validates a claimed status**. It
never promotes one: a lifecycle transition stays an explicit reviewed catalog
change, and a checker that advanced state would be deciding rather than
verifying.

| Claim | What the repository now establishes |
|---|---|
| `Planned` | no authored source exists |
| `Source-ready` | authored source exists |
| `Validated` | source exists · both gates permit · canonical `admit()` returned `admitted: true` over the exact enumerated bytes |
| `Packaged` | everything above · `packageBundle(proof)` consumed the **opaque admission proof** · an artifact was produced |
| `Published` | still refused — Proof B has no governed producer |

**No duplicate content rule was introduced.** The registry checker still owns
vocabulary, metadata shape, README/catalog correspondence, and the gates; the
package still owns admission, Proof A, prohibited content, OKF rules, and
package identity. The adapter only enumerates bytes, calls the package, and
reports.

## No new catalog digest field — the existing identity was sufficient

Investigated before adding metadata, and proven empirically rather than assumed:

```text
contentReview.sourceDigest  = sha256:<bundleDigest(members)>   (Proof A binding)
admit()                     hashes those same members
packageBundle(proof).digest = bundleDigest(the admitted snapshot)
                            → EQUAL
```

So `sha256:packageBundle(...).digest == contentReview.sourceDigest` already
holds, giving *human review exact-byte binding == admitted byte identity ==
package identity* with **no new field and no package API change**. A second
stored digest would have been a second fact that can drift.

## Falsification correction after review of `30bc1fd`

Two narrow defects were found, and both were mine.

**The packaging proof was still forgeable.** Reporting the artifact's digest,
member count, and manifest size described the artifact; it did not prove one was
produced. A fabrication carrying the catalog's own digest, the real member
array, and a short manifest satisfied every assertion. `checkKnowledgeContent`
now takes a narrow defaulted seam for `packageBundle`, and the proof is a test
that wraps the **real** function: it must be called exactly once, with the
opaque proof `admit()` minted — established by delegating to the real
`packageBundle`, which refuses a handle it did not mint. Any fabricated artifact
now dies because the injected function was never invoked.

**Gate precedence was inverted.** Lifecycle coherence ran before authoring
eligibility, so a `Planned` module with authored source under a closed rollout
reported only *"Planned claims no source"* and never mentioned rollout — the
weaker finding masking the stronger one, and sending a reader to fix the catalog
status when the real repair is that the module was never eligible to be
authored. Eligibility now precedes lifecycle evidence whenever source exists. A
no-source claim is still judged directly: there is no authored act to gate.

## Two surviving mutants, and what each meant

**M3 exposed a circular proof of mine.** The packaging test asserted the
reported digest equalled the reviewed digest — which a fabricated
`{ digest: <the catalog's own claim> }` satisfies without packaging anything.
The evidence now includes the member count and manifest size taken **from the
artifact**, which a fabrication cannot produce. M3 dies, including a stronger
version of the fake that supplies `members` and `manifest()`.

**M6 survives, and is reported rather than hidden.** Disabling the
package-identity-equality guard kills no test, because the guard is unreachable
through the public API: admission already refuses via
`attestation.digest.binding` when the reviewed digest does not match the bytes,
and package identity is computed from the members `admit` hashed. It is retained
as the assertion that would fail first if package identity were ever decoupled
from admitted identity, and the code says exactly that.

## Out of scope, still open

`workflow_dispatch` does not guarantee the git ancestry the identity-ledger
conformance proof requires. **No workflow file edited here** — see the PR-3B
integration section above.

## Live state — unchanged by this landing

17 modules `Planned` · 6 sets `Planned` · 0 authored source · 0 packaged
artifacts · `blockedByToolchain` false 23/23 · rollout untouched · `Published`
unreachable.
