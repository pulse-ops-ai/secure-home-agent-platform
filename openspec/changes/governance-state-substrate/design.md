# Design: governance-state-substrate

Technical design for the ADR-0021 governance-state substrate. This artifact
defines **how** the accepted behavior will be implemented. It implements
nothing, and no task in this change is executed.

> **Revised after review 5056996739.** The first version built the machinery
> incrementally and landed `governance/state.json` at its canonical path four
> landings before the prose copies were deleted. That is the coequal-authority
> defect the proposal itself prohibits: nothing makes a file at the canonical
> authoritative path non-authoritative, and calling it "inert" does not make it
> so. The sequence below builds everything first and makes the canonical
> registry's **first appearance** an atomic activation.

---

## D1. Component architecture and the single semantic owner

```text
                    governance/state.json          (authored authority)
                              │
                              ▼
                    ┌───────────────────┐
                    │  model/evaluator  │  ← THE SOLE SEMANTIC OWNER
                    │  parse · validate │
                    │  derive · explain │
                    └───────────────────┘
                      │     │     │     │
        ┌─────────────┘     │     │     └─────────────┐
        ▼                   ▼     ▼                   ▼
  current checker    history checker   renderer      query
  (one revision)     (two revisions)   (projections) (explain)
                            │
                            ▼
                     git history adapter
                     (bytes only, no rules)
```

**D1.1 — One implementation of every rule.** The model owns parsing,
canonicalization, schema closure, digest computation, lifecycle legality,
predicate evaluation, readiness derivation, and explanation. The four entry
points are thin: they select inputs, call the model, and format output. A
validator, renderer, query command, or test that re-implements a predicate is a
second rule authority and a defect.

**D1.2 — The Git adapter carries no rules.** It resolves a revision to bytes
and nothing else. History semantics live in the model, which is handed two
parsed states.

**D1.3 — Tests consume the model.** `tests/test_governance_state.py` exercises
the real entry points over real fixtures. Independent re-derivation is a
deliberate proof technique, never the mechanism under test.

### Responsibilities

| Component | Owns | Must not |
| --- | --- | --- |
| `model` (shared) | canonical parse, schema closure, digests, lifecycle legality, predicates, readiness, explanations | read Git, write files, format human output, reach the network |
| `check-governance-state.mjs` | select current revision, invoke model, report | implement any predicate or legality rule |
| `check-governance-history.mjs` | select explicit base, invoke adapter for bytes, invoke model for comparison | infer a base; encode regression rules |
| `git history adapter` | revision → bytes | interpret content |
| `render-governance-state.mjs` | deterministic projection; registered targets/markers; `--check` vs write | derive anything the model does not; edit unregistered files |
| `query-governance-state.mjs` | read-only explanation, human and JSON forms | return `AUTHORIZED`; collapse axes; mutate state |

---

## D2. Conceptual registry schema and closed vocabularies

Field spelling may be refined during implementation within ADR-0021 §3's decided
ownership and semantics. The shape:

```json
{
  "schemaVersion": 1,
  "adrs": [
    {
      "id": "ADR-0020",
      "path": "docs/decisions/ADR-0020-place-runner-control-by-workload-class.md",
      "title": "Place runner-control by workload class",
      "lifecycle": "Proposed",
      "proposedOn": "2026-08-24",
      "resolves": ["U4"],
      "supersedes": [],
      "acceptance": null
    }
  ],
  "questions": [
    { "id": "U4", "anchor": "docs/architecture/unresolved-decisions.md#u4", "title": "…", "severity": "medium" }
  ],
  "gates": [
    {
      "id": "GATE-U4",
      "predicate": { "name": "exactly-one-current-accepted-resolver", "question": "U4" },
      "sources": ["docs/decisions/ADR-0021-establish-machine-readable-governance-state.md#3c"]
    }
  ],
  "landings": [
    {
      "id": "runner/L9",
      "kind": "implementation-landing",
      "requires": ["runner/L8", "GATE-U4"],
      "authorityAnchor": { "type": "github-issue", "repository": "pulse-ops-ai/secure-home-agent-platform", "number": 57 },
      "delivery": { "lifecycle": "Planned", "completionPolicy": null, "completion": null }
    }
  ],
  "externalReferences": [],
  "attestations": { "genesis": {} }
}
```

