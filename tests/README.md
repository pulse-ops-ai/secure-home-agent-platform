# tests/

Cross-cutting conformance and scenario tests — the ones that assert **platform
properties**, not the behaviour of a single unit.

> **Status:** the repository has no runtime yet, so the tests that exist assert
> **governance properties** — that the structure, the boundaries, and the gates
> are what the documents claim. The three conformance directories below are
> documented placeholders awaiting the components they test.

## Layout

| Path | Asserts |
|---|---|
| [`test_workspace_scaffold.py`](test_workspace_scaffold.py) | the declared workspace structure exists, and manifests obey the taxonomy and layer map |
| [`test_source_imports.py`](test_source_imports.py) | source **imports** obey dependency direction — separately from what manifests declare |
| [`test_affected_targets.py`](test_affected_targets.py) | CI target selection follows the dependency graph, and governance gates stay unconditional |
| [`test_image_impact.py`](test_image_impact.py) | governed-image semantic impact, transitive closure, fail-closed paths, deterministic Bake plans/cache scopes, workflow skip/build/cancellation construction, and the structural guarantee that every `GLOBAL_BUILD_INPUTS` entry is covered by the outer workflow `paths` perimeter |
| [`test_pr_merge_plan.py`](test_pr_merge_plan.py) | composed-tree PR proof: live-base resolution, `merge(live base, PR head)` composition, deterministic `MERGE_SHA` across a varying ambient clock, base-incorporation-gated previous-head reuse, and end-of-run head/base TOCTOU refusal |
| [`test_secret_scanner.py`](test_secret_scanner.py) | the secret scan has no bypass, and its allowlist fails closed |
| [`test_knowledge_catalog.py`](test_knowledge_catalog.py) | the knowledge registry is coherent, least-context selection is real, and no module content is authored |
| [`workflow_model.py`](workflow_model.py) | *(helper, not a test)* parses `checks.yml` into job sections so "this gate is unconditional" assertions inspect the real job |
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
