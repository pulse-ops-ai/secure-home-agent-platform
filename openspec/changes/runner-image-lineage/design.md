# Design: runner-image-lineage

## Context

Issue #53 authorizes L5: three inert image artifacts, their lineage record,
and the structure that owns them. L4 landed decision-bearing orchestration
in `services/runner-control`; nothing launches; U4 is open; L9 owns future
enforcement. `deploy/AGENTS.md` permits authoring deployment assets and
prohibits a coding agent from running any — including `docker build` — so
this design must produce real image identities without local execution.

Two pieces of older prose are explicitly superseded by the current #53
text and must not be read as authority here:

- `deploy/images/README.md` (pre-L5) and `runner-model.md` § The base image
  describe the base as containing "profile loading, run lifecycle, event
  emission, evidence capture hooks". Those are **substrate-system**
  concerns. Their decision-bearing halves live in trusted
  `runner-control` (L4, landed) and the future L9 launcher — never inside
  the untrusted workload image. #53: "It must not duplicate, relocate, or
  reimplement runner-control decision-bearing responsibilities inside the
  untrusted workload image."
- The archived adoption artifacts sequence Copilot as the first derived
  vehicle and describe L5's prerequisite as "the base image ships what
  L3/L4 build". The current #19/#53/#55 program state supersedes the
  ordering (Claude reference first; Copilot at L7) and the reading (L4 is
  a sequencing prerequisite; its code does not enter the image).

## Goals

- Author the three image definitions with every external input pinned to
  an immutable identity.
- Make lineage a validated artifact (`image-lock.yaml` + checker), not
  prose.
- Establish the governed CI build path that produces and re-verifies real
  digests.
- Keep every image inert and every platform contract untouched.

## Non-Goals

Launching, publishing, enforcing, selecting a runtime, deciding U4,
activating a profile, adapters, the Copilot image, knowledge wiring.

## The trust split (load-bearing)

```text
trusted, outside every image             untrusted workload substrate
──────────────────────────────           ─────────────────────────────
services/runner-control (L4)             secure-home-runner-base
  authority acquisition                    minimal Debian surface
  profile authority decisions              non-root `runner` user
  policy interpretation                    tini as PID 1 (signal/reap
  gate membership + scheduling               bootstrap only)
  deterministic classification             /workspace     (workload cwd)
  lifecycle + finalization authority       /run/platform  (mount-point
  evidence sealing                           convention for event/evidence
packages/runner-core (L3)                    plumbing; empty in the image)
  the decision library                   secure-home-runner-claude
future L9 launcher                         base + node + git + one pinned
  physical enforcement                       Claude Code CLI
```

The base's only "hooks" are **filesystem conventions**: `/workspace` and
`/run/platform` exist, are owned by the workload user, and are documented
as the substrate's mount points. No code in the image reads a profile,
emits an event, or seals evidence; the substrate does that from outside
(L4 today via ports, L9 later physically). A convention cannot decide
anything, which is precisely why it is all the image may own.
Mechanically: the checker refuses any `COPY`/`ADD` from `services/**` or
`packages/**` into any image.

## Image contents

### secure-home-runner-base

