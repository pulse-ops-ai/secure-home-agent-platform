# Assurance: governance-state-substrate

Pre-implementation proof and verification plan. Derived from
`specs/governance-state/spec.md` and `design.md`. It introduces no product
requirement, and authorizes no implementation.

**Controls reach the real mechanism.** Every control below exercises the shared
model through a real entry point — `check-governance-state.mjs`,
`check-governance-history.mjs`, `render-governance-state.mjs`, or
`query-governance-state.mjs` — over a real fixture. A control that only
exercises a helper, a fixture parser, or a re-implementation of the rule proves
nothing about the mechanism and does not discharge its obligation.

---

## Risk classification

**TRUST-CRITICAL.**

- **Reconciliation and readiness authority.** The substrate becomes the single
  answer to what is accepted, resolved, gated and ready. A defect produces a
  *confidently wrong* governance answer, which is strictly worse than today's
  visibly inconsistent prose: inconsistency invites checking, confidence does
  not.
- **Authorization adjacency.** Readiness sits one inference away from
  permission. The permanent non-authorizing boundary is the highest-value
  invariant here.
- **Evidence integrity.** Accepted bytes, acceptance, completion and genesis
  attestations are digest-bound; a weakened preimage silently destroys the
  immutability guarantee.
- **Review machinery.** Generated projections and the history checker join the
  merge gate; a no-op check is a false green across every future transition.
- **Genesis is unrepeatable.** The seed is the one state with no prior revision
  to check against. Its proof cannot be deferred.

Not applicable: authentication, PII, encryption, persistence migrations,
concurrency, public package contracts, deployment isolation.

---

## Authority-chain analysis

| Link | Identity | What it authorizes | What it does not |
| --- | --- | --- | --- |
| Architecture | ADR-0021, `Accepted`, SHA-256 `0db0b5b7…cd66a` | the contract implemented here | any implementation act |
| External authority | GitHub issue #106 | the implementation phases | execution of any task in this planning PR |
| Base revision | `origin/main` `eb6e24806cb76898e74f16208ab40587313c126a` | the genesis source snapshot | any state transition |
| This change | planning artifacts only | review of the plan | implementation |

**Chain integrity.** ADR-0021 §3E makes the registry permanently
non-authorizing: it records typed references and evidence, and never accepts a
locally consumable grant. Issue #106's existence authorizes the *work*; the
registry never authorizes anything. Nothing in this change infers authorization
from registry state, issue existence, accepted ADRs, or satisfied
prerequisites.

**Phase boundary.** Phase 1 is the planning contract. Implementation execution
requires a separate explicit release; `tasks.md` records `NOT_AUTHORIZED`
accordingly.

---

## Invariants

### Behavioral

- **INV-G01** The registry is the only authored source for the §3 primitive
  fact families.
- **INV-G02** No conclusion is authored anywhere: counts, ranges, resolution,
  gate satisfaction, readiness, and blockers are derived only.
- **INV-G03** One registry revision yields exactly one derived answer.
- **INV-G04** Ambiguous, missing, malformed, or cyclic input is a refusal, never
  an alternate derivation.
- **INV-G05** The model is the sole semantic owner; no entry point, renderer,
  query, or test re-implements a predicate.

### Security / trust

- **INV-G06** No query result, in any form, ever contains `AUTHORIZED`.
- **INV-G07** Prerequisite readiness never implies permission to start.
- **INV-G08** No registry field authorizes L8, L9, deployment, credentials, or
  device access; an authorization-evidence record is an unknown field.
- **INV-G09** External references are never fetched, and never substitute for
  reviewed authority evidence.
- **INV-G10** The checkers perform no network access.

### Data integrity

- **INV-G11** Duplicate JSON keys are rejected before object construction.
- **INV-G12** Unknown fields are rejected, never ignored.
- **INV-G13** `state.json` equals its own canonical serialization byte for byte.
- **INV-G14** Accepted and rejected document bytes are immutable and pinned by
  content SHA-256.
