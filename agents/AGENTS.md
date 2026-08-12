# AGENTS.md — `agents/`

Scoped rules for household agents and runtime adapters. Inherits everything from
[`../AGENTS.md`](../AGENTS.md).

## First, know which agent you mean

This directory is about **household agents** — product components that observe
and act on the house. You, the coding agent editing these files, are governed by
[`../AGENTS.md`](../AGENTS.md). Do not let the two blur in code or in prose.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md)
3. [`../docs/architecture/runner-model.md`](../docs/architecture/runner-model.md)
4. ADRs **0003, 0004, 0006, 0011**

## Rules

- **Nothing here grants authority.** Capability grants belong in
  [`../profiles/`](../profiles/), never in agent or adapter code. If you find
  yourself widening what an agent can do by editing this directory, stop.
- **No credentials.** Not in code, not in configuration, not in a default.
  Credentials come from the profile, scoped to the run.
- **No Home Assistant client** and **no database connection**, anywhere here.
- **An adapter must not reach around the substrate** for network, filesystem, or
  secrets. It receives what the profile granted.
- **Every adapter emits the same event and evidence contract.** A field that only
  makes sense for one runtime does not belong in the shared contract.
- **No provider or framework name in a structural position** in any shared
  contract. A provider name is an opaque value of an `adapter` field, and it
  appears in that adapter's own directory.
- **One runtime per derived image.** A multi-provider image is prohibited
  ([ADR-0011](../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
- **Agents propose; they do not decide.** Safety bounds come from
  [`../services/control-plane/`](../services/control-plane/), never from agent
  output or an agent prompt.
- **Autonomous runs have no `actor`, explicitly** — a declared value, never a
  missing field.

## Do not

- Implement an agent or an adapter without an authorizing issue or task
  contract. The adapter SPI is now decided —
  [ADR-0013](../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md) closed
  [U6](../docs/architecture/unresolved-decisions.md#u6) on 2026-08-12 — but run
  credentials are still
  [U2](../docs/architecture/unresolved-decisions.md#u2), and a decided SPI is
  still not an authorization to write code.
- Add a dependency, a framework, or a provider SDK.
- Write a stub that appears to work.
- Decide the workload-identity mechanism —
  [U2](../docs/architecture/unresolved-decisions.md#u2) — by writing code. (The
  adapter SPI was decided the only way an item here may be: by an ADR.
  Implement **against**
  [ADR-0013](../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md); do
  not re-decide it in an adapter.)

## Adding an adapter

1. It needs an accepted ADR or task contract.
2. Create the directory with a `README.md` stating which runtime it wraps, what
   the runtime needs, how it maps to the event and evidence contract, and what it
   cannot express.
3. Confirm the shared contract needs **no** change. If it does, that is an
   architecture change first — the SPI was not neutral.
4. Add the corresponding derived image to
   [`../deploy/images/`](../deploy/images/) — one runtime, pinned.
5. Add framework-conformance coverage.

## Validation

```sh
uv sync --all-packages && uv run ruff check . && uv run mypy && uv run pytest
bash scripts/validate-scaffold.sh
```
