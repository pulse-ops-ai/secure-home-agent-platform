# Design: governance-state-substrate

Technical design for the ADR-0021 governance-state substrate. This artifact
defines **how** the accepted behavior will be implemented. It implements
nothing, and no task in this change is executed.

> **Revised again after review 5058723445** — node replacement is **specified**
> rather than refused, because refusing it contradicted accepted ADR-0021;
> withdrawal gets real schema fields; and PR-3's commit structure makes
> activation atomic at the Git-revision level, not only at the PR level.
>
> **Revised after review 5058683298** — the activation order is made
> possible, the envelope digest binds tuples in the central table too, node
> replacement was refused in v1 (**superseded — see the note above**), the
> withdrawal protocol is defined, and manual
> provenance is generalised to every attestation class.
>
> **Revised after the `2d04d3d` review** — attestation authorship is a
> manual gate rather than a machine claim the offline checker cannot make, the
> real genesis ceremony moves to PR-3 where the activation identity exists, and
> the envelope's member collection is classified like every other collection.
>
> **Revised after review 5058893761** — replacement closure is evaluated over
> current identities while historical references remain immutable; replacement
> digests bind complete old/new semantic identities; replacement logic belongs
> to the shared model; and activation has an executable independent-merge
> control (`MAN-G02`).
>
> **Revised after review 5059134998** — post-genesis runner-node introduction
> is closed to unlinked identities; pre-change replacement currentness and
> first-appearance legality are assigned to the two-revision model; PR-3 adds
> an activation-base freshness fence; and the staging/freeze tasks validate a
> closed seam without broad subtree authority.

> **Revised after review 5059408696** — freshness extraction, comparison,
> candidate identity, and digest proof move to PR-2; final merge requires
> activation-base equality; candidate and activation-intent deletions gain
> exact authoring owners; withdrawal succession is pairwise PR-2 proof; and
> replacement fork wording is made direct.
>
> **Revised after review 5058507190** — the human genesis ceremony, the
> two new digests in the central table, the gate record's missing fields, and an
> inventory table whose every row is one of the five closed dispositions.
>
> **Revised after review 5058244198** — `runner/L1` leaves the active
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
                repository observation adapters
                (bytes and tree entries only, no rules)
```

**D1.1 — One implementation of every rule.** The model owns parsing,
canonicalization, schema closure, semantic-identity and transition-digest
computation, lifecycle legality, replacement-graph validation, current-identity
derivation, transitive replacement-closure validation, predicate evaluation,
readiness derivation, explanation, and the pairwise history rules that prove
base currentness and legal post-genesis first appearance. The four entry points are thin: they
select inputs, call the model, and format output. A validator, renderer, query
command, or test that re-implements a predicate or replacement rule is a second
rule authority and a defect.

**D1.2 — Repository adapters carry no rules.** The Git-history adapter resolves
an explicit revision to file bytes. The Git-tree observation adapter resolves a
local commit and returns recursively enumerated paths, entry modes, and blob
bytes for a requested scope. Neither adapter interprets content or decides
whether an identity, archive, lifecycle, or association is valid. History and
archive semantics live in the model, which receives the observations.

**D1.3 — Tests consume the model.** `tests/test_governance_state.py` exercises
the real entry points over real fixtures. Independent re-derivation is a
deliberate proof technique, never the mechanism under test.

### Responsibilities

| Component | Owns | Must not |
| --- | --- | --- |
| `model` (shared) | canonical parse, schema closure, semantic identities and digests, lifecycle legality, replacement graph and transitive closure, current-identity derivation, predicates, readiness, explanations | read Git, write files, format human output, reach the network |
| `check-governance-state.mjs` | select current revision, request rules-free repository observations, invoke model, report | implement any predicate or legality rule |
| `check-governance-history.mjs` | select explicit base, invoke adapter for bytes, invoke the model for two-state comparison | infer a base; become the replacement or lifecycle rule authority |
| `git history adapter` | explicit revision → bytes | interpret content or apply governance rules |
| `git-tree observation adapter` | local commit and scope → tree paths, entry modes, and blob bytes | classify entries, validate archive identity, or decide association |
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
      "kind": "gate",
      "predicate": { "name": "exactly-one-current-accepted-resolver", "question": "U4" },
      "authorityAnchor": { "type": "github-issue", "repository": "pulse-ops-ai/secure-home-agent-platform", "number": 9 },
      "sources": ["docs/decisions/ADR-0021-establish-machine-readable-governance-state.md#3c"],
      "replaces": null,
      "replacement": null
    }
  ],
  "landings": [
    {
      "id": "runner/L9",
      "kind": "implementation-landing",
      "requires": ["runner/L8", "runner/GATE-U4"],
      "authorityAnchor": { "type": "github-issue", "repository": "pulse-ops-ai/secure-home-agent-platform", "number": 57 },
      "replaces": null,
      "replacement": null,
      "delivery": {
        "lifecycle": "Planned",
        "completionPolicy": "reviewed-delivery-v1",
        "completion": null,
        "withdrawal": null
      }
    }
  ],
  "externalReferences": [],
  "attestations": {
    "genesis": {},
    "genesisCompletion": {
      "envelopeDigest": "…",
      "members": [{ "landingId": "runner/L2", "digest": "…" }],
      "actor": "…",
      "at": "…",
      "outcome": "attested",
      "authority": { "type": "github-issue", "number": 106 }
    }
  }
}
```

`replaces` and `replacement` are paired transition fields on both gate and
landing records. Ordinary records carry both as `null`; a replacement record
carries both as non-null values. A one-sided pair is invalid. The replacement
object is closed as `{ "digest": "…", "attestation": { } }`; its digest and
attestation are defined in D3.3 and D5a.1. A gate has no delivery object, while
a replacement landing has the ordinary landing delivery object initialized by
D5a.1.

