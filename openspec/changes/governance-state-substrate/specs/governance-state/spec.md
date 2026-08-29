# governance-state Specification Delta

## ADDED Requirements

### Requirement: The registry is the sole authored authority in a closed canonical representation

The repository SHALL carry one authored governance-state authority at the root
path `governance/state.json`. Its schema SHALL be closed: the top-level
collections and every record field are enumerated, and any field not enumerated
is rejected rather than ignored.

The representation SHALL be canonical, not merely whatever a host JSON parser
accepts. Duplicate object keys SHALL be rejected **before** object construction,
so that a later key cannot silently overwrite an earlier one. Serialization
SHALL be deterministic: the same logical state SHALL produce the same bytes.

A malformed, noncanonical, or unreadable registry SHALL fail closed. It SHALL
NOT be interpreted as an empty registry, as an unsatisfied-but-healthy state, or
as any other derived answer.

#### Scenario: A well-formed canonical registry validates

- **GIVEN** `governance/state.json` whose fields are all enumerated by the
  closed schema and whose serialization is canonical
- **WHEN** the current-revision checker runs
- **THEN** it passes and reports the registry's schema version

#### Scenario: A duplicate key is rejected before it can overwrite

- **GIVEN** a registry whose JSON text contains the same key twice within one
  object, where a permissive parser would keep the last occurrence
- **WHEN** the checker parses it
- **THEN** it fails naming the duplicated key, and the second occurrence never
  reaches the model

#### Scenario: An unknown field is rejected, not ignored

- **GIVEN** a registry carrying a field the closed schema does not enumerate,
  including any field asserting an authorization grant
- **WHEN** the checker runs
- **THEN** it fails naming the unknown field and its path

#### Scenario: Noncanonical serialization is refused

- **GIVEN** a registry that is valid JSON but not the canonical serialization of
  its own logical content
- **WHEN** the checker runs
- **THEN** it fails, and reports the canonical form it expected

#### Scenario: Logically equal collections serialize identically

- **GIVEN** two registries differing only in the order of members within a
  set-valued relationship, such as `["L8","GATE-U4"]` against
  `["GATE-U4","L8"]`
- **WHEN** each is canonicalized
- **THEN** they produce identical bytes, and identical `primitiveDigest`,
  `relationshipDigest`, and transition identities

#### Scenario: A duplicate collection member is rejected

- **GIVEN** an entity collection containing two records with the same stable
  identifier, or a set-valued relationship naming the same member twice
- **WHEN** the checker runs
- **THEN** it fails naming the duplicate, which is never silently deduplicated

#### Scenario: A malformed registry never becomes an empty one

- **GIVEN** a truncated or syntactically invalid `governance/state.json`
- **WHEN** any consumer — checker, renderer, or query — reads it
- **THEN** every one of them fails closed, and none reports a derived
  governance answer

---

### Requirement: Every collection is classified, ordered, and duplicate-free

Each collection in the registry SHALL carry a schema-declared class, and its
canonical form SHALL follow from that class.

**Entity collections** — decisions, questions, gates, landings, external
references — SHALL be canonically ordered by stable identifier, and duplicate
identifiers SHALL be rejected.

**Set-valued relationships** — `resolves`, `supersedes`, `requires`, `sources` —
SHALL be canonically sorted, SHALL reject duplicate members, and SHALL carry no
order meaning: two orderings of the same members are the same value and SHALL
produce identical bytes and identical digests.

**Sequence-valued fields** SHALL exist only where order is explicitly semantic,
SHALL preserve authored order, and SHALL be included in the identity-bearing
preimage precisely because their order carries meaning.

An unclassified collection SHALL be a schema error.

#### Scenario: Reordering a set-valued relationship changes nothing

- **GIVEN** a registry whose `requires` members are reordered
- **WHEN** the canonical bytes and every digest are recomputed
- **THEN** all are unchanged, and history validation reports no change

#### Scenario: Reordering a semantic sequence is a change

- **GIVEN** a registry whose reviewed ordering intent is reordered
- **WHEN** the identity-bearing preimage is recomputed
- **THEN** the corresponding identity changes, and history validation treats it
  as an in-place mutation of a rule input

#### Scenario: An unclassified collection is refused

- **GIVEN** a collection the schema does not classify as entity, set-valued, or
  sequence-valued
- **WHEN** the checker runs
- **THEN** it fails rather than choosing a canonical rule by inference

---

### Requirement: The decision lifecycle is a closed vocabulary with a closed transition matrix

Each decision record SHALL carry a lifecycle from the closed vocabulary
`Proposed`, `Accepted`, `Superseded`, `Rejected`.

The legal transitions SHALL be exactly:

| From | To | Required evidence |
| --- | --- | --- |
| `Proposed` | `Accepted` | human acceptance attestation, final accepted-byte SHA-256, atomic registry/header transition |
| `Proposed` | `Rejected` | human rejection attestation bound to the final rejected bytes by SHA-256 |
| `Accepted` | `Superseded` | a **new** accepted decision recording a valid `supersedes` relationship |

Every other transition SHALL be refused, including `Accepted -> Proposed`,
`Accepted -> Rejected`, `Rejected -> Proposed`, `Rejected -> Accepted`, and
`Proposed -> Superseded`. `Rejected` and `Superseded` are terminal.

Once accepted or rejected, the decision document's bytes SHALL be immutable and
pinned by content SHA-256. `resolves` and `supersedes` SHALL be authored
relationships in the registry, mirrored by the decision's structurally parseable
relationship header.

#### Scenario: A legal acceptance transition validates

- **GIVEN** a decision moving `Proposed -> Accepted` with its human acceptance
  attestation, accepted-byte SHA-256, and header transition arriving together
- **WHEN** the checkers run
- **THEN** they pass, and the accepted bytes become immutable

#### Scenario: An accepted decision cannot return to proposed

- **GIVEN** a registry that moves an accepted decision back to `Proposed`
- **WHEN** history validation runs
- **THEN** it fails naming the illegal transition, whatever else agrees

#### Scenario: Accepted bytes cannot change

- **GIVEN** an accepted decision whose document bytes are edited so that the
  file no longer matches its recorded content SHA-256
- **WHEN** the current-revision checker runs
- **THEN** it fails naming the decision and both digests

#### Scenario: Supersession does not rewrite the superseded document

- **GIVEN** a new accepted decision recording `supersedes` against an older
  accepted one
- **WHEN** the checkers run
- **THEN** they pass only while the older document's bytes and its historical
  `Status: Accepted` header are unchanged; rewriting that header to
  `Superseded` fails

#### Scenario: A superseded lifecycle without a superseding decision is refused

- **GIVEN** a registry recording a decision as `Superseded` with no current
  accepted decision supplying a valid `supersedes` relationship to it
- **WHEN** the checker runs
- **THEN** it fails — supersession is a relationship, not an editable status

---

### Requirement: Question resolution and gate satisfaction are derived, never authored

Each question record SHALL carry a stable identifier and canonical document
anchor. It SHALL NOT carry an authored lifecycle or `resolved` boolean.
Resolution SHALL be derived solely from a current **accepted** decision's
`resolves` relationship.

Each gate record SHALL carry a predicate drawn from a closed, named vocabulary
evaluated by the model, together with its source references. It SHALL NOT carry
an authored `satisfied` boolean, and its predicate SHALL NOT be arbitrary code
or an editable expression.

A question with more than one current resolver SHALL be invalid. A predicate
that cannot be evaluated unambiguously SHALL leave its gate **unsatisfied** and
the checker SHALL fail closed.

#### Scenario: Resolution follows the accepted resolver

- **GIVEN** exactly one current accepted decision whose `resolves` names a
  question
- **WHEN** the model derives that question's state
- **THEN** it reports resolved, and names the resolver and its acceptance date

#### Scenario: A proposed resolver resolves nothing

- **GIVEN** a decision whose `resolves` names a question while its lifecycle is
  `Proposed`
- **WHEN** the model derives that question's state
- **THEN** it reports the question open, and the gate depending on it
  unsatisfied

#### Scenario: An authored resolution boolean is refused

- **GIVEN** a question record carrying `resolved: true` alongside a decision's
  `resolves` relationship
- **WHEN** the checker runs
- **THEN** it fails as an unknown field — the conclusion may not be stored
  beside the fact it is derived from

#### Scenario: Two current resolvers invalidate the question

- **GIVEN** two current accepted decisions whose `resolves` both name the same
  question
- **WHEN** the checker runs
- **THEN** it fails naming the question and both resolvers

#### Scenario: An unevaluable predicate is unsatisfied, never assumed

- **GIVEN** a gate whose predicate references a missing entity or cannot be
  evaluated unambiguously
- **WHEN** the model evaluates it
- **THEN** the gate is unsatisfied, the checker fails closed, and no alternate
  derivation is produced

---

### Requirement: Landings carry immutable rule inputs and a closed delivery lifecycle

Each landing or program node SHALL carry a stable identifier, a kind, a typed
external authority anchor, a prerequisite identifier set, and — when it has a
delivery lifecycle — that lifecycle and a completion-policy identity.

Delivery lifecycle SHALL be the closed vocabulary `Planned`, `InProgress`,
`Complete`, `Withdrawn`, with legal transitions `Planned -> InProgress`,
`Planned -> Complete`, `Planned -> Withdrawn`, `InProgress -> Complete`,
`InProgress -> Withdrawn`. `Complete` and `Withdrawn` are terminal.