**Absent by construction** — derived, and an unknown field if authored:
accepted counts and ranges; `isCurrent`, `isImmutable`, `resolvesU4`;
`question.resolved`; `gate.satisfied`; `landing.blockedOn`;
`prerequisiteReadiness`; any `authorized` field.

### D2.1 Closed vocabularies — all enumerated for v1

| Vocabulary | v1 values |
| --- | --- |
| ADR lifecycle | `Proposed`, `Accepted`, `Superseded`, `Rejected` |
| Delivery lifecycle | `Planned`, `InProgress`, `Complete`, `Withdrawn` |
| Completion policy | `reviewed-delivery-v1`, `reviewed-spike-evidence-v1` |
| **Gate predicate** | **`exactly-one-current-accepted-resolver`** — the only v1 predicate |
| **Node kind** | **`program-ratification`, `implementation-landing`, `spike-landing`, `gate`** |
| Identity class | `local-git-commit`, `external-git-commit`, `content-sha256` |
| Anchor type | `github-issue`, `github-pull-request`, `task-contract` |
| Question severity | `critical`, `high`, `medium` |
| Readiness | `Ready`, `NotReady` |
| Authorization assessment | `PREREQUISITES_NOT_READY`, `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` |

`AUTHORIZED` is absent from the last vocabulary by construction.

**One predicate is sufficient for v1.** Both existing gates — GATE-U4 and
GATE-U6 — are resolver gates over a question. Adding a predicate name is a
reviewed schema-version change, not an implementation liberty, because
predicates are identity-bearing rule inputs (ADR-0021 §3 D.1).

### D2.2 Severity is in v1, authored, and deliberately rule-free

Severity **is** included as an authored primitive on the question record, and is
explicitly:

- **non-rule-bearing** — no predicate, readiness derivation, or gate may consume
  it, and the model must not branch on it;
- **not identity-bearing** — it is not part of a gate or landing semantic
  identity under §3 D.1, so it is ordinarily editable by a reviewed change;
- **included in `primitiveDigest`** and bound by the genesis attestation,
  because it is a primitive record field;
- **rendered** into the unresolved-decision projection, which is why it must be
  authored rather than excluded: a generated table cannot render a value the
  registry does not hold.

History treats severity as ordinary mutable data: changing it is legal and
requires no attestation. This is decided here, not deferred, because the choice
changes the closed schema, canonical bytes, `primitiveDigest`, the genesis
attestation, history rules, and the projection.

---

## D3. Canonicalization, collections, and digest preimages

**D3.1 — Canonical form.** UTF-8, LF, two-space indent, object keys in a defined
order, no trailing whitespace, one trailing newline, no non-finite numbers, no
duplicate keys. The parser is a **strict reader**, not host `JSON.parse`: it
rejects duplicate keys *before* object construction. `state.json` must equal its
own canonical serialization byte for byte.

**D3.2 — Collection semantics.** Object-key order alone is insufficient: array
order changes bytes and therefore every digest. Each collection is classified,
and the classification is part of the schema:

| Collection class | Members | Canonical rule | Duplicates | Order meaning |
| --- | --- | --- | --- | --- |
| **Entity** | `adrs[]`, `questions[]`, `gates[]`, `landings[]`, `externalReferences[]` | sorted by stable id, ascending | **rejected** (duplicate identifier) | none |
| **Set-valued relationship** | `resolves[]`, `supersedes[]`, `requires[]`, `sources[]` | sorted, ascending | **rejected** (duplicate member) | **none** — `["L8","GATE-U4"]` and `["GATE-U4","L8"]` are the same value and must produce identical bytes |
| **Sequence-valued** | reviewed ordering intent, where order is explicitly semantic | order preserved as authored | rejected | **semantic**, and therefore included in the identity-bearing preimage |

A sequence-valued field exists only where ADR-0021 §3 D.1's "reviewed ordering
intent" applies. Every other array is a set: the canonical sort makes logically
equal states byte-equal, so `primitiveDigest`, `relationshipDigest`, the seed
identity, and every transition identity are stable under reordering.

