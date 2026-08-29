# Implementation Tasks: governance-state-substrate

## Contract

Implementation is governed by:

- `proposal.md`
- `specs/**`
- `design.md`
- `assurance.md`

These artifacts define the accepted change contract. Task completion does not
redefine the specification, architecture, or assurance model.

**This PR is a planning and decomposition contract. No implementation task
below is executed in it.** It creates no `governance/` directory, no
`state.json`, no scripts, no tests, and no CI change.

> **Revised again after review 5058723445** — withdrawal and replacement are
> owned by implementation and verification tasks, PR-3's seam becomes one
> commit, and PR-4 depends on a merged PR-3 rather than on a mid-landing task.
>
> **Revised after review 5058683298** — the PR-3 order is made possible
> (build the seam, freeze, attest, verify), PR-1 owns all five collection
> classes, and the PR-1 completion definition no longer claims an activation
> seam it must not contain.
>
> **Revised after the `2d04d3d` review** — the real owner ceremony moves
> to PR-3, where the activation identity exists; PR-2 proves the mechanism with
> test attestations; and 6.7's task metadata names the file it changes.
>
> **Revised after review 5058507190** — a human-only genesis attestation
> ceremony, 6.4 aligned to the scan-universe/inventory-row split, 7.2 depending
> on the task it tests, and `ADV-G50` proven in PR-1 where it belongs.
>
> **Revised after review 5058244198** — `runner/L1` leaves the seeded
> graph, task 6.1 splits locally-verified from human-attested sources, the
> completion envelope binds an observed lifecycle, and the PR-2 verification net
> owns every newly added control.
>
> **Revised after review 5058112067** — canonical namespaced identifiers,
> `runner/L1` corrected to the post-ratification landing, a genesis completion
> envelope for the historical `Complete` landings, a conditional external-index
> handoff, and exact pre/post-activation artifact paths so PR-2 no longer
> creates the root `governance/` directory without its README.
>
> **Revised after review 5056996739.** The previous decomposition landed
> `governance/state.json` at its canonical path in PR-2 and deleted the prose
> copies in PR-4 — the coequal-authority interval the proposal prohibits — and
> assigned two-revision hostile cases to a one-revision checker. The
> decomposition below builds every mechanism first, keeps the pre-activation
> seed at a fixture path, and makes the canonical registry's first appearance a
> single atomic activation that also turns on history validation.

---

## Implementation Authorization

This section RECORDS external authorization. It can never create it.

### External authority