- **INV-G15** Every attestation is excluded from the preimage it attests.
- **INV-G16** Identity-bearing rule inputs are never mutated in place.
- **INV-G17** A question has at most one current resolver.
- **INV-G18** A prerequisite graph containing a cycle produces no readiness
  answer.

### Compatibility

- **INV-G19** Domain-owned authorities — `knowledge/catalog.json`,
  `knowledge/set-releases.json`, `deploy/images/image-lock.yaml`, workspace
  layering, execution profiles, runtime evidence — are never copied into
  governance state.
- **INV-G20** No runtime or household operation depends on the governance
  tooling being available.

### Review / governance

- **INV-G21** Every generated region has a renderer-registered target and
  marker; an unregistered one is an error.
- **INV-G22** `--check` is byte-for-byte, and write mode is a separate
  invocation.
- **INV-G23** The history base is explicit and exclusive; no inferred fallback.
- **INV-G24** Prohibited hand-maintained status claims are refused in the closed
  set of registered consumers.
- **INV-G25** Seeding changes no operative governance state.
- **INV-G26** The accepted set is recorded as the non-contiguous set it is, and
  never compressed into a continuous range.

---

## State-space model

Independent dimensions that materially affect behavior:

| Dimension | Values |
| --- | --- |
| Registry syntax | canonical · valid-but-noncanonical · duplicate-key · malformed · absent |
| Schema conformance | closed-conformant · unknown-field · duplicate-id |
| ADR lifecycle | Proposed · Accepted · Superseded · Rejected |
| Transition legality | legal · illegal · legal-shape-missing-evidence |
| Header mirror | agrees · disagrees · legally-divergent (Superseded) |
| Relationship provenance | mirrored · unmirrored · conflicting-label · absent-source |
| Resolver cardinality | zero · one · many |
| Predicate evaluability | true · false · unevaluable |
| Delivery lifecycle | Planned · InProgress · Complete · Withdrawn |
| Completion evidence | valid · missing · opaque · wrong-policy · manufactured |
| Identity class | local-git-commit present · absent · external · content-sha256 |
| Prerequisite graph | acyclic · cyclic · dangling |
| History base | valid · invalid · missing · not-a-commit |
| Projection | in-sync · drifted · unregistered-target · hand-edited |
| Readiness | Ready · NotReady |

**Meaningful interactions requiring proof** (not the Cartesian product):

- *unevaluable predicate × readiness* — must yield unsatisfied **and** a checker
  failure, not a quiet `NotReady`.
- *Complete lifecycle × invalid completion evidence* — must not satisfy a
  prerequisite; fail closed.
- *legally-divergent header (Superseded) × accepted-byte immutability* — the one
  case where header and registry legally differ, which must not become a
  general escape.
- *byte-correct seed × wrong relationship* — must fail without a prior revision.
- *Ready readiness × authorization assessment* — must never produce
  `AUTHORIZED`.
- *terminal delivery × prospective assessment* — non-applicable, and distinct
  from the historical question.

---

## Decision tables

### T1 — Prerequisite satisfaction

| Kind | Lifecycle | Evidence | Satisfied | Failure class |
| --- | --- | --- | --- | --- |
| landing | Complete | validates | yes | — |
| landing | Complete | missing / opaque | **no** | change-attributable; `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION` |
| landing | Complete | wrong policy | **no** | change-attributable |
| landing | Planned / InProgress / Withdrawn | any | no | — |
| gate | — | predicate true | yes | — |
| gate | — | predicate false | no | — |
| gate | — | unevaluable | **no** | change-attributable; checker fails |

### T2 — Header mirror

