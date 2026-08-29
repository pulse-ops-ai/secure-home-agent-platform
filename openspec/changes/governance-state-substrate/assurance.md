# Assurance: governance-state-substrate

Pre-implementation proof and verification plan. Derived from
`specs/governance-state/spec.md` and `design.md`. It introduces no product
requirement, and authorizes no implementation.

> **Revised again after review 5058723445** — the replacement refusal is
> withdrawn as an ADR-0021 conflict and replaced by real controls, and
> withdrawal gains its own.
>
> **Revised after review 5058683298** — positive collection properties
> move out of the hostile corpus, MAN-G01 becomes a general provenance control,
> and PR-1 owns the full collection contract.
>
> **Revised after the `2d04d3d` review** — the T3 genesis row now states
> the same mechanically testable condition as the design, ADV-G58/G59 move into
> the history-only partition, and ADV-G61 is reclassified as the manual control
> it actually is.
>
> **Revised after review 5058244198** — `runner/L1` leaves the graph, the
> new controls gain traceability owners, and the identifiers in the hostile
> corpus are namespaced.
>
> **Revised after review 5058112067** — the history-base table now carries
> the `carries registry` dimension and the genesis exception, and the
> completeness section no longer states the superseded severity policy.
>
> **Revised after review 5056996739.** The previous version called PR-1
> through PR-3 a shadow phase in which the canonical registry existed beside the
> prose copies, assigned two-revision hostile cases to a one-revision checker,
> and asserted a digest property that contradicted the design's own
> non-self-reference rule. All three are corrected below.

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
- **INV-G27** Every collection is classified; entity and set-valued
  collections are canonically ordered and duplicate-free, and set order carries
  no meaning.
- **INV-G28** Every authored primitive maps to a row in the closed genesis
  source manifest, classified `locally-verified` or `externally-attested`.
- **INV-G29** Every current governance-state surface is classified by the closed
  consumer inventory; an unclassified surface is a migration failure.

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
- **INV-G30** No repository revision contains a canonical
  `governance/state.json` alongside a surviving hand-authored copy of a fact it
  owns. The canonical path's first appearance is the atomic activation, which
  also enables history validation; reverting it removes registry, regions and
  pointers together.
- **INV-G31** The external program index no longer claims coequal current-state
  authority once activation has occurred, and activation is refused while it
  does.
- **INV-G32** Delivery lifecycle derives from repository evidence; issue prose
  and issue open/closed state are anchors and mirrors, never delivery evidence.
- **INV-G33** Program-node identifiers are namespaced and used byte-for-byte
  everywhere; a bare shorthand is a dangling reference, never an alias.
- **INV-G34** Every landing seeded `Complete` has a member in the genesis
  completion envelope; a program event no v1 policy can represent is **not
  admitted as a landing entity at all**, appearing only as source and historical
  context (INV-G38).
- **INV-G35** The historical exemption is a rule — archived or evidenced as
  merged and frozen — never a path glob; live unarchived change artifacts are
  classified on their own merits.
- **INV-G36** After activation, no second copy of authored current state remains
  usable anywhere in the tree.
- **INV-G37** The external index handoff is conditional and bound by the
  activation evidence; no interval exists in which neither it nor the registry
  is authoritative, and it promises no reactivation the history rule refuses.
- **INV-G38** No node is seeded with a prerequisite that no registry state can
  satisfy; a program event v1 cannot represent is preserved as source and
  historical context rather than as an active node.
- **INV-G39** A genesis historical completion binds the observed lifecycle and
  no invented prior transition, at the schema-declared location
  `attestations.genesisCompletion`.
- **INV-G40** The genesis exception applies only to the base bound by the
  genesis evidence; v1 defines no reactivation, so no later change can re-run it.
- **INV-G41** Every displayed inventory count is generated from the
  machine-readable inventory; no count is maintained beside the enumeration, and
  every row carries one of the five closed dispositions.
- **INV-G42** Both genesis attestations are recorded by the repository owner on
  frozen artifacts, in the landing where `activationIdentity` exists; an
  implementation may compute a digest but never attest to one, and any
  post-attestation edit to a bound artifact invalidates it. **Authorship is
  established by human review; the checker proves shape, bindings, digests and
  immutability only.**
