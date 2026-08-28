# ADR-0021: Establish a machine-readable authority for mutable cross-cutting governance state

- **Status:** Proposed
- **Date:** 2026-08-28
- **Deciders:** @mikegtech (repository owner) — acceptance is a separate human act
- **Decides:** the authority boundary, shape, and validation contract for a future root-level governance-state registry
- **Closes:** no unresolved decision. In particular, [U4](../architecture/unresolved-decisions.md#u4) remains unresolved while [ADR-0020](ADR-0020-place-runner-control-by-workload-class.md) is `Proposed`
- **Depends on:** [ADR-0001](ADR-0001-adopt-security-first-architecture.md) for the repository governance contract; [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) for the future implementation stack; [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) for one canonical home and subordinate projections; [ADR-0019](ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md) for the immutable-record and one-authority precedents
- **Preserves:** accepted ADR bodies and all existing domain authorities. The registry proposed here is not a replacement for an ADR, a knowledge registry, an image lock, a profile, a runtime evidence record, or an external task contract.
- **Changes no current state:** this proposal does not accept ADR-0020, resolve U4, satisfy GATE-U4, authorize implementation, or create any registry, script, test, or generated file.

---

## Context

### The question

The repository has a sound rule — a durable truth has one canonical home — but
it has no machine-readable home for a narrow class of mutable facts that cut
across many canonical documents. Decision lifecycle, unresolved-question
identity, gate predicates, program landing prerequisites, and external authority
references are currently restated by hand in indexes, architecture documents,
agent instructions, READMEs, OpenSpec context, and pull-request prose.

That makes a governance transition unusually fragile. The current repository
state is deliberately still:

- ADR-0020 is `Proposed`;
- U4 is unresolved;
- GATE-U4 is unsatisfied;
- L9 requires `L8 + GATE-U4`;
- issue #57 is L9's external authority anchor; and
- no issue reference, acceptance, or satisfied prerequisite is implementation
  authorization.

Those facts are easy to state once and difficult to keep identical across every
consumer. A future ADR-0020 acceptance would currently require editing a large
set of prose surfaces in one transition. At the inspected PR #101 head
`559d78cc32cc40f8eaa7aba15a961554f3033b43`, its diff touches 22 files across
status, resolution, gate, placement, and authorization wording. Pinning the
observed head makes that observation reproducible; no patch-line count is
treated as a governance fact. That is not evidence that the decision is too
broad; it is evidence that its mutable consequences have no shared substrate.

`openspec/config.yaml` is a second concrete failure mode. It contains an older
ADR range and U-item/toolchain claims in its free-form context. It is planning
configuration, not a governance authority, but nothing currently prevents it
from becoming a stale state store. This ADR records it as a migration regression
case; it deliberately does not edit that file or PR #101.

The existing state-consistency scan is useful defense in depth. It is not an
authority: it recognizes known wording patterns and cannot prove that a newly
worded claim is complete, current, or derived from the same source.

### Precedents already in the repository

Three existing mechanisms establish the shape to reuse:

- `knowledge/catalog.json` is the machine-readable registry for module and set
  metadata, and `scripts/check-knowledge.mjs` owns its closed vocabulary,
  identity, path, and projection checks. The checker deliberately does not
  reimplement the knowledge toolchain's content rules.
- `knowledge/set-releases.json` records immutable release identities, while
  `scripts/check-release-history.mjs` compares two revisions. It refuses an
  invalid explicit base instead of silently comparing another revision, and it
  delegates succession semantics to one rule owner.
- `deploy/images/image-lock.yaml` is the one machine-readable image-lineage
  record, while `scripts/check-images.mjs` owns its strict grammar and
  structural invariants. The governed build supplies the separate real-build
  proof.

These precedents separate one authored record from derived views, separate
current-state validation from history validation, and make a failed or missing
proof visible rather than treating it as success.

### Why prose cannot remain a coequal authority

The defect is not fixed by adding one more index paragraph. If
`governance/state.json` is added while the current hand-authored status copies
remain authoritative, it becomes another coequal surface — effectively a
**“fifty-first surface”** in the current fan-out, a qualitative warning rather
than a counted invariant. Removing mutable duplication is therefore part of
this decision, not optional cleanup after it.

---

## Decision

### 1. Establish one root-level governance domain

The repository will, after a separate acceptance and implementation task, have
this root-level domain:

```text
governance/
├── README.md
├── state.json
└── STATE.md              # generated human-readable projection
```

The root location is deliberate. This authority spans decisions, architecture,
agent instructions, OpenSpec context, program landings, and external authority
references. It is not decision-document metadata and must not be placed beside
the ADR bodies under `docs/decisions/`.

`governance/state.json` is the sole authored authority for the primitive fact
families in §3. `governance/STATE.md` is never hand-authored; it is a
deterministic projection. `governance/README.md` explains ownership, schema
version, query usage, generated regions, and the fact that the registry grants
no runtime or implementation authority.

This ADR only decides that contract. It does not create the directory or any
of its files.

### 2. Separate four kinds of information

The registry and its consumers will preserve these boundaries.

#### 2.1 Immutable normative records

Accepted ADR bodies, archived OpenSpec changes, reviewed commits, acceptance
evidence, and historical rationale remain immutable records. They retain the
normative content of why a decision was made and what evidence was reviewed.
The registry references them by stable repository path, reviewed identity, or
other typed evidence reference. It does not replace or rewrite their content.

An accepted ADR's body remains the authority for its decision. The registry
owns the current lifecycle index and relationships needed to evaluate mutable
state, not the ADR's rationale.

#### 2.2 Primitive mutable governance facts

`governance/state.json` is the sole authored authority for the narrowly defined
cross-cutting fact families in §3. A fact belongs there only when its identity
and value are needed by more than one governance surface and it is not already
owned by another machine-readable authority.

The registry contains no convenience copy of a derived count, blocker list,
readiness result, or authorization boolean. Primitive records carry their
stable identity, source/evidence references, and the minimum authored values
needed to derive those conclusions.

#### 2.3 Derived governance state

Counts, ranges, resolution status, gate satisfaction, blockers, prerequisite
readiness, and explanations are computed by the model. They must not be
independently authored in `state.json` or in a hand-maintained document.

The model must produce one answer for a given registry revision. An ambiguous,
missing, malformed, or cyclic input is a refusal, not an alternate derivation.

#### 2.4 Projections and references

Human-facing tables and status summaries are generated projections. Most other
documents point to `governance/STATE.md` or the query command rather than
restating current values. A projection may explain meaning and rationale, but
it has no independent authority and is defective if its registered generated
region disagrees with the registry.

Keeping a hand-authored copy beside the projection is explicitly not a
compatibility mode.

### 3. Version-one primitive fact families

Version one is intentionally a governance-state registry, not a universal
repository database. Its top-level collections have a closed schema and
stable identifiers. The conceptual envelope is:

```json
{
  "schemaVersion": 1,
  "adrs": [],
  "questions": [],
  "gates": [],
  "landings": [],
  "externalReferences": []
}
```

The exact field spelling may be refined during the separately authorized
implementation, but the ownership and semantics below are part of this
decision.

#### A. Decision lifecycle

Each ADR record contains only primitive facts:

- stable ADR identifier;
- canonical repository path;
- title;
- current lifecycle from the closed vocabulary `Proposed`, `Accepted`,
  `Superseded`, or `Rejected`;
- proposal date;
- human acceptance evidence when accepted;
- immutable reviewed commit or equivalent reviewed identity;
- content SHA-256 once accepted;
- `resolves` relationships; and
- `supersedes` relationships.

The record does not store accepted counts, accepted ranges, or convenience
flags such as `isCurrent`, `isImmutable`, or `resolvesU4`. The model derives
those conclusions from lifecycle and relationships.

#### B. Unresolved-question identity

For U1–U11, each question record contains:

- stable U identifier;
- canonical document anchor;
- title or short description; and
- severity only when severity is itself a governed primitive.

Question resolution is derived from an accepted current ADR's `resolves`
relationship. The registry must not maintain both
`question.resolved: true` and `ADR.resolves: ["U4"]`. A question with more
than one current resolver is invalid.

The question record has no authored lifecycle field. The existing question
document remains the human-readable record of the question and its history;
the future generated status portions are a projection of this relationship.

#### C. Governance gates

Each gate record defines a predicate over primitive state. Predicates use a
closed, named vocabulary evaluated by the model; they are not arbitrary code or
an editable JavaScript expression.

For example:

```text
GATE-U4 is satisfied when exactly one current accepted ADR resolves U4.
```

The record contains the predicate definition and its source references, never
an independently editable `satisfied: true` field. The model returns the
predicate result and an explanation chain. If a predicate cannot be evaluated
unambiguously, the gate is unsatisfied and the checker fails closed.

#### D. Program landings and prerequisites

Version one includes the runner layer/gate map because it is one of the most
duplicated and least structured fact families. Omitting it would leave the
L8/GATE-U4/L9 drift that exposed this defect outside the authority boundary.

Each landing or gate node may contain:

- stable landing or gate identifier;
- kind;
- typed external authority anchor;
- prerequisite identifiers;
- primitive delivery evidence or delivery lifecycle when applicable;
- completion-policy identity when a landing has a delivery lifecycle;
- optional reviewed ordering intent when the prerequisite DAG alone does not
  define order.

If a landing has a delivery lifecycle, version one uses the closed vocabulary
`Planned`, `InProgress`, `Complete`, or `Withdrawn`. The only legal transitions
are `Planned -> InProgress`, `Planned -> Complete` when the same reviewed
change supplies completion evidence, `Planned -> Withdrawn`,
`InProgress -> Complete`, and `InProgress -> Withdrawn`. `Complete` and
`Withdrawn` are terminal. There is no implicit transition from a reference,
issue, or prerequisite declaration to `Complete`.

`Complete` requires the independent completion protocol in the next subsection;
a record that merely names the landing and an existing commit is not evidence.
`Withdrawn` requires the corresponding typed withdrawal protocol. `Planned`
and `InProgress` do not satisfy a prerequisite. The model therefore derives a
landing prerequisite as satisfied only when its delivery lifecycle is
`Complete` and every required completion identity and attestation validates. It
derives which prerequisites remain unsatisfied, whether the node is
prerequisite-ready, and the explanation for a blocked node. It must not store both
`requires: ["L8", "GATE-U4"]` and an independently editable
`blockedOn: ["L8"]`.

Delivery completion does not prove the historical authorization under which the
work occurred. For `Complete` or `Withdrawn` landings, prospective-start
authorization assessment is non-applicable; a historical-authorization query
may still require external verification.

#### D.1 Identity-bearing rule inputs and completion proof

The following primitive values are identity-bearing rule inputs, not ordinary
mutable annotations:

- a gate predicate definition and its source references;
- a landing or gate kind;
- a landing's prerequisite identifier set;
- a landing's typed external authority anchor;
- a landing's completion-policy identity; and
- reviewed ordering intent when it changes the meaning of readiness.

Their canonical values form the semantic identity of the gate or landing. The
implementation may compute an identity digest rather than store a convenience
digest, but it must not treat these values as freely editable fields.

The genesis attestation binds every one of these values. After genesis, version
one permits no in-place mutation of an existing gate or landing identity. A
changed rule must be introduced as a new stable gate or landing identity, with
an explicit typed supersession/replacement relationship when it replaces an
older identity. The old identity remains immutable. Version one defines no
human-attested in-place rule-change transition; adding one requires a new ADR.
The history checker refuses every other mutation, including changing a gate's
predicate, removing `L8` from L9's prerequisites, or repointing L9 away from
issue #57.

Completion is also an identity-bound transition, not a self-asserting record.
The v1 completion-policy vocabulary is closed:

- `reviewed-delivery-v1` is for a governed implementation landing. It requires
  the child archived OpenSpec identity, delivered scope, exact commit or
  artifact identity, authority anchor, and human completion attestation.
- `reviewed-spike-evidence-v1` is for an empirical spike landing. It requires
  the authority issue, merged evidence PR and commit, canonical evidence root,
  evidence-manifest digest, findings identity, and human completion
  attestation. It explicitly requires no OpenSpec archive because the spike
  itself was not governed by an OpenSpec change.

There is no generic `legacy-bootstrap-v1` escape hatch. Both policy identities
are immutable rule inputs under this subsection. Adding another policy, or
allowing an in-place policy change, requires a new ADR that fixes its eligible
landing identities, evidence requirements, and transition/expiry rules.

Every completion-transition preimage binds the landing identifier, prior and
target delivery lifecycles, governing authority-anchor identity, exact delivered
commit or artifact identity, and completion-policy identity. The policy-specific
requirements are also part of that preimage:

- `reviewed-delivery-v1` binds the canonical archived OpenSpec path, exact
  content SHA-256, and reviewed identity;
- `reviewed-spike-evidence-v1` binds the canonical evidence root, exact
  evidence-manifest SHA-256, findings path and content identity, merged evidence
  PR, merged commit, and the explicit no-OpenSpec applicability fact.

The delivered commit/artifact identity uses the tagged identity classes in §7a
and must be bound to the landing's declared scope; an unscoped commit hash is
insufficient. `completionDigest` is the SHA-256 of the canonical serialization
of this complete policy-specific preimage. A human completion attestation binds
the digest, outcome, exact delivered identity, actor, RFC 3339 time, and
authority reference. The attestation is excluded from its own preimage, using
the same non-self-referential protocol as ADR acceptance. The withdrawal
protocol uses the same shape with target lifecycle `Withdrawn` and withdrawal
evidence.

The checker must verify every locally checkable identity: the reviewed commit
object and scoped delivered bytes, the applicable OpenSpec or evidence path and
content digest, the authority-anchor shape, the merged PR/commit identity, and
the completion-policy identity. An opaque or unavailable required identity is
not a valid completion proof; the checker fails closed, leaves the landing
unsatisfied, and reports `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION`. An
arbitrary existing commit or syntactically valid issue reference cannot by
itself make a landing `Complete`.

The genesis conformance fixture must prove that the actual completed L6 spike
is representable as `reviewed-spike-evidence-v1`:

```text
landing: L6
authority anchor: GitHub issue #54
delivery: GitHub PR #73, merged commit e0e8b786201d3e92bbe05f286ae55b9e002c4109
evidence root: docs/spikes/l6-copilot-cli/
manifest: docs/spikes/l6-copilot-cli/MANIFEST.sha256
manifest SHA-256: db7fdc1746dad6a481be295f32125353a07f3edb6e1b13add689648f23fec984
findings: docs/spikes/l6-copilot-cli/L6-Copilot-CLI-Spike-Findings.md
findings SHA-256: f9bb9082da596b264f569c47ebd33eee117cc10663f2ee5c0c7522371abde592
OpenSpec: not applicable; no retrospective archive may be manufactured
```

The negative fixture must show that an arbitrary issue plus arbitrary merged PR
fails the spike policy without the bound evidence root, manifest, findings, and
attestation. It must also refuse a retrospectively created OpenSpec archive as
a substitute for the explicit no-OpenSpec fact.

An issue or task reference is a fact about authority location, not proof that
the landing is authorized or complete.

#### E. External authority references and evidence sources

GitHub issues, pull requests, and accepted task contracts are represented as
typed references and evidence sources. A reference has a closed type and the
minimum identity needed to locate it, such as repository and issue/PR number;
it does not copy the external system's mutable prose into the registry.

The registry distinguishes three different questions:

1. Are the prerequisites ready?
2. Is there external authorization for this exact scope?
3. Has the work been delivered and evidenced?

Version one is permanently non-authorizing. It records typed references and
evidence sources, but it never accepts a locally consumable authorization grant
and never returns `AUTHORIZED`. For a prospective start, its authorization
assessment has only two outcomes: `PREREQUISITES_NOT_READY` when a required
prerequisite is unsatisfied and
`AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` when prerequisites are ready
but external authorization is still required. These are authorization-
assessment values, not the complete query result. There is no convenience
`authorized: true` field and no separately defined verification input hidden
behind this ADR.

Adding a locally consumable authorization-evidence contract requires a new ADR
that defines its producer, trust root, exact-scope binding, content identity,
expiry, revocation, and history rules. Until then, the governance model can
only report the need for external verification.

In particular, issue #57 is recorded as L9's external authority anchor. Its
existence, its being named as an anchor, ADR acceptance, or satisfied
prerequisites never manufactures permission to start L9. The registry is a
record and verifier of governance facts, not an issuer of implementation
authority.

### 4. Derived-state rules and the ADR-0020 transition

The following conclusions are never hand-authored:

- “ADR-0001 through ADR-0020 are accepted”;
- the accepted ADR count;
- “three of U1-U11 are resolved”;
- “U4 is resolved”;
- “GATE-U4 is satisfied”;
- “L9 is waiting on L8”;
- accepted/proposed decision tables;
- unresolved-decision status tables; and
- current runner-program blocker summaries.

The model derives them from the primitive records and named predicates. A
future legal ADR-0020 acceptance transition has this chain:

```text
ADR-0020 Proposed -> Accepted
    derives U4 resolved
    derives GATE-U4 satisfied
    leaves L8 outstanding
    derives L9 prerequisite blocker = L8
    does not itself authorize or implement L9
```

On the current `main`, the first transition has not occurred: ADR-0020 is
`Proposed`, U4 is open, and GATE-U4 is unsatisfied. The chain is a future
derivation example, not a state change made by this proposal.

### 5. Existing authorities remain separate

ADR-0021 establishes one authority per fact. The governance registry must not
copy current state from:

- `knowledge/catalog.json`;
- `knowledge/set-releases.json`;
- `deploy/images/image-lock.yaml`;
- workspace-layering authorities;
- execution profiles; or
- runtime evidence.

Those authorities continue to own their respective states. The governance
registry may reference them as evidence or explain a dependency on them, but it
must not duplicate their fields, statuses, identities, or eligibility flags.

For example, a landing may reference an image-lock or profile check as evidence
without copying image digests or profile capability into governance state.

### 6. Future supporting mechanism

After ADR-0021 is separately accepted and separately authorized for
implementation, the supporting mechanism will have these responsibilities.
The filenames are proposed implementation names and may be refined without
changing the responsibility split:

```text
scripts/
├── governance-state-model.mjs       # parse, model, and evaluate one revision
├── check-governance-state.mjs       # current-revision validation
├── check-governance-history.mjs     # two-revision transition validation
├── render-governance-state.mjs      # deterministic projections and --check
└── query-governance-state.mjs       # human and machine query surface

tests/
└── test_governance_state.py         # conformance and falsification tests
```

The model is the single semantic owner. The checkers, renderer, query command,
and tests consume it rather than reimplementing predicates or transition rules.
The scripts are dependency-light and offline; no network call is needed to
validate a checked-out revision. The future Python tests exercise the real
Node entry points and hostile fixtures rather than testing only helper strings.

The model/evaluator owns the closed schema, canonical JSON reading, primitive
identity, relationship resolution, gate predicates, prerequisite graph, and
derived explanations. `check-governance-state.mjs` owns current-revision and
projection checks. `check-governance-history.mjs` is the Git-history adapter
that supplies two revisions to the model. The renderer owns registered target
paths and generated markers. The query tool is read-only and has no authority
to mutate the registry or external systems.

### 7. ADR header and accepted-byte immutability

Every ADR has a human-readable `Status:` line, but that line is not a second
mutable lifecycle authority.

- `governance/state.json` owns the current ADR lifecycle.
- While an ADR is `Proposed`, its `Status:` header is a required checked mirror
  of the registry. A disagreement fails the current-state check.
- Acceptance changes the ADR header and its registry lifecycle in one reviewed,
  atomic transition. The acceptance record captures the exact accepted ADR
  bytes by SHA-256 and the immutable reviewed commit or equivalent reviewed
  identity.
- Once accepted, the ADR body — including its header and accepted bytes —
  cannot change. A later reversal is a new ADR that supersedes it.
- Supersession is represented by the new ADR's relationship and the current
  registry lifecycle. The old accepted ADR's `Status: Accepted` line remains a
  historical record of the accepted bytes; it is not rewritten to make an
  accepted document pretend it was authored as `Superseded`.

The validator therefore has an explicit allowed-mirror rule: a proposed ADR
must mirror its current lifecycle; an accepted ADR must retain its accepted
header and accepted-byte digest; and a `Superseded` current registry record is
legal only when a new accepted ADR supplies a valid `supersedes` relationship
without mutating the old file. No status transition may be smuggled through an
index edit.

A rejected ADR must retain `Status: Rejected` and its rejected-byte digest;
that header is its final checked mirror. A superseded ADR is the deliberate
exception described below: its immutable historical header remains
`Status: Accepted` while the registry records its current superseded
relationship.

The ADR lifecycle is closed, not merely a closed vocabulary:

- `Proposed -> Accepted` requires a human acceptance attestation, the final
  accepted-byte SHA-256, and the atomic registry/header transition described
  below.
- `Proposed -> Rejected` requires a human rejection attestation bound to the
  final rejected bytes by SHA-256. A rejected ADR is immutable and `Rejected`
  is terminal.
- `Accepted -> Superseded` is legal only when a new accepted ADR records a
  valid `supersedes` relationship to it. The old ADR remains immutable and its
  historical header remains `Accepted`.
- No other transition is legal: in particular, `Rejected -> Proposed`,
  `Rejected -> Accepted`, `Accepted -> Proposed`, `Accepted -> Rejected`, and
  `Proposed -> Superseded` are refused. `Superseded` is terminal for the old
  record.

Rejection evidence uses the same typed, non-secret human-attestation shape as
acceptance evidence, with an outcome of `rejected`, the exact final ADR-byte
digest, actor, time, authority reference, and transition digest. It does not
grant implementation authority.

### 7a. Relationship provenance, bootstrap proof, and evidence identity

The registry is the sole authored machine-readable source for the primitive
cross-cutting fields in §3 after migration, but it never overrides an
immutable ADR's normative content. The authority and mirror rule is
field-specific:

The registry is not a fallback when a mirror disagrees: any disagreement
invalidates the repository, and the registry cannot override an immutable ADR
or make a relationship true by assertion alone.

| Fact | Authored source after bootstrap | Required mirror or proof |
| --- | --- | --- |
| ADR identity, canonical path, title, and proposal date | `governance/state.json` | The file path and structurally parseable ADR header must match the registry record. |
| Current ADR lifecycle | `governance/state.json` | The ADR `Status:` line is a checked mirror under §7; accepted and rejected bytes are pinned by digest. |
| `resolves` and `supersedes` relationships | `governance/state.json` | The structurally parseable ADR relationship header and generated projections must be equivalent; the ADR body remains the normative rationale. |
| Acceptance or rejection evidence and content identity | `governance/state.json` | Typed human attestation and exact ADR-byte SHA-256; any reviewed identity is separately classified below. |
| Decision rationale and normative requirements | The ADR body | The registry may index and derive from them, but cannot replace, amend, or contradict them. |

At genesis, each relationship and identity-bearing rule input is additionally
required to carry a reviewed bootstrap attestation. The seed ceremony must
compare the canonical registry tuples — including lifecycle, identity,
proposal date, `resolves`, `supersedes`, gate predicate definitions, node kinds,
prerequisite sets, authority anchors, and completion policies — against every
structurally parseable ADR header, decision-index record, and
unresolved-decision resolution banner in the selected source snapshot. It must
compare relationship and rule identity, not merely accepted counts or matching
current summaries. A registry relation such as `ADR-0019 resolves U4` is
invalid when the source ADR does not declare that relationship, even if all
derived counts and banners happen to agree. A disagreement, parse failure, or
omitted source is an explicit bootstrap failure requiring human review; it is
never silently treated as an empty or equivalent source.

The seed parser may normalize the repository's existing relationship labels
(`Closes`, `Decides`, and any explicitly governed equivalent) into the registry
field `resolves`, but it may not infer a relationship from unstructured prose.
An absent, ambiguous, or conflicting label is a reconciliation failure unless
the bootstrap attestation records the source and its human disposition.

The seed attestation binds the canonical seed digest, a separate canonical
relationship-equivalence digest, the source snapshot identity, actor, time,
and a typed authority reference. Its preimage excludes the attestation itself.
The attestation therefore proves that the seed was reconciled to the selected
pre-registry sources without making the first registry revision its own proof.
The implementation must include a conformance case that injects a wrong
relationship into an otherwise byte-correct seed and refuses it without
relying on a prior registry revision.

Acceptance and bootstrap evidence use this explicit non-self-referential
protocol. A transition preimage contains the schema version, prior-state
digest (or `null` for genesis), target primitive digest, subject ADR, lifecycle
transition, exact ADR content digest, and relationship digest. The
`transitionDigest` is the SHA-256 of canonical serialization of that preimage.
The target primitive digest and relationship digest are computed over the
target primitive records and relationships with the attestation envelope
excluded. The typed human attestation records the `transitionDigest`, exact
content digest, outcome, actor, RFC 3339 time, and authority reference. The
attestation is an external human act recorded as evidence; it is not generated
from, or included in, the preimage, so no commit or registry row needs to
contain its own identity.

The implementation must distinguish these identities rather than collapse
them into “reviewed identity”:

- a `local-git-commit` is locally verifiable only when its object exists in the
  checked-out repository;
- an `external-git-commit` is an opaque provenance reference and is not offline
  proof that the object is available; and
- a `content-sha256` is the exact byte identity of the reviewed ADR or other
  evidence artifact.

The human attestation is the acceptance authority; a commit reference is
supporting provenance, not the causal binding. A commit containing the
attestation may be recorded after the fact, but changing that commit cannot
change the already-bound transition digest. The same protocol applies to the
genesis attestation, with `prior-state-digest: null` and the source/equivalence
digests above.

### 8. Current-revision validation

`check-governance-state.mjs` will be a dependency-light, offline checker. It
fails closed on all of the following:

- missing `state.json` or any required registered projection;
- malformed or noncanonical `state.json`;
- duplicate JSON keys;
- unknown fields;
- duplicate entity identifiers;
- invalid repository paths or document anchors;
- invalid dates or actor/evidence shapes;
- references to missing entities;
- prerequisite cycles;
- an accepted ADR whose content digest does not match the referenced file;
- a registry relationship that disagrees with the ADR's checked relationship
  mirror or its reviewed bootstrap attestation;
- an ADR header that disagrees with the allowed mirror rule;
- multiple current resolvers for one question;
- a landing lifecycle or completion record that violates its closed transition
  and evidence rules;
- an unknown completion-policy identity or evidence that does not satisfy its
  selected policy;
- generated projection drift; and
- a projection target or generated marker not registered by the renderer.

Canonical JSON is a closed representation, not merely whatever the host JSON
parser happens to accept. The future checker must reject duplicate keys before
object construction, reject unsupported fields and noncanonical encoding or
serialization, and compare generated output byte-for-byte. A malformed input
must never be interpreted as an empty registry or an unsatisfied-but-healthy
state.

The checker has no network dependency. External references are validated for
shape and evidence identity locally; a query that needs live external
authorization returns `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` rather
than guessing from a URL or issue number.

### 9. Two-revision history validation

`check-governance-history.mjs` will compare the current registry with an
authoritative base supplied by CI, analogous to the knowledge set-release
succession check. A single-revision check cannot prove that an accepted record
was not deleted, re-identified, or weakened.

When CI supplies an explicit base, that base is exclusive. If it is invalid,
missing, unreadable, or not a commit, the history check fails and never falls
back to `merge-base`, `HEAD~1`, or another inferred revision. A comparison
against the wrong revision is a false green. After the initial governed seed,
every transition check must compare against a valid prior registry revision.

The history checker refuses at least:

- deletion or renumbering of an existing ADR, U-item, gate, or landing;
- `Accepted -> Proposed` or `Accepted -> Rejected` regression;
- any other illegal ADR lifecycle transition, including a rejection that lacks
  its final-byte attestation;
- mutation of accepted evidence;
- mutation of accepted ADR bytes;
- mutation of an accepted ADR's `resolves` relationship;
- disappearance of a resolved question's current resolver;
- illegal supersession;
- prerequisite re-identification or dangling references;
- illegal landing lifecycle regression;
- completion or withdrawal without required evidence;
- mutation or disappearance of delivery evidence after a landing reaches a
  terminal lifecycle;
- in-place mutation of an identity-bearing gate or landing rule input,
  including a gate predicate, node kind, prerequisite set, authority anchor,
  completion policy, or readiness-changing ordering intent;
- a replacement gate or landing identity without its explicit typed
  supersession/replacement relation and human-attested transition; and
- introduction, mutation, or disappearance of any authorization-evidence
  record. Version one has no such record and rejects it as an unknown field;
  a future ADR that adds one must define a legal withdrawal/succession rule.

The allowed acceptance transition is narrow: the proposed ADR header, registry
record, reviewed identity, acceptance evidence, and accepted-byte digest must
arrive together. A new ADR may supersede an accepted ADR only under the
registered relationship rules, while the old accepted bytes remain identical.
History validation delegates these semantic rules to the model so that the
Git adapter does not become a second rule authority.

The conformance suite must independently mutate the GATE-U4 predicate, remove
`L8` from L9's prerequisite set, and repoint L9's authority anchor away from
issue #57. Each mutation must fail history validation even when the resulting
derived answer is otherwise internally consistent.

### 10. Generated projections and reference consumers

The renderer will deterministically generate:

- `governance/STATE.md`;
- the current lifecycle portions of `docs/decisions/INDEX.md`;
- the summary table and resolution banners in
  `docs/architecture/unresolved-decisions.md`; and
- any narrowly justified current-state section that remains local to another
  document.

Each generated region has an explicit begin/end marker registered by the
renderer. `render-governance-state.mjs --check` renders from `state.json` and
fails unless the result is a byte-for-byte no-op. An unregistered target or
marker is an error, not an ignored file.

Most mutable status text in these surfaces will instead become a stable pointer
to the registry or query contract:

- root and nested `AGENTS.md`;
- provider instruction files;
- root and nested READMEs;
- service documentation; and
- `openspec/config.yaml`.

For the closed set of registered consumer files, the implementation must refuse
reintroduction of manually maintained ADR ranges, resolved counts, U-item
status lists, and runner blocker summaries outside registered generated
projections. `openspec/config.yaml` is an explicit regression case: it must be
generated or replaced by a pointer and cannot remain an independent mutable
governance-state store. It is not edited by this proposal.

This enforcement has three deliberately separate tiers:

1. Mechanical enforcement covers registered generated regions, their markers
   and targets, and the closed set of prohibited mutable fields in registered
   consumers. The renderer and current-state checker reject drift or an
   unregistered projection.
2. A known-pattern scan remains defense in depth and can flag suspicious
   natural-language copies for review.
3. Human review owns free prose that is not registered as generated state. No
   regex scan may claim to prove that arbitrary prose contains no contradiction.

The mechanical proof is the closed registry, derivation model, projection
renderer, and current/history checks; the scan is not an authority.

### 11. Query contract

The future read-only query surface will support human explanations and a
machine-readable form, for example:

```text
node scripts/query-governance-state.mjs explain runner/L9
node scripts/query-governance-state.mjs explain runner/L9 --json
```

The query object must expose separate axes rather than collapse delivery,
readiness, and authorization into one status:

```json
{
  "deliveryState": "Planned",
  "prerequisiteReadiness": {
    "state": "NotReady",
    "unsatisfied": ["L8"]
  },
  "authorizationAssessment": "PREREQUISITES_NOT_READY",
  "externalAuthorityAnchor": {
    "type": "github-issue",
    "repository": "pulse-ops-ai/secure-home-agent-platform",
    "number": 57
  }
}
```

`deliveryState` is the primitive landing lifecycle. `prerequisiteReadiness`
and its `unsatisfied` identifiers are derived from the prerequisite graph and
validated delivery states; its state vocabulary is `Ready` or `NotReady`.
`authorizationAssessment` is specifically the
assessment for a prospective start and has only the two values defined in §3E:
it is `PREREQUISITES_NOT_READY` while any prerequisite is unsatisfied and
`AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` once prerequisites are ready.
It never returns `AUTHORIZED`.

After a future legal ADR-0020 acceptance, the result for `runner/L9` must show
GATE-U4 satisfied, L8 unsatisfied, L9 not prerequisite-ready, issue #57 as the
external authority anchor, and no inferred implementation authorization. Once
L8 is complete and all prerequisites are ready, the same query must show
`prerequisiteReadiness.state: "Ready"` and
`authorizationAssessment: "AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION"`.

For a landing whose `deliveryState` is `Complete`, the query must report the
completed delivery and must not describe it as waiting for authorization before
work may start. A non-applicable prospective-start assessment may be `null`; a
request to explain the historical authorization for that completed delivery
may instead report `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` with a
historical scope. Neither form asserts that the delivery was authorized, and
neither returns `AUTHORIZED`. Querying is explanation, not authorization.

### 12. Bootstrap and migration sequence

The following sequence is part of the decision:

1. This ADR is proposed and changes no operative governance state.
2. Acceptance of ADR-0021 is the final governance transition performed under
   the existing manual reconciliation mechanism. Its acceptance PR is a
   separate human-reviewed change and must reconcile every live current-state
   consumer one final time, including agent instructions, ADR indexes,
   unresolved-decision summaries, architecture documents, READMEs, service
   documentation, OpenSpec context, and any registered external prose mirrors.
   The accepted set at that point is non-contiguous: ADR-0001 through
   ADR-0019 and ADR-0021 are `Accepted`, while ADR-0020 remains `Proposed`.
   The acceptance PR must state that set explicitly and must not replace it with
   a continuous accepted range. No contradictory intermediate repository state
   may be merged. This final manual fan-out is the unavoidable bootstrap cost;
   this ADR selects no bounded bootstrap exception. Any future exception would
   require its own exact scope, fail-closed behavior, and mandatory expiry.
3. A separately authorized implementation issue and OpenSpec change implement
   the substrate only after ADR-0021 is accepted.
4. The initial registry is seeded from the `main` snapshot before PR #101's
   acceptance transition, after the reconciliation in step 2:
   - ADR-0001 through ADR-0019 and ADR-0021 are `Accepted`;
   - ADR-0020 is `Proposed`;
   - U4 is derived open;
   - GATE-U4 is derived unsatisfied;
   - L8 is outstanding;
   - L9 requires `L8 + GATE-U4`;
   - issue #57 is L9's authority anchor; and
   - no L8 or L9 implementation authorization is inferred.
   The seed is valid only with the field-by-field relationship-equivalence and
   non-self-referential bootstrap attestation required by §7a; matching counts
   or summaries alone are not proof.
5. Existing prose consumers are migrated to generated projections or stable
   references.
6. The stale `openspec/config.yaml` content becomes an explicit regression
   case: it must be generated or replaced by a pointer and cannot remain an
   independent state store.
7. PR #101 is rebased and narrowed as the first consumer of the mechanism.
8. PR #101's authored content retains only genuine semantic architecture edits,
   including the two physical realizations of B4, the system topology, and the
   runner “Runs on” semantics.
9. ADR-0020 `Proposed -> Accepted` becomes one legal registry transition.
10. U4 resolution, gate satisfaction, counts, status tables, and the L9
    blocker explanation are regenerated from that transition.
11. F5 is satisfied through mechanical reconciliation rather than hand-editing
    all five named documents.
12. GitHub issue #19 becomes a human-facing mirror or authority reference, not
    a second mutable program-state authority.

The bootstrap seed is a future implementation artifact. It is not
`governance/state.json` and no state transition occurs in this proposal.

### 13. Scope of the future implementation

The implementation task must preserve the following boundaries:

- no registry field may authorize L8, L9, deployment, credentials, or device
  access;
- no query result may turn prerequisite readiness into permission to start;
- no external issue or pull-request status may be treated as a local substitute
  for reviewed authority evidence;
- no domain-owned registry may be copied into governance state;
- no generated projection may become an authored source; and
- no runtime or household operation may depend on the governance tooling being
  available.

---

## Consequences

**Positive.**

- One machine-readable source owns mutable cross-cutting facts.
- Acceptance transitions become small, explicit registry changes with derived
  consequences rather than a broad prose synchronization exercise.
- Current state, history, and projection drift become separately testable.
- Agents and humans can ask for an explanation without searching dozens of
  documents or trusting provider-specific wording.
- Accepted ADR bytes retain an exact identity while their current lifecycle and
  supersession relationships remain queryable.
- The existing knowledge, release, image, workspace, profile, and runtime
  authorities retain ownership of their own states.

**Costs and risks.**

- The initial migration is substantial: current status blocks must be divided
  into generated projections, stable pointers, and genuine explanatory prose.
- A state transition now needs atomic registry, header, evidence, and generated
  projection validation.
- The repository must maintain both current-state and two-revision checks, and
  CI must supply a trustworthy base revision.
- Generated output is less convenient for an isolated prose edit; that friction
  is intentional because a second mutable copy is the defect being removed.
- The registry can become a new broad database if its schema is allowed to grow
  without an authority-boundary review. Its v1 families and closed fields must
  remain narrow.

---

## Alternatives considered

### 1. Continue maintaining prose plus a broader regex scan

Rejected. This preserves the current defect, makes each new wording variant a
new blind spot, and cannot prove derivation, completeness, or legal history.
The scan remains useful defense in depth, but it cannot be the authority.

### 2. Derive everything directly from ADR headers

Rejected. ADR headers are human-readable and historically nonuniform; accepted
ADR bodies are immutable; and headers cannot supply U-item identity, gate
predicates, landing prerequisites, delivery evidence, or external authority
references. An accepted header also remains a historical record when a later
ADR supersedes it. Treating headers as the whole model would either lose
relational facts or require rewriting immutable records.

### 3. Use GitHub issues as the sole mutable authority

Rejected. GitHub is an external, network-dependent system with mutable prose,
different permissions, and availability outside the repository. Issue
existence, labels, or state are not implementation authorization. The
repository needs an offline, reviewable source with exact local history while
retaining typed links to external authority.

### 4. Put the registry beside the ADRs under `docs/decisions/`

Rejected. That location would imply that the registry is ADR metadata, while
its consumers and fact families cross agent contracts, architecture,
OpenSpec, program landings, and external references. `docs/decisions/` remains
the home for why decisions were made; the root `governance/` domain owns the
cross-cutting mutable state.

### 5. Add the registry but retain all existing prose copies

Rejected. That creates the exact failure in a new form — another coequal
surface, described qualitatively as a “fifty-first surface” in the current
fan-out, with two authorities. The migration to generated regions and stable
references is part of the decision.

### 6. Root-level primitive registry with generated projections and references

Selected. It matches the repository's catalog, release-history, and image-lock
precedents; keeps primitive and derived facts distinct; works offline; supports
two-revision immutability checks; and reaches every cross-cutting consumer
without moving domain-owned state into the governance registry.

---

## Security implications

The registry is governance metadata, not a capability, credential, policy
decision point, or runtime authority.

- Malformed, missing, ambiguous, noncanonical, or cyclic state fails closed.
- Network position, tailnet membership, issue existence, an authority-anchor
  reference, accepted ADR status, registry presence, and prerequisite readiness
  grant no implementation or household authority.
- Authorization is not represented by a convenience boolean. Without separately
  verified external evidence, the query result is
  `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION`.
- Accepted-decision identity is protected by exact-byte SHA-256 and reviewed
  commit checks.
- Two-revision validation prevents rollback, deletion, re-identification,
  accepted-evidence mutation, illegal supersession, and disappearance of a
  resolver or prerequisite.
- The registry contains no secrets, credentials, tokens, or device identifiers;
  external references are typed identities and evidence links only.
- A generated projection cannot silently become authoritative because its
  target and markers are registered and its bytes are checked against the
  renderer.

This ADR does not decide U4 and does not authorize L8 or L9. A future
implementation must preserve that distinction even after ADR-0020 is accepted.

---

## Availability implications

Validation and query are offline and dependency-light. They must not contact
GitHub, the VPS, Home Assistant, Tailscale, a model provider, or any runtime
service merely to validate a checked-out revision. External authorization that
cannot be verified locally is reported as unavailable/required, not treated as
true.

The governance tooling is a repository merge control only. A broken or missing
governance check blocks a repository merge; it does not stop household
operation, deny an already-running runtime, or become a runtime dependency.

The history check must fail rather than silently use a wrong or absent base.
That is a repository availability cost accepted to avoid a false green on a
security-relevant transition.

---

## Validation and follow-up obligations

This proposal has no implementation to validate. Acceptance must remain a
separate human-reviewed change and must not create `governance/state.json` as a
side effect.

After acceptance, implementation is permitted only under a separately
authorized issue and OpenSpec change. That implementation must:

1. implement the exact root layout and responsibility split, or return with a
   new ADR if it needs a materially different authority boundary;
2. define and enforce the closed JSON schema, canonical representation, typed
   evidence shapes, and derived predicates;
3. prove duplicate-key rejection, unknown-field rejection, path/anchor
   validation, accepted-byte identity, resolver uniqueness, prerequisite-cycle
   refusal, closed ADR and landing transitions, relationship equivalence, and
   the two fail-closed authorization outcomes;
4. implement the current-revision checker and the two-revision history checker
   as separate entry points over the shared model;
5. make the explicit CI base exclusive and fail on an invalid base;
6. implement deterministic marked projections and byte-for-byte `--check`
   rendering;
7. migrate status copies, including `openspec/config.yaml`, to generated
   regions or stable pointers;
8. update `validate-scaffold.sh` so the root `governance/` domain, its required
   files, and its generated `STATE.md` are structurally covered. The v1 layout
   has no nested `governance/AGENTS.md`; the root contract and
   `governance/README.md` govern it unless a later decision changes that
   boundary;
9. run governance validation in the unconditional governance CI job, never
   only behind affected-target classification. Generated state must also pass
   formatting, secret scanning, and `git diff --check`; renderer targets that
   are indexes must coexist with their existing structural checks;
10. keep the renderer's write mode separate from CI `--check` mode and update
    the scripts documentation to explain that distinction, because the current
    scripts contract describes repository scripts as read-only;
11. add hostile controls for every derived rule and ensure removing a
    comparison or replacing it with a no-op fails the checker. This includes
    independently mutating the GATE-U4 predicate, removing L8 from L9's
    prerequisites, repointing L9's authority anchor, and replacing a
    completion attestation with an arbitrary existing commit reference;
12. seed the registry from the pre-#101 `main` state described in §12 with the
    field-by-field, relationship-equivalence, and non-self-referential
    attestation required by §7a, and prove that seeding changes no operative
    governance state; and
13. rebase and narrow PR #101 only after the substrate is accepted and landed.

The future implementation's conformance suite is
`tests/test_governance_state.py`. It must cover both a valid current state and
invalid mutations of the current and prior revisions, including the hostile
identity and completion cases above. A green test run is not evidence that an
external authorization exists.

---

## Non-goals

This proposal does not:

- implement `governance/state.json`;
- add scripts, tests, CI, or generated files;
- create an OpenSpec implementation change;
- modify `openspec/config.yaml`;
- edit PR #101 or its branch;
- accept ADR-0020;
- resolve U4;
- satisfy GATE-U4;
- implement L8 or L9;
- create or update GitHub issues;
- edit an accepted ADR; or
- deploy anything.

---

## Links

- [ADR-0001](ADR-0001-adopt-security-first-architecture.md) — repository-wide
  authority, safety, and acceptance boundaries
- [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) —
  future implementation stack and repository tooling conventions
- [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) — one canonical home and subordinate projections
- [ADR-0019](ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md) — immutable records, one authority, and two-revision succession precedent
- [ADR-0020](ADR-0020-place-runner-control-by-workload-class.md) — current proposed ADR whose future acceptance is the migration example
- [`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md) — U1–U11 identity and open-state record
- [`knowledge/catalog.json`](../../knowledge/catalog.json) and [`check-knowledge.mjs`](../../scripts/check-knowledge.mjs) — current registry/checker precedent
- [`knowledge/set-releases.json`](../../knowledge/set-releases.json) and [`check-release-history.mjs`](../../scripts/check-release-history.mjs) — current immutable-release/history precedent
- [`deploy/images/image-lock.yaml`](../../deploy/images/image-lock.yaml) and [`check-images.mjs`](../../scripts/check-images.mjs) — current strict machine-readable lock precedent
- [`openspec/config.yaml`](../../openspec/config.yaml) — stale mutable governance claim recorded for migration, not edited here
- [PR #101](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/101) — concrete multi-surface acceptance diff, left untouched
