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

---

# PROMPT 4 — the first portable knowledge module

Appended. The pre-Prompt-4 live-state snapshot above is a record of what was true
when it was written and is deliberately left intact: it said 0 authored source,
and that was correct then.

## 4A — candidate authoring

`platform/runner-model` was chosen rather than a new effect-boundary module: it
already owns *how runs execute and where authority comes from*, so ADR-0017 and
ADR-0018 are additional canonical sources for the **same** module. Four bundle
members were authored beside the specification README, which is not bundle
source. A projection matrix was produced first — canonical fact, governing
source, whether an agent needs it, portable form, and what was deliberately
omitted.

## Human exact-byte review

The repository owner reviewed the candidate and approved the content review as
`human:mikegtech` under `portable-knowledge-prohibited-content-v1`, bound to

```text
sha256:6ded34da42ef0c6c0463a1ad584c5f1a1e9270fafb2596c13ae867613eba7d20
```

The digest was recomputed independently before the attestation was written and
again before commit. No authored byte changed after review.

## 4B — the first Validated module

`Source-ready -> Validated` for that module only, on evidence rather than
assertion: reviewed bytes → attestation bound to their digest → canonical
`admit()` → Proof A → `admitted: true`. Not `Packaged`, though the mechanism can
prove it; not `Published`, which additionally requires a Proof B producer that
does not exist. Landed at `10ffd9a`.

## First-content falsification, found after `10ffd9a`

Independent review approved the projection semantics and found one
**conformance** defect that only real content could expose:

- OKF v0.2 makes `generated.by` **required**, and admission never checked it —
  so the first real module carried production provenance nothing had validated;
- the recorded provenance was not truthful: `generated.by` named the module
  owner and reviewer rather than the agent that actually produced the bytes, and
  `generated.at` was a date padded to midnight.

## 4C Phase A — the mechanism (this section's landing)

`generated.by` is now enforced against the OKF actor convention —
`human:<id>`, `process:<id>`, or `<producer>/<version>` — which is deliberately
**wider** than the owner rule. A tool or process may produce content and does not
thereby become the module owner, which stays `human:<id>`. Both directions are
proven: loosening `owner` to the general vocabulary kills three tests, and
narrowing `generated.by` to humans kills two.

Admission checks **shape, not honesty**. Whether a producer or an instant is
*true* is provenance, established by authoring discipline and human review; a
regular expression can only establish form, and claiming otherwise would be the
overclaim this repository keeps refusing. `knowledge/AGENTS.md` now carries the
authoring rule and keeps the three clocks distinct — `as_of` (factual currency),
`generated.at` (last meaningful edit), `contentReview.at` (the review event).

## 4C Phase B — provenance correction (NOT in this landing)

Correcting `generated.by` and `generated.at` changes source bytes, so it
invalidates `contentReview.sourceDigest` and requires a **new** human content
review. That is the exact-byte binding working, not a defect.

## Authorization for current-state updates

This task contract explicitly authorizes updating the CURRENT-state sections of
PR #83's body and of the repository's guidance. It does **not** authorize
rewriting historical commit or acceptance narrative, and none was rewritten.
Per-module READMEs for modules that remain unauthored still say so, because that
is still true of them.

## 4C Phase B and 4D — the provenance correction landed

Appended after the fact. The Phase-A section above said Phase B was *not in that
landing*, which was true of it; this records what happened next rather than
editing that statement.

### The chain, with both digests

```text
original reviewed bytes          sha256:6ded34da…7d20   reviewed 2026-08-18, landed 10ffd9a
    ↓  provenance defect discovered by independent review
source bytes corrected           generated.by human:mikegtech -> claude-code/2.1.234
                                 generated.at  midnight date -> 2026-08-18T10:43:10Z
    ↓  digest necessarily moves
old Proof A FAILS                attestation.digest.binding, and nothing else
    ↓  human re-reviews the NEW exact bytes
new digest approved              sha256:e738f985…04d0
    ↓
new attestation binds it         contentReview.at 2026-08-18T10:59:26Z
    ↓
admission succeeds again         Validated, re-earned
```

**The first review was never stretched to cover the new bytes.** It failed, it
was replaced, and the failure is the evidence that exact-byte binding works. A
review that survived a byte change would have been the defect.

### What 4D did and did not change

| | |
|---|---|
| renewed | `contentReview.sourceDigest` and `contentReview.at` |
| unchanged | `policy`, `by`, module `status` (`Validated`), `version` (`1.0.0`), and the OKF document `status: draft` |
| **not** done | no packaging, no publication, no set release, no second module, no gate change |

`generated.by` is `claude-code/2.1.234`, established from the running binary
rather than asserted — the tool that actually produced the bytes. The module
owner stays `human:mikegtech`: producing content and being accountable for it
are different facts, which is why the conformance rule was widened for
`generated.by` alone.

Landed at `3caa7bb`, on top of the Phase-A conformance hardening at `7e9694e`.
Neither commit was amended or squashed.

---

# PROMPT 4E — the remaining platform projections

Appended. Prompt 1–4 history above is untouched.

## Implementation Authorization

