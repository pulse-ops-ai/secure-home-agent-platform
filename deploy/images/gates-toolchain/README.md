# deploy/images/gates-toolchain/

`secure-home-gates-toolchain` — the governed **gate toolchain image**,
deliberately **outside** the ADR-0011 runner lineage: it runs repository
gates, not agents, so it does not derive from `secure-home-runner-base`
and its lock entry carries the explicit independent lineage class.

## What this image carries

Exactly the toolchain surface the governed gates invoke
(`.github/workflows/checks.yml` and `scripts/check.sh`) — inventoried, not
guessed:

| Gate surface | Carried |
|---|---|
| shell gates (scaffold validation, secret scan, aggregate check) | bash, coreutils, `git` |
| Node-side gates (`check-*.mjs`, pnpm lint/typecheck/test/build) | Node `24.18.1` (SHA-256-verified), pnpm `11.18.0` cached at build time via corepack |
| Python gates (ruff, mypy, pytest) | `uv 0.12.1` (SHA-256-verified) + its managed CPython 3.13 (the exact patch is uv's deterministic resolution, surfaced in the build log) |

## Network posture, stated exactly

Every toolchain above is **resident in the image**, so gate execution
needs no run-time toolchain fetch. That makes the image *suitable* for the
later network-isolated gate posture the runner constitution requires
(gates execute network-none — INV-009). **No network enforcement exists
today**: that is L9's flip, and nothing here claims it. Repository
checkouts and warmed dependency stores (pnpm store, uv cache) arrive as
read-only mounts at execution time — the image carries toolchains, never
repository state, so it needs no rebuild when the repository changes.

## What it deliberately does not contain

- **No provider agent runtime** and no framework runtime — refused
  mechanically by the lineage checker.
- **No credential** of any kind.
- No repository checkout, no dependency store, no OpenSpec CLI (gates do
  not invoke it), nothing speculative.

## Failure mode and verification

Inert; nothing executes it. A defective toolchain image fails gates
loudly when it is eventually used — it can never make a gate pass that
should fail, because gate *semantics* live in the repository scripts, not
here. Validation: `scripts/check-images.mjs` +
`.github/workflows/images.yml` rebuild-and-compare against
[`../image-lock.yaml`](../image-lock.yaml).

## Resource limits

A gate execution is bounded by the substrate that launches it (L9); the
image declares none, for the same reason as the base.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
ADR-0011 (the lineage rule it sits outside of, on purpose) · the
runner-adoption constitution (gate execution posture) · issue #53 (L5)