Completion policy is selected when a landing identity is introduced, independently
of its current delivery lifecycle. An `implementation-landing` carries
`reviewed-delivery-v1`; a `spike-landing` carries
`reviewed-spike-evidence-v1`; and a `gate` carries no delivery object or policy.
The selected policy is unchanged while a landing is `Planned`, `InProgress`,
`Complete`, or `Withdrawn`. `completion` and `withdrawal` are both `null` while
the landing is `Planned` or `InProgress`; exactly the lifecycle-appropriate
evidence is present for a terminal landing. A replacement landing therefore
starts `Planned` with its kind-selected policy already present.

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
| Landing policy assignment | `implementation-landing` → `reviewed-delivery-v1`; `spike-landing` → `reviewed-spike-evidence-v1`; `gate` → no delivery policy |
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

**D2.2a — The post-genesis runner node set is closed.** Genesis establishes the
complete v1 set of runner node concepts. After genesis, a gate or landing ID
may first appear only as a new identity replacing an existing node: it must
carry the paired `replaces` / `replacement` fields, preserve `kind`, and carry
a valid replacement digest and attestation. An ordinary first appearance with
no replacement relationship is refused, even if the target snapshot is
otherwise valid. A genuinely new conceptual runner node requires a later
schema-version decision or ADR and is not supported by v1.

The shared model validates the target-state manifestations — replacement shape,
digest and attestation validity, kind and policy compatibility, acyclicity,
fork freedom, and final currentness defined as **no node directly naming the
identity in `replaces`**; target-state dependent closure, current references,
and historical-reference preservation. The pairwise model/history
path proves that a first appearance is post-genesis, that its target was
current in the base, and that the identity, relationship, digest, and
attestation arrived together. Neither fact is inferred from a target snapshot
alone.

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
| **Entity set** | `attestations.genesisCompletion.members[]` | sorted by `landingId` ascending | **duplicate `landingId` rejected**; a duplicate `digest` across two landings is also rejected | **none** |
| **Evidence-identity set** | `policyEvidenceIdentities[]` and every policy-specific identity collection | sorted by canonical member bytes | duplicates rejected | **none** |

**D3.2a — The envelope's member collection, exactly.** It was previously called
a "canonically ordered, closed set" without saying what that meant, which left
two implementations free to produce different bytes for the same envelope —
weakening the digest that exists to protect the historical completion seed:

```text
attestations.genesisCompletion.members:
  class            entity set
  member shape     { landingId, digest }
  identity key     landingId
  canonical order  landingId ascending
  duplicates       duplicate landingId rejected;
                   the same digest under two landingIds rejected
  envelope preimage
                   the canonically ordered member TUPLES {landingId, digest},
                   not bare digest strings — so a digest cannot be silently
                   reassociated with a different landing
```

Every policy-specific evidence-identity collection is an **evidence-identity
set**: order carries no meaning, duplicates are rejected, and the canonical sort
is over member bytes.

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
| `completionDigest` | `{landingId, from, to, authorityAnchor, deliveredIdentity, completionPolicy, archivedOpenSpec\|policy-specific}`; `reviewed-delivery-v1` uses the complete closed `archivedOpenSpec` object from D4.4 |
| `archivedOpenSpec.bundleSha256` | the canonical serialization of `{schemaVersion, contract, changeId, activeRoot, archiveRoot, members}`, excluding `bundleSha256`, `reviewedIdentity`, and `archiveIdentity` |
| `semanticIdentityDigest` | the complete labelled semantic identity of a gate or landing: `{schemaVersion, id, kind, predicate\|null, sources\|null, requires\|null, authorityAnchor\|null, completionPolicy\|null, reviewedOrderingIntent\|null}`; non-applicable fields are explicit `null`; delivery, replacement, attestations, and derived values are excluded |
| `replacementDigest` | `{schemaVersion, oldId, newId, oldSemanticIdentityDigest, newSemanticIdentityDigest}` |
| `seedDigest` / `relationshipEquivalenceDigest` | genesis registry, and the source-comparison tuples |
| `candidateFreezeIdentity` | canonical `{schemaVersion: 1, type: "governance-candidate-bundle", members: [the exact three candidate `{path, contentSha256}` tuples]}`; `bundleSha256` hashes that preimage without itself |
| `activationFreshnessDigest` | `{schemaVersion, candidateFreezeIdentity, activationBaseCommit, primitiveSourceTuples, relationshipTuples, localEvidenceIdentities, consumerInventory}` — the canonical comparison inputs for the pre-seam freshness result |
| `genesisHistoricalCompletionDigest` | a genesis **observation**: landing identity, **observed lifecycle only**, source snapshot, anchor, policy, scoped delivery, policy-specific evidence — **never** a prior lifecycle |
| `genesisCompletionEnvelopeDigest` | `SHA-256(` canonical ordered entity set of `{ landingId, genesisHistoricalCompletionDigest }` `)` — **tuples, not bare digests**, so a digest cannot be reassociated with another landing (D3.2a) |
| `withdrawalDigest` | `{schemaVersion, landingId, from, to: "Withdrawn", authorityAnchor, withdrawalEvidence}` — the symmetric protocol ADR-0021 §3D requires |

`completionDigest` covers a post-genesis **transition** and binds prior and
target lifecycle; `genesisHistoricalCompletionDigest` covers a genesis
**observation** and binds neither. The two are never interchangeable, and the
normative requirement scopes the ordinary preimage to post-genesis accordingly.

`semanticIdentityDigest` is computed from the complete, labelled identity
object, including unchanged fields and explicit nulls. For gates this includes
the canonical `sources` set as well as the predicate; for landings it includes
the applicable prerequisite, anchor, policy, and ordering inputs.
`replacementDigest` therefore binds both directions and every old/new value,
including source references, authority anchors and prerequisite sets. There is no `changedRuleInputs`
set whose omissions or unlabelled values an implementation must guess. Both
digests exclude the replacement envelope and its attestation from their own
preimages.