| Registry | Header | Bytes match digest | Outcome |
| --- | --- | --- | --- |
| Proposed | Proposed | n/a | pass |
| Proposed | Accepted | n/a | **fail** — smuggled transition |
| Accepted | Accepted | yes | pass |
| Accepted | Accepted | no | **fail** — mutated accepted bytes |
| Accepted | Superseded | any | **fail** — history rewritten |
| Superseded | Accepted | yes | pass — legally divergent |
| Rejected | Rejected | yes | pass |

### T3 — History base

| Base supplied | Readable | Is a commit | Outcome |
| --- | --- | --- | --- |
| yes | yes | yes | compare |
| yes | yes | no | **fail** — no fallback |
| yes | no | — | **fail** — no fallback |
| no | — | — | **fail** — no inference |

### T4 — Authorization assessment

| Readiness | Delivery | Assessment |
| --- | --- | --- |
| NotReady | Planned / InProgress | `PREREQUISITES_NOT_READY` |
| Ready | Planned / InProgress | `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` |
| any | Complete / Withdrawn | non-applicable (`null`); historical answered separately |

No row yields `AUTHORIZED`. An undecidable state is never mapped to success.

---

## Before × after state analysis

| Fact | Before (at `eb6e248`) | After genesis seed | After the future ADR-0020 transition |
| --- | --- | --- | --- |
| ADR-0001…ADR-0019 | Accepted | Accepted (unchanged) | Accepted |
| **ADR-0020** | **Proposed** | **Proposed (unchanged)** | Accepted |
| ADR-0021 | Accepted | Accepted (unchanged) | Accepted |
| Accepted set shape | non-contiguous | non-contiguous | contiguous only if truly so |
| **U4** | **open** | **open (unchanged)** | resolved (derived) |
| **GATE-U4** | **unsatisfied** | **unsatisfied (unchanged)** | satisfied (derived) |
| L8 | outstanding | outstanding (unchanged) | **outstanding** |
| L9 requires | `L8 + GATE-U4` | unchanged | unchanged |
| L9 anchor | issue #57 | unchanged | unchanged |
| L9 readiness | `NotReady` | `NotReady` (unchanged) | **`NotReady`**, unsatisfied `["L8"]` |
| L9 authorization | none inferred | none inferred | **none inferred** |

The middle column is the whole claim of INV-G25: seeding moves nothing. The
right column is a **future** derivation example; this change performs none of
it.

---

## Cross-requirement interactions

- **Closed schema × genesis attestation.** The attestation must bind every
  identity-bearing rule input; a field added later without extending the
  binding would be attested-by-omission. Proof: `ADV-G20`.
- **Header mirror × supersession.** The legal `Superseded`/`Accepted`
  divergence must not generalize into "headers may disagree". Proof: `ADV-G05`,
  `EX-G07`.
- **Derived readiness × non-authorization.** Both are individually simple; the
  dangerous composition is a `Ready` result read as permission. Proof:
  `PROP-G05`, `ADV-G17`.
- **Projection generation × index structural checks.** A generated
  `docs/decisions/INDEX.md` region must still satisfy `validate-scaffold.sh`'s
  bidirectional index rules. Proof: `EX-G14`.
- **History delegation × adapter purity.** If any regression rule leaks into the
  Git adapter, two authorities exist. Proof: `MUT-G06`.
- **Strict reader × every other control.** Duplicate-key acceptance would make
  many downstream proofs vacuous. Proof: `ADV-G01`, `MUT-G01`.

---

## Proof obligations