**D3.3 — Digest classes.** Each is SHA-256 over a canonical serialization of a
defined preimage:

| Digest | Preimage |
| --- | --- |
| `contentDigest` | the exact bytes of a referenced artifact |
| `primitiveDigest` | all primitive records, **attestation envelopes excluded** |
| `relationshipDigest` | canonical relationship tuples (`resolves`, `supersedes`) |
| `transitionDigest` | `{schemaVersion, priorStateDigest\|null, targetPrimitiveDigest, subject, from, to, contentDigest, relationshipDigest}` |
| `completionDigest` | `{landingId, from, to, authorityAnchor, deliveredIdentity, completionPolicy, …policy-specific}` |
| `seedDigest` / `relationshipEquivalenceDigest` | genesis registry, and the source-comparison tuples |

**D3.4 — Non-self-reference, stated precisely.** Every attestation is **excluded
from the preimage it attests**. Two consequences that must both be stated,
because the first version of this design asserted a property that contradicts
the second:

1. Changing any **preimage** field changes the corresponding transition,
   completion, or seed digest.
2. Changing the **attestation envelope** does **not** change the digest it
   attests — by construction. An unauthorized envelope change is caught by
   evidence validation and history immutability, **not** by a digest mismatch.

---

## D4. Identity verification and fail-closed behavior

| Identity class | Verification | Failure |
| --- | --- | --- |
| `local-git-commit` | object must exist in the checked-out repository; delivered bytes bound to the landing's declared scope | absent or unscoped ⇒ **fail closed**, landing unsatisfied, report `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION` |
| `external-git-commit` | shape only; explicitly **not** offline proof of availability | never reported as locally proven |
| `content-sha256` | recompute over the referenced path and compare | mismatch or missing path ⇒ fail |
| anchor (`github-issue`, …) | shape and closed type only; never fetched | malformed ⇒ fail; well-formed ⇒ still no authorization |

**D4.1 — An unscoped commit is not proof.** A bare hash naming a landing does
not establish delivery.

**D4.2 — Offline is a property.** No network access. Live external
authorization is answered with `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION`,
never guessed from a URL, number, or issue title.

**D4.3 — Issue open/closed state is never delivery evidence.** See D6.4: the
program index and its child issues are demonstrably stale relative to the
repository. They are anchors and mirrors, not proof.

---

## D5. Legality decision tables

### D5.1 ADR lifecycle

| From | To | Evidence present | Outcome |
| --- | --- | --- | --- |
| `Proposed` | `Accepted` | attestation + accepted-byte digest + atomic header transition | **legal** |
| `Proposed` | `Accepted` | any missing | refuse |
| `Proposed` | `Rejected` | attestation bound to final rejected bytes | **legal** |
| `Accepted` | `Superseded` | new accepted ADR with valid `supersedes`; old bytes unchanged | **legal** |
| `Accepted` | `Superseded` | no superseding accepted ADR | refuse |
| `Accepted` | `Proposed` / `Rejected` | any | refuse |
| `Rejected` | anything | any | refuse |
| `Proposed` | `Superseded` | any | refuse |

### D5.2 Header mirror

| Registry lifecycle | Required document header | Bytes |
| --- | --- | --- |
| `Proposed` | `Proposed` — checked mirror | mutable |
| `Accepted` | `Accepted` | pinned, immutable |
| `Rejected` | `Rejected` | pinned, immutable |
| `Superseded` | **`Accepted`** — historical, deliberately not rewritten | pinned, immutable |

### D5.3 Prerequisite satisfaction

| Kind | Delivery lifecycle | Completion evidence | Satisfied |
| --- | --- | --- | --- |
| landing | `Complete` | validates | **yes** |
| landing | `Complete` | missing / opaque / failing | no — fail closed |
| landing | `Planned` / `InProgress` / `Withdrawn` | any | no |
| gate | — | predicate true | **yes** |
| gate | — | predicate false or unevaluable | no — unevaluable also fails the checker |

### D5.4 Query axes

