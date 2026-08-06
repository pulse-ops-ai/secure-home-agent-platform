# Summary

<!-- What does this change do, and why? Two or three sentences. -->

## Objective

<!-- The problem being solved, or the task contract / issue this implements. -->

## Areas changed

<!-- Directories and files, grouped. Say why each was necessary. -->

## Governing decisions

<!--
Which ADRs and architecture documents govern this change?
See docs/decisions/INDEX.md → "which ADRs apply to what I am changing?"
-->

- ADRs:
- Architecture documents:

## Non-goals

<!-- What this change deliberately does NOT do. Be explicit. -->

## Validation

<!--
Commands actually run, with real results.
A skipped check MUST be listed with the reason. Never omit it.
-->

| Command | Result |
|---|---|
| `git status --short` | |
| `bash scripts/validate-scaffold.sh` | |
| `uv sync --all-packages` | |
| `uv run ruff check .` | |
| `uv run ruff format --check .` | |
| `uv run mypy` | |
| `uv run pytest` | |
| `pnpm install --lockfile-only` | |
| `pnpm -r --if-present run check` | |
| `bash scripts/scan-secrets.sh` | |
| `.github/workflows/checks.yml` (merge gate) | |

**Skipped checks and why:**

<!-- e.g. "pnpm -r run check — skipped: pnpm unavailable on this host." -->

## Security and availability review

Check every line. Explain any that is not "no".

- [ ] Does this change any **trust boundary**? (`docs/architecture/trust-boundaries.md`)
- [ ] Does it change **identity, delegation, or authorization**? (ADR-0004, ADR-0008)
- [ ] Does it change **deterministic safety policy** or device actuation? (ADR-0005)
- [ ] Does it change **approval binding** — what is bound into the authorization artifact, or how the gateway verifies it? (ADR-0008 §3)
- [ ] Does it change **physical action semantics** — the lifecycle, idempotency, terminal states, or reconciliation? (`services/control-plane/README.md`)
- [ ] Does it change **degraded-mode or fail-closed** behaviour, including the requester axis of the classification? (ADR-0009)
- [ ] Does it change what the **agent runner sandbox** may reach? (ADR-0003)
- [ ] Does it introduce a **provider or framework name** in a structural position? (ADR-0003, ADR-0011)
- [ ] Does it add a **dependency**?
- [ ] Does it change the **merge gate** — a moving action tag instead of a SHA, or a file-level exclusion in the secret scan? (both are prohibited)
- [ ] Does it change the **local vs. remote path equivalence**? (`docs/architecture/local-remote-routing.md`)

## Unresolved decisions

<!--
Does this touch anything in docs/architecture/unresolved-decisions.md?
If yes, it is blocked — an unresolved item is closed by an ADR, not by code.
-->

- [ ] This change resolves nothing listed in `docs/architecture/unresolved-decisions.md`. (The foundational ADRs being accepted did **not** close any of them.)

## Compliance

- [ ] Branched from `main`; **no commits to `main`**
- [ ] Conventional Commits
- [ ] **No secrets, tokens, keys, or realistic-looking fakes**
- [ ] **No infrastructure deployed, started, stopped, or configured**
- [ ] **No GitHub issues created**
- [ ] **No ADR self-accepted**, and **no accepted ADR edited** (supersede instead)
- [ ] Relevant `INDEX.md` updated for any added, renamed, or removed document
- [ ] Every directory added has a `README.md` explaining what belongs there
- [ ] Upstream pinned repositories not modified

## Notes for the reviewer

<!-- Anything you are unsure about, deliberately deferred, or want scrutinized. -->
