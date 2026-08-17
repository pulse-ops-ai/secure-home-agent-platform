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