| Field | Value |
|---|---|
| Source type | `github_issue` |
| Source id / link | **#106** — *Implement ADR-0021 governance-state substrate and migrate mutable governance projections* |
| Governing ADR | **ADR-0021** — `Accepted`, immutable, SHA-256 `0db0b5b7d3342b13b2f23602d3f7017f993705410d3e9a9966b1577cfd8cd66a` |
| Base revision | `origin/main` `eb6e24806cb76898e74f16208ab40587313c126a` (merge of PR #105) |
| Authorized scope | Phase 1 of #106 — **the OpenSpec planning contract only** |
| Constraints | Phase 1 does not authorize implementation of the registry, validators, renderer, query interface, migration, or CI changes. PR #101 is not to be modified. |
| Owner | @mikegtech (repository owner) |
| Recorded at | this change, on branch `spec/governance-state-substrate` |

### Status

**`NOT_AUTHORIZED`**

Issue #106 is the standing external authority for the substrate, and phase 1 —
this planning contract — is the only phase released. PR-1, PR-2, PR-3 and PR-4
below are each uncovered by that release and are therefore `NOT_AUTHORIZED` for
execution until the repository owner explicitly releases them.

- Authority narrower than the landing plan ⇒ `NOT_AUTHORIZED` for every
  uncovered landing, named explicitly.
- Assurance completeness is necessary but never sufficient.
- Neither issue #106's existence, nor ADR-0021's acceptance, nor any future
  satisfied prerequisite manufactures permission to start.

**While this status is `NOT_AUTHORIZED`, implementation tasks must not begin.**

### PR #101

PR #101 remains **untouched** — not modified, rebased, narrowed, closed, or
merged — until the completed substrate has independently passed review and
merged.

---

## Landing Plan

| Landing | Ships | Canonical `state.json`? | Authority posture | Completion condition |
|---|---|---|---|---|
| **PR-1** | model, strict reader, collection canonicalization, current checker, its proof net | **no** | none | current-revision rules proven; canonical path absent |
| **PR-2** | history checker, renderer, query, genesis machinery, **candidate** seed at a fixture path, full proof net | **no** | none | every mechanism proven against the candidate; canonical path still absent |
| **PR-3** | **atomic activation** | **first appearance** | authoritative | the whole seam present, all gates on, external index transitioned |
| **PR-4** | rebase and narrow PR #101 | — | consumer | only after PR-1–PR-3 merged and reviewed |

A landing is the unit that may be independently merged. **Do not merge a
partial atomic seam.** Verification required to trust a component lands with
that component.

### Decided before implementation, not during it

`design.md` D2.1–D2.3 close the vocabularies that would otherwise be
invented while coding: the v1 gate-predicate vocabulary is the single name
`exactly-one-current-accepted-resolver`; the v1 node kinds are
`implementation-landing`, `spike-landing`, `gate`;
program-node identifiers are namespaced (`runner/L9`, `runner/GATE-U4`) with
bare shorthand refused as a dangling reference; and question severity **is** in
v1 as authored, rule-free, non-identity-bearing data. Extending either vocabulary is a reviewed schema-version change, because
predicates and kinds are identity-bearing rule inputs.

---

# PR-1 — Model, strict reader, and current-revision checker

**No canonical `governance/state.json`.** Fixtures only.

## Completion Definition

Complete only when every PR-1 task is complete, every current-revision scenario
is proven through the real checker, every assigned invariant has its proof, the
complete PR-1 model/checker seam is present — **not** the activation seam, which
PR-1 must not contain — and review has completed on one frozen head.

## 1. Representation

- [ ] **1.1 Strict canonical reader, serializer, and collection semantics**
  <!-- agent-task: 1.1 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=none -->

  **Implements**
  - Requirement: *The registry is the sole authored authority in a closed canonical representation*; *Every collection is classified, ordered, and duplicate-free*
  - Invariant(s): `INV-G11`, `INV-G12`, `INV-G13`, `INV-G27`, `INV-G04`
  - Design decision(s): `D3.1`, `D3.2`

  **Change**
  Duplicate keys rejected **before object construction**; closed-schema unknown
  field rejection; deterministic canonical serializer; and **all five
  collection classes** the design declares, because PR-1 owns the
  canonical reader, serializer and collection model:

  | Class | Rule |
  |---|---|
  | entity collection | sorted by id; duplicate ids rejected |
  | set-valued relationship | sorted; duplicates rejected; order meaningless |
  | sequence-valued | order preserved and identity-bearing |
  | completion-envelope entity set | keyed by `landingId`; ordered; duplicate `landingId` and one `digest` under two landings rejected; preimage over `{landingId, digest}` tuples |
  | policy-evidence identity set | sorted by member bytes; duplicates rejected |

  **Proof required**
  - `ADV-G01` duplicate key · `ADV-G02` unknown field · `ADV-G03` noncanonical ·
    `ADV-G23` truncated never reads as empty
  - `PROP-G09` reordering any canonical set — relationship, envelope members, or
    evidence identities — yields identical bytes and digests
  - `ADV-G38` duplicate collection member rejected
  - `ADV-G65` duplicate `landingId`, one `digest` under two landings, or a
    duplicated evidence identity
  - `ADV-G39` unclassified collection refused
  - `PROP-G02` canonical round-trip and order independence
  - `MUT-G01` strict reader → permissive `JSON.parse`
  - `MUT-G12` unknown-field rejection → ignore
  - `MUT-G13` set canonical sort removed → reordering changes the digest

- [ ] **1.2 Digest computation and preimage construction**
  <!-- agent-task: 1.2 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=1.1 -->

  **Implements**
  - Requirement: *Acceptance and genesis attestations are non-self-referential and digest-bound*
  - Invariant(s): `INV-G15`
  - Design decision(s): `D3.3`, `D3.4`

  **Proof required**
  - `ADV-G19` attestation inside its own preimage
  - `PROP-G03` a **preimage** field change changes the digest
  - `PROP-G08` an attestation-envelope change does **not** change the digest it
    attests, and is instead caught by evidence validation

## 2. Semantics

- [ ] **2.1 Decision lifecycle, header mirror, and evidence completeness**
  <!-- agent-task: 2.1 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=1.1 -->

  **Implements** — *The decision lifecycle is a closed vocabulary…*;
  `INV-G14`; `D5.1`, `D5.2`

  **Proof required** — current-revision manifestations only
  - `ADV-G04` accepted bytes no longer match the recorded digest
  - `ADV-G05` superseded document's historical header rewritten
  - `ADV-G25` rejection lacking its final-byte attestation
  - `EX-G07` legal supersession leaves old bytes and header intact
  - `MUT-G02` digest comparison → unconditional pass

- [ ] **2.2 Derived resolution and gate predicates**
  <!-- agent-task: 2.2 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=2.1 -->

  **Implements** — *Question resolution and gate satisfaction are derived…*;
  `INV-G02`, `INV-G17`, `INV-G04`

  **Proof required**
  - `ADV-G06` two current resolvers · `ADV-G07` proposed resolver resolves
    nothing · `ADV-G09` unevaluable predicate
  - `EX-G01` authored `resolved`/`satisfied` rejected as unknown fields
  - `MUT-G03` resolver uniqueness → first-match-wins · `MUT-G11` unevaluable →
    silently false

- [ ] **2.3 Landings, prerequisites, completion policies, and node replacement**
  <!-- agent-task: 2.3 paths=scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=2.2 -->

  **Implements** — *Landings carry immutable rule inputs…*; *Completion is an
  identity-bound transition…*; the withdrawal and replacement protocols;
  `INV-G16`, `INV-G18`, `INV-G45`, `INV-G46`; `D4`, `D5.3`, `D5a.1`, `D5a.2`

  **Proof required** — current-revision manifestations only
  - `ADV-G10` cycle · `ADV-G12` dangling reference · `ADV-G50` bare shorthand
    identifier refused as a dangling reference
  - `ADV-G26` arbitrary commit as completion evidence
  - `ADV-G27` arbitrary issue + merged PR as spike evidence
  - `ADV-G28` retrospective OpenSpec archive substituted
  - `ADV-G30` unknown / generic-legacy policy · `ADV-G33` absent local commit
  - `EX-G02` `Planned`/`InProgress` never satisfy a prerequisite
  - `MUT-G09` scope binding → bare hash accepted

  **Replacement is owned by the shared model, not by the history entry point.**
  This task implements replacement parsing and closed-schema validation,
  semantic-identity and `replacementDigest` construction, replacement-graph
  acyclicity and cardinality, current-identity derivation, and the complete
  transitive current-dependent closure. It validates that current nodes point
  only to current prerequisites, while preserving historical references on
  non-current records. The history checker may compare two model states, but it
  does not become a second replacement-rule authority.

  Required current-revision fixtures under
  `tests/fixtures/governance/replacement/current/` include:

  | Case | Outcome |
  |---|---|
  | `runner/L8` replaced with `runner/L8-v2` while current `runner/L9` and `runner/L10` depend on it transitively | pass only with `L9-v2` and `L10-v2` in the same batch, with all new prerequisites repointed |
  | only a direct dependent replaced, or any current dependent left naming an old identity | fail (`ADV-G66`) |
  | historical `runner/L9` retaining its original `runner/L8` reference | pass; historical references are not checked against the current graph |
  | replacement landing carrying `Complete`/`Withdrawn` or inherited evidence, or replacement gate carrying delivery state | fail (`ADV-G66`); replacements initialize `Planned` or gate-without-delivery |
  | replacement digest omitting, swapping, or mislabelling any old/new semantic-identity input | fail (`ADV-G66`); `PROP-G10` covers preimage sensitivity |
  | replacement target is non-current, replacement forks/cycles, or kind changes | fail (`ADV-G66`)

  **Withdrawal is implemented here, not deferred to first use.** ADR-0021 puts
  `Withdrawn` in the closed lifecycle and requires its typed protocol, so
  specified-but-unimplemented is not an option; specified-and-fixture-exercised
  is. Required cases:

  | Case | Outcome |
  |---|---|
  | `Planned -> Withdrawn` with digest, evidence, attestation | pass (`EX-G25`) |
  | `InProgress -> Withdrawn` with digest, evidence, attestation | pass (`EX-G25`) |
  | without `withdrawalDigest` | fail (`ADV-G67`) |
  | without evidence | fail (`ADV-G67`) |
  | without attestation | fail (`ADV-G67`) |
  | withdrawal evidence mutated after terminal | fail (`ADV-G67`) |
  | `Withdrawn` counted as satisfying a prerequisite | fail (`ADV-G68`) |
  | any withdrawal-preimage field changed | `withdrawalDigest` changes (`PROP-G10`) |

- [ ] **2.4 Current-revision checker entry point**
  <!-- agent-task: 2.4 paths=scripts/check-governance-state.mjs checks=node,pytest risk=trust-critical prerequisites=2.3 -->

  A thin entry point over the model, implementing **no** rule of its own.

  **Proof required** — `EX-G12` offline run; `MUT-G05` a predicate
  re-implemented in the entry point is detected; every current-revision `ADV-`
  case above must fail through **this** entry point.

## 3. Verification net for PR-1

- [ ] **3.1 Current-revision hostile corpus**
  <!-- agent-task: 3.1 paths=tests/test_governance_state.py,tests/fixtures/governance/** checks=pytest risk=trust-critical prerequisites=2.4 -->
  **Proves** — `ADV-G01`–`G07`, `G09`, `G10`, `G12`, `G19`, `G23`, `G25`–`G28`,
  `G30`, `G33`, `G38`, `G39`, **`G50`**, **`G65`**, **`G67`**, **`G68`** (bare shorthand refused — proven here, in
  the landing that owns reference resolution); **`G66`** (replacement graph,
  closure, identity and lifecycle); PR-2 may repeat these as integration
  coverage

- [ ] **3.2 Property coverage**
  <!-- agent-task: 3.2 paths=tests/test_governance_state.py checks=pytest risk=high prerequisites=2.4 -->
  **Proves** — `PROP-G01`, `G02`, `G03`, `G06`, `G07`, `G08`, **`G09`**,
  **`G10`**; and `EX-G25` legal withdrawal

- [ ] **3.3 Mutation coverage**
  <!-- agent-task: 3.3 paths=tests/test_governance_state.py checks=pytest risk=trust-critical prerequisites=3.1 -->
  **Proves** — `MUT-G01`, `G02`, `G03`, `G05`, `G09`, `G11`, `G12`, `G13`

## PR-1 Completion Gate

- [ ] Every PR-1 task complete; every current-revision scenario proven through
      the real checker.
- [ ] **No two-revision case is claimed here** — those belong to PR-2.
- [ ] No rule implemented outside the model.
- [ ] **`governance/state.json` does not exist.**
- [ ] Review completed on one frozen head.

---

# PR-2 — History, renderer, query, and the candidate seed

**Still no canonical `governance/state.json`.** The seed lives at
`tests/fixtures/governance/candidate/`.

## 4. History validation

- [ ] **4.1 Git history adapter — bytes only**
  <!-- agent-task: 4.1 paths=scripts/governance/history/** checks=node,pytest risk=trust-critical prerequisites=2.4 -->
  Resolves a revision to bytes; encodes **no** rule.
  **Proof required** — `MUT-G06` a regression rule moved into the adapter is
  detected

- [ ] **4.2 History checker with exclusive explicit base**
  <!-- agent-task: 4.2 paths=scripts/check-governance-history.mjs checks=node,pytest risk=trust-critical prerequisites=4.1 -->

  **Implements** — *History validation uses an exclusive explicit base…*;
  `INV-G23`, the history portion of `INV-G45`, `INV-G16`; `D5.5`,
  `D5a.1` (history only), `D8.2`

  The checker invokes the shared model for both revisions. The replacement
  history fixture under `tests/fixtures/governance/replacement/history/` uses
  a base and target state. The history checker owns only the
  two-revision proof: it does not parse replacement semantics, derive current
  identities, or implement closure rules independently.

  **Proof required** — the two-revision corpus, which only this checker can
  prove
  - `ADV-G21` invalid / missing / non-commit base — **no fallback**
  - `ADV-G08` `Accepted -> Proposed` / `Accepted -> Rejected` regression
  - `ADV-G04h` accepted bytes **and** recorded digest replaced together
  - `ADV-G40` accepted acceptance-evidence mutated
  - `ADV-G11` `runner/GATE-U4` predicate mutated in place
  - `ADV-G13` `runner/L8` removed from `runner/L9`'s prerequisites
  - `ADV-G14` `runner/L9` repointed away from issue #57
  - `ADV-G15` node kind or completion policy mutated in place
  - `ADV-G16` a two-revision replacement-history violation: an old record,
    historical prerequisite reference, replacement relationship, replacement
    digest, or replacement attestation is edited, removed, repointed, or
    reassociated; or a new replacement identity, relationship and attestation
    do not arrive together. Current graph and closure semantics are delegated
    to the shared model and are covered by PR-1's `ADV-G66` and `EX-G26`.
  - `ADV-G18` authorization-evidence record introduced
  - `ADV-G29` terminal delivery evidence mutated or removed
  - `ADV-G34` record deleted or renumbered · `ADV-G35` resolver disappeared
  - `ADV-G41` a post-activation base carrying no registry — refused, never a
    second genesis
  - `ADV-G58` an unbound registry-less base claiming the exception
  - `ADV-G59` a replacement activation after a revert — v1 defines no
    reactivation protocol
  - `MUT-G04` explicit-base exclusivity → silent fallback
  - `MUT-G08` rule-input immutability → in-place edit permitted

## 5. Renderer and query

- [ ] **5.1 Deterministic renderer and marker registry**
  <!-- agent-task: 5.1 paths=scripts/render-governance-state.mjs checks=node,pytest risk=high prerequisites=2.4 -->
  **Implements** — *Projections are generated, registered, and byte-for-byte
  verified*; `INV-G21`, `INV-G22`; `D7.3`
  **Proof required** — `EX-G11` `--check` no-op, write mode separate;
  `ADV-G22` unregistered target/marker; `ADV-G36` hand-edited projection;
  `PROP-G04`; `MUT-G07` `--check` → non-byte-exact

- [ ] **5.2 Read-only query with separated axes**
  <!-- agent-task: 5.2 paths=scripts/query-governance-state.mjs checks=node,pytest risk=trust-critical prerequisites=2.4 -->
  **Implements** — *The query reports separate axes and never authorizes*;
  `INV-G06`, `INV-G07`, `INV-G08`; `D5.4`
  **Proof required** — `PROP-G05` no output contains `AUTHORIZED`; `ADV-G17`
  readiness read as authorization; `ADV-G18`; `EX-G18` the derived chain for a
  **hypothetical** ADR-0020 acceptance, proven as a fixture and **not** by
  transitioning any registry; `MUT-G05` axis separation → collapsed status

- [ ] **5.3 Scripts documentation for write vs `--check`**
  <!-- agent-task: 5.3 paths=scripts/README.md checks=none risk=low prerequisites=5.1 -->

## 6. Genesis machinery and the candidate seed

- [ ] **6.1 Closed genesis source manifest**
  <!-- agent-task: 6.1 paths=scripts/governance/genesis/**,tests/fixtures/governance/candidate/** checks=node,pytest risk=trust-critical prerequisites=4.2 -->

  **Implements** — *The version-one program is seeded whole, from a closed
  source manifest*; `INV-G28`; `D6.1`, `D6.2`

  **Change**
  Per-primitive rows: identity, exact path or typed external reference, source
  revision or content digest, extraction rule,
  `locally-verified | externally-attested`, human disposition.

  **The split is not "all rule inputs are externally attested".** Once this
  planning contract is merged, the values it states directly are
  content-addressable repository bytes, bound by **exact file blob identity at
  the PR #107 merge commit** — no archival step is required first, and an
  eventual archived copy is a later equivalence check:

  | Classification | Covers |
  |---|---|
  | **locally-verified** | the gate-predicate and node-kind vocabularies; the canonical identifier form; canonicalization and collection rules; completion-policy semantics and the envelope protocol; the whole-program enumeration; the activation contract |
  | **externally-attested** | historical interpretation of pre-registry evidence; node-to-policy assignment; source-conflict dispositions; acceptance of externally hosted anchors |

  **Proof required** — `ADV-G42` primitive with no manifest row; `ADV-G43`
  externally-attested row reported as locally verified

- [ ] **6.2 Candidate seed of the whole v1 program**
  <!-- agent-task: 6.2 paths=tests/fixtures/governance/candidate/** checks=node,pytest risk=trust-critical prerequisites=6.1 -->

  **Implements** — *Genesis authors primitives only…*; `INV-G25`, `INV-G26`;
  `D6.3`, `D6.4`

  **Change**
  Author **primitives only**: ADR lifecycles including **ADR-0020 `Proposed`**,
  `ADR-0020.resolves = ["U4"]`, the `runner/GATE-U4` predicate, and every node of
  the representable program — `runner/L2`…`runner/L10`, `runner/GATE-U6`,
  `runner/GATE-U4` — each with its kind, prerequisite set and authority anchor,
  including `runner/L9.requires = ["runner/GATE-U4","runner/L8"]` and
  `runner/L9`'s anchor issue #57.

  Delivery lifecycle, completion policy and evidence apply **only where the kind
  carries them**: gates have none, and only landings seeded `Complete` carry a
  policy and an envelope member.

  **`runner/L1` is deliberately not a node.** The constitution defines L1 as
  post-ratification human acts in externally hosted systems, which neither v1
  completion policy covers. Keeping it as a lifecycle-less node would leave
  `runner/L2` and `runner/L6` — both `Complete` — behind a permanently
  unsatisfiable prerequisite: an impossible graph. L1 is preserved in the source
  manifest and generated historical context with the original ratified DAG, and
  **`runner/L2` and `runner/L6` are seeded as roots**.

  **Author no conclusion.** U4 open, GATE-U4 unsatisfied and L9 `NotReady` are
  **derived** and asserted by tests and the query.

  Delivery lifecycle comes from **repository evidence**. The known source
  disagreement — the external index says L5 is next and L7 waits on L5, and
  issues #53/#55 are open, while the repository records both landed — is
  recorded with its human disposition and named by the attestation, never
  silently reconciled.

  **Proof required**
  - `EX-G16` before/after derivation identical — seeding moves nothing
  - `EX-G17` non-contiguous accepted set preserved, never a continuous range
  - `EX-G19` U4/GATE-U4/L9 derived, with no stored conclusion present
  - `ADV-G32` seed authoring an accepted lifecycle, a resolution, or a
    satisfaction
  - `ADV-G44` partial program seed
  - `ADV-G50` bare shorthand identifier refused
  - `ADV-G56` a completed node behind an unsatisfiable prerequisite is refused
  - `EX-G22` the seeded graph contains no node whose prerequisite no registry
    state can satisfy
  - `ADV-G45` delivery lifecycle taken from issue state rather than repository
    evidence

- [ ] **6.3 Genesis attestation and relationship equivalence**
  <!-- agent-task: 6.3 paths=scripts/governance/genesis/** checks=node,pytest risk=trust-critical prerequisites=6.2 -->
  **Proof required** — `ADV-G20` byte-correct seed asserting an undeclared
  relationship, failing **without** a prior revision; `ADV-G31` omitted /
  unparseable / conflicting source; `MUT-G10` equivalence digest → derived-count
  comparison only

- [ ] **6.4 Closed consumer inventory**
  <!-- agent-task: 6.4 paths=tests/fixtures/governance/candidate/consumers.json,scripts/governance/model/** checks=node,pytest risk=trust-critical prerequisites=5.1 -->

  **Implements** — *The migration is proven against a closed consumer
  inventory*; `INV-G29`; `D7.1`, `D7.2`

  **Change**
  Three contracts, kept distinct — the inventory is **not** one row per tracked
  file:

  | Contract | Definition |
  |---|---|
  | scan universe | **every tracked file**, not only Markdown — `openspec/config.yaml` is a YAML consumer ADR-0021 names by mandate |
  | inventory rows | every **discovered governance surface**, plus exact classified exclusions |
  | failure | a detected governance claim in a file with no row |

  Each row carries current path, fact classes copied, one of the five closed
  dispositions — `generated-region | stable-pointer | historical-record |
  retained-semantic-prose | not-a-governance-consumer` — the generated-region
  identifier where applicable, the migration landing, and the reason for any
  retained prose. **No sixth disposition exists**; the 26 surfaces discovered in
  live, unarchived OpenSpec changes are classified individually into those five,
  never as a category of their own.

  Counts are **generated from the enumeration**, never written beside it.

  The historical exemption is a **rule, not a glob**: archived, or evidenced as
  merged and frozen. The 26 files in live, unarchived OpenSpec changes are
  classified on their own merits.

  Lives at `tests/fixtures/governance/candidate/consumers.json` until
  activation.

  **Proof required** — `ADV-G46` surface absent from the inventory; `ADV-G47`
  `retained-semantic-prose` row with no reason; `ADV-G54` live unarchived change
  claiming the historical exemption; `EX-G20` historical records neither
  rewritten nor reported; `ADV-G60` a prose count disagreeing with the inventory; `EX-G21` counts
  regenerate to the enumeration

- [ ] **6.5 Genesis completion envelope**
  <!-- agent-task: 6.5 paths=scripts/governance/genesis/**,tests/fixtures/governance/candidate/** checks=node,pytest risk=trust-critical prerequisites=6.3 -->

  **Implements** — *Historical completions carry a genesis completion envelope*;
  `INV-G34`; `D6.6`

  **Change**
  One envelope at the schema-declared location `attestations.genesisCompletion`,
  binding the canonically ordered, duplicate-free set of
  `{landingId, genesisHistoricalCompletionDigest}` tuples (D3.2a) for the six
  landings seeded
  `Complete` — `runner/L2`, `runner/L3`, `runner/L4`, `runner/L5`, `runner/L6`,
  `runner/L7`.

  Each preimage binds the **observed** lifecycle `Complete`, the source-snapshot
  identity, authority anchor, completion policy, scoped delivered identity, and
  policy-specific evidence identities — and **no prior lifecycle**. The
  repository proves the observed state at genesis; it does not evidence whether
  the transition was `Planned -> Complete` or `InProgress -> Complete`, and
  supplying one would assert an unobserved fact. The envelope is excluded from
  its own preimage.

  Temporally honest wording: the owner reviewed historical delivery evidence
  **at genesis** and attested that it satisfies the selected policy. It does not
  claim an attestation existed at delivery time.

  **Proof required**
  - `ADV-G51` `Complete` landing with no envelope member
  - `ADV-G52` source-manifest row offered as an attestation
  - `ADV-G53` altering any member changes the envelope digest
  - `ADV-G57` a prior lifecycle bound into a genesis completion preimage
  - `EX-G23` the envelope's members are exactly the landings seeded `Complete`

- [ ] **6.6 Freeze the genesis artifacts for review**
  <!-- agent-task: 6.6 paths=tests/fixtures/governance/candidate/** checks=node,pytest risk=trust-critical prerequisites=6.5 -->

  **Implements** — *Genesis attestations are a human act on frozen artifacts*
  (step 1)

  Freeze the candidate state, source manifest, consumer inventory, evidence
  identities, historical-completion preimages, and every resulting digest, and
  present them as a reviewable set. This task computes and presents; it
  **records no attestation**.

- [ ] **6.7 Prove the attestation mechanism with test attestations**
  <!-- agent-task: 6.7 paths=tests/fixtures/governance/candidate/**,tests/test_governance_state.py checks=node,pytest risk=trust-critical prerequisites=6.6 -->

  **Implements** — *Genesis attestations are a human act on frozen artifacts*
  (step 1); `INV-G42` (the authorship limitation), `INV-G44` (member
  canonicalization)

  **Change**
  Exercise the whole attestation path — preimage construction, digest
  computation, envelope shape, member-set canonicalization, immutability — using
  **test** attestations over fixtures.

  **This task does not perform the real ceremony and must not claim it has.**
  The real attestation binds an `activationIdentity` that does not exist until
  the activation pull request is opened in PR-3. Binding a not-yet-allocated
  identity here would either force the ceremony to restart when the real number
  arrived, or make the binding self-referential.

  **Proof required**
  - `ADV-G62` a post-attestation edit to a bound artifact invalidates it
  - `PROP-G09` reordered envelope members produce identical bytes
  - `ADV-G65` duplicate `landingId`, or one `digest` under two landings
  - `EX-G24` the checker validates shape, bindings and digests and **makes no
    claim about authorship**

## 7. Verification net for PR-2

- [ ] **7.1 Two-revision hostile corpus**
  <!-- agent-task: 7.1 paths=tests/test_governance_state.py,tests/fixtures/governance/** checks=pytest risk=trust-critical prerequisites=4.2 -->
  **Proves** — `ADV-G04h`, `G08`, `G11`, `G13`–`G16`, `G18`, `G21`, `G29`,
  `G34`, `G35`, `G40`, `G41`, **`G58`**, **`G59`**. This includes a
  two-revision replacement fixture with a valid multi-level current cascade in
  the target, proving that the history checker rejects edits or reassociation
  of the old records and replacement envelopes while delegating current graph
  semantics to the shared model.

- [ ] **7.2 Genesis, projection, and query corpus**
  <!-- agent-task: 7.2 paths=tests/test_governance_state.py checks=pytest risk=trust-critical prerequisites=6.3,6.4,6.5,6.6,6.7,5.2 -->
  **Proves** — `ADV-G17`, `G20`, `G22`, `G31`, `G32`, `G36`, `G42`–`G47`,
  **`G51`–`G53`**, **`G54`**, **`G56`**, **`G57`**, **`G60`**; `G50` again as
  integration coverage, having been proven in PR-1;
  `EX-G16`, `G17`, `G18`, `G19`, `G20`, **`G21`**, **`G22`**, **`G23`**;
  `PROP-G04`, `G05`

  Every control added by this revision is owned here, so a landing completion
  gate cannot pass while a newly added proof was never executed.

- [ ] **7.3 Mutation coverage for PR-2**
  <!-- agent-task: 7.3 paths=tests/test_governance_state.py checks=pytest risk=trust-critical prerequisites=7.1 -->
  **Proves** — `MUT-G04`, `G06`, `G07`, `G08`, `G10`; `MUT-G08` includes
  identity-bearing replacement relationships and evidence, not only ordinary
  rule-input edits.

## PR-2 Completion Gate

- [ ] Every mechanism — history, renderer, query, genesis — proven against the
      candidate seed.
- [ ] **`governance/state.json` still does not exist**; the seed is at a fixture
      path and no consumer is generated from it.
- [ ] The consumer inventory enumerates every discovered governance surface,
      each carrying one of the five closed dispositions.
- [ ] The attestation mechanism is proven with **test** attestations, and this
      landing makes **no claim** that the real activation has been attested.
- [ ] Review completed on one frozen head.

---

# PR-3 — Atomic activation

**Indivisible.** This is the first and only revision in which the canonical
registry appears, and it appears already protected.

## 8. Activation

- [ ] **8.0 Open the activation pull request to allocate `activationIdentity`**
  <!-- agent-task: 8.0 paths=openspec/changes/governance-state-substrate/ACTIVATION-INTENT.md checks=manual risk=trust-critical prerequisites=7.3 -->

  The draft activation PR is opened **before** anything binds its identity,
  yielding a stable number.

  **How it is opened before it has a reviewable diff**, decided here rather than
  left to the implementer: the branch begins with a single **activation-intent
  commit** — a short, explicitly non-authoritative note under this change's own
  directory recording that the branch will carry the activation and holds no
  governance authority yet — exactly
  `openspec/changes/governance-state-substrate/ACTIVATION-INTENT.md`. It creates
  no `governance/` path and asserts no state.

  **Disposition:** the note is **deleted by the activation-seam commit (8.5a)**,
  so it does not survive into `main`. `activationIdentity` is the closed typed reference
  `{ type: "github-pull-request", repository, number }`, supplied to the checker
  by CI and compared byte-for-byte against the value the genesis evidence binds.

- [ ] **8.1 Human step: write the conditional handoff into the external index**
  <!-- agent-task: 8.1 paths=none checks=manual risk=trust-critical prerequisites=8.0 -->

  **Performed by the repository owner — no implementation agent can edit a
  GitHub issue.**

  **Implements** — *The external program index stops claiming authority at
  activation*; `INV-G37`; `D7.6`

  Written **before** activation, not at the merge boundary, because the
  repository and the external system share no transaction. An unconditional
  demotion would leave an interval with no authority anywhere, strand the index
  demoted if the merge were abandoned, and invert the race on revert.

  **Conditional text:**

  ```text
  Until activation PR #<number> is merged and governance/state.json exists on
  main, this issue remains the manual program-state authority.

  When both conditions are true, governance/state.json is authoritative and
  this issue becomes a human-facing mirror and authority-anchor index.

  If that activation is reverted and the canonical registry disappears, manual
  authority resumes and remains in force. Restoring the registry then requires
  a new governance decision, not a repeat of this activation.
  ```

  The last sentence matters: version one defines **no reactivation protocol**,
  and the genesis exception is bound to one activation identity. Promising that
  a replacement activation would restore the registry would describe a recovery
  path the history rule refuses.

  **Evidence bound by the activation change:** the index's stable identity, the
  exact conditional body bytes or their SHA-256, the activation change identity,
  and the expected canonical registry path.

  **Gate:** activation is **refused** unless that binding is present.

> **Tasks 8.2 through 8.5 are one commit.** The contract forbids any revision
> holding a canonical `governance/state.json` beside a surviving hand-authored
> copy. Committing them separately would violate that in the intermediate
> revisions even if the PR squash-merged correctly, so they are staged together
> and committed once as the **activation-seam commit**. The branch's content
> history is exactly: (1) the activation-intent note, (2) the complete seam,
> (3) the owner attestations — then verification only.

- [ ] **8.2 Promote the candidate artifacts to their canonical paths**
  <!-- agent-task: 8.2 paths=governance/state.json,governance/genesis-source-manifest.json,governance/consumers.json,governance/README.md checks=node,pytest risk=trust-critical prerequisites=8.1 -->

  The already-proven candidates move to their durable paths — no new authoring:

  | From | To |
  |---|---|
  | `tests/fixtures/governance/candidate/state.json` | `governance/state.json` |
  | `…/source-manifest.json` | `governance/genesis-source-manifest.json` |
  | `…/consumers.json` | `governance/consumers.json` |
  | — | `governance/README.md` (created here, with the domain) |

  The candidate directory is **removed**. If any part is retained as test
  evidence it is explicitly frozen and the checker refuses it as an authority.

  **Proof required** — `ADV-G55` a candidate copy left usable as authored
  current state after activation

- [ ] **8.3 Generate projections and delete the copies they replace**
  <!-- agent-task: 8.3 paths=governance/STATE.md,docs/decisions/INDEX.md,docs/architecture/unresolved-decisions.md checks=node,pytest,scaffold risk=trust-critical prerequisites=8.2 -->
  **Atomic with 8.2.** Each generated region and the deletion of the
  hand-authored values it replaces land together.
  **Proof required** — `EX-G14` generated index still satisfies
  `validate-scaffold.sh` bidirectional index rules

- [ ] **8.4 Replace every remaining enumerated consumer copy with a pointer**
  <!-- agent-task: 8.4 paths=<every stable-pointer row of the consumer inventory> checks=node,pytest,scaffold risk=trust-critical prerequisites=8.3 -->
  Scoped by the inventory, not by glob. `openspec/config.yaml` is the named
  regression case.

- [ ] **8.5 Turn on every gate in this same change**
  <!-- agent-task: 8.5 paths=.github/workflows/**,scripts/validate-scaffold.sh,scripts/check-governance-state.mjs checks=node,pytest,ci,scaffold risk=trust-critical prerequisites=8.4 -->
  Current-revision validation, **history validation**, prohibited-copy
  enforcement, and `governance/` structural coverage — all in the unconditional
  governance job, with an explicit base and the single D8.2 genesis exception.
  **Proof required** — `ADV-G24` prohibited claim reintroduced; `ADV-G48` a
  revision in which the canonical registry coexists with a surviving copy;
  `ADV-G55` a candidate copy left usable after activation

- [ ] **8.5a Stage 8.2–8.5 as the single activation-seam commit**
  <!-- agent-task: 8.5a paths=governance/**,docs/**,openspec/config.yaml,.github/workflows/**,scripts/** checks=node,pytest,scaffold risk=trust-critical prerequisites=8.5 -->

  One commit containing the registry, manifests, generated regions, every prose
  deletion and pointer conversion, both checkers, prohibited-copy enforcement
  and CI integration. **No intermediate revision may contain the registry
  alongside a copy it replaces.**

- [ ] **8.6 Freeze the complete activation seam**
  <!-- agent-task: 8.6 paths=governance/**,docs/**,openspec/config.yaml,.github/workflows/** checks=node,pytest,scaffold risk=trust-critical prerequisites=8.5a -->

  Every artifact the attestations will bind is now in its final state: registry,
  manifests, generated regions and their deletions, pointers, and all gates.
  Freeze the seam and present it for review.

- [ ] **8.6a Human step: establish independent merge control (`MAN-G02`)**
  <!-- agent-task: 8.6a paths=none checks=manual risk=trust-critical prerequisites=8.6 -->

  Before the owner records either real genesis attestation, and again before
  the activation landing is merged, the owner records in activation PR
  metadata which enforceable condition prevents the implementation actor from
  merging to `main`:

  - branch or ruleset protection requiring an owner-controlled merge path; or
  - credential separation demonstrating that the implementation actor and its
    available credentials cannot merge to `main`.

  The evidence and the merge-time re-check are `MAN-G02`. If neither condition
  is evidenced, the unsigned activation is refused: the owner must not record
  the real attestations and the activation must not merge. A future signed
  attestation path remains outside v1 and requires a separate decision.

- [ ] **8.7 Human step: record the two real genesis attestations**
  <!-- agent-task: 8.7 paths=governance/state.json checks=node,pytest,ci risk=trust-critical prerequisites=8.6a -->

  **Performed by the repository owner. An implementation agent may compute a
  digest; it may not attest to one.**

  **Implements** — *Genesis attestations are a human act on frozen artifacts*
  (steps 5–7); `INV-G42`; `MAN-G02` must already be evidenced

  This is the **last content change of the landing**. Attesting earlier would
  bind artifacts that later tasks then modify, so the "post-attestation head"
  would not be final — which is exactly why the ceremony sits here rather than
  before 8.2.

  | Field | Value |
  |---|---|
  | Actor | @mikegtech (repository owner) |
  | Attests | `attestations.genesis` — seed digest, relationship-equivalence digest, source-snapshot identity, base commit, **`activationIdentity` allocated by 8.0** |
  | Attests | `attestations.genesisCompletion` — envelope digest over the ordered `{landingId, digest}` tuples for `runner/L2`, `runner/L3`, `runner/L4`, `runner/L5`, `runner/L6`, `runner/L7` |
  | Evidence reviewed | exactly the seam frozen by 8.6, plus the allocated identity |
  | Authority reference | issue #106 |
  | **Recorded in** | **`governance/state.json`** — the `attestations` object, which 8.2 has already created |
  | Invalidated by | any change to a bound artifact; the ceremony restarts at 8.6 |

  **Authorship and merge control are review gates, not machine checks**
  (`MAN-G01` and `MAN-G02`). The offline checker proves shape, bindings,
  digests and subsequent immutability, and makes no claim about who authored
  the envelope or who could merge around the owner; the `actor` string and
  merge-control evidence are recorded assertions reviewed by the owner.

- [ ] **8.8 Verify on the post-attestation head**
  <!-- agent-task: 8.8 paths=none checks=node,pytest,scaffold,ci risk=trust-critical prerequisites=8.7 -->

  The checker, history checker, hostile suite, formatting, secret scan,
  `git diff --check` and hosted CI all run on the **exact head carrying the
  attestations**. The owner also re-checks `MAN-G02` at the merge gate. Nothing
  bound may change afterwards without restarting at 8.6.

  **Including this checklist.** Ticking a box edits `tasks.md`, which moves the
  head and would require CI to run again on a head the owner did not attest. So:
  **every repository task and status edit for PR-3 is made before 8.7**, and the
  evidence for 8.8 is recorded in **PR metadata only** — never by editing a file
  in the repository. Any repository edit after the attestation restarts the
  ceremony at 8.6.

## PR-3 Completion Gate

- [ ] The complete seam is present: registry, genesis attestation, **completion
      envelope**, source manifest, consumer inventory, generated regions **and
      their deletions**, pointers, all gates, bound conditional handoff.
- [ ] **The repository owner recorded both real attestations** (8.7) binding the
      `activationIdentity` allocated by 8.0, **after** the complete seam was
      built and frozen (8.6), and the full gate passed on that exact
      post-attestation head (8.8).
- [ ] Human review confirmed the owner performed the attestation act — the
      checker does not and cannot establish authorship.
- [ ] **`MAN-G02` was evidenced before attestation and re-checked at merge; an
      unsigned activation was refused if independent merge control was absent.**
- [ ] **No second copy of authored current state remains usable** — the
      candidate directory is removed or explicitly frozen and refused.
- [ ] **No surviving hand-authored copy of any fact the registry owns.**
- [ ] History validation is on **in this change**, not a later one.
- [ ] Reverting this change removes registry, regions and pointers together.
- [ ] **ADR-0020 still `Proposed`; U4 still derived open; GATE-U4 still derived
      unsatisfied; L9 still `NotReady`.**
- [ ] Formatting, secret scan, and `git diff --check` green on generated state.
- [ ] Review completed on one frozen head.

---

# PR-4 — PR #101 as the first consumer

**Not authorized here, and not part of the substrate's completion.**

- [ ] **9.1 Rebase and narrow PR #101**
  <!-- agent-task: 9.1 paths=docs/** checks=node,pytest,scaffold risk=trust-critical prerequisites=pr-3-merged -->

  **Prerequisite is a merged PR-3, not a task inside it.** The previous metadata
  named `8.5`, which would have permitted work on PR #101 before the seam was
  frozen (8.6), before the owner attested (8.7), before the final head was
  validated (8.8), and before PR-3 was reviewed and merged at all.

  Only after PR-1 through PR-3 have independently passed review and merged.
  PR #101 then retains only genuine semantic architecture edits — the two
  physical realizations of B4, the system topology, and the runner "Runs on"
  semantics — while ADR-0020 `Proposed -> Accepted` becomes one registry
  transition whose U4, GATE-U4, count, table and L9-blocker consequences are
  regenerated. ADR-0020's obligation F5 will then be satisfied by mechanical
  reconciliation rather than by hand-editing its five named documents.

  **Until then, PR #101 is not modified, rebased, narrowed, closed, or merged.**

---

## Deferred, with named owners

| Deferred item | Owning landing / authority |
|---|---|
| Locally consumable authorization-evidence contract | a **new ADR**; refused as an unknown field until then |
| Additional completion policies | a **new ADR** |
| Additional gate-predicate names or node kinds | a reviewed **schema-version change**; both vocabularies are closed for v1 |
| Nested `governance/AGENTS.md` | a later decision; v1 has none |
| Fact families beyond ADR-0021 §3 | a later ADR |

---

## Genesis state this plan must not disturb

No task in this change alters any of the following, and PR-1 through PR-3 must
each leave them unchanged until a separate, legal, human-attested transition
occurs:

- ADR-0001 through ADR-0019 and ADR-0021 `Accepted`; **ADR-0020 `Proposed`** —
  a **non-contiguous** accepted set, never compressed into a range
- **U4 derived open**; **GATE-U4 derived unsatisfied** — neither is authored
- `runner/L8` outstanding; `runner/L9` requires
  `["runner/GATE-U4","runner/L8"]`; `runner/L9` anchor issue #57; readiness
  derived `NotReady`
- No implementation authorization inferred from registry state, issue
  existence, accepted ADRs, or satisfied prerequisites