`candidateFreezeIdentity` is a closed content identity, not a label for a
candidate revision:

```json
{
  "schemaVersion": 1,
  "type": "governance-candidate-bundle",
  "members": [
    { "path": "tests/fixtures/governance/candidate/consumers.json", "contentSha256": "<64 lowercase hex>" },
    { "path": "tests/fixtures/governance/candidate/source-manifest.json", "contentSha256": "<64 lowercase hex>" },
    { "path": "tests/fixtures/governance/candidate/state.json", "contentSha256": "<64 lowercase hex>" }
  ],
  "bundleSha256": "<64 lowercase hex>"
}
```

The members are exactly the three listed paths, sorted lexicographically by
`path`, and each member digest is the SHA-256 of its exact bytes.
`bundleSha256` is the SHA-256 of the canonical serialization of the same
object with `bundleSha256` omitted. A commit name, label, or other
non-content identity cannot stand in for this value; changing candidate bytes
changes the freeze identity.

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

### D4.4. Closed archived OpenSpec identity for reviewed delivery

`reviewed-delivery-v1` has one exact policy-discriminated completion object. In
the landing's `delivery.completion` field, the object is exactly the following
set of fields; no spike-evidence or withdrawal field is permitted:

```json
{
  "policy": "reviewed-delivery-v1",
  "deliveredIdentity": {
    "class": "local-git-commit",
    "value": "<local Git object id>",
    "scope": ["<repository-relative delivered path>"]
  },
  "deliveredScope": ["<repository-relative delivered path>"],
  "authorityAnchor": {
    "type": "github-issue",
    "repository": "pulse-ops-ai/secure-home-agent-platform",
    "number": 0
  },
  "archivedOpenSpec": {
    "schemaVersion": 1,
    "contract": "archived-openspec-change-v1",
    "changeId": "<canonical-change-id>",
    "activeRoot": "openspec/changes/<canonical-change-id>",
    "archiveRoot": "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>",
    "members": [
      {
        "path": "<relative-member-path>",
        "contentSha256": "<64 lowercase hex>"
      }
    ],
    "bundleSha256": "<64 lowercase hex>",
    "reviewedIdentity": {
      "class": "local-git-commit",
      "value": "<local Git object id>",
      "scope": [
        "openspec/changes/<canonical-change-id>/<relative-member-path>"
      ]
    },
    "archiveIdentity": {
      "class": "local-git-commit",
      "value": "<local Git object id>",
      "scope": [
        "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>/<relative-member-path>"
      ]
    }
  },
  "attestation": {
    "digest": "<completionDigest>",
    "actor": "<human actor>",
    "at": "<RFC 3339 time>",
    "outcome": "completed",
    "authority": {
      "type": "github-issue",
      "repository": "pulse-ops-ai/secure-home-agent-platform",
      "number": 0
    }
  }
}
```

The `policy` value SHALL equal the landing's immutable
`delivery.completionPolicy`. The complete `reviewed-spike-evidence-v1`
completion object is a different closed shape containing its authority anchor,
merged evidence identity, canonical evidence root, evidence-manifest identity,
findings identity, and attestation; it SHALL contain no `archivedOpenSpec`,
`deliveredIdentity`, or `deliveredScope`. The withdrawal envelope is a sibling
under `delivery.withdrawal`, not completion evidence, and SHALL never satisfy
this policy. Unknown fields and fields belonging to another policy are refused.

The nested `archivedOpenSpec` object is a complete identity of the archived
child change; it is not a union of arbitrary content identities and it is not
satisfied by naming one convenient file:

```json
{
  "schemaVersion": 1,
  "contract": "archived-openspec-change-v1",
  "changeId": "<canonical-change-id>",
  "activeRoot": "openspec/changes/<canonical-change-id>",
  "archiveRoot": "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>",
  "members": [
    {
      "path": "<relative-member-path>",
      "contentSha256": "<64 lowercase hex>"
    }
  ],
  "bundleSha256": "<64 lowercase hex>",
  "reviewedIdentity": {
    "class": "local-git-commit",
    "value": "<local Git object id>",
    "scope": [
      "openspec/changes/<canonical-change-id>/<relative-member-path>"
    ]
  },
  "archiveIdentity": {
    "class": "local-git-commit",
    "value": "<local Git object id>",
    "scope": [
      "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>/<relative-member-path>"
    ]
  }
}
```

The field names, nesting, and `contract` value above are the closed v1 shape.
`changeId` matches `[a-z0-9]+(?:-[a-z0-9]+)*`, with no leading, trailing, or
repeated hyphen. `activeRoot` SHALL be exactly
`openspec/changes/<changeId>`. `archiveRoot` SHALL be exactly
`openspec/changes/archive/YYYY-MM-DD-<changeId>`, where the date is a valid
calendar date and the final path component's suffix is exactly the same
canonical `changeId`. The active root is the package location in the reviewed
active-change commit; it is not an acceptable substitute for the archive root
in the current snapshot. An ADR, README, arbitrary file, archive subfile,
archive root not corresponding to the declared change ID, active non-archived
completion, or archive whose declared ID does not match its root is refused.

`members` is the complete recursively enumerated set of regular, tracked,
non-symlink files in the reviewed active package and the archived package. The
set includes, when present, `.openspec.yaml`, `proposal.md`, every
`specs/**/*.md` file, `design.md`, `assurance.md`, `tasks.md`, and every other
tracked regular file under the package root; there is no policy-specific
allowlist that permits omitting a present file. Each member `path` is relative
to `activeRoot`; the corresponding archive path is the same relative suffix
under `archiveRoot`. Members are sorted lexicographically by canonical
relative path, have no duplicate paths, and must account for every file in the
reviewed active tree, the archive tree named by `archiveIdentity`, and the
current checkout's archive root. A missing, extra, or unmanifested file is a
refusal. Member paths are nonempty relative paths: absolute paths, traversal,
empty segments, `.` or `..` components, and symlinks at any ancestor or final
member are refused. Each `contentSha256` is recomputed over the exact bytes
after real-path containment has been established.

