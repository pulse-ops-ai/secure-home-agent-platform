# Assurance Plan: <change-name>

## Purpose

This artifact defines how the accepted specification and design will be proven
before the change is considered complete.

It does not create new product requirements.

It answers:

> Have we modeled enough of the behavior, state space, and failure surface to
> implement and review this change safely?

---

## Risk Classification

**Risk:** `low | medium | high | trust-critical`

### Rationale

Explain the classification using concrete characteristics.

Consider:

- authorization/authentication;
- PII/encryption;
- persistence/migrations;
- transactions/concurrency;
- public contracts;
- review/runner machinery;
- materialization;
- candidate/evidence binding;
- reconciliation/readiness authority;
- infrastructure security boundaries.

## Critical Invariants

Each invariant must have a stable ID.

| ID | Invariant | Class |
|---|---|---|
| INV-001 | <must always hold> | behavior / trust / data / compatibility |
| INV-002 | <must always hold> | ... |

Examples of appropriate invariants:

```text
Operational failure can never become a candidate finding.

Every required obligation must receive one terminal disposition.

The bytes verified must be the bytes rendered.

Deduplication may reduce byte accounting but never obligation identity.