- **INV-G45** An identity-bearing rule input changes only by **replacement**:
  a new identity carrying `replaces`, of the same kind, with its attested
  transition, in one revision. The target is current in the pre-change graph;
  currency is derived; the replacement graph is acyclic and fork-free; the old
  record and its historical references are immutable; and the complete
  transitive closure of current dependents is replaced atomically rather than
  migrated by the model. Current nodes reference only current prerequisites,
  while non-current historical nodes retain their original references. A
  replacement digest binds complete old and new semantic identities, and a
  replacement landing starts `Planned` without inherited evidence while a gate
  has no delivery lifecycle.
- **INV-G46** `Withdrawn` is reachable only through its typed withdrawal
  protocol — digest, evidence, and attestation — satisfies no prerequisite, and
  its evidence is immutable thereafter.
- **INV-G44** The envelope's `members` is an entity set keyed by `landingId`,
  canonically ordered, duplicate-free, with the preimage over
  `{landingId, digest}` tuples so a digest cannot be reassociated with another
  landing.
- **INV-G43** The ordinary completion digest binds prior and target lifecycle
  and applies only post-genesis; a genesis historical completion binds the
  observed lifecycle only. Neither substitutes for the other.

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
| Replacement graph / closure | absent · legal · transitive · forked · cyclic · incomplete current closure · historical-reference only |
| Replacement digest | valid complete old/new identities · mismatched · omitted · directionally ambiguous |
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
- *replacement × current/history identity* — a replacement requires the complete
  transitive closure of current dependents, while non-current historical records
  retain their original prerequisite references. Proof: `ADV-G66`, `ADV-G16`,
  `EX-G26`.
- *replacement × delivery lifecycle* — a replacement landing starts `Planned`
  and cannot inherit completion or withdrawal evidence; a replacement gate has
  no delivery lifecycle. Proof: `ADV-G66`, `EX-G26`.

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

| Base supplied | Readable | Is a commit | Carries a registry | Outcome |
| --- | --- | --- | --- | --- |
| yes | yes | yes | yes | compare |
| yes | yes | yes | **no**, **and** base commit, source snapshot and `activationIdentity` all match the genesis evidence binding | **genesis exception** — no prior revision exists; the genesis attestation and completion envelope are the proof |
| yes | yes | yes | **no**, after activation | **fail** — the registry was deleted; never a second genesis |
| yes | yes | no | — | **fail** — no fallback |
| yes | no | — | — | **fail** — no fallback |
| no | — | — | — | **fail** — no inference |

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
| `runner/L2`, `runner/L6` | complete, roots of the graph | unchanged | unchanged |
| `runner/L8` | outstanding | outstanding (unchanged) | **outstanding** |
| `runner/L9` requires | `["runner/GATE-U4","runner/L8"]` | unchanged | unchanged |
| `runner/L9` anchor | issue #57 | unchanged | unchanged |
| `runner/L9` readiness | `NotReady` | `NotReady` (unchanged) | **`NotReady`**, unsatisfied `["runner/L8"]` |
| `runner/L9` authorization | none inferred | none inferred | **none inferred** |

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
| INV-G27 | `ADV-G38`, `ADV-G39`; `PROP-G02`, `PROP-G09` | hostile + property |
| INV-G28 | `ADV-G42`, `ADV-G43` | hostile |
| INV-G29 | `ADV-G46`, `ADV-G47`; `EX-G20` | hostile + example |
| INV-G30 | `ADV-G48` registry beside a surviving copy | hostile |
| INV-G31 | `ADV-G49` activation without the index transition | hostile |
| INV-G32 | `ADV-G45` delivery taken from issue state | hostile |
| INV-G33 | `ADV-G50` bare shorthand identifier | hostile |
| INV-G34 | `ADV-G51`, `ADV-G52`, `ADV-G53` | hostile |
| INV-G35 | `ADV-G54` live unarchived change claiming the exemption | hostile |
| INV-G36 | `ADV-G55` candidate copy usable after activation | hostile |
| INV-G37 | `ADV-G49` unbound conditional handoff | hostile |
| INV-G38 | `ADV-G56` completed node behind an unsatisfiable prerequisite | hostile |
| INV-G39 | `ADV-G57` prior-lifecycle bound into a genesis completion | hostile |
| INV-G40 | `ADV-G58` unbound registry-less base; `ADV-G59` replacement activation | hostile |
| INV-G41 | `EX-G21` counts regenerate to the enumeration; `ADV-G60` | independent re-derivation + hostile |
| INV-G42 | `ADV-G62` post-attestation edit; `EX-G24` checker makes no authorship claim | hostile + example |
| INV-G42 (authorship) | **`MAN-G01`** | **manual review** |
| INV-G44 | `ADV-G65`; `PROP-G09` | hostile + property |
| INV-G45 | current model: `ADV-G66` malformed/incomplete replacement; `EX-G26` legal replacement; history: `ADV-G16`, `MUT-G08`; `PROP-G10` | current + history + example + property |
| INV-G46 | `ADV-G67` withdrawal without digest/evidence/attestation; `ADV-G68` withdrawn node satisfying a prerequisite; `EX-G25` legal withdrawal; `PROP-G10` | hostile + example + property |
| INV-G43 | `ADV-G57` prior lifecycle in a genesis completion; `ADV-G63` ordinary digest used at genesis | hostile |