| | |
|---|---|
| **Granted by** | the repository owner, in the Prompt-4E task contract issued after PR #83 merged |
| **Starting head** | `3bf5892c37dbf309817e85a391b3b5026627f4ca` (main, PR #83 merged) |
| **Branch** | `knowledge/platform-projections` — a new branch, not a continuation of the merged PR-83 branch |

OpenSpec records that authorization; it does not create it.

```text
PR #83 merged on main
    ↓
Prompt 4E — remaining platform projections
    ↓
Cohort A review     ← this section
    ↓
Cohort B review
    ↓
Cohort C review
    ↓
Prompt 4 COMPLETE
```

## Cohort A — five modules, five independent reviews

A cohort is **review convenience only**. It is not one bundle and not one review
identity: every module carries its own source bytes, its own digest, its own
human content review, and earns `Validated` on its own evidence.

| Module | version | digest |
|---|---|---|
| `platform/repository-taxonomy` | 1.0.0 | `sha256:84a84163…e002` |
| `platform/governance` | 1.0.0 | `sha256:d5a4c13d…5dc5` |
| `platform/workspace-conventions` | 1.0.0 | `sha256:82a03e7f…2d0d` |
| `platform/implementation-rules` | 1.0.0 | `sha256:dcb0cc34…f64c` |
| `platform/review-conventions` | 1.0.0 | `sha256:d1dd02d2…00b9` |

Reviewed by `human:mikegtech` under `portable-knowledge-prohibited-content-v1`
at `2026-08-18T17:37:10Z`. Each digest was recomputed and required to equal its
approved value **before** any attestation was written; a mismatch on any one
module would have stopped that module alone.

**A note on the approval itself.** The first approval message carried unfilled
`sha256:<FULL DIGEST>` placeholders. No attestation was written from it — a
review that names no digest cannot be bound to bytes, and the bytes were instead
re-verified as unchanged and the five digests put back for confirmation. The
confirmed approval is what these attestations record.

`generated.by` is `claude-code/2.1.234`, re-established from the running binary
for this cohort rather than carried over from the first module.

## Deliberately not done

No packaging · no publication · no set release · no household or runbook content
· no Proof B producer · no runtime resolver · no gate or rollout change. The
`workflow_dispatch` ancestry defect and the Dependabot advisory remain
out of scope for this PR.

## Cohort A — independent review correction round

The reviewer approved the lifecycle/evidence mechanism and `platform/governance`
semantics, and found a defect **class** rather than an instance.

**Provider adapters were being cited as canonical sources.** ADR-0014 makes
provider-specific instruction surfaces subordinate projections; two catalog
entries named one as a governing source, which would have made a vendor file the
origin of a platform truth. A deterministic registry rule now refuses them, for
modules and sets, by identity rather than shape — `.github/agents/**` is a
provider adapter while `agents/**` is product content, and a pattern loose enough
to catch both would reject the repository's own agent implementations.

The rule found both live occurrences on its first run:
`platform/review-conventions` and `runbooks/repository-validation`. Four mutants,
four deaths — one survived until a set-side fixture existed, because the rule was
tested for modules only.

**The stranded rules were promoted, not deleted.** Four review findings existed
only in the provider adapter, so removing the citation would have left them with
no canonical home. They now sit provider-neutrally in `CONTRIBUTING.md` beside
Proof quality. The profile-is-a-security-change fact uses its real owners,
ADR-0006 §2 and `profiles/README.md`.

**Four modules changed bytes, and their reviews failed as required.** Before any
replacement was written, real admission refused exactly those four on
`attestation.digest.binding` and nothing else, with `platform/governance` and
`platform/runner-model` absent — the prior approvals did not migrate to new
bytes. `platform/governance` changed no byte and keeps its original review.

| Module | old digest | new digest |
|---|---|---|
| `platform/repository-taxonomy` | `84a84163…e002` | `96613fed…61d4` |
| `platform/workspace-conventions` | `82a03e7f…2d0d` | `1aba9b1a…a913` |
| `platform/implementation-rules` | `dcb0cc34…f64c` | `148c9831…57e7` |
| `platform/review-conventions` | `d1dd02d2…00b9` | `04c926a4…dde5` |

Re-reviewed by `human:mikegtech` at `2026-08-18T19:19:44Z`.
`generated.by` is `claude-code/2.1.234`, re-established from the running binary;
`generated.at` on every changed concept is `2026-08-18T18:53:35Z`, the real edit
instant.

**Set state is now derived, not counted.** The old rationale said every selected
module is unversioned, which stopped being true as modules were authored. Each
set's limitation now states how many required members remain unversioned, and no
set is released or versioned — set lifecycle is Prompt 6's.

---

## Prompt 4E — final closure record

The initial `platform/**` corpus is complete. OpenSpec records the work; it does
not authorize it, and nothing below is authority for anything.

Prior sections are unmodified.

### Cohort A — final reviewed identities

| Module | version | reviewed digest |
|---|---|---|
| `platform/repository-taxonomy` | 1.0.0 | `sha256:96613fed5f5f9df78bff3fda37ff7bb8beac0dc10bc292f21b270493696661d4` |
| `platform/governance` | 1.0.0 | `sha256:d5a4c13dab3d6b3eef606b46160bfe54ad0de020534fb537fc566d7a6f125dc5` |
| `platform/workspace-conventions` | 1.0.0 | `sha256:0b3db0030d91021ad5add7a7096047f93aeec99f854440f80c6928b5b99bbf42` |
| `platform/implementation-rules` | 1.0.0 | `sha256:148c98319d0fe2002b0803c62e3aa493dc979e262032c55f753e48f5406857e7` |
| `platform/review-conventions` | 1.0.0 | `sha256:04c926a41596d58ac46edb48a57fc0ddfb5c74e96d174f82eda3bef77024dde5` |

`workspace-conventions` was re-reviewed after a correction round removed a
commit-granularity rule that only a provider adapter stated.

### Cohort B — final reviewed identities

| Module | version | reviewed digest |
|---|---|---|
| `platform/api-contract-conventions` | 1.0.0 | `sha256:7a6d86d0ad5e6f07ae96b05e47c082614ba0910e5ef64fd14f489d8fc0f81cca` |
| `platform/worker-conventions` | 1.0.0 | `sha256:502c3bbd28420d1891e5f0125ad5752db456e39230b6161dd12c07059d311dc7` |

The API module was re-reviewed after a correction restored the canonical
mechanism names its projection had generalised away — Zod, OpenAPI, MCP
allowlisting, and the validated query AST.

### The tenth module, from #83

`platform/runner-model` is frozen at
`sha256:e738f985db0ab56611f5fe3dc40e7324e4a699dd18c8e56adf9f2f87204004d0`
and was not touched by any cohort.

### Cohort C — final corrected reviewed identities

| Module | version | reviewed digest |
|---|---|---|
| `platform/core-operating-model` | 1.0.0 | `sha256:e9644f110c63dfd939fc3569703eaff28251d2c5e6b473d32057e4730e567c7a` |
| `platform/degraded-operation` | 1.0.0 | `sha256:1d4b4c2cf10c0a2749e1bc5b760244dffff9a365094ce817f16817465b52ef3e` |

Both were re-reviewed after a correction round. `core-operating-model` gained
`services/AGENTS.md`, which owns the physical-action rules it was projecting
without a declared source, and stopped collapsing authorization, safety, and live
state into one word. `degraded-operation` restored the second half of ADR-0009's
`CONTINUE` condition — absence of physical risk alone does not earn it — and
narrowed a prohibition that had overreached into governance: a run must not infer
or implement a bounded-authority mechanism from this module, but proposing one
through a governed decision record remains a legitimate authorized act.

### Prompt 4 — initial platform corpus COMPLETE

Ten `platform/**` modules are `Validated` at `1.0.0`, each against its own
human-reviewed bytes, each admitted independently.

### Standing state

- No packaging. No publication. No set released.
- **No Proof B producer exists**, so publication is unreachable by design
  (ADR-0016 §5a), and every admitted module reports `proof_b_unavailable`.
- No runtime query resolver; `knowledge/` is not runtime-authoritative.
- `blockedByRollout` still holds `household/**`, `runbooks/**`, and every set.
- Landing: PR #84, branch `knowledge/platform-projections`. The exact head is
  whatever git records for the commit carrying this section — a commit cannot
  contain its own hash, and a stale one would be worse than none.

---

## Prompt 5A — runbook rollout eligibility

**External authorization.** The repository owner explicitly authorized beginning
Prompt 5 on 2026-08-19. OpenSpec records that authorization and its result; it
does not create either, and this section is not authority for anything.

Prompt 1–4 history above is unmodified.

### Why this landing exists

ADR-0016 §7a says runbooks "are allowlisted individually, never by directory. A
new runbook is ineligible on creation and becomes eligible only when a reviewed
change adds it to the allowlist — so a household-oriented runbook cannot become
eligible because of where it was filed. The allowlist is empty in this ADR;
populating it is a separate reviewed change."

This is that separate reviewed change.

The checker could not express it. `blockedByRollout` was derived as
`platform/** → false, everything else → true`, which encoded the accepted
INITIAL state exactly and could represent nothing after it. Flipping three
catalog booleans against that rule would have required weakening the assertion
until the values passed — replacing a reviewed policy with an unchecked field.

### The rule implemented

`knowledge/catalog.json` gains `runbookRolloutAllowlist`, a required array of
exact module IDs. The checker derives each module's expected `blockedByRollout`
and asserts it:

```
platform/**   → false                        (released as a class by ADR acceptance)
runbooks/**   → false only if allowlisted     (per module, never by directory)
everything    → true
```

The allowlist is validated rather than trusted: an entry that names no
registered module, that is not under `runbooks/`, that is a wildcard or
directory, that repeats, or that is not a string, is refused. The derivation
consults the allowlist only for `runbooks/**`, so `household/**` cannot be
released through it even if that validation were bypassed.

### Released for authoring — exactly three

| Module | `blockedByRollout` | `blockedByToolchain` |
|---|---|---|
| `runbooks/repository-validation` | `true` → **`false`** | `false` (unchanged) |
| `runbooks/incident-triage` | `true` → **`false`** | `false` (unchanged) |
| `runbooks/safe-escalation` | `true` → **`false`** | `false` (unchanged) |

All three keep `status: Planned`, `version: null`, `asOf: null`, and carry no
`contentReview`. Their directories remain specification-only.

### Unchanged

- All four `household/**` modules stay `blockedByRollout: true`.
- All six sets stay `blockedByRollout: true`. No set version, release, or
  lifecycle transition.
- The ten `platform/**` reviewed modules are untouched — no bundle byte, digest,
  provenance, version, status, or `contentReview` moved.
- **No knowledge content was authored.** This landing makes three runbooks
  eligible to author; it does not author them.
- No `contentReview`. No packaging. No publication. No Proof B producer. No
  runtime resolver.

Authoring eligibility is not admission: candidate bytes must still pass
admission, and publication remains unreachable while no governed Proof B
producer exists (ADR-0016 §5a).

---

## Prompt 5B — repository-validation runbook

The first portable runbook, and the first knowledge module outside `platform/**`.
OpenSpec records the work and its authorization; it creates neither, and nothing
below is authority for anything.

Prior sections are unmodified.

**External authorization.** The repository owner authorized Prompt 5 on
2026-08-19 and approved beginning 5B on the merged Prompt-5A main.

- Starting main: `1583e6d520a9ccb52f9202521a7977f370d63c89`
- Branch: `feat/repository-validation-runbook`

### Canonical-source corrections made BEFORE authoring

`scripts/README.md` said `check.sh` "exits non-zero on a genuine failure" and
stopped there, leaving the skip-only case unstated — the case that most needs
stating, because it is the one that looks green. It now carries the three exit
codes and says a skip-only run is not a pass. Verified empirically with `uv` off
`PATH`: exit `2`, skip named. **`check.sh` itself is unchanged**; the prose was
made true, not the behaviour.

The same file claimed `check-knowledge.mjs` verifies "no specification directory
holds authored content", false since the platform modules landed. Projecting
from it would have taught a falsehood. Corrected, and
`check-knowledge-content.mjs` — which had no row at all — was given one.

One intended fact was **withheld rather than invented**: the specification said
"read the specific failure, do not re-run hoping". `CONTRIBUTING.md` owns the
first half; neither governing source owns the retry prescription, so it was not
projected and the specification README now states the supported meaning.

### First reviewed identity, since invalidated

`sha256:4a2c138c5f02f726fdff81207e971a20e3639e6b3b0e3b6e6e579b033d5a7e0a`

### Final falsification

Independent review found two overclaims in `meanings.md`:

- the secret-scan row claimed the scan establishes that **no** secret-shaped
  value is present, ignoring the governed exact-line allowlist the mechanism
  actually carries;
- the admission row said the check does not establish that content is "true",
  which invited reading the human content review as a general truth proof. The
  machine check establishes byte admission and attestation binding; it does not
  establish semantic correctness, fidelity to the governing source, or
  continuing freshness after that source changes.

Correcting those bytes **intentionally invalidated the first review**, which is
the digest binding working as designed.

### Final reviewed identity

`runbooks/repository-validation@1.0.0`
`sha256:4469de1dcabc6e34b6605efa46ae656ebfeebb2025918d2d787d3a1dc62515aa`

Derived twice — canonical `bundleDigest()` and an oracle rebuilt from ADR-0015 §6
— and required equal before the replacement attestation was written. Reviewed at
those exact bytes by `human:mikegtech` under
`portable-knowledge-prohibited-content-v1`.

Only `meanings.md` changed in the correction; `index.md`, `procedure.md`, and
`failures.md` are byte-identical to the first reviewed candidate, and their
`generated.at` values are untouched.

### A negative proof that had inverted

`test_a_set_version_that_pins_unversioned_modules_is_rejected` borrowed its
premise from the live catalog. Versioning this runbook left the set it targeted
with every member versioned, so a test whose whole purpose was to REJECT a
phantom pin had quietly become one that accepted a legitimate one. The fixture
now constructs the premise it tests, asserts the specific rule's message rather
than a non-zero exit, and dies when that rule is disabled while its positive
control survives.

### Standing state

- `runbooks/incident-triage` and `runbooks/safe-escalation` **not begun** — they
  carry canonical-source gaps requiring their own preflight.
- No packaging. No publication. No set released.
- No Proof B producer, so publication remains unreachable by design
  (ADR-0016 §5a).
- No runtime query resolver; `knowledge/` is not runtime-authoritative.
- `household/**` and every set remain rollout-blocked.
- The ten Prompt-4 `platform/**` reviewed identities are unchanged.

---

## Prompt 5C-A — canonical source for incident triage and safe escalation

**External authorization.** The repository owner authorized Prompt 5 on
2026-08-19 and authorized this canonical-source landing explicitly. OpenSpec
records the work and its authorization; it creates neither.

- Starting main: `fd42a747e26f73815ef4f2526b35a8af78ef4230`
- Branch: `docs/agent-triage-escalation-contract`

Prior Prompt 1–5B history is unmodified.

### Why this landing exists

Two rollout-eligible runbook specifications declared intended facts whose
canonical owner was, in several cases, the knowledge specification itself. ADR-0014
§2 forbids that: *"A knowledge module or runbook is never the sole original."*
Prompt 5B established the same rule the hard way, by finding a runbook projecting
`check.sh` exit semantics that no prose source stated.

So the source audit ran **before** any bundle byte was authored.

### Source-ownership matrix result

Every retained fact classified **A (already owned)** or **B (derivable
procedure)**. **No fact required a new normative decision**, so **CASE 1** applied
and no ADR was proposed. What was missing was never policy — it was the *order*
in which accepted invariants apply to an agent facing an incident, which had no
canonical home.

Two facts were **narrowed** rather than retained as written:

- *"an `indeterminate` outcome is not retried reflexively"* overstated its
  sources. `services/AGENTS.md` forbids an automatic **inverse**, and
  `effect-boundary-model.md` establishes that a retry preserving effect identity
  is a **replay rather than a second fact** — a governed mechanism, not a
  prohibition. Narrowed to: an agent does not resolve its own uncertainty by
  acting again **on its own authority**, because a re-attempt is a new proposal.
- *"which classes of incident are never agent-handled"* retained the **rule**
  (ADR-0009 §2, §3) and explicitly deferred the **taxonomy**. Household domain
  semantics do not exist and remain rollout-blocked; inventing a vocabulary here
  would freeze household meaning inside a platform contract.

### Canonical source created

`docs/architecture/agent-triage-and-escalation.md`, registered in
`docs/architecture/INDEX.md`.

Placed by ADR-0014 §1: these are architectural invariants and what follows from
them, not repository governance and not a human terminal procedure. It was
deliberately **not** placed under `docs/operations/`, which is for people
operating the deployed platform.

It marks each statement **invariant** or **procedure**, cites the decision that
owns every invariant, and separates six kinds of statement — observation,
interpretation, unknown, attempted action, disposition, proposed next decision.

### A dangling citation found while auditing

Two provider adapters and the pull-request template cited
`services/control-plane/README.md` as the owner of physical-action semantics.
That file is a 39-line package-boundary stub containing no such rule; the actual
owner is `services/AGENTS.md`. All three citations were corrected to the real
owner — adapters reference canonical sources, and a reference to a stub is a
reference to nothing.

Three further citations of that stub remain, for **idempotency** rather than
physical-action semantics: `docs/architecture/runner-model.md`,
`docs/architecture/api-contract-model.md`, and `schemas/action/README.md`. They
are the same defect class and are **reported, not fixed** — establishing where
idempotency is canonically owned needs its own audit, and guessing would repeat
the error this landing exists to correct.

### State

- **No `incident-triage` bundle authored.** **No `safe-escalation` bundle
  authored.** Both directories contain only `README.md`.
- Both remain `Planned`, `version: null`, `asOf: null`, with no `contentReview`.
- Their specification READMEs changed as **metadata only**: governing sources now
  name the canonical contract, two intended facts were narrowed, and the update
  triggers point at the contract.
- No packaging. No publication. No set released. No Proof B producer. No runtime
  resolver.
- `household/**` and every set remain rollout-blocked, unchanged.
- The eleven reviewed module identities are unchanged.
- **Prompt 5C-B not begun.**

### Prompt 5C-A — falsification correction

Independent falsification of the new canonical source found five semantic
overclaims. **CASE 1 remains unchanged: no new normative decision was discovered,
and no ADR is required.** The prior Prompt-5C-A record above is unmodified.

**Sensor observation versus fault interpretation.** The contract said declaring
an instrument faulty *is* discarding live state. Too strong: diagnosing a fault
from evidence does not discard the original observation. Corrected to keep the
two apart — *the sensor reported X* is an observation, *the sensor may be faulty*
is an interpretation of it, and concluding a fault does not delete the reading,
which remains evidence. What ADR-0010 §3 owns is narrower: a reading may not be
ignored or suppressed merely because it conflicts with expectation. Supporting
evidence is illustrative, not a closed grammar, and no diagnostic algorithm is
invented.

**Indeterminate human-exclusivity.** The stop table said only a person can decide
what follows. `effect-boundary-model.md` supports governed resolution postures
and identity-preserving replay, so that overstated the architecture. Corrected to
separate the **procedure** — the agent neither guesses nor independently repeats
the effect, and hands the unresolved disposition over — from the **platform
fact** that the effect may later be resolved by a governed mechanism or remain
explicitly unresolved. The contract no longer claims a human is the only
mechanism able to establish what physically happened.

**Denial retry narrowing.** "Never a reason to try again" created an eternal
no-retry rule the sources do not establish. Narrowed to the intended invariant:
disagreement alone does not authorize resending an **unchanged** denied action to
obtain a different answer. A genuinely new request whose inputs, authorization,
policy, or context have changed is a new proposal and passes every normal
control.

**Invariant → procedure provenance.** "Escalation is a successful outcome" was
labelled *"Invariant, already entailed"* while the source matrix classified it
**B**. Relabelled *"Procedure — a derived consequence, not an ADR statement"*,
and the text now says explicitly that this document composes accepted facts into
a framing no ADR states. Every remaining `Invariant` label was audited against
the matrix; the one at the remediation section is genuinely class A and stands.

**Routing absolute narrowed.** The contract said routing is "never portable
platform knowledge or portable knowledge of any kind". ADR-0010 does not
establish that universal. Narrowed to what is decided: this contract does not
define who is contacted, in what order, or by what means; identities, contact
details, and current availability must not enter these portable runbooks; and
whether some future provider-neutral, non-sensitive, role-based representation
could be portable is **explicitly left open and not designed here**.

**Corrected source-ownership accounting.** Three facts are now distinguished
rather than collapsed:

| Fact | Class |
|---|---|
| `indeterminate` remains `indeterminate` | **A** — already owned |
| the agent stops and hands over on `indeterminate` | **B** — derivable procedure |
| escalation is successful completion of this procedure | **B** — derivable procedure |

Both runbook specifications were aligned with the corrected contract as metadata
only. They remain `Planned`, `version: null`, `asOf: null`, without
`contentReview`, and their directories still contain only `README.md`. No OKF
member was authored.

The three idempotency citations of `services/control-plane/README.md` remain
**deliberately untouched** — the canonical owner has not been audited, and
guessing would repeat the error this landing corrects.

---

## Prompt 5C-B — triage and escalation runbooks

The `runbooks/**` layer is complete. OpenSpec records the work and its
authorization; it creates neither.

- Starting merged main: `9505972f4714aef516b9e0fb8f1864f76acc61a5`
- Branch: `knowledge/triage-escalation-runbooks`

**External authorization.** The repository owner authorized Prompt 5 on
2026-08-19 and authorized 5C-B on the merged 5C-A main.

Prior Prompt 1–5C-A history is unmodified.

### One cohort, two independent modules

The cohort is **review convenience only**. Each module has its own source bytes,
its own bundle digest, its own admission result, and will earn its own
`contentReview`. There is no cohort digest and no shared review identity, and a
finding in one must not move the other.

Proved rather than asserted: mutating one byte of `incident-triage` changed its
digest and left `safe-escalation` byte-identical, and the reverse held in the
other direction. Both digests were restored exactly afterwards.

### Projection matrices completed before authoring

Every portable statement in both candidates traces to
`docs/architecture/agent-triage-and-escalation.md` or to a declared ADR. No
provider adapter, OpenSpec record, or peer knowledge module was used as
provenance.

### Final reviewed identities

| Module | Version | Members | Bytes | Reviewed digest |
|---|---|---:|---:|---|
| `runbooks/incident-triage` | 1.0.0 | 4 | 9776 | `sha256:ab8e4067ab3ddcdb7eb4996dd5656e323bc11c536781baede09d78d08c79b67e` |
| `runbooks/safe-escalation` | 1.0.0 | 3 | 7280 | `sha256:05bc4f62cb50e457ddeb4e15c8b01ccfad8fcde0ac51c939f5f1b932b8da21ad` |

Each derived twice — canonical `bundleDigest()` and an oracle rebuilt from
ADR-0015 §6 — and required equal before either attestation was written. Reviewed
at those exact bytes by `human:mikegtech` under
`portable-knowledge-prohibited-content-v1`, **independently**: two separate
approvals, two separate `contentReview` records, no shared review identity.

Both landed directly `Planned → Validated`; nothing unreviewed was ever committed
as `Source-ready`.

### `stale_after` — candidate-specific metadata, not a rule

Stated precisely, because the earlier phrasing risked reading as policy:

- the repository profile **requires an absolute `stale_after`** date, and the
  toolchain enforces the `YYYY-MM-DD` shape;
- **no global interval is currently governed** — nothing in the repository
  determines how far ahead that date should sit;
- these two modules carry `as_of: 2026-08-20` and `stale_after: 2027-08-20`,
  reviewed and approved by `human:mikegtech` as **module-specific metadata for
  these revisions**, alongside every other byte in them;
- **that approval establishes no repository-wide stale-after default.** That the
  reviewed modules happen to share an `as_of + 1 year` spacing is an observation
  about those modules, not a policy, and a future module must still make and
  justify its own choice.

If the interval should become governed, that is a separate decision this landing
does not make and does not presume.

### State

- Both modules carry their own `contentReview`, bound to their own digest.
- No packaging. No publication. No set release. No set version.
- No Proof B producer, so publication remains unreachable by design.
- No runtime query resolver.
- `household/**` and every set remain rollout-blocked.
- The 11 existing reviewed identities are unchanged.
- **Prompt 6 not begun.**

### Prompt 5C-B — landed-byte review correction

**Prompt 5C-B remains COMPLETE.** Both reviewed module identities were
recomputed before and after this correction and are **unchanged**:

- `runbooks/incident-triage@1.0.0` — `sha256:ab8e4067…b67e`
- `runbooks/safe-escalation@1.0.0` — `sha256:05bc4f62…21ad`

**No bundle byte changed. No `contentReview` changed.** The seven bundle members
have zero diff against the landing commit, and this correction did not trigger a
new exact-byte review.

Final review found two standing-guidance snapshots that the landing itself had
made false — the recurring defect of writing down a state instead of routing to
the thing that records it:

- `knowledge/INDEX.md` claimed every module other than a `Validated`
  `platform/**` one was "still at an earlier lifecycle state", which stopped
  being true the moment `runbooks/**` gained `Validated` modules. It now states
  the durable property — every `Validated` module carries its own review bound to
  its own digest and admits independently — and routes current lifecycle state
  and version to `catalog.json`.
- `knowledge/runbooks/README.md` named which runbook was authored and said the
  others were specification-only. It now states that lifecycle is per module and
  that authored-source presence follows lifecycle state, with `catalog.json`
  authoritative.

The same README's routing exclusion was also **narrowed to the accepted 5C-A
boundary**. It had said routing "belongs to household configuration, not to a
portable document", which is broader than what was decided. It now scopes the
exclusion to these runbooks — who is contacted, in what order, by what means,
plus identities, contact details, and current availability — and records
explicitly that whether a future provider-neutral, non-sensitive, role-based
representation could be portable is deliberately left open and not designed here.

A search-driven sweep across `knowledge/README.md`, `knowledge/INDEX.md`,
`knowledge/runbooks/README.md`, and `knowledge/AGENTS.md` found no further
current-state falsehood. The one remaining "not to a portable document" phrase,
in the `incident-triage` specification README, is scoped to emergency-service
numbers and addresses specifically — accurate, and not a universal routing claim.

---

## Prompt 6A — the knowledge-set release lifecycle (Proposed)

**External authorization.** The repository owner authorized Prompt 6A. OpenSpec
records the work and its authorization; it creates neither, and **ADR-0019 is
`Proposed` — nothing below is operative.**

- Starting main: `be05e2f2c6e576bf0d4e268d42f67bb11e87e3ec`
- Branch: `architecture/knowledge-set-release-lifecycle`

Prior Prompt 1–5C history is unmodified.

### The live six-set baseline

Derived from the merged catalog, not assumed:

| Set | Runner class | Required | Optional | Structurally versionable |
|---|---|---:|---:|---|
| `prepr-review-default` | coding | 6 | 0 | **yes** |
| `implement-local-default` | coding | 7 | 1 | **yes** |
| `architecture-default` | coding | 4 | 1 | **yes** |
| `home-status-default` | household | 4 | 1 | no — 2 required household members unversioned |
| `climate-default` | household | 4 | 2 | no — 2 required + 1 optional unversioned |
| `gridwise-default` | household | 3 | 2 | no — 1 required + 2 optional unversioned |

All six remain `Planned`, `version: null`, `blockedByRollout: true`.
"Structurally versionable" means only that every selected member has a concrete
reviewed identity — never released, rollout-open, published, packaged, or
runtime-usable.

### Current-state drift repaired first (separate commit)

All six set `limitations` carried snapshot counts of unversioned required
members, and **all six were wrong** — the coding sets said three, three, and two
where the truth is zero; the household sets said four, four, and three where the
truth is two, two, and one. They now state the lifecycle reason instead.
`knowledge-selection-model.md` claimed every set still had unversioned required
members, which the module program had falsified.

### Why a new ADR is required

Accepted architecture explicitly left composition lifecycle unsettled, and three
sets are now structurally capable of naming exact identities. The unanswered
questions — what a version identifies, what it pins, where history lives, what
release means, what reopens the gate — would otherwise be answered by accident on
the first release.

One shipped-model defect was found while auditing: `knowledge-selection-model.md`
§4 records `resolvedSetVersion` as differing from the requested version under
task narrowing. **A narrowed composition is not a registered release, so there is
no version to name.** ADR-0019 §11 replaces it with a resolved-manifest digest.

### Proposed ADR

`docs/decisions/ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md`
— **Status: Proposed.** Registered in `docs/decisions/INDEX.md`.

It refines **only** the sentence in ADR-0016 §7a leaving the set rollout
transition undefined. ADR-0016 is not edited, and its module and runbook rollout
decisions are preserved.

### Candidate release table — after acceptance, not now

| Set | Meets proposed preconditions | Blocking facts |
|---|---|---|
| `prepr-review-default` | **candidate** | ADR-0019 unaccepted |
| `implement-local-default` | **candidate** | ADR-0019 unaccepted |
| `architecture-default` | **candidate** | ADR-0019 unaccepted |
| `home-status-default` | blocked | selected household modules unversioned and rollout-blocked |
| `climate-default` | blocked | same |
| `gridwise-default` | blocked | same |

### State

- **No set version assigned. No set released. No `blockedByRollout` flipped.**
- No packaging, no publication, no Proof B producer, no runtime resolver, no
  profile knowledge schema.
- The 13 reviewed module identities are unchanged.
- **ADR-0019 is not accepted. Prompt 6B is not authorized and has not begun.**

### Prompt 6A — falsification correction

**ADR-0019 remains `Proposed`.** The prior 6A record above is unmodified. The
architecture direction was approved; four under-decided seams are now closed, and
the twenty falsification cases were run against the proposal rather than deferred.

**Canonicalization chosen.** §4 previously offered two mechanisms and left the
choice to the accepting review, which is not a decision. One normative
representation is now specified: a canonical line-oriented UTF-8 manifest
`okf-set-release-v1`, modelled on ADR-0015 §6 — fixed field order, `LF` only,
`SP` and `NUL` separators, NFC, every line terminated, booleans as literal
`true`/`false`, integers as shortest decimal, member digests as bare lowercase
64-hex. `required`, `optional`, and `deny` are **sets, not sequences**, and are
sorted by ascending UTF-8 bytes so that reordering a JSON array cannot change
identity. `releaseDigest = sha256(manifest bytes)`. The rejected alternative —
making a committed file's incidental bytes normative — moved to *Alternatives
considered*, because identity would then depend on whatever wrote the file.

**Family and release representation.** §8a and §8b were added. A family row must
not carry `version` or `status`: a mutable row holding "the current release
version" stops representing `1.0.0` the moment `1.1.0` exists, which is the exact
defect the ADR exists to prevent. Both fields leave the family row in 6B; the
family keeps descriptive metadata and candidate policy only. A profile pins
`familyId@releaseVersion` and resolution reads the **release record**, never the
family. `(familyId, version) → releaseDigest` is unique and immutable for all
time, and a version is never reused — not after deprecation, retirement, or
withdrawal.

**Lifecycle is per release.** `Released → Deprecated → Retired` describes a
release, not a family, so `1.0.0 Deprecated` and `1.1.0 Released` coexist with
both manifests byte-identical to their review. State is the only mutable part of
a release record; deprecation and retirement govern **new-request eligibility
only** and never touch identity or evidence. A family has no lifecycle status of
its own — one field cannot describe both a mutable candidate and a set of
immutable revisions.

**One rollout authority.** Family-level `blockedByRollout` ceases to be the
authority; eligibility attaches to a reviewed release. Until 6B migrates the
representation the field stays present and `true`, and is never what authorizes a
release. Two authorities would eventually be resolved by the permissive one.

**Precondition lifecycle corrected.** Requiring exactly `Validated` would have
made a module ineligible *for progressing* to `Packaged` or `Published` — a rule
that punishes the lifecycle for advancing. The precondition is now semantic, with
each current state decided explicitly: `Validated`, `Packaged`, and `Published`
are eligible for a new release; `Planned` and `Source-ready` are not; and
`Deprecated` and `Retired` are **not**, decided rather than left to fall through
— an existing release pinning such a member stays exact, but a new composition
must not adopt what the module program is retiring.

**`releaseReview` made non-circular.** The order is fixed: logical content →
canonical manifest → `releaseDigest` → review binds that digest. The review is
**excluded from the manifest**, so writing it cannot change the digest it
attests. Policy identifier `knowledge-set-release-review-v1`, with its subject
enumerated: exact member identities, the required/optional split, least-context
posture, deny rules, task posture, failure semantics, `maxBytes`,
`maxFreshnessDays`, `runnerClass`, and override authority. Review authority is
stated provider-neutrally, and **no automated producer is claimed** — in
particular this is not ADR-0016's absent Proof B producer.

**Task-delta evidence.** Fields fixed: `requestedSetId`, `requestedSetVersion`,
`requestedSetReleaseDigest`, `taskDelta`, `taskDeltaDigest`,
`resolvedManifestDigest`. No `resolvedSetVersion` is minted. Every
task-added module resolves to an exact `(id, version, digest)`, so two runs of one
base release that saw different context differ in their resolved manifest digest
and nothing hides behind the shared base.

**Twenty-case falsification: 20 PASS, 0 FAIL, no unanswerable case.** Cases 16–20
were added this round. Four ambiguities were found and closed by running them —
the deferred canonicalization choice, the family-versus-release lifecycle
question, the over-tight `Validated` precondition, and the unfixed review
ordering. The cases remain implementation obligations for 6B: an architecture
answer is not a mechanism.

No set version assigned, no set released, no rollout gate moved, no resolver, no
profile schema, no packaging, no publication. ADR-0016 is not edited.
**ADR-0019 is still `Proposed` and human acceptance is still required.**

### Prompt 6A — acceptance-readiness correction

**ADR-0019 remains `Proposed`.** Prior 6A records above are unmodified. One
accepted-ADR representation conflict and five under-specified seams are closed.

**Set-side ADR-0016 refinement scope, stated honestly.** The ADR claimed it
refined only one sentence of §7a. That understated it: §7 also fixes the
*representation* — "`blockedByRollout` is a required boolean on every module
**and set**" — and §7a gives the set-side boolean its meaning. A new §0 states
the real scope. **Every module and runbook decision in ADR-0016 is preserved**:
the per-module gate representation, the `platform/**` class release, the
`household/**` block, the runbook allowlist, and `resolveSet`'s refusal to
deliver a blocked module. **Refined on the set side only:** the family-level
boolean is the legacy pre-release representation, 6B migrates it away from being
an authority, and eligibility thereafter belongs to immutable release records.
ADR-0016 is not edited.

**One rollout authority, and it is not a boolean.** §10 still described
`blockedByRollout: true → false` while §8b had already made release state the
authority — two authorities inside one document. §10 is rewritten: **`Released`
*is* the eligibility**, there is no release-level `blockedByRollout` boolean, and
adding one would recreate the same defect in a new place where state and boolean
could disagree. A candidate that is not a reviewed release is eligible for
nothing, and no family field can make it so.

**`blockedByToolchain` mapped explicitly (§10a).** Module semantics unchanged.
The set-family field is a repository-wide **readiness mirror**, already `false`
after the accepted discharge — neither release identity nor per-release
eligibility, and it never enters the canonical manifest. 6B may retain it as a
non-identity mirror or move the readiness fact to one canonical global location,
but **not both**: two readiness authorities that can disagree are prohibited.

**Deterministic request semantics.** "Should not be newly requested" is not
executable. A state table now fixes it: **Released** may be newly adopted;
**Deprecated** may not be newly adopted but keeps resolving and running for
revisions that already pin it; **Retired** may not service a new run at all.
Historical identity survives all three. The distinction: deprecation restricts
adoption, retirement restricts execution, neither restricts explanation.
Falsification case 17 now cites this rule rather than gesturing at §8.

**Delimiter and version grammar.** The format uses `SP`, `NUL`, and `LF`
structurally, so **no value may contain one** — and there is deliberately **no
escaping scheme**, because an escape mechanism is a second grammar over the same
bytes. A value containing `NUL`, `LF`, or `CR` is **refused**; a `SP`-delimited
scalar contains no ASCII whitespace at all. `release-version := DIGIT+ "."
DIGIT+ "." DIGIT+`, **syntax only, establishing no SemVer meaning**. Module
version strings preserve the exact catalog string so the manifest cannot silently
disagree with what it pins, subject to the same refusals.

**Obligations 16–20 added.** The ADR required all twenty cases to hold
mechanically in 6B while the numbered list stopped at 15. It now runs to 20, plus
two non-scenario obligations: an **independent second implementation** of the
digest, and proof that byte-admissibility refuses a **planted** violation rather
than being read from the code.

**Targeted A–F falsification, answered directly from the ADR:**

| | Question | Answer | Established by |
|---|---|---|---|
| A | can ADR-0016 and ADR-0019 disagree on where a set rollout decision lives? | **no** | §0 scope table |
| B | can a mutable family field authorize a release? | **no** | §0, §10 — "authorizes nothing", "no field on the family can make it so" |
| C | can release state and a release rollout boolean disagree? | **impossible** | §10 — no such boolean exists |
| D | can Deprecated be read two ways? | **no** | §8 state table |
| E | can a field inject a separator and create two readings? | **no** | §4 admissible bytes — refusal, no escaping |
| F | are all 20 architecture cases also 6B mechanical obligations? | **yes** | obligations 1–20 |

No set version, no release, no rollout migration, no runtime work. ADR-0016,
`knowledge/catalog.json`, `scripts/`, `tests/`, modules, and sets are untouched.
**Human acceptance of ADR-0019 is the next step.**

### Prompt 6A — ADR-0019 accepted

**The repository owner accepted ADR-0019 in full on 2026-08-21, at the exact
reviewed commit `43170c76e64917dc91303e544297d177688cc811`.** Prior 6A records
above are unmodified.

The transition is a **status change and its record — nothing else**:

- ADR-0019 `Proposed → Accepted`, carrying the acceptance date and the exact
  accepted commit;
- `docs/decisions/INDEX.md` — status column, an acceptance record beside the
  others, the standing note rewritten from "decides nothing yet" to what
  acceptance does and does not unblock, and the applicability table taught that
  set versioning and release are governed by ADR-0019.

**What acceptance authorizes.** The *shape* of the work, as every accepted ADR
here does. Implementing it still requires its own task contract.

**What acceptance did NOT do**, verified rather than asserted: no set version
assigned, no set released, no rollout gate moved, no release record, no canonical
manifest written, no resolver, no profile knowledge schema, no packaging, no
publication. All six sets remain `Planned`, `version: null`,
`blockedByRollout: true`; `household/**` remains rollout-blocked; the 13 reviewed
module identities are unchanged; ADR-0016 is not edited.

The twenty falsification cases are answered **architecturally**. They remain
**mechanical obligations** for whoever implements this — an architecture answer
is not a mechanism — along with the independent second implementation of the
release digest and the planted-violation test for byte admissibility.

**Prompt 6B is not begun and is not authorized by this acceptance.**