The following SHALL be identity-bearing rule inputs, not ordinary mutable
fields: the gate predicate definition and its source references; a node's kind;
a landing's prerequisite identifier set; its typed external authority anchor;
its completion-policy identity; and reviewed ordering intent where it changes
readiness. Version one SHALL permit **no in-place mutation** of these on an
existing identity. A changed rule SHALL be introduced as a new stable identity
with an explicit typed supersession relationship; the old identity remains
immutable.

Prerequisite readiness SHALL be derived: a landing prerequisite is satisfied
only when its delivery lifecycle is `Complete` **and** every required completion
identity and attestation validates. `Planned` and `InProgress` never satisfy a
prerequisite. A landing SHALL NOT carry an authored `blockedOn`.

#### Scenario: Readiness is derived from validated completion

- **GIVEN** a landing whose prerequisites are a gate and another landing
- **WHEN** the model evaluates readiness
- **THEN** it reports `Ready` only when the gate's predicate is satisfied and
  the prerequisite landing is `Complete` with validating completion evidence,
  and otherwise reports `NotReady` with the unsatisfied identifiers

#### Scenario: A prerequisite set cannot be edited in place

- **GIVEN** a revision removing `L8` from `L9`'s prerequisite set
- **WHEN** history validation runs
- **THEN** it fails, even though the resulting derived answer is internally
  consistent

#### Scenario: An authority anchor cannot be repointed in place

- **GIVEN** a revision repointing `L9`'s external authority anchor away from
  GitHub issue #57
- **WHEN** history validation runs
- **THEN** it fails naming the identity-bearing rule input

#### Scenario: A gate predicate cannot be mutated in place

- **GIVEN** a revision changing the `GATE-U4` predicate definition
- **WHEN** history validation runs
- **THEN** it fails, independently of whether the gate's derived result changed

#### Scenario: A rule change arrives as a new identity

- **GIVEN** a new landing identity carrying the changed rule and an explicit
  typed supersession relationship to the old identity, with its human-attested
  transition
- **WHEN** the checkers run
- **THEN** they pass, and the old identity remains present and unmodified

#### Scenario: A cycle in prerequisites is refused

- **GIVEN** prerequisite relationships forming a cycle
- **WHEN** the checker runs
- **THEN** it fails naming the cycle, and no readiness answer is produced

---

### Requirement: Completion is an identity-bound transition under a closed policy vocabulary

Completion-policy identity SHALL be the closed vocabulary
`reviewed-delivery-v1` and `reviewed-spike-evidence-v1`. There SHALL be no
generic legacy or bootstrap escape-hatch policy.

`reviewed-delivery-v1` SHALL require the child archived OpenSpec identity,
delivered scope, exact commit or artifact identity, authority anchor, and human
completion attestation. `reviewed-spike-evidence-v1` SHALL require the authority
issue, merged evidence PR and commit, canonical evidence root, evidence-manifest
digest, findings identity, and human completion attestation; it SHALL explicitly
require **no** OpenSpec archive.

Every completion preimage SHALL bind the landing identifier, prior and target
lifecycles, authority-anchor identity, exact delivered commit or artifact
identity, completion-policy identity, and that policy's specific requirements.
The delivered identity SHALL be bound to the landing's declared scope; an
unscoped commit hash SHALL be insufficient.

A required identity that is opaque or unavailable SHALL NOT be a valid
completion proof: the checker SHALL fail closed, leave the landing unsatisfied,
and report `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION`.

#### Scenario: A governed delivery completes under reviewed-delivery-v1

- **GIVEN** a landing with its archived OpenSpec identity and content digest,
  scoped delivered commit, authority anchor, and human completion attestation
- **WHEN** the checker validates the completion
- **THEN** it passes and the landing's `Complete` lifecycle satisfies dependent
  prerequisites

#### Scenario: An arbitrary commit is not completion evidence

- **GIVEN** a landing record naming an existing repository commit with no
  scoped delivered identity, policy-specific evidence, or attestation
- **WHEN** the checker validates the completion
- **THEN** it fails, the landing does not satisfy any prerequisite, and the
  checker reports `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION`

#### Scenario: An arbitrary issue plus merged PR is not spike evidence

- **GIVEN** a `reviewed-spike-evidence-v1` completion naming a syntactically
  valid issue and a merged PR, without the bound evidence root, manifest digest,
  findings identity, and attestation
- **WHEN** the checker validates it
- **THEN** it fails naming the missing bound evidence

#### Scenario: A retrospective OpenSpec archive cannot substitute for the no-OpenSpec fact