The required membership proof is three-way and exact: (1) the complete
reviewed active-package tree at `reviewedIdentity`, (2) the complete current
archive-root tree, and (3) the declared `members` set and bytes must be equal
after the active-to-archive path normalization above. The `archiveIdentity`
commit is an additional provenance observation: its complete archive-root tree
must match the current archive tree and the same member bytes. Thus a file
added to the current archive, omitted from the manifest, or absent from either
reviewed tree cannot be hidden by a partial declaration.

`bundleSha256` is SHA-256 over the canonical serialization of exactly this
object, with `bundleSha256`, `reviewedIdentity`, and `archiveIdentity` excluded
from the preimage:

```json
{
  "schemaVersion": 1,
  "contract": "archived-openspec-change-v1",
  "changeId": "<canonical-change-id>",
  "activeRoot": "openspec/changes/<canonical-change-id>",
  "archiveRoot": "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>",
  "members": [
    {
      "path": "<relative-member-path>",
      "contentSha256": "<64 lowercase hex>"
    }
  ]
}
```

The canonical serializer uses D3.1 and D3.2 rules. Thus changing the change
ID, archive root, any member path, or any member digest changes the bundle
identity, even when the underlying file bytes are unchanged. The production
implementation must include a literal preimage, serialized bytes, expected
SHA-256, and independently re-derived golden vector for this class; tests
must mutate each of those four identity-bearing inputs.

`reviewedIdentity` and `archiveIdentity` are separate supporting provenance,
not part of `bundleSha256`. For an ordinary post-genesis
`reviewed-delivery-v1` completion, both have the only permitted class
`local-git-commit`; both objects must exist locally. `reviewedIdentity` names
the commit whose complete active package is reviewed, and its scoped tree must
match the member paths and bytes after normalization. `archiveIdentity` names
the commit that introduced the complete archived package, and its scoped tree
must match the current archive tree and the same member bytes. An
`external-git-commit`, missing object, incomplete scope, or byte mismatch is
not local proof and fails closed. These checks prove repository bytes and
scope, not that a human reviewer authenticated either commit. A commit is
supporting provenance, not the landing's authority issue or an unrelated
parent commit.

The completion preimage binds the `landingId`, prior and target lifecycle,
authority anchor, delivered identity and scope, completion policy, and the
complete `archivedOpenSpec` object above, including both provenance identities.
The attestation binds that digest. The checker verifies the policy-specific
shape, both roots, complete membership, exact bytes, both scoped identities,
and digest binding; it does not infer semantic ownership from a filename,
archive prose, issue text, or an unstructured marker. Whether this valid
archive is conceptually the child change for this landing is part of the
human completion attestation (`MAN-G03`), not a machine-decidable fact in v1.
Existing historical archives do not need to be rewritten merely to add a
stronger archive-internal marker.

The bounded machine-refusal corpus includes a valid whole archive; an ADR,
README, single archive subfile, active change, path-invalid or mismatched
ID/root archive, partial, duplicate, missing, or extra member; a member-byte,
bundle, reviewed-identity, or archive-identity mismatch; missing or opaque
provenance; delivered-scope or anchor mismatch; a changed landing or archive
association whose completion preimage and attestation were not recomputed; a
retrospective archive assembled after the reviewed identity; a genesis
disposition supplied to ordinary completion; and symlink or traversal paths. A
recomputed bundle does not turn a semantically unrelated but mechanically valid
archive into machine-proven landing evidence: `MAN-G03` requires the human
attestation to establish that association.

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
| yes | yes | yes | **no**, **and** `activationBaseCommit`, source snapshot, equivalent freshness result and `activationIdentity` all match the genesis evidence binding | **genesis exception** — see D8.2 |
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
| **Delivery lifecycle and completion evidence** | merged PRs, commits, archived child OpenSpec changes, spike evidence roots | policy-specific identity verification (D4), including the closed whole-change archive identity in D4.4 | locally-verified where objects exist |
| **Completion policy identity** | per-landing human declaration | human attestation | **externally-attested** |

**D6.2a — This planning contract becomes a local source at its merge commit.**
Once PR #107 is reviewed and merged, its five artifacts are content-addressable
repository bytes. The genesis manifest binds their **exact file blob identities
at that merge commit** — archival is **not** a prerequisite, because PR-1 and
PR-2 need this evidence while the change is still active. An eventual archived
copy may be checked for equivalence later, never required first. These values
are therefore **locally verified** rather than resting on an external human
assertion:

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
| `runner/L8` | implementation-landing | `runner/L7` | issue #56 | **Planned** | `reviewed-delivery-v1` |
| `runner/GATE-U4` | gate | — | ADR-0020 / issue #9 | — | — |
| `runner/L9` | implementation-landing | `runner/L8`, `runner/GATE-U4` | **issue #57** | **Planned** | `reviewed-delivery-v1` |
| `runner/L10` | implementation-landing | `runner/L8`, `runner/L9` | issue #58 | Planned | `reviewed-delivery-v1` |

**Not every node carries a delivery lifecycle.** Gates carry a predicate and no
delivery lifecycle at all. `implementation-landing` and `spike-landing` nodes
carry a lifecycle and their kind-selected policy from introduction. Only a
landing seeded `Complete` carries completion evidence and an envelope member;
`Planned` and `InProgress` carry neither terminal evidence, and `Withdrawn`
carries the same selected policy with withdrawal evidence. ADR-0021 §3D's
"when applicable" applies to the delivery object itself, not to whether a
lifecycle-bearing landing has a policy.

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

