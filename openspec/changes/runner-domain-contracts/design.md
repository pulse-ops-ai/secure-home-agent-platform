# Design: runner-domain-contracts

## Context

L2 of the ratified runner program (#19, constitution PR #48). The canonical
`runner-adoption` spec fixes sixteen invariants; the package charters fix
ownership (`packages/contracts` shared authored source, `packages/events`
run-event/evidence vocabulary); ADR-0012 fixes Zod as the single authored
source with `schemas/` as generated output. This design decides how the
contract layer is shaped within those constraints. External authority: #51.

Revision state: the planning review (2026-08-09) accepted D1's four-way
capability decomposition — enacted in this revision — and required the
contract-model corrections carried below (complete authority shape, the
runtime-evidence correction, the `events → contracts` edge, exact schema
identity, narrowed credential claims, closed event vocabulary, explicit
generation parameters).

## Goals

- One authored shape for every runner-domain concept later landings
  consume — complete enough that L3/L4 never change a contract on first
  consumption.
- Structural neutrality strong enough that ADR-0003's falsification test
  (adding an adapter changes no schema) is a passing property test.
- A generation pipeline whose output cannot silently drift from its source,
  and whose schema identities are exact — one identity, one byte set.
- Shape/behavior discipline: nothing in this landing claims runtime
  behavior.

## Non-Goals

- Selecting validation engines for consumers, credential custody (U2), or
  any provider-specific structure (post-U6, behind the adapter boundary).
- Household contract slices (#28), persistence (U11), knowledge
  serialization (U7).

## Current Architecture

`packages/contracts` and `packages/events` are chartered, empty boundaries
wired into the workspace tooling; the workspace layer map places contracts
at layer 1 and events at layer 2. Zod is not in the catalog. `schemas/`
holds no generated output. The canonical `runner-adoption` spec, the
archived constitution's matrix, and `runner-model.md` define what the
shapes must encode.

## Proposed Architecture

```text
packages/contracts  (authored, Zod; layer 1)
  execution-profile/   identity · runtime(image digest, opaque adapter) ·
                       capability(tools · mounts+posture ·
                       network: default-deny + granted destinations ·
                       credentials: CredentialRef[]) ·
                       execution(R0–R3) ·
                       limits(wall_clock · cpu · memory · pids · output) ·
                       principal · knowledge-ref · evidence-ref
  launch-assertion/    ordered argv + digest · env-var NAMES ·
                       secret-presence: literal false
  path-policy/         write roots · prohibited rules · bounds
  gate-registry/       unique gate id · exact executable+argv ·
                       network: literal "none"
  verification-packs/  pack id → gate-id references only
  shared primitives    CredentialRef · ProfileIdentity/ProfileRef ·
                       AdapterId · GateId · Digest · CapabilityGrant

packages/events  (authored, Zod; layer 2 — imports contracts)
  run-record/          run id · profile identity+digest · enumerated
                       terminal vocabulary (COMPLETED · REFUSED ·
                       OPERATIONAL_FAILURE · CANCELLED · TIMED_OUT ·
                       INDETERMINATE)
  run-events/          closed platform event_type vocabulary ·
                       provider_event_name as opaque data
  evidence/            bundle + catalog · identities (incl. runtime as
                       opaque data) · principal · grants ·
                       attempted/permitted/denied · gate results ·
                       outputs+hashes · observed vs claimed change sets +
                       reconciliation · outcome detail · timing

schemas/  (generated, published — exact-version $id per contract)

per-package conformance suites
  neutrality scan · strictness properties · adapter-falsification test ·
  generation determinism/drift checks · identity-uniqueness property
```

## Decisions

### D1: Canonical capability decomposition (ACCEPTED 2026-08-09 — enacted)

- **Decision:** four canonical capabilities, enacted as this change's spec
  deltas:

| Capability            | Covers                                                                    |
| --------------------- | ------------------------------------------------------------------------- |
| `execution-profile`   | the complete authority shape; adapter opacity                             |
| `runner-execution`    | launch assertion, run record + terminal vocabulary, run-event vocabulary  |
| `runner-verification` | gate registry/dispositions, path policy, packs, **and the corpus-wide verification obligations: generation determinism and exact contract identity** |
| `runner-evidence`     | evidence bundle/catalog with full representability                        |

  Capability boundaries are domain change surfaces; package placement is
  implementation architecture (D2). Placement note flagged for the delta
  review: the corpus-wide generation/identity requirements live in
  `runner-verification` — the capability that owns how the platform
  verifies — rather than in a fifth capability.
- **Rationale:** distinct consumers and change cadences per surface;
  approved by the planning review over the single-capability and
  package-mirroring alternatives.

### D2: Package ownership follows the charters; capabilities may span packages

- **Decision:** profile, launch-assertion, path-policy, gate-registry,
  verification-pack shapes and the **shared runner primitives** —
  `CredentialRef`, `ProfileIdentity`/`ProfileRef`, `AdapterId`, `GateId`,
  `Digest`, and `CapabilityGrant` (the profile's capability-group shape) —
  are authored in `packages/contracts`; run-record, run-event, and
  evidence shapes in `packages/events`, which **imports the shared
  primitives from `packages/contracts`** (D8). One authored shape flows
  through: profile capability group → `capability.granted` event payload →
  `evidence.granted_capabilities`. **No semantically equivalent second Zod
  definition exists in `packages/events`.** The capability map never
  encodes package paths.
- **Rationale:** parent D9 and the charters; primitives must be one
  definition — a locally redefined grant shape in events would recreate
  the exact semantic duplication this architecture eliminates.

### D3: Zod v4 native generation with an explicit conversion contract

- **Decision:** JSON Schema is produced by Zod v4's native `z.toJSONSchema`
  with **explicit, recorded parameters — library defaults are not
  authority**: `target: "draft-2020-12"`; `unrepresentable: "throw"`
  (fail closed); contract schemas use no transforms or defaults, so input
  and output modes are identical by construction (any future transform is
  a design change, not a knob); reused schemas are registered so shared
  identities emit `$defs` references; cycles are not expected and error.
  One generation entry point per package writes `schemas/` with stable,
  sorted serialization. The regenerate-and-compare check is implemented
  as **package-level conformance tests**, so the existing aggregate gate
  (`scripts/check.sh` → the workspace test pipeline) executes it without
  any modification outside #51's authorized path scope; a diff fails the
  gate. The **authored strict Zod schemas remain the parse
  authority** — generated `additionalProperties: false` is published
  projection, never the proof of runtime strictness (C-PROP-001 exercises
  Zod parsing itself).
- **Rationale:** one authored source, zero extra dependencies, fail-closed
  conversion, and drift detection per INV-015.
- **Alternatives:** `zod-to-json-schema` dependency (rejected: native
  capability); hand-authored JSON Schema (prohibited); uncommitted
  generated output (rejected: `schemas/` is the chartered published
  artifact).

### D4: Strictness posture; platform vocabularies closed, identities open

- **Decision:** every object schema is strict (unknown keys refuse).
  **Closed enums** exist for platform-owned vocabularies only: terminal
  states, gate dispositions, routing classes, mount postures, and the
  **run-event `event_type` vocabulary** (`run.started`,
  `capability.granted`, `call.attempted`, `call.disposition`,
  `adapter.started`, `adapter.completed`, `run.terminated`) — extended
  only by contract-version increment. **Open, constrained strings** are
  identities: adapter, provider, model route, gate id,
  `provider_event_name`. Optionality is explicit; absent and null are not
  conflated.
- **Rationale:** neutrality makes an adapter enum a violation, while the
  uniform-event contract makes an open event type a violation — the same
  logical stream must be the same schema across adapters; provider naming
  rides as data.
- **Alternatives:** dotted-grammar-only event names (rejected by the
  planning review: two adapters could emit different names for one
  semantic moment and both validate).

### D5: Exact contract identity (REVISED per review — one identity, one schema)

- **Decision:** every contract carries a stable `contract_id` and an
  **exact** `contract_version` (semantic revision, e.g. `1.0.0`).
  Additive compatible change → minor (`1.0.0 → 1.1.0`); breaking change →
  major (`1.x → 2.0.0`). The generated `$id` embeds the exact version,
  and identity is enforced by a **mechanical identity guard**, not
  convention: an authored, append-only **identity ledger** in the
  contract layer maps each `contract_id`@exact-version to the digest of
  its generated schema bytes. The conformance suite fails
  deterministically when (a) a generated schema's bytes do not match its
  ledger digest — shape changed under an unchanged identity — or (b) a
  generated identity has no ledger entry. A new version appends a ledger
  line; nothing ever rewrites one. (The ledger is authored, never
  regenerated — regeneration must not be able to heal an identity
  violation.) **Compatibility posture:** an older strict reader is never
  assumed to accept newer documents; cross-version reader compatibility
  is version-pair-specific and is proven by the change that introduces a
  second version — this landing proves exact identity only. No schema
  registry yet.
- **Implementation latitude:** the guard's file location and encoding are
  implementation detail within the authorized scope; the observable
  contract is fixed — changed bytes under an unchanged identity ⇒ named,
  deterministic conformance failure.
- **Rationale:** the original single-integer scheme let an additive change
  produce a different byte set under the same version-bearing `$id` — two
  schemas, one identity — which the review correctly rejected.
- **Alternatives:** integer contract versions with package-semver-only
  granularity (rejected as above); a schema registry (premature).

### D6: Credential references (SCOPED per review)

- **Decision:** one shared `CredentialRef` type (an environment-variable
  name with a naming-pattern constraint), authored in `packages/contracts`.
  Every field whose **semantic purpose is credential transport** admits
  `CredentialRef` only; the launch assertion and the evidence/identity
  structures carry **no credential-value slot**; `contains_secret_values`
  is the literal `false`. The shape layer does **not** claim that
  arbitrary opaque strings cannot contain secret material — that is a
  scanning/runtime concern (L4/L9).
- **Rationale:** the mechanically provable rule is the absence of
  value-capable slots in credential-purposed and identity positions; a
  type system cannot prove an arbitrary string is not a secret.

### D7: Identity and uniqueness are validated, not conventions

- **Decision:** gate-identity uniqueness (registry and result sets), run
  identity shape, and profile identity (name + version + digest) are
  enforced by contract-level refinements — a duplicate is a validation
  failure, not a downstream runtime guard.
- **Rationale:** the donor's duplicate-gate lesson, ratified as the
  gate-vocabulary requirement: make the illegal state unrepresentable at
  the earliest layer that can express it.

### D8: Dependencies (REVISED per review — the inward contract edge is intentional)

- **Decision:** `packages/contracts` has one runtime dependency: `zod`
  (catalog entry, ADR-0012 §19). `packages/events` has two: `zod` and
  `@secure-home/contracts` (`workspace:*`) — the deliberate inward edge of
  the workspace layer map (contracts layer 1, events layer 2), through
  which events imports the shared runner primitives (identities, Digest,
  CredentialRef, CapabilityGrant) instead of duplicating or weakening
  them. No other dependency enters with this landing.
  **Inertness is redefined accordingly:** no production consumer *outside
  the L2 contract layer* imports the new runner contracts; the
  `events → contracts` edge never counts against it.
- **Rationale:** the review's shared-semantics requirement; the workspace
  layering already classifies events as contract-shaped vocabulary built
  on the inner layer.

## Decision Tables

Shape-vs-behavior boundary (the discipline this landing is reviewed
against):

| Concern                          | L2 proves (shape)                                   | Proven later (behavior)            |
| -------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Authority from profile (INV-005) | the profile is the complete, versioned grant shape (incl. credentials, deny-only network, pids) | refusal of profile-less runs — L4 |
| Gate vocabulary (INV-016)        | closed dispositions; duplicates invalid             | scheduling/classification — L4     |
| Outcome classification (INV-003) | enumerated terminal vocabulary; refusal/operational as data | actual classification — L3/L4 |
| Event uniformity                 | closed platform event_type; provider naming as data | emission/normalization — L4/L7     |
| Judge protection (INV-008)       | —                                                   | L3 (data), L4 (orchestration)      |
| Secrets (launch)                 | no credential-value slot; secret-presence literal false | leak scanning, injection — L4/L9 |
| Evidence (INV-011/015)           | mandatory, representationally complete; runtime as opaque data | sealing, independent verify — L3 |

Inherited-invariant → proof mapping at this landing:

| Inherited | Applied here as                                  | Proof (assurance)      |
| --------- | ------------------------------------------------ | ---------------------- |
| INV-002   | opaque adapter; neutrality scan                  | C-PROP-002, C-ADV-005  |
| INV-003   | enumerated vocabularies                          | C-EX-001, C-PROP-003   |
| INV-005   | complete authority shape                         | C-EX-001               |
| INV-012   | no structural runtime authority; runtime as opaque evidence data | C-EX-002 |
| INV-015   | generation drift detection; exact identity       | C-PROP-004, C-ADV-003, C-PROP-005 |
| INV-016   | closed dispositions, uniqueness                  | C-PROP-003, C-ADV-004  |

## Interfaces and Contracts

The four capabilities are the normative interface; the two packages are the
authoring locations. Consumers import types and validators from the
packages; language-neutral consumers read `schemas/`. Nothing is frozen for
external stability by this landing — freezing happens when the first
consumer lands (L3/L4) and, for SPI-facing parts, only after the U6 ADR.

## Failure Classification Boundaries

At this landing there is exactly one failure mode: an invalid document (or
a drifted generated file) fails with the violating position or file named.
The contracts *represent* the runtime classification vocabulary; they never
perform classification.

## Shared vs Independent Logic

- **Shared (this landing):** the domain vocabulary and identity types —
  one definition each, in the inner package, imported inward by events.
- **Independent (later):** every derivation and proof over these shapes —
  independent implementations of the same contract, never second
  contracts.

## Compatibility and Migration

Greenfield and inert (per D8's definition): no production consumer exists,
nothing migrates. The landing may not weaken any inherited invariant; the
conformance suite is written to be re-run unchanged at L7/L8.

## Security Implications

- No authority is created: shapes grant nothing; the profile's knowledge
  group is structurally incapable of granting; the network shape cannot
  express an open posture, so the one stance the platform contract forbids
  is unwritable.
- Credential-purposed and identity positions have no value-capable slots
  (D6); the launch assertion's secret-presence admits only `false`.
- The generation chain is drift-detectable and identity-exact (D3, D5) —
  published schemas can neither diverge from source nor share an identity
  across distinct byte sets.
- Structural neutrality is machine-checked, keeping the U6 boundary
  enforceable at review time.

## Landing Seams

One landing, one PR, inert. Internal task seam (child `tasks.md`): catalog
+ package wiring → contracts-package families → events-package families
(imports contracts) → generation pipeline + committed `schemas/` →
conformance suite. The suite lands with the shapes it protects; nothing
activates. Authorization flips only after the delta-only planning review of
this revised artifact set (task 0.1 is the flip alone).

## Open Questions

- None held open by this change: D1 is accepted and enacted; D5 is revised
  per the review. The delta review confirms the enacted artifact set,
  including the placement of the corpus-wide requirements under
  `runner-verification`.
