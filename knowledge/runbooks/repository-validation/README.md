# knowledge/runbooks/repository-validation/

**Module `runbooks/repository-validation`** — how to prove a repository change is
sound, and what each check actually establishes.

| Field | Value |
|---|---|
| Status | `Validated` |
| Owner | human:mikegtech |

> **Specification.** This README is not bundle source; the authored candidate
> beside it is. Not runtime-authoritative: nothing here is packaged, published,
> or resolvable by a running profile. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The ordered validation procedure, and which check to run for which kind of
  change.
- What each check **proves** and what it does not — a green scaffold check says
  nothing about whether the code compiles.
- That a skipped check is reported with its reason, never dropped silently, and
  that the aggregate check exits non-zero when only skips occurred.
- That local evidence does not substitute for the merge gate.
- When a check fails, identify the specific failing mechanism and reason; a
  failure caused elsewhere is not evidence about the property being checked.

## Prohibited facts

- Expected check counts or sample output. Both drift, and quoting them invites an
  agent to report a remembered result instead of a real one.
- Credentials or environment values needed to run anything.

## Intended consumers

Coding runners.

## Expected queries

- "I changed a manifest. Which checks must I run?"
- "`uv` is not installed here. What do I do?"
- "The scaffold check passed. Am I done?"

## Governing sources

[`../../../CONTRIBUTING.md`](../../../CONTRIBUTING.md) ·
[`scripts/README.md`](../../../scripts/README.md)

## Freshness and update trigger

Update when a check is added or removed, or when the reporting obligations
change.