No control is claimed to prove behavior it does not exercise. `INV-G20` is
proven by construction and manual argument, not by a test.

---

## Property tests

- **PROP-G01** For any valid registry, repeated derivation yields an identical
  answer object.
- **PROP-G02** Canonical serialization round-trips: `canon(parse(canon(x))) ==
  canon(x)`; and any permutation of input key order yields identical canonical
  bytes.
- **PROP-G03** Changing any **preimage** field — accepted bytes, a
  relationship, a rule input — changes the corresponding transition, completion,
  or seed digest.
- **PROP-G08** Changing the **attestation envelope** does **not** change the
  digest it attests, because the envelope is excluded from that preimage by
  construction. An unauthorized envelope change is instead rejected by evidence
  validation and history immutability. *(The previous version asserted that an
  attestation-field change alters the digest, which contradicts
  non-self-reference; both could not be true.)*
- **PROP-G04** Renderer output is a pure function of the registry: same registry
  ⇒ same bytes, independent of filesystem order or locale.
- **PROP-G05** Across generated registries, no query output in either form
  contains the token `AUTHORIZED`.
- **PROP-G06** Environmental failure (unreadable file, absent Git object) is
  always reported as such and never as a governance finding.
- **PROP-G07** Adding an unrelated valid record never changes an unrelated
  derived answer.
- **PROP-G10** Changing any field of a withdrawal preimage changes
  `withdrawalDigest`; changing any field of a replacement preimage changes
  `replacementDigest`.
- **PROP-G09** Reordering the members of any canonical set — a set-valued
  relationship, the completion envelope's members, or a policy-evidence identity
  set — produces identical canonical bytes and identical digests. *(Previously
  filed as `ADV-G37`/`ADV-G64` inside the hostile corpus, whose preamble requires
  every case to fail. These must succeed, so they are properties.)*

---

## Hostile corpus

Every case must fail the **real** entry point. The corpus is split by which
checker can actually prove it: a one-revision checker cannot detect that a value
*changed*, so every "mutated in place" and "regressed" case belongs to history.

### Provable by the current-revision checker (PR-1)

**Representation**

- **ADV-G01** Duplicate JSON key where a permissive parser keeps the last.
- **ADV-G02** Unknown field, including a plausible `resolved`/`satisfied`.
- **ADV-G03** Valid JSON that is not its own canonical serialization.
- **ADV-G23** Truncated registry — must not read as empty.
- **ADV-G38** Duplicate collection member — entity id or set member.
- **ADV-G39** Unclassified collection.

**Decisions, questions, gates**