| Invariant | Proof | Class |
| --- | --- | --- |
| INV-G01, G02 | `EX-G01` authored-conclusion fields rejected | schema validation |
| INV-G03 | `PROP-G01` one revision → one answer | property |
| INV-G04 | `ADV-G09`, `ADV-G12` | hostile |
| INV-G05 | `MUT-G05` re-implemented predicate detected | mutation |
| INV-G06 | `PROP-G05` no output contains `AUTHORIZED` | property |
| INV-G07 | `ADV-G17` | hostile |
| INV-G08 | `ADV-G18` authorization record refused | hostile |
| INV-G09, G10 | `EX-G12` offline run passes; no socket opened | integration |
| INV-G11 | `ADV-G01` duplicate key | hostile |
| INV-G12 | `ADV-G02` unknown field | hostile |
| INV-G13 | `PROP-G02` canonical round-trip | property |
| INV-G14 | `ADV-G04` accepted-byte mutation | hostile |
| INV-G15 | `ADV-G19` self-referential preimage | hostile |
| INV-G16 | `ADV-G13`, `ADV-G14`, `ADV-G15` | hostile |
| INV-G17 | `ADV-G06`, `ADV-G07` | hostile |
| INV-G18 | `ADV-G10` cycle | hostile |
| INV-G19 | `EX-G13` no domain field copied | independent re-derivation |
| INV-G20 | design constraint; `EX-G15` tooling absence harmless | manual |
| INV-G21 | `ADV-G22` unregistered marker | hostile |
| INV-G22 | `EX-G11` `--check` no-op; write separate | example |
| INV-G23 | `ADV-G21` invalid base | hostile |
| INV-G24 | `ADV-G24` prohibited claim reintroduced | hostile |
| INV-G25 | `EX-G16` before/after derivation identical | independent re-derivation |
| INV-G26 | `EX-G17` non-contiguous set preserved | example |

No control is claimed to prove behavior it does not exercise. `INV-G20` is
proven by construction and manual argument, not by a test.

---

## Property tests

- **PROP-G01** For any valid registry, repeated derivation yields an identical
  answer object.
- **PROP-G02** Canonical serialization round-trips: `canon(parse(canon(x))) ==
  canon(x)`; and any permutation of input key order yields identical canonical
  bytes.
- **PROP-G03** Changing any security-relevant field — accepted bytes, a
  relationship, a rule input, an attestation field — changes the corresponding
  digest.
- **PROP-G04** Renderer output is a pure function of the registry: same registry
  ⇒ same bytes, independent of filesystem order or locale.
- **PROP-G05** Across generated registries, no query output in either form
  contains the token `AUTHORIZED`.
- **PROP-G06** Environmental failure (unreadable file, absent Git object) is
  always reported as such and never as a governance finding.
- **PROP-G07** Adding an unrelated valid record never changes an unrelated
  derived answer.

---

## Hostile corpus

Every case must fail the **real** entry point.

### Representation

- **ADV-G01** Duplicate JSON key where a permissive parser keeps the last.
- **ADV-G02** Unknown field, including a plausible `resolved`/`satisfied`.
- **ADV-G03** Valid JSON that is not its own canonical serialization.
- **ADV-G23** Truncated registry — must not read as empty.

### Decisions

- **ADV-G04** Accepted ADR bytes edited; digest mismatch.
- **ADV-G05** Superseded ADR's historical header rewritten to `Superseded`.
- **ADV-G08** `Accepted -> Proposed` and `Accepted -> Rejected` regressions.
- **ADV-G25** Rejection without its final-byte attestation.

### Questions and gates

- **ADV-G06** Two current accepted resolvers for one question.
- **ADV-G07** Resolver is `Proposed`, not accepted — question must stay open.
- **ADV-G09** Predicate referencing a missing entity — unevaluable.
- **ADV-G11** `GATE-U4` predicate **mutated in place**; must fail history even
  when the derived answer is otherwise consistent.

### Landings and completion

- **ADV-G10** Prerequisite cycle.
- **ADV-G12** Dangling prerequisite reference.
- **ADV-G13** `L8` **removed** from `L9`'s prerequisite set.
- **ADV-G14** `L9`'s authority anchor **repointed away from issue #57**.
- **ADV-G15** Node kind or completion-policy identity mutated in place.
- **ADV-G16** Replacement identity supplied **without** its typed supersession
  relation and human-attested transition.
- **ADV-G26** **Arbitrary existing commit** offered as completion evidence, with
  no scoped delivered identity or attestation.
