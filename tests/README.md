# tests/

Cross-cutting conformance and scenario tests — the ones that assert **platform
properties**, not the behaviour of a single unit.

> **Status:** one real test exists,
> [`test_workspace_scaffold.py`](test_workspace_scaffold.py), which asserts that
> the declared workspace structure actually exists. The three conformance
> directories are documented placeholders.

## Layout

| Path | Asserts |
|---|---|
| [`profile-conformance/`](profile-conformance/) | that an execution profile grants exactly what it declares — and that an omitted grant **denies** |
| [`framework-conformance/`](framework-conformance/) | that every adapter emits an identical event and evidence contract |
| [`policy-scenarios/`](policy-scenarios/) | authorization, safety policy, degraded mode, and path equivalence |

## What belongs here

- Tests that span more than one component.
- Tests that assert a rule from an ADR.
- Tests that assert repository structure and workspace validity.

## What does not belong here

- **Unit tests for a single service or package.** Those live with their code.
- **Tests requiring live infrastructure.** No Home Assistant, no OpenFGA
  deployment, no VPS connection, no network. Tests here run offline.
- **Tests requiring credentials.**
- **Fixtures containing real device identifiers or household data.**

## Ownership and boundary rules

1. **Test the denial paths.** A test suite that only proves the happy path
   proves nothing about a security control. Every control needs a test that it
   **refuses**.
2. **Every ADR with a validation obligation earns a test.** The obligations are
   listed in each ADR under "Validation and follow-up obligations".
3. **Offline and deterministic.** No network. A flaky security test gets
   disabled, and a disabled security test is worse than none.
4. **No secrets in fixtures**, including realistic-looking fakes.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`../docs/decisions/INDEX.md`](../docs/decisions/INDEX.md).

## Validation

```sh
uv run pytest
```
