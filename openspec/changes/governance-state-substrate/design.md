# Design: governance-state-substrate

Technical design for the ADR-0021 governance-state substrate. This artifact
defines **how** the accepted behavior will be implemented. It implements
nothing, and no task in this change is executed.

> **Revised again after review 5058244198** — `runner/L1` leaves the active
> readiness graph, the genesis completion envelope gets a computable preimage
> and a schema location, v1 declares no generic reactivation, and the consumer
> inventory's counts become one derived number instead of two contradictory
> ones.
>
> **Revised after review 5058112067** — canonical namespaced identifiers,
> L1's real identity, a genesis completion envelope for historical `Complete`
> landings, a conditional external-index handoff, and a corrected consumer
> inventory whose numbers are generated rather than copied.
>
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
      "id": "runner/GATE-U4",
      "predicate": { "name": "exactly-one-current-accepted-resolver", "question": "U4" },
      "sources": ["docs/decisions/ADR-0021-establish-machine-readable-governance-state.md#3c"]
    }
  ],
  "landings": [
    {
      "id": "runner/L9",
      "kind": "implementation-landing",
      "requires": ["runner/L8", "runner/GATE-U4"],
      "authorityAnchor": { "type": "github-issue", "repository": "pulse-ops-ai/secure-home-agent-platform", "number": 57 },
      "delivery": { "lifecycle": "Planned", "completionPolicy": null, "completion": null }
    }
  ],
  "externalReferences": [],
  "attestations": {
    "genesis": {},
    "genesisCompletion": {}
  }
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
| **Node kind** | **`implementation-landing`, `spike-landing`, `gate`** |
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

### D2.2 Program-node identifiers are namespaced, and the namespace is the identity

Every program node identifier is **namespaced**, byte-for-byte, everywhere:

```text
runner/L2 … runner/L10        runner/GATE-U6        runner/GATE-U4
```

The namespace is not decoration. A second governed program may one day
introduce its own `L8` or `GATE-U4`, and a closed graph cannot resolve a
collision by inference.

The bare form is therefore **not an alias**. `L8` is an unregistered identifier
and a dangling reference: the checker fails rather than resolving it to
`runner/L8`. This spelling is used identically in registry entity ids,
prerequisite references, source-manifest rows, query arguments, generated
projections, fixtures, hostile mutations, and the later ADR-0020 transition.

Decision identifiers (`ADR-0020`) and question identifiers (`U4`) are already
globally unique within their own collections and are not namespaced.

### D2.3 Severity is in v1, authored, and deliberately rule-free

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
| **Set-valued relationship** | `resolves[]`, `supersedes[]`, `requires[]`, `sources[]` | sorted, ascending | **rejected** (duplicate member) | **none** — `["runner/GATE-U4","runner/L8"]` and its reverse are the same value and must produce identical bytes |
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

**D6.2a — This planning contract becomes a local source once merged.** After
PR #107 is reviewed, merged, and archived, its artifacts are content-addressable
repository evidence. The genesis manifest binds their exact archived paths and
content digests, so these values are **locally verified** rather than resting on
an external human assertion:

- the gate-predicate vocabulary and the node-kind vocabulary (D2.1);
- the canonical identifier form (D2.2) and canonicalization rules (D3);
- completion-policy semantics and the envelope protocol (D6.6);
- the whole-program enumeration (D6.3);
- the activation contract (D11).

Human attestation remains required, and is not replaced, for: historical
interpretation of pre-registry evidence; node-to-policy assignment; source
conflict dispositions; and acceptance of externally hosted anchors.

**D6.3 — Complete v1 program enumeration.** Version one seeds the whole runner
program that the registry can actually represent.

| Node | Kind | Prerequisites | Anchor | Delivery | Policy |
| --- | --- | --- | --- | --- | --- |
| `runner/L2` | implementation-landing | — (root) | issue #51 | Complete | `reviewed-delivery-v1` |
| `runner/L3` | implementation-landing | `runner/L2` | issue #52 | Complete | `reviewed-delivery-v1` |
| `runner/L4` | implementation-landing | `runner/L3` | issue #27 | Complete | `reviewed-delivery-v1` |
| `runner/L5` | implementation-landing | `runner/L4` | issue #53 | Complete | `reviewed-delivery-v1` |
| `runner/L6` | spike-landing | — (root) | issue #54 | Complete | `reviewed-spike-evidence-v1` |
| `runner/GATE-U6` | gate | — | ADR-0013 / issue #11 | — | — |
| `runner/L7` | implementation-landing | `runner/L5`, `runner/GATE-U6`, `runner/L6` | issue #55 | Complete | `reviewed-delivery-v1` |
| `runner/L8` | implementation-landing | `runner/L7` | issue #56 | **Planned** | — |
| `runner/GATE-U4` | gate | — | ADR-0020 / issue #9 | — | — |
| `runner/L9` | implementation-landing | `runner/L8`, `runner/GATE-U4` | **issue #57** | **Planned** | — |
| `runner/L10` | implementation-landing | `runner/L8`, `runner/L9` | issue #58 | Planned | — |