For a historical `reviewed-delivery-v1` landing, the genesis source manifest
records the complete two-stage `archivedOpenSpec` identity from D4.4,
including the reviewed active-package identity and the archive-introduction
identity, the source snapshot and locally verifiable evidence identities, and
any human disposition needed to map that existing archive to the landing. The
`genesisHistoricalCompletionDigest` and `attestations.genesisCompletion` bind
both archive-stage identities and that disposition at genesis. This does not
rewrite an existing archive and is not an ordinary completion evidence shape.

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
`genesisCompletion` binds the canonically ordered, duplicate-free set of
`{landingId, genesisHistoricalCompletionDigest}` tuples classified in D3.2a. A closed, unknown-field-rejecting
schema cannot be satisfied by "genesis carries an envelope"; the field is named
here so the checker can require it. Each is excluded from its own preimage.

Adding, removing, or altering any member changes the envelope digest. The
wording is temporally honest: the owner reviewed historical delivery evidence
**at genesis** and attested that it satisfies the selected policy. It does not
claim an attestation existed when the original delivery occurred.

Option B — one attestation per landing — was rejected because it would imply six
separate human acts at six separate times; genesis is one review.

## D5a. Replacement and withdrawal transitions

### D5a.1 Node replacement, specified

The previous revision refused replacement outright. **That contradicted accepted
ADR-0021**, which states that a changed rule "must be introduced as a new stable
gate or landing identity, with an explicit typed supersession/replacement
relationship when it replaces an older identity". An OpenSpec artifact ranks
below an accepted ADR and cannot narrow one; the only alternatives were to
specify the protocol or to propose a superseding ADR, and this change is not
authorized to write ADRs. So it is specified.

```json
{ "id": "runner/GATE-U4-v2",
  "kind": "gate",
  "replaces": "runner/GATE-U4",
  "replacement": { "digest": "…", "attestation": { } } }
```

| Question | Answer |
| --- | --- |
| **Direction** | the **new** node carries `replaces: "<oldId>"`, mirroring how a new ADR carries `supersedes`. The old record is never edited. |
| **Target-state model** | `replaces` SHALL name an existing identity, and no two distinct nodes may directly name the same target in `replaces`. Whether the target was current before the change is a pairwise history rule, not a target-state inference; chains are legal. |
| **Cardinality** | exactly one old identity per replacement, and an identity may be replaced **at most once**. Chains (`A ← B ← C`) are legal; replacement forks are refused. |
| **Cycles** | the replacement graph SHALL be acyclic; a cycle is refused, like a prerequisite cycle. |
| **Current identity** | **derived, never authored**: a node is current iff no node directly names its ID in `replaces`. There is no `isCurrent` field — that would be the primitive/derived collapse again. |
| **Kind compatibility** | a replacement SHALL preserve `kind`. A gate may not replace a landing. |
| **Dependent references** | **not** auto-migrated. In the target state, the replacement closure SHALL be complete: every affected current dependent represented by the target graph carries its own same-kind replacement identity and maps every replaced prerequisite to the corresponding new identity. The pairwise history model compares this target closure with the base closure to prove that no pre-change current dependent was omitted. |
| **Current versus historical references** | after the batch, current nodes may reference only current prerequisite identities. Non-current historical nodes retain their original prerequisite references, including references to non-current identities, and are not revalidated against the current graph. The old records remain immutable and queryable. |
| **Atomicity** | the complete transitive replacement closure and every dependent repoint SHALL arrive in one registry revision. If any current dependent is omitted, partially repointed, or left naming a replaced identity, the shared model refuses the revision. |
| **Query and projection** | the replaced identity remains queryable and reports `replacedBy`; readiness is computed over current identities only; a replaced node satisfies no prerequisite. Historical records retain historical relationships and are not used to satisfy current prerequisites. |
| **Transition digest** | `replacementDigest` is over `{schemaVersion, oldId, newId, oldSemanticIdentityDigest, newSemanticIdentityDigest}`. Each semantic-identity digest is the complete labelled old or new identity, so changed and unchanged rule inputs, including gate source references, authority anchors and prerequisite sets, are bound without omission or direction ambiguity. |
| **Replacement delivery state** | a replacement landing begins `Planned` with the policy selected for its kind, `completion: null`, and `withdrawal: null`; it never inherits the old landing's lifecycle, policy evidence, or terminal evidence. A replacement gate carries no delivery object or lifecycle. Any later completion or withdrawal follows its own typed protocol. |
| **Attestation** | the same envelope shape — digest, actor, RFC 3339 time, outcome `replaced`, typed authority reference — excluded from its own preimage, under the manual provenance gate (D6.7). Node replacement is included in the general `MAN-G01` provenance table. |
| **History** | the old record and all historical prerequisite references are immutable thereafter; the `replaces` relationship may not be removed or repointed; a target-only gate or landing identity is legal only when it is a post-genesis replacement whose target was current in the base; the complete replacement batch, each new identity, relationship, digest, and attestation SHALL arrive in the same revision. The current model validates the typed target envelope; history proves the legal source currentness and first appearance. |
| **Genesis** | no replacements exist at genesis. |

An in-place change to an identity-bearing rule input remains refused — ADR-0021
permits **no** in-place mutation, and replacement is the only sanctioned path.

**Legal two-level cascade (history fixture).** Suppose the base current graph
contains `runner/L9` requiring `runner/L8`, and `runner/L10` requiring
`runner/L9`. A replacement of `runner/L8` is legal only as one target batch
containing
`runner/L8-v2` replacing `runner/L8`, `runner/L9-v2` replacing `runner/L9` and
requiring `runner/L8-v2`, and `runner/L10-v2` replacing `runner/L10` and
requiring `runner/L9-v2` (plus any other unchanged prerequisites). Each new
identity carries its own complete old/new semantic-identity digest and
attestation and its kind-selected completion policy. The old `runner/L9` still
retains its historical reference to `runner/L8`; it is not edited. All
replacement landings begin `Planned`, so no completion state is silently
inherited.

