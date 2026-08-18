# knowledge/runbooks/repository-validation/

**Module `runbooks/repository-validation`** — how to prove a repository change is
sound, and what each check actually establishes.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- The ordered validation procedure, and which check to run for which kind of
  change.
- What each check **proves** and what it does not — a green scaffold check says
  nothing about whether the code compiles.
- That a skipped check is reported with its reason, never dropped silently, and
  that the aggregate check exits non-zero when only skips occurred.
- That local evidence does not substitute for the merge gate.
- What to do when a check fails: read the specific failure, do not re-run hoping.

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
