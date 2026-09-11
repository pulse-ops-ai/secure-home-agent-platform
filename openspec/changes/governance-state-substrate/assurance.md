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
> **Revised after review 5059134998** — post-genesis runner-node introduction
> is closed to unlinked identities; pre-change currentness and first-appearance
> proofs move fully into PR-2; activation freshness becomes a gated proof; and
> PR-3 staging/freeze scopes are verification-only rather than whole subtrees.

> **Revised after review 5059408696** — freshness extraction and proof move to
> PR-2; candidate identity and final activation-base equality are explicit;
> candidate and intent deletions gain authoring owners; withdrawal succession
> moves to PR-2; and the replacement-fork control is stated directly.
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
  transition, in one revision. The target-state model derives currency, rejects
  replacement forks and cycles, validates the complete target-state dependent
  closure, requires current references to use current prerequisites, preserves
  historical references, and validates kind/policy compatibility plus the
  complete old/new semantic-identity digest. A replacement landing starts
  `Planned` with its kind-selected policy and without inherited evidence while a
  gate has no delivery lifecycle. The history model additionally proves that
  the target was current in the base and that the post-genesis first appearance
  and replacement transition were legal.
- **INV-G46** The current model accepts `Withdrawn` only with its typed
  withdrawal protocol — digest, evidence, and attestation — and it satisfies no
  prerequisite. The history model alone proves the legal source lifecycle and
  immutability of its terminal evidence thereafter.
- **INV-G47** The post-genesis runner node identity set is closed to unlinked
  introductions: every gate or landing ID first appearing after genesis is a
  replacement of a base-current node with a valid paired relationship, digest,
  and attestation. A genuinely new conceptual node requires a later
  schema-version decision or ADR and is refused by v1.
- **INV-G48** Activation promotes the frozen candidate only after exact
  field/byte equivalence with the selected `activationBaseCommit` across
  primitive source tuples, relationship tuples, locally verifiable evidence
  identities, and the complete consumer inventory; the result and base are
  bound in the genesis attestation. At final merge, current `refs/heads/main`,
  the PR-3 current base SHA, and attested `activationBaseCommit` must also be
  equal.
- **INV-G49** A `reviewed-delivery-v1` completion carries the exact stable
  envelope and closed `archivedOpenSpec` evidence defined in the
  specification: its `changeId`, `activeRoot`, and `archiveRoot` correspond,
  its members are the complete sorted whole-change set of regular tracked files,
  and the reviewed-package observation, current archive tree, and declared
  members are equal in paths and bytes. An ordinary post-genesis package contains
  `.openspec.yaml`, `proposal.md`, `design.md`, `assurance.md`, `tasks.md`, and
  at least one `specs/**/spec.md`, plus every other tracked regular file under
  the package root. Its bundle digest covers the schema, contract, `changeId`,
  both roots, paths, and member digests; the two provenance identities are
  excluded from that preimage. Arbitrary-only packages, arbitrary documents,
  partial or substituted archives, symlinks, traversal, non-`100644` modes,
  and extra or missing members are refused.
- **INV-G50** Ordinary post-genesis archive provenance has two durable,
  locally verifiable identities. `archivedPackageIdentity` is a
  `local-git-commit` containing the complete archived package.
  `reviewedIdentity` is either a `local-git-commit` naming the reviewed active
  package, or a `content-sha256` over exactly one member — the accepted review
  artifact — whose `preimplementation-review-v2` block supplies review-time
  paths and digests that must equal the corresponding archived members.
  DURABILITY is reachability from the current `HEAD`, not object presence: a
  commit reachable only through a fetched pull-request or branch ref is not
  local proof, and no branch name takes part in the test. At a commit-backed
  reviewed identity the active root is present and the archive root absent, and
  its value differs from `archivedPackageIdentity`; at the archived identity and
  in the current snapshot the archive root is present and the active root
  absent. A content-backed reviewed identity names no snapshot and asserts no
  stage. Neither claims that the archive first
  appeared in that commit. Their scopes and bytes are checked separately from
  the bundle digest and human completion attestation; missing, opaque,
  out-of-scope, wrong-stage, or byte-mismatched provenance fails closed.
  Historical genesis may record those identities and a human disposition in
  its source manifest, but that disposition is never a generic
  ordinary-completion fallback.
- **INV-G51** The current checker proves the stable envelope, archive shape,
  path, membership, bytes, stage-root presence/absence, scoped provenance, mode
  constraint, and digest binding only. The rules-free Git-tree adapter supplies
  those observations; it does not decide their meaning. The checker does not
  decide whether a mechanically valid archive is semantically the child change
  for a landing; that association is a human completion-attestation control
  under `MAN-G03`.
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
| Archived OpenSpec identity | complete active/archive whole-change equivalence · partial · substituted · active · path-invalid · bundle-mismatched |
| Archived OpenSpec provenance | archive commit reachable-and-verified · reviewed identity commit-backed (reachable) or content-backed (complete accepting record) · absent · opaque · unreachable · out-of-scope · byte-mismatched · non-accepting record · incomplete planning manifest |
| Identity class | local-git-commit present · absent · external · content-sha256 |
| Prerequisite graph | acyclic · cyclic · dangling |
| Replacement graph / closure | absent · legal · transitive · forked · cyclic · incomplete current closure · historical-reference only |
| Replacement digest | valid complete old/new identities · mismatched · omitted · directionally ambiguous |
| Runner-node introduction | genesis identity · post-genesis replacement · unlinked post-genesis identity · new conceptual node |
| History base | valid · invalid · missing · not-a-commit |
| Candidate freeze identity | exact content-bound bundle · label/commit-only · missing member · stale after member change |
| Activation freshness | equivalent · lifecycle/relationship drift · new ADR · evidence drift · source drift · inventory drift · skipped/commit-only |
| Final activation base equality | equal · current main advanced · PR-3 base differs · attested base differs |
| Projection | in-sync · drifted · unregistered-target · hand-edited |
| Readiness | Ready · NotReady |

