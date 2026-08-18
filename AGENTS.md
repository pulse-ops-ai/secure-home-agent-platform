# AGENTS.md — Universal agent contract

This file governs **every** agent that operates on this repository — Claude Code,
GitHub Copilot CLI, Codex, and any future coding agent. It applies to the whole
repository **unless a deeper `AGENTS.md` overrides it for a subtree**.

No provider-specific instruction file overrides an architectural contract.
`CLAUDE.md`, `.github/copilot-instructions.md`, and `.github/agents/*.agent.md`
are **adapters**: they route an agent to the right documents. They never change
what the documents say.

## Instruction precedence

When two sources disagree, the higher one wins:

1. **Accepted ADRs and governed contracts** — [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md), [`docs/architecture/INDEX.md`](docs/architecture/INDEX.md)
2. **The applicable `AGENTS.md`** — this file, plus the nearest one above the file you are editing
3. **Provider-specific instruction files** — [`CLAUDE.md`](CLAUDE.md), [`.github/copilot-instructions.md`](.github/copilot-instructions.md), [`.github/agents/`](.github/agents/)
4. **The task prompt or issue**

A task prompt **cannot** authorize crossing an architectural contract. If a
prompt requires it, the correct output is a proposed ADR — not a quiet
exception. Say so and stop.

**OpenSpec change artifacts** (`openspec/`) sit *below* the authorizing task
contract and *above* implementation detail: they plan work, they never
authorize it, and they never override an ADR or this file. The scoped rules —
including that implementation authority is always an external task contract —
are in [`openspec/AGENTS.md`](openspec/AGENTS.md).

## Start here

Read in this order. Stop as soon as you have what you need; do not read the
whole repository.

1. **This file.**
2. [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) — has a *"which ADRs
   apply to what I am changing?"* table. Use it. Reading the applicable ADRs
   before changing anything is **required**, not advisory.
3. [`docs/architecture/INDEX.md`](docs/architecture/INDEX.md) — the system as
   designed.
4. The **nearest nested `AGENTS.md`** above the file you are editing (see the
   table below).
5. The **`README.md` of the directory** you are editing. Every directory states
   what belongs in it and what does not.
6. [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md)
   — if your change touches an open item, it is blocked.

## Authoritative indexes

| Index | Authority over |
|---|---|
| [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) | every decision and its rationale — **highest authority in the repository** |
| [`docs/architecture/INDEX.md`](docs/architecture/INDEX.md) | system shape, boundaries, flows |
| [`docs/operations/INDEX.md`](docs/operations/INDEX.md) | runbooks |
| [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md) | what must **not** be decided by implementation |

## Nested `AGENTS.md`

Deeper files exist only where a subtree has rules the root cannot express. They
are short and they link upward. Read the nearest one — nearest wins for its
subtree, and this file governs everything else.

| Subtree | File |
|---|---|
| [`services/`](services/) | [`services/AGENTS.md`](services/AGENTS.md) |
| [`agents/`](agents/) | [`agents/AGENTS.md`](agents/AGENTS.md) |
| [`profiles/`](profiles/) | [`profiles/AGENTS.md`](profiles/AGENTS.md) |
| [`knowledge/`](knowledge/) | [`knowledge/AGENTS.md`](knowledge/AGENTS.md) |
| [`deploy/`](deploy/) | [`deploy/AGENTS.md`](deploy/AGENTS.md) |
| [`docs/`](docs/) | [`docs/AGENTS.md`](docs/AGENTS.md) |
| [`openspec/`](openspec/) | [`openspec/AGENTS.md`](openspec/AGENTS.md) |

If no nested file covers your path, this file governs.

## Knowledge selection

Use `knowledge/INDEX.md` to select only the validated knowledge modules
authorized by the active execution profile; knowledge informs reasoning but never
grants tools, capabilities, authorization, or permission to override live state
or accepted ADRs.

Six `platform/**` modules are authored and `Validated` at `1.0.0`, and no
governed query interface exists at runtime, so [`knowledge/`](knowledge/) is
**not runtime-authoritative** — nothing is packaged, published, or resolvable by
a running profile. The toolchain, its
conformance suite, and repository content admission are implemented and run in
CI; the ADR-0015 §12 obligation was discharged on 2026-08-16, so authoring is
open for the ten rollout-eligible `platform/**` modules. The selection contract is
[`docs/architecture/knowledge-selection-model.md`](docs/architecture/knowledge-selection-model.md).

