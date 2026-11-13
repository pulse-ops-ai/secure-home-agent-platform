# deploy/images/gates-toolchain/

`secure-home-gates-toolchain` — the governed **gate toolchain image**,
deliberately **outside** the ADR-0011 runner lineage: it runs repository
gates, not agents, so it does not derive from `secure-home-runner-base`
and its lock entry carries the explicit independent lineage class.

## What this image carries

The inventory is **canonical and machine-readable** —
[`toolchain.json`](toolchain.json) — and `scripts/check-images.mjs`
enforces it against the Dockerfile in both directions (every manifested
tool declared; every version pin manifested), mirroring versioned pins
against the sources that run the gate. Adding a tool to the governed gate
environment is a reviewed edit to that manifest, never an inference.

Exactly the toolchain surface the governed gates invoke
(`.github/workflows/checks.yml` and `scripts/check.sh`) — inventoried, not
guessed:

| Gate surface | Carried |
|---|---|
| shell gates (scaffold validation, secret scan, aggregate check) | bash, coreutils, `git` |
| Node-side gates (`check-*.mjs`, pnpm lint/typecheck/test/build) | Node `24.18.1` and pnpm `11.18.0`, installed from SHA-256-pinned release artifacts |
| Python gates (ruff, mypy, pytest) | `uv 0.12.1` and CPython `3.13.15`, installed from SHA-256-pinned release artifacts |

## Frozen package retrieval

[`debian.sources`](debian.sources) selects the Debian and Debian Security
archives at `20260827T000000Z`, the existing closure's resolution date. All
39 package hashes and sizes per architecture remain those reviewed in
[`../debian-closure.lock.json`](../debian-closure.lock.json). The snapshot keeps
their versions addressable after the live mirror removes them.

APT still verifies signed archive metadata with Debian's archive keyring.
Only `Check-Valid-Until` is disabled for these two historical sources; signature
verification and the independent artifact count, size and SHA-256 checks remain
mandatory. HTTP allows bootstrap before the pinned CA package is installed;
neither unsigned metadata nor an unreviewed package is accepted. There is no
fallback to the live archive. An unavailable snapshot fails the build.

Both context-copy instructions set mode `0644` explicitly. The image must not
inherit a developer's checkout umask: identical source bytes checked out as
`0664` locally or `0644` in CI must produce identical layers.

This repairs retrieval of existing reviewed artifacts; it does not select a
new package closure or change runner-image definitions. The finding belongs
to this image's build documentation; no new platform architecture or portable
knowledge rule is introduced.

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