- **ADV-G27** **Arbitrary issue plus merged PR** offered as spike completion,
  without the bound evidence root, manifest digest, findings identity and
  attestation.
- **ADV-G28** **Retrospectively manufactured OpenSpec archive** substituted for
  `reviewed-spike-evidence-v1`'s explicit no-archive fact.
- **ADV-G29** Delivery evidence mutated or removed after a terminal lifecycle.
- **ADV-G30** Unknown completion policy, including a generic legacy escape
  hatch.

### Attestations and genesis

- **ADV-G19** Attestation included in its own preimage.
- **ADV-G20** Byte-correct seed asserting one relationship its source does not
  declare — must fail on equivalence, with no prior revision available.
- **ADV-G31** Omitted, unparseable, or conflicting source label during
  reconciliation — explicit bootstrap failure, never treated as empty.
- **ADV-G32** Genesis mutated to record ADR-0020 accepted, U4 resolved, or
  GATE-U4 satisfied.
- **ADV-G33** `local-git-commit` whose object is absent from the checkout.

### History

- **ADV-G21** History base invalid, missing, unreadable, or not a commit — must
  fail with **no fallback** to `merge-base` or `HEAD~1`.
- **ADV-G34** Existing record deleted or renumbered.
- **ADV-G35** Resolved question's current resolver disappears.

### Projections and authorization

- **ADV-G22** Unregistered generated target or marker.
- **ADV-G36** Generated projection **edited by hand**.
- **ADV-G24** Hand-maintained accepted range, resolved count, question status
  list, or blocker summary **reintroduced outside a registered projection** in a
  registered consumer.
- **ADV-G17** Readiness `Ready` read as authorization — query must still report
  external verification required.
- **ADV-G18** Any authorization-evidence record introduced — refused as an
  unknown field.

---

## Mutation targets

Removing or weakening each guard must fail the suite. A guard replaced by a
no-op that still returns success is the failure mode being hunted.

- **MUT-G01** Strict duplicate-key rejection → permissive `JSON.parse`.
- **MUT-G02** Accepted-byte digest comparison → unconditional pass.
- **MUT-G03** Resolver-uniqueness check → first-match-wins.
- **MUT-G04** Explicit-base exclusivity → silent `merge-base` fallback.
- **MUT-G05** Query axis separation → a single collapsed status field.
- **MUT-G06** History semantics moved into the Git adapter (second authority).
- **MUT-G07** Projection `--check` → non-byte-exact comparison.
- **MUT-G08** Identity-bearing rule-input immutability → permitted in-place
  edit.
- **MUT-G09** Completion scope binding → bare commit hash accepted.
- **MUT-G10** Relationship-equivalence digest → derived-count comparison only.
- **MUT-G11** Unevaluable predicate → treated as `false` without failing.
- **MUT-G12** Unknown-field rejection → ignore-and-continue.

---

## Traceability plan

| Requirement | Landing | Task group | Proving control |
| --- | --- | --- | --- |
| Canonical representation | PR-1 | 1 | ADV-G01–03, G23; PROP-G02 |
| Decision lifecycle | PR-1 | 2 | ADV-G04, G05, G08, G25; EX-G07 |
| Questions and gates | PR-1 | 2 | ADV-G06, G07, G09 |
| Landings and prerequisites | PR-1 | 3 | ADV-G10, G12; T1 |
| Completion policies | PR-1 | 3 | ADV-G26–G30 |
| Attestations | PR-2 | 4 | ADV-G19, G33; PROP-G03 |
| Genesis | PR-2 | 4 | ADV-G20, G31, G32; EX-G16, EX-G17 |
| Current-revision validation | PR-1 | 1–3 | the above via the real checker |
| Rendering | PR-3 | 5 | ADV-G22, G36; EX-G11; PROP-G04 |
| Projection migration | PR-4 | 6 | ADV-G24; EX-G14 |
| History validation | PR-5 | 7 | ADV-G11, G13–G16, G21, G29, G34, G35 |
| Query | PR-6 | 8 | ADV-G17, G18; PROP-G05; T4 |
| PR #101 transition | PR-6 | 8 | EX-G18 derived-chain example |