| Delivery | Readiness | Prospective assessment |
| --- | --- | --- |
| `Planned` / `InProgress` | `NotReady` | `PREREQUISITES_NOT_READY` |
| `Planned` / `InProgress` | `Ready` | `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` |
| `Complete` / `Withdrawn` | reported | non-applicable (`null`); historical answered separately |

No row yields `AUTHORIZED`.

### D5.5 History base selection

| Base supplied | Readable | Is a commit | Carries a registry | Outcome |
| --- | --- | --- | --- | --- |
| yes | yes | yes | yes | compare |
| yes | yes | yes | **no** | **genesis exception** — see D8.2 |
| yes | yes | no | — | fail; no fallback |
| yes | no | — | — | fail; no fallback |
| no | — | — | — | fail; no inference |

---

## D6. Genesis: a closed source manifest

The first version listed three source kinds and then claimed to prove
equivalence for facts none of them contains. The bootstrap proof is only as
good as an enumerated, per-primitive source map.

**D6.1 — Every primitive maps to a row.** The genesis source manifest is a
checked-in artifact. Each row carries:

```text
primitive identity
exact repository path, or typed external reference
source revision or content digest
extraction rule
classification: locally-verified | externally-attested
human disposition, where the source is ambiguous or disagrees
```

A primitive with no row is a bootstrap failure. A row whose extraction fails,
is ambiguous, or disagrees with the registry is a bootstrap failure requiring
human review — never silently treated as empty or equivalent.

**D6.2 — Source map by fact family.**

| Fact family | Source | Extraction | Class |
| --- | --- | --- | --- |
| ADR identity, path, title, proposal date, lifecycle | `docs/decisions/ADR-*.md` headers | structural header parse | locally-verified |
| ADR accepted/rejected bytes | the ADR file | SHA-256 over bytes | locally-verified |
| `resolves` / `supersedes` | ADR headers (`Closes`, `Decides`, governed equivalents), `docs/decisions/INDEX.md` | labelled parse; **no prose inference** | locally-verified |
| Acceptance evidence, actor, time | acceptance records in `docs/decisions/INDEX.md`; reviewed commits | structural parse + Git object | locally-verified where the object exists |
| Question identity, anchor, title, severity | `docs/architecture/unresolved-decisions.md` | table + heading parse | locally-verified |
| Question resolution banners (cross-check only) | same file | banner parse | locally-verified |
| **Gate identity and predicate** | ADR-0021 §3C; `docs/decisions/INDEX.md`; issue #19 | **human-attested rule declaration**, cross-checked against the DAG | **externally-attested** |
| **Node kind, prerequisites, ordering** | `openspec/changes/archive/2026-08-09-runner-baseline-adoption/tasks.md` (the ratified DAG); issue #19's DAG line | archived-constitution parse, cross-checked | locally-verified (archive) + externally-attested (issue) |
| **Authority anchors** | issue #19's landing tree; each child issue | typed reference extraction | **externally-attested** |
| **Delivery lifecycle and completion evidence** | merged PRs, commits, archived child OpenSpec changes, spike evidence roots | policy-specific identity verification (D4) | locally-verified where objects exist |
| **Completion policy identity** | per-landing human declaration | human attestation | **externally-attested** |

**D6.3 — Complete v1 program enumeration.** Version one seeds the whole runner
program, not a selection. Naming only L6/L8/L9/GATE-U4 would leave most of the
27 measured sequencing copies outside the authority.

| Node | Kind | Prerequisites | Anchor | Delivery | Policy |
| --- | --- | --- | --- | --- | --- |
| `runner/L1` | program-ratification | — | PR #48 / `openspec/specs/runner-adoption/spec.md` | Complete | `reviewed-delivery-v1` |
| `runner/L2` | implementation-landing | L1 | issue #51 | Complete | `reviewed-delivery-v1` |
| `runner/L3` | implementation-landing | L2 | issue #52 | Complete | `reviewed-delivery-v1` |
| `runner/L4` | implementation-landing | L3 | issue #27 | Complete | `reviewed-delivery-v1` |
| `runner/L5` | implementation-landing | L4 | issue #53 | Complete | `reviewed-delivery-v1` |
| `runner/L6` | spike-landing | L1 | issue #54 | Complete | `reviewed-spike-evidence-v1` |
| `GATE-U6` | gate | — | ADR-0013 / issue #11 | — | — |
| `runner/L7` | implementation-landing | L5, GATE-U6, L6 | issue #55 | Complete | `reviewed-delivery-v1` |
| `runner/L8` | implementation-landing | L7 | issue #56 | **Planned** | — |
| `GATE-U4` | gate | — | ADR-0020 / issue #9 | — | — |
| `runner/L9` | implementation-landing | L8, GATE-U4 | **issue #57** | **Planned** | — |
| `runner/L10` | implementation-landing | L8, L9 | issue #58 | Planned | — |