### Archived OpenSpec identity proof contract (PR-1)

The four planning artifacts use one stable completion envelope for both
supported policies. It is a transition record, not a duplicate of the
landing's immutable rule inputs. Its exact fields are:

```json
{
  "from": "Planned",
  "to": "Complete",
  "digest": "<completionDigest>",
  "evidence": {
    "policy": "reviewed-delivery-v1",
    "deliveredIdentity": {
      "class": "local-git-commit",
      "value": "<local Git object id>",
      "scope": ["<repository-relative delivered path>"]
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
      "archivedPackageIdentity": {
        "class": "local-git-commit",
        "value": "<local Git object id>",
        "scope": [
          "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>/<relative-member-path>"
        ]
      }
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
      "number": 106
    }
  }
}
```

The envelope has no optional fields. `from` is exactly `Planned` or `InProgress`
and `to` is exactly `Complete`; PR-2 proves that `from` equals the prior
revision's lifecycle. `digest` and `attestation.digest` equal the recomputed
`completionDigest`. The preimage obtains `authorityAnchor` and
`completionPolicy` from the landing, so neither is duplicated in the envelope.
The `evidence.policy` value is a required discriminator and checked mirror of
the landing policy, not a second policy authority. The attestation's
`authority` identifies the human attestation authority and is distinct from the
landing's authority anchor.

For `reviewed-delivery-v1`, `evidence.deliveredIdentity` is a closed union of
`local-git-commit` and `content-sha256`. The former requires an existing commit
and a nonempty canonical path set whose tree or delivered bytes match; the
latter requires exactly one canonical repository-relative path in `scope[]` and
local hashing of its exact bytes. An `external-git-commit` is opaque and cannot
satisfy completion. `archivedPackageIdentity` remains `local-git-commit` only;
`reviewedIdentity` is a closed union of `local-git-commit` and
`content-sha256`.

The complete `reviewed-spike-evidence-v1` evidence branch is:

```json
{
  "policy": "reviewed-spike-evidence-v1",
  "openSpecApplicability": "not-applicable",
  "mergedEvidencePullRequest": {
    "type": "github-pull-request",
    "repository": "pulse-ops-ai/secure-home-agent-platform",
    "number": 106
  },
  "mergedEvidenceIdentity": {
    "class": "local-git-commit",
    "value": "<local Git object id>",
    "scope": [
      "docs/spikes/<canonical-spike-id>/<relative-evidence-path>"
    ]
  },
  "evidenceRoot": "docs/spikes/<canonical-spike-id>",
  "evidenceManifestIdentity": {
    "class": "content-sha256",
    "value": "<64 lowercase hex>",
    "scope": ["docs/spikes/<canonical-spike-id>/MANIFEST.sha256"]
  },
  "findingsIdentity": {
    "class": "content-sha256",
    "value": "<64 lowercase hex>",
    "scope": [
      "docs/spikes/<canonical-spike-id>/<findings-file>"
    ]
  }
}
```

The spike branch has no optional fields. `openSpecApplicability` is mandatory
and has exactly the one v1 value `not-applicable`; omission, aliases, `null`,
booleans, or any other string fail closed. The branch contains no
`archivedOpenSpec`, `deliveredIdentity`, `deliveredScope`, or nested attestation
member. The landing's typed `authorityAnchor` is the required authority issue
and is not copied into the evidence branch. `mergedEvidencePullRequest` is
supporting external provenance, not offline proof. Its local merged commit must
cover the complete evidence-root scope; the manifest and findings identities
must be locally verified. The envelope attestation remains required. An
arbitrary issue and PR pair cannot satisfy this branch. A retrospective archive
cannot replace this explicit no-OpenSpec applicability fact. Because the
completion preimage includes the complete evidence branch,
`openSpecApplicability` participates in `completionDigest`. Unknown fields,
aliases, and fields belonging to another policy are refused.