The shared model computes the target-state reverse prerequisite closure and
validates the mapping. The pairwise model/history path proves that every
target-only identity is a sanctioned replacement of a base-current identity,
that the complete closure arrived together, and that old records, historical
references, and replacement relationships were not edited or reassociated; the
history entry point does not implement these rules itself.

### D5a.2 The withdrawal protocol, defined

`Withdrawn` is in ADR-0021 §3D's closed vocabulary and the ADR requires "the
corresponding typed withdrawal protocol", so it is defined here rather than
dropped:

```text
withdrawalDigest preimage
  { schemaVersion,
    landingId,
    from,                       // Planned | InProgress
    to: "Withdrawn",
    authorityAnchor,
    withdrawalEvidence }        // typed reference + content identity for the
                                // reviewed decision to withdraw
```

- **Legal transitions:** `Planned -> Withdrawn` and `InProgress -> Withdrawn`
  only. `Withdrawn` is terminal.
- **Attestation:** the same envelope shape as completion — digest, actor, RFC
  3339 time, outcome `withdrawn`, typed authority reference — excluded from its
  own preimage, and subject to the same manual provenance gate (D6.7).
- **Readiness:** a `Withdrawn` landing satisfies **no** prerequisite, exactly as
  `Planned` and `InProgress` do not.
- **Query:** `deliveryState: "Withdrawn"`, prospective assessment
  non-applicable (`null`), and the withdrawal evidence reported. No form asserts
  the withdrawal was authorized.
- **Target-state model:** withdrawal without its evidence and attestation is
  refused, `Complete` and `Withdrawn` are mutually exclusive, and `Withdrawn`
  satisfies no prerequisite (`ADV-G67`, `ADV-G68`). The history model proves
  the legal `Planned`/`InProgress` source and makes the withdrawal envelope and
  evidence immutable thereafter (`ADV-G29`, `ADV-G75`, `EX-G25`).
- **Genesis:** no landing is seeded `Withdrawn`, so this is a post-genesis
  protocol only.

**Where it lives in the closed schema**, so an unknown-field-rejecting
implementation does not have to invent a union:

```json
"delivery": {
  "lifecycle": "Withdrawn",
  "completionPolicy": "reviewed-delivery-v1",
  "completion": null,
  "withdrawal": {
    "digest": "…",                       // withdrawalDigest
    "evidence": { "type": "…", "…": "…", "contentDigest": "…" },
    "attestation": { "digest": "…", "actor": "…", "at": "…",
                     "outcome": "withdrawn", "authority": { } }
  }
}
```

`completion` and `withdrawal` are mutually exclusive: exactly one is non-null on
a terminal landing, and both are null on `Planned` or `InProgress`.

---

**D6.7 — Attestation authorship is a manual gate, and the checker does not
pretend otherwise.** The specification previously said the checker rejects an
attestation "produced by the implementation rather than recorded by the
repository owner". An **offline** checker cannot establish that. The stored
envelope is ordinary JSON — actor, time, outcome, authority reference — with no
signature, no trusted owner key, no signed Git object, and no independently
controlled review artifact. An implementation can write the same `actor` bytes a
human can, and no observable fact distinguishes them.

Claiming otherwise would have been the worst kind of control: one that reads as
mechanical and proves nothing.

The division of labour is therefore explicit:

| Proven mechanically | Proven by human review |
| --- | --- |
| envelope shape and closed-schema conformance | that the repository owner personally performed the attestation act |
| that every bound preimage recomputes to the recorded digest | |
| content digests of every referenced artifact | |
| authority-reference **shape** | |
| immutability of the envelope and its bound artifacts thereafter | |

**The `actor` string is a recorded assertion, not proof of identity.** It is
evidence for a human reviewer, and the design does not treat it as more.

**This limitation is general, not specific to genesis.** The same offline
checker validates every human attestation the model admits, and none of them
carries a signature:

| Attestation class | Machine-decidable | Human review |
| --- | --- | --- |
| ADR acceptance | shape, accepted-byte digest, transition preimage, immutability | who performed the acceptance |
| ADR rejection | shape, rejected-byte digest, preimage, immutability | who performed the rejection |
| Ordinary completion | shape, completion preimage, scoped delivery identity, immutability | who attested the completion |
| Withdrawal | shape, withdrawal preimage, evidence identity, immutability | who attested the withdrawal |
| Node replacement | shape, complete old/new semantic identities, replacement preimage, immutability | who attested the replacement |
| Genesis / genesis completion | shape, seed and envelope preimages, content digests, immutability | who performed the ceremony |

Version one's general rule: **all human-attestation authorship is established at
an explicit human review gate.** The checker proves schema and shape, digest and
preimage binding, content identity, authority-reference shape, and subsequent
immutability — and never the human actor's identity. `MAN-G01` is written as one
general provenance control covering every row above.

**`MAN-G02` — independent merge control.** Before the owner records the real
genesis attestations and before the activation landing is merged, the owner
SHALL record in the activation PR metadata which of these enforceable conditions
holds, together with its evidence:

1. branch or ruleset protection requires an owner-controlled path for every
   update to `refs/heads/main`, with no applicable implementation-agent bypass;
   or
2. credential separation demonstrates that the implementation actor and every
   credential available to it cannot update `refs/heads/main` through any route.

The protected operation includes PR merge, direct push, force-push, API ref
update, and ruleset or branch-protection bypass. Evidence must identify the
enforceable branch/ruleset configuration, or the credential permissions and
routes checked; proving only that an actor cannot invoke a PR merge is
insufficient.