- **ADV-G04** Accepted bytes no longer match the recorded digest.
- **ADV-G05** Superseded document's historical header rewritten.
- **ADV-G25** Rejection lacking its final-byte attestation.
- **ADV-G06** Two current accepted resolvers for one question.
- **ADV-G07** Resolver is `Proposed` — question must stay open.
- **ADV-G09** Predicate referencing a missing entity — unevaluable.

**Landings and completion**

- **ADV-G10** Prerequisite cycle. · **ADV-G12** Dangling reference.
- **ADV-G26** Arbitrary existing commit offered as completion evidence.
- **ADV-G27** Arbitrary issue plus merged PR offered as spike completion.
- **ADV-G28** Retrospectively manufactured OpenSpec archive substituted.
- **ADV-G30** Unknown or generic-legacy completion policy.
- **ADV-G33** `local-git-commit` whose object is absent.

**Attestations**

- **ADV-G19** Attestation included in its own preimage.

**Projections, query, migration**

- **ADV-G22** Unregistered generated target or marker.
- **ADV-G36** Generated projection edited by hand.
- **ADV-G24** Prohibited hand-maintained claim reintroduced in a registered
  consumer.
- **ADV-G17** Readiness `Ready` read as authorization.
- **ADV-G48** A revision in which the canonical registry coexists with a
  surviving hand-authored copy.
- **ADV-G46** Governance surface absent from the consumer inventory.
- **ADV-G47** `retained-semantic-prose` row with no recorded reason.
- **ADV-G49** Activation whose evidence does not bind the conditional handoff —
  index identity, conditional body bytes, activation identity, registry path.
- **ADV-G50** A prerequisite or query naming bare `L8` where the registry
  declares `runner/L8` — a dangling reference, never resolved by inference.
- **ADV-G51** A landing seeded `Complete` with no member in the genesis
  completion envelope.
- **ADV-G52** A source-manifest row offered as a completion attestation.
- **ADV-G53** Any member of the completion envelope altered — the envelope
  digest must change and validation must fail until re-attested.
- **ADV-G54** A live, unarchived OpenSpec change introducing a current decision
  range or program blocker claim, attempting to inherit the historical
  exemption.
- **ADV-G55** A candidate state copy left usable as authored current state after
  activation.
- **ADV-G56** A landing seeded `Complete` whose declared prerequisite can never
  be satisfied by any registry state — an impossible historical graph, refused
  rather than special-cased.
- **ADV-G57** A genesis historical completion whose preimage binds a prior
  lifecycle the repository does not evidence.
- **ADV-G60** A prose inventory count disagreeing with the machine-readable
  inventory it summarizes, or a row carrying a disposition outside the closed
  five.
- **ADV-G65** Duplicate `landingId` in the envelope, one `digest` under two
  landings, or a duplicated evidence identity.
- **ADV-G66** A current-revision replacement that is malformed or incomplete:
  absent paired `replaces`/`replacement` fields or attestation, a non-current
  target, a second node replacing the same identity, a replacement fork or
  cycle, a changed `kind`, an incomplete transitive current-dependent closure,
  a current dependent still naming a replaced identity, an omitted or
  directionally ambiguous old/new semantic-identity input in
  `replacementDigest`, a replacement landing inheriting terminal lifecycle or
  evidence, or a replacement gate carrying delivery state.
- **ADV-G67** A landing moved to `Withdrawn` without its withdrawal digest,
  without its evidence, or without its attestation — each refused
  independently — and mutation of withdrawal evidence after the terminal
  lifecycle.
- **ADV-G68** A `Withdrawn` landing counted as satisfying a prerequisite.
- **ADV-G62** An edit, after attestation, to any artifact the attested preimage
  binds.
- **ADV-G63** An ordinary `completionDigest` used for a genesis historical
  completion, or a `genesisHistoricalCompletionDigest` used for a post-genesis
  transition.

### Provable only by the two-revision history checker (PR-2)

- **ADV-G21** Base invalid, missing, unreadable, or not a commit — **no
  fallback**.
- **ADV-G41** A post-activation base carrying no registry — refused, never a
  second genesis.
