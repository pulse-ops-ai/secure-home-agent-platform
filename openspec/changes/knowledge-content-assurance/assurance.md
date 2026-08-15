# Assurance Plan: knowledge-content-assurance

> **PROPOSED and NON-OPERATIVE.** ADR-0016 is `Proposed`; the invariants below
> describe what it would establish.

## Purpose

Establish that the corrected assurance model is honest by class, stays
fail-closed, and cannot let an attestation become either a waiver or an
authority.

## Risk Classification

`low` for what lands, `high` for what it corrects.

Nothing executable ships. But this change alters a **security claim** in an
accepted ADR, and the failure mode it corrects — a control believed automatic
and absent — is the more dangerous half of the pair. Getting the replacement
wrong would substitute a second false comfort for the first.

## Critical Invariants

| ID | Invariant | Class |
|---|---|---|
| CA-INV-01 | The prohibited-content LIST is unchanged; no class is narrowed or removed | trust |
| CA-INV-02 | Coverage is stated by class as A / B / C, and a **B** detector is never described, named, or registered as covering its class | trust |
| CA-INV-03 | A deterministic finding refuses admission, and a valid attestation NEVER overrides one | trust |
| CA-INV-04 | A missing, stale, or wrong-policy attestation refuses admission — the gate is fail-closed by both mechanisms | trust |
| CA-INV-05 | The attestation binds to exact bytes via ADR-0015 §6's identity, lives outside the bytes it attests, and is invalidated by any byte change | behavior |
| CA-INV-06 | The attestation is NOT OKF `verified`, and confers no authority — ADR-0015 §10 applies to it unchanged | trust |
| CA-INV-07 | No classifier, model, or network call participates in admission | trust |
| CA-INV-08 | The machine proves an attestation EXISTS and is BOUND. It does not prove the human interpreted the prose correctly, and `human:<id>` is not a signature | trust |
| CA-INV-09 | The platform-only rollout is risk reduction, not a claim that platform prose is decidable | trust |

## State-Space Model

| Deterministic finding | Attestation | Outcome |
|---|---|---|
| present | valid | REFUSE |
| present | missing | REFUSE |
| absent | missing | REFUSE |
| absent | stale / wrong policy | REFUSE |
| absent | valid and bound | eligible to continue |

Four of five cells refuse. Stating the table is the point: the single eligible
cell is the one an implementation could otherwise reach by accident.

## Proof Obligations

| ID | Invariant | Class | Proof |
|---|---|---|---|
| CA-EX-01 | CA-INV-01 | structural | ADR-0016 restates the list and removes nothing |
| CA-EX-02 | CA-INV-02 | structural | the per-class table names, for each B detector, what it does not establish |
| CA-EX-03 | CA-INV-03 | deferred, executable | dominance test: finding + valid attestation → refuse |
| CA-EX-04 | CA-INV-04 | deferred, executable | missing, stale, and wrong-policy attestation each refuse |
| CA-EX-05 | CA-INV-05 | deferred, executable | one byte changed after review → digest mismatch → refuse |
| CA-EX-06 | CA-INV-06 | structural | ADR-0016 §4 states why `verified` is not reused and confines the artifact to the knowledge plane |
| CA-EX-07 | CA-INV-07 | deferred, structural | admission has no model or network dependency |
| CA-EX-08 | CA-INV-08 | structural | ADR-0016 §5 states the limits of what the machine proves |
| CA-EX-09 | CA-INV-02 | review | no test is registered as class proof when it establishes an indicator |

## Verification Strategy

Structural for this landing. **Every executable obligation is deferred** to the
toolchain landing and marked so above — a decision cannot prove a behaviour it
has not built, and the previous overclaim came from exactly that confusion.

**Deliberately not automated.** CA-INV-08: no validator can check whether a human
read carefully. Naming that limit is the honest alternative to implying it.

## Review Plan

Owner review. The two things worth most attention: whether the dominance rule is
airtight, and whether the coverage table is honest — a **B** described as an
**A** anywhere would reproduce the defect being corrected.

## Rollout and Rollback

`not_applicable` with reason: decision material only, no runtime surface.
Rollback is reverting the commit.

## Assurance Completeness

**Requirements lacking proof:** the executable ones, named above with the landing
that will prove them.

**Known gap, stated rather than hidden.** The semantic classes rest on human
review, which is fallible. That is a true statement where the previous
arrangement was a false one. If the toolchain landing finds that even the A and B
detectors cannot be built as described, the correct output is another
falsification report — not a quietly widened detector.
