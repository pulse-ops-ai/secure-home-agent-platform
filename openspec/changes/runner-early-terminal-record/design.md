# Design: runner-early-terminal-record

## Context

The L4 review's D11 split the evidence obligation at `PROFILE_RESOLVED`:
full bundles at/after it, a governed refusal record for terminals in
`REQUESTED`. This change supplies that contract. It is deliberately the
smallest possible amendment: one new contract, one ADDED requirement,
shared shapes reused by instance, one appended ledger row.

Governing material: the canonical `runner-evidence` spec; the merged L4
seam's D11 and `runner-lifecycle` early-terminal requirement; the archived
`runner-domain-contracts` design (D2 shared-primitives discipline, D5
identity ledger); ADR-0003/0006/0012.

## Goals

- Durable refusal evidence for pre-authority terminals (INV-003 closed for
  the earliest failures).
- Fabricated authority structurally inexpressible — absent fields, not
  forbidden values.
- Zero disturbance to every existing contract, guard, and ledger row.

## Non-Goals

- No writer/reader behavior (L4/#27 and later landings).
- No partial-authority representation (proposal EQ1 keeps D11's minimal
  enumeration; the failure detail rides in `outcome.failure.detail`).

## Decisions

### D1: One minimal contract, in the events run-record family

```ts
export const EarlyTerminationRecord = z.strictObject({
  contract_id: z.literal('early-termination-record'),
  contract_version: z.literal('1.0.0'),
  run_id: RunId,
  requested_profile: ProfileRef.nullable(),
  outcome: RunOutcome,
  timing: EvidenceTiming,
})
```

Authored in `packages/events` beside `run-record` (EQ2): it is a terminal
record, not authority. Shared shapes are the existing instances —
`RunId`, `RunOutcome` (the discriminated union whose only success is
`COMPLETED`, which the L4 lifecycle never assigns to an early terminal),
`EvidenceTiming`, and contracts' `ProfileRef` — reused by instance per the
D2 discipline; no second definition exists anywhere.

`requested_profile` is `ProfileRef | null`: the null is the explicit
"request named nothing" marker (the ADV-001 case), mirroring the
principal's explicit autonomous marker — absence is stated, never
implied.

Rejected: widening `run-record` with optional fields — it would make the
full record's mandatory evidence optional, weakening the stronger
contract to serve the weaker case. Rejected: an L4-private shape — refusal
evidence is platform contract, not service internals.

### D2: Exclusivity by contract identity, enforced behaviorally at L4

Exactly one of `run-record` or `early-termination-record` per run. The
shapes themselves cannot express cross-document exclusivity; the
requirement makes it normative, L4's lifecycle owns it behaviorally (a
terminal in `REQUESTED` writes only this record; every later terminal
seals the full bundle), and readers distinguish by `contract_id`.

### D3: Corpus mechanics exactly as the corrections established

New identity `early-termination-record@1.0.0`: generated to
`schemas/early-termination-record/1.0.0.json` with an exact-version `$id`,
one **appended** ledger row (the historical guard proves no rewrite), a
README for the new schema directory, and automatic inclusion in the
corpus set-equality, neutrality, strictness, and credential-slot scans.
Corpus grows 10 → 11 identities.

## Interfaces and Contracts

| Contract | Before | After |
|---|---|---|
| `early-termination-record` | — | `1.0.0` (new) |
| every other contract | unchanged | unchanged, byte-identical |

## Security Implications

- Refusal evidence exists for the earliest failure class; the
  fabricated-authority laundering path D11 prohibited is foreclosed by
  absent fields.
- No credential-adjacent surface; the scans extend over the new corpus
  member automatically.

## Open Questions

EQ1 (minimal vs partial-authority fields) and EQ2 (events placement) are
stated in `proposal.md`; both assumed as decided above and requiring
confirmation at the planning review.
