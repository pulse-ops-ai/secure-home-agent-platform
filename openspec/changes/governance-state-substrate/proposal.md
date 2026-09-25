# Change Proposal: governance-state-substrate

## Narrow projection-preparation correction

The owner authorizes the D7.3a implementation-contract correction separately
from paused activation PR #131. It composes complete frozen-candidate validation
and activation-base freshness before exposing shared derivation, preserving
ordinary raw-seed refusal and owner attestation requirements. Its design/diff
and byte-parity proof require independent review before activation resumes.
Only mechanical planning bindings are refreshed; governance primitives, common
S, archive M, consumer scope and accepted ADR bytes remain unchanged. This is
not a new architectural decision, activation, or authorization for PR #101.

## Current PR-2 implementation — exact-S owner authorization

ADR-0023 and ADR-0024 were Accepted together, dated 2026-09-19, by PR #130.
Its durable merge is S `c82fda72927464d813ec769aee53f4079ebe3b20`, retaining
the original pair commit `fc7d44ff48de015afd14faa7836fe11c58c457aa`.
The bridge `pre-registry-adr-pair-v1` is permanently consumed/expired. Both subject envelopes
retain pre-transition ADR-0021 RFC 3339 evidence from the one joint owner act.
See the [receipt](bridge-evidence.json), [source/process record](bridge-verification.md)
and [current authority](tasks.md#current-exact-s-pr-2-implementation-authorization).

D12/T temporal architecture is no longer contingent on ADR acceptance.
The later exact-S owner instruction now authorizes T.1–T.7 preparation in
existing draft PR #124. PR #101 remains untouched, ADR-0020 Proposed, U4 open
and GATE-U4 unsatisfied. Canonical state, real genesis attestation, projection
activation and PR-3/PR-4 remain excluded.

Independent PR-2 review is still required; PR #124 stays draft and is not
merged by this task. Common genesis source is exact S; archive-stage M remains
`83e6cd8fa7d2d05ab246a39de039129b4056966d` for L4/L5/L7 at their exact roots.

Promotion determination: no new architectural meaning is introduced by this
implementation. The accepted ADRs own the decisions; planning remains subordinate.
No portable knowledge or generated governance projection is authorized here.

## Historical bootstrap bridge amendment (PR #129) — proposal-epoch record

The following two sections retain the proposal epochs' scope and status
language as history only. Their former "current"/"Proposed" wording does not
describe this acceptance target or override the current boundary above.

[ADR-0024](../../../docs/decisions/ADR-0024-permit-one-atomic-pre-registry-governance-acceptance-bridge.md)
proposes one atomic pre-registry ADR-0024 + ADR-0023 acceptance bridge. It
partially refines ADR-0021 §12 and the dependent pre-registry acceptance
boundary, not ADR-0021 as a whole. Both new ADRs remain **Proposed and
non-operative**; ADR-0020 remains Proposed. ADR-0021 is Accepted and unchanged.

The bootstrap-legality argument must be independently reviewed before any
future joint owner act. Section 12 permits defining a bounded exception; it
does not make this proposal acceptance authority. The proposed exception is
selected and consumed only by one exact joint acceptance, with no Accepted-but-
unused bridge state. Separate RFC 3339 human evidence for both subjects uses
the pre-transition contract, retained after decisionDate semantics take effect.
No bridge checker or receipt instance is implemented here.

Current scope is one new Proposed ADR, the byte-preserving ADR-0023 filename
rename and necessary links/Proposed-set mirrors, and D13/spec/assurance/B
planning. The three manual current-state mirrors (root `AGENTS.md`,
`docs/AGENTS.md`, `docs/README.md`) receive only the required Proposed-set
correction; no unrelated stale tooling prose is changed. Existing acceptance
records, Accepted ADRs, runtime/executable governance code and archives are
untouched. PR #124 and its candidate remain frozen; PR #101 is untouched.
Neither this proposal nor the future bridge acceptance selects implementation
authority, creates canonical state, regenerates a candidate or starts PR-3.

The future bridge's actual main target becomes D12.5 source S only after merge,
expiry proof and a separate PR-2 owner refresh. Archive M stays
`83e6cd8fa7d2d05ab246a39de039129b4056966d`. No S or future accepted-byte digest
is selected here. See [design D13](design.md#d13-contingent-one-shot-bootstrap-bridge-adr-0024)
and the [historical proposal-only authority](tasks.md#historical-bootstrap-bridge-proposal-authority--not-acceptance-or-implementation-authority).

Promotion determination: the exception belongs in the Proposed ADR, with
subordinate planning here, not in coding-agent instructions or an unreviewed
manual workaround. No operative architecture/knowledge projection is added.

## Historical temporal amendment (PR #128) — proposal-epoch record

[ADR-0023](../../../docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md)
is **Proposed and non-operative**. It proposes a partial refinement of
ADR-0021 §7a's acceptance/rejection temporal evidence, not whole-ADR
supersession. While it is Proposed, ADR-0021's RFC 3339 contract remains
operative. The explicitly contingent D12/spec/assurance/task additions in this
package describe what could be implemented **only after separate human
acceptance and a later refreshed implementation authorization**. They do not
silently replace the operative requirements elsewhere in this package.

The historical audit at PR-2A merge
`83e6cd8fa7d2d05ab246a39de039129b4056966d` contains 21 Accepted ADRs with exact
transition objects: 20 encoded committer timestamps share the human date and
ADR-0022's encodes the following UTC day. There are no Rejected ADRs or missing
transitions.
The corpus disproves a general date-equality rule; ADR-0022 is a positive case,
not an exception. The proposed ADR owns the rationale and exact historical
examples; [design D12](design.md#d12-contingent-decision-date-amendment-adr-0023)
owns the subordinate evidence/extraction plan. `gitCommitterAt` is encoded Git
metadata, not proof of actual recording time; `committerUtcDateDiffers` and the
generic disposition describe date divergence, not proven recording latency.
ADR-0022's separate GitHub evidence is case-specific, not a universal Git rule.

This proposal changes only one new Proposed ADR, its minimal decision-index
registration, and this change's five planning artifacts. It changes no accepted
ADR, historical acceptance record, script, fixture, candidate, digest, archive,
canonical registry, CI gate, or runtime. PR #124 remains frozen/paused at the
temporal-semantics boundary; PR-3 and PR-4 remain unauthorized and PR #101 is
untouched. The current proposal-only authority is recorded in
[tasks.md](tasks.md#historical-temporal-proposal-authority--not-implementation-authority).

Promotion determination: this durable precision/authority distinction belongs
in the proposed ADR, not only the extraction audit. No portable knowledge or
operative architecture projection is authored before separate acceptance.

## Why

Mutable cross-cutting governance facts are duplicated as hand-maintained prose
across the repository. Accepted [ADR-0021](../../../docs/decisions/ADR-0021-establish-machine-readable-governance-state.md)
decides the contract that ends that duplication. GitHub issue #106 authorizes
implementing it. This change is the planning contract for that implementation.

The defect is measured, not asserted. At `origin/main`
`eb6e24806cb76898e74f16208ab40587313c126a`:

| Duplicated fact | Live markdown surfaces restating it |
| --- | --- |
| The accepted-ADR range | 10 |
| How many of U1–U11 are closed | 10 |
| U4's own state | 10 |
| U7 / U11 state | 18 / 17 |
| Runner layer and gate sequencing | 27 |
| **Distinct live surfaces carrying at least one of these** | **50** |

PR #101 exposed the mechanism. It is a single ADR acceptance, and it required
hand-editing roughly twenty-two files to keep those facts consistent. Four of
its five review rounds were a *derived* fact someone had typed by hand: the
accepted range, the closed-item count, U4's state in fifteen places, and the
claim that L9 "needs its own task contract" while omitting that `L9` also
requires `L8`. The remediation for that last finding added three new
hand-written copies of `L9 ← L8 + GATE-U4`, a fact that until then lived only
in an archived planning artifact. The repair reproduced the defect.

The repository has already solved this problem twice, in other domains, and
those solutions work:

- `knowledge/catalog.json` with `check-knowledge.mjs` owns per-module status
  and eligibility. Prose mentions its flags 144 times and restates a module's
  status **zero** times.
- `deploy/images/image-lock.yaml` with `check-images.mjs` owns image identity.

Governance state is the only cross-cutting domain that never received the same
treatment.

## Problem

**What happens today.** Every ADR acceptance and every U-item closure requires
a manual fan-out across up to 50 surfaces. Nothing mechanically detects a
missed surface, so drift is found by human review, one round at a time, or not
at all.

**Why it recurs.** The duplicated values are *derived* — counts, ranges,
resolution status, gate satisfaction, blocker lists. They are conclusions about
primitive facts, and they are being authored by hand in many places at once.
Two hand-maintained copies of one conclusion will diverge; fifty will diverge
faster than review can correct them.

**What should be possible instead.** One machine-readable authority owns the
primitive facts. Every conclusion is derived by one model. Human-facing tables
are generated projections with byte-for-byte verification, and every other
document points at the authority instead of copying it.

**Who is affected.** Every agent and human reading repository instructions;
every reviewer of a governance transition; and every future ADR acceptance,
of which at least one — ADR-0020 — is already open.

**Consequence of leaving it.** ADR-0021 §12 names the ADR-0020 acceptance as
the first transition that should run on the new mechanism. Accepting ADR-0020
under the current mechanism would repeat the twenty-two-file fan-out, cement
another transition through the process that produces these review rounds, and
add surfaces the substrate must later migrate.

## Proposed Capability

After the implementation this change plans, the repository will have:

- **One authored authority** for primitive mutable governance facts, at the
  root `governance/` domain, with a closed schema and canonical
  representation.
- **One derivation model** that computes every conclusion — resolution, gate
  satisfaction, counts, prerequisite readiness, blocker explanations — and
  refuses rather than guessing when its input is ambiguous.
- **Two validators over that one model**: a current-revision checker and a
  two-revision history checker, so that neither a malformed present state nor a
  quietly weakened past one can pass.
- **Deterministic generated projections** with registered markers and a
  byte-for-byte `--check` mode, plus a read-only query interface that reports
  delivery, readiness, and authorization assessment as separate axes and never
  returns `AUTHORIZED`.

### Why the registry alone is not the fix

Adding `governance/state.json` while leaving the prose copies in place would
create a **fifty-first coequal surface**. Two authored sources for one fact is
the defect being removed, not a migration step toward removing it; a reader
encountering a disagreement would have no rule for which one wins, and the
repository would have gained a file and lost nothing.

ADR-0021 §2.4 states this directly: keeping a hand-authored copy beside the
projection is explicitly not a compatibility mode. The deletion of the copies —
by generation into registered regions, or by replacement with a stable pointer
— is the part that removes the defect. The registry exists so that generation
and the checker have a single thing to be right about.

### Why the substrate lands before PR #101

PR #101 is the ADR-0020 acceptance. ADR-0021 §12 sequences the substrate at
steps 3–6 and PR #101 at steps 7–9, for three reasons this change adopts:

1. **PR #101 is the migration's proof, not its casualty.** Under the substrate,
   its acceptance becomes one registry transition — `ADR-0020 Proposed ->
   Accepted` — with U4 resolution, gate satisfaction, counts and the L9 blocker
   explanation regenerated. Landing it first would consume the best available
   demonstration and prove nothing about the mechanism.
2. **It would enlarge the migration.** Every surface PR #101 edits by hand is a
   surface the substrate must subsequently reconcile.
3. **ADR-0020's obligation F5 requires the accepting change to reconcile five
   named documents.** Mechanical reconciliation satisfies that obligation
   literally — those documents are still reconciled in the accepting change —
   while hand-editing them one more time does not advance the migration.

PR #101 is therefore a **future consumer**. This change does not modify,
rebase, narrow, or merge it.

### Implementation phases and migration order

Three landings, in this order, with **one** migration moment:

| Landing | Ships | Canonical `state.json`? |
| --- | --- | --- |
| **PR-1** | model, strict reader, collection canonicalization, current-revision checker, proof net | **no** — fixtures only |
| **PR-2** | history checker, renderer, query, genesis machinery, **candidate** seed at a fixture path, proof net | **no** — candidate only |
| **PR-3** | **atomic activation** | **first appearance** |

PR-3 is indivisible. It contains the canonical registry, its genesis
attestation and source manifest, every generated region **together with the
deletion of the hand-authored copies those regions replace**, stable pointers
for every enumerated consumer, prohibited-copy enforcement, current-revision
validation, **history validation**, scaffold coverage, and the human transition
of the external program index.

Two orderings are prohibited, and the plan is shaped around avoiding them:

1. **The registry must not appear before the copies go.** No mechanism makes a
   file at the canonical authoritative path non-authoritative; "inert" would be
   a description, not a property.
2. **The registry must not become authoritative before it is protected.** If
   history validation arrived later, an intervening change could mutate an
   accepted lifecycle, accepted bytes, a gate predicate, `runner/L9`'s
   prerequisites,
   issue #57's anchor, or terminal completion evidence. The current-revision
   checker would accept the internally valid result, and once history was
   enabled that corrupted snapshot would already be the base — undetectable
   retrospectively.

Rolling back PR-3 removes the registry, the regions, and the pointers together.

### Primitive versus derived

This boundary is the substance of the design, so the proposal states it
plainly.

| | Primitive — authored in the registry | Derived — computed, never authored |
| --- | --- | --- |
| Decisions | ADR identity, canonical path, title, lifecycle, proposal date, acceptance/rejection evidence, reviewed identity, accepted-byte SHA-256, `resolves`, `supersedes` | accepted counts, accepted ranges, `isCurrent`, `isImmutable`, "which ADRs apply" status columns |
| Questions | U identity, canonical anchor, title, governed severity | whether a question is resolved, by whom, how many are resolved |
| Gates | the named predicate and its source references | whether the gate is satisfied, and the explanation chain |
| Landings | identity, kind, prerequisite set, authority anchor, delivery lifecycle, completion-policy identity and evidence | prerequisite readiness, unsatisfied prerequisites, blocker explanations, authorization assessment |

A question record carries no authored `resolved` boolean; a gate record carries
no authored `satisfied` boolean; a landing carries no authored `blockedOn`.
Storing both a relationship and its conclusion is precisely how the two drift.

## Scope

### In scope

The **planning contract only**: this change authors `proposal.md`,
`specs/governance-state/spec.md`, `design.md`, `assurance.md`, and `tasks.md`
under `openspec/changes/governance-state-substrate/`.

It defines the normative behavior, the design, the assurance plan, and the
dependency-ordered task decomposition for the substrate described by ADR-0021,
covering: the registry schema and canonical representation; the decision,
question, gate and landing lifecycles; completion policies; acceptance and
genesis attestations; current-revision and two-revision validation; rendering
and projection registration; the query contract; the genesis seed; and the
migration of existing prose consumers.

### Out of scope

- **All implementation.** No `governance/` directory, no `state.json`, no
  scripts, no Python conformance tests, no CI change, and no migration of any
  prose consumer is performed by this change. Phase 1 of issue #106 is the
  planning contract; execution of the implementation tasks requires a separate
  explicit release.
- **Any governance transition.** ADR-0020 is not accepted, U4 is not resolved,
  GATE-U4 is not satisfied, no landing lifecycle moves.
- **PR #101.** Not modified, rebased, narrowed, closed, or merged.
- **Any accepted ADR.** ADR-0021 is `Accepted` and immutable; this change reads
  it and does not edit it. No ADR is created, and none is returned to
  `Proposed`.
- **`openspec/config.yaml`.** Recorded as a migration target and a named
  regression case; not edited here.
- **Other machine-readable authorities.** `knowledge/catalog.json`,
  `knowledge/set-releases.json`, `deploy/images/image-lock.yaml`, workspace
  layering, execution profiles and runtime evidence keep their own state.
- **L8 and L9.** Neither is implemented, authorized, or made ready.
- **Any locally consumable authorization grant.** Version one is permanently
  non-authorizing (ADR-0021 §3E).

## Affected Areas

| Area | Effect of the planned implementation |
| --- | --- |
| `governance/` (new root domain) | `state.json` authored authority, generated `STATE.md`, `README.md` |
| `scripts/` | current-revision checker, history checker, renderer, query command |
| `tests/` | `tests/test_governance_state.py` conformance suite |
| `docs/decisions/INDEX.md` | lifecycle portions become generated regions |
| `docs/architecture/unresolved-decisions.md` | summary table and resolution banners become generated regions |
| Agent instruction files, READMEs, service docs | mutable status text becomes stable references |
| `openspec/config.yaml` | generated region or pointer; explicit regression case |
| `.github/workflows/` | governance validation in the unconditional governance job |
| `scripts/validate-scaffold.sh` | structural coverage of the `governance/` domain |
| `openspec/changes/governance-state-substrate/` | this change's artifacts |

This is impact discovery for the planned implementation. **This change creates
only the last row.**

## Governance

Governing ADRs, from the `docs/decisions/INDEX.md` "which ADRs apply" table:

- **[ADR-0021](../../../docs/decisions/ADR-0021-establish-machine-readable-governance-state.md)** —
  the architecture contract being implemented. It decides the root domain, the
  primitive fact families, the derived-state rules, ADR header and
  accepted-byte immutability, relationship provenance and bootstrap proof, both
  validators, projections and references, the query contract, the bootstrap
  sequence, and the scope boundaries of the implementation. `Accepted`,
  immutable, and not edited by this change.
- **[ADR-0014](../../../docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)** —
  one canonical home with subordinate projections; the principle the generated
  regions apply.
- **[ADR-0019](../../../docs/decisions/ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md)** —
  immutable records, one authority, and the two-revision succession precedent
  the history checker follows.
- **[ADR-0012](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)** —
  the implementation stack and repository tooling conventions the future
  scripts must obey.
- **[ADR-0001](../../../docs/decisions/ADR-0001-adopt-security-first-architecture.md)** —
  repository-wide authority and acceptance boundaries; the reason the registry
  is permanently non-authorizing.

**Depends on U1–U11:** `none`. This change depends on no unresolved decision.
It does not touch U4 or any other item, and requires no ADR status change.

This change proposes **no ADR status change**. Amending or reversing an
accepted ADR requires a new superseding ADR through its own human review.

### Genesis state this change preserves

Every artifact in this change is authored against, and must preserve, the
governance state at `origin/main` `eb6e248`:

- ADR-0001 through ADR-0019 — `Accepted`
- **ADR-0020 — `Proposed`**
- ADR-0021 — `Accepted`
- **U4 — open**
- **GATE-U4 — unsatisfied**
- L8 — outstanding
- L9 prerequisites — `L8 + GATE-U4`
- L9 external authority anchor — GitHub issue #57
- L9 prerequisite readiness — `NotReady`
- No implementation authorization is inferred from registry state, issue
  existence, accepted ADRs, or satisfied prerequisites.

The accepted set is deliberately **non-contiguous** — ADR-0001 through
ADR-0019 and ADR-0021 — and no artifact may compress it into a continuous
range (ADR-0021 §12 step 2).

## Trust / Security / Data Considerations

- **Authorization.** Directly relevant, and the reason for the strictest
  boundary in this change: the registry is permanently non-authorizing. It
  records typed references and evidence, never a locally consumable grant, and
  the query never returns `AUTHORIZED`. Readiness is not permission.
- **Reconciliation and readiness authority.** This is the change's subject.
  A defect here produces a confidently wrong governance answer, which is worse
  than the current visibly-inconsistent prose.
- **Evidence integrity.** Accepted ADR bytes, acceptance attestations,
  completion attestations, and the genesis attestation are digest-bound. The
  non-self-referential preimage protocol exists so no record proves itself.
- **Review and materialization machinery.** Generated projections and the
  history checker become part of the merge gate.
- **Runtime isolation.** Not applicable and deliberately so: no runtime or
  household operation may depend on the governance tooling being available
  (ADR-0021 §13).
- **Authentication, PII, encryption, persistence migrations, transactions,
  public package contracts, deployment.** Not applicable. The substrate is
  repository tooling over checked-in files, offline and network-free.

## Existing Evidence

- **Accepted architecture:**
  `docs/decisions/ADR-0021-establish-machine-readable-governance-state.md`,
  SHA-256 `0db0b5b7d3342b13b2f23602d3f7017f993705410d3e9a9966b1577cfd8cd66a`.
- **External authority:** GitHub issue #106, *Implement ADR-0021
  governance-state substrate and migrate mutable governance projections*.
- **Base revision:** `origin/main` `eb6e24806cb76898e74f16208ab40587313c126a`,
  the merge of PR #105 which accepted ADR-0021.
- **The defect's demonstration:** PR #101, open and draft at
  `559d78cc32cc40f8eaa7aba15a961554f3033b43`; its review history is the
  evidence that derived facts hand-written across many surfaces drift.
- **Working precedents:** `knowledge/catalog.json` +
  `scripts/check-knowledge.mjs`; `knowledge/set-releases.json` +
  `scripts/check-release-history.mjs`; `deploy/images/image-lock.yaml` +
  `scripts/check-images.mjs`.
- **Genesis L6 spike evidence:** `docs/spikes/l6-copilot-cli/`, manifest
  `MANIFEST.sha256` = `db7fdc1746dad6a481be295f32125353a07f3edb6e1b13add689648f23fec984`,
  findings SHA-256
  `f9bb9082da596b264f569c47ebd33eee117cc10663f2ee5c0c7522371abde592`,
  authority issue #54, delivery PR #73, merged commit
  `e0e8b786201d3e92bbe05f286ae55b9e002c4109` (ADR-0021 §3 D.1).
- **The unstructured sequencing fact:** `L9 ← L8 + GATE-U4`, whose only
  original home is
  `openspec/changes/archive/2026-08-09-runner-baseline-adoption/tasks.md`.
- **A real source disagreement the seed must resolve, not paper over.** The
  external program index states `L5 — next runner landing` and
  `L7 — waits on L5`, and issues #53 and #55 are open — while the repository
  records both L5 image lineage and L7 adapters as landed. The seed therefore
  establishes delivery lifecycle from **repository evidence**; issue prose and
  issue open/closed state are anchors and mirrors, never delivery evidence. The
  disagreement is recorded in the genesis source manifest with a human
  disposition and named by the bootstrap attestation.

## Dependencies

**Already implemented.**

- ADR-0021 is accepted and immutable at `eb6e248`.
- The final manual reconciliation required by ADR-0021 §12 step 2 landed with
  PR #105, so the pre-registry sources the seed reconciles against are current.
- Node and the repository script conventions used by the existing checkers.

**Accepted but not yet implemented.**

- Nothing in this change depends on another unimplemented accepted change.

**External.**

- GitHub issue #106 as the implementation authority. Its existence does not
  authorize execution of any task in this change; phase release is a separate
  explicit act.
- GitHub issues #57, #54, #56 and PR #73 exist as typed references and evidence
  sources, never as local authorization.

## Success

The implementation this change plans is successful when a governance
transition is a **small registry edit with derived consequences**, and the
repository can prove it:

- One authored source owns each primitive governance fact, and no conclusion is
  authored anywhere.
- A hand-maintained ADR range, resolved count, U-item status list, or runner
  blocker summary reintroduced into a registered consumer **fails the gate**
  rather than being caught by a reviewer.
- The generated projections are byte-for-byte reproducible from the registry,
  and a hand edit to one of them fails.
- A future ADR-0020 acceptance is one registry transition whose U4, GATE-U4,
  count, table and L9-blocker consequences are all regenerated.
- The query separates delivery, readiness and authorization, and no input makes
  it return `AUTHORIZED`.
- The genesis seed provably changes no operative governance state.

Not "tests pass": the observable outcome is that the fan-out disappears while
the answers stay correct and refusals stay loud.

## Non-Goals

This change must not:

- create `governance/`, `governance/state.json`, or `governance/STATE.md`;
- create `scripts/check-governance-state.mjs`,
  `scripts/check-governance-history.mjs`,
  `scripts/render-governance-state.mjs`, or
  `scripts/query-governance-state.mjs`;
- create `tests/test_governance_state.py`;
- alter CI or `scripts/validate-scaffold.sh`;
- migrate any existing prose consumer, including `openspec/config.yaml`;
- accept ADR-0020, resolve U4, or satisfy GATE-U4;
- implement, authorize, or make ready L8 or L9;
- modify, rebase, narrow, close, or merge PR #101;
- create, modify, or return any ADR to `Proposed`;
- create or update GitHub issues;
- deploy anything or contact any runtime service;
- define a locally consumable authorization-evidence contract — that requires
  its own ADR (ADR-0021 §3E).

## Open Questions

One remains, and it is not trust-critical. Two that the first version deferred
are now decided here, because both would otherwise have been settled while
writing code.

1. **Exact field spelling in `state.json`.** ADR-0021 §3 fixes ownership and
   semantics and explicitly permits refinement of spelling during
   implementation. `design.md` proposes a concrete shape; a reviewed refinement
   inside the decided semantics does not require a new ADR.

**Decided, not deferred:**

- **The closed vocabularies.** `design.md` D2.1 fixes the v1 gate-predicate
  vocabulary at the single name `exactly-one-current-accepted-resolver` — both
  existing gates are resolver gates — and the v1 node kinds at
  `implementation-landing`, `spike-landing`, `gate`.
  Program-node identifiers are namespaced (`runner/L9`), and bare shorthand is
  refused as a dangling reference rather than resolved as an alias.
  Both are identity-bearing rule inputs, so extending either is a reviewed
  schema-version change rather than an implementation liberty.
- **U-item severity.** `design.md` D2.3 includes severity in v1 as an authored
  primitive that is explicitly **rule-free** and **not identity-bearing**: no
  predicate or readiness derivation may consume it, it is included in
  `primitiveDigest`, it is bound by the genesis attestation, and history treats
  it as ordinary mutable data. Excluding it was rejected because the
  unresolved-decision projection renders it, and a generated table cannot render
  a value the registry does not hold. This choice changes the closed schema,
  canonical bytes, the primitive digest, the genesis attestation, history rules,
  and the projection — which is precisely why it is settled before
  implementation rather than at the seed landing.
- **Which surfaces are generated regions rather than pointers.** `design.md`
  D7.2 separates three contracts: the **scan universe** is every tracked file,
  not only Markdown; **inventory rows** cover every discovered governance surface
  plus exact classified exclusions; and an unclassified governance claim
  **fails**. The historical `eb6e248` measurement was 2 generated-region targets, **38**
  stable-pointer consumers — `openspec/config.yaml` among them, listed rather
  than appended by footnote — and 1 retained-semantic-prose row, for **41** live
  consumers; alongside 27 historical records, 26 artifacts of **live,
  unarchived** OpenSpec changes classified on their own merits rather than
  exempted, and 5 non-consumers. This is not the current PR-3 enumeration.
  The frozen candidate inventory now owns current dispositions; D7.2's count
  projection and task 8.4's exact `stable-pointer` path set are mechanically
  checked against it. D7.2b retains exactly four protected PR-101 planning
  surfaces as non-authoritative source-era semantic prose, without editing
  them or treating old planning as a historical-record exemption. D7.2c retains
  three exact-byte-reviewed knowledge sources containing durable semantics,
  not live governance facts. It preserves ADR-0016 module review bindings and
  removes only those three paths from pointer migration; neither module bytes
  nor catalog reviews change. The exact
  activation task union remains an equality constraint, never a glob.