- **ADV-G08** `Accepted -> Proposed` / `Accepted -> Rejected` regression.
- **ADV-G04h** Accepted bytes **and** the recorded digest replaced together.
- **ADV-G40** Accepted acceptance-evidence mutated.
- **ADV-G11** `runner/GATE-U4` predicate mutated in place.
- **ADV-G13** `runner/L8` removed from `runner/L9`'s prerequisite set.
- **ADV-G14** `runner/L9`'s authority anchor repointed away from issue #57.
- **ADV-G15** Node kind or completion-policy identity mutated in place.
- **ADV-G16** A two-revision replacement-history violation: an old record or
  historical prerequisite reference is edited, a `replaces` relationship is
  removed/repointed/reassociated, replacement digest or attestation evidence
  is mutated, or a new replacement identity, relationship and attestation do
  not arrive together. Current graph and transitive-closure rules are proven by
  the shared model through `ADV-G66` and `EX-G26`.
- **ADV-G18** Authorization-evidence record introduced, mutated, or removed.
- **ADV-G29** Delivery evidence mutated or removed after a terminal lifecycle.
- **ADV-G34** Record deleted or renumbered.
- **ADV-G35** Resolved question's current resolver disappears.
- **ADV-G58** An older registry-less commit supplied as the explicit base,
  unmatched by the genesis evidence binding, attempting to claim the exception.
- **ADV-G59** A replacement activation after a revert, attempting a second
  genesis.

### Genesis (PR-2, proven without a prior revision)

- **ADV-G20** Byte-correct seed asserting one relationship its source does not
  declare — must fail on equivalence.
- **ADV-G31** Omitted, unparseable, or conflicting source label.
- **ADV-G32** Seed authoring an accepted lifecycle, a resolution, or a
  satisfaction.
- **ADV-G42** Authored primitive with no source-manifest row.
- **ADV-G43** Externally-attested row reported as locally verified.
- **ADV-G44** Partial program seed — any node of `runner/L2`…`runner/L10`,
  `runner/GATE-U6`, `runner/GATE-U4` missing.
- **ADV-G45** Delivery lifecycle taken from issue state rather than repository
  evidence.

### Manual controls — not machine-decidable, and not claimed to be

- **MAN-G01** (was `ADV-G61`) **Attestation authorship — every class.** That the
  repository owner personally recorded an attestation is established at the
  **human review gate**. This covers ADR acceptance, ADR rejection, ordinary
  completion, withdrawal, and both genesis envelopes: none carries a signature,
  and the same offline checker validates all of them. It is established
  not by the checker. The checker is offline and the envelope carries no
  signature, trusted key, or signed object, so it has no observable fact
  distinguishing an owner-recorded envelope from an implementation-recorded one.
  The `actor` string is a recorded assertion, not proof of identity.

  What remains fully automated: envelope shape, preimage recomputation, content
  digests, authority-reference shape, and immutability thereafter — `ADV-G62`,
  `ADV-G65`, `PROP-G09`, `EX-G24`.

  A machine-verifiable alternative (detached owner signature under a governed
  trust root) is a separate decision covering key custody, rotation and
  revocation. Version one does not adopt it, and this control is named as manual
  rather than dressed as a hostile case the suite cannot actually run.

- **MAN-G02** **Independent merge control for unsigned activation.** Before
  the owner records the real genesis attestations and again at the activation
  merge gate, the owner records in activation PR metadata enforceable evidence
  of either branch/ruleset protection requiring an owner-controlled merge path,
  or credential separation showing that the implementation actor and its
  available credentials cannot merge to `main`. If neither condition is
  evidenced, the unsigned activation is refused. This is a manual gate, not a
  registry field or authorization grant; signing remains outside v1 and needs a
  separate decision.

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
- **MUT-G08** Identity-bearing rule-input and replacement-relation immutability
  plus closure enforcement → permitted in-place edit or leaf-only replacement.
- **MUT-G09** Completion scope binding → bare commit hash accepted.
- **MUT-G10** Relationship-equivalence digest → derived-count comparison only.
- **MUT-G11** Unevaluable predicate → treated as `false` without failing.
- **MUT-G12** Unknown-field rejection → ignore-and-continue.
- **MUT-G13** Set-valued canonical sort removed → reordering changes the digest.

