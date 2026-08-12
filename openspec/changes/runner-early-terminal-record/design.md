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
  requester: Principal,
  requested_profile: ProfileRef.nullable(),
  outcome: EarlyTerminationOutcome,
  timing: EvidenceTiming,
})
```

Authored in `packages/events` beside `run-record` (EQ2): it is a terminal
record, not authority. Shared shapes are the existing instances —
`RunId`, `Principal`, `EvidenceTiming`, and contracts' `ProfileRef` —
reused by instance per the D2 discipline; no second definition exists
anywhere.

`requester` is the identity that ASKED for the run, with its actor or
explicit autonomous marker (EQ3). It is deliberately not the evidence
bundle's `principal`, which is the profile-derived agent identity a run
authenticates as — that identity does not exist for a run whose profile
never resolved. Reusing the `Principal` shape is exact (an identity plus
an actor-or-autonomous marker) while the field name keeps the semantics
honest. Recording it is what lets a refusal say **who** was refused
without any authority having been established; the requester travels with
the request, so it is available in `REQUESTED`.

`requested_profile` is `ProfileRef | null`: the null is the explicit
"request named nothing" marker (the ADV-001 case), mirroring the
autonomous marker — absence is stated, never implied.

### D1b: The outcome union is narrowed — success is absent, not forbidden

`EarlyTerminationOutcome` admits only the non-success terminal states
(`REFUSED`, `OPERATIONAL_FAILURE`, `CANCELLED`, `TIMED_OUT`,
`INDETERMINATE`). A record for a run that never obtained authority
therefore **cannot** claim the success state — the option is absent from
the union, not merely disallowed by a rule a later reader must know
(EQ4). This is the platform's established posture: gate dispositions,
network default-deny, and the launch assertion's secret-presence literal
all make the illegal case unrepresentable rather than refused by
convention.

Mechanism, without duplicating any vocabulary: the six terminal options
in `run-record.ts` are extracted into named constants; `RunOutcome`
continues to compose all six **in the same order**, and
`EarlyTerminationOutcome` composes the five non-success ones from the
same option instances. `TerminalState`/`TERMINAL_SUCCESS` are untouched,
and the obligation is explicit — `run-record@1.0.0`,
`evidence-bundle@2.0.0`, and `run-event@1.0.0` must regenerate
**byte-identically**, which the existing drift suite proves mechanically
(ET-INV-04).

Rejected: leaving the full union and relying on L4 never assigning
success — that is exactly the convention-guarded posture the ratified
contract replaces, and it would let a structurally valid record claim
success with no authority and no bundle.

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
| every other contract | unchanged | unchanged, and **byte-identical** — a hard obligation because D1b touches `run-record.ts`'s internals without changing any composed shape |

## Security Implications

- Refusal evidence exists for the earliest failure class; the
  fabricated-authority laundering path D11 prohibited is foreclosed by
  absent fields.
- No credential-adjacent surface; the scans extend over the new corpus
  member automatically.

## Open Questions

**Closed** by the repository owner on 2026-08-11 (recorded on PR #71),
confirming the decisions D1 already takes: **EQ1 — minimal** (D11's
enumeration only; no partial-authority *execution-authority* listing) and
**EQ2 — `packages/events`**. No design change followed from either.

**Open**, raised by the planning review of PR #72 and answered above with
positions taken:

- **EQ3 — the requesting principal (trust-relevant).** D1 adds a
  mandatory `requester`, because a refusal that cannot say who was
  refused is weak evidence for a household security system, and the
  requester is available at request time. EQ1 rejected partial
  *execution-authority* identities, which is a different thing — the
  requester is not authority and grants nothing. Confirm, or direct
  omission.
- **EQ4 — narrowing the outcome union.** D1b makes the success state
  absent from this contract's outcome union so an authority-less record
  cannot claim success, at the cost of extracting the terminal options in
  `run-record.ts` (with byte-identical regeneration of every existing
  artifact as a hard obligation). Confirm, or direct that the full
  `RunOutcome` be reused with the prohibition left behavioral at L4.

Implementation authorization remains withheld pending the planning
review and the owner's explicit authority confirmation.
