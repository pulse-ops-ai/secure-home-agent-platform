# knowledge/platform/workspace-conventions/

**Module `platform/workspace-conventions`** — how the workspace is assembled and
how changes are landed.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The dependency-governance triad and what each part owns: **pnpm catalogs** hold
  canonical versions, **Syncpack** enforces manifest policy, the **lockfile** is
  the resolved graph. None of them sees import direction.
- Branch naming (`<type>/<short-kebab-summary>`), Conventional Commits with a
  scope, never committing to `main`, and opening pull requests as drafts until
  validation passes.
- That every check that was skipped must be reported, with the reason.
- That CI actions are pinned to full commit SHAs, and why a moving tag is not
  acceptable in a governance boundary.

## Prohibited facts

- Specific pinned versions. They change; the lockfile and catalog are
  authoritative and an agent can read them.
- Command output or check counts.

## Intended consumers

Coding runners.

## Expected queries

- "Which command do I run after changing a manifest?"
- "May I commit directly to `main`?"
- "A check could not run. Do I still report it?"

## Governing sources

[ADR-0012 §19](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) ·
[`../../../CONTRIBUTING.md`](../../../CONTRIBUTING.md) ·
[`scripts/README.md`](../../../scripts/README.md)

## Freshness and update trigger

Update when the governance triad, the branch or commit convention, or the
merge-gate model changes.