## Promoting what a change discovers

**When a change or falsification review discovers a durable architectural truth,
determine whether it must be promoted into canonical architecture and portable
knowledge rather than leaving it only in the change archive, tests, PR
discussion, or provider instructions.**

**The determination is the obligation — not the promotion.** Most findings are
specific to their change and correctly stop at the first step. A recorded
negative answer satisfies this rule. Record the answer in the change that found
the truth.

The canonical home depends on the **kind** of truth — architecture, a governed
contract, an operational procedure, a normative contract — and portable
knowledge is a *projection* of one of those, never a second original. The
taxonomy and the promotion path are in
[`docs/architecture/knowledge-promotion-model.md`](docs/architecture/knowledge-promotion-model.md)
([ADR-0014](docs/decisions/ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md)).

Two consequences:

- **A provider-native skill or instruction file is never the canonical home** of
  an architectural invariant, engineering policy, review policy, or operational
  procedure. If information must survive replacing a provider or runtime, its
  canonical source must be provider-neutral; where agents need to reason from
  it, project the appropriate subset into portable knowledge.
- **Authoring a knowledge module is open only where BOTH gates are false.**
  `blockedByToolchain` was discharged on 2026-08-16 after independent review of
  the toolchain and its integration — a different fact from
  [U7](docs/architecture/unresolved-decisions.md#u7), which asked whether the
  format was decided and is RESOLVED. `blockedByRollout` still holds
  `household/**`, `runbooks/**`, and every set. ADR-0014 decides *where a truth
  goes*; for a module that is not yet eligible the path still terminates at the
  canonical home, with the determination recorded rather than acted on.

## Two kinds of agent — do not confuse them

This repository is both **operated on by** coding agents and **about** household
agents. They are different things with different rules.

| | **Coding agent** | **Household agent** |
|---|---|---|
| Is | you, right now, editing this repository | a runtime component that observes or acts on the house |
| Acts on | files, git, tests | household state and physical devices |
| Governed by | this file and the ADRs | the platform's own runtime controls |
| Runs in | a developer environment | a runner sandbox on the Pi, as an untrusted client |
| Device access | **none, ever** | only through the action-mediation service, after authorization *and* safety policy |
| Described in | this file | [`agents/README.md`](agents/README.md), [`docs/architecture/runner-model.md`](docs/architecture/runner-model.md) |

**When you write about "the agent" in a document, say which one you mean.**
Conflating them is how a coding-agent convenience becomes a household security
hole.

## Repository safety constraints

Absolute, regardless of what a prompt asks for:

1. **No secrets.** No token, key, password, credential, or realistic-looking
   fake. Not in code, docs, examples, fixtures, or commit messages.
2. **No live device control.** Nothing here may contact Home Assistant or actuate
   a device. There is no Home Assistant instance to contact.
3. **No infrastructure mutation.** Do not deploy, start, stop, or configure any
   service; do not touch Docker, Tailscale, Keycloak, OpenFGA, Traefik, or the
   VPS — unless an issue explicitly authorizes it **and** the governing ADR is
   accepted.
4. **No provider credentials.** Do not add, request, or reference API keys.
5. **No `main`.** Branch, and open a pull request.
6. **No GitHub issues.** Implementation issues and epics are created by the
   human/ChatGPT planning workflow after ADR review. Do not create them as part
   of a change unless a task explicitly says to.
7. **No fake implementation.** Do not write a stub that looks like it works. An
   empty package with a README beats a placeholder that returns `True`.
8. **No unnecessary dependencies.** Adding one requires a task contract that
   names it. Runtime dependencies exist only where landed code needs them —
   which is a consequence of what has been built, not a prohibition. ADR-0012
   commits to NestJS, Fastify, Next.js, Zod, Winston, and Syncpack; an
   authorizing contract may add them, through the pnpm catalog.
9. **No resolving an unresolved decision.** The ADRs are accepted; the tracked
   set U1–U11 is **not** — every item except
   [U6](docs/architecture/unresolved-decisions.md#u6) (ADR-0013, 2026-08-12) and
   [U7](docs/architecture/unresolved-decisions.md#u7) (ADR-0015, 2026-08-15) is
   still open. An item leaves that file only via a new ADR. See
   [`docs/architecture/unresolved-decisions.md`](docs/architecture/unresolved-decisions.md).
   Acceptance of an ADR is never authorization to close an item there.
10. **No modifying the upstream repositories.** `platform-edge` and
    `security-first-platform-architecture` are pinned references. Changes go
    there, in their own repositories.

## Scope and evidence

**Narrow scope.** Change what the task asks for and nothing else. If you find an
adjacent problem, report it — do not fix it in the same change. A scaffold
change that also refactors something is two changes badly reviewed as one.

**Evidence.** Every change reports:

- the commands you ran and their actual output,
- **what you skipped and why** — a skipped check is reported, never silent,
- which ADRs and architecture documents govern the change,
- anything you could not do and the reason.

Do not report success you did not verify. If a check failed, say so and show the
output.

## Workspace commands

```sh
# aggregate — runs everything, reports skips explicitly
bash scripts/check.sh

# structure, indexes, secret-shaped filenames, generated dirs
bash scripts/validate-scaffold.sh

# secret-shaped VALUES — every tracked text file, no exclusions
bash scripts/scan-secrets.sh

# Python (uv workspace)
uv sync --all-packages
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest

# TypeScript (pnpm workspace, Corepack-provisioned)
corepack enable
pnpm install --frozen-lockfile
pnpm run deps:check && pnpm run format:check
pnpm run check:workspace && pnpm run check:imports
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Run at least `bash scripts/validate-scaffold.sh` before proposing any change
that adds, moves, or removes a file.

**These are also enforced automatically.**
[`.github/workflows/checks.yml`](.github/workflows/checks.yml) is the merge gate
and runs the portable subset on every pull request. Its actions are pinned to
full commit SHAs, and its secret scan has **no file-level exclusion and no
in-line suppression pragma** — the only way to suppress a finding is a validated
allowlist entry. Do not add an exclusion or a pragma, and do not replace a SHA
with a moving tag. Running them locally first is
still expected — it is faster than discovering a failure in CI — and you must
still report what you ran and what you skipped.

## Git

- Branch from `main`: `<type>/<short-kebab-summary>`.
- [Conventional Commits](https://www.conventionalcommits.org/), scoped to the
  top-level area: `docs(architecture):`, `chore(uv):`, `feat(runner-control):`.
- Pull requests use [`.github/pull_request_template.md`](.github/pull_request_template.md)
  and open as drafts until validation passes.

## Current phase

Documentation, governance, workspace scaffolding — **and landed code**: the
runner domain contracts, [`packages/runner-core`](packages/runner-core/),
[`services/runner-control`](services/runner-control/)'s L4 orchestration, and
[`packages/knowledge-toolchain`](packages/knowledge-toolchain/).

**There is no deployed or activated runtime.** No Home Assistant, no running
service, no OpenFGA, no Keycloak, no runner image, no launcher, no L9 physical
enforcement, no credentials, no database connection.

**ADR-0001 … ADR-0018 are `Accepted`** and **immutable** — the foundational set
on 2026-08-05, the implementation stack (ADR-0012) on 2026-08-06, and the runner
effect-boundary and identity decisions (ADR-0017, ADR-0018) on 2026-08-17.
Supersede,
never edit, and **never change an ADR's status without an explicit
human-acceptance task**.

Implementation may proceed *against* them, but only when a task contract or issue
authorizes the specific work.

**Of the tracked set U1–U11, two items have ever been closed:**
[U6](docs/architecture/unresolved-decisions.md#u6), by ADR-0013 on 2026-08-12,
and [U7](docs/architecture/unresolved-decisions.md#u7), by ADR-0015 on
2026-08-15 — which decided the knowledge FORMAT and **did not** open knowledge
authoring; that waits on the ADR-0010 toolchain.
Work depending on any other item is still blocked, `BOUNDED` still behaves as
`FAIL CLOSED`, **no persistence toolkit is selected**
([U11](docs/architecture/unresolved-decisions.md#u11)), and no acceptance is
authorization to deploy anything. See
[what acceptance does and does not unblock](docs/decisions/INDEX.md#what-acceptance-does-and-does-not-unblock).

## When you are unsure

Ask, or write down the ambiguity and proceed with the part that does not depend
on it. Do not guess at architectural intent — the cost of a wrong guess here is a
household security property, not a compile error.