- **GIVEN** a spike completion supplying a newly created OpenSpec archive in
  place of the explicit "not applicable" fact its policy requires
- **WHEN** the checker validates it
- **THEN** it fails — the policy's no-archive requirement is not satisfiable by
  manufacturing one

#### Scenario: An unknown completion policy is refused

- **GIVEN** a landing whose completion-policy identity is outside the closed
  vocabulary, including any generic legacy policy
- **WHEN** the checker runs
- **THEN** it fails naming the unknown policy identity

#### Scenario: Terminal delivery evidence cannot later change

- **GIVEN** a landing already `Complete`, whose delivery evidence is mutated or
  removed in a later revision
- **WHEN** history validation runs
- **THEN** it fails

---

### Requirement: Acceptance and genesis attestations are non-self-referential and digest-bound

Every transition preimage SHALL contain the schema version, prior-state digest
(or `null` for genesis), target primitive digest, subject, lifecycle transition,
exact content digest, and relationship digest. The `transitionDigest` SHALL be
the SHA-256 of the canonical serialization of that preimage.

The human attestation SHALL record the `transitionDigest`, exact content digest,
outcome, actor, RFC 3339 time, and authority reference. The attestation SHALL be
**excluded from its own preimage**, so that no record is its own proof.

The genesis attestation SHALL additionally bind the canonical seed digest, a
separate canonical relationship-equivalence digest, and the source-snapshot
identity, with `prior-state-digest: null`. It SHALL bind every identity-bearing
rule input.

The implementation SHALL distinguish `local-git-commit` (verifiable only when
the object exists in the checked-out repository), `external-git-commit` (an
opaque provenance reference that is not offline proof of availability), and
`content-sha256` (exact byte identity). The human attestation is the acceptance
authority; a commit reference is supporting provenance, not the causal binding.

#### Scenario: A transition digest is stable under later commits

- **GIVEN** an attested transition whose containing commit is recorded after the
  fact
- **WHEN** that commit reference changes
- **THEN** the already-bound transition digest is unchanged, and validation
  still passes

#### Scenario: An attestation inside its own preimage is refused

- **GIVEN** a transition whose preimage includes the attestation envelope
- **WHEN** the checker recomputes the digest
- **THEN** it fails — a self-referential proof is not a proof

#### Scenario: A local commit identity that is absent fails closed

- **GIVEN** an identity typed `local-git-commit` whose object does not exist in
  the checked-out repository
- **WHEN** the checker verifies it
- **THEN** it fails closed and reports the required external verification rather
  than accepting the reference on its shape

#### Scenario: An external commit identity is not treated as offline proof

- **GIVEN** an identity typed `external-git-commit`
- **WHEN** the checker verifies it
- **THEN** it validates shape only, and never reports the object as locally
  proven

#### Scenario: Genesis binds relationships field by field

- **GIVEN** a byte-correct seed whose every derived count and summary agrees
  with the sources, but which asserts one relationship the source document does
  not declare
- **WHEN** the genesis attestation is validated
- **THEN** it fails on relationship equivalence, without relying on any prior
  registry revision

#### Scenario: An omitted or ambiguous source is an explicit bootstrap failure

- **GIVEN** a seed reconciliation where a required source is missing,
  unparseable, or carries a conflicting relationship label
- **WHEN** the bootstrap proof runs
- **THEN** it fails explicitly and requires human review, and is never silently
  treated as an empty or equivalent source

---

### Requirement: Current-revision validation is offline, dependency-light, and fails closed

The current-revision checker SHALL run offline with no network dependency, and
SHALL fail closed on: a missing registry or required registered projection;
malformed or noncanonical content; duplicate keys; unknown fields; duplicate
entity identifiers; invalid repository paths or document anchors; invalid dates
or actor/evidence shapes; references to missing entities; prerequisite cycles;
an accepted decision whose content digest does not match its file; a
relationship disagreeing with its checked mirror or bootstrap attestation; a
decision header disagreeing with the allowed mirror rule; multiple current
resolvers for one question; a landing lifecycle or completion record violating
its closed transition and evidence rules; an unknown completion-policy identity
or evidence failing its selected policy; generated projection drift; and a
projection target or marker not registered by the renderer.

The allowed header-mirror rule SHALL be: a `Proposed` decision's `Status:` line
mirrors the registry lifecycle; an `Accepted` decision retains its accepted
header and accepted-byte digest; a `Rejected` decision retains its rejected
header and digest; and a currently `Superseded` record legally retains its
historical `Accepted` header.

External references SHALL be validated for shape and evidence identity locally.
A question needing live external authorization SHALL return
`AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` rather than being guessed from a
URL or issue number.

#### Scenario: A proposed decision must mirror its registry lifecycle

