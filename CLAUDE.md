# CLAUDE.md — Claude Code adapter

You are working in **`secure-home-agent-platform`**: a local-first, security-first
platform for household agents.

> **This file is an adapter, not the contract.** The contract is
> [`AGENTS.md`](AGENTS.md) plus the accepted ADRs. If anything here conflicts
> with either, **follow them, not this file.** Everything in `AGENTS.md` applies
> to you — architecture, safety constraints, scope, evidence, git conventions —
> and is not repeated here.

## Read before you edit

Do this in order, and stop when you have enough. Do not read the repository
exhaustively.

1. [`AGENTS.md`](AGENTS.md) — the contract, including the precedence rules.
2. [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) — go straight to the
   *"which ADRs apply to what I am changing?"* table and read the ADRs it names.
   **This is required before any change, not a nice-to-have.**
3. The nearest nested `AGENTS.md` above your target file (see below).
4. The `README.md` of the directory you are editing.

## Choosing the nested `AGENTS.md`

Walk up from the file you are about to change and use the **first** `AGENTS.md`
you find. That one wins for its subtree; the root governs everything else.

```
services/control-plane/package.json    →  services/AGENTS.md   →  AGENTS.md
agents/adapters/codex/README.md        →  agents/AGENTS.md     →  AGENTS.md
docs/architecture/degraded-mode.md     →  docs/AGENTS.md       →  AGENTS.md
openspec/changes/foo/tasks.md          →  openspec/AGENTS.md   →  AGENTS.md
scripts/validate-scaffold.sh           →  (none)               →  AGENTS.md
```

Editing files under two subtrees means reading both nested files.

## Commands to run before modifying files

Orient first, cheaply:

```sh
git status --short
git branch --show-current          # must NOT be main
bash scripts/validate-scaffold.sh  # know the baseline before you change it
```

Knowing whether the scaffold was already failing matters: otherwise you cannot
tell whether you broke it.

After changing files, run what your change touched:

| You changed | Run |
|---|---|
| any file added/moved/removed | `bash scripts/validate-scaffold.sh` |
| TypeScript anywhere — `services/`, `apps/`, `packages/` | `pnpm install --frozen-lockfile` then `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |
| Python — only the admitted inference boundary under `services/workers/` | `uv sync --all-packages --locked && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest` |
| workspace manifests, catalog, or Syncpack policy | both of the above |
| documentation or ADRs | `bash scripts/validate-scaffold.sh` |
| anything substantial | `bash scripts/check.sh` |

## Traversing this repository safely

- **Indexes before content.** `docs/decisions/INDEX.md` and
  `docs/architecture/INDEX.md` are the navigation spine. Use them instead of
  globbing `docs/`.
- **READMEs are authoritative for their directory.** Read the directory README
  before adding a file to it — it says what does not belong there too.
- **Do not read every ADR.** Eleven ADRs is a lot of context. The index table
  tells you which apply.
- Prefer targeted search over broad reads. This repository is mostly prose;
  reading it all is expensive and unnecessary.

## Branch and commit expectations

- **Never commit to `main`.** Check `git branch --show-current` first. If you are
  on `main`, create a branch before your first commit.
- Branch: `<type>/<short-kebab-summary>`.
- Conventional Commits, scoped: `docs(architecture):`, `chore(uv):`,
  `feat(runner-control):`.
- Prefer one coherent commit, or a small logical sequence. Do not produce a
  commit per file.
- Open pull requests as **drafts** until validation passes, using
  [`.github/pull_request_template.md`](.github/pull_request_template.md).

## Do not, in this change

- **Do not create GitHub issues.** Issues and epics come from the human/ChatGPT
  planning workflow after ADR review. Not from you.
- **Do not deploy anything.** No `docker compose up`, no service start, no
  Tailscale, Keycloak, OpenFGA, or Traefik configuration, no VPS connection.
- **Do not access or request secrets.** No API keys, no tokens, no `.env`, no
  credential store. If a task appears to need one, stop and say so.
- **Do not install Home Assistant** or contact any Home Assistant instance.
- **Do not change any ADR's status — ever — without an explicit
  human-acceptance task.** Accepting an ADR is a human decision, made in its own
  reviewed change.
- **Do not edit an accepted ADR.** ADR-0001 … ADR-0018 are `Accepted` and
  **immutable**. Amend or reverse one only by writing a new ADR that supersedes
  it.
- **Do not resolve anything in**
  [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md).

## Reporting

Report what you actually did:

- The commands you ran, with their real output. Not what you expected.
- **Every check you skipped, and why.** If `pnpm` was unavailable, say
  "`pnpm -r run check` skipped: pnpm not installed" — do not omit the line. This
  is the single most important reporting rule here.
- Which ADRs and architecture documents govern the change.
- Anything you deliberately did not do, and why.

If a check failed, show the failure. A report that omits a failure is worse than
no report.

## Useful context

- **Host:** Raspberry Pi 5, Debian 13 ARM64. `node` and `pnpm` may only be
  available after sourcing nvm — see
  [`docs/operations/pi-bootstrap.md`](docs/operations/pi-bootstrap.md).
- **Languages:** TypeScript is primary, including under `services/`
  ([ADR-0012](docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)).
  Python is retained only for isolated inference workers.
- **Python:** managed by `uv`. Do not use `pip` or a system virtualenv.
- **Node:** managed by Corepack from the `packageManager` pin. Do not
  `npm install -g pnpm`.
- **The upstream repositories are pinned references.** Never modify them.
- **OpenSpec** (`/opsx:*` commands) is the planning workflow. Artifacts under
  `openspec/` are planning-only: implementation authority is always an
  external task contract (a GitHub issue or explicit user task), recorded —
  never created — in a change's `tasks.md`. See
  [`openspec/AGENTS.md`](openspec/AGENTS.md).
- **Knowledge:** Use `knowledge/INDEX.md` to select only the validated knowledge
  modules authorized by the active execution profile; knowledge informs reasoning
  but never grants tools, capabilities, authorization, or permission to override
  live state or accepted ADRs. The toolchain, its conformance suite, and
  repository content admission are implemented and run in CI,
  `blockedByToolchain` was discharged on 2026-08-16, and six `platform/**`
  modules are authored and `Validated` at `1.0.0`. No governed query
  interface exists at runtime and nothing is packaged or published, so
  `knowledge/` is **not runtime-authoritative**
  ([U7](docs/architecture/unresolved-decisions.md#u7) is RESOLVED — the format
  decision is Accepted; readiness was always a different fact). Authoring
  requires BOTH gates false: `blockedByRollout` still holds `household/**`,
  `runbooks/**`, and every set.