**Not every node carries a delivery lifecycle.** Gates carry a predicate and no
delivery lifecycle at all. Only `implementation-landing` and `spike-landing`
nodes carry one, and only those seeded `Complete` carry a completion policy and
an envelope member. ADR-0021 §3D's "when applicable" is doing real work here,
and the normative requirement is worded to match rather than asserting that
every node has all three.

**D6.3a — `runner/L1` is deliberately not a node.** The ratified constitution
defines L1 as *"Post-ratification actions (human; not parent tasks)"*: mint one
issue per landing, revise #19 and #27, update documentation pointers. Those are
human acts in externally hosted systems that neither v1 completion policy
covers, and ADR-0021 forbids inventing a third.

A previous revision kept `runner/L1` as a node with no delivery lifecycle. That
was not a valid active graph: `runner/L2` and `runner/L6` declared it as a
prerequisite, it could never satisfy one, and both were nevertheless seeded
`Complete` — a completed node sitting behind a permanently unsatisfiable direct
prerequisite. Proving that no *currently Planned* chain depended on it did not
remove the contradiction; a full-program query or invariant check would have had
to tolerate an impossible historical graph or special-case it.

**So L1 leaves the active graph.** `runner/L2` and `runner/L6` are seeded as
**roots** of the current mutable readiness graph, and their genesis completion
digests bind their historical delivery evidence directly. L1 is preserved where
it belongs:

- in the **genesis source manifest**, as the post-ratification
  program-materialization event with its evidence; and
- in **generated historical context**, alongside the original ratified DAG
  `L2←L1 · L3←L2 · L4←L3 · L5←L4 · L6←L1 · L7←L5+GATE-U6(+L6) · L8←L7 ·
  L9←L8+GATE-U4 · L10←L8+L9`, so the constitution's shape is not lost.

The registry holds **current mutable governance state**. It is not an
event-sourced reconstruction of a one-time human bootstrap it cannot represent
under its own closed policies. If a future landing must depend on L1 as an
active prerequisite, that requires a new ADR defining a completion policy for
human program-materialization acts — "present but permanently unsatisfiable" is
not an identity worth freezing into v1.

Each `Complete` row is a **seeding obligation**, not a completion proof: it
requires its own policy-specific evidence under D4 **and** its envelope member
under D6.6.

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

**D6.6 — Historical completions need attestations, with a preimage genesis can
actually compute.** `reviewed-delivery-v1` and `reviewed-spike-evidence-v1` each
require a human completion attestation. Repository evidence alone does not
satisfy them, a source-manifest row is not an attestation, and the general
genesis attestation is not a per-landing completion transition. Without this, a
correct checker must refuse every `Complete` row and no readiness can be
derived.

Six landings need one: `runner/L2`, `runner/L3`, `runner/L4`, `runner/L5`,
`runner/L6`, `runner/L7`.

**The ordinary completion digest cannot be used, and this matters.** It binds
*prior and target* lifecycle. At genesis the repository proves the **observed**
state is `Complete`; it does not generally prove whether the historical
transition was `Planned -> Complete` or `InProgress -> Complete`. Supplying a
prior lifecycle would be inventing an unobserved fact — exactly what the
temporal-honesty rule forbids.

**Selected: a distinct `genesisHistoricalCompletionDigest`.** Its preimage binds
the **observed** lifecycle and no invented transition:

```text
{ schemaVersion,
  landingId,                      // runner/L2 …
  observedLifecycle: "Complete",  // observed, not a transition
  sourceSnapshotIdentity,
  authorityAnchor,
  completionPolicy,
  scopedDeliveredIdentity,
  policyEvidenceIdentities }      // archived OpenSpec / evidence root, manifest,
                                  // findings, merged PR and commit
```

The alternative — keep the ordinary digest and add a human-disposition row
fixing each prior lifecycle — was rejected: it manufactures six unobserved
facts to satisfy a field shape, when genesis is attesting to evidence at one
snapshot rather than replaying a transition it did not witness.

