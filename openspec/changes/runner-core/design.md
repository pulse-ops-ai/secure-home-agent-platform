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

- Any I/O performed on the core's own initiative.
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
  authority/        capture-once snapshots; contract validation; snapshot set
  eligibility/      pre-spend eligibility decisions over a snapshot set
  policy/           write roots, protected material, prohibited rules, bounds
  workspace/        authoritative change-set derivation from observation
  reconciliation/   observed vs claimed comparison
  evidence/         evidence construction; seal-eligibility predicate
  verification/     INDEPENDENT re-derivation and comparison
  ports/            the injected observation interfaces (types only)
  index.ts          the public trusted-operation surface
```

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

### D3: The core performs no I/O; observation arrives through injected ports

`runner-core` imports nothing from `node:fs`, `node:child_process`, or any
network module. Everything the outside world contributes enters as data through
narrow port interfaces defined in `ports/` as **types only**:

| Port | Supplies |
|---|---|
| `AuthorityBytesSource` | the bytes of one authority input, plus its source identity |
| `WorkspaceObserver` | the observed change set for a workspace |
| `ArtifactObserver` | the observed artifact surface: path, bytes, digest |

Three consequences, all wanted: the package stays framework-neutral and
trivially testable; L4 owns every real read; and "the verifier reads the
authoritative inputs independently" has a precise meaning — the verifier is
handed *its own* port instances, and never the producer's results.

Rejected: letting the core read the filesystem directly. It would make the
package untestable without a real workspace, put I/O failure modes inside trust
decisions, and blur which component is allowed to touch the host.

### D4: Capture-once is enforced by types, not by discipline

`CapturedAuthority` is the only shape a decision accepts:

```ts
type CapturedAuthority<T> =
  | { readonly ok: true;  readonly source: SourceIdentity
      readonly digest: DigestT;  readonly contract: ContractIdentity
      readonly value: T }
  | { readonly ok: false; readonly source: SourceIdentity
      readonly refusal: Refusal }
```

No decision signature accepts a path, a reader, a port, or raw bytes. Re-reading
a source mid-decision is therefore not merely forbidden — it is not
expressible, which is the difference between a rule and a mechanism.

A snapshot's `digest` is computed over the captured bytes before parsing, so
the recorded identity is of the bytes that were actually read.

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

### D8: `prohibited_rules` is interpreted as normalized path prefixes, and an unrecognized form refuses

`PathPolicy.prohibited_rules` is `array(string().min(1))` with no declared rule
language (proposal Q1). L3 must interpret it and cannot change L2.

Proposed interpretation: each rule is a **repository-relative normalized path
prefix**. A change is prohibited when its normalized path equals a rule or lies
beneath one as a path component prefix. No wildcard, regex, or brace syntax is
recognized.

Any rule string that does not parse as a normalized relative path — one
containing a wildcard character, a traversal segment, an absolute prefix, or a
scheme — **refuses the whole policy at capture time**. It is not ignored, not
skipped, and not best-effort matched.

Rationale: an unrecognized rule silently ignored is a protection silently
removed, which is the highest-consequence failure this capability has. Prefix
matching is the narrowest interpretation that satisfies the requirement, and it
is trivially decidable. Adopting a glob language later is an L2 contract change
with its own review.

**This interpretation requires confirmation at the planning review.**

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
| `captureAuthority` | source identity + bytes + expected contract | `CapturedAuthority<T>` |
| `decideEligibility` | snapshot set + requested gate ids | `Decision<Eligible>` |
| `decideMaterialization` | captured policy + observed change set | `Decision<Materializable>` |
| `deriveAuthoritativeChangeSet` | host observation | `Decision<AuthoritativeChangeSet>` |
| `reconcileClaims` | authoritative set + claimed set | `Reconciliation` |
| `constructEvidence` | snapshots + observation + gate results + outcome inputs | `Decision<EvidenceBundleT>` |
| `decideSealEligibility` | evidence input set | `Decision<SealEligible>` |
| `verifyEvidence` | claimed bundle + independent observations | `VerificationResult` |

No exported operation accepts a path, a file handle, or a callback that could
read one.

## Failure Classification Boundaries

- **Contract refusal** — a decision the core made from valid inputs: missing
  authority, undeclared gate, protected path, over-bound input, incomplete
  evidence. Always carries a refusal code and the violated element.
- **Operational failure** — an injected port could not supply an observation.
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
The verifier derives its expectation from the authoritative inputs and its own
observations; if it derived it from the producer's function, it would confirm
the producer's opinion rather than check it. D6 enforces this with an import
guard.

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

Carried into the planning review. The first two are trust-critical and must be
closed before implementation begins.

**Q1 — `prohibited_rules` interpretation (trust-critical).** D8 proposes
normalized path prefixes with refusal on any unrecognized form. Confirm, or
direct that a typed rule contract be added to L2 first — which would make L3
depend on an L2 change and is outside #52's path authority.

**Q2 — evidence cannot record the policy or gate-registry digest
(trust-critical).** `EvidenceIdentities` has no field for either. Three
options, none of which L3 may take unilaterally:

| Option | Consequence |
|---|---|
| A — accept the gap for L3 | INV-007's "digest-recorded" holds inside the core and in verification, but a *reader of the evidence bundle alone* cannot tell which policy governed the run. The verifier still catches substitution, because it re-captures and compares. |
| B — add the fields to L2 first | Correct, and outside #52's path authority. Requires an L2 follow-up change and delays L3. |
| C — record them in an L3-owned side structure | Creates a second evidence-shaped artifact outside the ratified contract. Rejected by the authors of this design as a contract fork. |

This design assumes **A** and reports the gap; the review may direct **B**.

**Q3 — protected-path violation representation.** D9 renders it as a refusal
rather than a reconciliation disagreement. Confirm.

**Q4 — port granularity.** D3 proposes three ports. If L4's real
implementation wants a different split, the interfaces are L3-owned and would
change under a later authorized change. Flagged so the review can weigh it now
rather than after L4 is written.