- **GIVEN** a decision recorded `Proposed` whose document header says `Accepted`
- **WHEN** the checker runs
- **THEN** it fails naming the mirror disagreement

#### Scenario: A status transition cannot be smuggled through an index edit

- **GIVEN** a generated index region edited to show a different lifecycle than
  the registry records
- **WHEN** the checker runs
- **THEN** it fails as projection drift, and the lifecycle is unchanged

#### Scenario: A dangling reference is refused

- **GIVEN** a relationship or prerequisite naming an entity identifier that does
  not exist
- **WHEN** the checker runs
- **THEN** it fails naming the dangling reference

#### Scenario: The checker performs no network access

- **GIVEN** a registry containing typed external references
- **WHEN** the checker runs with no network available
- **THEN** it completes, validating those references by shape and local evidence
  identity only

---

### Requirement: History validation uses an exclusive explicit base and refuses regression

The history checker SHALL compare the current registry against a base revision
supplied explicitly by CI. That base SHALL be **exclusive**: when it is invalid,
missing, unreadable, or not a commit, the history check SHALL fail and SHALL NOT
fall back to `merge-base`, `HEAD~1`, or any other inferred revision.

It SHALL refuse at least: deletion or renumbering of an existing decision,
question, gate, or landing; `Accepted -> Proposed` or `Accepted -> Rejected`
regression; any other illegal decision transition, including a rejection lacking
its final-byte attestation; mutation of accepted evidence or accepted bytes;
mutation of an accepted decision's `resolves`; disappearance of a resolved
question's current resolver; illegal supersession; prerequisite
re-identification or dangling references; illegal landing lifecycle regression;
completion or withdrawal without required evidence; mutation or disappearance of
delivery evidence after a terminal lifecycle; in-place mutation of any
identity-bearing rule input; a replacement identity without its typed
supersession relation and human-attested transition; and the introduction,
mutation, or disappearance of any authorization-evidence record.

Semantic rules SHALL be delegated to the shared model so the Git adapter does
not become a second rule authority.

#### Scenario: An invalid explicit base fails rather than falling back

- **GIVEN** CI supplying a base that is not a readable commit
- **WHEN** history validation runs
- **THEN** it fails naming the invalid base, and no comparison against an
  inferred revision is attempted

#### Scenario: A deleted record is refused

- **GIVEN** a revision in which an existing landing identifier no longer appears
- **WHEN** history validation runs
- **THEN** it fails naming the deletion

#### Scenario: A resolver cannot quietly disappear

- **GIVEN** a revision in which a resolved question's current resolver
  relationship is removed
- **WHEN** history validation runs
- **THEN** it fails, whatever the resulting derived state

#### Scenario: The activation revision is the one genesis exception

- **GIVEN** the activation revision, whose explicit base commit carries no
  registry because none existed before it
- **WHEN** history validation runs
- **THEN** history comparison is not applicable, the genesis attestation is the
  proof, and validation passes only when that attestation validates

#### Scenario: A later revision may not claim a second genesis

- **GIVEN** any revision after activation whose explicit base carries no
  registry
- **WHEN** history validation runs
- **THEN** it fails — a missing registry in the base means the registry was
  deleted, which is a refusal and never a second genesis

#### Scenario: An authorization-evidence record is refused as an unknown field

- **GIVEN** a revision introducing any record asserting local authorization
- **WHEN** validation runs
- **THEN** it fails: version one defines no such record and refuses it

---

### Requirement: Projections are generated, registered, and byte-for-byte verified

The renderer SHALL deterministically generate `governance/STATE.md` and the
registered current-state regions of other documents, each delimited by an
explicit begin/end marker **registered by the renderer**.

`--check` mode SHALL render from the registry and fail unless the result is a
byte-for-byte no-op. An unregistered target or marker SHALL be an error, not an
ignored file. The renderer's write mode SHALL be separate from `--check` mode.

For a closed set of registered consumer files, the implementation SHALL refuse
reintroduction of hand-maintained decision ranges, resolved counts, question
status lists, and program blocker summaries outside registered generated
regions. Most other documents SHALL become stable references to the registry,
`governance/STATE.md`, or the query command rather than generated copies.

Enforcement SHALL be tiered and honest about its limits: mechanical enforcement
covers registered regions, markers, targets, and the closed set of prohibited
fields in registered consumers; a known-pattern scan is defense in depth only;
human review owns unregistered free prose. No scan SHALL claim to prove that
arbitrary prose contains no contradiction.

#### Scenario: A hand edit inside a generated region fails

- **GIVEN** a registered generated region edited by hand so it no longer matches
  what the registry renders
- **WHEN** `--check` runs
- **THEN** it fails and reports the drift

#### Scenario: An unregistered marker is an error