**Location in the closed schema:** `attestations.genesisCompletion`. It is a
sibling of `attestations.genesis`, not nested inside it, because the two attest
different things — `genesis` binds the seed and its relationship equivalence;
`genesisCompletion` binds the canonically ordered, closed set of
`genesisHistoricalCompletionDigest` values. A closed, unknown-field-rejecting
schema cannot be satisfied by "genesis carries an envelope"; the field is named
here so the checker can require it. Each is excluded from its own preimage.

Adding, removing, or altering any member changes the envelope digest. The
wording is temporally honest: the owner reviewed historical delivery evidence
**at genesis** and attested that it satisfies the selected policy. It does not
claim an attestation existed when the original delivery occurred.

Option B — one attestation per landing — was rejected because it would imply six
separate human acts at six separate times; genesis is one review.

**D6.5 — Attestation construction.****D6.5 — Attestation construction.** Bind `seedDigest`,
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

**D7.2 — Measured inventory at `eb6e248`.** Three contracts that the previous
version blurred, stated separately:

| Contract | Definition |
| --- | --- |
| **Scan universe** | every tracked file — `git ls-files`, not only Markdown |
| **Inventory rows** | every **discovered governance surface**, plus exact classified exclusions. Not one row per tracked file: that would be thousands of rows asserting nothing |
| **Unknown claim** | a governance-state claim in a file with no row **fails** |

`governance/consumers.json` is the **single source for every displayed count**.
The table below is generated from it; no count is maintained beside the list.

| Disposition | Count | Members |
| --- | --- | --- |
| **generated-region** | 2 | `docs/decisions/INDEX.md` (lifecycle regions), `docs/architecture/unresolved-decisions.md` (summary table, resolution banners) |
| **stable-pointer** | **38** | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `docs/AGENTS.md`, `docs/README.md`, `docs/architecture/INDEX.md`, `docs/operations/INDEX.md`, `docs/operations/pi-bootstrap.md`, `agents/AGENTS.md`, `agents/adapters/README.md`, `deploy/AGENTS.md`, `deploy/compose/README.md`, `deploy/images/README.md`, `services/AGENTS.md`, `services/README.md`, `services/control-plane/README.md`, `services/runner-control/README.md`, `packages/runner-core/README.md`, `knowledge/README.md`, `knowledge/household/README.md`, `knowledge/platform/README.md`, `knowledge/platform/degraded-operation/README.md`, `knowledge/runbooks/README.md`, `profiles/household/README.md`, `schemas/automation/README.md`, `openspec/AGENTS.md`, **`openspec/config.yaml`**, `.github/copilot-instructions.md`, `.github/agents/architecture.agent.md`, `.github/agents/implementation.agent.md`, `docs/architecture/api-contract-model.md`, `docs/architecture/degraded-mode.md`, `docs/architecture/distributed-effect-lifecycle.md`, `docs/architecture/effect-boundary-model.md`, `docs/architecture/knowledge-promotion-model.md`, `docs/architecture/knowledge-selection-model.md`, `docs/architecture/runner-model.md` |
| **retained-semantic-prose** | 1 | `docs/architecture/agent-triage-and-escalation.md` — explanatory, not a current-state claim; reason in its row |
| **live OpenSpec changes** | 26 | active, unarchived artifacts under `openspec/changes/<id>/` — **not historical**; see D7.2a |
| **historical-record** | 27 | accepted decision bodies, `openspec/changes/archive/**`, `docs/spikes/**`, `openspec/specs/**` |
| **not-a-governance-consumer** | 5 | `openspec/schemas/**`, `scripts/validate-scaffold.sh`, `tests/test_knowledge_catalog.py` — tooling and template text |

**Live consumers total 41** = 2 generated-region + 1 retained-prose + 38
stable-pointer.

`openspec/config.yaml` is **listed in the enumeration above**, not added to it by
a footnote. The previous version wrote "37 measured + `openspec/config.yaml` by
ADR mandate" and then totalled 40 — two mutually exclusive claims, which is
exactly the drift this substrate exists to stop. It is one of the 38.

**D7.2a — The historical exemption is a rule, not a glob.** Exempting
`openspec/changes/**` would have swallowed **26 files in active, unarchived
changes** — the category most likely to carry current planning-state claims. A
change is `historical-record` only when:

```text
its path is under openspec/changes/archive/**
  OR repository evidence identifies the change as merged and frozen
```

Everything else under `openspec/changes/` is a live surface and is classified on
its own merits. A negative case is required: a live unarchived OpenSpec change
that introduces a current decision range or program blocker claim **must fail**,
not disappear behind the exemption.