The nested `archivedOpenSpec` object is:

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
  "archivedPackageIdentity": {
    "class": "local-git-commit",
    "value": "<local Git object id>",
    "scope": [
      "openspec/changes/archive/YYYY-MM-DD-<canonical-change-id>/<relative-member-path>"
    ]
  }
}
```

`changeId` uses the canonical grammar
`[a-z0-9]+(?:-[a-z0-9]+)*`, with no leading, trailing, or repeated hyphen.
`activeRoot` is exactly `openspec/changes/<changeId>`. `archiveRoot` is exactly
`openspec/changes/archive/YYYY-MM-DD-<changeId>`, with a valid calendar date
and exact final-component suffix correspondence. The active root is the
package location in the reviewed active-change commit. The archive root is the
package location in the selected archived-package snapshot commit and in the
current snapshot; the contract makes no claim that that commit introduced the
archive. An active non-archived change, ADR, README, arbitrary file, individual
archive subfile, unrelated archive root, or mismatched declared ID is refused.

`members` is the complete recursively enumerated set of regular, tracked,
non-symlink files in the reviewed active package and archived package. For
ordinary post-genesis `reviewed-delivery-v1`, the package must contain
`.openspec.yaml`, `proposal.md`, `design.md`, `assurance.md`, `tasks.md`, and at
least one `specs/**/spec.md` file. Those required artifacts, together with
every other tracked regular file under the package root, are the complete
membership set; a correctly named package containing only arbitrary files or
only a README is refused. Each required and additional member must be present
in the reviewed-package observation, the archived-package snapshot, the current
archive, and `members[]`, with identical bytes and Git mode `100644`. Each
`path` is relative to `activeRoot`, and the corresponding archive path is the
same relative suffix under `archiveRoot`. Members are sorted lexicographically
by canonical relative path and duplicate-free. The complete sets in each observed tree — the
reviewed active tree where the reviewed identity is commit-backed, the archive
tree at `archivedPackageIdentity`, and the current archive root — must each
equal the declared members by path and exact bytes. Historical genesis may use only its explicit human disposition for an
older package shape; that disposition is not a generic post-genesis fallback.
Missing, extra, unmanifested, non-regular, symlinked, absolute, traversal, or
empty-segment members fail. Every member in each observed tree must have Git
mode `100644`; symlink, gitlink, executable, and all other modes fail. Mode is
a fixed validity constraint rather than an unbound digest field.

The required membership proof has three terms, the first of which depends on
the reviewed identity's form: the reviewed-package observation — the reviewed
active-package tree at a commit-backed `reviewedIdentity`, or the review-witness
comparison for a content-backed one — the current archive-root tree, and the
declared member set and bytes, which must be equal after active-to-archive path
normalization. `archivedPackageIdentity` is an additional snapshot observation
whose complete scoped archive tree must match the current archive tree. Stage
observations must also show archive-only at `archivedPackageIdentity` and
archive-only in the current snapshot, and — for a commit-backed reviewed
identity only — active-only at `reviewedIdentity` with a differing commit
value. The Git-tree observation adapter supplies
paths, modes, bytes, and root presence/absence; it applies no semantic rules.
The three required membership observations are therefore the reviewed active
tree, the current archive tree, and the declared member set; the selected
archived-package snapshot and stage observations are additional machine-checkable
constraints.

The bundle preimage is exactly:

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

`bundleSha256` excludes itself, `reviewedIdentity`, and
`archivedPackageIdentity`; all
other fields are included in canonical serialization. Changing `changeId`,
`activeRoot`, `archiveRoot`, any member path, or any member digest changes the
bundle identity, even where the underlying file bytes are identical. PR-1 task
2.3 owns target-state parsing, whole-change membership, path and byte
verification, policy substitution refusals, and the golden vector. PR-1 task 3
owns positive, hostile, property, and mutation execution through the real
current checker. PR-2 tasks 6.1, 6.3, 6.5, and 7.2 own the historical
source-manifest disposition, `genesisHistoricalCompletionDigest` use, and
refusal to use that genesis path for ordinary post-genesis completion. No
generic archive or legacy fallback is permitted.

`reviewedIdentity` and `archivedPackageIdentity` are separate supporting
provenance. For ordinary post-genesis completion `archivedPackageIdentity` has
class `local-git-commit` and `reviewedIdentity` is a closed union of
`local-git-commit` and `content-sha256`. Every commit-classed nested identity
must exist AND be reachable from the current `HEAD`, and where both are
commit-classed their values must differ. The archived-package identity's
archive-only complete package tree must match the declared members and bytes as
specified above; the reviewed identity's obligation depends on its form — an
active-only complete package tree for the commit form, a complete accepting
`preimplementation-review-v2` record whose manifest equals the planning
projection for the content form. An opaque, missing, incomplete, out-of-scope,
wrong-stage, unreachable, or byte-mismatched identity fails closed. These
checks prove repository bytes and scope, not human reviewer identity, and the
archived-package identity does not claim first appearance in its commit. The
completion attestation supplies the causal landing association, including the
human semantic judgment that the archive is the child change for that landing.

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
- *replacement × current/history identity* — the current model proves only the
  target-state replacement graph, currentness, closure, and historical-reference
  shape; the history model proves base currentness and post-genesis first
  appearance. Proof: `ADV-G66`, `ADV-G16`, `EX-G26`.
- *replacement × delivery lifecycle* — a replacement landing starts `Planned`
  with its kind-selected completion policy and cannot inherit completion or
  withdrawal evidence; a replacement gate has no delivery lifecycle. Proof:
  `ADV-G66`, `EX-G26`.
- *landing lifecycle × completion policy* — a landing selects its policy before
  `Planned -> Complete`; the two-revision completion changes lifecycle and
  evidence without changing policy identity, while assigning or changing the
  policy during completion is refused. Proof: `EX-G27`, `ADV-G15`.
- *candidate × activation base* — an unchanged candidate cannot mask source,
  evidence, relationship, or consumer-inventory drift at the later activation
  base; exact extraction equivalence and a content-bound candidate identity are
  required before promotion. Proof: `EX-G28`, `ADV-G69`–`ADV-G74`, `ADV-G76`,
  `MUT-G14`.
- *activation base × final merge* — a base that advances after attestation must
  refuse the merge and restart the ceremony. Proof: `ADV-G77`.

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
| yes | yes | yes | **no**, **and** `activationBaseCommit`, source snapshot, equivalent freshness result and `activationIdentity` all match the genesis evidence binding | **genesis exception** — no prior revision exists; the genesis attestation and completion envelope are the proof |
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
- **Policy × archived-package identity.** A reviewed-delivery completion must use the
  complete closed whole-change archive object, with distinct reviewed-active
  and archive identities; a valid digest for one file, another policy, or an
  archive semantically selected for another landing is not completion evidence.
  The first cases are machine refusals; semantic selection is `MAN-G03`. A
  spike completion must likewise carry the explicit
  `openSpecApplicability: not-applicable` fact in its closed evidence branch.
  Proof: `EX-G29`, `ADV-G27`, `ADV-G78`–`ADV-G85`, `PROP-G11`, `MUT-G15`.
- **Archive provenance × landing association.** Local byte verification of an
  archive does not establish that it belongs to a landing. The completion
  preimage and human attestation bind the landing, scope, anchor, policy, and
  complete archive object; `MAN-G03` is the human semantic-association control;
  genesis disposition is a separate historical path. Proof: `ADV-G81`,
  `ADV-G82`, `ADV-G83`, `MAN-G03`.

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
| INV-G16 | `ADV-G13`, `ADV-G14`, `ADV-G15`; `EX-G27` | hostile + example |
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
| INV-G45 | current model: `ADV-G66` target-state malformed/incomplete replacement; history: `ADV-G16`, `MUT-G08`; `PROP-G10` | current + history + property |
| INV-G46 | target state: `ADV-G67` withdrawal without digest/evidence/attestation or malformed envelope; `ADV-G68` withdrawn node satisfying a prerequisite; history: `ADV-G29`, `ADV-G75`, `EX-G25`; `PROP-G10` | current + history + example + property |
| INV-G43 | `ADV-G57` prior lifecycle in a genesis completion; `ADV-G63` ordinary digest used at genesis | hostile |
| INV-G47 | `ADV-G16` post-genesis first-appearance cases; `EX-G26` legal replacement | history + example |
| INV-G48 | freshness: `ADV-G69`–`ADV-G74`, `ADV-G76`; final merge: `ADV-G77`; `EX-G28`; `MUT-G14` | hostile + example + mutation |
| INV-G49 | `EX-G29`; `ADV-G78`–`ADV-G80`, `ADV-G84`, `ADV-G85`; `PROP-G11`; `MUT-G15` | example + hostile + property + mutation |
| INV-G50 | `ADV-G81`–`ADV-G83`, `ADV-G85`; `EX-G29` | hostile + example |
| INV-G51 | `MAN-G03`; machine-boundary argument in D4.4 | manual review + construction |

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
- **PROP-G11** The archived OpenSpec bundle digest changes independently when
  `changeId`, `activeRoot`, `archiveRoot`, any member path, or any member
  `contentSha256` changes, and remains independent of `reviewedIdentity`,
  `archivedPackageIdentity`, and the human attestation because those are excluded from
  the bundle preimage.

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
- **ADV-G27** Arbitrary issue plus merged PR offered as spike completion, or a
  spike evidence branch that omits, aliases, nulls, booleans, or changes the
  required `openSpecApplicability: not-applicable` fact.
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
- **ADV-G66** A current-revision replacement whose **target state** is malformed
  or incomplete: absent paired `replaces`/`replacement` fields or attestation,
  two distinct nodes directly naming the same target in `replaces`, a replacement
  fork or cycle, a changed `kind`,
  an incomplete target-state transitive dependent closure, a current dependent
  still naming a replaced identity, an omitted or directionally ambiguous
  old/new semantic-identity input — including a gate's `sources` set — in
  `replacementDigest`, a replacement landing inheriting terminal lifecycle or
  evidence, a replacement landing missing or changing its kind-selected policy,
  or a replacement gate carrying delivery state. It does **not** claim to prove
  base-revision currentness or first appearance.
- **ADV-G78** A `reviewed-delivery-v1` completion object that is not the exact
  closed policy-specific parent shape, uses an alias or another policy's field,
  offers an ADR, README, arbitrary file, archive subfile, active change, or
  mismatched `changeId`/root in its nested archive object, or uses a correctly
  named package that lacks the minimum OpenSpec structure (`.openspec.yaml`,
  `proposal.md`, `design.md`, `assurance.md`, `tasks.md`, and at least one
  `specs/**/spec.md`).
- **ADV-G79** An archive member set that is partial, duplicated, missing,
  extra, unsorted, unmanifested, non-regular, symlinked, traversing, or whose
  member bytes or Git modes do not match the closed rule; every member must be
  a `100644` regular file, the minimum package structure must be present, and
  the complete recursively enumerated whole-change set is required. It also
  refuses active/archive stage coexistence or a missing required stage root.
- **ADV-G80** An `archivedOpenSpec` whose `bundleSha256` is absent or wrong,
  or whose canonical preimage omits or changes `changeId`, `activeRoot`,
  `archiveRoot`, a member path, or a member digest.
- **ADV-G81** Nested provenance that is not durable local proof: a missing,
  opaque, or out-of-scope identity; a commit-classed identity whose object is
  absent OR present but unreachable from the current `HEAD` — including one
  available only because a pull-request or branch ref was fetched; a
  byte-mismatched `reviewedIdentity` or `archivedPackageIdentity`; equal reuse of
  one snapshot commit for both identities; a provenance object using an
  unsupported identity class; a content-backed `reviewedIdentity` whose selected
  path is an arbitrary package member rather than the accepted review artifact,
  or whose review block is absent, unparseable, of an unsupported contract, or
  carries an empty `reviewed_artifacts[]`; a `reviewed_artifacts[]` entry with
  no matching member or a digest disagreement; and a completion-time bundle
  offered as reviewed identity with no review-time witness. Refusal never
  downgrades a recorded commit identity to the content form.
- **ADV-G82** A completion whose delivered scope or authority anchor does not
  match the landing, or whose landing/archive binding is stale because the
  complete completion preimage and human attestation were not recomputed. A
  semantically different association with a newly bound object remains the
  `MAN-G03` human control.
- **ADV-G84** An archive root or member reached through a symlinked ancestor,
  symlinked final file, lexical sibling, traversal, or path outside the real
  repository root.
- **ADV-G85** The required membership observations disagree: the
  reviewed-package observation, current archive-root tree, and declared member
  set differ in paths, bytes, or required `100644` modes, or the
  `archivedPackageIdentity` tree does not match the current archive tree. It
  also refuses active/archive coexistence at a commit-backed reviewed snapshot,
  an active root surviving at the archived snapshot or current checkout, equal
  snapshot identities, and a commit-stage presence rule asserted against a
  content-backed reviewed identity — a class error, refused as such rather than
  passed or skipped. The checker refuses before deriving completion.
- **ADV-G67** A target snapshot carries `Withdrawn` without its withdrawal
  digest, without its evidence, or without its attestation — each refused
  independently — or with a malformed or mutually exclusive completion and
  withdrawal envelope. This target-state control does not prove the source
  lifecycle or later immutability.
- **ADV-G68** A `Withdrawn` landing counted as satisfying a prerequisite.
- **ADV-G62** An edit, after attestation, to any artifact the attested preimage
  binds.
- **ADV-G63** An ordinary `completionDigest` used for a genesis historical
  completion, or a `genesisHistoricalCompletionDigest` used for a post-genesis
  transition.

### Positive examples — current-revision checker (PR-1)

- **EX-G29** A valid post-genesis `reviewed-delivery-v1` completion whose
  complete active-to-archive child-change equivalence, minimum OpenSpec package
  structure, durable reviewed and archived-package provenance, delivered
  identity, landing-owned policy and authority anchor, stable completion
  envelope and digest, and human attestation (including `MAN-G03`) all bind the
  same landing. It is proved in BOTH reviewed-identity forms over the same
  archived package: once with a commit-backed reviewed identity reachable from
  `HEAD`, and once content-backed against the accepted review artifact with the
  reviewed commits absent from current history. The whole-change archive fixture
  is owned by PR-1; no genesis disposition is used.

### Governance convergence cases (PR-1) — merge-method independence, ownership, non-vacuity

Added after the TypeScript 7 delivery (PRs #120–#123), the first end-to-end
governed delivery in this repository, which is used here as an empirical test of
the contract rather than as an authority over it. Design rationale is D4.5.

These are contract cases. PR-1 implements the current-revision checks; nothing
here moves two-revision work forward into PR-1.

**Merge-method independence.** A delivery is judged on its governed bytes and
declared scope, never on Git topology.

| Case | Expected |
| --- | --- |
| Identical reviewed content delivered by squash | ACCEPT |
| Identical reviewed content delivered by a merge commit | ACCEPT |
| Identical reviewed content delivered by rebase | ACCEPT |
| Scoped delivered bytes differ from the bound delivered identity, any method | REFUSE |
| Feature branch deleted, reviewed commits not ancestors, reviewed package bound by `content-sha256`, archive locally observable | ACCEPT |
| Required reviewed identity resolves only through a branch or pull-request ref, no content binding | REFUSE — `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION` |
| `reviewedIdentity` names an arbitrary pre-archive snapshot that satisfies the active-only stage rule but whose member bytes are not the reviewed bytes | REFUSE on member-byte mismatch |

The last row is the one that matters most, and the one the delivery exposed: the
stage rule alone is satisfied by every pre-archive commit on the default branch,
so passing it is not evidence that the named snapshot is the reviewed one. A
fixture that only proved the topology-independent cases would leave the contract
accepting a mechanically valid, semantically wrong identity.

**Reviewed planning versus execution progress.** The archived package, including
every `tasks.md` checkbox, is immutable and inside `bundleSha256`;
`delivery.lifecycle` plus completion evidence is the mutable authority.

| Case | Expected |
| --- | --- |
| Reviewed planning bytes unchanged while the lifecycle advances `Planned -> InProgress -> Complete` with valid evidence | ACCEPT |
| A `tasks.md` checkbox — or any member byte — edited inside a package already bound by `bundleSha256` | REFUSE as planning drift |
| Completion derived from checkbox state, whether all unchecked, all checked, or partial | REFUSE — checkbox state SHALL have no effect on the derivation |

The real delivery finished at 0/79 checked with implementation complete, so the
first row is the expected steady state and not a stalled landing. The third row
must be proved by driving the derivation over all three checkbox populations and
requiring the same verdict, not by asserting that the code contains no reader.

**Non-vacuity where applicability requires evidence.**

| Case | Expected |
| --- | --- |
| Required governed subject set observed and non-empty | ACCEPT |
| `members[]` empty, or the observed package resolves to no members | REFUSE — an empty membership is an unanswered question |
| A two-revision comparison whose supplied base resolves to the revision under test | REFUSE — never reported as a clean empty comparison, never an inferred fallback |
| Evidence class the selected policy explicitly declares non-applicable, e.g. `openSpecApplicability: "not-applicable"` | ACCEPT — authored typed fact, permitted by the policy |

Non-applicability is authored, never inferred from absence. The middle two rows
are the completion-evidence face of rules ADR-0021 already states in §2.3, §8
and §9; they are added here because the delivery showed that a checker can be
green having examined nothing.

**Durability and review-witness cases.** Added by the focused closure; design
rationale is D4.5 and D4.6.

| Case | Expected |
| --- | --- |
| Commit-backed reviewed identity, reachable from `HEAD`, bytes match | ACCEPT commit form |
| Reviewed commits absent from current history, durable review witness, archived planning bytes match | ACCEPT content form |
| Reviewed commit object present only because a PR or branch ref was fetched, not reachable from `HEAD`, no content variant | REFUSE — `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION`, never downgraded to the content form |
| `content-sha256` over one arbitrary package member offered as whole-package review identity | REFUSE |
| Correct completion-time `bundleSha256` with no durable review-time witness | REFUSE |
| Complete accepting v2 block + manifest EQUAL to the planning projection + matching digests | ACCEPT |
| `FOCUSED_CLOSURE_REQUIRED` block with every declared digest matching | REFUSE |
| `ARCHITECTURE_REJECTED` block with every declared digest matching | REFUSE |
| Nonzero `unresolved_p1_count`, or nonzero `unassigned_p2_p3_count` | REFUSE (each independently) |
| `authority_allocation_complete` false, or `invariant_set_changed` true | REFUSE (each independently) |
| Wrong or unsupported `contract`, `schema`, or `rubric` | REFUSE — unsupported review contract, never reinterpreted |
| `reviewed_artifacts[]` containing only one valid planning member | REFUSE |
| `reviewed_artifacts[]` missing one `specs/**/*.md` member | REFUSE |
| Manifest equals the planning projection while the archive also carries `README.md`, the review artifact and `reviews/**` | ACCEPT |
| `reviewed_artifacts[]` entry with no matching member, or a digest disagreement | REFUSE |
| Commit-stage presence rule asserted against a content-backed reviewed identity | REFUSE as a class error, not passed vacuously or skipped |
| `archivedPackageIdentity` commit not reachable from current `HEAD` | REFUSE |
| `archivedPackageIdentity` reachable from `HEAD` with exact archive bytes | ACCEPT |

The fixture SHALL exercise `EX-G29` in both reviewed-identity forms over the
same archived package, so neither form is proved only by the other's absence.

**The shared review-contract owner is proved shared, not asserted.** The
extraction of `scripts/openspec-review-contract.mjs` is a refactor of behaviour
that already exists, so the obligations are regression obligations:

| Case | Expected |
| --- | --- |
| The existing OpenSpec review-gate tests, run after the extraction | PASS UNCHANGED — a behavioural difference in the review gate is a defect in the extraction |
| The governance content-backed witness validated through the shared component | PASS — it carries no record validator of its own |
| One acceptance rule changed inside the shared component | BOTH consumers change together; if only one does, the owner is not actually shared |
| `scripts/governance/**` searched for duplicated review-contract constants or tables | none present, asserted by a test rather than assumed |

The third row is the load-bearing one. A component that is imported but whose
rules are also restated elsewhere satisfies every structural check and still
leaves two authorities, which is the defect the single-owner requirement exists
to prevent.

**What the content form does and does not prove.** Stated so no later reader
over-reads it. It mechanically proves three things: the archived review artifact
carries the exact bytes its member digest and `bundleSha256` bind; those bytes
are a valid ACCEPTING `preimplementation-review-v2` record under the existing
versioned contract; and that record's COMPLETE reviewed planning manifest equals
the archived planning bytes.

It does not cryptographically prove who authored the review, that the reviewer
was independent, or that the unsigned record existed at any particular
wall-clock instant. Those are procedural and human facts owned by the existing
review system, exactly as they are for the commit form. Nothing here should be
read as a stronger claim.

That boundary is deliberate and SHALL NOT be closed by adding signatures,
network lookups, branch-name authority, another governance field, or a
feature-ancestry requirement. A machine-verifiable reviewer identity or temporal
precedence would be a separate trust-root decision, and this change does not
make it.

**Mutation targets added.** Each must change the subject bytes before its result
is read:

- remove the `content-sha256` alternative for `reviewedIdentity` — the
  deleted-branch case must FAIL;
- accept a reviewed snapshot on stage rule alone, without comparing member
  bytes — the mechanically-valid-wrong-snapshot case must PASS, proving the byte
  comparison is what refuses it;
- let the completion derivation read checkbox state — the all-unchecked and
  all-checked populations must then disagree;
- treat an empty required member set as satisfied — the empty-membership case
  must PASS;
- allow an inferred base when the supplied one resolves to the revision under
  test — the self-selecting-window case must PASS;
- weaken commit durability from reachability to object presence — the
  fetched-but-unreachable case must PASS, proving reachability is what refuses
  it;
- accept the content form without comparing `reviewed_artifacts[]` against the
  archived members — the arbitrary-member and digest-disagreement cases must
  PASS, proving the review witness is load-bearing rather than decorative;
- replace the planning-set EQUALITY with subset acceptance — the
  one-member and missing-delta-spec cases must then PASS, proving completeness
  is load-bearing and not an incidental property of the fixture;
- drop the acceptance-field checks and keep only the contract string — the
  `FOCUSED_CLOSURE_REQUIRED` and `ARCHITECTURE_REJECTED` cases must then PASS,
  proving the verdict is what refuses them rather than the block's shape.

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
  removed/repointed/reassociated, a replacement target was not current in the
  base, a gate or landing first appears after genesis without a valid paired
  replacement transition, a post-genesis conceptual node is introduced, or
  replacement identity, relationship, digest, and attestation evidence do not
  arrive together. Target-state graph and closure rules are proven by the
  shared model through `ADV-G66`; the legal two-revision case is `EX-G26`.
- **ADV-G18** Authorization-evidence record introduced, mutated, or removed.
- **ADV-G29** Delivery or withdrawal evidence, digest, or attestation envelope
  is mutated or removed after a terminal lifecycle.
- **ADV-G75** A `Withdrawn` target whose base lifecycle is not `Planned` or
  `InProgress`, or whose legal withdrawal source lifecycle cannot be proved.
- **ADV-G34** Record deleted or renumbered.
- **ADV-G35** Resolved question's current resolver disappears.
- **ADV-G58** An older registry-less commit supplied as the explicit base,
  unmatched by the genesis evidence binding, attempting to claim the exception.
- **ADV-G59** A replacement activation after a revert, attempting a second
  genesis.
- **ADV-G83** An ordinary post-genesis completion uses a genesis
  human-disposition record, or otherwise treats the historical genesis archive
  exception as a generic fallback after activation.

### Candidate freshness mechanism (PR-2)

- **ADV-G69** Candidate ADR lifecycle or relationship changed after the PR-2
  freeze while the candidate remains unchanged.
- **ADV-G70** A new ADR appears in the activation base after candidate freeze.
- **ADV-G71** The complete consumer inventory differs between candidate and
  activation base.
- **ADV-G72** A locally verifiable delivery or evidence identity differs
  between candidate and activation base.
- **ADV-G73** A source artifact changes while the stale candidate remains
  byte-identical.
- **ADV-G74** Activation skips a required extraction or reduces freshness to a
  commit-identity comparison.
- **ADV-G76** `candidateFreezeIdentity` uses only a label or commit, omits one
  of the three required members, or remains unchanged after a member's bytes
  change.

### Final activation merge gate (PR-3)

- **ADV-G77** Final merge permits current `refs/heads/main`, the PR-3 current
  base SHA, and attested `activationBaseCommit` to differ.

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

### Positive examples and integration fixtures

- **EX-G26** A legal two-revision transitive replacement with at least two
  dependent levels (for example `runner/L8` -> `runner/L9` -> `runner/L10`): the
  target is current in the explicit base, the complete dependent closure is
  replaced, and every new identity carries its paired relationship, complete
  old/new digest, and attestation in the same target revision. The fixture is
  owned by PR-2; PR-1 may provide target-state fixture data but does not claim
  this history proof.
- **EX-G27** A legal two-revision `Planned -> Complete` transition that keeps
  the selected completion policy and semantic identity unchanged while adding
  valid policy evidence. The fixture and proof are owned by PR-2.
- **EX-G25** A legal two-revision `Planned -> Withdrawn` or
  `InProgress -> Withdrawn` transition with a valid withdrawal envelope. The
  fixture and proof are owned by PR-2; illegal source lifecycles and terminal
  envelope mutation are history failures.
- **EX-G28** An activation-base freshness pass in which every required source,
  relationship, local-evidence, and consumer-inventory tuple is exactly
  equivalent to the frozen candidate, the content-bound `candidateFreezeIdentity`
  is valid, and the result is bound to `activationBaseCommit`.

### Manual controls — not machine-decidable, and not claimed to be

- **MAN-G01** (was `ADV-G61`) **Attestation authorship — every class.** That the
  repository owner personally recorded an attestation is established at the
  **human review gate**. This covers ADR acceptance, ADR rejection, ordinary
  completion, withdrawal, node replacement, and both genesis envelopes: none
  carries a signature, and the same offline checker validates all of them. It is established
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

- **MAN-G02** **Independent default-branch update control for unsigned
  activation.** Before the owner records the real genesis attestations and again
  at the activation merge gate, the owner records in activation PR metadata
  enforceable evidence of either branch/ruleset protection requiring an
  owner-controlled path for every update to `refs/heads/main`, with no
  applicable implementation-agent bypass, or credential separation showing
  that the implementation actor and every credential available to it cannot
  update `refs/heads/main` through any route. The protected operation includes
  PR merge, direct push, force-push, API ref update, and ruleset or
  branch-protection bypass; proving only that an actor cannot invoke a PR merge
  is insufficient. If neither condition is evidenced, the unsigned activation
  is refused. This is a manual gate, not a registry field or authorization
  grant; signing remains outside v1 and needs a separate decision.

- **MAN-G03** **Semantic archive-to-landing association.** The repository owner
  personally reviews that the mechanically valid archived child change is the
  conceptual change delivered by the named landing and that its delivered
  scope and authority anchor describe that landing. The checker cannot decide
  this from a filename, path convention, issue prose, or a self-consistent
  digest, so it must not claim to refuse an otherwise valid but semantically
  unrelated archive. The owner records this judgment through the human
  completion attestation over the complete `completionDigest`; a recomputed
  archive or reassociated digest without that attestation is not completion
  evidence.

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
- **MUT-G14** Activation freshness extraction/equivalence → commit-identity-only
  comparison or skipped source class.
- **MUT-G15** Archived OpenSpec bundle, three-way membership, mode, scoped
  provenance, stage-exclusivity, or spike-evidence construction → omit or ignore
  `changeId`, `activeRoot`, `archiveRoot`, a member path, a member digest,
  either package identity, a required OpenSpec artifact, a stage-root absence,
  or `openSpecApplicability`; or accept a mismatched active/archive observation.
  The independent golden vector and the real current-checker refusal must kill
  each weakened implementation; semantic association remains the separate
  `MAN-G03` human control.

---

## Traceability plan

| Requirement | Landing | Task group | Proving control |
| --- | --- | --- | --- |
| Canonical representation | PR-1 | 1 | ADV-G01–03, G23; PROP-G02 |
| Collection classification and ordering | PR-1 | 1 | ADV-G38, ADV-G39, **ADV-G65**; PROP-G02, **PROP-G09**; MUT-G13 |
| Decision lifecycle (current manifestations) | PR-1 | 2 | ADV-G04, G05, G25; EX-G07 |
| Questions and gates | PR-1 | 2 | ADV-G06, G07, G09 |
| Landings and prerequisites (current) | PR-1 | 2 | ADV-G10, G12; T1 |
| Completion policies (current) | PR-1 | 2 | ADV-G26–G28, G30, G33; target-state lifecycle/evidence rules |
| Reviewed-delivery archive and spike evidence identities | **PR-1** | 2.3, 2.4, 3 | `EX-G29`; `ADV-G27`, `ADV-G78`–`ADV-G82`, `ADV-G84`, `ADV-G85`; `PROP-G11`; `MUT-G15` |
| Semantic archive-to-landing association | **PR-1** | 2.3, human review | `MAN-G03`; machine checker makes no semantic-ownership claim |
| Attestations | PR-1 | 1 | ADV-G19; PROP-G03, G08 |
| Current-revision validation | PR-1 | 2 | all of the above via the real checker |
| History validation | **PR-2** | 4, 7 | ADV-G04h, G08, G11, G13–G16, G18, G21, G29, G34, G35, G40, G41, G75; EX-G25, EX-G26, EX-G27; MUT-G08 |
| Candidate freshness mechanism | **PR-2** | 6.8 | INV-G48; ADV-G69–G74, G76; EX-G28; MUT-G14 |
| Rendering | PR-2 | 5 | ADV-G22, G36; EX-G11; PROP-G04 |
| Query | PR-2 | 5 | ADV-G17, G18; PROP-G05; T4 |
| Genesis primitives and derivation | PR-2 | 6 | ADV-G32, G44, G45; EX-G16, G17, G19 |
| Genesis source manifest | PR-2 | 6 | ADV-G20, G31, G42, G43, **ADV-G83**; MUT-G10 |
| Historical archive-to-landing disposition | **PR-2** | 6.1, 6.3, 6.5, 7.2 | `ADV-G83`; genesis archived-package identity and disposition checks |
| Consumer inventory | PR-2 | 6 | ADV-G46, G47; EX-G20 |
| Namespaced identifiers | PR-1 | 2, 3 | ADV-G50 — proven in PR-1; repeated in PR-2 as integration |
| Program graph validity | PR-2 | 6 | ADV-G56; the whole-program seed |
| Post-genesis runner-node introduction | **PR-2** | 4, 7 | INV-G47; ADV-G16; EX-G26 |
| Genesis completion envelope | PR-2 | 6 | ADV-G51–G53, ADV-G57, ADV-G63; EX-G23 |
| Withdrawal target-state validity | PR-1 | 2, 3 | ADV-G67, ADV-G68; PROP-G10 |
| Withdrawal succession/history | **PR-2** | 4, 7 | ADV-G29, ADV-G75; EX-G25 |
| Node replacement (current model) | **PR-1** | 2, 3 | ADV-G66; PROP-G10 |
| Node replacement (history) | **PR-2** | 4, 7 | ADV-G16; EX-G26; MUT-G08 |
| Attestation mechanism | PR-2 | 6 (6.6, 6.7) | ADV-G62; EX-G24 |
| Real genesis ceremony | **PR-3** | 8 (8.0, 8.1a, 8.6, 8.6a, 8.7, 8.8) | MAN-G01, MAN-G02 (manual) |
| Inventory count regeneration | PR-2 | 6 | EX-G21; ADV-G60 |
| Live-change exemption rule | PR-2 | 6 | ADV-G54 |
| Bound activation / no reactivation | PR-2 | 4 | ADV-G58, ADV-G59 |
| Candidate copy removal | PR-3 | 8 | ADV-G55 |
| Atomic activation | **PR-3** | 8 | ADV-G48; the PR-3 completion gate |
| Projection migration | PR-3 | 8 | ADV-G24; EX-G14 |
| External program index | PR-3 | 8 | ADV-G49 |
| Activation-base freshness invocation | **PR-3** | 8.1a, 8.8 | INV-G48; D8.2a |
| Activation merge-base equality | **PR-3** | 8.8 | INV-G48; ADV-G77 |
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
- **PR-2 — history checker, renderer, query, genesis machinery, canonical
  freshness extraction/comparison and digest proof, and a *candidate* seed at
  `tests/fixtures/governance/candidate/`.** Still no canonical registry. Every
  mechanism is proven against the candidate, so PR-3 promotes an already-proven
  artifact rather than authoring a new one.
- **PR-3 — atomic activation.** The canonical registry's **first appearance**,
  arriving already protected: exact-base freshness equivalence, registry,
  genesis attestation, source manifest, generated regions **and the deletion of
  the copies they replace**, pointers for every enumerated consumer,
  prohibited-copy enforcement, current-revision validation, **history
  validation**, scaffold coverage, and the human external index transition — in
  one indivisible change. The freshness gate runs before candidate promotion and
  again immediately before the seam is staged; any drift restarts candidate
  review rather than being patched into activation. The final merge gate also
  requires current `refs/heads/main`, the PR-3 base SHA, and attested
  `activationBaseCommit` to be equal; a mismatch restarts freshness, seam,
  freeze, attestation, and hosted verification.

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
