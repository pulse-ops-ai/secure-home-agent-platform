# Design: runner-core

## Context

L2 (#51) authored the runner domain contracts and stopped at shapes. L3 builds
the first thing that decides anything with them, and it does so *before* any
orchestrator exists — the serial-safety argument in the ratified landing plan
depends on the core being reviewable on its own, against contracts alone.

The architectural split this design must not blur:

```text
runner-core     trusted decisions / derivation / verification
runner-control  orchestration                          (L4, #27)
adapter         provider translation                   (L7, post-U6)
profile         authority                              (data)
sandbox         untrusted execution                    (L9, post-U4)
```

Governing material: `openspec/specs/runner-adoption/spec.md` (ratified), the
archived `runner-baseline-adoption` design and assurance, ADR-0001, ADR-0003,
ADR-0004, ADR-0006, ADR-0012, and `docs/architecture/runner-model.md`.

## Goals

- A reusable, framework-neutral package whose dependency direction is
  mechanically enforced, not documented.
- Decisions that are pure functions of captured snapshots and host
  observations, so that the caller cannot influence the answer.
- An independent verifier that disagrees with a tampered producer.
- A proof net that lands with the mechanisms it protects.

## Non-Goals

- Any I/O performed on the core's own initiative — and any I/O
  *abstraction*: no reader, observer, source, or port interface is defined
  here. Acquisition and observation are L4.
- Any ordering, sequencing, scheduling, or lifecycle.
- Any framework surface: no decorator, module, controller, or provider.
- Selecting U2 workload identity, placing runner-control (U4), or defining the
  adapter SPI (U6).
- Modifying `packages/contracts` or `packages/events`.

## Current Architecture

`packages/contracts` (layer 1) authors the shapes: `ExecutionProfile`,
`PathPolicy`, `GateRegistry`, `VerificationPacks`, `LaunchAssertion`, and the
shared primitives (`Digest`, `GateId`, `ProfileIdentity`, `CapabilityGrant`,
`CredentialRef`, `AdapterId`, `RoutingClass`, `SemVer`).

`packages/events` (layer 2) authors `RunRecord`, `RunOutcome`, `TerminalState`,
`TERMINAL_SUCCESS`, the closed event vocabulary, and `EvidenceBundle` with
`EvidenceIdentities`, `ChangeSets`, `FileChange`, `ArtifactEntry`.

L2's behavioral contract is now **canonical**, archived and synced by #63:
[`execution-profile`](../../specs/execution-profile/spec.md),
[`runner-execution`](../../specs/runner-execution/spec.md),
[`runner-verification`](../../specs/runner-verification/spec.md), and
[`runner-evidence`](../../specs/runner-evidence/spec.md). Those four are the
authoritative statement of what the shapes must express; this change consumes
them and adds no requirement to any of them.

Two of those contracts were amended by the review-directed
`runner-contract-corrections` change, now fully landed (planning #64,
implementation #65, archive/sync #66): typed prohibited rules in
`path-policy` 2.0.0, and required per-contract authority identities in
`evidence-bundle` 2.0.0 (`PathPolicyAuthorityIdentity` /
`GateRegistryAuthorityIdentity` — a mislabeled identity is
unrepresentable). This seam consumes the amended contracts as they exist
on `main`; it still modifies neither package.

Dependency direction is already enforced by two independent mechanisms:
`scripts/check-workspace.mjs` (what a manifest may declare) and
`scripts/check-source-imports.mjs` (what source may import), both reading
`LAYERS` from `scripts/workspace-model.mjs`. Nothing consumes the contracts
yet.

## Proposed Architecture

```text
packages/runner-core/src/
  primitives/       deterministic, decision-free helpers
                    digest, canonical ordering, path normalization, bounds math
  decision/         the Decision<T> / Refusal result algebra and refusal codes
  authority/        snapshot construction from supplied bytes; contract
                    validation; the immutable snapshot set; input value types
  eligibility/      pre-spend eligibility decisions over a snapshot set
  policy/           write roots, protected material, prohibited rules, bounds
  workspace/        authoritative change-set derivation from supplied
                    observation values; observation value types
  reconciliation/   observed vs claimed comparison
  evidence/         evidence construction; seal-eligibility predicate
  verification/     INDEPENDENT re-derivation and comparison
  index.ts          the public trusted-operation surface
```

There is no `ports/` directory and no I/O abstraction anywhere in the tree:
the package defines **value types** for what it consumes (authority bytes
with source identity, workspace observations, artifact observations) and
never a reader, observer, or source interface (D3).

The public surface exposes **trusted domain operations** — `captureAuthority`,
`decideEligibility`, `decideMaterialization`, `deriveAuthoritativeChangeSet`,
`reconcileClaims`, `constructEvidence`, `decideSealEligibility`,
`verifyEvidence` — not modules, classes, or internals.

No `runner-core.ts`, `utils.ts`, or `helpers.ts` exists. A helper with no home
is a boundary that was not thought through.

## Decisions

### D1: `packages/runner-core` is a layer-3 workspace member

`LAYERS` gains `'packages/runner-core': 3`. It depends on `packages/contracts`
(1) and `packages/events` (2) — both strictly lower, so both existing direction
checks accept the edges and reject a service, app, or same-or-higher-layer
import with no new script logic.

Layer **3** specifically, and not 4 or higher, because `check-workspace.mjs`
applies its framework-dependency guard to `ownLayer <= CONTRACT_LAYER_MAX`
(3). Placing the package at 3 therefore buys mechanical framework-neutrality
enforcement — a NestJS, Fastify, Next, React, or Express dependency is rejected
by the merge gate — **without editing `check-workspace.mjs`, which is outside
this landing's path authority.**

Honest consequence: the constant is named `CONTRACT_LAYER_MAX`, and
`runner-core` is not a contract package. The name becomes slightly misleading.
That is a naming-only follow-up, **reported and not fixed here** — renaming it
would touch a file #52 does not authorize, and the narrow-scope rule says
report an adjacent problem rather than fix it in the same change.

Rejected: layer 4 alongside `logging`/`observability` — semantically tidier,
but it would place `runner-core` above `api-contracts` (3), letting it depend
on the operation catalog, and it would lose the framework guard entirely.

### D2: Permitted dependencies are an in-package allowlist, not a denylist

`check-workspace.mjs`'s `FRAMEWORK_DEPENDENCIES` is a regex denylist covering
NestJS, Fastify, Next, React, Express, Nuxt, Vue, and Svelte. It does not — and
cannot — enumerate every Home Assistant client, OpenFGA client, or database
driver. A denylist of things that must not be imported is unbounded.

So `runner-core` carries its own conformance test asserting that its manifest's
runtime dependency set is **exactly** `{@secure-home/contracts,
@secure-home/events}` and its devDependency set is exactly the standard tooling
set. Adding any dependency fails the test until the allowlist is deliberately
edited, which is a reviewable act.

This is fail-closed in the direction that matters: a new dependency is refused
by default rather than permitted until someone remembers to ban it.

### D3: The core performs no I/O and owns no I/O abstraction; bytes and observations arrive as immutable values

`runner-core` imports nothing from `node:fs`, `node:child_process`, or any
network module — **and it defines no reader, observer, source, or port
interface either**. Everything the outside world contributes enters as an
immutable value, typed by the core:

| Value type | Carries |
|---|---|
| `AuthorityBytes` | the bytes of one authority input, plus its source identity — or the orchestrator's reported acquisition failure |
| `WorkspaceObservation` | the observed change set for a workspace — or a reported observation failure |
| `ArtifactObservation` | the observed artifact surface: path, bytes, digest per artifact — or a reported observation failure |

**L4 owns the real acquisition and observation machinery** — its own reader
and observer ports, if it wants them, live in L4. It acquires each authority
source exactly once, retains the resulting snapshot for the run, performs
independent re-observation for verification, and passes the results into L3
as the values above.

Three consequences, all wanted: the package stays framework-neutral and
trivially testable; L4 owns every real read *and the abstractions for
reading*, so no L3 signature can smuggle an I/O capability; and "the
verifier's inputs are independent" has a precise, honest meaning — the
verifier is handed independently acquired **values**, and the obligation
that they were acquired independently and afresh is L4's to prove, not L3's
to claim.

Rejected: letting the core read the filesystem directly — untestable without
a real workspace, I/O failure modes inside trust decisions, blurred host
boundary. Rejected (this revision, per the delta review): L3-owned port
interfaces with L4-supplied implementations — an I/O abstraction defined by
the pure core contradicts "performs no I/O", invites a later implementation
inside L3, and made the capture-once claim unprovable as stated. Q4 is
resolved by this removal.

### D4: Snapshot-only decisions are enforced by types; acquire-once is L4's, stated honestly

`CapturedAuthority` is the only shape a decision accepts:

```ts
type CapturedAuthority<T> =
  | { readonly ok: true;  readonly source: SourceIdentity
      readonly digest: DigestT;  readonly contract: ContractIdentity
      readonly value: T }
  | { readonly ok: false; readonly source: SourceIdentity
      readonly refusal: Refusal }
```

No **decision** signature accepts a path, a reader, a port, a callback, or
raw bytes — `captureAuthority` is the single constructor that takes an
`AuthorityBytes` value and produces the snapshot every decision requires.
Re-reading a source mid-decision is therefore not merely forbidden — it is
not expressible, which is the difference between a rule and a mechanism.

A snapshot's `digest` is computed over the supplied bytes before parsing, so
the recorded identity is of the bytes that actually governed.

The split of the ratified capture-once invariant (INV-007), stated honestly:

- **L3 proves**: given captured bytes, an immutable digest-bound snapshot is
  constructed; every decision accepts only snapshots; a decision cannot
  express a re-read.
- **L4 proves**: each authority source was physically acquired **exactly
  once** per run, the snapshot was retained, verification inputs were
  re-acquired independently, and no downstream step re-read a source. A pure
  package that performs no I/O cannot prove an acquisition count, and this
  design does not claim it.

### D5: Refusal is a returned value with a stable code

Every trusted operation returns `Decision<T> = Proceed<T> | Refusal`, never
throws for a contract reason, and never returns a bare boolean. `Refusal`
carries a stable `RefusalCode`, the violated element (missing input, undeclared
identity, offending path, bound name plus observed value), and its
classification as contract refusal.

Two reasons. First, INV-003: a refusal must still write evidence, so it has to
be data. Second, an exception is easy to swallow and hard to enumerate; a
discriminated union makes the refusal set reviewable and makes "we forgot a
case" a type error.

Operational failures — an injected port reporting the host unreadable — are a
separate `OperationalFailure` variant, never a `Refusal`. The distinction is
INV-003 and it is structural here, not conventional.

### D6: The verifier may not import the producer

`src/verification/**` must not import `src/evidence/**`, and `src/evidence/**`
must not import `src/verification/**`. Both may import `src/primitives/**` and
`src/decision/**`.

This is the "producer calls its own helper to verify itself" failure made
mechanically impossible. Shared **deterministic primitives** — digest
computation, canonical ordering, path normalization — are explicitly allowed,
because independence must live in *derivation*, not in re-implementing SHA-256
twice. Shared *decision* logic is not allowed: if both sides call the same
function to decide artifact membership, the verifier proves nothing.

Enforced by an in-package architecture test that reads the import graph of both
subtrees and fails on any edge between them (task 6.1). The rule needs a
mechanism precisely because it is the kind of thing a later refactor
"simplifies" away.

### D7: Sealed-last splits cleanly — L3 decides, L4 orders

The ratified contract says evidence is sealed last. Ordering is orchestration.

L3 therefore owns `decideSealEligibility(inputs) → Decision<SealEligible>`: a
pure predicate over the completeness and consistency of the evidence inputs,
naming the prerequisites it checked. It performs no write and sequences
nothing.

L4 owns the ordering: calling the predicate, and writing the sealed record
after every other artifact. L3 cannot prove the ordering — a pure function
cannot observe when it was called — and claiming otherwise would be exactly the
overclaim the assurance instructions forbid. The boundary is stated in the
capability spec and repeated here so no later reader assumes L3 covered it.

### D8: Prohibited rules are consumed as the L2 typed contract; an unimplemented kind refuses

The delta review (2026-08-10) directed Q1's resolution into L2: the
`runner-contract-corrections` change types `prohibited_rules` as structured
rules with a closed kind vocabulary — initially `path_prefix` only, with
non-normalized forms (wildcard, traversal, absolute, scheme) structurally
unrepresentable. L3 therefore interprets **no opaque strings**; the rule
language is the contract's.

L3's remaining semantics, for the `path_prefix` kind: a change is prohibited
when its normalized path equals the rule's prefix or lies beneath it as a
path **component** prefix (`docs` matches `docs/x.md`, never `docs-2/x.md`).

Defense in depth, kept: a policy whose bytes fail contract validation
refuses at capture (that is capture's job); and a rule whose `kind` lies
outside the core's implemented vocabulary — possible only when a future
contract version adds a kind before the core learns it — **refuses the whole
policy**, never skipping the rule. A protection rule silently ignored is a
protection silently removed, which remains the highest-consequence failure
this capability has.

This design consumes the correction; L3 implementation begins only after it
lands (see § Open Questions, Q1/Q2 resolution).

### D9: Protected-path violations are refusals, not reconciliation disagreements

`ChangeSets.reconciliation` models agreement and disagreements between observed
and claimed sets (proposal Q3). A protected-path write is neither: it is a
refusal cause about the observed set alone.

L3 therefore returns it as a `Refusal` from `decideMaterialization`, carrying
the offending path and the protection that matched. Where the run's evidence
must record it, the refusal renders into the outcome's `contract_refusal`
detail — never into `reconciliation.disagreements`, which would assert a
divergence that did not occur.

### D10: Bounds have no truncating mode anywhere in the API

No parameter, option, or return shape expresses a truncated, sampled, or
partial result for a security-relevant bound. `enforceBound` returns
`Decision<InBounds>` and nothing else. A caller wanting "as much as fits"
cannot express the request.

Boundary semantics are fixed: a measured value **equal** to its declared bound
proceeds; strictly greater refuses. Stated because off-by-one at a security
boundary is a classic silent defect, and because the property test needs a
declared expectation to generate against.

## Decision Tables

Eligibility, decided before any spend:

| Profile snapshot | Policy snapshot | Registry snapshot | Requested gates | Outcome |
|---|---|---|---|---|
| absent | any | any | any | refuse — missing profile |
| present, invalid | any | any | any | refuse — invalid profile |
| present, valid | absent | any | any | refuse — missing required policy |
| present, valid | present, malformed | any | any | refuse — malformed authority |
| present, valid | present, valid | absent | non-empty | refuse — missing registry |
| present, valid | present, valid | present, valid | contains undeclared id | refuse — undeclared gate |
| present, valid | present, valid | present, valid | all declared | eligible |
| any state that cannot be established | — | — | — | refuse — undecidable |

Materialization, decided over the observed change set:

| Path resolves | Touches protected material | Within declared bounds | Outcome |
|---|---|---|---|
| under an allowed root | no | yes | eligible |
| under an allowed root | **yes** | yes | refuse entirely — protected path named |
| outside every root | — | — | refuse — path named |
| normalization undecidable | — | — | refuse — undecidable recorded |
| under an allowed root | no | **no** | refuse — bound and observed value named |
| under an allowed root | yes | no | refuse — protected path reported first |

Verification:

| Bundle | Artifacts on the observed surface | Digests | Outcome |
|---|---|---|---|
| valid | exactly the bundle's set | all match | verified |
| valid | exactly the bundle's set | one diverges | fail — artifact and divergence named |
| valid | contains an extra | — | fail — unaccounted artifact named |
| valid | missing one the bundle names | — | fail — missing artifact named |
| absent / malformed / self-contradictory | — | — | fail — condition named |
| valid | surface unreadable | — | operational failure, not verified |

No row maps an undecidable state to success.

## Interfaces and Contracts

Consumed from L2, never redefined: `ExecutionProfile`, `PathPolicy`,
`GateRegistry`, `VerificationPacks`, `GateResults`, `Digest`, `GateId`,
`ProfileIdentity`, `EvidenceBundle`, `ChangeSets`, `FileChange`,
`ArtifactEntry`, `RunOutcome`, `TerminalState`, `TERMINAL_SUCCESS`.

Exported by L3 for L4:

| Operation | Takes | Returns |
|---|---|---|
| `captureAuthority` | `AuthorityBytes` value (source identity + bytes) + expected contract | `CapturedAuthority<T>` |
| `decideEligibility` | snapshot set + requested gate ids | `Decision<Eligible>` |
| `decideMaterialization` | captured policy + observed change set | `Decision<Materializable>` |
| `deriveAuthoritativeChangeSet` | host observation | `Decision<AuthoritativeChangeSet>` |
| `reconcileClaims` | authoritative set + claimed set | `Reconciliation` |
| `constructEvidence` | snapshots + observation + gate results + outcome inputs | `Decision<EvidenceBundleT>` |
| `decideSealEligibility` | evidence input set | `Decision<SealEligible>` |
| `verifyEvidence` | claimed bundle + independently acquired observation values | `VerificationResult` |

No exported operation accepts a path, a file handle, a reader, a port, or a
callback that could read one. Bytes and observations are values; their
acquisition is L4's.

## Failure Classification Boundaries

- **Contract refusal** — a decision the core made from valid inputs: missing
  authority, undeclared gate, protected path, over-bound input, incomplete
  evidence. Always carries a refusal code and the violated element.
- **Operational failure** — the orchestrator reported that acquisition or
  observation failed, supplied to the core as a reported-failure value.
  Never carries a refusal code, and never claims a contract decision.
- **Undecidable** — the inputs do not determine an answer. Classified as
  refusal, recorded as undecidable, never eligible and never verified.

The boundary is structural: `Refusal` and `OperationalFailure` are distinct
variants, so collapsing one into the other is a type error rather than a
review finding.

## Shared vs Independent Logic

**May be shared** (`primitives/`, `decision/`): digest computation, canonical
ordering, path normalization, bound comparison, the result algebra. These are
deterministic and derive no decision — two independent implementations of
SHA-256 would prove nothing and add a divergence risk.

**Must remain independent** (`evidence/` versus `verification/`): expected
artifact membership, expected change membership, completeness, and consistency.
The verifier derives its expectation from the authoritative inputs and the
independently acquired observation values L4 hands it; if it derived it from
the producer's function or the producer's inputs, it would confirm the
producer's opinion rather than check it. D6 enforces the import side with a
guard; the independent-acquisition side is L4's obligation, named in D3/D4.

## Compatibility and Migration

No migration. `packages/runner-core` is new, and nothing imports it until L4.
`packages/contracts` and `packages/events` are consumed exactly as authored;
no existing behavior changes.

The package is **inert on landing**: it is a library with no importer, no
entry point, and no side effect at module load.

## Security Implications

- **Authorization.** Eligibility gates spend. A permissive default would be an
  authorization bypass, which is why D4 and D5 make "absent" unrepresentable as
  "permitted".
- **Judge protection.** D8 and D9 own the data/path side of "a run cannot alter
  what judges it". The code side — that modified orchestration never executes
  as decision-bearing logic — is L4's, and is *not* claimed here.
- **Trust transfer.** D6 plus the final-consumer requirement prevent an earlier
  verification from laundering a later mutated artifact.
- **No credential surface.** The core reads `CredentialRef` values as data and
  has no operation that resolves, injects, or transports a credential value.
  U2 is untouched.
- **No egress.** The package imports no network module, and the framework and
  dependency guards make adding a client a gate failure.

## Landing Seams

**One PR.** L3 is a single atomic seam: a trusted core landing without its
proof net would be a core whose guarantees are unproven, and the landing plan
explicitly puts the proof net *with* the mechanism.

Within the PR, verification lands with each component rather than at the end —
the task plan interleaves them (task groups 2–6 each carry their own proofs,
and group 7 adds only the cross-cutting net that needs every part present).

**Inert until activation:** nothing imports the package on landing. Its
"rollback" is non-reference.

**Authority posture:** additive. No authority flips; L9 remains the single
enforcement flip in the program.

## Open Questions

All four questions this seam carried are now resolved by review direction
(delta review, 2026-08-10, on PR #62). Recorded here with their outcomes;
none remains open in this design.

**Q1 — `prohibited_rules` interpretation (trust-critical). RESOLVED: typed
rule contract in L2.** The review directed that L3 not invent semantics over
opaque strings: *"The rule language belongs in the L2 contract."* The
`runner-contract-corrections` change types the rules (closed kind
vocabulary, structurally normalized `path_prefix`); D8 now consumes that
contract, retains component-prefix matching semantics, and refuses any kind
outside the implemented vocabulary. The correction has since landed (#64/#65/#66).

**Q2 — evidence cannot record the policy or gate-registry digest
(trust-critical). RESOLVED: option B.** The four-option analysis (A: accept
the gap; B: amend the ratified `runner-evidence` contract first; C: L3-owned
side structure — rejected as a contract fork; D: record inputs as
`ArtifactEntry` rows — rejected because it overloads an outputs field and
forces the verifier to special-case RC-ADV-07's fail-closed accounting) was
decided for **B**: *"a small governed L2 follow-up that adds digest-bound
identities for the path policy and gate registry to the evidence
contract/spec."* `runner-contract-corrections` adds both as required
`AuthorityIdentity` fields; evidence construction populates them and the
verifier compares them against its independently supplied captures. L3
sequences behind the correction — which has since landed (#64/#65/#66).

**Q3 — protected-path violation representation. CONFIRMED.** D9 stands: a
protected-path write is a policy/materialization refusal, never a
reconciliation disagreement.

**Q4 — port granularity. RESOLVED: ports removed from L3.** The review did
not accept L3-owned I/O ports: *"Move acquisition/observation ports to L4
and keep L3 value-oriented/pure."* D3 now defines value types only; L4 owns
every acquisition and observation abstraction; INV-007's acquire-once half
is honestly assigned to L4 (D4).