No deferred scenario uses a generic "later" bucket; each names its landing.

---

## Landing plan

Serial, six landings, in the order of `design.md` D11. Each landing's
verification net ships **with** it.

- **PR-1** model, strict reader, current checker, and their hostile corpus.
  Nothing is generated and no state is seeded. Safe to build on because every
  later landing depends on the model's rules being already proven.
- **PR-2** genesis seed and attestation. Cannot land before PR-1 can validate
  it. Must prove state-preservation (`EX-G16`).
- **PR-3** renderer, `governance/STATE.md`, marker registry, drift controls.
- **PR-4** projection migration and prohibited-field refusal. **Atomic:** each
  generated region and the deletion of the hand-authored copy it replaces land
  in the same change; a landing that adds a region while leaving the copy
  creates a coequal surface.
- **PR-5** history checker and explicit-base CI wiring, with its regression
  corpus.
- **PR-6** query interface with axis-separation controls.

**Authority posture:** every landing is inert with respect to governance
authority. None accepts, resolves, satisfies, or authorizes anything.

---

## Review plan

At each complete seam:

- **Evidence review** — that each claimed control ran against the real entry
  point and a real fixture, not a helper.
- **Repository-aware semantic review** — that derived facts are absent from the
  registry and that no prose copy survives a migration landing.
- **Contract conformance** — against ADR-0021's decided semantics, especially
  §3E non-authorization and §7a non-self-reference.
- **Deterministic reconciliation** — `--check` no-op, and the full gate green.
- **Architecture review** required for PR-1 (the model boundary) and PR-5 (the
  adapter/model split).

Full re-review is not required at known-incomplete intermediate checkpoints;
each landing is reviewed once at its frozen final head.

---

## Rollout and rollback

- **Shadow phase.** PR-1 through PR-3 are advisory: they validate and render but
  no consumer depends on them, and no prose is deleted.
- **Measurements before activation.** The full hostile corpus green; every
  mutation target killed; `--check` a byte-for-byte no-op; genesis
  state-preservation demonstrated.
- **Activation condition.** PR-4 is the activation seam — the first landing that
  deletes hand-authored copies and makes the registry load-bearing. It may
  proceed only when PR-1–PR-3's obligations are green.
- **Rollback condition.** If a defect is found after PR-4, rollback is reverting
  the migration landing, which restores the hand-authored copies from Git
  history; the registry becomes inert again rather than a competing authority.
  Rollback of PR-5/PR-6 removes checks and a read-only query and is
  consequence-free.
- **Runtime rollback is not applicable** — no runtime or household operation
  depends on this tooling (INV-G20).

---

## Assurance completeness

**Unresolved state-model questions.** None trust-critical. Exact field spelling
inside ADR-0021 §3's decided semantics is refinable at implementation; whether
U-item severity remains authored or becomes derived is deferred to seed review
and changes no validator.

**Requirements lacking proof.** None in current scope. INV-G20 is proven by
construction and manual argument rather than by test, and is marked as such.

**Scenarios intentionally deferred.** None. Every specified scenario is
assigned a landing in the traceability plan.

**Design assumptions requiring human confirmation.**

1. The initial registered projection set in `design.md` D7.1 is correct and
   complete for v1; additions are a reviewed decision per target.
2. The genesis source snapshot is `origin/main` `eb6e248`, and the human
   attestation actor and authority reference are supplied by the repository
   owner at seed time.
3. The non-contiguous accepted set is recorded as such and never normalized.

**This artifact authorizes nothing.** A complete assurance plan is necessary and
never sufficient; implementation begins only under an explicit release recorded
in `tasks.md`.