- **GIVEN** a document carrying generated-region markers the renderer does not
  register
- **WHEN** the checker runs
- **THEN** it fails naming the unregistered target

#### Scenario: A prohibited hand-maintained claim is refused in a registered consumer

- **GIVEN** a registered consumer file into which a hand-maintained accepted
  range or resolved count is reintroduced outside a generated region
- **WHEN** the checker runs
- **THEN** it fails naming the file and the prohibited field class

#### Scenario: A stable reference is not drift

- **GIVEN** a document that points at `governance/STATE.md` or the query command
  instead of restating a value
- **WHEN** the checker runs
- **THEN** it passes — a pointer carries no current value to drift

---

### Requirement: The canonical registry first appears in one atomic activation

The path `governance/state.json` SHALL NOT exist in the repository before the
activation change. A pre-activation candidate registry MAY exist under a test
fixture or candidate path, and SHALL NOT be placed at the canonical path.

There SHALL be no repository revision in which a canonical
`governance/state.json` exists while a hand-authored copy of any fact it owns
also exists. The activation change SHALL therefore contain, indivisibly:

- the canonical `governance/state.json` and its genesis attestation and source
  manifest;
- the generated `governance/STATE.md` and every registered generated region;
- **the deletion of every hand-authored copy those regions replace**;
- the stable pointers replacing every remaining enumerated consumer copy;
- prohibited-copy enforcement;
- current-revision validation in CI;
- **two-revision history validation in CI**;
- the human external-program-index mirror transition and its evidence.

"Inert", "advisory", or "shadow" SHALL NOT be used to describe a canonical
registry that coexists with the copies it replaces: no mechanism makes a file at
the canonical authoritative path non-authoritative.

Reverting the activation change SHALL remove the registry, the generated
regions, and the pointers together, restoring the prior hand-authored copies.
There SHALL be no rollback state in which the registry survives its migration.

#### Scenario: A canonical registry beside a surviving copy is refused

- **GIVEN** a revision in which `governance/state.json` exists at the canonical
  path while an enumerated consumer still carries a hand-authored copy of a fact
  the registry owns
- **WHEN** validation runs
- **THEN** it fails — this is the coequal-authority state the substrate exists
  to remove

#### Scenario: A candidate registry is not the authority

- **GIVEN** a pre-activation revision carrying a candidate registry under a
  fixture path
- **WHEN** validation runs
- **THEN** it passes, no consumer is generated from it, and the canonical path
  is absent

#### Scenario: Activation without history validation is refused

- **GIVEN** an activation change that makes the registry authoritative without
  enabling two-revision history validation in the same change
- **WHEN** the activation gate is evaluated
- **THEN** it fails — the first authoritative revision must also be the first
  protected one

---

### Requirement: The migration is proven against a closed consumer inventory

Migration completeness SHALL be provable against an enumerated set, not a path
glob. The implementation SHALL carry a versioned consumer inventory in which
**every** current governance-state surface is classified as exactly one of:
`generated-region`, `stable-pointer`, `historical-record`,
`retained-semantic-prose`, or `not-a-governance-consumer`.

Each row SHALL identify the current path, the fact classes it currently copies,
its target disposition, its generated-region identifier where applicable, its
migration landing, and — for `retained-semantic-prose` — the reason
current-state-looking prose is retained.

Accepted decision bodies, archived and merged OpenSpec change records, and
spike evidence SHALL be classified `historical-record` and SHALL NOT be
rewritten.

A governance-state surface absent from the inventory SHALL be a migration
failure. Prohibited-copy enforcement SHALL operate over the enumerated
`generated-region` and `stable-pointer` rows.

#### Scenario: An unclassified surface fails the migration

- **GIVEN** a file carrying a governance fact class that no inventory row
  classifies
- **WHEN** the migration gate runs
- **THEN** it fails naming the file — a forgotten consumer is another
  hand-maintained authority

#### Scenario: Historical records are excluded from rewriting

- **GIVEN** an accepted decision body or an archived OpenSpec record containing
  a historical status statement
- **WHEN** the migration and prohibited-copy gates run
- **THEN** neither rewrites it nor reports it, because it is classified
  `historical-record`

#### Scenario: Retained prose must state its reason

- **GIVEN** an inventory row classified `retained-semantic-prose` with no
  recorded reason
- **WHEN** the inventory is validated
- **THEN** it fails — retention is a reviewed decision, not a default

---

### Requirement: The external program index stops claiming authority at activation

The external program index that currently declares itself the mutable authority
for landing state SHALL become a human-facing mirror and authority-anchor index
at activation. Because no implementation agent can edit it, this SHALL be a
human-performed step whose completion is evidenced in the activation change.

