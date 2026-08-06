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
workspace scaffolding. There is intentionally **no runtime**.

The ADRs are accepted, so implementation may proceed against them under an
authorizing task contract. **Acceptance is not authorization to deploy**, and it
resolved none of U1–U11. Do not:

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
bash scripts/scan-secrets.sh               # secret-shaped values, all tracked text files
pnpm install --lockfile-only               # TypeScript workspace resolves
pnpm -r --if-present run check             # TypeScript package manifests
```

If a tool is unavailable on your machine, say so in the PR rather than dropping
the check silently.

### The merge gate

[`.github/workflows/checks.yml`](.github/workflows/checks.yml) runs the portable
part of the above on every pull request and on `main`: the scaffold validator,
[`scripts/scan-secrets.sh`](scripts/scan-secrets.sh), the Python workspace (with
`uv sync --locked`), and the TypeScript workspace (with
`pnpm install --frozen-lockfile`).

Two properties of that gate are deliberate and must not be eroded:

- **Every third-party action is pinned to a full commit SHA**, not a moving tag
  like `@v4`. CI is part of the governance boundary; a repointed tag would change
  the code executing in the gate without a change to this repository. Bumps
  arrive as reviewable Dependabot pull requests
  ([`.github/dependabot.yml`](.github/dependabot.yml)).
- **The secret scan has no suppression mechanism except a validated allowlist.**
  It scans every tracked **text** file, including the workflow and the scanner
  itself. Pattern matching cannot read binary content, so the text-only
  assumption is enforced rather than assumed: `validate-scaffold.sh` fails if any
  binary file is tracked. Tracking one requires a reviewed decision that also
  says how it will be checked for embedded credentials.
  There is no file-level exclusion and **no in-line pragma of any spelling** — an
  earlier revision had a sentinel comment that turned out to be a
  repository-wide bypass token, and it is gone. Patterns are assembled from
  fragments so the scanner can scan itself with no exemption at all.
  [`scripts/secret-scan-allowlist.txt`](scripts/secret-scan-allowlist.txt) takes
  `path:line:sha256=<digest> # justification` entries: the digest means no
  credential material is written into the allowlist, and an entry stops applying
  the moment the line changes. Entries under `.github/workflows/`, path-only
  entries, wildcards, stale paths, truncated digests, and missing justifications
  are **rejected in code**, aborting the run before anything is scanned.

**Local evidence does not substitute for it.** Reporting a green run on your own
machine is useful context, but the repository enforces the portable checks
automatically so a later change cannot merge without reproducing them. The two
lockfile-strict flags matter: they fail on a stale `uv.lock` or a
`pnpm-lock.yaml` that no longer matches the manifests, rather than quietly
updating either.

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
- ADR-0001 … ADR-0012 are `Accepted` and **immutable** — the foundational set on
  2026-08-05, ADR-0012 on 2026-08-06. Never edit an accepted ADR; supersede it
  with a new one and update
  [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) in the same change.
- A new ADR starts `Proposed`. **Do not self-accept it**, and **never change any
  ADR's status without an explicit human-acceptance task**; acceptance is a human
  decision made in its own reviewed change.
- Accepting an ADR never resolves anything in
  [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md).