`debian:trixie-slim` pinned by digest (Debian 13 — the Pi host's release),
plus exactly: `ca-certificates` (TLS trust is provider-neutral), `tini`
(PID 1: signal forwarding and zombie reaping for an arbitrary workload),
the non-root `runner` user (uid/gid 10001), and the two directory
conventions. Nothing else: every package the base carries is carried by
every derived workload image forever, so the default answer to "should the
base include X" is no. `git` is deliberately **not** in the base — the
household runner class will not need it; the coding runtime that needs it
installs it.

### secure-home-runner-claude

`FROM` the exact L5 base (by lock-recorded digest, wired at build time —
see § Digest chain mechanics), adding exactly what the one runtime
requires: `git` (repository operation is the runtime's function), Node.js
`24.18.1` (the runtime's engine; installed from the official
`nodejs.org` release archive, SHA-256 verified against the published
SHASUMS, matching the repository's own Node pin), and
`@anthropic-ai/claude-code@2.1.241` — the exact version resolved from
registry.npmjs.org on 2026-08-23, with its published `dist.integrity`
(`sha512-S7DWEmJJAsI5taAUjhKm6soXcFJYIVeTH6Lg9kmp3yntFllCP612hGwZ7thOGh8r
7YaRUH9+1jCX5A9QGazsxg==`) recorded in the lock and verified against the
downloaded tarball bytes before installation. The tarball is installed
directly (`npm install -g <verified tarball>`), so the registry's mutable
metadata is not on the trust path at build time. The package declares no
runtime `dependencies`, which the build refuses to assume: the Dockerfile
fails if installation resolves anything beyond the verified tarball.
No credential, no configuration, no second runtime.

### secure-home-gates-toolchain

Independent lineage: `FROM` the same pinned Debian digest directly — it
runs repository gates, not agents, and deriving it from `runner-base`
would put a non-runner into the ADR-0011 lineage. Contents are derived
from what the governed gates actually invoke
(`.github/workflows/checks.yml` + `scripts/check.sh`):

| Gate surface | Toolchain carried |
|---|---|
| `validate-scaffold.sh`, `scan-secrets.sh`, `check.sh` | bash, coreutils, grep/sed/awk (Debian base), `git` |
| `check-*.mjs`, pnpm workspace (lint/typecheck/test/build) | Node `24.18.1` (SHA-verified archive), pnpm `11.18.0` cached at build time via corepack (`COREPACK_HOME` baked, no first-use fetch) |
| uv workspace (ruff/mypy/pytest) | `uv 0.12.1` (SHA-256-verified release binary) + a uv-managed CPython `3.13` installed at build time |

The image carries **toolchains, never repository state or dependency
stores**: no repository checkout, no `node_modules`, no uv venv. The later
network-none gate posture (constitution INV-009, enforced at L9) works by
mounting the repository and warmed dependency stores read-only — the image
guarantees only that no *toolchain* is fetched at run time. That is
suitability, not enforcement, and the README says so in those words.

The exact CPython patch is the deterministic resolution of "3.13" by the
pinned uv 0.12.1 release (uv embeds its interpreter list); it is surfaced
in build evidence rather than hand-pinned, so the pin authority remains
one artifact (the uv version) instead of two that can disagree.

## OCI platform and digest model

**Two platforms are required, not assumed**: `linux/arm64` (the Pi 5 host)
and `linux/amd64` (the workstation/VPS class) — `runner-model.md` § Runner
classes places coding runners on "the Pi or a workstation", and the merge
gate itself documents the x86-64/ARM64 split. Both are declared for all
three images.

The identity vocabulary, fixed so "image digest" is never ambiguous:

| Term | Meaning | Where it lives |
|---|---|---|
| **index digest** | digest of the OCI image index covering both platforms | the lock's `digest` — the canonical locked identity; what a future profile pins (`runtime.image_digest`) |
| **platform manifest digest** | digest of one platform's image manifest | the lock's `manifests.<platform>` — the artifact a runtime on that platform actually consumes; what run evidence records at L9 |
| config digest / local image ID | internal/engine identifiers | never recorded, never a pin |

PROP-006/INV-015 through resolution: the lock records the index digest
**and** each platform manifest digest, so index → manifest resolution is
verifiable against the committed lock rather than trusted to a resolver.
A future consumer that pins the index and consumes a manifest can prove
the manifest belongs to the pinned index without re-fetching anything.
The evidence contract's single `image_digest` field needs no change: the
run records the consumed manifest digest, and the lock explains its
membership in the pinned index.

## Digest chain mechanics (no registry)

Nothing is published, so the derived build cannot `FROM
secure-home-runner-base@sha256:…` via a registry pull. Instead:

- `deploy/images/runner-claude/Dockerfile` begins
  `FROM secure-home-runner-base` — a logical name with no tag and no
  external resolution path, unresolvable by accident;
- `build.sh` resolves that name through buildx's named build-context
  mechanism to the OCI layout produced by the base build, **at the exact
  digest the lock records** (`oci-layout://…@sha256:<parent_digest>`);
- the checker enforces the other half: the derived Dockerfile's `FROM` is
  exactly the logical base name, the lock's `parent_digest` equals the
  base entry's `digest`, and every *external* `FROM` carries an inline
  `@sha256:` pin.

A stale `parent_digest` therefore fails twice: statically (chain equality
in the lock) and at build time (the layout lookup by digest finds no such
manifest).

## image-lock.yaml grammar

The lock is authored in a **strict canonical subset of YAML** and parsed
by the checker's own grammar — the same philosophy as the knowledge
release manifest: one grammar, no second reading. Admitted: two-space
indentation, `key: value` scalars, block lists of scalars or maps, `#`
comments, a fixed key order per entry. Refused: flow collections, anchors,
aliases, tags, multi-line scalars, tabs, duplicate keys. A general YAML
parser would admit representations the canonical form forbids; the checker
refuses them instead, so the committed bytes have exactly one meaning.

Entry shape (fixed order):

```yaml
version: 1
images:
  - name: secure-home-runner-base
    lineage: runner-base            # runner-base | runner-derived | gates-toolchain
    definition: deploy/images/runner-base/Dockerfile
    platforms:
      - linux/amd64
      - linux/arm64
    external_base:
      reference: docker.io/library/debian:trixie-slim
      digest: sha256:…              # the index digest of the external base
    digest: sha256:… | pending-first-governed-build
    manifests:
      - platform: linux/amd64
        digest: sha256:… | pending-first-governed-build
      - platform: linux/arm64
        digest: sha256:… | pending-first-governed-build
```

`runner-derived` entries add `parent` (a registered `runner-base`-class
name) and `parent_digest`, plus `runtime:` (`name`, `package`, `version`,
`integrity`) — provider identity as **values** under structurally neutral
keys (INV-002). `gates-toolchain` entries carry `external_base` and no
`parent`; the lineage class *is* the explicit independence record.

## The checker: scripts/check-images.mjs

Node standard library only (the scripts/ dependency rule). One executable
authority for: grammar + schema + canonical key order; the closed lineage
classes; bidirectional registration (every `deploy/images/*/Dockerfile`
registered, every entry's definition existing); digest forms; the
parent/base chain equality; external-FROM immutability; base and gates
neutrality (token list mirrored as data from the platform proof's
vocabulary: claude, copilot, codex, anthropic, openai, langgraph,
pydantic, docker, containerd, kata, runc, gvisor); exactly-one-runtime in
the derived definition with lock/Dockerfile version equality; no
`COPY`/`ADD` from `services/**`/`packages/**`; no credential-shaped
`ENV`/`ARG` names; `deploy/runtime/` README-only; no `profiles/**`
reference to any registered image name; no launcher/socket token in
`services/runner-control/src`. Wired as `pnpm run check:images`, a
`check.sh` row, and a step in the unconditional governance job.
`tests/test_image_lineage.py` exercises the real checker against fixture
trees — a planted violation per rule, plus the passing control.

## Build authority (the #53 boundary), and why CI is the mechanism

There is no existing build path: the repository has one workflow
(`checks.yml`, no Docker), no registry, no external builder, and
`deploy/AGENTS.md` prohibits local execution. #53 requires this change to
identify the governed mechanism or stop. The minimal mechanism that
produces real identities without violating any rule is a dedicated CI
workflow (`.github/workflows/images.yml`):

- **Triggers:** `pull_request` on `deploy/images/**` and the workflow
  itself, plus `workflow_dispatch`. It never runs on unrelated changes.
- **Builds** all three images for both platforms with buildx + QEMU
  (actions SHA-pinned, per the repository's CI rule), exporting **OCI
  layouts** — no registry, no push, no `docker run`, nothing deployed.
- **Verifies**: recomputed digests must equal the lock. While the lock
  carries the bootstrap sentinel, the job fails and prints the built
  digests as the evidence to record — bootstrap is loud, never complete.
- **Reproducibility evidence**: recording digests from run N and having
  run N+1 rebuild the unchanged definitions to the same digests on fresh
  runners *is* the rebuild-and-compare proof, at the exact PR head.

Authoring this workflow is authoring a deployment-adjacent asset under an
authorizing issue (#53 names CI files as permitted when proven
necessary); executing it is CI's act, not a coding agent running a
deployment asset locally. The no-run rule is not weakened: nothing in
this change may be executed by an agent on a developer host, and the
workflow starts no service, publishes no artifact, and launches no
container.

## Reproducibility: the exact claim

**Claim:** rebuilding an unchanged definition through the governed path
yields byte-identical manifests and therefore identical digests.
**Mechanism:** every input is frozen, every output normalized:

| Drift source | Frozen by |
|---|---|
| external `FROM` tag | inline `@sha256` index digest |
| apt package pool | `snapshot.debian.org/archive/debian/20260819T205155Z` as the only source |
| Node / uv archives | exact URLs + SHA-256 verification in the Dockerfile |
| provider CLI | exact version, tarball verified against recorded `sha512` integrity, installed from the verified bytes |
| transitive provider deps | the package declares none; the build fails if installation resolves anything else |
| pnpm fetch-on-first-use | corepack cache baked at build time at the repository's exact pnpm pin |
| layer timestamps | `SOURCE_DATE_EPOCH=0` + buildkit `rewrite-timestamp=true` on the OCI export |
| build attestations | provenance and SBOM generation disabled (both embed nondeterministic material) |
| nondeterministic file content | apt logs/caches, `ldconfig` aux-cache, npm caches removed; `/etc/shadow` day-counter normalized |
| host architecture | per-platform builds under QEMU; identity is the two-platform index |

**What is deliberately not claimed:** bit-reproducibility against a
*different* builder or a moved snapshot. The residual supply-chain inputs
are the availability of the pinned archives and the snapshot serving the
recorded bytes — every one integrity-checked at fetch, so substitution
fails the build rather than changing the digest silently.

## Inherited obligations — L5 interpretation

| Obligation | L5 interpretation | Mechanism here | Deferred remainder |
|---|---|---|---|
| INV-002 / PROP-004 | provider names never structural; images add them only as image names and lock **values** | checker neutrality rules over Dockerfiles and lock keys; the landed adapter-neutrality corpus proof re-runs unchanged | L7/L8 re-proof when adapters exist |
| INV-012 | no contract encodes a container runtime; no image name conflates workload with isolation runtime | zero contract changes; runtime-name tokens refused in image definitions; `deploy/runtime/` README-only | L9 records runtime identity as evidence data |
| INV-015 / PROP-006 | digest trust must survive to the consumer | lock chain equality + CI rebuild-and-compare at head; index→manifest membership recorded; mutation of any recorded digest is refused by rebuild comparison | the actual consumption verification at profile activation and L9 launch |
| ADR-0011 #2 | one-runtime-per-derived-image build check | exactly-one-runtime checker rule + adversarial tests | container-content scan at L9's launch boundary |
| ADR-0011 #5 | rebuild propagation | parent-digest chain equality makes an unpropagated base rebuild un-mergeable | scheduled rebuild cadence is operational, post-deployment |

## Alternatives considered

- **Publish to GHCR and `FROM` by registry digest.** Rejected: publication
  to a registry is not governed by any accepted decision, and #53 stops at
  exactly that boundary. The OCI-layout named-context mechanism gives the
  same digest discipline with no distribution.
- **A general YAML library for the lock.** Rejected: `scripts/` carries a
  no-third-party rule with one deliberate exception, and a full YAML
  grammar admits representations the canonical form must refuse. A strict
  subset parser is smaller than the exception it would need.
- **Distro Node in the Claude image.** Rejected: the runtime engine should
  be the same exact-versioned, checksum-verified artifact in both images
  that need Node; the snapshot's distro Node would add a second version
  authority.
- **Toolchain inside the base** / **gates derived from base**: both
  rejected by D7 (constitution) — the base stays minimal and
  provider-free; the gates image is not a runner.
- **`pip`/system Python in gates.** Rejected: the repository's Python is
  uv-managed by rule; the gates image mirrors the merge gate exactly
  (pinned uv, managed interpreter).
- **Stopping without a build path** (lock pinned as `pending` only).
  Kept as the honest fallback #53 prescribes — used only if the CI
  mechanism fails to produce identities.

## Failure classification boundaries

Checker findings and CI digest mismatches are change-attributable
refusals. Snapshot/mirror unavailability during a CI build is operational
failure — the build fails loudly; nothing reclassifies it as success or
silently retries onto different bytes.

## Compatibility and migration

Additive. No platform contract, schema, profile, or service changes. The
pre-L5 status prose in `deploy/README.md` / `deploy/images/README.md` is
rewritten to the landed truth; `runner-model.md`'s base-image bullet list
is *not* edited here (docs/ is outside #53's scope) — its
substrate-system reading is recorded above and flagged for a follow-up
docs change.

## Security implications

- No secret anywhere: definitions carry no credential, no token-shaped
  ENV/ARG (checker-refused), and the existing repository secret scan
  covers every authored file.
- Supply chain: every fetched byte is digest- or checksum-verified before
  use; a substituted artifact fails the build.
- The untrusted-workload boundary is strengthened structurally: nothing
  decision-bearing exists inside the image to subvert.
- Non-guarantee, stated: L5 proves identity and lineage. It enforces no
  isolation, no network posture, no resource ceiling — those claims
  remain false until L9 makes them true.

## Deferred behavior (named owners)

Copilot image + adapters (L7/#55) · conformance seed (L8/#56) ·
placement (U4/#9) · launcher, egress default-deny, ceilings, teardown,
runtime selection and `deploy/runtime/` content (L9/#57) ·
knowledge-runtime integration (#93) · registry/distribution and rebuild
cadence (post-U4 operational work) · `runner-model.md` base-image prose
refresh (follow-up docs change).