The DAG matches the ratified constitution:
`L2←L1 · L3←L2 · L4←L3 · L5←L4 · L6←L1 · L7←L5+GATE-U6(+L6) · L8←L7 ·
L9←L8+GATE-U4 · L10←L8+L9`.

Each `Complete` row requires its own policy-specific evidence under D4; a row in
this table is a **seeding obligation**, not a completion proof. Where evidence
cannot be locally verified, the seed records the landing as not-completable and
the checker fails closed rather than accepting the table.

**D6.4 — A real source disagreement, and its disposition.** Issue #19 states
`L5 — next runner landing` and `L7 — waits on L5`, and issues #53 and #55 are
open — while the repository records both L5 image lineage and L7 adapters as
landed. This is not a defect to paper over; it is the disagreement the seed
must resolve, and it is recorded as such:

- **Disposition.** Delivery lifecycle is seeded from **repository evidence**
  (merged PRs, commits, archived child OpenSpec changes), never from issue
  prose or issue open/closed state.
- **Issue #19 and its children are anchors and mirrors only.** An open issue is
  not evidence that work is outstanding, and a closed one is not evidence that
  it is done.
- The disagreement is recorded in the genesis source manifest with a human
  disposition, and the bootstrap attestation names it. It is not silently
  reconciled.

**D6.5 — Attestation construction.** Bind `seedDigest`,
`relationshipEquivalenceDigest`, source-snapshot identity, actor, RFC 3339 time,
and a typed authority reference, with `priorStateDigest: null`, the attestation
excluded from its own preimage. The separate equivalence digest is what makes a
byte-correct seed asserting an undeclared relationship detectable **without** a
prior registry revision.

---

## D7. Consumer inventory, projections, and migration

**D7.1 — A closed consumer inventory, not a glob.** Completeness is provable
only against an enumerated set. The inventory is a checked-in artifact; every
row carries current path, the fact classes it currently copies, its target
disposition, its generated-region identifier where applicable, its migration
landing, and the reason for any retained current-state-looking prose.

Dispositions: `generated-region`, `stable-pointer`, `historical-record`,
`retained-semantic-prose`, `not-a-governance-consumer`.

**D7.2 — Measured inventory at `eb6e248`.** 40 live consumer files, classified
by the fact classes they copy (`adr-range`, `adr-status`, `u-count`, `u-state`,
`gate-seq`):

