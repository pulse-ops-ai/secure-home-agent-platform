# Change Proposal: runner-early-terminal-record

## Why

The L4 planning review (PR #69/#70, blocker 2 and its D11 resolution)
established that a run terminating in `REQUESTED` — a request naming no
profile, a profile that fails to resolve, or a production-acquisition fault
— cannot construct the L2 evidence bundle, because the bundle's required
authority identities do not exist, and **fabricating them is prohibited**.
The ratified adoption contract still requires such refusals to leave
durable evidence (INV-003: a refusal carries enough to write refusal
evidence). Today no L2 contract can represent that record:

- `evidence-bundle@2.0.0` requires the profile, path-policy, and
  gate-registry identities — exactly what an early-terminated run lacks;
- `run-record@1.0.0` requires a resolved `ProfileIdentity` and an evidence
  `bundle_digest` — likewise unconstructible.

The L4 seam therefore sequences its implementation behind "a small L2
amendment" introducing the governed shape (its task 0.1 gates on this
change landing). This is that amendment.

Evidence motivating this change:

- The L4 planning review verdicts on PR #69 and PR #70 (blocker 2; D11
  accepted: "a pre-authority terminal gets a governed refusal record
  rather than fabricated authority identities").
- `openspec/changes/runner-control-orchestration/design.md` D11 and the
  `runner-lifecycle` early-terminal requirement, which name this contract.
- `openspec/specs/runner-evidence/spec.md` — the canonical capability this
  delta extends.
- GitHub issue #51 — the L2 external authority, recorded in `tasks.md`
  under the same correction-within-scope reading the owner confirmed for
  `runner-contract-corrections`.

## Problem

**What happens today.** A run refused before its production acquisition
completes has no representable terminal record: every existing contract
demands authority identities that were never established.

**What should be possible instead.** A minimal, governed record — run
identity, the requesting principal, the requested profile reference as
data, the structured terminal outcome, timing — that an early-terminated
run leaves behind, distinct from the evidence bundle and never a
substitute for it.

**Who is affected.** L4 writes these records (its lifecycle spec requires
them); any future evidence reader distinguishes full bundles from
early-terminal records by contract identity.

## Proposed Capability

One ADDED requirement on the canonical `runner-evidence` capability and
one new L2 contract:

- **`early-termination-record@1.0.0`** (authored in `packages/events`,
  beside the run-record family): `run_id`; **`requester`** — the identity
  that asked for the run, with its actor or explicit autonomous marker,
  so a refusal independently states *who* was refused; `requested_profile`
  as a `ProfileRef` **or null** (a request may name nothing); `outcome`
  drawn from the terminal vocabulary **narrowed to its non-success
  members**, so an authority-less record cannot claim success; `timing`
  as the shared `EvidenceTiming` shape. Strict, provider-neutral, no
  credential-value slot — the same posture as every L2 contract. Exactly
  one of `run-record` (with its full bundle) or
  `early-termination-record` exists per run, and the record SHALL NOT
  carry fabricated authority identities — the shape makes them
  inexpressible by having no such fields.

## Scope

### In scope

- The `runner-evidence` delta (ADDED requirement).
- `packages/events`: the `EarlyTerminationRecord` schema, artifact catalog
  entry, and proofs; shared shapes (`ProfileRef`, `Principal`,
  `EvidenceTiming`, `RunId`) reused **by instance**, never redefined; and
  the narrowed `EarlyTerminationOutcome` union composed from
  `run-record.ts`'s existing terminal options (design D1b), with
  byte-identical regeneration of every existing artifact as a hard
  obligation.
- `schemas/early-termination-record/1.0.0.json` generated; one **appended**
  identity-ledger row; README for the new schema directory.
- Conformance additions within the existing L2 nets (corpus set-equality,
  neutrality, strictness, credential-slot scans extend automatically).

### Out of scope

- Writing the records — L4 behavior, under #27.
- Any change to the SHAPE of `evidence-bundle`, `run-record`, or any
  other contract — D1b names `run-record.ts`'s terminal options without
  altering what any existing contract composes, and every existing
  artifact must regenerate byte-identically.
- Persistence location — U11; readers — later landings.

## Affected Areas

| Area | Impact |
|---|---|
| `openspec/changes/runner-early-terminal-record/**` | this change's artifacts |
| `packages/events/**` | new `EarlyTerminationRecord` schema + artifact entry + tests |
| `schemas/early-termination-record/**` | new generated `1.0.0.json` + README |
| `schemas/identity-ledger.json` | one **appended** row; no existing row changes |