A file absent from the inventory is a **migration failure**. Prohibited-copy
enforcement operates over the enumerated `generated-region` and `stable-pointer`
rows.

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

**D7.6 — The external index handoff is conditional, because two systems cannot
commit in one transaction.** No implementation agent can edit a GitHub issue,
and Git and GitHub have no shared transaction. The previous plan — demote the
index immediately before merging, then record the revision in the activation PR
— leaves a real gap:

```text
issue #19 stops claiming authority
        ↓   ← gap: no canonical authority anywhere
activation PR not yet merged
        ↓
governance/state.json does not yet exist on main
```

It also moves the branch head (forcing another CI run), strands the index
demoted if the merge is abandoned, and inverts the race on revert.

**The index therefore carries a conditional handoff, written before activation:**

```text
Until activation PR #<number> is merged and governance/state.json exists on
main, this issue remains the manual program-state authority.

When both conditions are true, governance/state.json is authoritative and this
issue becomes a human-facing mirror and authority-anchor index.

If that activation is reverted and the canonical registry disappears, manual
authority resumes and remains in force. Restoring the registry then requires a
new governance decision, not a repeat of this activation.
```

The final sentence is deliberate. An earlier draft said manual authority resumed
*"until a replacement activation succeeds"*, which promised a recovery path
D8.2 forbids: version one has no generic reactivation, and the genesis exception
is bound to one activation identity. Two artifacts cannot describe different
rules for the same event.

The activation evidence binds the index's stable identity, the exact conditional
body bytes or their SHA-256, the activation PR identity, and the expected
canonical registry path. This is the closest achievable equivalent to an atomic
cross-system transition; it does not pretend the two systems commit together.

The activation gate still **refuses activation** unless that conditional body is
in place and bound.

**D7.7 — Exact artifact paths, before and after.**

| Phase | Paths |
| --- | --- |
| Pre-activation (PR-2) | `tests/fixtures/governance/candidate/state.json`, `…/source-manifest.json`, `…/consumers.json` |
| After activation (PR-3) | `governance/state.json`, `governance/genesis-source-manifest.json`, `governance/consumers.json`, `governance/README.md`, `governance/STATE.md` |

PR-2 therefore creates **no** `governance/` directory: the previous plan placed
`governance/consumers.json` in PR-2 while `governance/README.md` arrived in
PR-3, which would have introduced the root domain without its required README.

On activation the candidate directory is **removed**. If any part is retained as
test evidence it is explicitly frozen, and the checker refuses it as an
authority. The activation proof asserts that **no second copy of authored
current state remains usable** anywhere in the tree.

---

## D8. CI execution and base selection

**D8.1 — Unconditional job.** Governance validation runs in the unconditional
governance job, never behind affected-target classification: a change that edits
no governance file can still invalidate a projection. Generated state must also
pass formatting, secret scanning, and `git diff --check`; renderer targets that
are indexes keep their existing structural checks, and `validate-scaffold.sh`
gains structural coverage of the `governance/` domain. The v1 layout has **no**
nested `governance/AGENTS.md`.

**D8.2 — Explicit base, one bound genesis exception, and no generic
reactivation.** The base is supplied explicitly by CI and is exclusive: invalid,
missing, unreadable, or not a commit ⇒ fail, with no fallback to `merge-base`,
`HEAD~1`, or any inferred revision.

**The activation revision is identified by binding, not by absence.** "The base
carries no registry" is *not* sufficient on its own — every commit before
activation lacks a registry, so any of them could masquerade as the exceptional
base. The genesis evidence binds the **exact source-snapshot identity, the exact
base commit, and the activation change identity**, and the checker admits the
exception only when the supplied base matches that binding:

```text
Genesis exception applies  ⇔  base commit == the commit bound by the genesis
                              evidence, AND that base carries no registry,
                              AND the activation identity matches.

Any other registry-less base ⇒ FAIL. The registry was deleted, or the wrong
                              revision was supplied.
```

**Version one defines no generic reactivation.** If an activation is reverted,
the repository returns to manual authority and stays there: a replacement
activation is **not** a second genesis and cannot re-run the exception, because
the exception is bound to one activation identity. Restoring the substrate after
a revert requires a new ADR defining a reactivation protocol — one that binds
the prior activation, the revert, the last registry-bearing revision, the
replacement activation, and whether genesis evidence is retained or renewed.

This is a deliberate v1 narrowing, and it forces a correction elsewhere: the
external index's conditional text must not promise a recovery path the history
rule forbids. D7.6 is written to match.

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
stable pointers in every enumerated pointer consumer
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