The activation gate SHALL **refuse activation** while that external index still
claims coequal current-state authority.

#### Scenario: Activation is refused while the external index claims authority

- **GIVEN** an activation change whose evidence does not record the external
  index transition
- **WHEN** the activation gate is evaluated
- **THEN** it fails — otherwise a second mutable authority outlives activation

#### Scenario: The external index becomes an anchor, not evidence

- **GIVEN** the transitioned external index
- **WHEN** the model establishes delivery lifecycle
- **THEN** it uses repository evidence only, and the index's state and prose
  are never treated as delivery evidence

---

### Requirement: The query reports separate axes and never authorizes

The query interface SHALL provide a human-readable explanation form and a
machine-readable JSON form over the same model.

It SHALL expose `deliveryState`, `prerequisiteReadiness` — with state vocabulary
`Ready` or `NotReady` and the unsatisfied identifiers — and
`authorizationAssessment` as **separate axes**, never collapsed into one status.

`authorizationAssessment` for a prospective start SHALL have exactly two values:
`PREREQUISITES_NOT_READY` while any prerequisite is unsatisfied, and
`AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` once prerequisites are ready. It
SHALL NEVER return `AUTHORIZED`.

For a landing whose `deliveryState` is terminal, the query SHALL report the
completed delivery and SHALL NOT describe it as waiting for authorization before
work may start; its prospective-start assessment MAY be `null`. A historical
authorization question SHALL remain distinct from a prospective one, and neither
SHALL assert that a delivery was authorized.

#### Scenario: A blocked landing reports readiness, not permission

- **GIVEN** a landing with an unsatisfied prerequisite
- **WHEN** it is queried
- **THEN** the result reports `prerequisiteReadiness.state: "NotReady"`, names
  the unsatisfied identifiers, reports
  `authorizationAssessment: "PREREQUISITES_NOT_READY"`, and names the external
  authority anchor without inferring permission from it

#### Scenario: Readiness never becomes authorization

- **GIVEN** a landing whose every prerequisite is satisfied
- **WHEN** it is queried
- **THEN** `prerequisiteReadiness.state` is `Ready` and
  `authorizationAssessment` is
  `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION`

#### Scenario: No input produces AUTHORIZED

- **GIVEN** any registry state, including one where every prerequisite is
  satisfied and every authority anchor is present
- **WHEN** any query is issued in either output form
- **THEN** the result never contains `AUTHORIZED`

#### Scenario: A completed landing is not described as awaiting start authorization

- **GIVEN** a landing whose `deliveryState` is `Complete`
- **WHEN** it is queried
- **THEN** the result reports the completed delivery, its prospective-start
  assessment is non-applicable, and a historical-authorization question is
  answered separately and without asserting authorization

---

### Requirement: Genesis authors primitives only, and the required state is derived

The initial registry SHALL be seeded from the `main` snapshot after ADR-0021's
acceptance reconciliation and **before** PR #101's acceptance transition.

The registry SHALL author **only primitive facts**. In particular it SHALL
author:

- ADR-0001 through ADR-0019 and ADR-0021 with lifecycle `Accepted`, and
  **ADR-0020 with lifecycle `Proposed`** — a non-contiguous accepted set that
  SHALL NOT be expressed as a continuous range;
- `ADR-0020.resolves = ["U4"]`;
- the `GATE-U4` predicate
  `exactly-one-current-accepted-resolver` over `U4`;
- every program node of §"The version-one program is seeded whole" with its
  kind, prerequisite set, authority anchor, delivery lifecycle, and completion
  policy — including `L9.requires = ["L8", "GATE-U4"]` and `L9`'s authority
  anchor GitHub issue #57.

The registry SHALL NOT author, and the model SHALL instead **derive**:

- U4's state — derived **open**, because its only resolver is `Proposed`;
- GATE-U4's satisfaction — derived **unsatisfied**;
- L9's prerequisite readiness — derived `NotReady`, with unsatisfied
  `["L8", "GATE-U4"]` and its explanation.

Seeding SHALL change **no operative governance state**: every derived answer
before and after seeding SHALL be identical. Seeding SHALL NOT accept, resolve,
satisfy, authorize, or make ready anything.

#### Scenario: The derived state follows from the authored primitives

- **GIVEN** the seeded registry, which authors no resolution, satisfaction, or
  readiness value
- **WHEN** the model derives governance state
- **THEN** U4 is open, GATE-U4 is unsatisfied, and L9 is `NotReady` — each
  produced by derivation and asserted by tests and the query, never read from a
  stored field

#### Scenario: An authored derived conclusion in the seed is refused

- **GIVEN** a seed carrying `question.resolved`, `gate.satisfied`, or
  `prerequisiteReadiness`
