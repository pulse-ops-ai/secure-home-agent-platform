# AGENTS.md — `docs/`

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
- **Do not accept an ADR.** Every ADR is `Proposed` until a human accepts it in
  a separate reviewed change. Changing a status line is not a documentation fix.
- **Do not edit an accepted ADR.** Supersede it with a new one.
- **Do not resolve an unresolved decision.** Anything in
  [`architecture/unresolved-decisions.md`](architecture/unresolved-decisions.md)
  leaves that file only via an ADR — never by writing a paragraph that picks an
  answer.
- **Update the index in the same change.** Adding, renaming, or removing a file
  under `architecture/`, `decisions/`, or `operations/` requires updating that
  folder's `INDEX.md`. The validator fails otherwise.
- **Do not copy upstream architecture text.** This repository adopts by pinned
  reference ([ADR-0001](decisions/ADR-0001-adopt-security-first-architecture.md)).
  Link instead.
- **Mark unimplemented things as unimplemented.** Nothing described in
  `architecture/` exists yet. Do not write about it in the present tense without
  saying so.
- **No secrets, real device identifiers, tailnet addresses, or household member
  names** — including in runbooks and examples.
- **Cross-reference; do not duplicate.** Two copies of a rule become two
  different rules.

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
