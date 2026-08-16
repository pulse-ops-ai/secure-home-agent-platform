# Design: knowledge-content-assurance

> **PROPOSED and NON-OPERATIVE.** ADR-0016 is `Proposed`.

## Context

The 2B implementation obligation could not be discharged as accepted. Four of
seven prohibited-content classes are not decidable over free-form Markdown, and
two more only as bounded subsets. The policy is right; the assurance claim about
it was wrong.

## Goals

- Make the claim true without narrowing the policy.
- Keep the gate fail-closed.
- Name blind spots where a reviewer can see them.

## Non-Goals

- Any production code. Any detector. Opening authoring.
- Household typed-fact schemas — named as direction, not designed.

## Current Architecture

ADR-0010 §5 and ADR-0015 §8 assert full machine-checking. ADR-0015 §12 requires a
negative case per class before authoring opens. No implementation exists.

## Proposed Architecture

```text
source bytes
     │
     ▼
deterministic detectors ── A: structurally complete
     │                     B: indicator, bounded, blind spot NAMED
     │  finding? ──────────────────────────► REFUSE
     ▼  none
attestation check  ── policy version · actor · sourceDigest (ADR-0015 §6)
     │  missing / stale / wrong policy ────► REFUSE
     ▼  valid and bound
eligible to continue — remaining admission rules still apply
```

## Decisions

### D1: Correct the claim, not the policy

Narrowing the prohibited list to fit the mechanism would invert the
relationship between policy and enforcement. The list stands; the statement
about how it is established changes.

### D2: Three evidence kinds, and B is never called complete

The overclaim this change corrects is the same defect as a lexical proxy
registered as structural proof. Naming **B** explicitly, with its blind spot
written down, is what stops it recurring — a detector improved without updating
the coverage table re-creates the overclaim in miniature.

### D3: The attestation is a repository artifact, not OKF `verified`

Different question, producer-controlled, and reusing it would couple an admission
decision to an upstream vocabulary whose meaning OKF leaves open. A v0.2 change
to `verified` would become an admission change.

### D4: Binding, and where the attestation lives

Inside the module, the digest is self-referential: writing the attestation
changes the bytes it certifies. So it lives in the catalog, which ADR-0015 §5a
already makes the metadata authority. `sourceDigest` reuses ADR-0015 §6's
manifest rather than inventing a second identity, because two algorithms diverge.

### D4b: There are no A classes, and that is the result

Media was drafted **A** and is **B**. Arbitrary bytes fit inside Markdown as
base64 or hex, and an opaque URL carries no content hint, so the detector is
useful without being complete. **A** is a capability of a mechanism, not a quota
to fill; inventing one to populate the taxonomy would reproduce the overclaim
being corrected.

### D4c: Two proofs, because an identifier is not an action

The toolchain can prove the artifact exists, is shaped correctly, names a
recognized policy, and binds to exact bytes. It cannot prove a person reviewed
anything — `by: human:<id>` is a string a producer writes. Reviewer authenticity
is repository-governance evidence, established at the workflow boundary, and
this repository has no machine-checkable signal for it today. Publication stays
blocked until it does, and admission gains no network or model dependency.

### D4d: Two gates, because the U7 lesson is one landing old

Representing the household block by leaving `blockedByToolchain: true` would make
one variable mean two facts — the exact defect the U7 migration removed.
`blockedByRollout` is a separate per-entry boolean. Runbooks are allowlisted
individually rather than by directory, so filing a household runbook under
`runbooks/` cannot make it eligible.

### D5: Dominance, stated as a table

The row that matters is *finding present + attestation valid → REFUSE*. Without
it the attestation becomes a waiver, and the deterministic detectors become
advisory — which is the failure mode this whole correction exists to avoid.

## Decision Tables

| Class | Kind | Machine establishes | Blind to |
|---|---|---|---|
| camera media, recordings | **B** | non-`.md` member, media `data:` URI, media reference | base64/hex bytes inside Markdown; opaque URLs |
| secrets, credentials | B | PEM, JWT, known prefixes, high-entropy values | prose credentials |
| authorization tuples | B | tuple shapes, grant-shaped keys | prose authority |
| live state / readings | C | nothing | specification vs observation |
| presence / occupancy | C | nothing | — |
| mutable automation state | C | nothing | — |
| raw personal telemetry | C | nothing | prose telemetry |

## Interfaces and Contracts

No code interface. The contract surfaces are ADR-0016 and, later, the toolchain's
coverage table kept with the code.

## Failure Classification Boundaries

A deterministic finding is an **admission** failure. A missing or stale
attestation is an **admission** failure. A reviewer missing a prose fact is a
**review** failure, named as residual risk rather than hidden.

## Shared vs Independent Logic

`sourceDigest` is shared with ADR-0015 §6 by construction, not by convention.

## Compatibility and Migration

No migration; nothing is authored. No accepted ADR is edited.

## Security Implications

A control believed automatic and absent is more dangerous than one known to be
human and recorded. Dominance, byte binding, and policy versioning carry the
posture; the residual risk is named.

## Landing Seams

This landing: the corrected decision. The next: the toolchain against §9's
corrected obligation. Neither opens authoring.

## Open Questions

Household typed-fact models — direction recorded, design deferred.