The owner SHALL re-check that condition at the merge gate. `MAN-G02` is a
manual activation control, not a registry field and not an authorization grant.
The unsigned v1 path is refused unless both `MAN-G01` and `MAN-G02` have been
performed and recorded. Version one does not adopt signing; a future signed
attestation path requires a separate decision covering its trust root and key
operations.

**Signing is deliberately not adopted in v1, and the condition that would change
that is recorded.** A detached owner signature would introduce a whole trust
domain — trusted public key, private-key custody, rotation, revocation, loss
recovery, compromise response, algorithm, and canonical signed bytes — which
deserves its own ADR rather than being added to close a review finding.

The manual gate is sufficient only while **an independent human owner controls
the final merge and personally performs the attestation ceremony**, with both
`MAN-G01` and `MAN-G02` evidenced. If the repository cannot establish the
owner-controlled merge condition, the unsigned activation is refused; signing
is not silently substituted and remains outside v1 until a separate decision
defines it.

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
| **historical-record** | 27 | accepted decision bodies, `openspec/changes/archive/**`, `docs/spikes/**`, `openspec/specs/**` |
| **not-a-governance-consumer** | 5 | `openspec/schemas/**`, `scripts/validate-scaffold.sh`, `tests/test_knowledge_catalog.py` — tooling and template text |

**Live consumers total 41** = 2 generated-region + 1 retained-prose + 38
stable-pointer. Every row above is one of the **five closed dispositions**;
there is no sixth, so `consumers.json` can generate this table without an
undocumented enum.

**Scan analysis — not a disposition and not an inventory subtotal.** The scan
also discovered **26** surfaces in active, unarchived OpenSpec changes under
`openspec/changes/<id>/`. That number is an *analysis* result recording where
the scan found governance fact classes; it is deliberately **not** a row above,
because a blanket classification of 26 files would be an assertion rather than a
review. Each is classified individually into one of the five dispositions by the
enumeration task, and until it is, its governance claim has no row and therefore
**fails**. What is decided here is only that they may not inherit the historical
exemption (D7.2a).

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

**D8.2a — Activation-base freshness fence.** PR-3 does not promote the PR-2
candidate merely because its planned source snapshot and candidate bytes are
unchanged. PR-3 first bases its branch on the exact current `main` revision and
records that revision as `activationBaseCommit`. Before 8.2 promotes anything,
and again immediately before 8.5a stages the seam, the genesis extraction is
rerun against that exact commit.

The reusable extraction, comparison, equivalent-result construction, and digest
mechanism is implemented and proven in PR-2 task 6.8. PR-3 task 8.1a invokes
that merged mechanism only; it is not the first implementation or proof of the
freshness rules.

The candidate is identified by this exact content-bound bundle identity:

```json
{
  "schemaVersion": 1,
  "type": "governance-candidate-bundle",
  "members": [
    { "path": "tests/fixtures/governance/candidate/consumers.json", "contentSha256": "<64 lowercase hex>" },
    { "path": "tests/fixtures/governance/candidate/source-manifest.json", "contentSha256": "<64 lowercase hex>" },
    { "path": "tests/fixtures/governance/candidate/state.json", "contentSha256": "<64 lowercase hex>" }
  ],
  "bundleSha256": "<64 lowercase hex>"
}
```

The `members` collection is exactly those three paths, sorted by `path`, with
each digest computed from the member's exact bytes. `bundleSha256` hashes the
canonical `{schemaVersion, type, members}` object with `bundleSha256` omitted.
A commit name, label, or other non-content identifier cannot replace this
identity.

The comparison inputs are the frozen PR-2 candidate and manifests plus the
extraction from `activationBaseCommit`:

```text
primitive source tuples       (including ADR lifecycles and relationships)
relationship tuples
locally verifiable evidence   (delivery and evidence identities)
complete consumer inventory
```

Each collection is canonically serialized and compared byte for byte and field
by field. The check does not reduce freshness to commit identity: a source file
may change while a stale candidate remains byte-identical. An equivalent result
produces `activationFreshnessDigest` over
`{schemaVersion, candidateFreezeIdentity, activationBaseCommit,
primitiveSourceTuples, relationshipTuples, localEvidenceIdentities,
consumerInventory}`. The result object records `candidateFreezeIdentity`,
`activationBaseCommit`, that digest, and `outcome: "equivalent"`. The genesis
attestation binds the complete result, including `activationBaseCommit` and the
freshness digest.

An invalid or changed base, missing or ambiguous extraction, any tuple or
inventory difference, a skipped extraction, or a commit-identity-only check
refuses promotion. The candidate is refreshed and reviewed; it is never
silently patched in PR-3. If the actual PR-3 base changes after the recorded
`activationBaseCommit`, the gate fails and the ceremony restarts from the
current base.

Before final merge, the merge gate rereads `refs/heads/main` and the PR-3
current base SHA and requires the exact equality:

```text
current refs/heads/main == PR-3 current base SHA == attested activationBaseCommit
```

This is separate from `MAN-G02` and post-attestation CI. A mismatch refuses
merge. PR-3 must be updated onto the new exact `main`, freshness rerun, the
seam rebuilt or revalidated, frozen again, the owner attestations recreated,
and hosted checks rerun. No attestation bound to the old base may be reused.

**The activation revision is identified by binding, not by absence.** "The base
carries no registry" is *not* sufficient on its own — every commit before
activation lacks a registry, so any of them could masquerade as the exceptional
base. The genesis evidence binds the **exact source-snapshot identity, the exact
`activationBaseCommit`, the equivalent freshness result and digest, and the
activation change identity**, and the checker admits the exception only when the
supplied base matches that binding:

