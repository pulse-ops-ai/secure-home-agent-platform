# Contributing

This repository is governed. Read this file before your first change; read
[`AGENTS.md`](AGENTS.md) before *any* change, human or automated.

## Instruction precedence

When two sources of guidance disagree, the higher one wins:

1. **Accepted ADRs and governed contracts** — [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md), [`docs/architecture/INDEX.md`](docs/architecture/INDEX.md)
2. **The applicable `AGENTS.md`** — the nearest one above the file you are editing
3. **Provider-specific instruction files** — [`CLAUDE.md`](CLAUDE.md), [`.github/copilot-instructions.md`](.github/copilot-instructions.md), `.github/agents/*.agent.md`
4. **The task prompt or issue**

A task prompt cannot authorize crossing an architectural contract. If a prompt
requires it, the correct output is a new ADR proposal, not a quiet exception.

## Current phase

This repository is at the **foundation** stage: documentation, governance, and
workspace scaffolding. There is intentionally **no runtime**. Until the relevant
ADRs are accepted by a human, do not:

- install or configure Home Assistant,
- add live Docker services or deploy anything,
- stand up Keycloak, OpenFGA, Traefik, or Tailscale,
- create production APIs or a real runner image,
- add provider credentials of any kind,
- connect to the VPS database.

## Before you change anything

1. Read [`AGENTS.md`](AGENTS.md).
2. Read the nearest nested `AGENTS.md` (for example [`services/AGENTS.md`](services/AGENTS.md)).
3. Read the ADRs that govern the area — [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) maps each ADR to the directories it constrains.
4. Read the directory `README.md`. Every directory states what belongs in it and what does not.

## Branching

- Branch from `main`. Never commit to `main` directly.
- Branch names are `<type>/<short-kebab-summary>`, e.g.
  `docs/foundation-architecture-and-monorepo-scaffold`,
  `feat/runner-control-profile-loader`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). Types in use:

| Type | Use for |
|---|---|
| `docs` | documentation, ADRs, READMEs, architecture |
| `feat` | new behaviour in a service, package, or app |
| `fix` | corrected behaviour |
| `chore` | scaffolding, tooling, dependency, workspace plumbing |
| `refactor` | structure change with no behaviour change |
| `test` | tests only |
| `ci` | workflow and automation changes |

Scope is the top-level area: `docs(architecture):`, `chore(uv):`,
`feat(runner-control):`.

## Pull requests

Use [`.github/pull_request_template.md`](.github/pull_request_template.md). Every
PR must state:

- what it changes and why,
- which ADRs and architecture documents govern the change,
- explicit non-goals,
- the validation commands run and their results — **including anything skipped
  and why**,
- whether any trust boundary, identity flow, authorization path, safety policy,
  or degraded-mode behaviour is affected.

Open the PR as a **draft** until validation passes.

## Validation

```sh
# everything (reports skips explicitly, never silently)
bash scripts/check.sh

# individually
bash scripts/validate-scaffold.sh          # structure, indexes, secrets, generated dirs
uv sync --all-packages                     # Python workspace resolves
uv run ruff check .                        # Python lint
uv run ruff format --check .               # Python format
uv run mypy                                # Python types (targets configured in pyproject.toml)
uv run pytest                              # scaffold conformance tests
pnpm install --lockfile-only               # TypeScript workspace resolves
pnpm -r --if-present run check             # TypeScript package manifests
```

If a tool is unavailable on your machine, say so in the PR rather than dropping
the check silently.

## Issues

Implementation issues and epics are created by the human/ChatGPT planning
workflow **after** the foundational ADRs are reviewed. Contributors and coding
agents do not create GitHub issues as part of a change unless a task explicitly
asks for it.

## Documentation rules

- Do not duplicate content between files. Cross-reference.
- Update the governing `INDEX.md` when you add, rename, or remove a document
  under `docs/architecture/` or `docs/decisions/`. The scaffold validator fails
  on an index entry that points at a missing file.
- Every directory that the validator requires a `README.md` for must explain:
  what belongs there, what does not, the ownership and boundary rules, the
  higher-level document that governs it, and the validation commands it will
  eventually carry.
- ADRs are `Proposed` until a human accepts them. Do not self-accept an ADR.