| Disposition | Files | Members |
| --- | --- | --- |
| **generated-region** | 2 | `docs/decisions/INDEX.md` (lifecycle regions), `docs/architecture/unresolved-decisions.md` (summary table, resolution banners) |
| **stable-pointer** | 38 | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `docs/AGENTS.md`, `docs/README.md`, `docs/architecture/INDEX.md`, `docs/operations/INDEX.md`, `docs/operations/pi-bootstrap.md`, `agents/AGENTS.md`, `agents/adapters/README.md`, `deploy/AGENTS.md`, `deploy/compose/README.md`, `deploy/images/README.md`, `deploy/runtime/README.md`, `services/AGENTS.md`, `services/README.md`, `services/control-plane/README.md`, `services/runner-control/README.md`, `packages/runner-core/README.md`, `knowledge/README.md`, `knowledge/household/README.md`, `knowledge/platform/README.md`, `knowledge/platform/degraded-operation/README.md`, `knowledge/runbooks/README.md`, `profiles/household/README.md`, `schemas/automation/README.md`, `openspec/AGENTS.md`, `openspec/config.yaml`, `.github/copilot-instructions.md`, `.github/agents/architecture.agent.md`, `.github/agents/implementation.agent.md`, and the architecture documents carrying only `u-state` links (`api-contract-model.md`, `degraded-mode.md`, `distributed-effect-lifecycle.md`, `effect-boundary-model.md`, `knowledge-promotion-model.md`, `knowledge-selection-model.md`, `runner-model.md`) |
| **retained-semantic-prose** | `docs/architecture/agent-triage-and-escalation.md` | carries a `u-count`-shaped phrase that is explanatory, not a current-state claim; reason recorded per row |
| **historical-record — excluded from rewriting** | 52 | accepted ADR bodies (`docs/decisions/ADR-*.md`), archived and merged OpenSpec change artifacts (`openspec/changes/**`), spike evidence (`docs/spikes/**`), and the canonical `openspec/specs/runner-adoption/spec.md`, which changes only through validated archive |
| **not-a-governance-consumer** | 2 | `openspec/schemas/governed-spec-driven-v1/templates/{proposal,design}.md` — schema template text, not a state copy |

A file absent from the inventory is a **migration failure**, not a pass. The
prohibited-copy gate operates over the enumerated `generated-region` and
`stable-pointer` rows.

**D7.3 — Markers.** Each generated region carries an explicit begin/end marker
naming target and region, registered by the renderer. An unregistered target or
marker is an error. `--check` fails unless the render is a byte-for-byte no-op;
write mode is a separate invocation, and the scripts documentation records that
distinction.

**D7.4 — Migration order.** There is exactly one migration moment. See D11: the
canonical registry, the generated regions, the pointers, and every gate arrive
together. There is no interval in which a canonical `state.json` coexists with a
hand-authored copy of a fact it owns.

**D7.5 — `openspec/config.yaml`** is a named regression case: it becomes a
pointer, and a test proves it cannot revert to an independent state store.

**D7.6 — Issue #19 requires a human act.** No implementation agent can edit a
GitHub issue. Unless a human act is part of the activation gate, issue #19 keeps
declaring itself *"the mutable program index … where landing links and current
execution state live"* after `state.json` becomes authoritative — a second
mutable authority, externally hosted.

The activation gate therefore includes a human-only step specifying: the exact
replacement wording (#19 becomes a human-facing mirror and authority-anchor
index pointing at `governance/STATE.md`, explicitly disclaiming current-state
authority); who performs it (the repository owner); when (immediately before the
activation merge); the evidence (issue revision identity recorded in the
activation change); the rollback wording (restoring the prior text); and a gate
that **refuses activation while issue #19 still claims coequal authority**.

---

## D8. CI execution and base selection

**D8.1 — Unconditional job.** Governance validation runs in the unconditional
governance job, never behind affected-target classification: a change that edits
no governance file can still invalidate a projection. Generated state must also
pass formatting, secret scanning, and `git diff --check`; renderer targets that
are indexes keep their existing structural checks, and `validate-scaffold.sh`
gains structural coverage of the `governance/` domain. The v1 layout has **no**
nested `governance/AGENTS.md`.

**D8.2 — Explicit base, and the single genesis exception.** The base is supplied
explicitly by CI and is exclusive: invalid, missing, unreadable, or not a commit
⇒ fail, with no fallback to `merge-base`, `HEAD~1`, or any inferred revision.

There is exactly one exception, and it is narrow:

```text
Activation revision  — the base commit carries no registry.
                       No prior revision exists to compare against, so the
                       GENESIS ATTESTATION is the proof, and history
                       comparison is not applicable.

Every later revision — an explicit, valid, registry-bearing base is
                       REQUIRED. Absence of a registry in the base is a
                       failure, not a second genesis.
```

The exception is keyed to "the base carries no registry", which is true exactly
once. A later revision whose base lacks a registry means the registry was
deleted — a refusal, not a re-genesis.

---

## D9. Shared versus independently implemented logic

**Shared — exactly one implementation:** canonical parse and serialization;
collection canonicalization; digest computation; schema closure; lifecycle
legality; predicate evaluation; readiness derivation; explanation construction.