```text
Genesis exception applies  ⇔  supplied base == genesis.attestations.genesis.activationBaseCommit,
                              AND that base carries no registry,
                              AND the bound activation freshness outcome is "equivalent",
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
collection canonicalization; schema closure; semantic-identity and replacement
digest computation; lifecycle legality; replacement graph, current-identity and
transitive-closure validation; predicate evaluation; readiness derivation;
explanation construction; canonical genesis extraction; candidate-freeze
identity and activation-freshness comparison/result/digest construction; and
pairwise history comparison, including base currentness and post-genesis
first-appearance legality. PR-2 owns implementation and proof of the freshness
mechanism; PR-3 only invokes it.

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
   hold. Included as rule-free data instead (D2.3).

---

## D10a. The activation identity, and where the real ceremony happens

The genesis attestation binds an `activationIdentity`. The previous plan placed
the owner's real attestation in **PR-2** while the activation is **PR-3** — so
the identity being bound did not yet exist. Inserting it later would change the
artifact the owner had already attested and restart the ceremony; making it the
eventual merge commit would be self-referential.

**Schema.** `activationIdentity` is a closed typed reference:

```json
{ "type": "github-pull-request",
  "repository": "pulse-ops-ai/secure-home-agent-platform",
  "number": 0 }
```

CI supplies the same value it supplies for the explicit history base, and the
checker compares it byte-for-byte against the value the genesis evidence binds.

**Sequence.** The real ceremony moves to PR-3, where the identity exists:

| Landing | Attestations |
| --- | --- |
| **PR-2** | computes and **freezes** the candidate state, source manifest, consumer inventory, evidence identities, historical-completion preimages, candidate-freeze identity and every digest; implements and proves canonical freshness extraction, comparison, equivalent-result construction, and `activationFreshnessDigest` using **test** fixtures and attestations. It does **not** claim the real activation has been attested. |
| **PR-3** | the branch is based on exact current `main` and records `activationBaseCommit`; the already-proven freshness mechanism is invoked before candidate promotion and immediately before the seam is staged; the draft activation PR is opened first, yielding a stable PR number; that `{repository, number}` is bound as `activationIdentity`; the external index's conditional text is written with the same number; the owner records `MAN-G02`, then the **two real attestations** including the equivalent freshness result; the complete gate re-runs on the post-attestation head; immediately before merge, current `refs/heads/main`, the PR-3 base SHA, and attested `activationBaseCommit` must be equal; the landing merges atomically. |

This keeps PR-2 honest — it proves the machinery, not the ceremony — and leaves
PR-3's "no new authoring" claim true of the *registry content*, which is
promoted unchanged; only the attestation envelopes and the activation identity
are added, and both are the activation's own business.

A preallocated logical activation identifier would also work, but only with its
type, uniqueness rule, relation to the real PR number, and CI input defined.
Version one takes the simpler route: the PR number, allocated by opening the
draft first.

**How the draft is opened before it has a reviewable diff**, decided here rather
than left for an implementer to invent: the activation branch begins with a
single **activation-intent commit** — a short, explicitly non-authoritative note
under the change's own directory recording that this branch will carry the
activation and that it holds no governance authority yet. That is enough to open
a draft PR and allocate the number. It creates no `governance/` path, asserts no
state, and is removed or superseded by the activation content itself.

**Atomicity is a property of every revision, not only of the merged PR.** The
contract forbids any revision containing a canonical `governance/state.json`
beside a surviving hand-authored copy. If the seam were built across several
commits, the intermediate ones would violate that even when the PR squash-merges
correctly. The activation branch therefore has exactly three content commits:

```text
Commit 1   the non-authoritative activation-intent note, used only to
           allocate the PR number

Commit 2   THE COMPLETE SEAM, staged and committed together:
             canonical registry + manifests
             generated regions
             every prose deletion and pointer conversion
             current checker · history checker
             prohibited-copy enforcement · CI integration

Commit 3   the owner-recorded genesis attestations

thereafter verification only — no further repository-content change
```

The candidate-source deletions are authored by task 8.2 and the
`ACTIVATION-INTENT.md` deletion is authored by task 8.2a; 8.5a only stages both
already-authorized deletions in Commit 2. The verification-only tasks 8.5a and
8.6 do not author content.

The owner completes and records `MAN-G02` in PR metadata before Commit 3 and
re-checks it at merge time. The merge gate also rereads
`refs/heads/main` and the PR-3 base SHA and requires both to equal the attested
`activationBaseCommit`. If that equality fails, the owner must refuse merge,
update PR-3 onto the new exact `main`, rerun freshness, rebuild or revalidate
the seam, freeze again, recreate the attestations, and rerun hosted checks. If
neither an enforceable owner-controlled merge path nor credential separation is
evidenced, the owner must not record the real attestations or merge the
activation.

**And the ceremony must be the last thing that happens.** Attesting before the
seam is complete would bind artifacts that later tasks then change, so the
"post-attestation head" would not be final. The order in D11a is therefore:
build the entire seam, freeze it, attest, and re-run everything on that exact
head.

---

## D11. Landing seams

Three landings. **All machinery is built and proven before the canonical
registry exists.**

| Landing | Ships | Canonical `state.json`? | Authority posture |
| --- | --- | --- | --- |
| **PR-1** | model, strict reader, collection canonicalization, current checker, its proof net | **no** | none |
| **PR-2** | history checker, renderer, query, genesis machinery, canonical freshness extraction/comparison and digest proof, **candidate** seed at a fixture path, full proof net | **no** | none |
| **PR-3** | **atomic activation** after freshness invocation and final base-equality gate | **first appearance** | authoritative |

**PR-3 is indivisible.** It contains, in one change:

```text
governance/state.json                 (canonical path, first appearance)
governance/README.md
governance/STATE.md                   (generated)
genesis attestation + source manifest
activation-base freshness result bound to genesis attestation
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