## Governance

- **ADR-0003** — provider-neutral structural positions; the record carries
  no provider name structurally.
- **ADR-0006** — the record represents a run that never obtained
  authority; it grants nothing and carries the requested reference as
  data only.
- **ADR-0012** — Zod-authored source, generated JSON Schema, catalog
  dependencies; no new dependency.

The amendment ADDs a requirement to a canonical capability spec via
governed delta. **Depends on U1–U11:** none. No ADR status change.

## Trust / Security / Data Considerations

| Concern | Applies | Note |
|---|---|---|
| authentication or authorization | **yes** | the record documents refusals of unauthorized/unresolvable requests; a fabricated-identity path would launder failed authority — the shape forecloses it |
| PII or encryption | no | identifiers, outcome, timing only |
| public package contracts | **yes** | one new exported contract in events |
| runner / review / materialization machinery | **yes** | completes the refusal-evidence story for the machinery's earliest failures |

Classification follows in `assurance.md`: **trust-critical** (it is
refusal evidence).

## Existing Evidence

- The L4 review verdicts and D11 (the directing decisions).
- `packages/events/src/run-record.ts`, `evidence.ts` — the shared shapes
  reused by instance.
- `schemas/identity-ledger.json` — the append-only ledger this change
  appends to under its existing guards.
- GitHub issue #51 — external authority, recorded in `tasks.md`.

## Dependencies

**Already implemented:** L2 + corrections; L3; the L4 planning seam
(merged via PR #69/#70), whose task 0.1 gates on this change.

**External:** none.

## Success

An early-terminated run leaves a durable, contract-valid record naming
**who asked**, what was requested, how it ended, and when — with
fabricated authority identities and any success claim structurally
inexpressible — and the L4 seam's last 0.1 gate closes.

## Non-Goals

- No writer, reader, or persistence behavior.
- No other contract touched; no ledger row rewritten or removed.
- No representation of partially-acquired authority (proposal EQ1 below).

## Open Questions

**EQ1 and EQ2 were closed** by the repository owner on 2026-08-11
(recorded on PR #71); implementation authorization was deliberately
withheld pending the planning review, and the status stays
`NOT_AUTHORIZED`.

- **EQ1 — minimal versus partial-authority fields. CLOSED: minimal.** The
  record keeps D11's reviewed enumeration. The rejected alternative — an
  optional list of the *execution-authority* identities captured before
  the fault — would add authority-shaped surface to refusal evidence, and
  the failure detail already rides in `outcome.failure.detail`. A record
  for a run that never obtained authority carries nothing
  authority-shaped.
- **EQ2 — package placement. CLOSED: `packages/events`.** Beside the
  run-record family, reusing shared shapes by instance. The rejected
  alternative (`packages/contracts`) would have inverted the events →
  contracts edge for exactly those shapes.

**Raised by the planning review of PR #72**, positions taken above and
requiring confirmation before task 0.1 flips:

- **EQ3 — the requesting principal (trust-relevant).** A refusal that
  cannot say *who* was refused is weak evidence for a household security
  system, and the requester travels with the request, so it exists even
  in `REQUESTED`. This proposal therefore makes `requester` **mandatory**.
  It is distinct from what EQ1 rejected: the requester is not execution
  authority and grants nothing. It is also not the profile-derived agent
  principal — but that distinction is **semantic, not structural**: the
  two shapes are identical, so populating it from the request is an L4
  obligation this change assigns rather than proves (design D1;
  assurance § Traceability). Confirm, or direct omission.
- **EQ4 — narrowing the outcome union.** The record's outcome admits only
  the non-success terminal states, so an authority-less record cannot
  claim success — absent option, not forbidden value (design D1b). The
  cost is naming `run-record.ts`'s terminal options, with byte-identical
  regeneration of every existing artifact as a hard, mechanically proven
  obligation. Confirm, or direct that the full `RunOutcome` be reused
  with the prohibition left behavioral at L4.
- **Authority to mint a new identity.** The owner's #51 confirmation must
  explicitly cover **minting `early-termination-record@1.0.0` as a new
  contract identity**, not merely amending an existing one — inference
  from the corrections precedent is not sufficient (planning review,
  PR #72).
