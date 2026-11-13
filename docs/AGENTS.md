# AGENTS.md — `docs/`

Current governance state is not authored here. Use [the canonical registry](../governance/state.json),
[its generated projection](../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

Scoped rules for documentation. Inherits everything from
[`../AGENTS.md`](../AGENTS.md); this file adds only what is specific to `docs/`.

## Before editing

1. Read [`../AGENTS.md`](../AGENTS.md).
2. Read [`decisions/INDEX.md`](decisions/INDEX.md) — it maps each ADR to the
   directories it governs.
3. Read [`architecture/INDEX.md`](architecture/INDEX.md).

## Rules

- **`decisions/` records why; `architecture/` records what follows.** If they
  disagree, the ADR wins and the architecture document is the defect to fix.
- **Do not edit an accepted ADR.** Query canonical governance for current
  lifecycle. Supersede terminal decisions rather than editing their bodies.
- **Architecture does not authorize implementation.** The bootstrap bridge
  evidence is historical, not reusable permission. Compiler/lint work follows
  its own bounded task contracts and prerequisites, not a status copy here.
- **Do not change any ADR's status without an explicit human-acceptance task.** A
  new ADR starts `Proposed` and is accepted by a human in its own reviewed
  change. Changing a status line is not a documentation fix.
- **Do not resolve an unresolved decision.** Anything in
  [`architecture/unresolved-decisions.md`](architecture/unresolved-decisions.md)
  leaves that file only via a **new** ADR — never by writing a paragraph that
  picks an answer, and never as a consequence of the foundational set having been
  accepted.
- **Update the index in the same change.** Adding, renaming, or removing a file
  under `architecture/`, `decisions/`, or `operations/` requires updating that
  folder's `INDEX.md`. The validator fails otherwise.
- **Do not copy upstream architecture text.** This repository adopts by pinned
  reference ([ADR-0001](decisions/ADR-0001-adopt-security-first-architecture.md)).
  Link instead.
- **Mark unimplemented things as unimplemented — and implemented things as
  implemented.** Parts of `architecture/` now describe landed code: the runner
  contracts, `runner-core`, and `runner-control`'s L4 orchestration. Other parts
  describe a target that does not exist, including the launcher, L9 enforcement,
  and any deployed runtime. Neither claim may be made in the present tense
  without being true; see the Status table in
  [`architecture/INDEX.md`](architecture/INDEX.md).
- **No secrets, real device identifiers, tailnet addresses, or household member
  names** — including in runbooks and examples.
- **Cross-reference; do not duplicate.** Two copies of a rule become two
  different rules.

The tooling scopes have distinct authorization prerequisites (`INV-TS7-17`).
PR-B requires the exact post-PR-A2 main and a separate Scope-1 task contract.
PR-C requires PR-B merged with accepted parity evidence, a fresh Scope-2
review and authorization, and the then-current post-PR-B main, never the PR-B
base. Query canonical governance for current program answers.

## Adding an ADR

1. Next free number, never reuse one.
2. Filename `ADR-NNNN-short-title.md`.
3. Status `Proposed`, dated.
4. Include all required sections: context, decision, consequences, alternatives
   considered, security implications, availability implications, validation and
   follow-up obligations, links.
5. Add it to [`decisions/INDEX.md`](decisions/INDEX.md) — both the table and the
   "which ADRs apply" mapping.
6. Alternatives must be real ones that a reasonable engineer would have chosen,
   with the actual reason for rejection.

## Validation

```sh
bash scripts/validate-scaffold.sh
```

Checks that both indexes are complete and that every referenced document exists.
