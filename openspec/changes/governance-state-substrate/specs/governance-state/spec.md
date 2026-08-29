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

#### Scenario: A malformed registry never becomes an empty one

- **GIVEN** a truncated or syntactically invalid `governance/state.json`
- **WHEN** any consumer — checker, renderer, or query — reads it
- **THEN** every one of them fails closed, and none reports a derived
  governance answer

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

### Requirement: Genesis seeds the exact pre-transition state and changes nothing

The initial registry SHALL be seeded from the `main` snapshot after ADR-0021's
acceptance reconciliation and **before** PR #101's acceptance transition, and
SHALL record exactly:

- ADR-0001 through ADR-0019 `Accepted`;
- **ADR-0020 `Proposed`**;
- ADR-0021 `Accepted`;
- **U4 derived open**;
- **GATE-U4 derived unsatisfied**;
- L8 outstanding;
- L9 prerequisites `L8 + GATE-U4`;
- GitHub issue #57 as L9's external authority anchor;
- L9 prerequisite readiness `NotReady`.

The accepted set SHALL be recorded as the non-contiguous set it is; it SHALL NOT
be expressed as a continuous accepted range.

The seed SHALL be proven to change **no operative governance state**: every
derived answer before and after seeding SHALL be identical. Seeding SHALL NOT
accept, resolve, satisfy, authorize, or make ready anything.

The genesis fixture SHALL include the real L6 spike evidence representable as
`reviewed-spike-evidence-v1`, and hostile genesis mutations SHALL be refused.

#### Scenario: Seeding is state-preserving

- **GIVEN** the pre-registry repository and the seeded registry
- **WHEN** every derived governance answer is computed on both
- **THEN** they are identical, and no lifecycle, resolution, gate, or readiness
  value differs

#### Scenario: The genesis state is exactly the pre-transition state

- **GIVEN** the seeded registry
- **WHEN** the model derives decision lifecycles, question states, gates, and
  readiness
- **THEN** ADR-0020 is `Proposed`, U4 is open, GATE-U4 is unsatisfied, L8 is
  outstanding, L9 requires `L8 + GATE-U4`, L9's anchor is issue #57, and L9's
  readiness is `NotReady`

#### Scenario: The real L6 spike is representable

- **GIVEN** the L6 landing with authority issue #54, merged PR #73 and commit
  `e0e8b786201d3e92bbe05f286ae55b9e002c4109`, evidence root
  `docs/spikes/l6-copilot-cli/`, manifest digest
  `db7fdc1746dad6a481be295f32125353a07f3edb6e1b13add689648f23fec984`, findings
  digest
  `f9bb9082da596b264f569c47ebd33eee117cc10663f2ee5c0c7522371abde592`, and the
  explicit no-OpenSpec fact
- **WHEN** it is validated under `reviewed-spike-evidence-v1`
- **THEN** it passes, and no retrospective archive is manufactured

#### Scenario: A hostile genesis mutation is refused

- **GIVEN** a seed mutated to record an accepted lifecycle, a resolved question,
  a satisfied gate, or a prerequisite set that its sources do not support
- **WHEN** the genesis attestation and checkers run
- **THEN** they fail, naming the field and the source disagreement

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