---

## Traceability plan

| Requirement | Landing | Task group | Proving control |
| --- | --- | --- | --- |
| Canonical representation | PR-1 | 1 | ADV-G01–03, G23; PROP-G02 |
| Collection classification and ordering | PR-1 | 1 | ADV-G38, ADV-G39, **ADV-G65**; PROP-G02, **PROP-G09**; MUT-G13 |
| Decision lifecycle (current manifestations) | PR-1 | 2 | ADV-G04, G05, G25; EX-G07 |
| Questions and gates | PR-1 | 2 | ADV-G06, G07, G09 |
| Landings and prerequisites (current) | PR-1 | 2 | ADV-G10, G12; T1 |
| Completion policies (current) | PR-1 | 2 | ADV-G26–G28, G30, G33 |
| Attestations | PR-1 | 1 | ADV-G19; PROP-G03, G08 |
| Current-revision validation | PR-1 | 2 | all of the above via the real checker |
| History validation | **PR-2** | 4 | ADV-G04h, G08, G11, G13–G16, G18, G21, G29, G34, G35, G40, G41 |
| Rendering | PR-2 | 5 | ADV-G22, G36; EX-G11; PROP-G04 |
| Query | PR-2 | 5 | ADV-G17, G18; PROP-G05; T4 |
| Genesis primitives and derivation | PR-2 | 6 | ADV-G32, G44, G45; EX-G16, G17, G19 |
| Genesis source manifest | PR-2 | 6 | ADV-G20, G31, G42, G43; MUT-G10 |
| Consumer inventory | PR-2 | 6 | ADV-G46, G47; EX-G20 |
| Namespaced identifiers | PR-1 | 2, 3 | ADV-G50 — proven in PR-1; repeated in PR-2 as integration |
| Program graph validity | PR-2 | 6 | ADV-G56; the whole-program seed |
| Genesis completion envelope | PR-2 | 6 | ADV-G51–G53, ADV-G57, ADV-G63; EX-G23 |
| Withdrawal protocol | **PR-1** | 2 | ADV-G67, ADV-G68; EX-G25; PROP-G10 |
| Node replacement (current model) | **PR-1** | 2, 3 | ADV-G66; EX-G26; PROP-G10 |
| Node replacement (history) | **PR-2** | 4, 7 | ADV-G16; MUT-G08 |
| Attestation mechanism | PR-2 | 6 (6.6, 6.7) | ADV-G62; EX-G24 |
| Real genesis ceremony | **PR-3** | 8 (8.0, 8.6, 8.6a, 8.7, 8.8) | MAN-G01, MAN-G02 (manual) |
| Inventory count regeneration | PR-2 | 6 | EX-G21; ADV-G60 |
| Live-change exemption rule | PR-2 | 6 | ADV-G54 |
| Bound activation / no reactivation | PR-2 | 4 | ADV-G58, ADV-G59 |
| Candidate copy removal | PR-3 | 8 | ADV-G55 |
| Atomic activation | **PR-3** | 8 | ADV-G48; the PR-3 completion gate |
| Projection migration | PR-3 | 8 | ADV-G24; EX-G14 |
| External program index | PR-3 | 8 | ADV-G49 |
| PR #101 transition | PR-2 | 5 | EX-G18 — a **fixture**, not a real transition |

No deferred scenario uses a generic "later" bucket; each names its landing.

**The split that the previous version got wrong.** Every "mutated in place" or
"regressed" case now sits in PR-2 with the history checker, because a
one-revision checker cannot observe that a value changed. PR-1 keeps only what
a single snapshot can refute.

---

## Landing plan

Three landings. **All machinery is built and proven before the canonical
registry exists.**

- **PR-1 — model, strict reader, collection canonicalization, current checker,
  and their proof net.** No `governance/state.json` at the canonical path.
  Fixtures only. Safe to build on because every later landing depends on these
  rules already being proven.
