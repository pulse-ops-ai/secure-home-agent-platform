# docs/

Current governance state is not authored here. Use [the canonical registry](../governance/state.json),
[its generated projection](../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

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
- Current decision lifecycle and implementation prerequisites are queried
  from canonical governance. Historical acceptance records and bridge evidence
  do not authorize new implementation. A new decision starts as a proposal;
  the human transition is separate from documentation authoring.
- Both `architecture/` and `decisions/` are index-validated: every file must be
  in its `INDEX.md`, and every index entry must point at a file that exists.
  [`scripts/validate-scaffold.sh`](../scripts/validate-scaffold.sh) enforces
  this.
- Nothing in [`architecture/unresolved-decisions.md`](architecture/unresolved-decisions.md)
  may be resolved by a documentation edit. Resolving one requires an ADR.

The tooling scopes have distinct authorization prerequisites (`INV-TS7-17`).
PR-B requires the exact post-PR-A2 main and a separate Scope-1 task contract.
PR-C requires PR-B merged with accepted parity evidence, a fresh Scope-2
review and authorization, and the then-current post-PR-B main, never the PR-B
base. Query canonical governance for current program answers.

## Governed by

[`../AGENTS.md`](../AGENTS.md), then [`AGENTS.md`](AGENTS.md) in this directory.

## Validation

```sh
bash scripts/validate-scaffold.sh   # index integrity, required files, link targets
```

Future: Markdown link checking, Mermaid render validation, and a check that no
document describes an unimplemented component in the present tense without
marking it.
