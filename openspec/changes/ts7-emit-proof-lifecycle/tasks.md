# Implementation Tasks: TS7 emit proof lifecycle

## Implementation Authorization

This records external authority; OpenSpec artifacts cannot create it.

| Field | Value |
|---|---|
| Source type | `user_task` |
| Source | User instruction dated 2026-09-16, beginning “PR #126 is frozen at: 7309acb17e8e8d4a855d25c4d24317f621692b82” |
| Authorized scope | Prepare and implement this separate proof-lifecycle correction, hostile proof, and own draft PR; stop for independent review |
| Constraints | All ten required semantics and protected paths recorded in proposal; no merge, no TS6 evidence rewrite, no alternate compiler-maintenance path |
| Owner | Repository user |
| Recorded base | `5447e78fa9d63ce2c20ea8de81a1cd321bdf9b6a` |

**AUTHORIZED** for this correction only. The project-default
`governed-spec-driven-v1` applies; this is a new corrective change, not another
implementation epoch of the archived v2 migration. No independent review or
merge authorization is inferred from these artifacts.

## Tasks

- [x] **1.1 Inspect contracts before implementation.** Record `REQ-TC-002`,
  delivered TS7 assurance/D13/D14/D18, and ADR-0022 interpretation in design.md.
- [x] **1.2 Correct the proof lifecycle with its hostile net.** Implement
  historical integrity and bound replay; replace only false-freeze invocations.
  Prove INV-EL-01/02/03/05 through EX-EL-01, ADV-EL-01/02, MUT-EL-01, PROP-EL-01.
- [x] **1.3 Prove maintenance separation.** Drive MUT-EL-02 and run existing
  predecessor-bound hostile tests (INV-EL-04).
- [x] **1.4 Validate and prepare the draft handoff.** Record actual commands,
  output, skipped checks, evidence identities, scope exclusions, and promotion
  result in [verification.md](verification.md). Open the separate draft as the
  final handoff; its URL comes from GitHub rather than a predicted issue number.
- [ ] **1.5 Independent review.** Remains external; stop after draft creation.

## Completion boundary

Implementation, validation, and draft preparation may complete under the user
task. Merge and validated specification sync/archive require review and are not
performed here. Canonical specs and the delivered migration archive stay intact.

## Related

- [Proposal](proposal.md)
- [Design](design.md)
- [Assurance](assurance.md)