**Independently implemented:** the conformance suite's *expectations*, where a
proof requires independent re-derivation.

**Deferred to later landings:** any locally consumable authorization-evidence
contract (new ADR); additional completion policies (new ADR); additional gate
predicate names or node kinds (reviewed schema-version change); a nested
`governance/AGENTS.md`; any fact family beyond ADR-0021 §3.

---

## D10. Alternatives considered and rejected

1. **Derive everything from ADR headers, no authored registry.** Rejected on
   evidence: `Status`/`Date`/`Deciders` parse across all 21 ADRs, but `Closes`
   appears in 7 of 21 with prose values and ADR-0020 uses `Decides`. Accepted
   ADRs are immutable, so structure cannot be retrofitted.
2. **Registry beside the ADRs under `docs/decisions/`.** Rejected by ADR-0021
   §1.
3. **Land the registry first and migrate copies later** — the first version of
   this design. **Rejected on review:** it creates the coequal surface the
   proposal prohibits. Nothing makes a file at the canonical path
   non-authoritative, and "inert" is a description, not a mechanism.
4. **A regex scan over all prose as the enforcement mechanism.** Rejected as an
   authority; retained as defense in depth only.
5. **Let the history checker infer its base.** Rejected: a wrong-revision
   comparison looks green.
6. **Store `blockedOn` beside `requires`.** Rejected: the exact
   primitive/derived collapse that produced the defect.
7. **Seed only the nodes named in ADR-0021's examples.** Rejected: it would
   leave most of the 27 measured sequencing copies outside the authority.
8. **Exclude severity from v1.** Rejected: the unresolved-decision projection
   renders it, and a generated table cannot render what the registry does not
   hold. Included as rule-free data instead (D2.2).

---

## D11. Landing seams

Three landings. **All machinery is built and proven before the canonical
registry exists.**

| Landing | Ships | Canonical `state.json`? | Authority posture |
| --- | --- | --- | --- |
| **PR-1** | model, strict reader, collection canonicalization, current checker, its proof net | **no** | none |
| **PR-2** | history checker, renderer, query, genesis machinery, **candidate** seed at a fixture path, full proof net | **no** | none |
| **PR-3** | **atomic activation** | **first appearance** | authoritative |

**PR-3 is indivisible.** It contains, in one change:

```text
governance/state.json                 (canonical path, first appearance)
governance/README.md
governance/STATE.md                   (generated)
genesis attestation + source manifest
generated decision-index regions      + deletion of the copies they replace
generated unresolved-decision regions + deletion of the copies they replace
stable pointers in all 38 pointer consumers
prohibited-copy enforcement
current-state validation in CI
history validation in CI              (with the D8.2 genesis exception)
validate-scaffold.sh coverage
the human issue #19 mirror transition, evidenced
```

**Why each element is in PR-3 and not later.**

- *Generated regions and pointers* — because a canonical registry beside a
  hand-authored copy is the defect.
- *History validation* — because the first authoritative revision must also be
  the first protected one. If history landed afterwards, a change in between
  could mutate an accepted lifecycle, accepted bytes, a gate predicate, L9's
  prerequisites, issue #57's anchor, or terminal completion evidence; the
  current checker would see an internally valid snapshot and accept it, and once
  history was enabled that corrupted snapshot would already be the base.
- *Prohibited-copy enforcement* — because the deletions it protects happen here.
- *The issue #19 transition* — because otherwise an external mutable authority
  outlives activation.

**PR-2's candidate seed lives at a fixture path** — under
`tests/fixtures/governance/candidate/` — never at `governance/state.json`. It is
validated by PR-1's checker and PR-2's history and genesis machinery, so that
PR-3 promotes an already-proven artifact rather than authoring a new one.

**Rollback.** Reverting PR-3 removes `governance/state.json`, the generated
regions, and the pointers **together**, restoring the prior hand-authored copies
from Git history. There is no state in which the registry survives its
migration. The first version's rollback was defective: reverting its activation
landing would have restored the prose while leaving `state.json` behind — two
authorities again, arrived at from the other direction.

**PR #101 follows all three**, as the first consumer, and is untouched until
then.