- **WHEN** the checker runs
- **THEN** it fails as an unknown field, whatever value it holds

#### Scenario: Seeding is state-preserving

- **GIVEN** the pre-registry repository and the seeded registry
- **WHEN** every derived governance answer is computed on both
- **THEN** they are identical, and no lifecycle, resolution, gate, or readiness
  value differs

#### Scenario: A hostile genesis mutation is refused

- **GIVEN** a seed mutated to author an accepted lifecycle for ADR-0020, a
  resolver relationship its source does not declare, or a prerequisite set the
  ratified DAG does not support
- **WHEN** the genesis attestation and checkers run
- **THEN** they fail, naming the field and the source disagreement

---

### Requirement: The version-one program is seeded whole, from a closed source manifest

Genesis SHALL be accompanied by a **closed source manifest**: every authored
primitive SHALL map to a row carrying its identity, exact repository path or
typed external reference, source revision or content digest, extraction rule,
a `locally-verified` or `externally-attested` classification, and a human
disposition wherever the source is ambiguous or disagrees.

A primitive with no manifest row SHALL be a bootstrap failure. Facts that no
listed source contains — gate predicates, node kinds, prerequisite sets,
authority anchors, and completion policies — SHALL NOT be claimed as equivalent
to sources that do not carry them.

The seeded program SHALL be the **complete** version-one runner program —
`L1`, `L2`, `L3`, `L4`, `L5`, `L6`, `GATE-U6`, `L7`, `L8`, `GATE-U4`, `L9`,
`L10` — each with kind, prerequisites, authority anchor, delivery lifecycle,
completion policy, and completion-evidence source. A partial program SHALL NOT
be seeded.

Delivery lifecycle SHALL be established from **repository evidence** — merged
pull requests, commits, archived child OpenSpec changes, and spike evidence
roots. Issue prose and issue open/closed state SHALL NOT be delivery evidence;
they are anchors and mirrors only. A disagreement between them SHALL be recorded
in the manifest with a human disposition and named by the bootstrap attestation,
never silently reconciled.

#### Scenario: A primitive with no source row fails the bootstrap

- **GIVEN** an authored primitive absent from the source manifest
- **WHEN** the bootstrap proof runs
- **THEN** it fails naming the unmapped primitive

#### Scenario: A stale issue does not establish delivery

- **GIVEN** a landing whose authority issue is open and whose issue text says
  the work is next, while merged repository evidence shows it delivered
- **WHEN** the seed establishes delivery lifecycle
- **THEN** it uses the repository evidence, records the disagreement with its
  human disposition, and the bootstrap attestation names it

#### Scenario: A partial program seed is refused

- **GIVEN** a seed omitting any node of the version-one program
- **WHEN** the checker runs
- **THEN** it fails naming the missing node

#### Scenario: An externally attested rule input is classified as such

- **GIVEN** a gate predicate, node kind, or completion policy that no local
  source declares
- **WHEN** the manifest is validated
- **THEN** the row is required to be classified `externally-attested` and bound
  by the human bootstrap attestation, and is never reported as locally verified

---

### Requirement: The PR #101 acceptance is a future consumer transition that authorizes nothing

PR #101 SHALL be treated as a **future consumer** of this substrate. This
specification SHALL NOT modify it, and no requirement here depends on it having
landed.

Its later machine transition SHALL be exactly `ADR-0020 Proposed -> Accepted`.
From that single primitive change the model SHALL derive U4 resolved and
GATE-U4 satisfied. L8 SHALL remain outstanding, L9 SHALL remain not
prerequisite-ready with `L8` as its unsatisfied prerequisite, and **no
authorization** for L9 or anything else SHALL be inferred.

#### Scenario: One primitive change derives the whole consequence chain

- **GIVEN** the genesis registry and a legal `ADR-0020 Proposed -> Accepted`
  transition with its acceptance evidence
- **WHEN** the model recomputes derived state
- **THEN** U4 becomes resolved and GATE-U4 satisfied, while L8 remains
  outstanding and L9 remains `NotReady` with unsatisfied `["L8"]`

#### Scenario: Satisfying a gate authorizes nothing

- **GIVEN** the state after that transition
- **WHEN** `runner/L9` is queried
- **THEN** it reports GATE-U4 satisfied, `L8` unsatisfied, readiness
  `NotReady`, issue #57 as the external authority anchor, and
  `authorizationAssessment: "PREREQUISITES_NOT_READY"` — never `AUTHORIZED`

#### Scenario: The transition is refused without its acceptance evidence

- **GIVEN** a registry moving ADR-0020 to `Accepted` without the human
  acceptance attestation, accepted-byte digest, and atomic header transition
- **WHEN** the checkers run
- **THEN** they fail, and U4 remains open
