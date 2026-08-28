# docs/

All governed documentation for this repository.

## What belongs here

- **[`architecture/`](architecture/)** — how the system is shaped and why it is
  constrained the way it is. Entry point: [`architecture/INDEX.md`](architecture/INDEX.md).
- **[`decisions/`](decisions/)** — Architecture Decision Records. Entry point:
  [`decisions/INDEX.md`](decisions/INDEX.md).
- **[`operations/`](operations/)** — runbooks and operational procedures for the
  people who run the Pi. Entry point: [`operations/INDEX.md`](operations/INDEX.md).

## What does not belong here

- **Product narrative for a first-time reader** — that is the root
  [`README.md`](../README.md).
- **Rules for agents** — those are [`AGENTS.md`](../AGENTS.md) and the nested
  `AGENTS.md` files.
- **Directory-scoped rules** — those live in that directory's `README.md`.
- **Implementation notes for a single service** — those belong in the service's
  own README.
- **Copies of upstream architecture documents.** This repository adopts the
  upstream contract by pinned reference and does not vendor it
  ([ADR-0001](decisions/ADR-0001-adopt-security-first-architecture.md)).
- **Secrets, real device identifiers, household member details, or network
  addresses.** Ever.

## Ownership and boundary rules

- `decisions/` records **why**; `architecture/` records **what follows**. When
  they disagree, the ADR wins and the architecture document is the defect.
- An accepted ADR is immutable. Reverse it with a superseding ADR.
- **ADR-0001 … ADR-0020 are `Accepted`** and immutable (foundational set
  2026-08-05; ADR-0012 2026-08-06; ADR-0017 and ADR-0018 2026-08-17; ADR-0019
  2026-08-21; ADR-0020 2026-08-26). A new ADR
  starts `Proposed`; acceptance is a human decision, never an agent's.
- Both `architecture/` and `decisions/` are index-validated: every file must be
  in its `INDEX.md`, and every index entry must point at a file that exists.
  [`scripts/validate-scaffold.sh`](../scripts/validate-scaffold.sh) enforces
  this.
- Nothing in [`architecture/unresolved-decisions.md`](architecture/unresolved-decisions.md)
  may be resolved by a documentation edit. Resolving one requires an ADR.

## Governed by

[`../AGENTS.md`](../AGENTS.md), then [`AGENTS.md`](AGENTS.md) in this directory.

## Validation

```sh
bash scripts/validate-scaffold.sh   # index integrity, required files, link targets
```

Future: Markdown link checking, Mermaid render validation, and a check that no
document describes an unimplemented component in the present tense without
marking it.