- **PR-2 — history checker, renderer, query, genesis machinery, and a
  *candidate* seed at `tests/fixtures/governance/candidate/`.** Still no
  canonical registry. Every mechanism is proven against the candidate, so PR-3
  promotes an already-proven artifact rather than authoring a new one.
- **PR-3 — atomic activation.** The canonical registry's **first appearance**,
  arriving already protected: registry, genesis attestation, source manifest,
  generated regions **and the deletion of the copies they replace**, pointers
  for every enumerated consumer, prohibited-copy enforcement, current-revision
  validation, **history validation**, scaffold coverage, and the human external
  index transition — in one indivisible change.

**Why PR-3 cannot be split.** Two intervals the previous plan created are
closed by construction:

1. *Registry beside surviving copies.* Nothing makes a file at the canonical
   authoritative path non-authoritative; "inert" is a description, not a
   mechanism. So the registry may not appear before the copies go.
2. *Authoritative but unprotected.* If history validation landed after
   activation, an intervening change could mutate an accepted lifecycle,
   accepted bytes, a gate predicate, L9's prerequisites, issue #57's anchor, or
   terminal completion evidence; the current checker would accept the resulting
   internally valid snapshot, and once history was enabled that corrupted
   snapshot would already be the base.

**Authority posture.** PR-1 and PR-2 carry no governance authority whatsoever.
PR-3 is the single authority transition, and it accepts, resolves, satisfies and
authorizes nothing.

---

## Review plan

At each complete seam:

- **Evidence review** — that each claimed control ran against the real entry
  point and a real fixture, not a helper.
- **Repository-aware semantic review** — that no conclusion is authored in the
  registry, and that PR-3 leaves no surviving prose copy.
- **Contract conformance** — against ADR-0021's decided semantics, especially
  §3E non-authorization, §7a non-self-reference, and §2.4's prohibition on a
  hand-authored copy beside a projection.
- **Deterministic reconciliation** — `--check` no-op, and the full gate green.
- **Architecture review** required for **PR-1** (the model boundary) and
  **PR-2** (the adapter/model split, and the genesis source manifest).
- **Activation review** required for **PR-3**, covering the completeness of the
  seam and the external index transition evidence.

Full re-review is not required at intermediate checkpoints; each landing is
reviewed once at its frozen final head.

---

## Rollout and rollback

- **Pre-activation (PR-1, PR-2).** Nothing is authoritative and nothing is
  deleted. The candidate seed exercises every mechanism from a fixture path.
  This is genuinely inert — not by description, but because the canonical path
  does not exist.
- **Measurements before activation.** The full hostile corpus green in both
  halves; every mutation target killed; `--check` a byte-for-byte no-op;
  genesis state-preservation demonstrated; the consumer inventory enumerating
  every current surface; and the external index transition performed and
  evidenced.
- **Activation condition.** PR-3 may proceed only when all of the above hold.
  It is the single moment at which the registry becomes authoritative, and it
  is also the moment at which every gate protecting it turns on.
- **Rollback condition.** Reverting PR-3 removes the registry, the generated
  regions, and the pointers **together**, restoring the prior hand-authored
  copies from Git history. There is no state in which the registry survives its
  migration. *(The previous version's rollback was defective in the opposite
  direction: reverting its activation landing would have restored the prose
  while leaving `state.json` behind — two authorities again.)*
- **Runtime rollback is not applicable** — no runtime or household operation
  depends on this tooling (INV-G20).

---

## Assurance completeness

**Unresolved state-model questions.** None trust-critical. Exact field spelling
inside ADR-0021 §3's decided semantics is refinable at implementation.

Severity is **no longer an open question and is no longer deferred**: `design.md`
D2.3 decides it is authored in v1 as rule-free, non-identity-bearing data,
included in canonical bytes and `primitiveDigest`, bound by the genesis
attestation, rendered into the unresolved-decision projection, and ordinarily
mutable under history. *(A previous version of this section said the choice was
deferred to seed review and changed no validator. Both halves were wrong — the
choice changes the schema, canonical bytes, the primitive digest, genesis, and
history behavior, which is why it is settled before implementation.)*

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
